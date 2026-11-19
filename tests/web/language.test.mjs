// Item names in the visitor's game language: which language, which name, and lists copied out as names.
import test from "node:test";
import assert from "node:assert/strict";
import { gameLanguage } from "../../docs/prefs.js";
import { NameStore } from "../../docs/data.js";
import { formatListNames } from "../../docs/lists.js";
import { itemSearch } from "../../docs/crown-store.js";

test("the browser's language maps onto the game's codes, English when the game does not ship it", () => {
  assert.equal(gameLanguage(["de-DE", "en"]), "de");
  assert.equal(gameLanguage(["ja"]), "jp");
  assert.equal(gameLanguage(["zh-Hans-CN"]), "zh");
  assert.equal(gameLanguage(["pl", "fr-CA"]), "fr");
  assert.equal(gameLanguage(["pl"]), "en");
  assert.equal(gameLanguage([]), "en");
});

test("a translated name wins, an id without one shows the English name", () => {
  const names = new NameStore({ 1: "Imperial Chair", 2: "Imperial Rug" });
  names.setRecordName(1, "Imperial Chair, corrected");
  names.setTranslation(new Map([[1, "Kaiserlicher Stuhl"]]));
  assert.equal(names.get(1), "Kaiserlicher Stuhl");
  assert.equal(names.get("1"), "Kaiserlicher Stuhl");
  assert.equal(names.get(2), "Imperial Rug");
  assert.equal(names.english(1), "Imperial Chair, corrected");
  names.setTranslation(null);
  assert.equal(names.get(1), "Imperial Chair, corrected");
});

test("a no-break space in a game name becomes a plain space", () => {
  const names = new NameStore({});
  names.setTranslation(new Map([[7, "стул (из\u00a0планок)"]]));
  assert.equal(names.get(7), "Стул (из планок)");
});

test("a name the game stores in lowercase is shown capitalised, as the game shows it", () => {
  const names = new NameStore({});
  names.setTranslation(new Map([[1, "kaiserlicher Teppich, Arkay"], [2, "étagère impériale"], [3, "Skizze: Stuhl"]]), "de");
  assert.equal(names.get(1), "Kaiserlicher Teppich, Arkay");
  assert.equal(names.get(2), "Étagère impériale");
  assert.equal(names.get(3), "Skizze: Stuhl");
});

test("a list copies out as its name and one item name per line; an unnamed id stays an id", () => {
  const nameOf = (id) => ({ 1: "Kaiserlicher Stuhl", 2: "Kaiserlicher Teppich" })[id] || "";
  assert.equal(formatListNames({ name: "Küche", ids: [2, 1, 9] }, nameOf), "Küche\nKaiserlicher Teppich\nKaiserlicher Stuhl\n#9");
  assert.equal(formatListNames({ faves: true, name: "x", ids: [1] }, nameOf), "Favorites\nKaiserlicher Stuhl");
});

test("the item search follows a change of language", () => {
  const names = new NameStore({ 1: "Imperial Chair" });
  const state = { records: [{ id: 1 }], names };
  const search = itemSearch(state, (id) => names.get(id));
  assert.deepEqual(search("chair").map((e) => e.id), [1]);
  names.setTranslation(new Map([[1, "Kaiserlicher Stuhl"]]));
  assert.deepEqual(search("stuhl").map((e) => e.id), [1]);
  assert.deepEqual(search("chair"), []);
});
