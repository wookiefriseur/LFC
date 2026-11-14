import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { isIgnoredItem } from "../../docs/ignored-items.js";
import { parseDiscovery, discoveryKnown, discoveryAsRecipe, dumpKnown, applyOffer, offerTypes, offerTypeSets, offerPlan, recordFromOffer } from "../../docs/discovery.js";
import { DirtyBuffer, serialiseDiff } from "../../docs/diff.js";
import { ReferenceData } from "../../docs/reference-data.js";
import { validateRecord, validateBuffer, rumourClash, messageFor } from "../../docs/validate.js";
const schema = JSON.parse(fs.readFileSync(new URL("../../schemas/diff-line.schema.json", import.meta.url)));
const valid = new Ajv({ strict: false }).compile(schema);
const enums = JSON.parse(fs.readFileSync(new URL("../../docs/data/enums.json", import.meta.url)));
const sample = { format: "furniture-discovery-v1", locale: "de", apiVersion: 101051,
  record: { id: 400001, blueprint: 400002 },
  meta: { id: 400001, name: 'Stuhl "neu"\n\\\t', quality: 3, cat: 4, sub: 5, theme: 6, icon: "/esoui/art/icons/chair.dds" } };

function roundtrip(value) {
  const { record, reference } = parseDiscovery(value);
  assert.deepEqual(validateRecord(record, enums).errors, []);
  const buffer = new DirtyBuffer();
  buffer.add("new", record, "rumour");
  buffer.references.set("new", reference);
  buffer.update("new", record, { ...record, notes: "discovered in game" }, "rumour");
  const line = JSON.parse(serialiseDiff(buffer));
  assert.equal(valid(line), true, JSON.stringify(valid.errors));
  assert.deepEqual(line.reference, reference);
  assert.equal(line.record.meta, undefined);
  assert.equal(line.record.blueprint, record.blueprint);
  const refs = new ReferenceData();
  refs.addDiscovery(reference.meta, record.blueprint);
  assert.equal(refs.meta(record.id).name, value.meta.name);
  assert.equal(refs.iconPath(record.id), value.meta.icon);
  if (record.blueprint) {
    assert.equal(refs.resultOf(record.blueprint), record.id);
    assert.equal(refs.meta(record.blueprint).id, record.id);
  }
  buffer.clear();
  assert.equal(buffer.references.size, 0);
}

test("discovery metadata survives import, editing and review serialization", () => roundtrip(sample));
test("known furnishing and blueprint identities are checked separately", () => {
  const records = [{id: 400001}, {blueprint: 99}];
  assert.equal(discoveryKnown({id: 400001}, records), true);
  assert.equal(discoveryKnown({id: 400001, blueprint: 400002}, records), false);
  assert.equal(discoveryKnown({id: 400001, blueprint: 99}, records), true);
});
test("invalid metadata and unsupported formats fail instead of losing metadata", () => {
  for (const patch of [{ format: "future" }, { locale: "" }, { apiVersion: 0 },
    { meta: { ...sample.meta, id: 7 } }, { meta: { ...sample.meta, cat: -1 } },
    { meta: { ...sample.meta, icon: "javascript:bad" } }]) {
    assert.throws(() => parseDiscovery({ ...sample, ...patch }));
  }
});
test("missing categories identify unfinished furnishings by id", () => {
  for (const missing of [["cat"], ["sub"], ["cat", "sub"]]) {
    const meta = { ...sample.meta };
    for (const key of missing) delete meta[key];
    assert.throws(() => parseDiscovery({ ...sample, meta }), (err) =>
      err.code === "UNFINALISED_FURNISHING" && err.message.includes("400001")
        && missing.every((key) => err.message.includes(`meta.${key}`)));
  }
  assert.throws(() => parseDiscovery({ ...sample, meta: { ...sample.meta, cat: -1 } }),
    (err) => !err.code && err.message.includes("item 400001") && err.message.includes("meta.cat"));
});
if (process.env.DISCOVERY_JSONL) test("actual Lua dump validates and survives the web roundtrip", () => {
  const text = fs.readFileSync(process.env.DISCOVERY_JSONL, "utf8");
  assert(text.endsWith("\n"));
  const lines = text.trim().split("\n");
  assert.equal(lines.length, 5);
  for (const line of lines) roundtrip(JSON.parse(line));
});

