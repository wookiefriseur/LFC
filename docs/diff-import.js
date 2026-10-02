// Reads a contribution diff back into change-list steps: the inverse of serialiseDiff, so a pasted issue can be reviewed against the loaded catalogue
import { DIFF_VERSION, MUTABLE_FIELDS } from "./diff.js";
import { canonicalSource, findDuplicateRecord } from "./validate.js";
import { NAME_KINDS } from "./reference-data.js";
import { mirror, newKey } from "./data.js";
import { queueEnumValue } from "./maintenance.js";

const BEGIN = "[//]: # (diff-begin)";
const END = "[//]: # (diff-end)";
const FENCE = /^```\w*$/;
const OPS = new Set(["update", "add", "delete", "add-enum", "name", "item"]);
const SYMBOL = /^[A-Z][A-Z0-9_]*$/;

function count(text, marker) {
  return text.split(marker).length - 1;
}

function isDiffLine(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && "v" in value && "op" in value;
}

/**
 * Decides the whole paste before anything is parsed, so a dump is never read as a diff or the other way round.
 * @returns {null | {lines: {line: object, lineNo: number}[], complete: boolean}} null when the text is not a diff (a dump or records). Throws when it is ambiguous or malformed. `complete` is only known when the diff-begin/diff-end markers were pasted with it
 */
export function readDiff(text) {
  text = String(text ?? "");
  const marked = text.includes(BEGIN) || text.includes(END);
  if (marked && !(count(text, BEGIN) === 1 && count(text, END) === 1 && text.indexOf(BEGIN) < text.indexOf(END))) {
    throw new Error("expected exactly one diff-begin ... diff-end block");
  }
  const offset = marked ? text.slice(0, text.indexOf(BEGIN)).split("\n").length - 1 : 0;
  const body = marked ? text.slice(text.indexOf(BEGIN) + BEGIN.length, text.indexOf(END)) : text;
  const lines = [];
  const broken = [];
  let other = 0;
  body.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t || FENCE.test(t)) return;
    let value;
    try {
      value = JSON.parse(t);
    } catch {
      broken.push(offset + i + 1);
      return;
    }
    if (isDiffLine(value)) lines.push({ line: value, lineNo: offset + i + 1 });
    else other++;
  });
  if (!marked && lines.length === 0) return null;
  // A selection that cut a line in half must not load as if it were the whole diff
  if (broken.length) {
    throw new Error(`line ${broken.join(", ")} is not complete JSON: copy the whole diff again`);
  }
  if (other) {
    throw new Error(marked
      ? `the diff block has ${other} line(s) that are not diff lines`
      : `${lines.length} diff line(s) mixed with ${other} other line(s): paste either a diff or a dump`);
  }
  if (lines.length === 0) throw new Error("the diff block is empty");
  return { lines, complete: marked };
}

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function strip(record) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith("_")));
}

function identity(line) {
  return `id ${line.id ?? "-"}${line.blueprint === undefined ? "" : ` / blueprint ${line.blueprint}`}`;
}

// The consumer's rule: identity plus `match`, when given, must address exactly one loaded record of the file.
function target(line, records) {
  const match = line.match === undefined ? null : canonicalSource(line.match);
  const hits = records.filter((r) => r._category === line.category
    && (line.id === undefined || r.id === line.id)
    && (line.blueprint === undefined || r.blueprint === line.blueprint)
    && (match === null || canonicalSource(strip(r.source || {})) === match));
  if (hits.length !== 1) throw new Error(`${line.op} ${identity(line)} in ${line.category}: expected one matching record, found ${hits.length}`);
  return hits[0];
}

function checkEnvelope(line) {
  if (line.v !== DIFF_VERSION) throw new Error(`unsupported diff version ${JSON.stringify(line.v)}`);
  if (!OPS.has(line.op)) throw new Error(`unknown operation ${JSON.stringify(line.op)}`);
  if (["update", "add", "delete"].includes(line.op)) {
    if (typeof line.category !== "string" || !line.category) throw new Error(`${line.op} needs a category`);
    if (line.id === undefined && line.blueprint === undefined) throw new Error(`${line.op} needs an id or a blueprint`);
  }
}

/**
 * Plans every line against the loaded catalogue without changing it. All or nothing: any error means no steps.
 * @param ctx {{ records: object[], enums: object, namesLocale: string, publishedName: (kind: string, id: number) => string|null, publishedItem?: (id: number) => {name: string|null, meta: object|null} }}
 * @returns {{ steps: object[], errors: string[], warnings: string[] }}
 */
export function planDiff(lines, ctx) {
  const errors = [];
  const warnings = [];
  const steps = [];
  // Vocabulary additions come first so the records that use them validate; the consumer applies them in the same order.
  const enums = clone(ctx.enums);
  const ordered = [...lines].sort((a, b) => (b.line.op === "add-enum") - (a.line.op === "add-enum"));
  const touched = new Set();
  const added = new Set();
  for (const { line, lineNo } of ordered) {
    try {
      checkEnvelope(line);
      if (line.op === "add-enum") {
        const list = enums[line.enum];
        if (!Array.isArray(list)) throw new Error(`unknown vocabulary ${JSON.stringify(line.enum)}`);
        if (!SYMBOL.test(String(line.value))) throw new Error(`invalid vocabulary symbol ${JSON.stringify(line.value)}`);
        const entry = line.meta ? { symbol: line.value, ...line.meta } : line.value;
        const found = list.find((e) => (typeof e === "string" ? e : e?.symbol) === line.value);
        if (found !== undefined) {
          if (JSON.stringify(found) !== JSON.stringify(entry)) throw new Error(`${line.value} is already in ${line.enum} with different details`);
          warnings.push(`line ${lineNo}: ${line.value} is already in ${line.enum}`);
          continue;
        }
        list.push(entry);
        steps.push({ op: "add-enum", enumName: line.enum, value: line.value, meta: line.meta ?? null });
      } else if (line.op === "name") {
        if (!NAME_KINDS.includes(line.kind)) throw new Error(`unknown name list ${JSON.stringify(line.kind)}`);
        if (line.locale !== ctx.namesLocale) throw new Error(`name locale ${line.locale} is not the site's (${ctx.namesLocale})`);
        if (!Number.isSafeInteger(line.id) || line.id < 1 || typeof line.name !== "string" || !line.name.trim()) throw new Error("name needs an id and a name");
        steps.push({ op: "name", kind: line.kind, id: line.id, locale: line.locale, name: line.name,
          before: ctx.publishedName(line.kind, line.id) });
      } else if (line.op === "item") {
        const meta = line.reference?.meta;
        if (!Number.isSafeInteger(line.id) || line.id < 1 || meta?.id !== line.id || typeof meta.name !== "string" || !meta.name.trim()) {
          throw new Error("item details need an id and discovery metadata for that id");
        }
        if (!ctx.records.some((r) => r.id === line.id)) throw new Error(`item ${line.id} is not in the catalogue`);
        if (touched.has(`item:${line.id}`)) throw new Error(`item ${line.id}: details are changed twice`);
        touched.add(`item:${line.id}`);
        steps.push({ op: "item", id: line.id, reference: clone(line.reference), previous: ctx.publishedItem?.(line.id) ?? null });
      } else if (line.op === "add") {
        const record = line.record;
        if (!record || typeof record !== "object" || record.source?.type !== line.category) throw new Error(`add ${identity(line)}: the record's source type must be ${line.category}`);
        if (record.id !== line.id || record.blueprint !== line.blueprint) throw new Error(`add ${identity(line)}: identity disagrees with its record`);
        const key = `${line.category}|${canonicalSource([record.id, record.blueprint, record.source])}`;
        if (added.has(key) || findDuplicateRecord(record.id, line.category, record.source, ctx.records, undefined, record.blueprint).exact) {
          throw new Error(`add ${identity(line)}: this record is already in ${line.category}`);
        }
        added.add(key);
        if (line.reference && line.reference.meta?.id !== record.id) throw new Error(`add ${identity(line)}: discovery metadata names another id`);
        steps.push({ op: "add", record: clone(record), category: line.category, reference: line.reference ?? null });
      } else {
        const live = target(line, ctx.records);
        if (touched.has(live._key)) throw new Error(`${line.op} ${identity(line)}: the record is changed twice`);
        touched.add(live._key);
        const before = clone(strip(live));
        if (line.op === "delete") {
          steps.push({ op: "delete", live, before, category: line.category });
          continue;
        }
        const fields = line.fields;
        if (!fields || typeof fields !== "object" || !Object.keys(fields).length
            || !Object.keys(fields).every((k) => MUTABLE_FIELDS.has(k))) throw new Error(`update ${identity(line)}: fields must name changeable keys`);
        const after = clone(before);
        for (const [k, v] of Object.entries(fields)) {
          if (v === null) delete after[k];
          else after[k] = clone(v);
        }
        if (after.source?.type !== line.category) throw new Error(`update ${identity(line)}: a new source type is a delete plus an add`);
        steps.push({ op: "update", live, before, after, category: line.category, reference: line.reference ?? null });
      }
    } catch (err) {
      errors.push(`line ${lineNo}: ${err.message}`);
    }
  }
  return errors.length ? { steps: [], errors, warnings } : { steps, errors, warnings };
}

