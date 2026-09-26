#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DirtyBuffer, serialiseDiff, MUTABLE_FIELDS } from "../../docs/diff.js";
import { ENUM_KINDS } from "../../docs/maintenance.js";
import { NAME_KINDS } from "../../docs/reference-data.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.resolve(HERE, "..", "..", "schemas", "diff-line.schema.json");
const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);

let failed = 0;
const ok = (name) => console.log(`  ok   ${name}`);
const fail = (name, why) => { failed++; console.log(`  FAIL ${name}\n       ${why}`); };

function sample(field) {
  if (field.type === "int") return Math.max(field.min || 1, 7);
  if (field.key === "si") return "SI_FURC_TEST_ENTRY";
  if (field.key === "season") return "2026-06";
  return "Test entry";
}

function lineFor(kind, meta) {
  const buffer = new DirtyBuffer();
  buffer.addEnum(`enum#${kind.key}:NEW_VALUE`, kind.key, "NEW_VALUE", meta);
  const lines = serialiseDiff(buffer).split("\n").filter(Boolean);
  if (lines.length !== 1) throw new Error(`expected one line, got ${lines.length}`);
  return JSON.parse(lines[0]);
}

for (const kind of ENUM_KINDS) {
  const meta = {};
  for (const f of kind.meta) meta[f.key] = sample(f);
  meta.symbol = "NEW_VALUE";
  const line = lineFor(kind, meta);
  if (validate(line)) ok(`add-enum ${kind.key}`);
  else fail(`add-enum ${kind.key}`,
    `${JSON.stringify(line)}\n       ${JSON.stringify(validate.errors)}`);
}

for (const kind of ENUM_KINDS.filter((k) => k.meta.some((f) => !f.required))) {
  const meta = { symbol: "NEW_VALUE" };
  for (const f of kind.meta) meta[f.key] = f.required ? sample(f) : "";
  const line = lineFor(kind, meta);
  if (validate(line)) ok(`add-enum ${kind.key} with the optional extras blank`);
  else fail(`add-enum ${kind.key} with the optional extras blank`,
    `${JSON.stringify(line)}\n       ${JSON.stringify(validate.errors)}`);
}

{
  const rec = {
    id: 126560, source: { type: "luxury", vendor: "LUXF" },
    cost: [{ currency: "GOLD", amount: 50000 }],
    availability: { version: "THIEVES" },
  };
  const buffer = new DirtyBuffer();
  buffer.add("luxury#1", rec, "luxury");
  buffer.update("luxury#2", rec, { ...rec, cost: [] }, "luxury");
  buffer.delete("luxury#3", rec, "luxury");
  for (const raw of serialiseDiff(buffer).split("\n").filter(Boolean)) {
    const line = JSON.parse(raw);
    if (validate(line)) ok(`op ${line.op}`);
    else fail(`op ${line.op}`, JSON.stringify(validate.errors));
  }
}

const table = schema.$defs.metaFor;
for (const kind of ENUM_KINDS) {
  const entry = table[kind.key];
  if (!entry) { fail(`table ${kind.key}`, "the schema has no conditional for it"); continue; }
  const wantKeys = kind.meta.map((f) => f.key).sort();
  const wantReq = kind.meta.filter((f) => f.required).map((f) => f.key).sort();
  if (wantKeys.length === 0) {
    const forbids = entry.then?.not?.required?.includes("meta");
    if (forbids) ok(`table ${kind.key} (flat, meta forbidden)`);
    else fail(`table ${kind.key}`, "a flat vocabulary must forbid meta");
    continue;
  }
  const got = entry.then?.properties?.meta || {};
  const gotKeys = [...(got.propertyNames?.enum || [])].sort();
  const gotReq = [...(got.required || [])].sort();
  if (gotKeys.join(",") !== wantKeys.join(",")) {
    fail(`table ${kind.key}`, `keys: schema [${gotKeys}] vs editor [${wantKeys}]`);
  } else if (gotReq.join(",") !== wantReq.join(",")) {
    fail(`table ${kind.key}`, `required: schema [${gotReq}] vs editor [${wantReq}]`);
  } else {
    ok(`table ${kind.key}`);
  }
}

for (const key of Object.keys(table)) {
  if (key === "description") continue;
  if (!ENUM_KINDS.some((k) => k.key === key)) {
    fail(`table ${key}`, "the schema names a vocabulary the editor does not offer");
  }
}

