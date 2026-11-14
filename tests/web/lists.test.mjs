import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLists, formatList, formatLists, importLists, reportText, getLists, findList, createList, renameList, cleanName, onListsChange,
  deleteList, favourites, namedLists, toggleFave, isFave, catalogueResolver, MAX_IDS_PER_LINE,
} from "../../docs/lists.js";

test("the add-on's export line parses, with a colon in the name and an empty list", () => {
  const { lists, skipped } = parseLists(
    "FURC LIST: Hall: west wing: 118303,115647, 118303\r\nFURC LIST: Empty: \n\nnot a list line\nFURC LIST 2: Later: 1");
  assert.deepEqual(lists, [{ name: "Hall: west wing", ids: [118303, 115647, 118303] }, { name: "Empty", ids: [] }]);
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
  assert.equal(r.lists, 1);
  assert.deepEqual(findList("round trip").ids, [30, 10, 20]);
});

test("import merges into a same-named list, like the add-on", () => {
  getLists().length = 0;
  createList("Merge").list.ids.push(5);
  const r = importLists("FURC LIST: merge: 6,5");
  assert.deepEqual([r.lists, r.added, r.duplicates, namedLists().length], [1, 1, 1, 1]);
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
  assert.deepEqual([r.lists, namedLists().length, r.errors.length], [1, 1, 0]);
  assert.deepEqual(findList("A".repeat(32)).ids, [1, 2]);
});

test("the import report is one short line, and a warning when something was left out", () => {
  getLists().length = 0;
  assert.deepEqual(reportText(importLists("FURC LIST: One: 1,2\nnonsense")), { text: "Imported 1 list: 2 items added, 1 line skipped", warn: true });
  assert.deepEqual(reportText(importLists("FURC LIST: one: 3,1")), { text: "Imported 1 list: 1 item added, 1 duplicate", warn: false });
  assert.deepEqual(reportText(importLists("hello")), { text: "No list lines found", warn: true });
});

test("the resolver maps blueprints to their furnishing, drops unknown ids and counts repeats as duplicates", () => {
  getLists().length = 0;
  const resolve = catalogueResolver([{ id: 115647 }, { id: 224910, blueprint: 225123 }]);
  const r = importLists("FURC LIST: Mixed: 115647,990001,224910,225123", resolve);
  assert.deepEqual(findList("Mixed").ids, [115647, 224910]);
  assert.deepEqual([r.lists, r.added, r.duplicates, r.unknown], [1, 2, 1, 1]);
  assert.deepEqual(reportText(r), { text: "Imported 1 list: 2 items added, 1 duplicate, 1 unknown skipped", warn: true });
  // An ignored item shows in no list, so it is dropped like an unknown id
  const ignoring = catalogueResolver([{ id: 115647 }, { id: 119706, source: { type: "ignored" } }]);
  assert.deepEqual([ignoring(115647), ignoring(119706)], [115647, null]);
});

test("an import saves and notifies once, however many lists it creates", () => {
  getLists().length = 0;
  let calls = 0;
  onListsChange(() => calls++);
  importLists("FURC LIST: A: 1\nFURC LIST: B: 2\nFURC LIST: C: 3");
  assert.equal(calls, 1);
});

test("export wraps at 1000 ids a line, and the wrapped lines import back into one list", () => {
  getLists().length = 0;
  const made = createList("Big").list;
  for (let id = 1; id <= 2 * MAX_IDS_PER_LINE + 1; id++) made.ids.push(id);
  const lines = formatList(made).split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines.every((l) => l.startsWith("FURC LIST: Big: ") && l.length < 8000));
  assert.equal(lines[2], `FURC LIST: Big: ${2 * MAX_IDS_PER_LINE + 1}`);
  const text = formatList(made);
  getLists().length = 0;
  const r = importLists(text);
  assert.deepEqual([r.lists, r.added, findList("Big").ids.length], [1, 2001, 2001]);
});

test("the favourites line parses, builds, wraps and merges into the favourites", () => {
  getLists().length = 0;
  assert.deepEqual(parseLists("FURC FAVES: 3, 1\nfurc faves:").lists, [{ faves: true, ids: [3, 1] }, { faves: true, ids: [] }]);
  const versioned = parseLists("FURC FAVES 1: 4\nFURC FAVES 2: 5");
  assert.deepEqual([versioned.lists, versioned.skipped], [[{ faves: true, ids: [4] }], 1], "version 1 reads, any other is skipped");
  const r = importLists("FURC FAVES: 3,1\nFURC FAVES: 2,3");
  assert.deepEqual([r.lists, r.added, r.duplicates], [1, 3, 1]);
  assert.deepEqual(favourites().ids, [3, 1, 2]);
  assert.equal(formatList(favourites()), "FURC FAVES: 3,1,2");
  for (let id = 10; id < 10 + MAX_IDS_PER_LINE; id++) favourites().ids.push(id);
  assert.deepEqual(formatList(favourites()).split("\n").map((l) => l.split(",").length), [1000, 3]);
});

test("Export all writes the favourites beside the lists, and leaves out empty favourites", () => {
  getLists().length = 0;
  createList("Hall").list.ids.push(7);
  assert.equal(formatLists(), "FURC LIST: Hall: 7");
  toggleFave(5);
  assert.ok(isFave(5));
  assert.equal(formatLists(), "FURC FAVES: 5\nFURC LIST: Hall: 7");
});

test("the favourites cannot be renamed or deleted, and no list may take their name", () => {
  getLists().length = 0;
  const fav = favourites();
  assert.ok(renameList(fav, "Mine").error);
  deleteList(fav);
  assert.equal(favourites(), fav);
  assert.equal(fav.name, "Favorites");
  assert.ok(createList("favorites").error);
  assert.ok(createList("Favourites").error, "the British spelling is refused too");
  assert.ok(renameList(createList("Other").list, "Favorites").error);
  assert.ok(importLists("FURC LIST: Favorites: 1").errors.length);
});

test("a stored list already called Favorites stays an ordinary list beside the favourites", () => {
  getLists().length = 0;
  getLists().push({ name: "Favorites", ids: [9] });
  assert.equal(findList("Favorites").ids[0], 9);
  assert.notEqual(findList("Favorites"), favourites());
  assert.ok(!renameList(findList("Favorites"), "favorites").error, "it may keep its own name");
  const r = importLists("FURC LIST: Favorites: 8\nFURC FAVES: 4");
  assert.deepEqual([findList("Favorites").ids, favourites().ids], [[9, 8], [4]]);
  assert.equal(r.first, findList("Favorites"), "the first list the import touched");
});
