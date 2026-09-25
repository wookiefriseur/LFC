import { isIgnoredItem, ignoredMessage } from "./ignored-items.js";
// Driven entirely by enums.json (vocabularies + source_type_contracts), the same file the form renders from, so form and validator never drift.
//
// A finding is { level: "error"|"warning", field, message, code, value?, type? }. Errors block submission; warnings do not.
// `code` is the stable half and messageFor() the plain-English half: `message` interpolates values, so presentation keyed on it would silently break on a wording change. Nothing keys on `message`.

import { symbolsOf, entryOf, unknownIdFields, isSourceSlug } from "./data.js";
import { labelFor, sourceTypeLabel } from "./lexicon.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// This envelope stays closed; only the per-source-type field lists are open.
const AVAILABILITY_FIELDS = new Set(["version", "last_seen"]);

// A contract's `optional` list is the editor's opinion about what to show first, not a statement of what a record may hold: any source type may carry any field the model knows. What stays closed is the model itself, so a typo or a retired field keeps failing.
export function allowedSourceFields(contracts) {
  const out = new Set(["note"]);
  for (const c of Object.values(contracts || {})) {
    for (const f of [...(c.required || []), ...(c.optional || [])]) out.add(f);
  }
  return out;
}

// Fallback for an enums.json that does not publish `source_field_vocabularies`. `subtype` is checked separately against `<type>_subtypes`, and `locations` is a placement list.
const SOURCE_ENUM_FIELD_FALLBACK = {
  vendor: "vendors",
  event: "events",
  container: "containers",
  skill_line: "skill_lines",
  npc_class: "npc_classes",
  npc_group: "npc_groups",
  packs: "packs",
  bundle: "bundles",
  companion: "companions",
  crate: "crates",
};

export function sourceEnumFields(enums) {
  const published = enums?.source_field_vocabularies;
  return published && typeof published === "object"
    ? published
    : SOURCE_ENUM_FIELD_FALLBACK;
}

// Kept as a named export: browse.js and form.js import it for labels, and neither has an `enums` in scope at module level.
export const SOURCE_ENUM_FIELD = SOURCE_ENUM_FIELD_FALLBACK;

function isInt(x) {
  return Number.isInteger(x);
}

function isPositiveInt(x) {
  return isInt(x) && x >= 1;
}

