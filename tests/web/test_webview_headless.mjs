#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WEBVIEW_ROOT
  ? path.resolve(process.env.WEBVIEW_ROOT)
  : path.resolve(HERE, "..", "..", "docs");
const CHROMIUM = process.env.CHROMIUM || "/usr/bin/chromium";
const HEADFUL = process.argv.includes("--headful");
const FILTER = (() => {
  const i = process.argv.indexOf("--filter");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const externalImages = [];
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
  "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const overrides = new Map();

function serve(root) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const override = overrides.get(rel);
    if (override !== undefined) {
      res.writeHead(200, { "content-type": MIME[path.extname(rel)] || "application/octet-stream" });
      res.end(override);
      return;
    }
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// Test runner

let refDataGate = null;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertEq"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertAtLeast(actual, min, msg) {
  if (!(actual >= min)) throw new Error(`${msg || "assertAtLeast"}: ${actual} < ${min}`);
}

// Page helpers

const app = (page) => page.evaluate(() => window.__proto || null);

async function waitForBoot(page) {
  await page.waitForSelector("#tab-bar button", { timeout: 30000 });
  await page.waitForFunction(
    () => window.__proto && window.__proto.ready === true,
    { timeout: 30000 },
  ).catch(() => {
    return page.waitForSelector(".panel:not([hidden])", { timeout: 5000 });
  });
}

async function switchTab(page, id) {
  await page.click(`#tab-${id}`);
  await page.waitForSelector(`#panel-${id}:not([hidden])`, { timeout: 10000 });
  await page.waitForFunction(
    (pid) => document.querySelector(pid).childElementCount > 0,
    {}, `#panel-${id}`,
  );
}

const tabIds = (page) =>
  page.$$eval("#tab-bar button", (bs) => bs.map((b) => b.id.replace(/^tab-/, "")));

// Tests

test("boots with no page errors and mounts the mask tab bar", async (page) => {
  const ids = await tabIds(page);
  assertAtLeast(ids.length, 5, "tab count");
  for (const want of ["browse", "advanced", "maintenance"]) {
    assert(ids.includes(want), `expected a "${want}" tab, got ${ids.join(", ")}`);
  }
});

test("loads the v2 data set: records, enums and the file manifest", async (page) => {
  const s = await app(page);
  assert(s, "the app exposes no window.__proto debug hook");
  assertAtLeast(s.recordCount, 6000, "record count");
  assertEq(s.schemaVersion, 2, "enums.json schema_version");
  assertAtLeast(s.sourceTypes.length, 13, "source type count");
});

test("every source type in the data has a contract", async (page) => {
  const missing = await page.evaluate(() => {
    const s = window.__proto;
    return s.sourceTypes.filter((t) => !s.contracts[t]);
  });
  assertEq(missing.length, 0, `types without a contract: ${missing.join(", ")}`);
});

test("contracts are indicators: a known field is legal on any type, an unknown key is not", async (page) => {
  const out = await page.evaluate(() => {
    const s = window.__proto;
    const codes = (r) => s.validate(r).errors.map((e) => `${e.field}:${e.code}`);
    const base = s.sampleRecord("quest_reward");
    if (!base) return null;
    const clone = () => JSON.parse(JSON.stringify(base));

    const withContainer = clone();
    withContainer.source.container = s.enums.containers[0].symbol;

    const withRetired = clone();
    withRetired.source.dungeon = "FUNGAL_GROTTO_I";

    const missingRequired = {
      id: 1, source: { type: "luxury" }, cost: [],
      availability: { version: base.availability.version },
    };
    return {
      base: codes(base),
      container: codes(withContainer),
      retired: codes(withRetired),
      missingRequired: codes(missingRequired),
    };
  });
  assert(out, "no quest_reward record in the data set to test against");
  assertEq(out.base.length, 0,
    `the sample quest_reward does not validate clean to begin with: ${out.base.join(", ")}`);
  assertEq(out.container.length, 0,
    `a container on a quest_reward is still rejected: ${out.container.join(", ")}`);
  assert(out.retired.includes("source.dungeon:field_not_allowed"),
    `a retired source key is no longer caught: [${out.retired.join(", ")}]`);
  assert(out.missingRequired.includes("source.vendor:required_field_missing"),
    `a per-type required field stopped being required: [${out.missingRequired.join(", ")}]`);
});

test("no record carries a de-baked-away field or a joined source string", async (page) => {
  const bad = await page.evaluate(() => {
    const out = { dungeon: 0, quest_note: 0, achievement_note: 0, joined: 0, flags: 0,
      enumFlags: "flags" in window.__proto.enums };
    for (const r of window.__proto.records()) {
      const s = r.source || {};
      if ("flags" in r) out.flags++;
      if ("dungeon" in s) out.dungeon++;
      if ("quest_note" in s) out.quest_note++;
      if ("achievement_note" in s) out.achievement_note++;
      for (const v of Object.values(s)) {
        if (typeof v === "string" && v.includes(" + ")) out.joined++;
      }
    }
    return out;
  });
  assertEq(bad.dungeon, 0, "records still carrying source.dungeon");
  assertEq(bad.quest_note, 0, "records still carrying source.quest_note");
  assertEq(bad.achievement_note, 0, "records still carrying source.achievement_note");
  assertEq(bad.joined, 0, 'records carrying the " + " source separator');
  assertEq(bad.flags, 0, "records still carrying flags");
  assertEq(bad.enumFlags, false, "enums still carry a flag vocabulary");
});

test("the location axis is split: zones in location, places in place, notes free text", async (page) => {
  const bad = await page.evaluate(() => {
    const s = window.__proto;
    const zones = new Set(s.enums.locations.map((l) => l.symbol));
    const places = new Set((s.enums.places || []).map((p) => p.symbol));
    const out = { placeInLocation: [], zoneInPlace: [], symbolInNote: [] };
    for (const r of s.records()) {
      const src = r.source || {};
      if (src.location && places.has(src.location) && !zones.has(src.location)) {
        out.placeInLocation.push(`${r.id}:${src.location}`);
      }
      if (src.place && zones.has(src.place) && !places.has(src.place)) {
        out.zoneInPlace.push(`${r.id}:${src.place}`);
      }
      if (src.note && (zones.has(src.note) || places.has(src.note))) {
        out.symbolInNote.push(`${r.id}:${src.note}`);
      }
    }
    return {
      a: out.placeInLocation.slice(0, 5),
      b: out.zoneInPlace.slice(0, 5),
      c: out.symbolInNote.slice(0, 5),
    };
  });
  assertEq(bad.a.length, 0, `place symbols in source.location: ${bad.a.join(", ")}`);
  assertEq(bad.b.length, 0, `zone symbols in source.place: ${bad.b.join(", ")}`);
  assertEq(bad.c.length, 0, `vocabulary symbols in source.note: ${bad.c.join(", ")}`);
});

test("the de-bake produced real multi-source items", async (page) => {
  const multi = await page.evaluate(() => {
    const byId = new Map();
    for (const r of window.__proto.records()) {
      byId.set(r.id, (byId.get(r.id) || 0) + 1);
    }
    let n = 0;
    for (const c of byId.values()) if (c > 1) n++;
    return n;
  });
  assertAtLeast(multi, 500, "items with more than one source record");
});

test("browse: the grid renders and an item detail lists every source record", async (page) => {
  await switchTab(page, "browse");
  await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
  const cards = await page.$$eval("#panel-browse .browse-card", (n) => n.length);
  assertAtLeast(cards, 10, "visible browse cards");
  await page.click("#panel-browse .browse-card");
  await page.waitForSelector("#browse-detail:not([hidden])", { timeout: 10000 });
  const rows = await page.$$eval("#browse-detail .browse-source-rec", (n) => n.length);
  assertAtLeast(rows, 1, "source records in the item detail");
});

test("maintenance/Sources: every leaf is placed or falls into the computed catch-all", async (page) => {
  await switchTab(page, "maintenance");
  await page.click("#maint-tab-sources");
  await page.waitForFunction(
    () => document.querySelector("#panel-maintenance").textContent.includes("Other"),
    { timeout: 10000 },
  );
  const t = await page.evaluate(() => window.__proto.taxonomy());
  assertAtLeast(t.leaves.length, 13, "enumerated leaves");
  const placed = new Set(t.groups.flatMap((g) => g.leaves));
  const missing = t.leaves.filter((l) => !placed.has(l) && !t.catchAll.includes(l));
  assertEq(missing.length, 0, `leaves neither grouped nor in the catch-all: ${missing.join(", ")}`);
  assertEq(t.catchAll.length, 0,
    `nothing should be unplaced now, got [${t.catchAll.join(", ")}]`);

  const crown = t.groups.find((g) => g.id === "crown");
  assert(crown, `no group derived for the crown_ prefix: [${t.groups.map((g) => g.id).join(", ")}]`);
  for (const leaf of ["crown_store", "crown_crate"]) {
    assert(crown.leaves.includes(leaf), `${leaf} is not under its own prefix`);
  }
  assert(t.groups.some((g) => g.id === "guild"), "guild_gift is still unplaced");

  const labels = await page.$$eval("#panel-maintenance .tax-group-head strong",
    (n) => n.map((e) => e.textContent.trim()));
  for (const gone of ["Crown Gems", "Currency", "Tome Points", "Housing Editor"]) {
    assert(!labels.includes(gone), `the hand-drawn group "${gone}" is still shown`);
  }
});

test("validation rejects a record that violates its type contract", async (page) => {
  const res = await page.evaluate(() => {
    const s = window.__proto;
    const bad = { id: 1, source: { type: "dungeon_drop" }, cost: [], availability: { version: "NONE" } };
    const ok = { id: 1, source: { type: "dungeon_drop",
                                  locations: [{ location: s.enums.locations[0].symbol }] },
                 cost: [], availability: { version: "NONE" } };
    return { bad: s.validate(bad).errors.length, ok: s.validate(ok).errors.length };
  });
  assertAtLeast(res.bad, 1, "a dungeon_drop with no location must fail validation");
  assertEq(res.ok, 0, "a well-formed dungeon_drop must validate");
});

test("note is accepted on every source type", async (page) => {
  const failures = await page.evaluate(() => {
    const s = window.__proto;
    const out = [];
    for (const t of s.sourceTypes) {
      const rec = s.sampleRecord(t);
      if (!rec) continue;
      const withNote = JSON.parse(JSON.stringify(rec));
      withNote.source.note = "a one-off qualifier";
      const errs = s.validate(withNote).errors;
      if (errs.length) out.push(`${t}: ${errs[0]}`);
    }
    return out;
  });
  assertEq(failures.length, 0, `note rejected on: ${failures.join("; ")}`);
});

test("batch edit: filtering and the virtualised table survive a full-set render", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  const rows = await page.$$eval("#panel-advanced table tbody tr", (n) => n.length);
  assert(rows > 0 && rows < 400, `virtualised window should be small, got ${rows} rows`);
});

test("batch edit: the form renders note, rarity and notes, and follows source.type", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  await page.click("#panel-advanced table tbody tr");
  await page.waitForSelector('[data-field="description"]', { timeout: 10000 });
  for (const sel of ['[data-field="notes"]', ".note-combo", '[name="rarity"], [data-field="rarity"]']) {
    const n = await page.$$eval(sel, (e) => e.length).catch(() => 0);
    assertAtLeast(n, 1, `form is missing ${sel}`);
  }
  const before = await page.$$eval("form [data-field], form select, form input", (n) => n.length);
  await page.select('[name="source.type"]', "dungeon_drop");
  await page.waitForFunction(
    () => !!document.querySelector(".placement-list"),
    { timeout: 10000 },
  );
  const after = await page.$$eval("form [data-field], form select, form input", (n) => n.length);
  assert(after > 0 && before > 0, "form fields did not render");
  const notes = await page.$$eval(".note-combo", (n) => n.length);
  assertAtLeast(notes, 1, "note combo missing after a source.type switch");
});

test("maintenance: the health filters compute", async (page) => {
  await switchTab(page, "maintenance");
  await page.waitForSelector("#maint-filter", { timeout: 10000 });
  const opts = await page.$$eval("#maint-filter option", (o) => o.map((x) => x.value));
  assertAtLeast(opts.length, 3, "health filter options");
  for (const want of ["invalid", "repeatednotes", "unplacedleaves"]) {
    assert(opts.includes(want), `expected a "${want}" filter, got ${opts.join(", ")}`);
  }
});

test("maintenance: a freshly regenerated data set has zero invalid records", async (page) => {
  await switchTab(page, "maintenance");
  await page.select("#maint-filter", "invalid");
  await page.waitForFunction(
    () => document.querySelector("#maint-count")?.textContent.trim().length > 0,
    { timeout: 10000 },
  );
  const count = await page.$eval("#maint-count", (e) => e.textContent);
  assert(/\b0\b/.test(count), `expected 0 invalid records, got "${count}"`);
});

test("maintenance: repeated free-text notes are offered as promotion candidates", async (page) => {
  await switchTab(page, "maintenance");
  await page.select("#maint-filter", "repeatednotes");
  await page.waitForFunction(
    () => document.querySelector("#maint-body")?.childElementCount > 0,
    { timeout: 10000 },
  );
  const rows = await page.$$eval("#maint-body tr", (n) => n.length);
  assertAtLeast(rows, 1, "repeated-note rows");
});

