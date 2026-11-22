// Guild trader price links: ESO-Hub's furniture slugs, the per-site links and the stored choice of sites.
import test from "node:test";
import assert from "node:assert/strict";

// Just enough of a browser for prefs.js and the link builder.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = {
  createElement: () => {
    const el = { attrs: {}, dataset: {}, children: [], classList: { add() {} } };
    el.setAttribute = (k, v) => { el.attrs[k] = v; };
    el.append = (...kids) => el.children.push(...kids);
    return el;
  },
};

const { setPref, tradeSettings } = await import("../../docs/prefs.js");
const { esoHubSlug, tradingLinkGroups, setItemNameLookup } = await import("../../docs/external-links.js");

const NAMES = {
  225027: { en: "Cheese Crumbs, Echatere", de: "Käsekrümel, Echatere", fr: "Miettes de fromage, échatère", ru: "Сырные крошки (эшатер)" },
  226770: { en: "Fish Bowl, Small" },
  119059: { en: "Praxis: Orcish Table, Formal", de: "Anleitung: orkischer Tisch, formell" },
};
setItemNameLookup((id) => ({ english: NAMES[id]?.en || "", local: NAMES[id]?.[JSON.parse(store.get("furcat-prefs-v1") || "{}").language] || "" }));
// Each group is the site tag followed by its links.
const hrefs = (ids) => tradingLinkGroups(ids).flatMap((g) => g.children.slice(1).map((a) => `${a.dataset.site} ${a.href}`));

test("ESO-Hub slugs: lower case ASCII, accents and punctuation dropped, Cyrillic transliterated", () => {
  assert.equal(esoHubSlug("Käsekrümel, Echatere"), "kasekrumel-echatere");
  assert.equal(esoHubSlug("miettes de fromage, échatère"), "miettes-de-fromage-echatere");
  assert.equal(esoHubSlug("Сырные крошки (эшатер)"), "syrnye-kroski-esater");
  assert.equal(esoHubSlug("Fischglas, klein"), "fischglas-klein");
  assert.equal(esoHubSlug("Fish Bowl, Small"), "fish-bowl-small");
});

test("ESO-Hub alone, Tamriel Trade Centre on EU PC, until the visitor chooses", () => {
  assert.deepEqual(tradeSettings(), { sites: ["esohub"], ttcServer: "eu", ttcPlatform: "pc" });
});

test("a furnishing links ESO-Hub's furniture page in the page language, a blueprint its trading page", () => {
  setPref("language", "de");
  setPref("tradeSites", ["esohub", "ttc"]);
  setPref("ttcServer", "us");
  setPref("ttcPlatform", "ps");
  assert.deepEqual(hrefs({ item: 225027 }), [
    "esohub https://eso-hub.com/de/furniture/kasekrumel-echatere",
    "ttc https://us.tamrieltradecentre.com/ps/Trade/SearchResult?ItemNamePattern=K%C3%A4sekr%C3%BCmel%2C%20Echatere&lang=de-DE",
  ]);
  assert.deepEqual(hrefs({ blueprint: 119059 }), [
    "esohub https://eso-hub.com/de/trading/119059",
    "ttc https://us.tamrieltradecentre.com/ps/Trade/SearchResult?ItemNamePattern=Anleitung%3A%20orkischer%20Tisch%2C%20formell&lang=de-DE",
  ]);
});

test("without a name in the page language: ESO-Hub's trading page, TTC in English", () => {
  setPref("language", "de");
  assert.deepEqual(hrefs({ item: 226770 }), [
    "esohub https://eso-hub.com/de/trading/226770",
    "ttc https://us.tamrieltradecentre.com/ps/Trade/SearchResult?ItemNamePattern=Fish%20Bowl%2C%20Small&lang=en-US",
  ]);
});

test("Japanese and Chinese: ESO-Hub in English, TTC in the page language", () => {
  setPref("language", "jp");
  NAMES[225027].jp = "チーズクラム";
  assert.deepEqual(hrefs({ item: 225027 }), [
    "esohub https://eso-hub.com/en/furniture/cheese-crumbs-echatere",
    "ttc https://us.tamrieltradecentre.com/ps/Trade/SearchResult?ItemNamePattern=%E3%83%81%E3%83%BC%E3%82%BA%E3%82%AF%E3%83%A9%E3%83%A0&lang=ja-JP",
  ]);
});

test("links are grouped by site, item before blueprint", () => {
  setPref("language", "en");
  setPref("tradeSites", ["ttc", "esohub"]);
  const groups = tradingLinkGroups({ item: 225027, blueprint: 119059 });
  assert.deepEqual(groups.map((g) => `${g.children[0].textContent}: ${g.children.slice(1).map((a) => a.title).join(", ")}`), [
    "EH: Guild store prices on ESO-Hub, Blueprint prices on ESO-Hub",
    "TTC: Guild store prices on Tamriel Trade Centre, Blueprint prices on Tamriel Trade Centre",
  ]);
});

test("no site chosen, no links", () => {
  setPref("tradeSites", []);
  assert.deepEqual(hrefs({ item: 225027 }), []);
});
