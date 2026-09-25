import { changeListText } from "./changelist.js";

export const ISSUE_REPO = "wookiefriseur/LFC";

// Every emitted diff line carries it; the action's first check is `v === 1`.
export const DIFF_VERSION = 1;

// Only the prefilled issue URL has a size limit. Larger submissions use copy/paste.
export const MAX_ISSUE_URL_LENGTH = 8000;


// `id` is immutable (changing an id = delete+add) and internal `_*` keys never ship. Matches diff-line.schema.json `fields.propertyNames`.
export const MUTABLE_FIELDS = new Set([
  "source", "cost", "availability", "rarity", "name_overrides",
  "notes", "description", "container",
]);

// Keyed by the stable per-row `_key`, not by `id`: item ids are not unique.
export class DirtyBuffer {
  constructor() {
    this.entries = new Map();
    this.references = new Map();
  }
  size() { return this.entries.size; }
  clear() { this.entries.clear(); this.references.clear(); }

// Keeps the original `before` and pre-edit source across re-edits; the source snapshot is what `match` uses to address this row when (id, category) is ambiguous, even after the edit changed source.
  update(key, before, after, category) {
    const existing = this.entries.get(key);
    // An add edited before it is sent stays an add. The file is the record's own type, so an add edited into another type is filed where it now belongs.
    if (existing?.op === "add") {
      this.entries.set(key, {
        op: "add", key, after,
        category: after?.source?.type || category || existing.category,
      });
      return;
    }
    const origBefore = existing?.before ?? before;
    if (deepEqual(origBefore, after)) {
      this.entries.delete(key);
      return;
    }
    const origSource = existing?.origSource ?? sourceSnapshot(before);
    this.entries.set(key, { op: "update", key, before: origBefore, after, category: existing?.category ?? category, origSource });
  }
  add(key, record, category) {
    this.entries.set(key, { op: "add", key, after: record, category });
  }
  // `meta` is the rest of the enums.json entry minus `symbol`, passed through verbatim; flat string vocabularies have none.
  addEnum(key, enumName, value, meta = null) {
    this.entries.set(key, { op: "add-enum", key, enumName, value, meta });
  }
  delete(key, before, category) {
    const existing = this.entries.get(key);
    if (existing?.op === "add") {
      this.entries.delete(key);
      return;
    }
    // Keep the pristine `before` of an earlier edit: a delete states what is in the data file, not the caller's edited copy.
    this.entries.set(key, {
      op: "delete", key, before: existing?.before ?? before, category: existing?.category ?? category,
      origSource: existing?.origSource ?? sourceSnapshot(before),
    });
  }
  list() {
    return [...this.entries.values()];
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sourceSnapshot(record) {
  const src = record?.source;
  if (!src || typeof src !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (!k.startsWith("_")) out[k] = deepClone(v);
  }
  return out;
}

function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// `match` is emitted on every update and delete: ambiguity judged against the loaded set goes stale while a line waits in the queue. A line whose pre-edit source is missing or has no `type` carries none, since the schema requires `type`.
function matchFor(origSource) {
  if (!origSource || typeof origSource !== "object") return null;
  return typeof origSource.type === "string" && origSource.type ? origSource : null;
}

// Top-level keys only; nested objects compare as a whole.
function changedFields(before, after) {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (!MUTABLE_FIELDS.has(k)) continue;
    if (!deepEqual(before?.[k], after?.[k])) {
      out[k] = after?.[k] ?? null;
    }
  }
  return out;
}

// Drops `symbol` (already carried as `value`) and blank fields, so an unfilled object-valued enum emits no `meta` at all.
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === "symbol" || v === undefined || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function clean(record) {
  const o = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith("_")) o[k] = v;
  }
  return o;
}

