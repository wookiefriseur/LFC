import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { isIgnoredItem } from "../../docs/ignored-items.js";
import { parseDiscovery, discoveryKnown } from "../../docs/discovery.js";
import { DirtyBuffer, serialiseDiff } from "../../docs/diff.js";
import { ReferenceData } from "../../docs/reference-data.js";
import { validateRecord, validateBuffer } from "../../docs/validate.js";
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
  const lua = fs.readFileSync(new URL("../../LibFurnitureCatalogue/data/IgnoredItems.lua", import.meta.url), "utf8");
  const ids = [...lua.matchAll(/^\s*\[(\d+)\]\s*=/gm)].map((m) => Number(m[1]));
  assert.deepEqual(ids.sort((a,b) => a-b), ignoredRecords.map((r) => r.id).sort((a,b) => a-b));
});
