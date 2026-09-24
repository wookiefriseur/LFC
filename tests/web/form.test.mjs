// form.test.mjs - the enforcement behind AN section 4.1's table.
//
// Run:  node form.test.mjs   (from tests/web/)
//
// Walks every contract in the REAL data/enums.json and asserts the three properties the progressive-disclosure rule exists
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { partitionFields, DATES_GROUP, SITE_ONLY_FIELDS } from "../../docs/form.js";

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

// A plausible value for a source field, so a "populated" record is realistic.
function sampleValue(field) {
  if (field === "houses") return [1309, 4794];
  if (["achievement", "quest", "skill_rank", "pieces"].includes(field)) return 7;
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
if (types.length !== 18) {
  failures++;
  console.error(`  FAIL  expected 18 source-type contracts, found ${types.length}`);
}

// -- (a) and (b), per type, on an EMPTY record and on a POPULATED one --------
for (const type of types) {
  const c = contracts[type];
  const required = c.required || [];
  const optional = c.optional || [];

  for (const populated of [false, true]) {
    const source = {};
    if (populated) {
      // Fill every field the contract knows about, required and optional.
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

    // (a) required is always visible.
    for (const f of required) {
      ok(part.visible.includes(`source.${f}`),
        `${where}: required field source.${f} is in visible`);
    }
    ok(part.noContract === false, `${where}: a contract was found`);

    // (b) addable holds nothing the record has a value for.
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

    // Nothing may sit in both partitions, and every addable field must be one the contract allows (plus the envelope group tokens).
    for (const path of part.addable) {
      ok(!part.visible.includes(path), `${where}: ${path} is not in both visible and addable`);
    }
    ok(part.orphans.length === 0, `${where}: a contract-conformant record has no orphans`);

    if (populated) {
      // Everything the record carries is visible - nothing behind the expander.
      for (const f of [...required, ...optional]) {
        ok(part.visible.includes(`source.${f}`), `${where}: set field source.${f} is visible`);
      }
      ok(part.addable.length === 0 || !part.addable.includes(DATES_GROUP),
        `${where}: every date field set, so no Dates and repeats group is offered`);
    } else {
      // An empty record offers the trio as ONE grouped row.
      ok(part.addable.includes(DATES_GROUP),
        `${where}: the availability fields collapse into one addable group`);
      ok(part.addable.filter((p) => p.startsWith("availability.")).length === 1,
        `${where}: exactly one availability entry in addable`);
    }

    // The envelope's two unconditional fields.
    ok(part.visible.includes("cost"), `${where}: cost is always visible`);
    ok(part.visible.includes("availability.version"),
      `${where}: availability.version is always visible`);
  }
}

// -- (c) an UNKNOWN source key yields exactly one orphan
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
      if (own.has(field)) continue;          // this type features it already
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
  // The card's own case, named so a failure says which record it is about.
  const murkmire = partitionFields(
    baseRecord("quest_reward", { locations: [{ location: "MURKMIRE" }], subtype: "daily",
      container: "BOONBOX" }), contracts);
  ok(murkmire.visible.includes("source.container") && murkmire.orphans.length === 0,
    "item 141921's case: a quest reward can carry the container it came in");
}

// -- V3: a finding pulls an empty optional field out of the expander ---------
{
  const rec = baseRecord("drop");
  const findings = { errors: [{ field: "source.npc_class", message: "x" }], warnings: [] };
  const part = partitionFields(rec, contracts, findings);
  ok(part.visible.includes("source.npc_class"), "V3: a field named by a finding is visible");
  ok(!part.addable.includes("source.npc_class"), "V3: and is not also addable");
}

// -- `note` is allowed on every type, contract or not ------------------------
for (const type of types) {
  const part = partitionFields(baseRecord(type, { note: "vault chests" }), contracts);
  ok(part.visible.includes("source.note"), `${type}: source.note is legal and visible`);
  ok(part.orphans.length === 0, `${type}: source.note is never an orphan`);
}

// -- no contract: everything read-only --------------------------------------
{
  const rec = baseRecord("no_such_type", { vendor: "LUXF" });
  const part = partitionFields(rec, contracts);
  ok(part.noContract === true, "unknown source type: noContract is true");
  ok(part.visible.length === 0 && part.addable.length === 0,
    "unknown source type: nothing is editable");
  ok(part.readonly.includes("source.vendor"),
    "unknown source type: the fields it carries are read-only");
}

// -- the site-only three -----------------------------------------------------
{
  const rec = baseRecord("recipe");
  rec.notes = "approximated: the row says only 'crafted by'";
  const part = partitionFields(rec, contracts);
  ok(part.readonly.length === 1 && part.readonly[0] === "notes",
    "site-only: a non-empty note is the only readonly entry");
  const empty = partitionFields(baseRecord("recipe"), contracts);
  ok(empty.readonly.length === 0, "site-only: empty site-only fields are not listed");
  ok(SITE_ONLY_FIELDS.join(",") === "description,notes,name_overrides",
    "site-only: exactly the three fields the build strips");
}

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