const ignoredRecords = fs.readFileSync(new URL("../../docs/data/ignored.jsonl", import.meta.url), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line));
test("ignored sources block accidental additions but permit explicit restoration", () => {
  assert.equal(isIgnoredItem({id: 191611}, ignoredRecords), true);
  assert.equal(isIgnoredItem({id: 1, blueprint: 191611}, ignoredRecords), true);
  assert.equal(isIgnoredItem({id: 191612}, ignoredRecords), false);
  const restored = { ...ignoredRecords[0], source: { type: "rumour" } };
  const accidental = new DirtyBuffer();
  accidental.add("test", restored, "rumour");
  assert(validateBuffer(accidental, enums, ignoredRecords).errors > 0);
  const explicit = new DirtyBuffer();
  explicit.update("test", ignoredRecords[0], restored, "ignored");
  assert.equal(validateBuffer(explicit, enums, [restored]).errors, 0);
  const lines = serialiseDiff(explicit).split("\n").map(JSON.parse);
  assert.deepEqual(lines.map((l) => [l.op, l.category]), [["delete", "ignored"], ["add", "rumour"]]);
  for (const line of lines) assert(valid(line), JSON.stringify(valid.errors));
});
test("source moves preserve original identity, data notes and metadata through re-edits", () => {
  const { record: before, reference } = parseDiscovery(sample);
  const ignored = { ...before, source: { type: "ignored" }, notes: "Old ID; use 400003" };
  const buffer = new DirtyBuffer();
  buffer.update("move", before, ignored, "rumour");
  buffer.references.set("move", reference);
  const after = { ...ignored, notes: "Replaced by 400003" };
  buffer.update("move", ignored, after, "ignored");
  assert.equal(validateBuffer(buffer, enums, [after]).errors, 0);
  const lines = serialiseDiff(buffer).split("\n").map(JSON.parse);
  assert.deepEqual(lines.map((l) => [l.op, l.category]), [["delete", "rumour"], ["add", "ignored"]]);
  assert.deepEqual(lines[0].match, before.source);
  assert.equal(lines[0].blueprint, before.blueprint);
  assert.equal(lines[1].record.notes, after.notes);
  assert.deepEqual(lines[1].reference, reference);
  for (const line of lines) assert(valid(line), JSON.stringify(valid.errors));
  buffer.update("move", after, before, "ignored");
  assert.equal(buffer.size(), 0, "reverting the whole edit removes the move");
  buffer.update("move", before, ignored, "rumour");
  buffer.delete("move", ignored, "ignored");
  assert.equal(JSON.parse(serialiseDiff(buffer)).category, "rumour", "delete still addresses the original file");
});
test("LFC and canonical ignored item identities agree", () => {
  const read = (name) => fs.readFileSync(new URL(`../../LibFurnitureCatalogue/data/${name}`, import.meta.url), "utf8");
  const type = read("GeneratedConstants.lua").match(/\["ignored"\]=(\d+)/)[1];
  const ids = [...read("GeneratedDatabase.lua").matchAll(new RegExp(`^\\s*\\[(\\d+)\\]=\\{\\d+,\\d+,\\d+,\\{${type},`, "gm"))].map((m) => Number(m[1]));
  assert.deepEqual(ids.sort((a,b) => a-b), ignoredRecords.map((r) => r.id).sort((a,b) => a-b));
});

