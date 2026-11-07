import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLists, formatList, importLists, reportText, getLists, findList, createList, renameList, cleanName,
} from "../../docs/lists.js";

test("the add-on's export line parses, with a colon in the name and an empty list", () => {
  const { lists, skipped } = parseLists(
    "FURC LIST: Hall: west wing: 118303,115647, 118303\r\nFURC LIST: Empty: \n\nnot a list line\nFURC LIST 2: Later: 1");
  assert.deepEqual(lists, [{ name: "Hall: west wing", ids: [118303, 115647] }, { name: "Empty", ids: [] }]);
  assert.equal(skipped, 2, "a stray line and an unknown version are skipped, not guessed");
});

test("the brace shape is read, never written", () => {
  const { lists } = parseLists('"Say \\"hi\\"": {1, 2, 3},');
  assert.deepEqual(lists, [{ name: 'Say "hi"', ids: [1, 2, 3] }]);
  assert.equal(formatList(lists[0]), 'FURC LIST: Say "hi": 1,2,3');
});

test("export, wipe and import gives the same name and order back", () => {
  const made = createList("Round trip").list;
  made.ids.push(30, 10, 20);
  const text = formatList(made);
  getLists().length = 0;
  const r = importLists(text);
  assert.equal(r.created, 1);
  assert.deepEqual(findList("round trip").ids, [30, 10, 20]);
});

test("import merges into a same-named list, like the add-on", () => {
  getLists().length = 0;
  createList("Merge").list.ids.push(5);
  const r = importLists("FURC LIST: merge: 6,5");
  assert.deepEqual([r.created, r.merged, r.added], [0, 1, 1]);
  assert.deepEqual(findList("Merge").ids, [5, 6]);
});

test("names: trimmed, unique ignoring case, at most 32 bytes as the add-on counts them", () => {
  getLists().length = 0;
  const a = createList("  Kitchen \n").list;
  assert.equal(a.name, "Kitchen");
  assert.ok(createList("KITCHEN").error);
  assert.equal(renameList(a, "kitchen").list.name, "kitchen", "a list may change its own case");
  assert.equal(new TextEncoder().encode(cleanName("ä".repeat(40)).name).length, 32);
  assert.ok(cleanName("   ").error);
});

test("an over-long imported name merges into the list it truncates to, like the add-on", () => {
  getLists().length = 0;
  createList("A".repeat(32)).list.ids.push(1);
  const r = importLists(`FURC LIST: ${"A".repeat(40)}: 2`);
  assert.deepEqual([r.created, r.merged, r.errors.length], [0, 1, 0]);
  assert.deepEqual(findList("A".repeat(32)).ids, [1, 2]);
});

test("the import report is one short line, and a warning when something was left out", () => {
  getLists().length = 0;
  assert.deepEqual(reportText(importLists("FURC LIST: One: 1,2\nnonsense")), { text: "Imported 1 new list, 2 items, 1 line skipped", warn: true });
  assert.deepEqual(reportText(importLists("FURC LIST: one: 3")), { text: "Imported 1 merged, 1 item", warn: false });
  assert.deepEqual(reportText(importLists("hello")), { text: "No list lines found", warn: true });
});