function hasOwn(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

// An explicitly present identity must still be a positive integer, so `null` stays invalid rather than counting as omitted.
function validIdentity(record) {
  const id = record?.id;
  const blueprint = record?.blueprint;
  return (!hasOwn(record, "id") || isPositiveInt(id))
    && (!hasOwn(record, "blueprint") || isPositiveInt(blueprint))
    && (isPositiveInt(id) || isPositiveInt(blueprint));
}

function identityField(record) {
  return isPositiveInt(record?.id) ? "id" : "blueprint";
}

function identityText(id, blueprint) {
  const parts = [];
  if (isPositiveInt(id)) parts.push(`id ${id}`);
  if (isPositiveInt(blueprint)) parts.push(`blueprint ${blueprint}`);
  return parts.join(" and ");
}

// Finding codes -> plain English. A code with no entry here is a bug, not a fallback path; knownCodes() lets a test say so.

// `cost.0.amount` is a real path but the lexicon keys the shape, not the index.
function labelPath(field) {
  return String(field ?? "").replace(/^cost\.\d+\./, "cost[].");
}

function fieldLabel(f) {
  return labelFor(labelPath(f.field), f.type);
}

function typeLabel(f) {
  return sourceTypeLabel(f.type);
}

const CODE_MESSAGES = {
  container_kind_invalid: () => "Choose a book collection or furnishing folio.",
  container_self: () => "An item cannot contain itself.",
  container_missing: () => "Add the parent container first, or check its item ID.",
  version_required: () => "Pick which game update this record belongs to.",
  version_unknown: () => "That game update is not in the list.",
  type_required: () => "This record has no source. Open it in Batch edit.",
  wrong_file: () =>
    "This record is filed under the wrong kind of source. Open it in Batch edit.",
  required_field_missing: (f) => `${fieldLabel(f)} is needed for a ${typeLabel(f)} record.`,
  cost_amount_invalid: () => "A price has to be a whole number, 1 or more.",
  id_invalid: () => "That item number is not valid.",
  blueprint_invalid: () => "That blueprint number is not valid.",
  identity_required: () => "This record needs a positive item number or blueprint number.",
  note_separator: () => "Put one thing in Extra detail, not two joined together.",
  composite_duplicate: () => "There is already a record exactly like this one.",
  unknown_symbol: (f) => `${fieldLabel(f)}: "${f.value}" is not in the list.`,
  undefined_in_library: () => "Known problem in the source data - not something you did.",
  // Fires only for a key the model does not know at all
  field_not_allowed: (f) =>
    `${fieldLabel(f)} is not a field this site recognises. Remove it to save.`,

  source_required: () => "This record has no source. Open it in Batch edit.",
  availability_required: () =>
    "This record does not say when it was available. Open it in Batch edit.",
  type_unknown: (f) => `"${f.value}" is not a kind of source this site knows.`,
  no_contract: () =>
    "This site does not know what this kind of source needs. Open it in Batch edit.",
  cost_invalid: () => "The price has to be a list of amounts, or nothing at all.",
  currency_required: () => "Pick which currency the price is in.",
  date_format: (f) => `${fieldLabel(f)} has to be a date, written like 2024-03-31.`,
  note_invalid: () => "Extra detail has to be some words, or nothing at all.",
  note_packed: () =>
    "Extra detail has parts joined with ^. Say one thing here and put the rest in its own field.",
  note_is_zone: (f) => `"${f.value}" is a game zone - put it in Zone.`,
  note_is_place: (f) => `"${f.value}" is a known place - put it in Place.`,
  location_is_place: (f) => `"${f.value}" is a place, not a game zone - put it in Place.`,
  place_is_zone: (f) => `"${f.value}" is a game zone - put it in Zone.`,
  subtype_not_subtyped: () => "This kind of source has no sub-kinds to pick from.",
  locations_invalid: () => "Several places have to be a list, one zone or place per row.",
  placement_empty: () => "Each row of the place list needs a zone or a place.",
  cost_entry_invalid: () =>
    "Each price needs an amount and a currency. One of them is empty.",
  int_required: (f) => `${fieldLabel(f)} has to be a whole number.`,
  bool_required: (f) => `${fieldLabel(f)} is either ticked or left out.`,
  id_zero_not_allowed: (f) =>
    `${fieldLabel(f)} cannot be 0. Some fields use 0 for "needed, but not ` +
    `recorded"; this is not one of them.`,
  int_list_required: (f) => `${fieldLabel(f)} has to be whole numbers, separated by commas.`,
  id_cross_file: (f) => `This item number is also used in: ${f.value}.`,
  // Raised by the masks: the same id with a different source is the normal multi-source case, worth a look but never a block.
  ignored_item: () => ignoredMessage,
  same_id_other_source: () =>
    "This item already has other records here - check you are not adding the same one twice.",
};

// An unknown code degrades to the raw `message`, so a code added without a sentence is visible but not fatal.
export function messageFor(finding) {
  if (!finding) return "";
  const fn = CODE_MESSAGES[finding.code];
  return fn ? fn(finding) : String(finding.message ?? "");
}

export function knownCodes() {
  return Object.keys(CODE_MESSAGES);
}

// Memoised per enums object, since a maintenance sweep validates the whole record set. Invalidated when the vocabulary array is replaced or grows: the enum editor mirrors new values into the live enums object.
const symbolSetCache = new WeakMap();
function symbolSet(enums, key, force = false) {
  if (!enums || typeof enums !== "object") return new Set();
  let byKey = symbolSetCache.get(enums);
  if (!byKey) { byKey = new Map(); symbolSetCache.set(enums, byKey); }
  const list = enums[key];
  const len = Array.isArray(list) ? list.length : 0;
  let hit = byKey.get(key);
  if (force || !hit || hit.list !== list || hit.len !== len) {
    hit = { list, len, set: new Set(symbolsOf(enums, key)) };
    byKey.set(key, hit);
  }
  return hit.set;
}

// Rebuilds on a miss: a vocabulary that lost one value and gained another keeps its length and array, so the memo would survive without the new value
function hasSymbol(enums, key, member) {
  if (symbolSet(enums, key).has(member)) return true;
  return symbolSet(enums, key, true).has(member);
}

// `allRecords` is optional; pass it to also get the composite-identity duplicate check.
export function validateRecord(record, enums, allRecords) {
  const errors = [];
  const warnings = [];
  // source.type is stamped on every finding afterwards, so a per-type label override resolves even for findings raised before check 2.
  const err = (field, message, code, extra) =>
    errors.push({ level: "error", field, message, code, ...extra });
  // Kept for symmetry: no record-level check warns today.
  const warn = (field, message, code, extra) =>
    warnings.push({ level: "warning", field, message, code, ...extra });

  // 1. Required top-level fields. Furnishing records identify by `id`, recipes by `blueprint`; at least one is required.
  if (hasOwn(record, "id") && !isPositiveInt(record.id)) {
    err("id", "id must be a positive integer", "id_invalid");
  }
  if (hasOwn(record, "blueprint") && !isPositiveInt(record.blueprint)) {
    err("blueprint", "blueprint must be a positive integer", "blueprint_invalid");
  }
  if (!hasOwn(record, "id") && !hasOwn(record, "blueprint")) {
    err("id", "record requires a positive id or blueprint", "identity_required");
  }
  if (!record.source || typeof record.source !== "object") {
    err("source", "source object is required", "source_required");
  }
  if (!record.availability || typeof record.availability !== "object") {
    err("availability", "availability object is required", "availability_required");
  }
  if (!Array.isArray(record.cost)) {
    err("cost", "cost must be an array (use [] when free)", "cost_invalid");
  }

  if (record.container != null && !["books", "folio"].includes(record.container)) err("container", "Choose a book collection or furnishing folio.", "container_kind_invalid");
  if (record.source?.part_of === record.id || record.source?.part_of === record.blueprint) {
    if (record.source?.part_of != null) err("source.part_of", "An item cannot contain itself.", "container_self");
  }

  // 2. source.type
  const type = record.source?.type;
  if (!type) {
    err("source.type", "source.type is required", "type_required");
  } else if (!isSourceSlug(type) || !enums.source_types.includes(type)) {
    err("source.type", `unknown source.type "${type}"`, "type_unknown", { value: type });
  } else if (record._category && type !== record._category) {
    // `_category` is the loader's filename tag, so a mismatch means the record sits in the wrong data file.
    err("source.type",
      `record is in the wrong file: source.type "${type}" does not match category "${record._category}"`,
      "wrong_file");
  }

  // 3. availability.version
  const ver = record.availability?.version;
  if (!ver) {
    err("availability.version", "availability.version is required", "version_required");
  } else if (!hasSymbol(enums, "versions", ver)) {
    err("availability.version", `unknown version "${ver}"`, "version_unknown", { value: ver });
  }

  // 4. availability dates
  const av = record.availability || {};
  if (av.last_seen != null && !DATE_RE.test(String(av.last_seen))) {
    err("availability.last_seen", "last_seen must be YYYY-MM-DD", "date_format",
      { value: av.last_seen });
  }
  // The envelope is closed: without this a retired field keeps validating clean for as long as anything still writes it.
  for (const k of Object.keys(av)) {
    if (!AVAILABILITY_FIELDS.has(k)) {
      err(`availability.${k}`, `availability.${k} is not an availability field`,
        "field_not_allowed");
    }
  }

  // 5. cost
  if (Array.isArray(record.cost)) {
    record.cost.forEach((c, i) => {
      // A malformed entry must produce a finding, not a TypeError that takes the whole validation pass down.
      if (!c || typeof c !== "object" || Array.isArray(c)) {
        err(`cost.${i}`, "each cost entry must be an object with an amount and a currency",
          "cost_entry_invalid", { value: c });
        return;
      }
      if (!isInt(c.amount) || c.amount < 1) {
        err(`cost.${i}.amount`, "amount must be an integer >= 1", "cost_amount_invalid",
          { value: c.amount });
      }
      if (!c.currency) {
        err(`cost.${i}.currency`, "currency is required", "currency_required");
      } else if (!enums.currencies.includes(c.currency)) {
        err(`cost.${i}.currency`, `unknown currency "${c.currency}"`,
          "unknown_symbol", { value: c.currency });
      }
    });
  }

  // 7. rarity: top-level on older rows, source.rarity on drop / dungeon_drop.
  for (const [field, v] of [["rarity", record.rarity], ["source.rarity", record.source?.rarity]]) {
    if (v != null && Array.isArray(enums.rarities) && !enums.rarities.includes(v)) {
      err(field, `unknown rarity "${v}"`, "unknown_symbol", { value: v });
    }
  }

  // 8. per-source-type field contract
  const contract = enums.source_type_contracts?.[type];
  if (type && enums.source_types.includes(type)) {
    if (!contract) {
      err("source.type", `no contract defined for "${type}" in enums.source_type_contracts`,
        "no_contract", { value: type });
    } else {
      const required = contract.required || [];
      for (const reqf of required) {
        const v = record.source?.[reqf];
        if (v == null || v === "" || (Array.isArray(v) && !v.length)) {
          err(`source.${reqf}`, `source.${reqf} is required for ${type}`,
            "required_field_missing");
        }
      }
      // The closed set is the model's, not this type's: every field any contract names is legal here, plus `note`.
      const known = allowedSourceFields(enums.source_type_contracts);
      for (const k of Object.keys(record.source || {})) {
        if (k === "type") continue;
        if (!known.has(k)) {
          err(`source.${k}`, `source.${k} is not a source field`, "field_not_allowed");
        }
      }
    }
  }

  // 9. source.* vocabulary membership
  for (const [field, enumKey] of Object.entries(sourceEnumFields(enums))) {
    const v = record.source?.[field];
    if (v == null || v === "") continue;
    if (!Array.isArray(enums[enumKey])) continue;   // vocabulary absent (v1 enums)
    // A list-valued field checks every member, so a field turning plural upstream stays checked.
    const members = Array.isArray(v) ? v : [v];
    for (const member of members) {
      if (!hasSymbol(enums, enumKey, member)) {
        err(`source.${field}`, `unknown ${field} "${member}" (not in enums.${enumKey})`,
          "unknown_symbol", { value: member });
        continue;
      }
      // In the vocabulary but without a game id in the library: the label cannot resolve in-game, so surface the defect instead of hiding it.
      const entry = entryOf(enums, enumKey, member);
      if (entry && entry.undefined_in_library) {
        err(`source.${field}`,
          `${field} "${member}" is not defined in the library - enums.${enumKey} carries no game id for it`,
          "undefined_in_library", { value: member });
      }
    }
  }

  // 9b. source.note
  const note = record.source?.note;
  if (note != null) {
    if (typeof note !== "string" || note === "") {
      err("source.note", "note must be a non-empty string", "note_invalid");
    } else if (note.includes(" + ")) {
      err("source.note",
        'note carries the legacy " + " source separator - a second source is a second record',
        "note_separator", { value: note });
    } else if (note.includes("^")) {
      err("source.note",
        'note carries a "^" packing marker - a qualifier with parts gets fields, not a delimiter',
        "note_packed", { value: note });
    } else if (hasSymbol(enums, "locations", note)) {
      err("source.note",
        `"${note}" is a game zone - put it in a placement\u0027s location`,
        "note_is_zone", { value: note });
    } else if (hasSymbol(enums, "places", note)) {
      err("source.note",
        `"${note}" is a known place - put it in a placement\u0027s place`,
        "note_is_place", { value: note });
    }
  }

  // The `<type>_subtypes` key pattern in enums.json states which types are subtyped and with what vocabulary.
  const subVal = record.source?.subtype;
  if (subVal != null && subVal !== "") {
    const vocabKey = `${type}_subtypes`;
    if (!Array.isArray(enums[vocabKey])) {
      err("source.subtype", `source.type "${type}" has no subtype vocabulary`,
        "subtype_not_subtyped", { value: subVal });
    } else if (!hasSymbol(enums, vocabKey, subVal)) {
      err("source.subtype", `unknown subtype "${subVal}" (not in enums.${vocabKey})`,
        "unknown_symbol", { value: subVal });
    }
  }

  // 9c. source.locations: one list at every cardinality. Each entry names a zone, a place, or both; a value in the wrong half is told which half it belongs in.
  const locs = record.source?.locations;
  if (locs != null) {
    if (!Array.isArray(locs) || locs.length === 0) {
      err("source.locations", "locations must be a non-empty list of placements",
        "locations_invalid");
    } else {
      locs.forEach((p, i) => {
        if (!p || typeof p !== "object" || Array.isArray(p)
            || (p.location == null && p.place == null)) {
          err(`source.locations.${i}`, "each placement needs a location or a place",
            "placement_empty");
          return;
        }
        if (p.location != null && !hasSymbol(enums, "locations", p.location)) {
          if (hasSymbol(enums, "places", p.location)) {
            err(`source.locations.${i}`,
              `"${p.location}" is a place, not a game zone - put it in place`,
              "location_is_place", { value: p.location });
          } else {
            err(`source.locations.${i}`, `unknown location "${p.location}"`,
              "unknown_symbol", { value: p.location });
          }
        }
        if (p.place != null && !hasSymbol(enums, "places", p.place)) {
          if (hasSymbol(enums, "locations", p.place)) {
            err(`source.locations.${i}`,
              `"${p.place}" is a game zone - put it in location`,
              "place_is_zone", { value: p.place });
          } else {
            err(`source.locations.${i}`, `unknown place "${p.place}"`,
              "unknown_symbol", { value: p.place });
          }
        }
      });
    }
  }

  // 10. Integer source fields. A zero is legal only where enums.id_unknown declares the unknown-id sentinel; a negative is never an id.
  const sentinelFields = unknownIdFields(enums);
  for (const intField of ["achievement", "quest", "skill_rank",
    "collectible", "part_of"]) {
    const v = record.source?.[intField];
    if (v == null) continue;
    if (!isInt(v)) {
      err(`source.${intField}`, `${intField} must be an integer`, "int_required", { value: v });
    } else if (v === 0 && !sentinelFields.includes(intField)) {
      err(`source.${intField}`,
        `${intField} cannot be 0 - no "not recorded" state is declared for it`,
        "id_zero_not_allowed", { value: v });
    } else if (v < 0) {
      err(`source.${intField}`, `${intField} must be a positive id`,
        "int_required", { value: v });
    }
  }
  // `leads` is a flag: true, or absent for a single lead.
  if (record.source?.leads != null && record.source.leads !== true) {
    err("source.leads", "leads is either ticked or absent", "bool_required",
      { value: record.source.leads });
  }
  // Integer-array source fields. A symbol list (packs) is checked in 9 instead.
  for (const arrField of ["houses"]) {
    const v = record.source?.[arrField];
    if (v == null) continue;
    if (!Array.isArray(v)) {
      err(`source.${arrField}`, `${arrField} must be an array of integers`, "int_list_required");
    } else if (!v.every(isInt)) {
      err(`source.${arrField}`, `every ${arrField} entry must be an integer`, "int_list_required");
    }
  }

  // 11. Composite-identity duplicate: only a byte-identical (id, blueprint, source) in the same category is an error.
  if (Array.isArray(allRecords) && validIdentity(record)) {
    const category = record._category || type;
    const { exact } = findDuplicateRecord(
      record.id, category, record.source, allRecords, record._key, record.blueprint);
    if (exact) {
      err(identityField(record),
        `exact duplicate: ${identityText(record.id, record.blueprint)} with an identical source already exists in category "${category}"`,
        "composite_duplicate");
    }
  }

  // The presentation map needs source.type for per-type label overrides.
  for (const f of [...errors, ...warnings]) {
    if (f.type === undefined) f.type = type;
  }

  return { errors, warnings };
}

// JSON with recursively sorted keys: two records are the same source iff these strings are identical. Only sorts; does not strip `_`-keys.
export function canonicalSource(source) {
  return JSON.stringify(sortKeysDeep(source ?? null));
}

// Keeps an omitted id/blueprint distinct from any explicit value.
function identityKey(id, blueprint, source) {
  const part = (value) => value === undefined ? ["absent"] : ["value", value];
  return JSON.stringify([part(id), part(blueprint), canonicalSource(source)]);
}

// Arrays keep their order (meaningful in cost/packs).
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep(v[k]);
    return out;
  }
  return v;
}