test("a rumour beside a confirmed record is refused, and a new blueprint of a confirmed item becomes a recipe", () => {
  const drop = { id: 130326, source: { type: "event_drop", event: "WITCHES" }, cost: [], availability: { version: "REACH" },
    _category: "event_drop", _key: "event_drop#1" };
  const blueprint = { id: 130326, blueprint: 132173, source: { type: "rumour" }, cost: [], availability: { version: "NONE" } };
  const clash = rumourClash(blueprint, [drop]);
  assert.equal(clash.code, "rumour_confirmed");
  assert.match(messageFor(clash), /confirmed source \(Event drop\).*Crafting/);
  assert.equal(rumourClash({ ...blueprint, source: { type: "recipe" } }, [drop]), null);
  assert.equal(rumourClash({ id: 130326, source: { type: "rumour" } }, [drop]).blueprint, false);
  // The other direction: a confirmed record for an item that is still a rumour, addressed by id or by blueprint.
  const rumour = { ...blueprint, _category: "rumour", _key: "rumour#1" };
  assert.equal(rumourClash({ ...drop, _key: "new" }, [rumour]).code, "confirmed_has_rumour");
  assert.equal(rumourClash({ ...drop, id: 132173, _key: "new" }, [rumour]).code, "confirmed_has_rumour");
  assert.equal(validateRecord(blueprint, enums, [drop]).errors.some((f) => f.code === "rumour_confirmed"), true);

  const buffer = new DirtyBuffer();
  buffer.add("rumour#new", blueprint, "rumour");
  const live = [drop, { ...blueprint, _category: "rumour", _key: "rumour#new" }];
  assert.equal(validateBuffer(buffer, enums, live).perEntry.get("rumour#new").errors[0].code, "rumour_confirmed");

  assert.deepEqual(discoveryAsRecipe(blueprint, [drop]).source, { type: "recipe" });
  assert.equal(discoveryAsRecipe(blueprint, [drop]).availability.version, "NONE");
  assert.equal(discoveryAsRecipe(blueprint, []), blueprint);
  const { blueprint: _, ...plain } = blueprint;
  assert.equal(discoveryAsRecipe(plain, [drop]), plain);
});

test("a record with a pending delete neither clashes nor survives a later edit", () => {
  const rumour = { id: 226739, source: { type: "rumour" }, cost: [], availability: { version: "NONE" },
    _category: "rumour", _key: "rumour#1" };
  const { _category, _key, ...file } = rumour;
  const vendor = { id: 226739, source: { type: "writ_vendor", vendor: "ROLIS" },
    cost: [{ currency: "WRIT_VOUCHERS", amount: 125 }], availability: { version: "NONE" } };
  const buffer = new DirtyBuffer();
  buffer.add("writ_vendor#new", vendor, "writ_vendor");
  const live = [rumour, { ...vendor, _category: "writ_vendor", _key: "writ_vendor#new" }];
  assert.equal(validateBuffer(buffer, enums, live).perEntry.get("writ_vendor#new").errors[0].code, "confirmed_has_rumour");

  buffer.delete("rumour#1", file, "rumour");
  const found = validateBuffer(buffer, enums, live);
  assert.equal(found.errors, 0);
  assert.deepEqual(found.perEntry.get("writ_vendor#new").warnings, [], "a deleted record is not another way to get the item");

  buffer.update("rumour#1", file, { ...file, notes: "edited after delete" }, "rumour");
  assert.equal(buffer.isDeleted("rumour#1"), true);
});

test("a trader dump number is catalogued whether it is a furnishing or a blueprint", () => {
  const records = [{ id: 118553, blueprint: 119592, source: { type: "writ_vendor", vendor: "ROLIS" } }];
  assert.equal(dumpKnown(118553, records), true);
  assert.equal(dumpKnown(119592, records), true);
  assert.equal(dumpKnown(999999, records), false);
});

test("a discovery of a catalogued item names exactly the details it changes", async () => {
  const { itemDetailsChanges } = await import("../../docs/discovery.js");
  const meta = { id: 5, name: "Chair", icon: "/esoui/art/icons/chair.dds", quality: 2, cat: 1, sub: 2, theme: 3 };
  const reference = { meta };
  const published = { name: "Chair", meta: { id: 5, name: "Chair", icon: "chair", quality: 2, cat: 1, sub: 2, theme: 3 } };
  assert.deepEqual(itemDetailsChanges(reference, published), []);
  assert.deepEqual(itemDetailsChanges(reference, { ...published, name: "Item 5" }), ["name"]);
  assert.deepEqual(itemDetailsChanges(reference, { ...published, meta: { ...published.meta, theme: 4 } }), ["theme"]);
  assert.deepEqual(itemDetailsChanges(reference, { name: null, meta: null }), ["name", "icon", "quality", "cat", "sub", "theme"]);
  assert.deepEqual(itemDetailsChanges({ meta: { ...meta, icon: "/esoui/art/icons/icon_missing.dds" } }, published), [], "the placeholder never replaces a real icon");
});

test("a trader offer is read and checked; a bag line has none", () => {
  assert.equal(parseDiscovery(sample).offer, undefined);
  const { offer } = parseDiscovery({ ...sample, offer: { currency: "GOLD", amount: 50000, achievement: 77, extra: 1 } });
  assert.deepEqual(offer, { currency: "GOLD", amount: 50000, achievement: 77 });
  for (const bad of [{ currency: "gold", amount: 1 }, { currency: "GOLD", amount: 0 }, { currency: "GOLD", amount: 5, achievement: "x" }, null]) {
    assert.throws(() => parseDiscovery({ ...sample, offer: bad }), /offer/);
  }
});