export function serialiseDiff(buffer) {
  const lines = [];
  for (const entry of buffer.list()) {
    if (entry.op === "update") {
      if (entry.before.source.type !== entry.after.source.type) {
        // Source types are files. Preserve the original match even after several edits, and carry the complete record into its new file.
        lines.push(JSON.stringify({
          v: DIFF_VERSION, op: "delete", category: entry.category,
          id: entry.before.id, blueprint: entry.before.blueprint,
          match: matchFor(entry.origSource),
        }));
        lines.push(JSON.stringify({
          v: DIFF_VERSION, op: "add", category: entry.after.source.type,
          id: entry.after.id, blueprint: entry.after.blueprint,
          record: clean(entry.after), reference: buffer.references.get(entry.key),
        }));
        continue;
      }
      const line = {
        v: DIFF_VERSION,
        op: "update",
        // Addressed by the pre-edit id: `id` is not mutable, so `after.id` could point at a different record.
        id: entry.before?.id ?? entry.after.id,
        blueprint: entry.before?.blueprint,
        category: entry.category,
        fields: changedFields(clean(entry.before), clean(entry.after)),
      };
      const match = matchFor(entry.origSource);
      if (match) line.match = match;
      if (buffer.references.has(entry.key)) line.reference = buffer.references.get(entry.key);
      lines.push(JSON.stringify(line));
    } else if (entry.op === "add") {
      lines.push(JSON.stringify({
        v: DIFF_VERSION,
        op: "add",
        id: entry.after.id,
        blueprint: entry.after.blueprint,
        category: entry.category,
        record: clean(entry.after),
        reference: buffer.references.get(entry.key),
      }));
    } else if (entry.op === "delete") {
      const line = {
        v: DIFF_VERSION,
        op: "delete",
        id: entry.before.id,
        blueprint: entry.before.blueprint,
        category: entry.category,
      };
      const match = matchFor(entry.origSource);
      if (match) line.match = match;
      lines.push(JSON.stringify(line));
    } else if (entry.op === "add-enum") {
      // Targets enums.json, not a data file. An object-valued enum also carries `meta`, so the action writes a complete entry.
      const line = {
        v: DIFF_VERSION,
        op: "add-enum",
        enum: entry.enumName,
        value: entry.value,
      };
      const meta = cleanMeta(entry.meta);
      if (meta) line.meta = meta;
      lines.push(JSON.stringify(line));
    }
  }
  return lines.join("\n");
}

// The diff markers let the GH action find the block without parsing the surrounding markdown. With `ctx` the body opens with the same change list the submit modal shows.
export function buildIssueBody(buffer, summary, allRecords, ctx) {
  const diff = serialiseDiff(buffer);
  const out = [
    `## Summary`,
    ``,
    summary || "(no summary)",
    ``,
  ];
  if (ctx && (ctx.enums || ctx.state?.enums)) {
    out.push(`## What changed`, ``,
      changeListText(buffer.list(), { records: allRecords, ...ctx }), ``);
  }
  out.push(
    `## Diff`,
    ``,
    `[//]: # (diff-begin)`,
    "```",
    diff,
    "```",
    `[//]: # (diff-end)`,
    ``,
    `_Generated by the Furniture Catalogue web interface._`,
  );
  return out.join("\n");
}

export function suggestTitle(buffer) {
  const entries = buffer.list();
  if (entries.length === 0) return "DB update";
  if (entries.length === 1) {
    const e = entries[0];
    if (e.op === "add-enum") return `DB add-enum: ${e.enumName}.${e.value}`;
    const id = (e.after ?? e.before).id;
    return `DB ${e.op}: ${id}`;
  }
  const counts = { update: 0, add: 0, delete: 0, "add-enum": 0 };
  for (const e of entries) counts[e.op]++;
  const parts = [];
  if (counts.update) parts.push(`${counts.update} update${counts.update > 1 ? "s" : ""}`);
  if (counts.add) parts.push(`${counts.add} add${counts.add > 1 ? "s" : ""}`);
  if (counts.delete) parts.push(`${counts.delete} delete${counts.delete > 1 ? "s" : ""}`);
  if (counts["add-enum"]) parts.push(`${counts["add-enum"]} enum value${counts["add-enum"] > 1 ? "s" : ""}`);
  return `DB update: ${parts.join(", ")}`;
}

// Build the prefilled issue URL. The UI selects copy/paste when it is too long.
export function buildIssueURL(buffer, orgRepo = ISSUE_REPO, allRecords, ctx) {
  const title = suggestTitle(buffer);
  const body = buildIssueBody(buffer, title, allRecords, ctx);
  const params = new URLSearchParams({
    title,
    body,
    labels: "db-edit",
  });
  return `https://github.com/${orgRepo}/issues/new?${params.toString()}`;
}
