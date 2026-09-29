import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DirtyBuffer, serialiseDiff, buildIssueBody } from "../../docs/diff.js";
import { readDiff, planDiff, applySteps } from "../../docs/diff-import.js";
import { canonicalSource } from "../../docs/validate.js";

const DATA = new URL("../../docs/data/", import.meta.url);
const enums = JSON.parse(fs.readFileSync(new URL("enums.json", DATA)));

function loadRecords() {
  const records = [];
  for (const kind of enums.source_types) {
    fs.readFileSync(new URL(`${kind}.jsonl`, DATA), "utf8").split("\n").filter(Boolean)
      .forEach((line, i) => records.push({ ...JSON.parse(line), _category: kind, _key: `${kind}#${i}` }));
  }
  return records;
}

function strip(record) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith("_")));
}

function freshState() {
  const records = loadRecords();
  return { records, index: new Map(records.map((r) => [r._key, r])), buffer: new DirtyBuffer(),
    enums: structuredClone(enums), names: { addOverride() {} } };
}

const ctxOf = (state) => ({ records: state.records, enums: state.enums, namesLocale: "en", publishedName: () => null });
const refs = { addDiscovery() {} };
const line = (obj) => JSON.stringify({ v: 1, ...obj });
// The consumer reads parsed JSON, so key order within a line carries no meaning.
const parsed = (lines) => lines.map((l) => canonicalSource(JSON.parse(l))).sort();

// A realistic submission: an edit, a delete, a source-type move, an add, a vocabulary value and a name.
function submission() {
  const state = freshState();
  const find = (kind, pred) => state.records.find((r) => r._category === kind && pred(r));
  const lux = find("luxury", (r) => r.id === 184200);
  state.buffer.update(lux._key, strip(lux), { ...strip(lux), availability: { ...lux.availability, last_seen: "2026-09-18" } }, "luxury");
  const gone = find("rumour", () => true);
  state.buffer.delete(gone._key, strip(gone), "rumour");
  const moved = find("drop", () => true);
  state.buffer.update(moved._key, strip(moved), { ...strip(moved), source: { type: "rumour" }, cost: [] }, "drop");
  state.buffer.add("vendor#new-t", { id: 9999901, source: { type: "vendor", vendor: "NEW_TEST_VENDOR", subtype: "other" },
    cost: [], availability: { version: "HOMESTEAD" } }, "vendor");
  state.buffer.addEnum("enum#vendors:NEW_TEST_VENDOR", "vendors", "NEW_TEST_VENDOR", { si: "SI_NEW_TEST_VENDOR", name: "A vendor" });
  state.buffer.setName("houses", 99999, "en", "Test house", null);
  return buildIssueBody(state.buffer, "Some summary {not json}");
}

test("a dump, a discovery line or a record is never read as a diff", () => {
  assert.equal(readDiff("\t[9900001] = {\t\t-- Item\n\t\titemPrice = 1,\n\t},"), null);
  assert.equal(readDiff(JSON.stringify({ format: "furniture-discovery-v1", record: { id: 1 } })), null);
  assert.equal(readDiff(JSON.stringify({ id: 1, source: { type: "drop" }, cost: [], availability: { version: "NONE" } })), null);
  assert.equal(readDiff(""), null);
});

test("mixed or malformed diff input fails instead of being guessed", () => {
  const diff = line({ op: "delete", id: 1, category: "drop" });
  assert.throws(() => readDiff(`${diff}\n{"id": 2, "source": {"type": "drop"}}`), /mixed/);
  const body = submission();
  assert.throws(() => readDiff(body + "\n" + body), /exactly one/);
  assert.throws(() => readDiff(body.replace('"op":"delete"', '"xx":"delete"')), /not diff lines/);
});

test("a selection that cuts a line is refused, and one without markers is not called complete", () => {
  const body = submission();
  const lines = body.split("\n");
  const inner = lines.filter((l) => l.startsWith("{"));
  assert.throws(() => readDiff(inner.join("\n").slice(0, -5)), /not complete JSON/);
  assert.throws(() => readDiff(body.replace(inner[1], inner[1].slice(10))), /not complete JSON/);
  assert.equal(readDiff(inner.slice(1).join("\n")).complete, false);
});

test("a whole issue body replays into the same diff", () => {
  const body = submission();
  const { lines, complete } = readDiff(body);
  assert.equal(complete, true);
  const expected = body.slice(body.indexOf("```\n") + 4, body.lastIndexOf("\n```")).split("\n");
  const state = freshState();
  const { steps, errors } = planDiff(lines, ctxOf(state));
  assert.deepEqual(errors, []);
  applySteps(steps, state, refs);
  assert.deepEqual(parsed(serialiseDiff(state.buffer).split("\n")), parsed(expected));
  assert.equal(state.records.find((r) => r.id === 184200 && r._category === "luxury").availability.last_seen, "2026-09-18");
});

test("bare diff lines work without the issue markers", () => {
  const state = freshState();
  const lux = state.records.find((r) => r._category === "luxury" && r.id === 184200);
  const text = line({ op: "update", id: 184200, category: "luxury", match: lux.source, fields: { notes: "checked" } });
  const { steps, errors } = planDiff(readDiff(text).lines, ctxOf(state));
  assert.deepEqual(errors, []);
  assert.equal(steps.length, 1);
});

test("nothing is planned when any line fails", () => {
  const state = freshState();
  const lux = state.records.find((r) => r._category === "luxury" && r.id === 184200);
  const other = state.records.find((r) => r._category === "luxury" && r.id !== 184200);
  const good = line({ op: "update", id: other.id, category: "luxury", match: other.source, fields: { notes: "x" } });
  const cases = {
    "found 0": line({ op: "delete", id: 999999999, category: "luxury" }),
    "already in luxury": line({ op: "add", id: 184200, category: "luxury", record: strip(lux) }),
    "not the site's": line({ op: "name", kind: "houses", id: 1, locale: "de", name: "Haus" }),
    "delete plus an add": line({ op: "update", id: 184200, category: "luxury", fields: { source: { type: "drop" } } }),
    "unsupported diff version": JSON.stringify({ v: 2, op: "delete", id: 1, category: "luxury" }),
    "changeable keys": line({ op: "update", id: 184200, category: "luxury", fields: { id: 5 } }),
  };
  for (const [message, bad] of Object.entries(cases)) {
    const { steps, errors } = planDiff(readDiff(`${good}\n${bad}`).lines, ctxOf(state));
    assert.deepEqual(steps, [], message);
    assert.match(errors.join(" "), new RegExp(message), message);
  }
});

test("an ambiguous target needs its match", () => {
  const state = freshState();
  const lux = state.records.find((r) => r._category === "luxury" && r.id === 184200);
  state.records.push({ ...structuredClone(lux), source: { ...lux.source, note: "another" }, _key: "luxury#copy" });
  const unmatched = line({ op: "update", id: 184200, category: "luxury", fields: { notes: "x" } });
  assert.match(planDiff(readDiff(unmatched).lines, ctxOf(state)).errors.join(), /found 2/);
  const matched = line({ op: "update", id: 184200, category: "luxury", match: lux.source, fields: { notes: "x" } });
  assert.deepEqual(planDiff(readDiff(matched).lines, ctxOf(state)).errors, []);
});

test("planning leaves the catalogue untouched", () => {
  const state = freshState();
  const before = JSON.stringify(state.records);
  planDiff(readDiff(submission()).lines, ctxOf(state));
  assert.equal(JSON.stringify(state.records), before);
  assert.equal(state.buffer.size(), 0);
  assert.deepEqual(state.enums, enums);
});
