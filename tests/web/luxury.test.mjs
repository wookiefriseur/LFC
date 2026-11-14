import { test } from "node:test";
import assert from "node:assert/strict";
import { DirtyBuffer } from "../../docs/diff.js";
import { parseLuxuryPaste, luxuryIndex, computeLuxuryPlan } from "../../docs/luxury.js";

test("a price with a thousands separator is read whole, a plain one still works", () => {
  for (const line of ["220369, 50,000", "220369 50 000", "220369 50.000", "220369, 50000", "220369;50_000"]) {
    assert.equal(parseLuxuryPaste(line)[0].price, 50000, line);
  }
  const [row] = parseLuxuryPaste("220369, 50,000, Horse Skeleton");
  assert.deepEqual([row.id, row.price, row.comment], [220369, 50000, "Horse Skeleton"]);
  assert.deepEqual([parseLuxuryPaste("220369")[0].price, parseLuxuryPaste("220369, 50, 120")[0].price], [null, 50]);
});

test("a paste applies on top of an unsent edit to the same record", () => {
  const published = { id: 220369, source: { type: "luxury", vendor: "LUXF" }, cost: [{ currency: "GOLD", amount: 50000 }], availability: { version: "HOMESTEAD", last_seen: "2026-01-02" } };
  const live = { ...structuredClone(published), notes: "checked in game", _category: "luxury", _key: "luxury#0" };
  const buffer = new DirtyBuffer();
  buffer.update(live._key, published, { ...structuredClone(published), notes: "checked in game" }, "luxury");
  const [p] = computeLuxuryPlan(parseLuxuryPaste("220369"), {
    date: "2026-11-13", version: "HOMESTEAD", keepPrices: true, luxuryById: luxuryIndex([live], buffer),
  });
  assert.equal(p.record.notes, "checked in game");
  assert.equal(p.record.availability.last_seen, "2026-11-13");
  buffer.update(p._key, p.before, p.record, "luxury");
  assert.deepEqual(buffer.entries.get(live._key).before, published, "the change is still measured against the file");
});

const trader = (id, offer, name = "Dwarven Fountain, Forged") => JSON.stringify({
  format: "furniture-discovery-v1", locale: "en", apiVersion: 101051,
  record: { id, source: { type: "rumour" }, cost: [], availability: { version: "NONE" } },
  meta: { id, name, icon: "/esoui/art/icons/fountain.dds", quality: 4, cat: 5, sub: 6, theme: 7 },
  ...(offer ? { offer } : {}),
});

test("a trader dump line gives the luxury paste its id and Gold price, like an \"id, price\" line", () => {
  const [gold, crowns, bag] = parseLuxuryPaste([
    trader(126560, { currency: "GOLD", amount: 50000, achievement: 1234 }),
    trader(126561, { currency: "CROWNS", amount: 400 }),
    trader(126562, null),
  ].join("\n"));
  assert.deepEqual([gold.id, gold.price, gold.comment, gold.error], [126560, 50000, "Dwarven Fountain, Forged", null]);
  assert.match(gold._achievementNote, /1234/);
  assert.match(crowns.error, /CROWNS, not Gold/);
  assert.match(bag.error, /no trader offer/);
  const plain = parseLuxuryPaste("126560, 50000")[0];
  const opts = { date: "2026-11-13", version: "HOMESTEAD", keepPrices: true, luxuryById: new Map() };
  assert.deepEqual(computeLuxuryPlan([gold], opts)[0].record, computeLuxuryPlan([plain], opts)[0].record);
});

test("Lua-block dumps are no longer read", () => {
  const [row] = parseLuxuryPaste("\t[126560] = {\t\t-- Dwarven Fountain\n\t\titemPrice = 50000,\n\t},");
  assert.ok(row.error);
});