test("the text checks are always grouped, with no switch", async (page) => {
  await switchTab(page, "maintenance");
  assertEq(await page.$("#maint-group"), null, "the Group by switch is still there");
  let promoted = false;
  for (const f of ["repeatednotes", "notesymbol", "datanote", "unplacedleaves"]) {
    await page.select("#maint-filter", f);
    await page.waitForFunction(
      () => document.querySelector("#maint-count")?.textContent.trim().length > 0,
      { timeout: 10000 });
    const rows = await page.$$eval("#maint-body tr", (n) => n
      .filter((tr) => tr.cells.length > 1)
      .map((tr) => ({ group: tr.classList.contains("maint-row-group"),
        text: tr.textContent, label: tr.querySelector(".maint-detail")?.title || "" })));
    for (const r of rows) {
      assert(r.group, `${f} shows an ungrouped record row: ${r.text.slice(0, 80)}`);
      assert(/\d[\d,]* records/.test(r.text), `${f} group row has no count: ${r.text.slice(0, 80)}`);
    }
    if (f === "repeatednotes") {
      assertAtLeast(rows.length, 1, "no repeated-note groups to promote from");
      const labels = rows.map((r) => r.label);
      assertEq(new Set(labels).size, labels.length, "a text is split over two group rows");
      await page.$$eval("#maint-body tr.maint-row-group button", (bs) => {
        bs.find((b) => /promote/i.test(b.textContent)).click();
      });
      await page.waitForFunction(() => document.querySelector("#maint-enum-meta-name")?.value,
        { timeout: 5000 });
      const name = await page.$eval("#maint-enum-meta-name", (e) => e.value);
      assertEq(name, rows[0].label, "promote did not prefill the group's text");
      promoted = true;
      await page.click("#maint-tab-check");
    }
  }
  assert(promoted, "promote was never exercised");
});

test("maintenance/Sources: a leaf chip jumps to Find an item filtered to that leaf", async (page) => {
  await switchTab(page, "maintenance");
  await page.click("#maint-tab-sources");
  await page.waitForSelector("#panel-maintenance .tax-chip", { timeout: 10000 });
  await page.$$eval("#panel-maintenance .tax-chip", (chips) => {
    const hit = chips.find((c) => /guild_gift/.test(c.textContent));
    (hit || chips[0]).click();
  });
  await page.waitForSelector("#panel-browse:not([hidden])", { timeout: 10000 });
  const active = await page.$eval("#panel-browse .is-active", (e) => e.textContent)
    .catch(() => "");
  assert(active.length > 0, "Find an item did not focus a facet after the chip click");
});

test("luxury: paste, preview and commit reach the shared dirty buffer", async (page) => {
  await switchTab(page, "luxury");
  await page.waitForSelector("#lux-paste", { timeout: 10000 });
  const before = await page.$eval("#pending-count", (e) => e.textContent);
  await page.type("#lux-paste", "126560, 25000\n");
  await page.click("#lux-parse");
  await page.waitForFunction(
    () => document.querySelectorAll("#lux-preview-body tr").length > 0,
    { timeout: 10000 },
  );
  await page.click("#lux-commit");
  await page.waitForFunction(
    (prev) => document.querySelector("#pending-count").textContent !== prev,
    { timeout: 10000 }, before,
  );
  const after = await page.$eval("#pending-count", (e) => e.textContent);
  assert(/[1-9]/.test(after), `expected pending edits, got "${after}"`);
});

