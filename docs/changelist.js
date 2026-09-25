// A diff line is after-only, but the buffer holds before and after, so the review screen can say which item, which record and whether the change reaches the game. The submit modal and the issue body are both projections of changeRows(), so contributor and reviewer read the same sentences.

import {
  labelFor, sourceTypeLabel, valueLabel, subtypeVocab, titleCase, NOT_IN_GAME_DATA,
} from "./lexicon.js";
import {
  entryOf, labelOf, noteLabel, placementsText, versionLabel,
} from "./data.js";
import { validateRecord, SOURCE_ENUM_FIELD, sourceEnumFields } from "./validate.js";
import { SITE_ONLY_FIELDS } from "./form.js";

// Fields the build strips: a row touching one needs no in-game verification. form.js owns the list.
const SITE_ONLY = new Set(SITE_ONLY_FIELDS);

// Sub-objects whose changed keys become rows of their own. Presentation only; the diff line stays top-level-keyed.
const NESTED_FIELDS = ["source", "availability"];

// Never a row: `id` addresses the record rather than being edited, and `_`-keys never leave the browser.
function isInternal(key) {
  return key === "id" || key.startsWith("_");
}

// Value formatting

function isEmptyValue(v) {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function formatNumber(n) {
  return Number(n).toLocaleString("en-US");
}

function formatCost(cost) {
  if (!Array.isArray(cost) || cost.length === 0) return "";
  return cost.map((c) => {
    const amount = Number.isFinite(c?.amount) ? formatNumber(c.amount) : String(c?.amount ?? "?");
    return `${amount} ${valueLabel("currencies", c?.currency)}`;
  }).join(" + ");
}

// The symbol is shown in brackets when it differs from the label, since a reviewer checking a diff line needs to recognise it. A value the library defines no game id for is suffixed, never hidden.
function formatSymbol(enums, vocab, symbol) {
  const label = labelOf(enums, vocab, symbol);
  const entry = entryOf(enums, vocab, symbol);
  const base = label && label !== symbol ? `${label} (${symbol})` : String(symbol);
  return entry && entry.undefined_in_library ? base + NOT_IN_GAME_DATA : base;
}

// Two long texts that differ near their end read as identical when both are cut at the same length, so cut around the first difference instead.
function shortenPair(before, after, max = 60) {
  if (before.length <= max && after.length <= max) return [before, after];
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  const start = Math.max(0, p - Math.floor(max / 3));
  const cut = (s) => {
    const body = s.slice(start, start + max);
    return (start > 0 ? "..." : "") + body + (start + max < s.length ? "..." : "");
  };
  return [cut(before), cut(after)];
}

// Empty renders as ""; the caller decides whether that reads as "(none)" or "(removed)".
function formatValue(path, value, enums, sourceType) {
  if (isEmptyValue(value)) return "";
  if (path === "cost") return formatCost(value);
  if (path === "rarity" || path === "source.rarity") return valueLabel("rarities", value);
  if (path === "availability.version") return versionLabel(enums, value);
  if (path === "source.type") return sourceTypeLabel(value);
  if (path === "source.subtype") return valueLabel(subtypeVocab(sourceType), value);
  if (path === "source.note") return `"${noteLabel(enums, value)}"`;
  if (path === "source.locations") return placementsText(enums, value);
  // Not truncated here: shortenPair cuts the pair together once both sides are known.
  if (path === "notes" || path === "description") return `"${value}"`;
  if (path === "name_overrides" && typeof value === "object") {
    return Object.entries(value).map(([lang, name]) => `${lang}: "${name}"`).join(", ");
  }
  const vocab = path.startsWith("source.") ? SOURCE_ENUM_FIELD[path.slice(7)] : null;
  if (vocab) return formatSymbol(enums, vocab, value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function numericOf(path, value) {
  if (path === "cost") {
    if (!Array.isArray(value) || value.length !== 1) return null;
    return Number.isFinite(value[0]?.amount) ? value[0].amount : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// A change of magnitude rather than of value: the digit count moved, or the ratio is a factor of ten either way.
function isMagnitudeJump(a, b) {
  if (a == null || b == null || a === b) return false;
  const digits = (n) => String(Math.abs(Math.trunc(n))).length;
  if (digits(a) !== digits(b)) return true;
  if (a === 0 || b === 0) return false;
  const ratio = Math.abs(b) / Math.abs(a);
  return ratio >= 10 || ratio <= 0.1;
}

// Locating the record

// Fallback for ctx.sourceDetail. Values only: records of one item often differ only by location, and that is what has to show.
function defaultSourceDetail(source) {
  if (!source || typeof source !== "object") return "";
  const vals = [];
  for (const [k, v] of Object.entries(source)) {
    if (k === "type" || k.startsWith("_")) continue;
    vals.push(Array.isArray(v) ? v.join("/") : String(v));
  }
  return vals.join(" · ");
}

function displayName(ctx, id) {
  if (typeof ctx?.nameOf === "function") return ctx.nameOf(id) || "";
  const names = ctx?.names || ctx?.state?.names;
  if (!names) return "";
  if (typeof names.get === "function") return names.get(id) || "";
  return names[id] || "";
}

// The type alone is not enough: many (id, category) pairs hold more than one record, some differing only in `location`. Prefers app.js's `recordLocator` so the modal header, Batch edit's table and this table agree word for word. Always built from the pre-edit source, since the line addresses the record as it stands in the file.
function locatorOf(entry, source, ctx) {
  const rec = entry.before || entry.after;
  let text;
  if (typeof ctx?.recordLocator === "function") {
    text = ctx.recordLocator({ ...(rec || {}), source });
  } else {
    const detail = (ctx?.sourceDetail || defaultSourceDetail)(source);
    const shown = typeof detail === "string" ? detail : (detail?.text || "");
    const head = sourceTypeLabel(source?.type);
    text = shown ? `${head} - ${shown}` : head;
  }
  const ordinal = ordinalOf(entry, ctx);
  return ordinal ? `${text} (${ordinal.n} of ${ordinal.m})` : text;
}

// Ordered by app.js's `recordsForItem` when supplied (the same order the detail list and modal header use); load order otherwise.
function ordinalOf(entry, ctx) {
  // An add is the record itself; numbering it among the item's untouched records misreads as a destination count.
  if (entry.op === "add") return null;
  const rec = entry.after || entry.before;
  const id = rec?.id ?? rec?.blueprint;
  if (id == null) return null;
  let ordered = null;
  if (typeof ctx?.recordsForItem === "function") ordered = ctx.recordsForItem(id);
  if (!Array.isArray(ordered)) {
    const all = recordsOf(ctx);
    if (!all) return null;
    const mine = all.filter((r) => r.id === id);
    ordered = typeof ctx.sortRecords === "function" ? ctx.sortRecords(mine, id) : mine;
  }
  if (ordered.length < 2) return null;
  const idx = ordered.findIndex((r) => r._key === entry.key);
  // A brand-new record is not in the loaded set yet: say nothing rather than guess a position.
  if (idx === -1) return null;
  return { n: idx + 1, m: ordered.length };
}

// Markers

function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => stringsIn(v, out));
  }
  return out;
}

// Kept per vocabulary, so a word only matches a field that resolves against its own vocabulary.
function pendingEnumValues(entries) {
  const byVocabulary = new Map();
  for (const e of entries) {
    if (e.op !== "add-enum" || !e.value) continue;
    const vocabulary = e.enumName || "";
    if (!byVocabulary.has(vocabulary)) byVocabulary.set(vocabulary, new Set());
    byVocabulary.get(vocabulary).add(String(e.value));
  }
  return byVocabulary;
}

// The rows

// Accepts either the DirtyBuffer or its entry list.
function entriesOf(bufferOrEntries) {
  if (Array.isArray(bufferOrEntries)) return bufferOrEntries;
  if (bufferOrEntries && typeof bufferOrEntries.list === "function") {
    return bufferOrEntries.list();
  }
  return [];
}

// The context is either flat (`{enums, names, records}`) or app.js's mask dependency bundle, which carries the same things under `state`.
function enumsOf(ctx) {
  return ctx?.enums || ctx?.state?.enums || {};
}

function recordsOf(ctx) {
  const recs = ctx?.records || ctx?.state?.records;
  return Array.isArray(recs) ? recs : null;
}

export function changeRows(bufferOrEntries, ctx = {}) {
  const entries = entriesOf(bufferOrEntries);
  const enums = enumsOf(ctx);
  const pending = pendingEnumValues(entries);
  const rows = [];

  for (const entry of entries) {
    if (entry.op === "add-enum") {
      rows.push({
        entryKey: entry.key,
        op: entry.op,
        itemId: null,
        itemName: "",
        item: `Vocabulary: ${titleCase(entry.enumName)}`,
        record: "",
        field: `enum.${entry.enumName}`,
        what: "New word",
        before: "(none)",
        after: entry.meta?.name ? `${entry.meta.name} (${entry.value})` : String(entry.value),
        markers: ["NEW WORD"],
        siteOnly: false,
      });
      continue;
    }

    const before = entry.before || null;
    const after = entry.after || null;
    const rec = after || before;
    const source = entry.origSource || before?.source || after?.source || null;
    const sourceType = source?.type || rec?.source?.type;
    const id = rec?.id ?? rec?.blueprint;
    const name = displayName(ctx, id);

    // A finding the record already carried is not the contributor's doing, and a reviewer needs to know before reading the row.
    let hadFinding = false;
    if (before && enums && Object.keys(enums).length) {
      hadFinding = validateRecord(before, enums).errors.length > 0;
    }

    const common = {
      entryKey: entry.key,
      op: entry.op,
      itemId: id,
      itemName: name,
      item: `${name || "(no name)"} (${id})`,
      record: locatorOf(entry, source, ctx),
    };

    if (entry.op === "add") {
      rows.push({
        ...common,
        field: "record",
        what: "New record",
        before: "(none)",
        after: describeRecord(after),
        markers: markerList({
          hadFinding: false,
          newWord: usesPendingValue(after, pending, enums),
        }),
        siteOnly: false,
      });
      continue;
    }

    if (entry.op === "delete") {
      rows.push({
        ...common,
        field: "record",
        what: "Record removed",
        before: describeRecord(before),
        after: "(removed)",
        markers: markerList({
          hadFinding,
          noteLost: !isEmptyValue(before?.notes),
        }),
        siteOnly: false,
      });
      continue;
    }

    for (const path of changedPaths(before, after)) {
      const b = valueAt(before, path);
      const a = valueAt(after, path);
      const siteOnly = SITE_ONLY.has(path);
      const [beforeText, afterText] = shortenPair(
        formatValue(path, b, enums, sourceType) || "(none)",
        formatValue(path, a, enums, sourceType) || "(removed)",
      );
      rows.push({
        ...common,
        field: path,
        what: labelFor(path, sourceType),
        before: beforeText,
        after: afterText,
        markers: markerList({
          hadFinding,
          siteOnly,
          tenX: isMagnitudeJump(numericOf(path, b), numericOf(path, a)),
          noteLost: path === "notes" && !isEmptyValue(b)
            && (isEmptyValue(a) || String(a).length < String(b).length),
          newWord: usesPendingValue(a, pending, enums),
        }),
        siteOnly,
      });
    }
  }
  return rows;
}

function markerList({ tenX, noteLost, hadFinding, newWord, siteOnly }) {
  const out = [];
  if (tenX) out.push("10x");
  if (noteLost) out.push("NOTE LOST");
  if (hadFinding) out.push("KNOWN PROBLEM");
  if (newWord) out.push("NEW WORD");
  if (siteOnly) out.push("SITE ONLY");
  return out;
}

// Checked only in fields that resolve against the added word's vocabulary; matching any string in the record flagged coincidences.
function usesPendingValue(record, pending, enums) {
  if (!pending.size || !record) return false;
  const pairs = Object.entries(sourceEnumFields(enums));
  // availability.version is the one published vocabulary field outside `source`.
  const checks = pairs.map(([field, vocab]) => [record.source?.[field], vocab]);
  checks.push([record.availability?.version, "versions"]);
  for (const [value, vocab] of checks) {
    const wanted = pending.get(vocab);
    if (!wanted || !wanted.size) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      if (typeof one === "string" && wanted.has(one)) return true;
    }
  }
  return false;
}

function describeRecord(record) {
  if (!record) return "";
  const bits = [sourceTypeLabel(record.source?.type)];
  const detail = defaultSourceDetail(record.source);
  if (detail) bits.push(detail);
  const cost = formatCost(record.cost);
  if (cost) bits.push(cost);
  return bits.join(" · ");
}

// Unrecognised top-level keys are compared too: a key this module does not know must show up as a row rather than vanish.
function changedPaths(before, after) {
  const paths = [];
  const keys = new Set([
    ...Object.keys(before || {}), ...Object.keys(after || {}),
  ]);
  for (const key of [...keys].sort()) {
    if (isInternal(key)) continue;
    if (NESTED_FIELDS.includes(key)) {
      const sub = new Set([
        ...Object.keys(before?.[key] || {}), ...Object.keys(after?.[key] || {}),
      ]);
      for (const sk of [...sub].sort()) {
        if (sk.startsWith("_")) continue;
        const path = `${key}.${sk}`;
        if (!same(valueAt(before, path), valueAt(after, path))) paths.push(path);
      }
      continue;
    }
    if (!same(before?.[key], after?.[key])) paths.push(key);
  }
  return paths;
}

function valueAt(record, path) {
  if (!record) return undefined;
  const dot = path.indexOf(".");
  if (dot === -1) return record[path];
  return record[path.slice(0, dot)]?.[path.slice(dot + 1)];
}

function same(a, b) {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// The header sentence

// Counted in buffer entries, the unit the footer and the record cap use; an entry is site-only when every field it touches is one the build strips.
export function changeSummary(bufferOrEntries, rows) {
  const entries = entriesOf(bufferOrEntries);
  const byEntry = new Map();
  for (const row of rows) {
    const prev = byEntry.get(row.entryKey);
    byEntry.set(row.entryKey, prev === undefined ? row.siteOnly : prev && row.siteOnly);
  }
  const total = entries.length;
  let siteOnly = 0;
  for (const v of byEntry.values()) if (v) siteOnly++;
  const game = total - siteOnly;
  return `${total} change${total === 1 ? "" : "s"} - ${game} game data, ` +
    `${siteOnly} site-only text`;
}

// Call site 1: the submit modal

const COLUMNS = ["Item", "Record", "What changed", "Before", "After", ""];

export function renderChangeList(bufferOrEntries, ctx = {}) {
  const entries = entriesOf(bufferOrEntries);
  const rows = changeRows(entries, ctx);
  const host = document.createElement("div");
  host.className = "chg";

  const summary = document.createElement("p");
  summary.className = "chg-summary";
  summary.textContent = changeSummary(entries, rows);
  host.append(summary);

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chg-empty muted";
    empty.textContent = "Nothing to send yet.";
    host.append(empty);
    return host;
  }

  const table = document.createElement("table");
  table.className = "chg-table";
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const c of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = c;
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);

  const tbody = document.createElement("tbody");
  let lastKey = null;
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "chg-row";
    if (row.siteOnly) tr.classList.add("chg-row-site");
    if (row.entryKey === lastKey) tr.classList.add("chg-row-cont");
    lastKey = row.entryKey;

    for (const [cls, text] of [
      ["chg-item", row.item],
      ["chg-record", row.record],
      ["chg-what", row.what],
      ["chg-before", row.before],
      ["chg-after", row.after],
    ]) {
      const td = document.createElement("td");
      td.className = cls;
      td.textContent = text;
      tr.append(td);
    }

    const markers = document.createElement("td");
    markers.className = "chg-markers";
    for (const m of row.markers) {
      const span = document.createElement("span");
      span.className = `chg-marker ${markerClass(m)}`;
      span.textContent = m;
      markers.append(span);
    }
    tr.append(markers);
    tbody.append(tr);
  }
  table.append(tbody);
  host.append(table);
  return host;
}

function markerClass(marker) {
  return "m-" + marker.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// Call site 2: the issue body

function mdCell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

export function changeListText(bufferOrEntries, ctx = {}) {
  const entries = entriesOf(bufferOrEntries);
  const rows = changeRows(entries, ctx);
  const out = [changeSummary(entries, rows), ""];
  if (rows.length === 0) return out.join("\n").trim();
  out.push(`| ${COLUMNS.map((c) => c || " ").join(" | ")} |`);
  out.push(`|${COLUMNS.map(() => "---").join("|")}|`);
  for (const row of rows) {
    out.push("| " + [
      row.item, row.record, row.what, row.before, row.after, row.markers.join(" "),
    ].map(mdCell).join(" | ") + " |");
  }
  return out.join("\n");
}