const wrong = { v: 1, op: "add-enum", enum: "places", value: "NEW_VALUE", meta: { crate: 7 } };
if (!validate(wrong)) ok("a places entry carrying a crates key is refused");
else fail("a places entry carrying a crates key is refused", "it validated");

const bare = { v: 1, op: "add-enum", enum: "places", value: "NEW_VALUE" };
if (!validate(bare)) ok("a places entry with no meta at all is refused");
else fail("a places entry with no meta at all is refused", "it validated");

const flat = { v: 1, op: "add-enum", enum: "currencies", value: "NEW_VALUE", meta: { name: "x" } };
if (!validate(flat)) ok("a currencies entry carrying meta is refused");
else fail("a currencies entry carrying meta is refused", "it validated");

function recordLine(record) {
  const buffer = new DirtyBuffer();
  buffer.add("rec#1", record, "recipe");
  return JSON.parse(serialiseDiff(buffer).split("\n").filter(Boolean)[0]);
}
const base = { source: { type: "recipe" }, cost: [], availability: { version: "HOMESTEAD" } };
for (const [name, ids] of [["furnishing only", { id: 114327 }],
                           ["blueprint only", { blueprint: 118991 }],
                           ["paired", { id: 114327, blueprint: 118991 }]]) {
  const line = recordLine({ ...ids, ...base });
  if (validate(line)) ok(`an add line for a ${name} record validates`);
  else fail(`an add line for a ${name} record validates`, JSON.stringify(validate.errors));
}
const anonymous = { v: 1, op: "add", category: "recipe", record: base };
if (!validate(anonymous)) ok("an add line naming neither id nor blueprint is refused");
else fail("an add line naming neither id nor blueprint is refused", "it validated");

const updatable = schema.oneOf[0].properties.fields.propertyNames.enum;
const drift = [...MUTABLE_FIELDS].filter((f) => !updatable.includes(f))
  .concat(updatable.filter((f) => !MUTABLE_FIELDS.has(f)));
if (drift.length === 0) ok("every field the editor can change is one an update line may carry");
else fail("every field the editor can change is one an update line may carry", drift.join(", "));

function updateLine(before, after) {
  const buffer = new DirtyBuffer();
  buffer.update("container#1", before, after, "writ_vendor");
  return JSON.parse(serialiseDiff(buffer).split("\n").filter(Boolean)[0]);
}
const folio = { id: 171568, source: { type: "writ_vendor" }, cost: [], availability: { version: "HOMESTEAD" } };
for (const [name, after] of [["set", { ...folio, container: "folio" }], ["cleared", folio]]) {
  const before = name === "set" ? folio : { ...folio, container: "folio" };
  const line = updateLine(before, after);
  if (validate(line)) ok(`an update line with the container kind ${name} validates`);
  else fail(`an update line with the container kind ${name} validates`, JSON.stringify(validate.errors));
}
const badKind = { v: 1, op: "update", category: "writ_vendor", id: 171568, fields: { container: "crate" } };
if (!validate(badKind)) ok("an unknown container kind is refused");
else fail("an unknown container kind is refused", "it validated");

{
  const buffer = new DirtyBuffer();
  buffer.setName("houses", 1060, "en", "Mara's Kiss Public House", "Old name");
  buffer.setName("quests", 12, "en", "Same", "Same");
  const lines = serialiseDiff(buffer).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (lines.length === 1 && validate(lines[0])) ok("a name line validates, and a name equal to the published one makes none");
  else fail("a name line validates, and a name equal to the published one makes none", JSON.stringify([lines, validate.errors]));
}
const nameKinds = schema.oneOf.find((b) => b.title === "name").properties.kind.enum;
if (nameKinds.join(",") === NAME_KINDS.join(",")) ok("the name kinds are the ones the site loads");
else fail("the name kinds are the ones the site loads", `schema [${nameKinds}] vs site [${NAME_KINDS}]`);
for (const [what, line] of [
  ["an unknown name kind", { v: 1, op: "name", kind: "npcs", id: 5, locale: "en", name: "x" }],
  ["a name for id 0", { v: 1, op: "name", kind: "quests", id: 0, locale: "en", name: "x" }],
  ["an empty name", { v: 1, op: "name", kind: "quests", id: 5, locale: "en", name: "" }],
]) {
  if (!validate(line)) ok(`${what} is refused`);
  else fail(`${what} is refused`, "it validated");
}

console.log(failed ? `\n${failed} failure(s)` : "\nall green");
process.exit(failed ? 1 : 0);