test("luxury: titled, advanced folded away, one line per item", async (page) => {
  await switchTab(page, "luxury");
  await page.waitForSelector("#lux-paste", { timeout: 10000 });

  assertEq(await page.$eval(".lux-title", (e) => e.textContent.trim()), "Luxury Furnisher",
    "the screen is not titled Luxury Furnisher");
  assertEq(await page.$(".zanil-caption"), null, "the portrait still carries a caption");

  assert(await page.$eval("#lux-advanced-fields", (e) => e.offsetParent === null),
    "the advanced fields are shown to everyone");
  await page.click("#lux-advanced");
  assert(await page.$eval("#lux-advanced-fields", (e) => e.offsetParent !== null),
    "the advanced switch does not reveal them");
  await page.click("#lux-advanced");
  assertEq(await page.$("#lux-show-icons"), null, "the icon toggle survived");
  const heads = await page.$$eval("table.lux-preview thead th", (ts) => ts.map((t) => t.textContent.trim()));
  assertEq(heads[0], "", "the icon column still has a heading");

  await page.$eval("#lux-date", (e) => {
    e.value = "2026-09-19";                       // a Saturday
    e.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assertEq(await page.$eval("#lux-date", (e) => e.value), "2026-09-18",
    "a Saturday did not snap back to its Friday");

  await page.$eval("#lux-paste", (e) => { e.value = ""; });
  await page.type("#lux-paste", "211032, 25000\n126560, 50000\n126561, 99999\n");
  await page.click("#lux-parse");
  await page.waitForFunction(
    () => document.querySelectorAll("#lux-preview-body tr").length === 3, { timeout: 10000 });
  const rows = await page.$$eval("#lux-preview-body tr", (trs) => trs.map((tr) => ({
    h: tr.getBoundingClientRect().height,
    price: tr.querySelector(".lux-price-effect")?.textContent.trim() ?? "",
  })));
  const tallest = Math.max(...rows.map((r) => r.h));
  const shortest = Math.min(...rows.map((r) => r.h));
  assertEq(tallest, shortest, `a preview row wraps: heights ${rows.map((r) => r.h).join(", ")}`);
  for (const r of rows) {
    assert(/^[+*-]?[\d,]+g$/.test(r.price), `price cell is not one token: "${r.price}"`);
  }
  await page.click("#lux-clear");
});

test("change list: a new record names its vendor once and carries no ordinal", async (page) => {
  await switchTab(page, "luxury");
  await page.waitForSelector("#lux-paste", { timeout: 10000 });
  await page.$eval("#lux-paste", (e) => { e.value = ""; });
  await page.type("#lux-paste", "211032, 25000\n");
  await page.click("#lux-parse");
  await page.waitForFunction(
    () => document.querySelectorAll("#lux-preview-body tr").length > 0,
    { timeout: 10000 },
  );
  await page.click("#lux-commit");
  await page.waitForFunction(
    () => /[1-9]/.test(document.querySelector("#pending-count").textContent),
    { timeout: 10000 },
  );

  await page.click("#btn-submit");
  await page.waitForSelector("#modal.open", { timeout: 10000 });
  await page.waitForSelector(".chg-table .chg-row", { timeout: 10000 });
  const rows = await page.$$eval(".chg-table .chg-row", (trs) => trs.map((tr) => ({
    item: tr.querySelector(".chg-item")?.textContent ?? "",
    record: tr.querySelector(".chg-record")?.textContent ?? "",
  })));
  const mine = rows.filter((r) => r.item.includes("211032"));
  assertAtLeast(mine.length, 1, "no change-list row for the record just added");
  for (const r of mine) {
    assert(!/\(\d+ of \d+\)/.test(r.record),
      `a new record is numbered among the item's others: "${r.record}"`);
    const vendor = "Luxury Furnisher";
    const times = r.record.split(vendor).length - 1;
    assertEq(times, 1, `the vendor is named ${times} times in "${r.record}"`);
  }
  await page.click("#modal-close");
});

test("icons: the loader accepts the dataset that covers the furniture range", async (page) => {
  // The overlay loads on requestIdleCallback, so it may not have started yet.
  await page.waitForFunction(
    () => window.__proto.refData && window.__proto.refData().state !== "unloaded",
    { timeout: 10000 },
  );
  const state = await page.evaluate(() => window.__proto.refData().state);
  assertEq(state, "ready", "the reference overlay did not load");

  // An id the shipped meta dataset covers. The FIRST ask fetches the shard and returns null by design, so the test asks again after it lands
  const id = await page.evaluate(async () => {
    const r = await fetch("./reference-data/manifest.json");
    const m = await r.json();
    const shard = m.datasets?.meta?.shards?.[0];
    if (!shard) return null;
    const rows = (await (await fetch(`./reference-data/${shard.file}`)).text())
      .split("\n").filter(Boolean).map((l) => JSON.parse(l));
    return rows[0]?.id ?? null;
  });
  assert(Number.isInteger(id), "the shipped meta dataset has no records");

  const rec = await page.evaluate(async (want) => {
    const f = window.__proto.refData();
    f.meta(want);
    for (let i = 0; i < 40 && !f.meta(want); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return f.meta(want);
  }, id);
  assert(rec && typeof rec.name === "string",
    `the loader does not read the dataset that covers the furniture range (id ${id})`);
});

test("icons: browsing paints game icons rather than the placeholder", async (page) => {
  await page.waitForFunction(
    () => window.__proto.refData && window.__proto.refData().state === "ready",
    { timeout: 10000 },
  );
  await switchTab(page, "browse");
  await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("#panel-browse .browse-card img.ext-icon")]
      .some((i) => i.complete && i.naturalWidth > 0),
    { timeout: 15000 },
  );

  const painted = await page.evaluate(() => {
    const cards = document.querySelectorAll("#panel-browse .browse-card");
    const imgs = [...document.querySelectorAll("#panel-browse .browse-card img.ext-icon")];
    return {
      total: cards.length,
      icons: imgs.length,
      placeholders: document.querySelectorAll(
        "#panel-browse .browse-card .ext-icon-placeholder").length,
      loaded: imgs.filter((i) => i.naturalWidth > 0).length,
      src: imgs[0]?.src || "",
    };
  });
  assert(painted.loaded > 0,
    `no icon painted (${painted.icons} img of ${painted.total} cards)`);
  assert(painted.icons > painted.placeholders,
    `${painted.placeholders} of ${painted.total} cards still show the `
    + `placeholder and only ${painted.icons} an icon`);
  assert(/^https?:\/\/esoicons\.uesp\.net\/esoui\/art\/icons\/[^/]+\.png$/
    .test(painted.src), `the composed icon URL is ${painted.src}`);
  assert(externalImages.some((u) => u.includes("esoicons.uesp.net")),
    "the page never asked the icon CDN for anything");
});

test("the tab bar is Luxury, Crown, Browse, Batch edit, Maintenance, About", async (page) => {
  const labels = await page.$$eval("#tab-bar > button", (bs) => bs.map((b) => b.textContent.trim()));
  assertEq(labels.join(", "), "Luxury, Crown, Browse, Batch edit, Maintenance, About", "the tab bar");
  assertEq(await page.$("header input, header form"), null, "the header still has a search box");
  const footerAbout = await page.$$eval("footer a, footer button",
    (els) => els.filter((e) => /about/i.test(e.textContent)).length);
  assertEq(footerAbout, 0, "the footer still links About");

  await switchTab(page, "about");
  const stored = await page.evaluate(() => localStorage.getItem("furcat-last-tab"));
  assert(stored !== "about", "About was remembered as the landing tab");
});

test("about: the page carries the landing page's links and the Luxury introduction", async (page) => {
  await switchTab(page, "about");
  const hrefs = await page.$$eval("#panel-about a", (as) => as.map((a) => a.href));
  for (const want of [
    "github.com/wookiefriseur/LFC",
    "info4804-LibFurnitureCatalogue",
    "info1617-FurnitureCatalogue",
  ]) {
    assert(hrefs.some((h) => h.includes(want)),
      `About does not carry the published landing page's ${want} link`);
  }
  const text = await page.$eval("#panel-about", (e) => e.textContent);
  assert(/Zanil Theran/.test(text), "the Luxury introduction did not move here");
  assert(/Send it/.test(text), "About does not say how to contribute");

  await switchTab(page, "luxury");
  const head = await page.$eval(".lux-title", (e) => e.textContent.trim());
  assert(!/Zanil Theran/.test(head),
    `the Luxury screen still opens on an introduction: "${head}"`);
});

test("browse: nothing offers a reason for an item being unconfirmed", async (page) => {
  await switchTab(page, "browse");
  await page.waitForSelector("#browse-search", { timeout: 10000 });
  await page.$$eval("#browse-facet-list .browse-facet-link", (bs) => {
    const all = bs.find((b) => /All items/.test(b.textContent));
    if (all) all.click();
  });
  await page.evaluate(() => {
    const b = document.querySelector("#browse-search");
    b.value = "Imperial Cauldron, Pitch-filled";
    b.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll("#browse-grid .browse-card")]
      .some((c) => c.textContent.includes("94116")),
    { timeout: 10000 },
  );
  await page.$$eval("#browse-grid .browse-card", (cs) => {
    cs.find((c) => c.textContent.includes("94116")).click();
  });
  await page.waitForFunction(
    () => { const d = document.querySelector("#browse-detail"); return d && !d.hidden; },
    { timeout: 10000 },
  );
  await page.$$eval("#browse-detail button", (bs) => {
    const f = bs.find((b) => /Quick Edit/.test(b.textContent));
    if (f) f.click();
  });
  await page.waitForSelector(".modal-backdrop", { timeout: 10000 });

  const retired = await page.$eval(".modal-backdrop", (d) =>
    (d.textContent.match(/Why it is unconfirmed|Heard about it|unverified/gi) || []));
  assertEq(retired.length, 0, `the editor still offers: ${retired.join(", ")}`);
  const onCard = await page.$eval("#panel-browse", (d) =>
    (d.textContent.match(/unverified/gi) || []));
  assertEq(onCard.length, 0, "an item still carries a second word for unconfirmed");

  const leaves = await page.evaluate(() =>
    window.__proto.taxonomy().leaves.filter((l) => l.startsWith("rumour")));
  assertEq(leaves.join(","), "rumour", `unsourced still has sub-leaves: ${leaves.join(", ")}`);
  const unknown = await page.evaluate(() => window.__proto.taxonomy().unknown);
  assertEq(unknown.length, 0, `records fell out of the tree: ${unknown.join(", ")}`);

  await page.$$eval(".modal-backdrop button", (bs) => {
    const x = bs.find((b) => /^(×|cancel|close)$/i.test(b.textContent.trim()));
    if (x) x.click();
  });
  // Leave the search as it was found: the later modal test picks whatever card is first, and a filter left behind decides that for it.
  await page.evaluate(() => {
    const b = document.querySelector("#browse-search");
    b.value = "";
    b.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#browse-grid .browse-card").length > 1,
    { timeout: 10000 },
  );
});

function fencedDiff(body) {
  const between = body.split("[//]: # (diff-begin)")[1]?.split("[//]: # (diff-end)")[0];
  if (between === undefined) throw new Error("the issue body carries no diff markers");
  return between.replace(/```/g, "").trim();
}

async function diffLines(page) {
  await page.click("#btn-submit");
  await page.waitForFunction(
    () => document.querySelector("#modal-diff")?.value.trim().length > 0,
    { timeout: 10000 },
  );
  const body = await page.$eval("#modal-diff", (e) => e.value);
  await page.click("#modal-close");
  await page.waitForFunction(
    () => !document.querySelector("#modal")?.classList.contains("open"),
    { timeout: 10000 },
  );
  return fencedDiff(body).split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

test("submit: the diff serialises one v:1 line per edited record", async (page) => {
  await page.click("#btn-submit");
  await page.waitForFunction(
    () => document.querySelector("#modal-diff")?.value.trim().length > 0,
    { timeout: 10000 },
  );
  const body = await page.$eval("#modal-diff", (e) => e.value);
  const lines = fencedDiff(body).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assertAtLeast(lines.length, 1, "diff lines");
  for (const l of lines) {
    assertEq(l.v, 1, "diff line version");
    assert(["add", "update", "delete", "add-enum"].includes(l.op), `bad op ${l.op}`);
  }
  await page.click("#modal-close");
});

test("the send screen has no evidence field, and raw data is the whole issue", async (page) => {
  await page.click("#btn-submit");
  await page.waitForFunction(
    () => document.querySelector("#modal-diff")?.value.trim().length > 0,
    { timeout: 10000 },
  );

  const field = await page.$("#modal-evidence-text");
  assertEq(field, null, "the send screen still asks for evidence in a form field");
  const summary = await page.$eval("#modal-technical > summary", (e) => e.textContent.trim());
  assertEq(summary, "Raw data", "the expander is not labelled Raw data");

  const body = await page.$eval("#modal-diff", (e) => e.value);
  for (const want of ["## Summary", "## Diff",
                      "[//]: # (diff-begin)", "[//]: # (diff-end)"]) {
    assert(body.includes(want), `the raw box is not the whole issue - no "${want}"`);
  }
  assert(!body.includes("## How I know"),
    "the issue body still asks the contributor where they saw this");

  // The copy button's payload, taken from the clipboard call itself: headless Chromium has no clipboard permission
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
      configurable: true,
    });
  });
  await page.click("#modal-copy");
  await page.waitForFunction(() => window.__copied !== null, { timeout: 5000 });
  const copied = await page.evaluate(() => window.__copied);
  assertEq(copied, body, "the clipboard carries something other than the raw box");
  await page.click("#modal-close");
});

test("crown store: an item sold only in a pack is an add, not an edit", async (page) => {
  const probe = await page.evaluate(() => {
    const s = window.__proto;
    const crown = s.records().filter((r) => r.source.type === "crown_store");
    const byId = new Map();
    for (const r of crown) {
      const e = byId.get(r.id) || { price: 0, pack: 0 };
      if (r.cost.length) e.price++; else if (r.source.packs) e.pack++;
      byId.set(r.id, e);
    }
    let packOnly = 0, both = 0;
    for (const e of byId.values()) {
      if (e.pack && !e.price) packOnly++;
      if (e.pack && e.price) both++;
    }
    return { packOnly, both };
  });
  assertAtLeast(probe.packOnly, 1, "items sold only in a pack");
  assertAtLeast(probe.both, 1, "items with both a crown price and a pack");
});


test("the placement editor writes what the validator accepts", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  await page.click("#panel-advanced table tbody tr");
  await page.waitForSelector('[data-field="description"]', { timeout: 10000 });
  await page.select('[name="source.type"]', "dungeon_drop");
  await page.waitForFunction(
    () => window.__proto.editing()?.source?.type === "dungeon_drop"
      && !!document.querySelector(".placement-list"),
    { timeout: 10000 });
  await page.evaluate(() => { delete window.__proto.editing().source.locations; });

  const codes = async () => page.evaluate(() => {
    const rec = window.__proto.editing();
    return rec ? window.__proto.validate(rec).errors.map((e) => e.code) : ["no-record"];
  });
  const first = await codes();
  assert(first.includes("required_field_missing"),
    `a dungeon_drop with no placement must report the missing axis, got [${first.join(",")}]`);

  await page.evaluate(() => {
    const add = [...document.querySelectorAll(".placement-list button")]
      .find((b) => b.textContent === "add a place");
    add.click();
  });
  await page.waitForSelector(".placement-row select", { timeout: 5000 });
  assert((await codes()).includes("placement_empty"),
    "an empty placement row must fail validation");
  assertEq(await page.$$eval(".placement-list.is-invalid", (n) => n.length), 1,
    "the empty row must mark the widget invalid");

  const zone = await page.evaluate(() => window.__proto.enums.locations[0].symbol);
  await page.select(".placement-row select", zone);
  assertEq((await codes()).length, 0,
    "a placement naming a zone must validate clean");
  assertEq(await page.$$eval(".placement-row", (n) => n.length), 1,
    "one placement, one row");

  await page.evaluate(() => {
    [...document.querySelectorAll(".placement-list button")]
      .find((b) => b.textContent === "add a place").click();
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".placement-row").length === 2,
    { timeout: 5000 });
  await page.evaluate(() => {
    for (const b of [...document.querySelectorAll(".placement-row button")].reverse()) {
      b.click();
    }
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".placement-row").length === 0,
    { timeout: 5000 });
  assert((await codes()).includes("required_field_missing"),
    "removing every row must leave the axis absent, not an empty list");
});

test("disclosure: required fields are always visible, the expander only adds", async (page) => {
  const bad = await page.evaluate(() => {
    const s = window.__proto;
    const out = { hiddenRequired: [], addableWithValue: [] };
    for (const type of s.sourceTypes) {
      const rec = s.sampleRecord(type);
      if (!rec) continue;
      const p = s.partition(rec._key);
      if (!p) { out.hiddenRequired.push(`${type}: no partition`); continue; }
      const req = (s.contracts[type].required || []).map((f) => `source.${f}`);
      for (const f of req) {
        if (!p.visible.includes(f)) out.hiddenRequired.push(`${type}:${f}`);
      }
      const populated = Object.keys(rec.source || {})
        .filter((k) => k !== "type").map((k) => `source.${k}`);
      for (const f of populated) {
        if (p.addable.includes(f)) out.addableWithValue.push(`${type}:${f}`);
      }
    }
    return out;
  });
  assertEq(bad.hiddenRequired.length, 0,
    `required fields behind the expander: ${bad.hiddenRequired.join(", ")}`);
  assertEq(bad.addableWithValue.length, 0,
    `fields with a value offered as "add": ${bad.addableWithValue.join(", ")}`);
});

test("modal: opens from Find an item, names which record, saves to the one buffer", async (page) => {
  await switchTab(page, "browse");
  await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
  await page.click("#panel-browse .browse-card");
  await page.waitForFunction(
    () => { const d = document.querySelector("#browse-detail"); return d && !d.hidden; },
    { timeout: 10000 },
  );
  const before = await page.$eval("#pending-count", (e) => e.textContent);
  await page.$$eval("#browse-detail button", (bs) => {
    const f = bs.find((b) => /Quick Edit/.test(b.textContent));
    if (f) f.click();
  });
  await page.waitForSelector(".modal-backdrop", { timeout: 10000 });

  const head = await page.$eval(".modal-backdrop", (d) => d.textContent);
  assert(/record \d+ of \d+ for this item/.test(head),
    "the modal does not say which of the item's records is open");
  const locator = await page.$$eval(".modal-locator", (n) => n.length);
  assertAtLeast(locator, 1, "no source locator line in the modal header");

  const offered = await page.evaluate(() => {
    const m = document.querySelector(".modal-backdrop");
    return {
      typeSelect: !!m.querySelector('[name$="source.type"], [name="source.type"]'),
      del: [...m.querySelectorAll("button")].some((b) => /^delete$/i.test(b.textContent.trim())),
      idEditable: [...m.querySelectorAll("input")]
        .some((i) => /(^|-)id$/.test(i.id || "") && !i.readOnly && !i.disabled),
    };
  });
  assertEq(offered.typeSelect, false, "the modal offers a source.type select");
  assertEq(offered.del, false, "the modal offers Delete");
  assertEq(offered.idEditable, false, "the modal offers an editable id");

  const saved = await page.evaluate(() => {
    const m = document.querySelector(".modal-backdrop");
    const num = [...m.querySelectorAll('input[type="number"], input[inputmode="numeric"]')]
      .find((i) => !i.readOnly && !i.disabled);
    if (num) {
      num.value = String((parseInt(num.value, 10) || 0) + 7);
      num.dispatchEvent(new Event("input", { bubbles: true }));
      num.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  });
  if (saved) {
    await page.$$eval(".modal-backdrop button", (bs) => {
      const b = bs.find((x) => /save/i.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForFunction(
      (prev) => document.querySelector("#pending-count").textContent !== prev,
      { timeout: 10000 }, before,
    );
  }
  await page.keyboard.press("Escape");
  const stillOpen = await page.$(".modal-backdrop");
  assertEq(stillOpen, null, "Escape did not close the quick-edit modal");
});

test("modal: a record that was already broken can still be corrected", async (page) => {
  const fix = await page.evaluate(() => {
    const en = window.__proto.enums;
    en.crates.push({ symbol: "IRONY", crate: null, season: null, name: null,
                     undefined_in_library: true });
    const r = window.__proto.records().find(
      (x) => x.source && x.source.type === "crown_crate");
    if (!r) return null;
    const orig = r.source.crate ?? null;
    r.source.crate = "IRONY";
    return { key: r._key, orig };
  });
  assert(fix, "no crown_crate record to synthesise the known-bad fixture from");
  const key = fix.key;
  await page.evaluate((k) => window.__proto.openQuickEdit(k), key);
  await page.waitForSelector(".modal-backdrop", { timeout: 10000 });
  const text = await page.$eval(".modal-backdrop", (d) => d.textContent.toLowerCase());
  assert(/known problem|already had a problem/.test(text),
    "the modal does not say the record arrived broken");
  const crateLocked = await page.evaluate(() => {
    const m = document.querySelector(".modal-backdrop");
    const el = m.querySelector('[name$="source.crate"], [name="source.crate"]');
    return !el || el.disabled || el.readOnly || el.hasAttribute("aria-readonly");
  });
  assertEq(crateLocked, true, "the broken vocabulary value is editable - it invites a fabrication");
  await page.keyboard.press("Escape");
  await page.evaluate((f) => {
    const r = window.__proto.records().find((x) => x._key === f.key);
    if (r) {
      if (f.orig == null) delete r.source.crate;
      else r.source.crate = f.orig;
    }
    const en = window.__proto.enums;
    const i = en.crates.findIndex(
      (c) => c.symbol === "IRONY" && c.undefined_in_library);
    if (i >= 0) en.crates.splice(i, 1);
  }, fix);
});

test("split: Batch edit names what ships to the game and what does not", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  await page.click("#panel-advanced table tbody tr");
  await page.waitForSelector("#panel-advanced fieldset", { timeout: 10000 });
  const legends = await page.$$eval("#panel-advanced legend", (n) =>
    n.map((x) => x.textContent.trim()));
  assertAtLeast(legends.length, 2, `expected two fieldsets, got ${legends.join(" | ")}`);
  assert(legends.some((l) => /ships to the game/i.test(l)),
    `no game-data legend: ${legends.join(" | ")}`);
  assert(legends.some((l) => /only on this site/i.test(l)),
    `no site-only legend: ${legends.join(" | ")}`);
});

test("words: no dotted schema path is visible in the editors", async (page) => {
  const leaked = await page.evaluate(() => {
    const paths = /\b(source|availability)\.[a-z_]+/g;
    const seen = new Set();
    const walk = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (n.parentElement.closest('[role="tooltip"]')) continue;
        const m = n.nodeValue.match(paths);
        if (m) m.forEach((x) => seen.add(x));
      }
    };
    walk(document.querySelector("#panel-advanced"));
    return [...seen];
  });
  assertEq(leaked.length, 0, `schema paths rendered as text: ${leaked.join(", ")}`);
});

test("filter bar: the category select is gone and Add new still works", async (page) => {
  await switchTab(page, "advanced");
  const hasCategory = await page.$("#filter-category");
  assertEq(hasCategory, null, "the category filter survived");
  const selects = await page.$$eval("#panel-advanced select", (n) => n.length);
  assertAtLeast(selects, 1, "the filter bar lost every select");
});

test("id: read-only everywhere, with no unlock", async (page) => {
  const unlock = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .some((b) => /change id/i.test(b.textContent)));
  assertEq(unlock, false, 'a "Change ID (advanced)" control still exists');
});

test("review: the submit modal leads with plain English, not JSONL", async (page) => {
  const pending = await page.$eval("#pending-count", (e) => e.textContent);
  assert(/[1-9]/.test(pending),
    `nothing is buffered, so the send flow is not exercised: "${pending}"`);
  await page.click("#btn-submit");
  await page.waitForSelector("#modal.open", { timeout: 10000 });

  await page.waitForFunction(
    () => document.querySelectorAll("#modal-changelist .chg-table .chg-row").length > 0,
    { timeout: 10000 },
  ).catch(() => {});
  const rows = await page.$$eval("#modal-changelist .chg-table .chg-row", (n) => n.length);
  assertAtLeast(rows, 1,
    "the submit modal's change list rendered no rows - an empty host is not a change list");

  const technical = await page.evaluate(() => {
    const d = document.querySelector("#modal-technical");
    return d ? d.tagName.toLowerCase() === "details" && !d.open : null;
  });
  assertEq(technical, true, "the raw diff is not behind a collapsed <details>");
  await page.click("#modal-close");
  await page.waitForFunction(
    () => !document.querySelector("#modal")?.classList.contains("open"),
    { timeout: 10000 },
  );
});

test("health: the code-word filter finds what it claims to find", async (page) => {
  await switchTab(page, "maintenance");
  await page.click("#maint-tab-check");
  await page.waitForSelector("#maint-filter", { timeout: 10000 });
  const opts = await page.$$eval("#maint-filter option", (o) => o.map((x) => x.value));
  assert(opts.includes("notesymbol"), `no code-word filter: ${opts.join(", ")}`);
  await page.select("#maint-filter", "notesymbol");
  await page.waitForFunction(
    () => (document.querySelector("#maint-count")?.textContent || "").trim().length > 0,
    { timeout: 10000 },
  );
  const rows = await page.$$eval("#maint-body tr", (n) => n.length);
  assertAtLeast(rows, 1,
    "the code-word filter returns nothing - it did that before the fix too");
});

test("an unpaired blueprint opens Quick Edit titled by its blueprint", async (page) => {
  await switchTab(page, "maintenance");
  await page.click("#maint-tab-check");
  await page.waitForSelector("#maint-filter", { timeout: 10000 });
  await page.select("#maint-filter", "unpaired");
  await page.waitForSelector("#maint-body .maint-fix", { timeout: 10000 });
  const blueprint = await page.evaluate(() =>
    window.__proto.records().find((r) => r.blueprint && r.id == null).blueprint);
  await page.click("#maint-body .maint-fix");
  await page.waitForSelector(".modal-title", { timeout: 10000 });
  const title = await page.$eval(".modal-title", (e) => e.textContent);
  await page.keyboard.press("Escape");
  assert(!/undefined|unnamed item/.test(title), `title: ${title}`);
  assert(title.includes(`#${blueprint}`), `title does not name blueprint ${blueprint}: ${title}`);
});

test("batch edit: Ctrl/Shift ticking, Selected only, links in the side pane", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  const rows = "#table-body tr:not(.spacer)";
  assertEq(await page.$$eval(`${rows} td a`, (a) => a.length), 0, "the rows still carry links");
  const cell = async (i) => (await page.$$(`${rows} td:nth-child(2)`))[i];
  await page.keyboard.down("Control"); await (await cell(0)).click(); await page.keyboard.up("Control");
  await page.keyboard.down("Shift"); await (await cell(3)).click(); await page.keyboard.up("Shift");
  const ticked = await page.$$eval(`${rows} input[type=checkbox]`, (b) => b.filter((x) => x.checked).length);
  assertEq(ticked, 4, "Ctrl then Shift did not tick four rows");
  await page.click("#filter-selected");
  assertEq(await page.$$eval(rows, (r) => r.length), 4, "Selected only does not leave the four");
  await page.click("#filter-selected");
  await page.click("#tick-all");
  await page.click("#tick-all");
  assertEq(await page.$$eval(`${rows} input[type=checkbox]`, (b) => b.filter((x) => x.checked).length),
    0, "the ticks did not clear");
  await page.click(`${rows} td:nth-child(3)`);
  await page.waitForSelector("#detail .detail-links a", { timeout: 5000 });

  await switchTab(page, "maintenance");
  await page.click("#maint-tab-check");
  await page.waitForFunction(
    () => [...document.querySelectorAll("#maint-filter option")].every((o) => /\(\d[\d,]*\)$/.test(o.textContent)),
    { timeout: 20000 });
});

test("icons: the map beats a stale cache, and a failed icon retries on click", async (page) => {
  await page.evaluate(() => {
    localStorage.setItem("furcat-iconcache-v2-114327", "https://example.invalid/stale.png");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await page.waitForFunction(() => window.__proto.refData().state === "ready", { timeout: 15000 });
  await switchTab(page, "browse");
  await page.$eval("#browse-search", (e) => {
    e.value = "114327";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const img = document.querySelector("#panel-browse .browse-card img");
    return img && img.getAttribute("src").includes("housing_alt_fur_stool002");
  }, { timeout: 15000 });
  assertEq(await page.evaluate(() => localStorage.getItem("furcat-iconcache-v2-114327")),
    "https://esoicons.uesp.net/esoui/art/icons/housing_alt_fur_stool002.png",
    "the stale cache entry was not corrected");

  await page.$eval("#panel-browse .browse-card img", (i) => i.dispatchEvent(new Event("error")));
  await page.waitForSelector("#panel-browse .browse-card .ext-icon-placeholder", { timeout: 5000 });
  await page.click("#panel-browse .browse-card .ext-icon-placeholder");
  const src = await page.$eval("#panel-browse .browse-card img", (i) => i.getAttribute("src"));
  assert(src.endsWith("housing_alt_fur_stool002.png?retry=1"), `the retry did not reload: ${src}`);
});

test("help tooltips stay inside the viewport", async (page) => {
  const inside = async (tip) => {
    await tip.hover();
    return tip.evaluate((w) => {
      const r = w.querySelector(".tip-bubble").getBoundingClientRect();
      const b = w.querySelector(".tip-btn").getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const beside = r.left <= b.right && r.right >= b.left
        && (Math.abs(r.top - b.bottom) <= 12 || Math.abs(b.top - r.bottom) <= 12);
      return { ok: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh
        && beside, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), vw, vh };
    });
  };
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  await page.click("#panel-advanced tbody tr:not(.spacer) td:nth-child(3)");
  await page.waitForSelector("#panel-advanced .form-fieldset-site .tip", { timeout: 10000 });
  const site = await page.$$("#panel-advanced .form-fieldset-site .tip");
  assertAtLeast(site.length, 3, "the site-only fields lost their help");
  for (const tip of site) {
    const r = await inside(tip);
    assert(r.ok, `a site-only tooltip leaves the ${r.vw}x${r.vh} window or its "?": ${r.rect}`);
  }

  await page.setViewport({ width: 420, height: 640 });
  try {
    const corners = [["8px", null, "8px", null], [null, "8px", "8px", null],
      ["8px", null, null, "8px"], [null, "8px", null, "8px"]];
    for (const [left, right, top, bottom] of corners) {
      const tip = await page.$("#panel-advanced .form-fieldset-site .tip");
      await tip.evaluate((w, pos) => {
        Object.assign(w.style, { position: "fixed", zIndex: 99, left: pos[0] ?? "auto",
          right: pos[1] ?? "auto", top: pos[2] ?? "auto", bottom: pos[3] ?? "auto" });
      }, [left, right, top, bottom]);
      await page.mouse.move(210, 320);
      const r = await inside(tip);
      assert(r.ok, `a tooltip at ${[left, right, top, bottom]} leaves the window or its "?": ${r.rect}`);
    }
  } finally {
    await page.$eval("#panel-advanced .form-fieldset-site .tip", (w) => w.removeAttribute("style"));
    await page.setViewport({ width: 1400, height: 950 });
    await page.mouse.move(0, 0);
  }
});

test("a help bubble is never covered by a native tooltip", async (page) => {
  const check = async (scope, where) => {
    const labels = [];
    for (const l of await page.$$(`${scope} .form-label.has-tip`)) {
      if (await l.evaluate((e) => e.checkVisibility({ visibilityProperty: true }))) labels.push(l);
    }
    assertAtLeast(labels.length, 2, `${where}: too few labels with help`);
    for (const label of labels) {
      await label.hover();
      const r = await label.evaluate((l) => {
        const titled = (el) => el?.closest("[title]")?.getAttribute("title") || "";
        const btn = l.querySelector(".tip-btn");
        const bubble = l.querySelector(".tip-bubble");
        return { text: l.firstChild.textContent, own: titled(l), inner: [...l.querySelectorAll("[title]")].length,
          btn: titled(btn), shown: getComputedStyle(bubble).display !== "none",
          path: bubble.querySelector(".tip-path")?.textContent || "" };
      });
      assertEq(r.own, "", `${where}: "${r.text}" sits under a native tooltip`);
      assertEq(r.inner, 0, `${where}: "${r.text}" holds an element with a native tooltip`);
      assertEq(r.btn, "", `${where}: the "?" of "${r.text}" sits under a native tooltip`);
      assert(r.shown, `${where}: hovering "${r.text}" does not open its bubble`);
      if (where === "Batch edit") assert(r.path, `Batch edit: "${r.text}" lost its schema path`);
      else assertEq(r.path, "", `${where}: "${r.text}" shows a schema path`);
    }
  };
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  await page.click("#panel-advanced tbody tr:not(.spacer) td:nth-child(3)");
  await page.waitForSelector("#panel-advanced .form-label.has-tip", { timeout: 10000 });
  await check("#panel-advanced", "Batch edit");

  await switchTab(page, "browse");
  await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
  await page.click("#panel-browse .browse-card");
  await page.waitForFunction(
    () => { const d = document.querySelector("#browse-detail"); return d && !d.hidden; },
    { timeout: 10000 });
  await page.$$eval("#browse-detail button", (bs) => bs.find((b) => /Quick Edit/.test(b.textContent))?.click());
  await page.waitForSelector(".modal-backdrop .form-label.has-tip", { timeout: 10000 });
  try {
    await check(".modal-backdrop", "Quick Edit");
  } finally {
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
  }
});

test("the Batch edit side form clips no value, and the update reads Version", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  const rows = await page.$$("#panel-advanced tbody tr:not(.spacer)");
  for (const tr of rows.slice(0, 5)) {
    await tr.$eval("td:nth-child(3)", (td) => td.click());
    await page.waitForSelector("#panel-advanced .detail-pane .form-row", { timeout: 10000 });
    const r = await page.evaluate(() => {
      const pane = document.querySelector("#panel-advanced .detail-pane");
      const ctx = document.createElement("canvas").getContext("2d");
      const ARROW = 20; // the select's own drop-down arrow
      const clipped = [];
      for (const el of pane.querySelectorAll(".form-row input, .form-row select")) {
        if (!el.checkVisibility({ visibilityProperty: true }) || el.type === "checkbox") continue;
        const cs = getComputedStyle(el);
        const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        let need;
        if (el.tagName === "SELECT") {
          ctx.font = cs.font;
          need = ctx.measureText(el.selectedOptions[0]?.text || "").width + ARROW;
        } else {
          need = el.scrollWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        }
        if (need > room + 1) clipped.push(`${el.id || el.name || el.tagName}: ${Math.round(need)} > ${Math.round(room)}`);
      }
      const version = [...pane.querySelectorAll(".form-label")]
        .find((l) => l.htmlFor && /availability-version/.test(l.htmlFor));
      return { clipped, version: version?.firstChild.textContent };
    });
    assertEq(r.clipped.join("; "), "", "a side-form value is clipped");
    assertEq(r.version, "Version", "the game-update label");
  }
});

test("Batch edit's Source header is whole and a long detail wraps to two lines", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  const r = await page.evaluate(() => {
    const th = [...document.querySelectorAll("#panel-advanced thead th")][3];
    const rows = [...document.querySelectorAll("#table-body tr:not(.spacer)")];
    const lines = (div) => Math.round(div.getBoundingClientRect().height
      / parseFloat(getComputedStyle(div).lineHeight));
    const clamps = rows.map((tr) => tr.querySelector(".cell-source-detail .clamp2"));
    const long = clamps.find((d) => d.scrollHeight > d.clientHeight + 1)
      || clamps.find((d) => lines(d) === 2);
    const total = parseInt(document.querySelector("#row-count").textContent.replace(/,/g, ""), 10);
    const tbody = document.querySelector("#table-body");
    return {
      head: th.textContent.trim(), headWhole: th.scrollWidth <= th.clientWidth,
      heights: [...new Set(rows.map((tr) => Math.round(tr.getBoundingClientRect().height)))],
      longLines: long ? lines(long) : 0,
      maxLines: Math.max(...clamps.map(lines)),
      longTitle: long ? long.parentElement.title.length >= long.textContent.trim().length : false,
      total, tbodyH: Math.round(tbody.getBoundingClientRect().height),
    };
  });
  assertEq(r.head, "Source", "the source column header");
  assert(r.headWhole, "the Source header is cut off");
  assertEq(r.heights.join(","), "36", "rows are not all ROW_H tall");
  assertEq(r.longLines, 2, "no long source detail shows on two lines");
  assert(r.maxLines <= 2, `a source detail shows on ${r.maxLines} lines`);
  assert(r.longTitle, "the clamped detail's title does not carry its whole text");
  assert(Math.abs(r.tbodyH - r.total * 36) <= 36,
    `the table's height ${r.tbodyH} is not ${r.total} rows of ROW_H`);
});