// Writes planned steps through the same buffer calls the editing screens use, so the change list and the submitted diff come out as the pasted one.
export function applySteps(steps, state, referenceData) {
  for (const step of steps) {
    if (step.op === "add-enum") {
      queueEnumValue(state, step.enumName, step.value, step.meta);
    } else if (step.op === "name") {
      state.buffer.setName(step.kind, step.id, step.locale, step.name, step.before);
    } else if (step.op === "item") {
      applyItemDetails(step, state, referenceData);
    } else if (step.op === "delete") {
      state.buffer.delete(step.live._key, step.before, step.category);
    } else {
      const record = step.op === "add" ? step.record : step.after;
      let key = step.live?._key;
      if (step.op === "update") {
        state.buffer.update(key, step.before, step.after, step.category);
        mirror(step.live, step.after);
      } else {
        key = newKey(step.category);
        const live = { ...record, _category: step.category, _key: key };
        state.buffer.add(key, record, step.category);
        state.records.push(live);
        state.index.set(key, live);
      }
      // A name the diff sets shows in the table at once, as it does after "Save to the change list".
      if (record.name_overrides?.en || step.before?.name_overrides?.en) {
        state.names.setRecordName(record.id ?? record.blueprint, record.name_overrides?.en);
      }
      if (step.reference) {
        state.buffer.references.set(key, step.reference);
        referenceData.addDiscovery(step.reference.meta, record.blueprint);
        state.names.addOverride(record.id, step.reference.meta.name);
        if (record.blueprint) state.names.addOverride(record.blueprint, step.reference.meta.name);
      }
    }
  }
}

// Shared with the dump import: the change list entry, and the new name and icon shown at once.
export function applyItemDetails({ id, reference, previous }, state, referenceData) {
  state.buffer.setItem(id, reference, previous);
  referenceData.addDiscovery(reference.meta);
  state.names.setRefreshedName(id, reference.meta.name);
}
