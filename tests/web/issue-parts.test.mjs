import assert from "node:assert/strict";
import test from "node:test";
import { DirtyBuffer, buildIssueBody, buildIssueParts, serialiseDiff, suggestTitle,
  MAX_ISSUE_BODY_LENGTH } from "../../docs/diff.js";

const ctx = { enums: {} };
const lines = (body) => body.split("\n").filter((line) => line.startsWith('{"v":'));

test("small contributions retain their complete single-issue body", () => {
  const buffer = new DirtyBuffer();
  buffer.setName("zones", 42, "en", "New name", "Old name");
  const parts = buildIssueParts(buffer, [], ctx);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].body, buildIssueBody(buffer, suggestTitle(buffer), [], ctx));
  assert.equal(parts[0].title, suggestTitle(buffer));
});

test("parts include all body overhead, put enums first and keep each ID together", () => {
  const buffer = new DirtyBuffer();
  for (let id = 1; id <= 12; id++) {
    const before = { id, source: { type: "rumour" }, notes: "old" };
    buffer.update(`move:${id}`, before, { ...before, source: { type: "drop" }, notes: "x".repeat(9000) }, "rumour");
    buffer.references.set(`move:${id}`, { url: `https://example.com/${id}` });
  }
  for (let id = 1; id <= 12; id++) {
    buffer.setName("zones", id, "en", "Château 🪑 ".repeat(500), "Before");
    buffer.add(`extra:${id}`, { id, source: { type: "vendor" } }, "vendor");
  }
  for (let i = 0; i < 4; i++) buffer.addEnum(`enum:${i}`, "vendors", `VENDOR_${i}`, { name: "e".repeat(20000) });
  const original = serialiseDiff(buffer).split("\n");
  const parts = buildIssueParts(buffer, [], ctx);
  assert.ok(parts.length > 3);
  assert.deepEqual(parts.flatMap((p) => lines(p.body)).sort(), original.slice().sort());
  assert.equal(serialiseDiff(buffer), original.join("\n"));
  let recordsStarted = false;
  const owners = new Map();
  for (const [i, part] of parts.entries()) {
    assert.ok(part.body.length <= MAX_ISSUE_BODY_LENGTH);
    assert.match(part.title, new RegExp(`Part ${i + 1} of ${parts.length}`));
    assert.ok(part.body.includes(part.title));
    assert.match(part.body, /finish each issue in order \(first part 1, then 2/);
    assert.equal((part.body.match(/diff-begin/g) || []).length, 1);
    assert.equal((part.body.match(/diff-end/g) || []).length, 1);
    assert.ok(part.body.includes("## What changed"));
    for (const line of lines(part.body).map(JSON.parse)) {
      if (line.op === "add-enum") assert.equal(recordsStarted, false);
      else {
        recordsStarted = true;
        const owner = line.op === "name" ? `${line.kind}:${line.id}` : line.id;
        if (owners.has(owner)) assert.equal(owners.get(owner), i);
        owners.set(owner, i);
      }
    }
  }
  assert.deepEqual(buildIssueParts(buffer, [], ctx).map((p) => p.body), parts.map((p) => p.body));
});

test("blueprint-only records group by blueprint, and names keep their own id space", () => {
  const buffer = new DirtyBuffer();
  for (let blueprint = 1; blueprint <= 3; blueprint++) {
    buffer.add(`recipe:${blueprint}`, { blueprint, source: { type: "recipe" }, notes: "x".repeat(35000) }, "recipe");
    buffer.add(`recipe:${blueprint}b`, { blueprint, source: { type: "recipe" }, notes: "y" }, "recipe");
  }
  buffer.setName("quests", 1, "en", "q".repeat(35000), null);
  const parts = buildIssueParts(buffer);
  assert.equal(parts.length, 4);
  for (const part of parts.slice(0, 3)) {
    const found = lines(part.body).map(JSON.parse);
    assert.deepEqual(found.map((l) => l.op), ["add", "add"]);
    assert.equal(found[0].blueprint, found[1].blueprint);
  }
  assert.deepEqual(lines(parts[3].body).map((l) => JSON.parse(l).op), ["name"]);
});

test("the complete body can exactly fill the budget, but indivisible oversized groups fail", () => {
  const buffer = new DirtyBuffer();
  buffer.setName("zones", 7, "en", "x", null);
  const overhead = buildIssueParts(buffer)[0].body.length - 1;
  buffer.setName("zones", 7, "en", "x".repeat(MAX_ISSUE_BODY_LENGTH - overhead), null);
  assert.equal(buildIssueParts(buffer)[0].body.length, MAX_ISSUE_BODY_LENGTH);
  buffer.setName("zones", 7, "en", "x".repeat(MAX_ISSUE_BODY_LENGTH - overhead + 1), null);
  assert.throws(() => buildIssueParts(buffer), /zones name 7.*cannot be split/);
  buffer.clear();
  buffer.addEnum("enum:large", "vendors", "LARGE", { name: "x".repeat(MAX_ISSUE_BODY_LENGTH) });
  assert.throws(() => buildIssueParts(buffer), /Enum vendors.LARGE.*cannot be split/);
});