test("Browse's sidebar children align and its search box clears", async (page) => {
  await switchTab(page, "browse");
  await page.waitForSelector("#browse-facet-list .browse-facet-link.is-sub", { timeout: 10000 });
  const xs = await page.$$eval("#browse-facet-list .browse-facet-link.is-sub .bf-label",
    (ls) => ls.map((l) => Math.round(l.getBoundingClientRect().left)));
  assertAtLeast(xs.length, 3, "too few child entries to compare");
  assertEq([...new Set(xs)].join(","), String(xs[0]), "child entries start at different x");

  const count = () => page.$eval("#browse-count", (e) => e.textContent);
  const clearShown = () => page.$eval("#browse-search-clear", (b) => b.checkVisibility());
  // An earlier test leaves a query in the box; start from an empty one.
  await page.$eval("#browse-search", (e) => { e.value = ""; e.dispatchEvent(new Event("input")); });
  await new Promise((r) => setTimeout(r, 400));   // past the 150ms debounce
  const all = await count();
  assertEq(await clearShown(), false, "the x shows on an empty box");
  await page.type("#browse-search", "crate");
  await page.waitForFunction((c) => document.querySelector("#browse-count").textContent !== c,
    { timeout: 5000 }, all);
  assert(await clearShown(), "no x in a non-empty search box");
  await page.click("#browse-search-clear");
  await page.waitForFunction((c) => document.querySelector("#browse-count").textContent === c,
    { timeout: 5000 }, all);
  assertEq(await page.$eval("#browse-search", (i) => i.value), "", "the x did not empty the box");
  assertEq(await clearShown(), false, "the x stays after clearing");
});

