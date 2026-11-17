import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLists, formatList, formatLists, importLists, reportText, getLists, findList, createList, renameList, cleanName, onListsChange,
  deleteList, favourites, namedLists, toggleFave, isFave, catalogueResolver, MAX_IDS_PER_LINE,
  normPath, moveList, canMove, parentOf, hasChildren, depthOf, leafOf, lastList, rememberList,
} from "../../docs/lists.js";

test("the add-on's export line parses, with a colon in the name and an empty list", () => {
  const { lists, skipped } = parseLists(
    "FURC LIST: Hall: west wing: 118303,115647, 118303\r\nFURC LIST: Empty: \n\nnot a list line\nFURC LIST 2: Later: 1");
  assert.deepEqual(lists, [{ name: "Hall: west wing", ids: [118303, 115647, 118303] }, { name: "Empty", ids: [] }]);
  assert.equal(skipped, 2, "a stray line and an unknown version are skipped, not guessed");
});

test("every spelling the add-on has given the prefix is read", () => {
  const { lists, skipped } = parseLists([
    "FURC LIST Hall: west wing: 1,2", "[FURC LIST] Hall: 3", "[furc  list 1] Hall: 4", "FURC LIST 2 chairs: 5", "FURC LIST 1: Hall: 6",
    "[FURC FAVES] 7", "[FURC FAVES]: 8", "FURC FAVES 9,10",
    "[FURC LIST 2] Later: 1", "FURC LISTS: no: 1", "[FURC OTHER] no: 1",
  ].join("\n"));
  assert.deepEqual(lists, [
    { name: "Hall: west wing", ids: [1, 2] }, { name: "Hall", ids: [3] }, { name: "Hall", ids: [4] }, { name: "2 chairs", ids: [5] },
    { name: "Hall", ids: [6] }, { faves: true, ids: [7] }, { faves: true, ids: [8] }, { faves: true, ids: [9, 10] },
  ]);
  assert.equal(skipped, 3, "another version and another prefix stay unread");
});

