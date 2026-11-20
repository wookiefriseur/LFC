// Item names in the visitor's game language: which language, which name, and lists copied out as names.
import test from "node:test";
import assert from "node:assert/strict";
import { gameLanguage } from "../../docs/prefs.js";
import { NameStore, labelOf, noteLabel, setStrings, checkTranslation } from "../../docs/data.js";
import { DirtyBuffer, serialiseDiff } from "../../docs/diff.js";
import { t, tn, checkInterfaceText, setInterfaceTranslation, englishTexts, sourceTypeLabel, valueLabel, labelFor, tipFor } from "../../docs/lexicon.js";
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

test("a vocabulary label and a string-id note follow the language, English where the language has none", () => {
  const enums = { vendors: [{ symbol: "LUXF", si: "SI_FURC_TRADERS_LUXF", name: "Luxury Furnisher" },
    { symbol: "ROLIS", si: "SI_FURC_TRADERS_ROLIS", name: "Rolis Hlaalu" }] };
  setStrings({ en: { SI_FURC_TRADERS_LUXF: "Luxury Furnisher^Nd,from", SI_FURC_TOMBS: "tombs^p" },
    de: { SI_FURC_TRADERS_LUXF: "Luxusausstatter^n,von" } }, "de");
  assert.equal(labelOf(enums, "vendors", "LUXF"), "Luxusausstatter");
  assert.equal(labelOf(enums, "vendors", "LUXF", { english: true }), "Luxury Furnisher");
  assert.equal(labelOf(enums, "vendors", "ROLIS"), "Rolis Hlaalu");
  assert.equal(noteLabel(enums, "SI_FURC_TOMBS"), "tombs");
  assert.equal(noteLabel(enums, "SI_FURC_NOT_DEFINED"), "SI_FURC_NOT_DEFINED");
  assert.equal(noteLabel(enums, "Aetherius Art"), "Aetherius Art");
  setStrings(null, "en");
  assert.equal(labelOf(enums, "vendors", "LUXF"), "Luxury Furnisher");
});

test("a translation keeps the placeholders of the English text and becomes one string line", () => {
  setStrings({ en: { SI_FURC_RANK: "rank <<1>>", SI_FURC_ESO_PLUS: "ESO+" }, de: { SI_FURC_RANK: "Rang <<1>>" } }, "en");
  assert.deepEqual(checkTranslation("de", "SI_FURC_RANK", "Stufe <<1>>"), { before: "Rang <<1>>" });
  assert.deepEqual(checkTranslation("de", "SI_FURC_ESO_PLUS", "ESO+"), { before: null });
  assert.throws(() => checkTranslation("de", "SI_FURC_RANK", "Stufe"), /<<1>>/);
  assert.throws(() => checkTranslation("de", "SI_FURC_NONE", "x"), /not one of/);
  assert.throws(() => checkTranslation("zh", "SI_FURC_RANK", "x <<1>>"), /no translation file/);
  assert.throws(() => checkTranslation("en", "SI_FURC_RANK", "x <<1>>"), /no translation file/);
  const buffer = new DirtyBuffer();
  buffer.setString("de", "SI_FURC_RANK", "Stufe <<1>>", "Rang <<1>>");
  assert.deepEqual(JSON.parse(serialiseDiff(buffer)), { v: 1, op: "string", locale: "de", id: "SI_FURC_RANK", text: "Stufe <<1>>" });
  buffer.setString("de", "SI_FURC_RANK", "Rang <<1>>", "Rang <<1>>");
  assert.equal(buffer.list().length, 0);
});

test("interface text follows its translation, English where there is none, and becomes one text line", () => {
  setInterfaceTranslation({ "kind.luxury": "Luxusausstatter", "value.rarities.rare": "Selten", "field.cost": "Preis", "tip.cost": "" });
  assert.equal(sourceTypeLabel("luxury"), "Luxusausstatter");
  assert.equal(sourceTypeLabel("vendor"), "Vendor");
  assert.equal(valueLabel("rarities", "rare"), "Selten");
  assert.equal(labelFor("cost"), "Preis");
  assert.equal(tipFor("cost"), "Blank means no price.");
  assert.equal(t("no.such_id"), "no.such_id");
  setInterfaceTranslation(null);
  assert.equal(sourceTypeLabel("luxury"), "Luxury Furnisher");
  // a source kind's own wording of a field, a field nobody described, and a detail its kind no longer allows
  assert.equal(labelFor("source.subtype", "vendor"), "Vendor kind");
  assert.equal(labelFor("source.subtype", "drop"), "How it is found");
  assert.equal(labelFor("source.made_up"), "Made Up");
  assert.match(tipFor("source.made_up"), /no longer allowed/);
  assert.equal(valueLabel("rarities", "made_up"), "Made Up");
  const english = englishTexts();
  for (const id of ["kind.luxury", "value.rarities.rare", "field.cost", "tip.cost", "tab.lists", "browse.source_count"]) assert.ok(english[id], id);
  const buffer = new DirtyBuffer();
  buffer.setText("fr", "field.cost", "Prix", null);
  assert.deepEqual(JSON.parse(serialiseDiff(buffer)), { v: 1, op: "text", locale: "fr", id: "field.cost", text: "Prix" });
});

test("a page text fills its holes in either language, and a translation keeps the holes of a known id", () => {
  setInterfaceTranslation({ "browse.source_count": "{n} Bezugsquellen", "browse.source_count_one": "1 Bezugsquelle" });
  assert.equal(t("browse.source_count", { n: 3 }), "3 Bezugsquellen");
  assert.equal(t("common.count_items", { n: 0 }), "0 items");
  assert.equal(t("common.count_items", {}), "{n} items");
  // a counted text has its own entry for exactly one
  assert.equal(tn(1, "browse.source_count"), "1 Bezugsquelle");
  assert.equal(tn(2, "browse.source_count"), "2 Bezugsquellen");
  assert.equal(tn(1234, "common.count_items", { n: "1,234" }), "1,234 items");
  setInterfaceTranslation(null);
  checkInterfaceText("common.count_items", "{n} Gegenstände");
  assert.throws(() => checkInterfaceText("common.count_items", "Gegenstände"), /\{n\}/);
  assert.throws(() => checkInterfaceText("browse.all_items", "Alle {n}"), /free of/);
  assert.throws(() => checkInterfaceText("browse.no_such_text", "x"), /not a text/);
});
