import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { partitionFields, DATES_GROUP, SITE_ONLY_FIELDS } from "../../docs/form.js";
import { validateRecord } from "../../docs/validate.js";
import { PRESETS, presetById, applyPreset } from "../../docs/presets.js";

const here = dirname(fileURLToPath(import.meta.url));
const enums = JSON.parse(readFileSync(join(here, "..", "..", "docs", "data", "enums.json"), "utf8"));
const contracts = enums.source_type_contracts;

let failures = 0;
let checks = 0;

function ok(cond, what) {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  FAIL  ${what}`);
}

function sampleValue(field) {
  if (field === "houses") return [1309, 4794];
  if (["achievement", "quest", "skill_rank"].includes(field)) return 7;
  if (field === "leads") return true;
  return `SAMPLE_${field.toUpperCase()}`;
}

function baseRecord(type, source = {}) {
  return {
    id: 123456,
    source: { type, ...source },
    cost: [],
    availability: { version: "41" },
  };
}

const types = Object.keys(contracts);
console.log(`partitionFields over ${types.length} contracts in data/enums.json\n`);
if (types.length !== enums.source_types.length) {
  failures++;
  console.error(`  FAIL  expected one contract per source type (${enums.source_types.length}), found ${types.length}`);
}

for (const type of types) {
  const c = contracts[type];
  const required = c.required || [];
  const optional = c.optional || [];

  for (const populated of [false, true]) {
    const source = {};
    if (populated) {
      for (const f of [...required, ...optional]) source[f] = sampleValue(f);
    }
    const rec = baseRecord(type, source);
    if (populated) {
      rec.cost = [{ currency: "GOLD", amount: 100 }];
      rec.rarity = "rare";
      rec.availability.last_seen = "2024-01-07";
    }
    const part = partitionFields(rec, contracts);
    const where = `${type} (${populated ? "populated" : "empty"})`;

    for (const f of required) {
      ok(part.visible.includes(`source.${f}`),
        `${where}: required field source.${f} is in visible`);
    }
    ok(part.noContract === false, `${where}: a contract was found`);

    const hasValue = new Set([
      ...Object.keys(rec.source).filter((k) => k !== "type").map((k) => `source.${k}`),
      ...(rec.cost.length ? ["cost"] : []),
      ...(rec.rarity ? ["rarity"] : []),
      ...Object.keys(rec.availability)
        .filter((k) => k !== "version")
        .map((k) => `availability.${k}`),
      "availability.version",
    ]);
    for (const path of part.addable) {
      const members = path === DATES_GROUP
        ? ["availability.last_seen"]
        : [path];
      for (const m of members) {
        ok(!hasValue.has(m), `${where}: addable entry ${path} does not cover the set field ${m}`);
      }
    }

    for (const path of part.addable) {
      ok(!part.visible.includes(path), `${where}: ${path} is not in both visible and addable`);
    }
    ok(part.orphans.length === 0, `${where}: a contract-conformant record has no orphans`);

    if (populated) {
      for (const f of [...required, ...optional]) {
        ok(part.visible.includes(`source.${f}`), `${where}: set field source.${f} is visible`);
      }
      ok(part.addable.length === 0 || !part.addable.includes(DATES_GROUP),
        `${where}: every date field set, so no Dates and repeats group is offered`);
    } else {
      ok(part.addable.includes(DATES_GROUP),
        `${where}: the availability fields collapse into one addable group`);
      ok(part.addable.filter((p) => p.startsWith("availability.")).length === 1,
        `${where}: exactly one availability entry in addable`);
    }

    // The one exception: an unpriced Crown Store pack or bundle record offers its price in the expander.
    const setOffer = type === "crown_store" && (rec.source.bundle || rec.source.packs?.length)
      && !rec.cost.length;
    ok(setOffer ? part.addable.includes("cost") : part.visible.includes("cost"),
      `${where}: cost is visible${setOffer ? " only through the expander" : ""}`);
    ok(part.visible.includes("availability.version"),
      `${where}: availability.version is always visible`);
  }
}

for (const type of types) {
  const rec = baseRecord(type, { dungeon: "FUNGAL_GROTTO_I" });
  const part = partitionFields(rec, contracts);
  ok(part.orphans.length === 1 && part.orphans[0] === "source.dungeon",
    `${type}: source.dungeon yields exactly one orphan, got [${part.orphans.join(", ")}]`);
  ok(!part.visible.includes("source.dungeon") && !part.addable.includes("source.dungeon"),
    `${type}: the orphan is neither visible-as-an-input nor addable`);
}

{
  const union = new Set();
  for (const c of Object.values(contracts)) {
    for (const f of [...(c.required || []), ...(c.optional || [])]) union.add(f);
  }
  let pairs = 0;
  for (const type of types) {
    const own = new Set([...(contracts[type].required || []),
      ...(contracts[type].optional || []), "note"]);
    for (const field of union) {
      if (own.has(field)) continue;
      pairs++;
      const part = partitionFields(baseRecord(type, { [field]: sampleValue(field) }), contracts);
      ok(part.orphans.length === 0,
        `${type}: a carried source.${field} is not an orphan, got [${part.orphans.join(", ")}]`);
      ok(part.visible.includes(`source.${field}`),
        `${type}: a carried source.${field} is visible as an ordinary input`);
      ok(!part.addable.includes(`source.${field}`),
        `${type}: a carried source.${field} is not also offered in the expander`);
    }
  }
  ok(pairs > 0, "the type/field matrix produced at least one off-contract pair to check");
  const murkmire = partitionFields(
    baseRecord("quest_reward", { locations: [{ location: "MURKMIRE" }], subtype: "daily",
      container: "BOONBOX" }), contracts);
  ok(murkmire.visible.includes("source.container") && murkmire.orphans.length === 0,
    "item 141921's case: a quest reward can carry the container it came in");
}

{
  const rec = baseRecord("drop");
  const findings = { errors: [{ field: "source.npc_class", message: "x" }], warnings: [] };
  const part = partitionFields(rec, contracts, findings);
  ok(part.visible.includes("source.npc_class"), "a field named by a finding is visible");
  ok(!part.addable.includes("source.npc_class"), "a field named by a finding is not also addable");
}

for (const type of types) {
  const part = partitionFields(baseRecord(type, { note: "vault chests" }), contracts);
  ok(part.visible.includes("source.note"), `${type}: source.note is legal and visible`);
  ok(part.orphans.length === 0, `${type}: source.note is never an orphan`);
}

{
  const rec = baseRecord("no_such_type", { vendor: "LUXF" });
  const part = partitionFields(rec, contracts);
  ok(part.noContract === true, "unknown source type: noContract is true");
  ok(part.visible.length === 0 && part.addable.length === 0,
    "unknown source type: nothing is editable");
  ok(part.readonly.includes("source.vendor"),
    "unknown source type: the fields it carries are read-only");
}

{
  const rec = baseRecord("recipe");
  rec.notes = "approximated: the row says only 'crafted by'";
  const part = partitionFields(rec, contracts);
  ok(part.readonly.length === 1 && part.readonly[0] === "notes",
    "site-only: a non-empty note is the only readonly entry");
  const empty = partitionFields(baseRecord("recipe"), contracts);
  ok(empty.readonly.length === 0, "site-only: empty site-only fields are not listed");
  ok(SITE_ONLY_FIELDS.join(",") === "notes,name_overrides",
    "site-only: exactly the two fields the build strips");
}

{
  // `leads` is a flag, not a count: true passes, anything else is refused.
  const codes = (leads) => validateRecord(
    baseRecord("drop", { subtype: "scryable", leads }), enums, []).errors
    .filter((f) => f.field === "source.leads").map((f) => f.code);
  ok(codes(true).length === 0, "leads: true is valid");
  ok(codes("true").join() === "bool_required", "leads: the string \"true\" is refused");
  ok(codes(2).join() === "bool_required", "leads: a count is refused");
}

{
  // One record is one offer: a repeated currency or a pack plus a bundle is two offers in one record.
  const codes = (source, cost) => validateRecord(
    { ...baseRecord("crown_store", source), cost }, enums, []).errors.map((f) => f.code)
    .filter((c) => ["cost_currency_repeated", "crown_offer_mixed", "crown_set_priced"].includes(c));
  const crowns = (amount) => ({ currency: "CROWNS", amount });
  ok(!codes({ packs: ["AZURA"] }, []).length, "offer: a pack without a price is valid");
  ok(!codes({}, [crowns(2100)]).length, "offer: the furnishing's own price is valid");
  ok(codes({}, [crowns(2100), crowns(1200)]).includes("cost_currency_repeated"),
    "offer: two Crowns prices are refused");
  ok(codes({ packs: ["AZURA"], bundle: "CHRYSAMERE" }, []).includes("crown_offer_mixed"),
    "offer: a pack and a bundle in one record are refused");
  ok(codes({ packs: ["AZURA"] }, [crowns(4000)]).includes("crown_set_priced"),
    "offer: a pack price is refused");
  ok(codes({ bundle: "CHRYSAMERE" }, [crowns(1200)]).includes("crown_set_priced"),
    "offer: a bundle price is refused");

  // The price of an unpriced pack or bundle record waits in the expander; one the record has, or one with a finding, stays in sight.
  const where = (source, cost, findings) => {
    const part = partitionFields({ ...baseRecord("crown_store", source), cost }, contracts, findings);
    return part.visible.includes("cost") ? "visible" : part.addable.includes("cost") ? "addable" : "none";
  };
  ok(where({ bundle: "CHRYSAMERE" }, []) === "addable", "offer: a bundle record hides its empty price");
  ok(where({ packs: ["AZURA"] }, []) === "addable", "offer: a pack record hides its empty price");
  ok(where({}, []) === "visible", "offer: a plain Crown Store record shows its price");
  ok(where({ bundle: "CHRYSAMERE" }, [crowns(1200)]) === "visible",
    "offer: a bundle record that has a price shows it, so it can be removed");
  ok(where({ bundle: "CHRYSAMERE" }, [], { errors: [{ field: "cost.0.amount" }], warnings: [] }) === "visible",
    "offer: a price with a finding stays visible");
}

{
  // Presets are hand-curated: every fixed value has to exist, and every blank has to be reported until it is picked.
  const BLANK_CODES = new Set(["value_missing", "required_field_missing", "cost_amount_invalid"]);
  const version = enums.versions.at(-1).symbol;
  for (const preset of PRESETS) {
    const rec = applyPreset({ id: 123456 }, preset, version);
    const { errors } = validateRecord(rec, enums, []);
    const other = errors.filter((f) => !BLANK_CODES.has(f.code));
    ok(other.length === 0, `preset ${preset.id}: fixed values are valid (${other.map((f) => f.code)})`);
    const blanks = Object.values(preset.source).filter((v) => v === "" || (Array.isArray(v) && !v.length)).length
      + preset.cost.filter((c) => c.amount == null).length;
    const houses = preset.source.houses ? 1 : 0;   // an empty house list is legal: "misc house"
    ok(errors.length === blanks - houses, `preset ${preset.id}: each blank is reported once`);
    ok(presetById(preset.id) === preset, `preset ${preset.id}: found by id`);
  }
  ok(new Set(PRESETS.map((p) => p.id)).size === PRESETS.length, "presets: ids are unique");
  // Whichever presets are enabled: applying one keeps the item and copies its source and price.
  for (const preset of PRESETS) {
    const kept = applyPreset({ id: 178799, source: { type: "drop" }, cost: [] }, preset, version);
    ok(kept.id === 178799 && JSON.stringify(kept.source) === JSON.stringify(preset.source)
      && JSON.stringify(kept.cost) === JSON.stringify(preset.cost) && kept.source !== preset.source,
      `preset ${preset.id}: applying keeps the item and copies source and price`);
  }
}

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