test("the brace shape is read, never written", () => {
  const { lists } = parseLists('"Say \\"hi\\"": {1, 2, 3},');
  assert.deepEqual(lists, [{ name: 'Say "hi"', ids: [1, 2, 3] }]);
  assert.equal(formatList(lists[0]), 'FURC LIST Say "hi": 1,2,3');
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
  assert.ok(lines.every((l) => l.startsWith("FURC LIST Big: ") && l.length < 8000));
  assert.equal(lines[2], `FURC LIST Big: ${2 * MAX_IDS_PER_LINE + 1}`);
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
  assert.equal(formatLists(), "FURC LIST Hall: 7");
  toggleFave(5);
  assert.ok(isFave(5));
  assert.equal(formatLists(), "FURC FAVES: 5\nFURC LIST Hall: 7");
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

// Sublists

const names = () => namedLists().map((l) => l.name);

test("a path is written with ' > ', its parts trimmed and cut to 32 bytes each", () => {
  assert.equal(normPath(" Guildhall>Entrance  >  Left "), "Guildhall > Entrance > Left");
  assert.equal(normPath("A > > B >"), "A > B", "empty parts are dropped");
  const long = normPath(`${"a".repeat(40)} > ${"ä".repeat(40)}`).split(" > ");
  assert.deepEqual(long.map((p) => new TextEncoder().encode(p).length), [32, 32]);
});

test("a path deeper than three levels is folded into the third", () => {
  assert.equal(normPath("A > B > C > D"), "A > B > C / D");
  assert.equal(normPath("A>B>C>D>E"), "A > B > C / D / E");
  getLists().length = 0;
  const r = importLists("FURC LIST A > B > C > D: 1");
  assert.deepEqual(names(), ["A", "A > B", "A > B > C / D"]);
  assert.deepEqual([r.lists, findList("A > B > C / D").ids], [1, [1]]);
  assert.equal(depthOf(findList("A > B > C / D")), 3);
});

test("New list with a path makes the sublist and every missing parent", () => {
  getLists().length = 0;
  const made = createList("Guildhall > Entrance").list;
  assert.deepEqual(names(), ["Guildhall", "Guildhall > Entrance"]);
  assert.equal(parentOf(made), findList("guildhall"));
  assert.equal(leafOf(made), "Entrance");
  assert.ok(createList("guildhall > entrance").error, "the full path is the identity, without case");
  assert.equal(createList("GUILDHALL > Poles > Daedric").list.name, "Guildhall > Poles > Daedric", "an existing parent keeps its spelling");
  assert.ok(!createList("Other > Entrance").error, "the same name may sit under another parent");
});

test("a new sublist goes below its parent's last one, wherever the parent stands", () => {
  getLists().length = 0;
  for (const n of ["A", "B", "A > x", "A > x > deep", "A > y", "C > z"]) createList(n);
  assert.deepEqual(names(), ["A", "A > x", "A > x > deep", "A > y", "B", "C", "C > z"]);
});

test("the export of sublists: one line each with the full path, parents first, an empty parent without ids", () => {
  getLists().length = 0;
  createList("Guildhall > Stripper Poles > Daedric").list.ids.push(789);
  findList("Guildhall > Stripper Poles").ids.push(123, 456);
  createList("Guildhall > Entrance").list.ids.push(321);
  assert.equal(formatLists(), [
    "FURC LIST Guildhall:", "FURC LIST Guildhall > Stripper Poles: 123,456",
    "FURC LIST Guildhall > Stripper Poles > Daedric: 789", "FURC LIST Guildhall > Entrance: 321",
  ].join("\n"));
});

test("Export all imported into an empty store gives the same grouping, order and items", () => {
  getLists().length = 0;
  for (const n of ["B", "A > y", "A > x > deep", "B > q"]) createList(n).list.ids.push(n.length);
  toggleFave(5);
  moveList(findList("A > x"), -1);
  moveList(findList("A"), -1);
  const before = JSON.stringify(getLists());
  const text = formatLists();
  getLists().length = 0;
  importLists(text);
  assert.deepEqual(names(), ["A", "A > x", "A > x > deep", "A > y", "B", "B > q"]);
  assert.equal(JSON.stringify(getLists()), before);
});

test("an imported sublist whose parent is missing gets it as an empty list", () => {
  getLists().length = 0;
  const r = importLists("FURC LIST Hall > Entrance: 321\nFURC LIST Hall>Entrance : 5");
  assert.deepEqual(names(), ["Hall", "Hall > Entrance"]);
  assert.deepEqual([findList("Hall").ids, findList("Hall > Entrance").ids, r.lists], [[], [321, 5], 1]);
});

test("renaming changes one part, turns > into / and takes everything below along", () => {
  getLists().length = 0;
  for (const n of ["Hall > West > Corner", "Hall > East", "Hallway"]) createList(n);
  rememberList(findList("Hall > West > Corner"));
  const hall = findList("Hall");
  assert.equal(renameList(hall, "Guild > hall").list.name, "Guild / hall");
  assert.deepEqual(names(), ["Guild / hall", "Guild / hall > West", "Guild / hall > West > Corner", "Guild / hall > East", "Hallway"]);
  assert.equal(lastList().name, "Guild / hall > West > Corner", "the remembered list follows its parent's rename");
  assert.equal(renameList(findList("Guild / hall > West"), "North").list.name, "Guild / hall > North");
  assert.ok(findList("Guild / hall > North > Corner"));
  assert.ok(renameList(findList("Guild / hall > East"), "north").error, "a sibling's name is taken");
  assert.ok(!renameList(findList("Hallway"), "North").error, "but free at another level");
});

test("deleting a list with sublists empties it and keeps it until they are gone", () => {
  getLists().length = 0;
  const hall = createList("Hall").list;
  hall.ids.push(1, 2);
  const entrance = createList("Hall > Entrance").list;
  assert.ok(hasChildren(hall));
  deleteList(hall);
  assert.deepEqual([names(), findList("Hall").ids], [["Hall", "Hall > Entrance"], []]);
  deleteList(entrance);
  deleteList(hall);
  assert.deepEqual(names(), []);
});

test("a list moves among its siblings with everything below it, and stops at either end", () => {
  getLists().length = 0;
  for (const n of ["A > x > deep", "A > y", "B", "C"]) createList(n);
  const a = findList("A"), x = findList("A > x"), y = findList("A > y");
  assert.deepEqual([canMove(a, -1), canMove(x, -1), canMove(y, 1), canMove(findList("C"), 1), canMove(favourites(), 1)], [false, false, false, false, false]);
  assert.ok(moveList(a, 1));
  assert.deepEqual(names(), ["B", "A", "A > x", "A > x > deep", "A > y", "C"]);
  assert.ok(moveList(y, -1));
  assert.deepEqual(names(), ["B", "A", "A > y", "A > x", "A > x > deep", "C"]);
  assert.ok(moveList(findList("C"), -1));
  assert.deepEqual(names(), ["B", "C", "A", "A > y", "A > x", "A > x > deep"]);
  assert.equal(moveList(findList("A > x > deep"), 1), false, "an only child has nowhere to go");
  assert.equal(getLists()[0], favourites());
});

test("a line of ids without a prefix goes into the selected list, and is refused without one", () => {
  getLists().length = 0;
  const hall = createList("Hall").list;
  const r = importLists("123,456,\n456, 789", undefined, hall);
  assert.deepEqual([hall.ids, r.lists, r.added, r.duplicates, r.first], [[123, 456, 789], 1, 3, 1, hall]);
  const refused = importLists("1,2");
  assert.deepEqual([refused.lists, refused.errors.length, hall.ids.length], [0, 1, 3]);
  assert.deepEqual(reportText(refused), { text: "Ids without a list name need a selected list.", warn: true });
});

test("ids right below a prefixed line continue it as they stand, undoing the game's line break even inside an id", () => {
  const { lists, skipped } = parseLists("FURC LIST A > B: 1,2,\r\n3,4\nFURC FAVES: 5,11\n56,6\n\n7");
  assert.deepEqual(lists, [{ name: "A > B", ids: [1, 2, 3, 4] }, { faves: true, ids: [5, 1156, 6] }, { bare: true, ids: [7] }]);
  assert.equal(skipped, 0);
});

test("the favourites take no sublists, and a stored list called Favorites may have them", () => {
  getLists().length = 0;
  assert.ok(createList("Favorites > Best").error);
  assert.ok(importLists("FURC LIST Favourites > Best: 1").errors.length);
  assert.deepEqual(names(), []);
  getLists().push({ name: "Favorites", ids: [9] });
  assert.equal(createList("Favorites > Best").list.name, "Favorites > Best");
  assert.deepEqual(favourites().ids, []);
});

test("a store from before sublists is grouped on first load: parents made, sublists gathered under them", async () => {
  const stored = { last: "Hall>West", lists: [
    { name: "Hall>West", ids: [1] }, { name: "Other", ids: [2] }, { name: "Favorites", ids: [3], faves: true },
    { name: "Hall > East > a > b", ids: [4] }, { name: "hall > west", ids: [1, 5] },
  ] };
  globalThis.localStorage = { getItem: () => JSON.stringify(stored), setItem() {} };
  try {
    const fresh = await import("../../docs/lists.js?first-load");
    assert.deepEqual(fresh.getLists().map((l) => [l.name, l.ids]), [
      ["Favorites", [3]], ["Hall", []], ["Hall > West", [1, 5]], ["Hall > East", []], ["Hall > East > a / b", [4]], ["Other", [2]],
    ]);
    assert.equal(fresh.lastList().name, "Hall > West");
  } finally {
    delete globalThis.localStorage;
  }
});