test("an offer fills and replaces what the dump brings, and never strips what it does not", () => {
  const contracts = enums.source_type_contracts;
  const fresh = { id: 1, source: { type: "vendor", vendor: "HGF", subtype: "achievement" }, cost: [], availability: { version: "HOMESTEAD" } };
  const filled = applyOffer(fresh, { currency: "GOLD", amount: 500, achievement: 42 }, contracts);
  assert.deepEqual([filled.changed, filled.replaced], [true, []]);
  assert.deepEqual([filled.record.cost, filled.record.source.achievement], [[{ currency: "GOLD", amount: 500 }], 42]);
  assert.deepEqual(fresh.cost, [], "the input record is left alone");

  const gated = { ...fresh, source: { ...fresh.source, achievement: 42 }, cost: [{ currency: "GOLD", amount: 500 }, { currency: "AP", amount: 9 }] };
  const owner = applyOffer(gated, { currency: "GOLD", amount: 500 }, contracts);
  assert.deepEqual([owner.changed, owner.record.source.achievement], [false, 42],
    "a dump from a character who owns the achievement keeps the gate");

  const repriced = applyOffer(gated, { currency: "GOLD", amount: 900, achievement: 43 }, contracts);
  assert.equal(repriced.changed, true);
  assert.deepEqual(repriced.record.cost, [{ currency: "GOLD", amount: 900 }, { currency: "AP", amount: 9 }], "only the offer's currency is replaced");
  assert.equal(repriced.record.source.achievement, 43);
  assert.equal(repriced.replaced.length, 2, "both replacements are described for the report");

  const lux = applyOffer({ id: 2, source: { type: "luxury", vendor: "LUXF" }, cost: [], availability: { version: "HOMESTEAD" } },
    { currency: "GOLD", amount: 9, achievement: 5 }, contracts);
  assert.deepEqual([lux.record.cost[0].amount, lux.record.source.achievement], [9, undefined], "no gate where the type has none");
  const rumour = applyOffer({ id: 3, source: { type: "rumour" }, cost: [], availability: { version: "NONE" } }, { currency: "GOLD", amount: 1, achievement: 5 }, contracts);
  assert.deepEqual([rumour.record.cost, rumour.record.source], [[{ currency: "GOLD", amount: 1 }], { type: "rumour", achievement: 5 }],
    "a rumour keeps price and gate");
  assert.deepEqual(validateRecord(rumour.record, enums).errors, []);
  assert.equal(applyOffer({ id: 4, source: { type: "drop" }, cost: [] }, { currency: "GOLD", amount: 1 }, contracts).changed, false);
  assert.deepEqual(validateRecord(filled.record, enums).errors, []);
});

test("the catalogue names a source type for a currency only one trader type is priced in", () => {
  const records = enums.source_types.flatMap((kind) => fs.readFileSync(new URL(`../../docs/data/${kind}.jsonl`, import.meta.url), "utf8")
    .split("\n").filter(Boolean).map((line) => JSON.parse(line)));
  const types = offerTypes(records);
  assert.equal(types.get("WRIT_VOUCHERS"), "writ_vendor");
  assert.equal(types.get("AP"), "pvp_vendor");
  assert.equal(types.has("GOLD"), false, "Gold is shared by several trader types");
  assert.equal(types.has("TRADE_BARS"), false, "Trade bars are shared by event vendors and the Crown Store");

  const { record } = parseDiscovery(sample);
  const writ = recordFromOffer(record, { currency: "WRIT_VOUCHERS", amount: 800, achievement: 42 }, types, enums.source_type_contracts);
  assert.deepEqual([writ.source, writ.cost, writ.blueprint], [{ type: "writ_vendor", achievement: 42 }, [{ currency: "WRIT_VOUCHERS", amount: 800 }], 400002]);
  assert.deepEqual(validateRecord(writ, enums).errors.map((f) => [f.code, f.field]), [["required_field_missing", "source.vendor"]],
    "the trader stays for the contributor to pick, and the record cannot be sent without it");
  const gold = recordFromOffer(record, { currency: "GOLD", amount: 5, achievement: 9 }, types, enums.source_type_contracts);
  assert.deepEqual([gold.source, gold.cost], [{ type: "rumour", achievement: 9 }, [{ currency: "GOLD", amount: 5 }]],
    "an ambiguous currency keeps the item Unconfirmed, with its price and gate");
  assert.deepEqual(validateRecord(gold, enums).errors, []);
  assert.equal(recordFromOffer(record, undefined, types, enums.source_type_contracts), null);
});