// Run before a record enters the buffer. Returns { exact, sameId }:
//   exact  - same category, same id/blueprint pair and identical canonical source: a copy-paste error.
//   sameId - same category and pair but a different source: another source of the same item, never blocks.
// The same identity in a different category is legitimate and not reported. `excludeKey` lets an update skip the record being edited.
export function findDuplicateRecord(id, category, source, allRecords, excludeKey,
  blueprint = undefined) {
  const result = { exact: null, sameId: [] };
  if ((id !== undefined && !isPositiveInt(id))
      || (blueprint !== undefined && !isPositiveInt(blueprint))
      || (id === undefined && blueprint === undefined)) return result;
  const canon = canonicalSource(source);
  for (const r of allRecords) {
    if (r._category !== category) continue;   // cross-category dup is allowed
    if (r.id !== id || r.blueprint !== blueprint) continue;
    if (excludeKey != null && r._key === excludeKey) continue;
    if (canonicalSource(r.source) === canon) {
      if (!result.exact) result.exact = r;
    } else {
      result.sameId.push(r);
    }
  }
  return result;
}

function findingSignature(f) {
  return `${f.field}|${f.code || ""}|${f.message}`;
}

// A finding the record already carried before the edit does not block submission: it moves to `preexisting`, which the change list reports as KNOWN PROBLEM. Otherwise a contributor fixing a known-broken record could save it but never send it. Same delta over the same validator as the modal.
export function validateBuffer(buffer, enums, allRecords) {
  let errors = 0;
  let warnings = 0;
  const perEntry = new Map();

  // Duplicates count on the composite key (id/blueprint + canonical source), never on an identity field alone.
  const compositeByCategory = new Map(); // category -> Map<identityKey, count>
  const idGlobal = new Map();            // id -> Set<category>
  for (const r of allRecords) {
    if (!validIdentity(r)) continue;
    const cat = r._category;
    if (!compositeByCategory.has(cat)) compositeByCategory.set(cat, new Map());
    const m = compositeByCategory.get(cat);
    const ck = identityKey(r.id, r.blueprint, r.source);
    m.set(ck, (m.get(ck) || 0) + 1);
    if (isPositiveInt(r.id)) {
      if (!idGlobal.has(r.id)) idGlobal.set(r.id, new Set());
      idGlobal.get(r.id).add(cat);
    }
  }

  for (const entry of buffer.list()) {
    const findings = { errors: [], warnings: [], preexisting: [] };
    const rec = entry.after; // delete entries have no `after`

    if (entry.op !== "delete" && rec) {
      // Buffer snapshots omit _key; duplicate counting below includes the live row once.
      const { errors: e, warnings: w } = validateRecord(rec, enums);
      findings.errors.push(...e);
      if (rec.source?.part_of && !allRecords.some(r => r.id === rec.source.part_of && r.container)) {
        findings.errors.push({ level: "error", field: "source.part_of", code: "container_missing", message: "Add the parent container first, or check its item ID." });
      }
      findings.warnings.push(...w);

      // Wrong-file fallback for records without a `_category` tag; tagged records are covered by validateRecord.
      const stype = rec.source?.type;
      const moving = entry.op === "update" && entry.before?.source?.type === entry.category
        && stype !== entry.category;
      if (stype && !rec._category && entry.category && stype !== entry.category && !moving) {
        findings.errors.push({
          level: "error", field: "source.type", code: "wrong_file", type: stype,
          message: `record is in the wrong file: source.type "${stype}" does not match category "${entry.category}"`,
        });
      }

      // Exact duplicate within category, for adds and updates alike: editing a row until it matches another is the same error as pasting it. app.js mirrors both into allRecords.
      if (validIdentity(rec)) {
        const m = compositeByCategory.get(moving ? stype : entry.category);
        const ck = identityKey(rec.id, rec.blueprint, rec.source);
        // The record itself is in that count, so > 1 means a genuine twin.
        if (m && (m.get(ck) || 0) > 1) {
          findings.errors.push({
            level: "error", field: identityField(rec), code: "composite_duplicate",
            type: rec.source?.type,
            message: `exact duplicate: ${identityText(rec.id, rec.blueprint)} with an identical source already exists in category "${entry.category}"`,
          });
        }
      }
      if (isPositiveInt(rec.id)) {
        const cats = idGlobal.get(rec.id);
        if (cats && cats.size > 1) {
          const others = [...cats].filter((c) => c !== entry.category).join(", ");
          findings.warnings.push({
            level: "warning", field: "id", code: "id_cross_file",
            type: rec.source?.type, value: others,
            message: `id ${rec.id} also appears in: ${others}`,
          });
        }
      }
    }

    if (entry.before) {
      const had = new Set(
        validateRecord(entry.before, enums).errors.map(findingSignature));
      if (had.size) {
        const fresh = [];
        for (const f of findings.errors) {
          if (had.has(findingSignature(f))) findings.preexisting.push(f);
          else fresh.push(f);
        }
        findings.errors = fresh;
      }
    }

    // An ordinary add must not bypass an existing exclusion; editing the ignored record itself is the route for restoring an item.
    if (entry.op === "add" && rec?.source?.type !== "ignored" && isIgnoredItem(rec, allRecords)) {
      if (!findings.errors.some((f) => f.code === "ignored_item")) {
        findings.errors.push({ level: "error", field: "id", code: "ignored_item", message: ignoredMessage });
      }
    }
    errors += findings.errors.length;
    warnings += findings.warnings.length;
    perEntry.set(entry.key, findings);
  }

  return { errors, warnings, perEntry };
}
