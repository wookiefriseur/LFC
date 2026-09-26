import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNamesDump, diffNames, unescapeLua } from "../../docs/names-dump.js";

const SAVED = `FurCDev_SavedVariables =
{
    ["names"] =
    {
        ["locale"] = "de",
        ["houses"] =
        {
            [1060] = "Maras Kuss",
        },
        ["quests"] =
        {
            [12] = "Die \\"Höhle\\"",
            [13] = "Back\\\\slash",
        },
        ["format"] = "furniture-names-v1",
    },
}
`;

test("the SavedVariables file: every table, its locale and Lua escapes", () => {
  const p = parseNamesDump(SAVED);
  assert.equal(p.locale, "de");
  assert.equal(p.kinds.houses.get(1060), "Maras Kuss");
  assert.equal(p.kinds.quests.get(12), 'Die "Höhle"');
  assert.equal(p.kinds.quests.get(13), "Back\\slash");
});

test("pages from the output box: the first names its table, later ones carry a label", () => {
  const first = `-- achievements, en, API 101051, 3 names\nachievements = {\n  [11] = "Elden Hollow I Vanquisher",`;
  const second = `-- achievements, page 2 of 2\n  [15] = "Level 40 Hero",\n}`;
  const p = parseNamesDump(`${second}\n${first}`);
  assert.equal(p.locale, "en");
  assert.deepEqual([...p.kinds.achievements.keys()].sort(), [11, 15]);
  assert.equal(p.skipped, 0);
});

test("lines that name no table are counted, not guessed", () => {
  const p = parseNamesDump(`  [15] = "Level 40 Hero",`);
  assert.equal(Object.keys(p.kinds).length, 0);
  assert.equal(p.skipped, 1);
});

test("a decimal escape is a byte of UTF-8", () => {
  assert.equal(unescapeLua("\\195\\169t\\195\\169"), "été");
});

test("the diff: new and different names, unchanged and missing only counted", () => {
  const p = parseNamesDump(`zones = {\n  [1] = "Glenumbra",\n  [2] = "New",\n  [3] = "Same",\n}`);
  const current = { zones: new Map([[1, "Glenumbrah"], [3, "Same"], [4, "Gone"]]) };
  const d = diffNames(p, current).zones;
  assert.deepEqual(d.added, [{ id: 2, name: "New" }]);
  assert.deepEqual(d.changed, [{ id: 1, name: "Glenumbra", before: "Glenumbrah" }]);
  assert.equal(d.same, 1);
  assert.equal(d.missing, 1);
});
