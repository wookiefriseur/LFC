import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseLists, importLists, reportText, getLists, favourites, createList, catalogueResolver, formatLists } from "../../docs/lists.js";
import { knowledgeOf, getKnowledge, forgetKnowledge, missingPages, onKnowledgeChange, recipeResolver, setCraftableLookup } from "../../docs/knowledge.js";

const ids = (kind) => getKnowledge()[kind]?.ids ?? [];
let listsBefore;
beforeEach(() => {
  forgetKnowledge();
  getLists().length = 0;
  favourites().ids.push(7);
  createList("Hall").list.ids.push(8);
  listsBefore = formatLists();
});
const listsUntouched = () => assert.equal(formatLists(), listsBefore, "lists and favourites are untouched");

test("known and unknown lines parse, continued by bare lines; a bad page/pages is skipped", () => {
  const { lists, knowledge, skipped } = parseLists([
    "FURC KNOWN 1/2: 1,2,", "3,4", "furc  unknown 1/1 : 5", "FURC KNOWN: 6", "FURC KNOWN 3/2: 7", "FURC UNKNOWN 0/1: 8", "FURC KNOWN 1/x: 9",
  ].join("\n"));
  assert.deepEqual(lists, []);
  assert.deepEqual(knowledge, [
    { knowledge: "known", page: 1, pages: 2, ids: [1, 2, 3, 4] },
    { knowledge: "unknown", page: 1, pages: 1, ids: [5] },
  ]);
  assert.equal(skipped, 4);
});

test("an empty export line is read", () => {
  const { knowledge, skipped } = parseLists("FURC KNOWN 1/1:");
  assert.deepEqual([knowledge, skipped], [[{ knowledge: "known", page: 1, pages: 1, ids: [] }], 0]);
});

test("page 2 after page 1 adds; page 1 again replaces; a different total replaces", () => {
  importLists("FURC KNOWN 1/2: 1,2");
  assert.deepEqual(missingPages("known"), [2]);
  assert.equal(reportText(importLists("FURC KNOWN 2/2: 3")).text, "Crafting knowledge: 3 known");
  assert.deepEqual([ids("known"), getKnowledge().known.pages], [[1, 2, 3], [1, 2]]);
  importLists("FURC KNOWN 1/2: 4");
  assert.deepEqual([ids("known"), getKnowledge().known.pages], [[4], [1]]);
  importLists("FURC KNOWN 1/1: 5");
  assert.deepEqual([ids("known"), getKnowledge().known.total], [[5], 1]);
  assert.equal(knowledgeOf(4), null);
  listsUntouched();
});

test("pages in any order; two lines of the same page in one paste add up", () => {
  importLists("FURC KNOWN 2/2: 3\nFURC KNOWN 1/2: 1\nFURC KNOWN 1/2: 2");
  assert.deepEqual([ids("known"), getKnowledge().known.pages], [[3, 1, 2], [1, 2]]);
});

test("the later import wins: known removes from unknown and the reverse", () => {
  importLists("FURC UNKNOWN 1/1: 1,2,3");
  importLists("FURC KNOWN 1/1: 2");
  assert.deepEqual([knowledgeOf(1), knowledgeOf(2)], ["unknown", "known"]);
  assert.deepEqual(ids("unknown"), [1, 3]);
  importLists("FURC UNKNOWN 1/1: 2");
  assert.deepEqual([knowledgeOf(2), ids("known")], ["unknown", []]);
  listsUntouched();
});

test("a newer complete unknown export flips the ids it dropped to known; an incomplete one waits", () => {
  importLists("FURC UNKNOWN 1/1: 1,2,3");
  importLists("FURC UNKNOWN 1/1: 1,2");
  assert.deepEqual([knowledgeOf(3), getKnowledge().learned], ["known", [3]]);

  importLists("FURC UNKNOWN 1/2: 1");
  assert.deepEqual([knowledgeOf(2), knowledgeOf(3)], [null, "known"], "page 1 of 2: nothing flips yet");
  assert.deepEqual(getKnowledge().unknown.previous, [1, 2]);
  importLists("FURC UNKNOWN 2/2: 3");
  assert.deepEqual([knowledgeOf(1), knowledgeOf(2), knowledgeOf(3)], ["unknown", "known", "unknown"], "named again, 3 leaves learned");
  assert.deepEqual(getKnowledge().learned, [2]);
  assert.equal(getKnowledge().unknown.previous, undefined);
  assert.equal(knowledgeOf(99), null, "an id no import named stays unmarked");
});

test("a known id leaving the known export is not flipped to unknown", () => {
  importLists("FURC KNOWN 1/1: 1,2");
  importLists("FURC KNOWN 1/1: 1");
  assert.deepEqual([knowledgeOf(1), knowledgeOf(2)], ["known", null]);
});

test("craftables only: a recipe blueprint marks its furnishing; rumours, other items and unknown ids are skipped and counted", () => {
  const records = [
    { id: 100, blueprint: 200, source: { type: "recipe" } }, { id: 101, source: { type: "recipe" } },
    { id: 102, blueprint: 202, source: { type: "rumour" } }, { id: 103, source: { type: "rumour" } }, { id: 104, source: { type: "vendor" } },
  ];
  const r = importLists("FURC KNOWN 1/2: 200,101,102,202,103,104,999", catalogueResolver(records), null, recipeResolver(records));
  assert.deepEqual([ids("known"), r.knowledge.notCraftable], [[100, 101], 5]);
  assert.deepEqual([102, 202, 103, 104].map(knowledgeOf), [null, null, null, null]);
  assert.deepEqual(reportText(r), { text: "Crafting knowledge: 2 known, page 1 of 2 (page 2 missing), 5 not craftable skipped", warn: true });
  listsUntouched();
});

test("knowledge and lists in one paste are both reported; knowledge never becomes a list", () => {
  const r = importLists("FURC LIST Hall: 9\nFURC UNKNOWN 1/1: 5");
  assert.equal(reportText(r).text, "Imported 1 list: 1 item added. Crafting knowledge: 1 unknown");
  assert.deepEqual(getLists().map((l) => l.name), ["Favorites", "Hall"]);
  assert.ok(!formatLists().includes("5"));
});

test("a craftable no import named is missing, once something is stored; anything else stays unmarked", () => {
  setCraftableLookup((id) => [100, 200, 300].includes(id));
  try {
    assert.deepEqual([100, 300, 999].map(knowledgeOf), [null, null, null], "nothing stored: no marker");
    importLists("FURC KNOWN 1/1: 100\nFURC UNKNOWN 1/1: 200");
    assert.deepEqual([100, 200, 300, 999].map(knowledgeOf), ["known", "unknown", "missing", null]);
    forgetKnowledge();
    assert.equal(knowledgeOf(300), null);
  } finally {
    setCraftableLookup(() => false);
  }
});

test("clearing leaves no state and announces it", () => {
  importLists("FURC KNOWN 1/1: 1\nFURC UNKNOWN 1/1: 2,3");
  importLists("FURC UNKNOWN 1/1: 2");
  let heard = 0;
  onKnowledgeChange(() => heard++);
  forgetKnowledge();
  assert.deepEqual(getKnowledge(), { learned: [] });
  assert.deepEqual([knowledgeOf(1), knowledgeOf(2), knowledgeOf(3), heard], [null, null, null, 1]);
  listsUntouched();
});