test("an offer in another currency is another trader: it never reprices a record of a different currency", () => {
  const contracts = enums.source_type_contracts;
  const sets = new Map([["GOLD", new Set(["vendor", "luxury"])], ["AP", new Set(["pvp_vendor"])], ["CROWNS", new Set(["crown_store"])]]);
  // 117971: the Home Goods Furnisher sells it for gold, a trader in Cyrodiil for Alliance Points; the catalogue knew only the gold one.
  const hgf = { id: 117971, source: { type: "vendor", vendor: "HGF", subtype: "home_goods", locations: [{ place: "ANY_CAPITAL" }] },
    cost: [{ currency: "GOLD", amount: 100 }], availability: { version: "HOMESTEAD" } };
  const ap = offerPlan([hgf], { currency: "AP", amount: 300 }, sets, contracts);
  assert.equal(ap.kind, "add");
  assert.deepEqual([ap.record.id, ap.record.source, ap.record.cost], [117971, { type: "pvp_vendor" }, [{ currency: "AP", amount: 300 }]]);
  assert.deepEqual(validateRecord(ap.record, enums).errors.map((f) => f.code), ["required_field_missing"], "the trader is left to pick");
  assert.deepEqual(hgf.cost, [{ currency: "GOLD", amount: 100 }], "the gold record is untouched");
  const gold = offerPlan([hgf], { currency: "GOLD", amount: 100 }, sets, contracts);
  assert.deepEqual([gold.kind, gold.target, gold.changed], ["apply", hgf, false], "the gold dump confirms the gold record");
  assert.equal(offerPlan([{ ...hgf, source: { type: "pvp_vendor", vendor: "AF" }, cost: [{ currency: "AP", amount: 300 }] }],
    { currency: "GOLD", amount: 100 }, sets, contracts).kind, "unrecorded", "gold names no trader type: only a warning");

  const af = { id: 5, source: { type: "pvp_vendor", vendor: "AF", achievement: 2510 }, cost: [{ currency: "AP", amount: 2000000 }], availability: { version: "SCALES" } };
  const both = [{ ...hgf, id: 5 }, af];
  const one = offerPlan(both, { currency: "AP", amount: 2000000, achievement: 2511 }, sets, contracts);
  assert.deepEqual([one.kind, one.target, one.record.source.achievement, one.replaced], ["apply", af, 2511, ["achievement 2510 -> 2511"]],
    "the currency singles out one of two trader records");

  const twice = [af, { ...af, source: { type: "pvp_vendor", vendor: "BGF" } }];
  assert.deepEqual(offerPlan(twice, { currency: "AP", amount: 7 }, sets, contracts), { kind: "several", count: 2 }, "two records in the currency: only warned");
  assert.equal(offerPlan(twice, { currency: "AP", amount: 2000000 }, sets, contracts).kind, "none", "one of them states the offer: nothing to say");

  const pack = { id: 6, source: { type: "crown_store", packs: ["AZURA"] }, cost: [], availability: { version: "MORROWIND" } };
  const fill = offerPlan([pack, { ...hgf, id: 6 }], { currency: "CROWNS", amount: 900 }, sets, contracts);
  assert.deepEqual([fill.kind, fill.target, fill.record.cost, fill.replaced], ["apply", pack, [{ currency: "CROWNS", amount: 900 }], []],
    "an unpriced record of a type priced in that currency is filled");
  const rumour = { id: 7, source: { type: "rumour" }, cost: [{ currency: "GOLD", amount: 1 }], availability: { version: "NONE" } };
  const r = offerPlan([rumour], { currency: "AP", amount: 2 }, sets, contracts);
  assert.deepEqual([r.kind, r.record.cost], ["apply", [{ currency: "AP", amount: 2 }]], "a rumour still takes the dump");
  assert.equal(offerTypeSets([hgf, af]).get("GOLD").has("vendor"), true);
});