test("Zanil flanks the Luxury column, blurred, mirrored, behind the controls", async (page) => {
  await page.setViewport({ width: 1500, height: 1000 });
  try {
    await switchTab(page, "luxury");
    await page.waitForFunction(() => [...document.querySelectorAll("#zanil-host img")]
      .every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll("#zanil-host img").length === 2,
    { timeout: 10000 });
    const r = await page.evaluate(() => {
      const [left, right] = [...document.querySelectorAll("#zanil-host img")];
      const col = document.querySelector(".luxury-mask").getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const L = left.getBoundingClientRect(), R = right.getBoundingClientRect();
      const host = document.querySelector("#zanil-host");
      host.style.pointerEvents = "auto";
      const covered = [...document.querySelectorAll(".luxury-mask input, .luxury-mask button, .luxury-mask textarea, .luxury-mask select")]
        .filter((c) => c.checkVisibility()).filter((c) => {
          const b = c.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return top && top.closest("#zanil-host");
        }).length;
      const cards = [...document.querySelectorAll(".luxury-mask .lux-step")].map((c) => c.getBoundingClientRect());
      let under = 0;
      for (const [x, fig] of [[L.right - 5, L], [R.left + 5, R]]) {
        for (let y = fig.top + 20; y < fig.bottom - 20; y += 20) {
          if (!cards.some((c) => x > c.left && x < c.right && y > c.top && y < c.bottom)) continue;
          if (document.elementFromPoint(x, y)?.closest("#zanil-host")) under++;
        }
      }
      host.style.pointerEvents = "";
      return {
        heights: [L.height, R.height].map(Math.round),
        mirrored: getComputedStyle(right).transform !== "none" && getComputedStyle(left).transform === "none",
        blurred: [left, right].every((i) => /blur/.test(getComputedStyle(i).filter)),
        inside: L.left >= 0 && R.right <= vw,
        colCentred: Math.abs((col.left + col.right) / 2 - vw / 2) <= 1,
        covered, under,
      };
    });
    assert(r.heights.every((h) => h >= 500), `Zanil is not at least 500px tall: ${r.heights}`);
    assert(r.mirrored, "the right figure is not the mirrored copy");
    assert(r.blurred, "a figure is not blurred");
    assert(r.inside, "a figure runs off the window at 1500px");
    assert(r.colCentred, "the Luxury column moved off centre");
    assertEq(r.covered, 0, "a Luxury control sits under Zanil");
    assertEq(r.under, 0, "Zanil paints over a step card");
    const col = await page.$eval(".luxury-mask", (m) => m.getBoundingClientRect().toJSON());
    const [L, R] = await page.$$eval("#zanil-host img", (is) => is.map((i) => i.getBoundingClientRect().toJSON()));
    assert(L.right > col.left && L.right - col.left <= 60, `the left figure is not tucked behind the column: ${L.right - col.left}`);
    assert(col.right > R.left && col.right - R.left <= 60, `the right figure is not tucked behind the column: ${col.right - R.left}`);
  } finally {
    await page.setViewport({ width: 1400, height: 950 });
  }
});

test("clicking a Browse card keeps the other cards' icons", async (page) => {
  await switchTab(page, "browse");
  await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
  await page.evaluate(() => {
    window.__icons = [...document.querySelectorAll("#panel-browse .browse-card .browse-card-icon > *")];
  });
  await page.click("#panel-browse .browse-card:nth-child(2)");
  const same = await page.evaluate(() => {
    const now = [...document.querySelectorAll("#panel-browse .browse-card .browse-card-icon > *")];
    return now.length === window.__icons.length && now.every((n, i) => n === window.__icons[i]);
  });
  assertEq(same, true, "a click rebuilt the icons, which makes them flicker");
  await switchTab(page, "about");
  await switchTab(page, "browse");
  const reused = await page.evaluate(() => {
    const now = new Set(document.querySelectorAll("#panel-browse .browse-card .browse-card-icon > img"));
    return window.__icons.filter((n) => n.tagName === "IMG").some((n) => now.has(n));
  });
  assertEq(reused, true, "reopening Browse built every icon again");
});

test("Quick Edit shows only what a contributor should reach for", async (page) => {
  const labels = (scope) => page.$$eval(`${scope} .form-label`, (ls) => ls.map((l) => ({
    text: l.firstChild.textContent.trim(),
    tip: l.querySelector(".tip-bubble")?.firstChild?.textContent || "",
  })));
  const quick = async (type) => {
    const key = await page.evaluate((t) => window.__proto.sampleRecord(t)._key, type);
    await page.evaluate((k) => window.__proto.openQuickEdit(k), key);
    await page.waitForSelector(".modal-backdrop .form-label", { timeout: 10000 });
    const ls = await labels(".modal-backdrop");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".modal-backdrop"), { timeout: 5000 });
    return ls;
  };

  const drop = await quick("drop");
  const names = drop.map((l) => l.text);
  for (const gone of ["Flags", "Drop rarity", "Last seen"]) {
    assert(!names.includes(gone), `Quick Edit on a drop offers ${gone}: ${names.join(", ")}`);
  }
  assert(!names.some((n) => /goes to the game data/.test(n)), "a label still says it goes to the game data");
  const note = drop.find((l) => l.text === "Extra detail");
  assert(note, `no "Extra detail" in Quick Edit: ${names.join(", ")}`);
  assert(/shown in the game/.test(note.tip), `the note's help does not explain where it appears: ${note.tip}`);
  assertEq(drop.find((l) => l.text === "Price")?.tip, "Blank means no price.", "the price help");

  const lux = await quick("luxury");
  const seen = lux.find((l) => l.text === "Last seen");
  assert(seen, `Quick Edit on a Luxury record has no Last seen: ${lux.map((l) => l.text).join(", ")}`);
  assertEq(seen.tip, "Date this item was last offered (only relevant for Luxury furnishings)", "the Last seen help");

  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  await page.click("#panel-advanced tbody tr:not(.spacer) td:nth-child(3)");
  await page.waitForSelector("#panel-advanced .detail-pane .form-label", { timeout: 10000 });
  const batch = (await labels("#panel-advanced .detail-pane")).map((l) => l.text);
  for (const kept of ["Last seen", "Drop rarity"]) {
    assert(batch.includes(kept), `Batch edit no longer offers ${kept}: ${batch.join(", ")}`);
  }
  assert(!batch.includes("Flags"), "Batch edit still offers Flags");

  const zero = await page.evaluate(() => {
    const r = structuredClone(window.__proto.sampleRecord("drop"));
    r.cost = [{ currency: "GOLD", amount: 0 }];
    return window.__proto.validate(r).errors.map((e) => e.code);
  });
  assert(zero.includes("cost_amount_invalid"), `a price of 0 is accepted: ${zero}`);
});

test("Batch edit sizes id, price and version to their content", async (page) => {
  const measure = () => page.evaluate(() => {
    const ths = [...document.querySelectorAll("#scroller thead th")];
    const w = (i) => Math.round(ths[i].getBoundingClientRect().width);
    const ver = [...document.querySelectorAll("#table-body tr:not(.spacer) td:nth-child(7)")]
      .filter((td) => td.scrollWidth > td.clientWidth).map((td) => td.textContent);
    return { id: w(1), name: w(2), details: w(4), price: w(5), version: w(6),
      heads: ths.filter((t) => t.scrollWidth > t.clientWidth).map((t) => t.textContent.trim()), ver };
  });
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  try {
    await page.setViewport({ width: 1280, height: 900 });
    const small = await measure();
    await page.setViewport({ width: 1920, height: 1080 });
    const big = await measure();
    for (const [k, m] of [["1280", small], ["1920", big]]) {
      assertEq(m.heads.join(", "), "", `a header is cut off at ${k}px`);
      assertEq(m.ver.join(", "), "", `a version is cut off at ${k}px`);
    }
    for (const col of ["id", "price", "version"]) {
      assertEq(big[col], small[col], `the ${col} column grows with the window`);
    }
    assert(small.details >= 200, `Details is only ${small.details}px at 1280px`);
    assert(small.details > small.price, "Details is narrower than Price at 1280px");
  } finally {
    await page.setViewport({ width: 1400, height: 950 });
  }
});

