// Reads the name dumps FurCDev writes: the SavedVariables file from "All names to file", or pages copied out of the output box.
import { NAME_KINDS } from "./reference-data.js";

const KIND_RE = new RegExp(`^\\s*(?:\\["(${NAME_KINDS.join("|")})"\\]|(${NAME_KINDS.join("|")}))\\s*=`);
const PAGE_LABEL_RE = new RegExp(`^\\s*--\\s*(${NAME_KINDS.join("|")})\\b(?:,\\s*([a-z]{2})\\b)?`);
const ENTRY_RE = /^\s*\[(\d+)\]\s*=\s*"(.*)"\s*,?\s*$/;
const LOCALE_RE = /^\s*\["locale"\]\s*=\s*"([a-z]{2})"/;

// Lua string escapes as the game writes them; `\ddd` is a byte, so the text is rebuilt as bytes and decoded as UTF-8.
export function unescapeLua(body) {
  if (!body.includes("\\")) return body;
  const enc = new TextEncoder();
  const bytes = [];
  const simple = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, "\\": 92, '"': 34, "'": 39, "\n": 10 };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\" || i + 1 >= body.length) {
      bytes.push(...enc.encode(c));
      continue;
    }
    const next = body[++i];
    if (next in simple) {
      bytes.push(simple[next]);
    } else if (/\d/.test(next)) {
      let digits = next;
      while (digits.length < 3 && /\d/.test(body[i + 1] ?? "")) digits += body[++i];
      bytes.push(Number(digits) & 255);
    } else {
      bytes.push(...enc.encode(next));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * @returns {{ locale: string|null, kinds: Record<string, Map<number, string>>, skipped: number }}
 * `skipped` counts name lines that came before any table was named, which a page pasted on its own from an old dump can do.
 */
export function parseNamesDump(text) {
  const kinds = {};
  let kind = null;
  let locale = null;
  let skipped = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const label = PAGE_LABEL_RE.exec(line);
    if (label) {
      kind = label[1];
      if (label[2]) locale ??= label[2];
      continue;
    }
    const table = KIND_RE.exec(line);
    if (table) {
      kind = table[1] || table[2];
      continue;
    }
    const loc = LOCALE_RE.exec(line);
    if (loc) {
      locale ??= loc[1];
      continue;
    }
    const entry = ENTRY_RE.exec(line);
    if (!entry) continue;
    if (!kind) {
      skipped++;
      continue;
    }
    const name = unescapeLua(entry[2]).trim();
    if (!name) continue;
    (kinds[kind] ??= new Map()).set(Number(entry[1]), name);
  }
  return { locale, kinds, skipped };
}

// What a dump would change against the names the site has: new ids and different names. An id missing from the dump is only counted - a partial paste is normal.
export function diffNames(parsed, current) {
  const out = {};
  for (const [kind, names] of Object.entries(parsed.kinds)) {
    const have = current?.[kind] || new Map();
    const added = [], changed = [];
    let same = 0;
    for (const [id, name] of names) {
      const old = have.get(id);
      if (old == null) added.push({ id, name });
      else if (old !== name) changed.push({ id, name, before: old });
      else same++;
    }
    let missing = 0;
    for (const id of have.keys()) if (!names.has(id)) missing++;
    out[kind] = { added, changed, same, missing };
  }
  return out;
}
