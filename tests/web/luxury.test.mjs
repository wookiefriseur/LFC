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