test("an invalid price marks the price input in both editors", async (page) => {
  const zeroIn = async (scope) => {
    await page.$eval(`${scope} [data-field="cost.0.amount"]`, (i) => {
      i.value = "0";
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction((s) => document.querySelector(`${s} [data-field="cost.0.amount"]`)
      ?.closest(".form-row")?.classList.contains("is-invalid"), { timeout: 5000 }, scope)
      .catch(() => {});
    return page.$eval(`${scope} [data-field="cost.0.amount"]`, (i) => {
      const r = i.closest(".form-row");
      return { marked: r.classList.contains("is-invalid"),
        red: getComputedStyle(i).borderTopColor, message: r.querySelector(".field-error")?.textContent || "" };
    });
  };
  const red = await page.evaluate(() => {
    const p = document.createElement("p"); p.style.color = "var(--danger)"; document.body.append(p);
    const c = getComputedStyle(p).color; p.remove(); return c;
  });

  const key = await page.evaluate(() => window.__proto.sampleRecord("vendor")._key);
  await page.evaluate((k) => window.__proto.openQuickEdit(k), key);
  await page.waitForSelector('.modal-backdrop [data-field="cost.0.amount"]', { timeout: 10000 });
  const quick = await zeroIn(".modal-backdrop");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".modal-backdrop"), { timeout: 5000 });
  for (const [where, r] of [["Quick Edit", quick]]) {
    assert(r.marked, `${where}: the price row is not marked invalid`);
    assertEq(r.red, red, `${where}: the price input is not painted`);
    assert(/1 or more/.test(r.message), `${where}: no price message in the row: "${r.message}"`);
  }

  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced tbody tr:not(.spacer)", { timeout: 10000 });
  await page.click("#panel-advanced tbody tr:not(.spacer) td:nth-child(3)");
  await page.waitForSelector('#panel-advanced .detail-pane [data-field="cost.0.amount"]', { timeout: 10000 });
  const batch = await zeroIn("#panel-advanced .detail-pane");
  assert(batch.marked, "Batch edit: the price row is not marked invalid");
  assertEq(batch.red, red, "Batch edit: the price input is not painted");
  assert(/1 or more/.test(batch.message), `Batch edit: no price message in the row: "${batch.message}"`);
  // Leave the record as it was for the tests after this one.
  await page.$eval('#panel-advanced .detail-pane [data-field="cost.0.amount"]', (i) => {
    i.value = "100"; i.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

test("Luxury, Crown, Maintenance and About share one box width", async (page) => {
  await page.setViewport({ width: 1500, height: 950 });
  const box = (sel) => page.$eval(sel, (e) => Math.round(e.getBoundingClientRect().width));
  const widths = {};
  try {
    await switchTab(page, "luxury");
    widths.luxury = await box("#panel-luxury .lux-step");
    await switchTab(page, "crown-store");
    await page.click("#subtab-crown-store-add-prices");
    await page.waitForSelector(".cstore-controls", { visible: true, timeout: 10000 });
    widths.prices = await box(".cstore-controls");
    await page.click("#subtab-crown-store-crate-seasons");
    await page.waitForSelector(".crate-mask .lux-step", { visible: true, timeout: 10000 });
    widths.crates = await box(".crate-mask .lux-step");
    await switchTab(page, "maintenance");
    for (const s of ["check", "sources", "vocab"]) {
      await page.click(`#maint-tab-${s}`);
      await page.waitForSelector(`#maint-${s}:not([hidden])`, { timeout: 10000 });
      widths[s] = await box(`#maint-${s}`);
    }
    await switchTab(page, "about");
    widths.about = await box("#panel-about .about-box");
  } finally {
    await page.setViewport({ width: 1400, height: 950 });
  }
  const sizes = [...new Set(Object.values(widths))];
  assertEq(sizes.length, 1, `the boxes differ: ${JSON.stringify(widths)}`);
  const text = await page.$eval("#panel-about .about-box", (e) => e.textContent);
  assert(/How to contribute/.test(text), "About's text is not inside its box");
});

test("the Item name box shows the item's name and edits it", async (page) => {
  await switchTab(page, "advanced");
  await page.evaluate(() => {
    const c = document.querySelector("#filter-changed");
    if (c.checked) c.click();
  });
  const target = await page.evaluate(() => {
    const r = window.__proto.records().find((x) => x.id === 114327);
    return r && { key: r._key, id: r.id };
  });
  assert(target, "record 114327 is missing");
  await page.evaluate(() => {
    const s = document.querySelector("#search");
    s.value = "114327";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const row = () => page.evaluateHandle(() => [...document.querySelectorAll(
    "#panel-advanced tbody tr:not(.spacer)")].find((tr) => tr.cells[1]?.textContent === "114327"));
  await page.waitForFunction(() => [...document.querySelectorAll(
    "#panel-advanced tbody tr:not(.spacer)")].some((tr) => tr.cells[1]?.textContent === "114327"),
  { timeout: 10000 });
  const gameName = await (await row()).evaluate((tr) => tr.cells[2].textContent);
  assert(gameName && !/no name/.test(gameName), `114327 has no name to show: ${gameName}`);
  await (await row()).evaluate((tr) => tr.cells[2].click());

  const box = '#panel-advanced [data-field="name_overrides.en"]';
  await page.waitForSelector(box, { timeout: 10000 });
  const shown = await page.$eval(box, (i) => ({ value: i.value,
    label: document.querySelector(`label[for="${i.id}"]`)?.firstChild?.textContent }));
  assertEq(shown.label, "Item name", "the box is not labelled Item name");
  assertEq(shown.value, gameName, "the box does not show the item's name");

  const pending = () => page.$eval("#pending-count", (e) => e.textContent);
  const save = () => page.evaluate(() => [...document.querySelectorAll("#panel-advanced button")]
    .find((b) => /save to the change list/i.test(b.textContent)).click());
  const before = await pending();
  await save();
  assertEq(await pending(), before, "saving an untouched Item name made a change");

  const NEW = "Test Renamed Stool";
  await page.$eval(box, (i, v) => {
    i.value = v;
    i.dispatchEvent(new Event("input", { bubbles: true }));
  }, NEW);
  await save();
  await page.waitForFunction((v) => [...document.querySelectorAll(
    "#panel-advanced tbody tr:not(.spacer)")].some((tr) => tr.cells[2]?.textContent === v),
  { timeout: 5000 }, NEW).catch(() => {});
  assertEq(await (await row()).evaluate((tr) => tr.cells[2].textContent), NEW,
    "the table does not show the edited name");
  const mine = (await diffLines(page)).filter((l) => l.id === 114327);
  assertEq(mine.length, 1, `the rename exports ${mine.length} lines`);
  assertEq(JSON.stringify(mine[0].fields?.name_overrides ?? mine[0].record?.name_overrides),
    JSON.stringify({ en: NEW }), `the line does not carry the name: ${JSON.stringify(mine[0])}`);

  await page.$eval(box, (i, v) => {
    i.value = v;
    i.dispatchEvent(new Event("input", { bubbles: true }));
  }, gameName);
  await save();
  assertEq(await pending(), before, "restoring the game's name left a change behind");
  assertEq(await (await row()).evaluate((tr) => tr.cells[2].textContent), gameName,
    "the table did not go back to the game's name");
});

test("icons show loading until the map lands, then turn into the icon", async (page) => {
  let release;
  refDataGate = new Promise((res) => { release = res; });
  try {
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (/^furcat-(iconcache|refdata)-/.test(k)) localStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBoot(page);

    await page.evaluate(async () => {
      const m = await import("./external-links.js");
      const host = document.createElement("div");
      host.id = "t270";
      host.append(m.itemIconImg(114327, "known"), m.itemIconImg(50000, "uncovered"));
      document.body.append(host);
    });
    const loading = await page.$$eval("#t270 > *", (n) => n.map((e) =>
      e.classList.contains("ext-icon-loading")));
    assertEq(loading.join(","), "true,true", "a cell does not say it is loading");

    await switchTab(page, "browse");
    await page.$eval("#browse-search", (e) => {
      e.value = "114327";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForSelector("#panel-browse .browse-card .ext-icon-loading", { timeout: 10000 });

    release();
    await page.waitForFunction(() => {
      const [a, b] = document.querySelectorAll("#t270 > *");
      return a?.tagName === "IMG" && b && !b.classList.contains("ext-icon-loading");
    }, { timeout: 15000 });
    const [known, uncovered] = await page.$$eval("#t270 > *", (n) => n.map((e) =>
      ({ tag: e.tagName, src: e.getAttribute("src") || "", title: e.title || "" })));
    assert(known.src.includes("housing_alt_fur_stool002"), `the wrong icon arrived: ${known.src}`);
    assert(/no icon known/.test(uncovered.title), `the uncovered id reads "${uncovered.title}"`);
    await page.waitForFunction(() => {
      const img = document.querySelector("#panel-browse .browse-card img");
      return img && img.getAttribute("src").includes("housing_alt_fur_stool002");
    }, { timeout: 15000 });
    assertEq(await page.$$eval(".ext-icon-loading", (n) => n.length), 0,
      "a placeholder is still loading after the map arrived");
  } finally {
    refDataGate = null;
    release?.();
    await page.evaluate(() => document.querySelector("#t270")?.remove());
  }
});

test("findings mark their own field, follow the edit, and have no block", async (page) => {
  await switchTab(page, "advanced");
  await page.waitForSelector("#panel-advanced table tbody tr", { timeout: 20000 });
  await page.evaluate(() => {
    [...document.querySelectorAll("#panel-advanced button")]
      .find((b) => /add new/i.test(b.textContent)).click();
  });
  await page.waitForSelector("#adv-id", { timeout: 10000 });

  const shape = () => page.evaluate(() => {
    const pathOf = (el) => el.querySelector("[data-findings]")?.getAttribute("data-findings");
    return {
      marked: [...document.querySelectorAll("#panel-advanced .form-row.is-invalid")]
        .map(pathOf).sort(),
      messaged: [...document.querySelectorAll("#panel-advanced .form-row .field-error")]
        .map((p) => p.closest("[data-findings]")?.getAttribute("data-findings")).sort(),
      block: document.querySelectorAll(
        "#panel-advanced .detail-validation, #panel-advanced .v-list").length,
    };
  });

  const before = await shape();
  assertAtLeast(before.marked.length, 2, "a new record marks fewer than two rows");
  assertEq(before.marked.join(","), before.messaged.join(","),
    "a row states an error without marking itself, or marks itself without saying why");
  assert(before.marked.includes("id"), `the id row is not marked: [${before.marked}]`);
  assertEq(before.block, 0, "the summary block under the form is still there");

  await page.click("#adv-id");
  await page.type("#adv-id", "999000001");
  await page.waitForFunction(
    () => !document.querySelector("#adv-id")?.closest(".form-row")?.classList.contains("is-invalid"),
    { timeout: 5000 },
  );
  assertEq(await page.evaluate(() => document.activeElement?.id), "adv-id",
    "the form was rebuilt under the contributor: focus left the input");
  const fixed = await shape();
  assert(!fixed.marked.includes("id"), `the id row is still marked: [${fixed.marked}]`);
  assertEq(fixed.marked.join(","), fixed.messaged.join(","),
    "a mark and its message parted company mid-edit");

  await page.evaluate(() => {
    const i = document.querySelector("#adv-id");
    i.value = "";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#adv-id")?.closest(".form-row")?.classList.contains("is-invalid"),
    { timeout: 5000 },
  );

  const multi = await page.evaluate(() => {
    const perCat = new Map(), perId = new Map();
    for (const r of window.__proto.records()) {
      const k = `${r._category}|${r.id}`;
      perCat.set(k, (perCat.get(k) || 0) + 1);
      perId.set(r.id, (perId.get(r.id) || 0) + 1);
    }
    for (const [k, n] of perCat) {
      const id = Number(k.split("|")[1]);
      if (n > 1 && perId.get(id) === n) return id;
    }
    return null;
  });
  assert(multi, "no item in the data set has two records in one category");
  await page.evaluate((id) => {
    const s = document.querySelector("#search");
    s.value = id;
    s.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(multi));
  await page.waitForFunction(
    (want) => {
      const tr = document.querySelector("#panel-advanced table tbody tr");
      return tr && tr.textContent.includes(want);
    },
    { timeout: 10000 }, String(multi),
  );
  await page.click("#panel-advanced table tbody tr");
  await page.waitForSelector("#adv-id", { timeout: 10000 });
  const idRow = await page.$eval('#panel-advanced [data-findings="id"]', (h) => h.textContent);
  assert(/other records here/.test(idRow),
    `the duplicate warning did not reach the id row: "${idRow}"`);
});

test("a crate season is added and filled in one place, with no paste and no price", async (page) => {
  await switchTab(page, "crown-store");
  await page.click("#subtab-crown-store-crate-seasons");
  await page.waitForSelector("#crate-item", { timeout: 10000 });

  assertEq(await page.$("#crate-paste"), null, "the crate screen still expects a paste");
  const headers = await page.$$eval("#panel-crown-store .lux-preview th",
    (n) => n.map((e) => e.textContent.trim().toLowerCase()));
  assert(!headers.some((h) => /price|cost/.test(h)),
    `the item list still has a price column: ${headers.join(", ")}`);

  const CRATE_NAME = "Test Hunt";
  const SYMBOL = "TEST_HUNT";
  const before = await page.evaluate(
    () => window.__proto.enums.crates.map((c) => c.symbol || c));
  assert(!before.includes(SYMBOL), "the test crate already exists in the data");
  await page.click("#crate-new-open");
  await page.waitForSelector("#crate-new-name", { timeout: 5000 });
  await page.type("#crate-new-name", CRATE_NAME);
  // An old season on purpose: a dateless crate sorts to the top of the picker, so without one this would pass even if adding the crate did not select it.
  await page.type("#crate-new-season", "2020-01");
  const shown = await page.$eval("#crate-new-symbol", (e) => e.textContent);
  assert(shown.includes(SYMBOL), `the code word is not shown before adding: "${shown}"`);
  const prefilled = await page.$eval("#crate-new-id", (e) => e.value);
  assert(Number(prefilled) > 0, `the crown crate id was not prefilled: "${prefilled}"`);
  await page.click("#crate-new-add");
  await page.waitForFunction(
    (sym) => document.querySelector("#crate-crate")?.value === sym,
    { timeout: 10000 }, SYMBOL,
  );
  const known = await page.evaluate(
    () => window.__proto.enums.crates.map((c) => c.symbol || c));
  assert(known.includes(SYMBOL), "the new crate never reached the live vocabulary");

  const ids = await page.evaluate(() => {
    const have = new Set(window.__proto.records().map((r) => r.id));
    const out = [];
    for (let id = 9910001; out.length < 2; id++) if (!have.has(id)) out.push(id);
    return out;
  });
  for (const id of ids) {
    await page.click("#crate-item");
    await page.type("#crate-item", String(id));
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (want) => document.querySelectorAll("#crate-preview-body tr").length === want,
      { timeout: 10000 }, ids.indexOf(id) + 1,
    );
  }
  const emptied = await page.$eval("#crate-item", (e) => e.value);
  assertEq(emptied, "", "the item box keeps the last item instead of taking the next");

  await page.click("#crate-commit");
  await page.waitForFunction(
    () => /Added to the change list: [1-9]/.test(
      document.querySelector("#crate-commit-status")?.textContent || ""),
    { timeout: 10000 },
  );
  const made = await page.evaluate((wanted) => window.__proto.records()
    .filter((r) => wanted.includes(r.id))
    .map((r) => ({ id: r.id, crate: r.source?.crate, costs: (r.cost || []).length })), ids);
  assertEq(made.length, 2, "the items did not reach the records");
  for (const r of made) {
    assertEq(r.crate, SYMBOL, `id ${r.id} was not filed under the new crate`);
    assertEq(r.costs, 0, `id ${r.id} carries a price a crate item cannot have`);
  }

  const lines = await diffLines(page);
  const enumLine = lines.find((l) => l.op === "add-enum" && l.value === SYMBOL);
  assert(enumLine, "the new crate is not in the submission");
  assertEq(enumLine.enum, "crates", `the crate was queued as ${enumLine.enum}`);
  assertEq(enumLine.meta?.name, CRATE_NAME, "the crate's name did not ride along");
  assertEq(enumLine.meta?.season, "2020-01", "the season did not ride along");
});

test("crate seasons: an item is found by name and picked from the matches", async (page) => {
  await switchTab(page, "crown-store");
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((b) => /crate seasons/i.test(b.textContent))?.click());
  await page.waitForSelector("#crate-item", { timeout: 10000 });
  await page.click("#crate-clear");
  await page.click("#crate-item");
  await page.type("#crate-item", "Khajiit Stool");
  await page.waitForSelector("#crate-matches li", { timeout: 5000 });
  const first = await page.$eval("#crate-matches li .cstore-match-id", (e) => e.textContent);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("#crate-preview-body tr").length >= 1,
    { timeout: 5000 });
  const row = await page.$eval("#crate-preview-body tr", (tr) => tr.textContent);
  assert(row.includes(first.replace("#", "")), `the picked match ${first} is not the listed row: ${row}`);
  assertEq(await page.$$eval("#crate-matches li", (l) => l.length), 0, "the matches stay open");
  await page.click("#crate-clear");
});

test("a record added and then edited exports one add line with the edit", async (page) => {
  const NEW_ID = 9900101;
  await switchTab(page, "advanced");
  await page.evaluate(() => {
    [...document.querySelectorAll("#panel-advanced button")]
      .find((b) => /add new/i.test(b.textContent)).click();
  });
  await page.waitForSelector("#adv-id", { timeout: 10000 });
  await page.click("#adv-id");
  await page.type("#adv-id", String(NEW_ID));
  await page.select('#panel-advanced [name="source.type"]', "drop");
  await page.waitForFunction(
    () => window.__proto.editing()?.source?.type === "drop", { timeout: 5000 });

  const save = async () => {
    await page.$$eval("#panel-advanced .form-actions button", (bs) => {
      const b = bs.find((x) => /save to the change list/i.test(x.textContent));
      if (b) b.click();
    });
  };
  await save();
  await page.waitForFunction(
    (id) => window.__proto.records().some((r) => r.id === id), { timeout: 10000 }, NEW_ID);

  const other = await page.evaluate(() => {
    const sel = document.querySelector('#panel-advanced [name="availability.version"]');
    const opts = [...sel.options].map((o) => o.value).filter((v) => v && v !== sel.value);
    return opts[0];
  });
  assert(other, "only one game update to choose from");
  await page.select('#panel-advanced [name="availability.version"]', other);
  await save();

  const mine = (await diffLines(page)).filter((l) => l.id === NEW_ID);
  assertEq(mine.length, 1, `the record exports ${mine.length} lines, not one`);
  assertEq(mine[0].op, "add",
    `an edited add exports an ${mine[0].op} line, addressed to a record the file has never had`);
  assertEq(mine[0].record?.availability?.version, other,
    "the add line does not carry the edit");
});

const DUMP_IDS = [9900001, 9900002];

test("an in-game dump pastes with no source question, and arrives Unconfirmed", async (page) => {
  await switchTab(page, "advanced");
  assertEq(await page.$("#adv-import-category"), null,
    "the paste panel still asks which source a dump comes from");

  const dump = DUMP_IDS
    .map((id) => `\t[${id}] = {\t\t-- Test Dump Item ${id}\n\t\titemPrice = 1234,\n\t},`)
    .join("\n");
  await page.evaluate((text) => {
    document.querySelector("#btn-add-dump").click();
    document.querySelector("#adv-import-paste").value = text;
  }, dump);
  await page.click("#adv-import-run");
  await page.waitForFunction(
    () => (document.querySelector("#adv-import-status")?.textContent || "").length > 0,
    { timeout: 10000 },
  );
  const status = await page.$eval("#adv-import-status", (e) => e.textContent);

  const rows = await page.evaluate((ids) => window.__proto.records()
    .filter((r) => ids.includes(r.id))
    .map((r) => ({ id: r.id, type: r.source?.type, keys: Object.keys(r.source || {}),
                   costs: (r.cost || []).length, cat: r._category,
                   version: r.availability?.version })), DUMP_IDS);
  assertEq(rows.length, DUMP_IDS.length, `the dump did not land: "${status}"`);
  for (const r of rows) {
    assertEq(r.type, "rumour", `id ${r.id} arrived with a source the dump cannot know`);
    assertEq(r.keys.join(","), "type", `id ${r.id} carries source detail it cannot have`);
    assertEq(r.costs, 0, `id ${r.id} kept a price it has no source for`);
    assertEq(r.cat, "rumour", `id ${r.id} was filed under ${r.cat}`);
    assert(r.version && r.version !== "NONE",
      `id ${r.id} has no patch: a dump is taken in one`);
  }
  assert(/price/i.test(status), `the prices left out are not reported: "${status}"`);
});

test("several ticked rows take one source in a single edit", async (page) => {
  await page.evaluate(() => {
    const s = document.querySelector("#search");
    s.value = "990000";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#panel-advanced tbody tr:not(.spacer)").length === 2,
    { timeout: 10000 },
  );

  await page.click("#tick-all");
  await page.waitForSelector("#multi-apply", { timeout: 10000 });
  const count = await page.$eval("#multi-count", (e) => e.textContent);
  assertEq(count, "2 records ticked", `the batch panel miscounts: "${count}"`);
  const fields = await page.$$eval("#panel-advanced .edit-form [data-field]",
    (n) => n.map((e) => e.getAttribute("data-field")));
  const BATCH = ["cost.0.amount", "cost.0.currency", "availability.version", "notes"];
  assert(fields.every((f) => f.startsWith("source.") || BATCH.includes(f)),
    `the batch form offers a per-record field: ${fields.join(", ")}`);

  await page.select('#panel-advanced [name="source.type"]', "drop");
  await page.click("#multi-apply");
  await page.waitForFunction(
    () => (document.querySelector("#multi-message")?.textContent || "").length > 0,
    { timeout: 10000 },
  );
  const msg = await page.$eval("#multi-message", (e) => e.textContent);

  const after = await page.evaluate((ids) => window.__proto.records()
    .filter((r) => ids.includes(r.id))
    .map((r) => ({ id: r.id, type: r.source?.type, cat: r._category })), DUMP_IDS);
  assertEq(after.length, DUMP_IDS.length, "a record vanished");
  for (const r of after) {
    assertEq(r.type, "drop", `id ${r.id} did not take the source: "${msg}"`);
    assertEq(r.cat, "drop", `id ${r.id} was not re-filed: "${msg}"`);
  }
  assert(/2 changes/.test(msg), `the batch edit does not say what it did: "${msg}"`);

  const lines = await diffLines(page);
  for (const id of DUMP_IDS) {
    const mine = lines.filter((l) => l.id === id);
    assertEq(mine.length, 1, `id ${id} exports ${mine.length} lines, not one`);
    assertEq(mine[0].op, "add", `id ${id} exports an ${mine[0].op} line for a record the file has never had`);
    assertEq(mine[0].record?.source?.type, "drop",
      `id ${id} exports a line that does not carry the source just set`);
    assertEq(mine[0].category, "drop", `id ${id} is addressed to ${mine[0].category}`);
  }

  await page.$$eval("#panel-advanced .form-actions button", (bs) => {
    const b = bs.find((x) => /untick/i.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForFunction(() => !document.querySelector("#multi-apply"),
    { timeout: 5000 });
  const ticksLeft = await page.$$eval("#panel-advanced tbody .cell-tick input",
    (n) => n.filter((x) => x.checked).length);
  assertEq(ticksLeft, 0, "a row stayed ticked after Untick them");
});

test("a batch edit writes only the field that was changed", async (page) => {
  await switchTab(page, "advanced");
  const pair = await page.evaluate(() => {
    const by = new Map();
    for (const r of window.__proto.records()) {
      if (!Number.isInteger(r.id) || r.blueprint != null) continue;
      if (Object.keys(r.source || {}).length < 2 || (r.cost || []).length !== 1) continue;
      const k = JSON.stringify(r.source);
      const seen = by.get(k);
      const other = seen?.find((s) => s.availability?.version !== r.availability?.version
        && s.id !== r.id);
      if (other) return [other, r].map((x) => ({ key: x._key, id: x.id,
        version: x.availability.version, source: x.source, cost: x.cost }));
      by.set(k, [...(seen || []), r]);
    }
    return null;
  });
  assert(pair, "no two records share a source and differ in game update");
  const [a, b] = pair;
  // An earlier import leaves "Changed only" on, these rows are unchanged.
  await page.evaluate(() => {
    const c = document.querySelector("#filter-changed");
    if (c.checked) c.click();
  });

  const tickById = async (id) => {
    await page.evaluate((q) => {
      const s = document.querySelector("#search");
      s.value = q;
      s.dispatchEvent(new Event("input", { bubbles: true }));
    }, String(id));
    await page.waitForFunction((q) => [...document.querySelectorAll(
      "#panel-advanced tbody tr:not(.spacer)")].some((tr) => tr.cells[1]?.textContent === q),
    { timeout: 10000 }, String(id));
    await page.evaluate((q) => {
      const tr = [...document.querySelectorAll("#panel-advanced tbody tr:not(.spacer)")]
        .find((x) => x.cells[1]?.textContent === q);
      tr.querySelector(".cell-tick input").click();
    }, String(id));
  };

  await tickById(a.id);
  await page.waitForFunction((id) => window.__proto.editing()?.id === id,
    { timeout: 5000 }, a.id);
  assertEq(await page.$("#multi-apply"), null, "one ticked row opened the batch panel");

  await tickById(b.id);
  await page.waitForSelector("#multi-apply", { timeout: 5000 });
  const shown = await page.evaluate(() => {
    const q = (n) => document.querySelector(`#panel-advanced [name="${n}"]`);
    const ver = q("availability.version");
    return {
      type: q("source.type")?.value,
      version: ver?.selectedOptions[0]?.textContent,
      price: document.querySelector('#panel-advanced [data-field="cost.0.amount"]')?.value,
      sourceFields: [...document.querySelectorAll('#panel-advanced .edit-form [data-field^="source."]')]
        .map((e) => [e.getAttribute("data-field"), e.value]),
    };
  });
  assertEq(shown.type, a.source.type, "the shared source type is not preselected");
  assertEq(shown.version, "(mixed - leave unchanged)",
    "a game update the records disagree on is not shown as mixed");
  assertEq(shown.price, JSON.stringify(a.cost) === JSON.stringify(b.cost) ? String(a.cost[0].amount) : "",
    "the price box does not show what the records share");
  for (const [f, v] of shown.sourceFields) {
    const want = a.source[f.slice("source.".length)];
    if (typeof want === "string" || typeof want === "number") {
      assertEq(v, String(want), `${f} does not show the value both records share`);
    }
  }

  const PRICE = 424242;
  await page.$eval('#panel-advanced [data-field="cost.0.amount"]', (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, PRICE);
  await page.click("#multi-apply");
  await page.waitForFunction(
    () => (document.querySelector("#multi-message")?.textContent || "").length > 0,
    { timeout: 10000 });
  const msg = await page.$eval("#multi-message", (e) => e.textContent);

  const after = await page.evaluate((keys) => window.__proto.records()
    .filter((r) => keys.includes(r._key))
    .map((r) => ({ key: r._key, version: r.availability?.version, source: r.source,
      cost: r.cost })), [a.key, b.key]);
  for (const was of [a, b]) {
    const now = after.find((r) => r.key === was.key);
    assertEq(now.version, was.version, `id ${was.id} lost its game update: "${msg}"`);
    assertEq(JSON.stringify(now.source), JSON.stringify(was.source),
      `id ${was.id} had its source rewritten`);
    assertEq(now.cost[0]?.amount, PRICE, `id ${was.id} did not take the price: "${msg}"`);
  }

  await page.$$eval("#panel-advanced .form-actions button", (bs) => {
    bs.find((x) => /untick/i.test(x.textContent))?.click();
  });
  await page.evaluate(() => {
    const s = document.querySelector("#search");
    s.value = "";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

test("the send screen's Edit changes opens Batch edit on the changed rows", async (page) => {
  await page.click("#btn-submit");
  await page.waitForSelector("#modal.open", { timeout: 10000 });
  const header = await page.$$eval("#modal-changelist th", (ths) => ths.map((t) => t.textContent.trim()));
  assertEq(header[header.length - 1], "Check", "the marker column has no header");
  const markers = await page.$$eval("#modal-changelist .chg-marker", (ms) => ms.map((m) => [m.textContent, m.title]));
  assert(!markers.some(([t]) => t === "10x"), "the cryptic 10x marker is back");
  assert(markers.every(([, tip]) => tip), `a marker has no explanation: ${JSON.stringify(markers)}`);
  const small = await page.evaluate(() => ({
    href: document.querySelector("#modal-open-issue").getAttribute("href") || "",
    shown: !document.querySelector("#modal-oversize").hidden,
  }));
  assert(small.href.includes("/issues/new?") && small.href.includes("body="), "a small submission is not a one-click issue");
  assertEq(small.shown, false, "a small submission shows the two-step guide");
  const danger = await page.$eval("#modal-discard", (b) => b.classList.contains("btn-danger"));
  assertEq(danger, true, "Start over is not a red button");
  await page.click("#modal-edit-changes");
  const state = await page.evaluate(() => ({
    modalOpen: document.querySelector("#modal").classList.contains("open"),
    batchShown: !document.querySelector("#panel-advanced")?.hidden,
    changedOnly: document.querySelector("#filter-changed").checked,
    rows: document.querySelectorAll("#panel-advanced tbody tr:not(.spacer)").length,
  }));
  assertEq(state.modalOpen, false, "the send screen stayed open");
  assertEq(state.batchShown, true, "Batch edit did not open");
  assertEq(state.changedOnly, true, "Changed only is off");
  assert(state.rows > 0, "Changed only shows no rows although changes are pending");
});

test("Batch edit remembers whether Add a detail was open", async (page) => {
  await switchTab(page, "advanced");
  const open = async () => {
    await page.click("#panel-advanced tbody tr:not(.spacer) td:nth-child(3)");
    await page.waitForSelector("#panel-advanced details.add-detail", { timeout: 10000 });
    return page.$eval("#panel-advanced details.add-detail", (d) => d.open);
  };
  const before = await open();
  await page.$eval("#panel-advanced details.add-detail > summary", (s) => s.click());
  await page.waitForFunction((was) => document.querySelector("#panel-advanced details.add-detail").open !== was, {}, before);
  await switchTab(page, "browse");
  await switchTab(page, "advanced");
  assertEq(await open(), !before, "the expander forgot its state");
  await page.$eval("#panel-advanced details.add-detail > summary", (s) => s.click());
});

test("the send screen discards the session's changes, after asking", async (page) => {
  const pending = await page.$eval("#pending-count", (e) => e.textContent);
  assert(/[1-9]/.test(pending),
    `nothing is buffered, so there is nothing to discard: "${pending}"`);
  await page.click("#btn-submit");
  await page.waitForSelector("#modal.open", { timeout: 10000 });

  await page.click("#modal-discard");
  const asked = await page.evaluate(() => {
    const ask = document.querySelector("#modal-discard-ask");
    return { shown: ask?.offsetParent !== null,
             question: document.querySelector("#modal-discard-question")?.textContent || "" };
  });
  assertEq(asked.shown, true, "the discard control asks nothing before discarding");
  assert(/discard all .* change/i.test(asked.question),
    `the question does not say what would go: "${asked.question}"`);

  await page.click("#modal-discard-no");
  const kept = await page.$eval("#pending-count", (e) => e.textContent);
  assertEq(kept, pending, "answering 'Keep them' dropped the changes anyway");

  await page.click("#modal-discard");
  await page.click("#modal-discard-yes");
  const deadline = Date.now() + 30000;
  let after = "";
  while (Date.now() < deadline) {
    after = await page.$eval("#pending-count", (e) => e.textContent).catch(() => "");
    if (after === "Nothing to send yet.") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await waitForBoot(page);
  assertEq(after, "Nothing to send yet.", "the discard left changes behind");
  const sendHidden = await page.$eval("#btn-submit", (b) => b.hidden);
  assertEq(sendHidden, true, "the send button outlived the changes it sends");
});

// Driver

// LAST, deliberately: this one RELOADS the page, and a reload empties the change buffer that the tests above build up between them
test("recipes: a crafted record shows the item it makes, and its icon", async (page) => {
  const manifestURL = "/reference-data/manifest.json";
  const recipesURL = "/reference-data/recipes.json";
  const shipped = JSON.parse(
    await fs.readFile(path.join(ROOT, "reference-data/manifest.json"), "utf8"));

  const { blueprint, made } = await page.evaluate(() => {
    const recipe = window.__proto.records().find(
      (r) => r.source?.type === "recipe" && r.id && r.blueprint);
    return { blueprint: recipe.blueprint, made: recipe.id };
  });

  const manifest = JSON.parse(JSON.stringify(shipped));
  manifest.datasets.recipes = {
    record_format: "furniture-recipes-v1", file: "recipes.json", count: 1,
  };
  overrides.set(manifestURL, JSON.stringify(manifest));
  overrides.set(recipesURL, JSON.stringify({ [String(blueprint)]: made }));
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBoot(page);
    await page.waitForFunction(
      () => window.__proto.refData().state === "ready", { timeout: 15000 });

    const resolved = await page.evaluate(async (ids) => {
      const f = window.__proto.refData();
      for (let i = 0; i < 60 && f.resultOf(ids.blueprint) === null; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      for (let i = 0; i < 60 && !f.iconPath(ids.made); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        made: f.resultOf(ids.blueprint),
        viaRecipe: f.iconPath(ids.blueprint),
        ofItem: f.iconPath(ids.made),
        metaName: f.meta(ids.blueprint)?.name ?? null,
        itemName: f.meta(ids.made)?.name ?? null,
      };
    }, { blueprint, made });
    assertEq(resolved.made, made, "the blueprint does not resolve to its item");
    assert(resolved.ofItem, "the furnishing resolves no icon");
    assertEq(resolved.metaName, resolved.itemName,
      "a blueprint's metadata is not the metadata of the item it makes");

    await switchTab(page, "browse");
    await page.waitForSelector("#panel-browse .browse-card", { timeout: 15000 });
    await page.$eval("#browse-search", (e, id) => {
      e.value = String(id);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, blueprint);
    await page.waitForFunction(
      (id) => {
        const c = document.querySelector("#panel-browse .browse-card");
        return c && c.textContent.includes(`#${id}`);
      },
      { timeout: 10000 }, made,
    );
    const card = await page.$eval("#panel-browse .browse-card",
      (c) => c.textContent.replace(/\s+/g, " "));
    assert(card.includes(`#${made}`), `the card does not name the item: ${card}`);
    const src = await page.$eval("#panel-browse .browse-card img",
      (i) => i.getAttribute("src") || "");
    assert(src.includes(resolved.ofItem),
      `the card does not show the furnishing's icon: ${src} vs ${resolved.ofItem}`);
    assert(card.includes(`from recipe #${blueprint}`),
      `the card does not name the recipe it came from: ${card}`);

    await page.$eval("#browse-search", (e, id) => {
      e.value = String(id);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, made);
    await page.waitForFunction(
      (id) => [...document.querySelectorAll("#panel-browse .browse-card")]
        .some((c) => c.textContent.includes(`from recipe #${id}`)),
      { timeout: 10000 }, blueprint,
    );
  } finally {
    overrides.delete(manifestURL);
    overrides.delete(recipesURL);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBoot(page);
  }
});



test("discovery: metadata and recipe links survive paste and review", async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await switchTab(page, "advanced");
  const dump = { format: "furniture-discovery-v1", locale: "en", apiVersion: 101051,
    record: { id: 9900081, blueprint: 9900082 },
    meta: { id: 9900081, name: 'Discovered Chair "new"', quality: 3, cat: 4, sub: 5,
      theme: 6, icon: "/esoui/art/icons/chair.dds" } };
  await page.evaluate((text) => {
    document.querySelector("#btn-add-dump").click();
    document.querySelector("#adv-import-paste").value = text;
  }, JSON.stringify(dump));
  await page.click("#adv-import-run");
  assert((await page.$eval("#adv-import-status", (e) => e.textContent)).includes("1 added"),
    "discovery was not added");
  const line = (await diffLines(page)).find((l) => l.id === dump.record.id);
  assertEq(line.record.blueprint, dump.record.blueprint, "blueprint was lost");
  assertEq(line.reference.meta.name, dump.meta.name, "name was lost");
  assertEq(line.reference.apiVersion, dump.apiVersion, "API evidence was lost");
  assertEq(line.record.meta, undefined, "metadata leaked into canonical source data");
  const meta = await page.evaluate((id) => window.__proto.refData().meta(id), dump.record.blueprint);
  assertEq(meta.icon, dump.meta.icon, "reference overlay did not resolve blueprint metadata");
  await page.click("#adv-import-run");
  assert((await page.$eval("#adv-import-status", (e) => e.textContent)).includes("1 already catalogued"),
    "repeat discovery was not skipped");
});

test("discovery: ignored items and recipes never enter the change buffer", async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await switchTab(page, "advanced");
  const dump = { format: "furniture-discovery-v1", locale: "en", apiVersion: 101051,
    record: { id: 191611, blueprint: 9900092 },
    meta: { id: 191611, name: "Ignored station", quality: 3, cat: 4, sub: 5,
      theme: 6, icon: "/esoui/art/icons/chair.dds" } };
  const regular = { id: 191611, source: { type: "rumour" }, cost: [], availability: { version: "NONE" } };
  await page.evaluate((text) => {
    document.querySelector("#btn-add-dump").click();
    document.querySelector("#adv-import-paste").value = text;
  }, [JSON.stringify(dump), JSON.stringify(regular)].join("\n"));
  await page.click("#adv-import-run");
  const status = await page.$eval("#adv-import-status", (e) => e.textContent);
  assert(status.includes("0 added") && status.includes("2 ignored (skipped)"), status);
  assert(await page.$eval("#btn-submit", (e) => e.hidden && e.disabled), "ignored items reached the change buffer");
});

test("discovery: ignored catalogue entries are searchable and can be restored", async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await switchTab(page, "browse");
  await page.waitForSelector("#browse-search");
  await page.$eval("#browse-search", (e) => {
    e.value = "191611";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector(".browse-card")?.textContent.includes("191611"));
  const card = await page.$eval(".browse-card", (e) => e.textContent);
  assert(card.includes("Jewelry Station (Old Growth Brewer)"), card);
  await page.evaluate(() => document.querySelector(".browse-card").click());
  await page.waitForFunction(() => document.querySelector("#panel-browse")?.textContent.includes("does not track this item on purpose"));
  await page.evaluate(() => document.querySelector(".browse-batch-edit").click());
  await page.waitForSelector('#detail [name="source.type"]');
  await page.select('#detail [name="source.type"]', "rumour");
  await page.click('#detail .form-actions .btn-primary');
  const lines = await diffLines(page);
  assertEq(lines.length, 2, "restoring an ignored record must move it between files");
  assertEq(lines[0].category, "ignored", "removal must target ignored.jsonl");
  assertEq(lines[0].op, "delete", "old exclusion must be removed");
  assertEq(lines[1].record.source.type, "rumour", "restored source did not reach review");

});

test("ignored source: batch ignore and restore preserve notes and export source moves", async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await switchTab(page, "advanced");
  await page.select("#filter-type", "rumour");
  await page.waitForSelector('#panel-advanced tbody .cell-tick input');
  const ids = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#panel-advanced tbody .cell-tick input')].slice(0, 2);
    const ids = boxes.map((b) => Number(b.closest("tr").children[1].textContent));
    for (const id of ids) {
      const row = [...document.querySelectorAll("#panel-advanced tbody tr")].find((r) => Number(r.children[1]?.textContent) === id);
      row.querySelector(".cell-tick input").click();
    }
    return ids;
  });
  await page.waitForSelector("#multi-apply");
  await page.select('#detail [name="source.type"]', "ignored");
  await page.$eval('#detail [data-field="notes"]', (e) => {
    e.value = "Old item IDs; replaced by newer entries";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#multi-apply");
  let lines = await diffLines(page);
  for (const id of ids) {
    const mine = lines.filter((l) => l.id === id);
    assertEq(mine.length, 2, `missing source move for ${id}`);
    assertEq(mine[0].category, "rumour", "old source file is wrong");
    assertEq(mine[1].category, "ignored", "new source file is wrong");
    assertEq(mine[1].record.notes, "Old item IDs; replaced by newer entries", "batch note lost");
    assertEq(JSON.stringify(mine[1].record.source), JSON.stringify({type:"ignored"}), "acquisition details survived ignoring");
  }
  await page.select('#detail [name="source.type"]', "rumour");
  await page.click("#multi-apply");
  lines = await diffLines(page);
  for (const id of ids) {
    const mine = lines.filter((l) => l.id === id);
    assertEq(mine.length, 1, "restoring the original source should collapse the move");
    assertEq(mine[0].op, "update", "only the data note should remain changed");
    assertEq(mine[0].category, "rumour", "re-edit lost original category");
    assertEq(mine[0].fields.notes, "Old item IDs; replaced by newer entries", "restoring lost the note");
  }
});

test("dump import: button, display order and unlimited manual submissions", async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await switchTab(page, "advanced");
  const order = await page.$$eval("#filter-type option", (els) => els.map((e) => e.value));
  assertEq(order.slice(-2).join(","), "rumour,ignored", "fallback sources are not last");
  assertEq(await page.$eval("#adv-import", (e) => e.hidden), true, "paste panel starts open");
  await page.click("#btn-add-dump");
  assertEq(await page.$eval("#btn-add-dump", (e) => e.getAttribute("aria-expanded")), "true", "button did not open paste");
  assertEq(await page.$(".adv-import-format"), null, "JSONL spoiler remains");
  const records = Array.from({length: 120}, (_, i) => ({id: 9900500 + i,
    source: {type: "rumour"}, cost: [], availability: {version: "NONE"}}));
  await page.$eval("#adv-import-paste", (e, text) => { e.value = text; }, records.map(JSON.stringify).join("\n"));
  await page.click("#adv-import-run");
  assert((await page.$eval("#adv-import-status", (e) => e.textContent)).includes("120 added"), "large import was limited");
  const lines = await diffLines(page);
  assertEq(lines.length, 120, "large submission lost records");
  await page.click("#btn-submit");
  const panel = () => page.evaluate(() => ({
    validation: document.querySelector("#modal-validation").textContent,
    href: document.querySelector("#modal-open-issue").getAttribute("href"),
    send: document.querySelector("#modal-open-issue").textContent,
    shown: !document.querySelector("#modal-oversize").hidden,
    steps: [...document.querySelectorAll("#modal-oversize li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    blank: document.querySelector("#modal-oversize-open").getAttribute("href"),
    focused: document.activeElement?.id,
  }));
  let review = await panel();
  assert(!review.validation.includes("cannot be sent"), review.validation);
  assertEq(review.href, null, "large submission still links an oversized URL");
  assertEq(review.send, "Send using GitHub", "the send button changed its name");
  assertEq(review.shown, false, "the two-step guide shows before Send is clicked");
  await page.click("#modal-open-issue");
  review = await panel();
  assertEq(review.shown, true, "clicking Send on a large submission explains nothing");
  assert(/^1?\s*Copy to clipboard/.test(review.steps[0]) && /Open blank issue.*paste/i.test(review.steps[1]),
    `the steps do not read copy, then open and paste: ${JSON.stringify(review.steps)}`);
  assertEq(review.focused, "modal-oversize-copy", "step 1 is not focused");
  const blank = new URL(review.blank);
  assertEq(blank.origin + blank.pathname, "https://github.com/wookiefriseur/LFC/issues/new", "the blank issue goes elsewhere");
  assertEq(blank.searchParams.get("labels"), "db-edit", "the blank issue lost its label");
  assert(blank.searchParams.get("title")?.startsWith("DB update"), "the blank issue lost its title");
  assertEq(blank.searchParams.get("body"), null, "the blank issue carries a body again");
  await page.click("#modal-close");
});

async function main() {
  const { server, port } = await serve(ROOT);
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: !HEADFUL,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`);
  });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
      // A test can hold the icon map back to see the page before it arrives.
      if (refDataGate && u.pathname.includes("/reference-data/")) {
        refDataGate.then(() => r.continue().catch(() => {}));
        return;
      }
      r.continue().catch(() => {});
      return;
    }
    if (r.resourceType() === "image") {
      externalImages.push(r.url());
      r.respond({ status: 200, contentType: "image/png", body: STUB_PNG })
        .catch(() => {});
      return;
    }
    r.abort().catch(() => {});
  });

  let failed = 0;
  let ran = 0;
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForBoot(page);

    for (const t of tests) {
      if (FILTER && !t.name.includes(FILTER)) continue;
      ran++;
      const before = pageErrors.length;
      try {
        await t.fn(page);
        const fresh = pageErrors.slice(before);
        if (fresh.length) throw new Error(`page errors during test:\n    ${fresh.join("\n    ")}`);
        console.log(`  ok   ${t.name}`);
      } catch (e) {
        failed++;
        console.log(`  FAIL ${t.name}\n       ${String(e.message).split("\n").join("\n       ")}`);
      }
    }
  } catch (e) {
    failed++;
    console.log(`  FAIL <boot>\n       ${e.message}`);
    if (pageErrors.length) console.log(`       ${pageErrors.join("\n       ")}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${ran - failed}/${ran} passed`);
  process.exit(failed ? 1 : 0);
}

main();
