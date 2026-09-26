// Bump on any change to the cached payload shape so browsers drop stale entries.
const CACHE_KEY = "furcat-webview-cache-v8";

// The file list comes from data/manifest.json, one JSONL per non-empty source type; category == file basename == source.type == the diff's `category`.
const DATA_DIR = "./data";

export function isSourceSlug(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

export function parseJSONL(text) {
  const out = [];
  const errs = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      errs.push({ line: i + 1, error: e.message, raw: line });
    }
  }
  return { records: out, errors: errs };
}

async function fetchText(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return await r.text();
}

async function fetchJSON(path) {
  return JSON.parse(await fetchText(path));
}

// Records are tagged with _category and a per-row _key: a multi-source item is N lines sharing one id, so the index and the dirty buffer key on _key, not id.
export async function loadAll(opts = {}) {
  // The manifest also decides cache freshness: the cache key only changes with the payload shape, so without this check regenerated data would stay invisible to a browser with a cached payload.
  const dir = opts.dir || DATA_DIR;
  const manifest = await fetchJSON(`${dir}/manifest.json`);
  for (const f of manifest.files || []) {
    if (!isSourceSlug(f.type) || f.name !== `${f.type}.jsonl`) throw new Error("Invalid source filename in manifest");
  }
  const cached = opts.noCache ? null : readCache();
  if (cached && cacheMatchesManifest(cached, manifest)) return cached;
  const files = Array.isArray(manifest.files) ? manifest.files : [];

  const [enums, names, ...texts] = await Promise.all([
    fetchJSON(`${dir}/enums.json`),
    fetchJSON(`${dir}/names.en.json`),
    ...files.map((f) => fetchText(`${dir}/${f.name}`)),
  ]);

  const records = [];
  const errors = [];
  files.forEach((f, ci) => {
    const cat = categoryOfFile(f);
    const { records: recs, errors: errs } = parseJSONL(texts[ci]);
    recs.forEach((r, i) => {
      tag(r, cat, i);
      records.push(r);
    });
    for (const e of errs) errors.push({ ...e, category: cat });
    // A count that disagrees with the manifest means the two were written by different runs.
    if (Number.isInteger(f.records) && f.records !== recs.length) {
      errors.push({
        line: 0, category: cat, raw: f.name,
        error: `manifest declares ${f.records} records, file has ${recs.length}`,
      });
    }
  });

  const payload = { enums, records, names, errors, manifest };
  writeCache(payload);
  return payload;
}

// Compare the content digest, because a regeneration that only fixes field values leaves the file list and counts identical; those are the fallback for a manifest without a digest.
function cacheMatchesManifest(cached, manifest) {
  const a = cached && cached.manifest;
  if (!a || !Array.isArray(cached.records)) return false;
  if (typeof manifest.digest === "string") {
    return a.digest === manifest.digest;
  }
  if (JSON.stringify(a.files) !== JSON.stringify(manifest.files)) return false;
  const declared = manifest.counts && manifest.counts.records;
  if (Number.isInteger(declared) && declared !== cached.records.length) return false;
  return true;
}

function categoryOfFile(f) {
  return f.type || String(f.name || "").replace(/\.jsonl$/, "");
}

export function categoriesFrom(manifest) {
  const files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
  return files.map(categoryOfFile).filter(Boolean);
}

function tag(record, category, rowIndex) {
  record._category = category;
  record._key = `${category}#${rowIndex}`;
  return record;
}

let newCounter = 0;
export function newKey(category) {
  return `${category}#new-${newCounter++}`;
}

export function isPlaceholderName(name, id) {
  const s = String(name == null ? "" : name).trim();
  if (s === "") return true;
  if (/^Item \d+$/.test(s)) return true;
  if (id != null && s === String(id)) return true;
  return false;
}

// Display-only name layer: a record's own name_overrides.en wins (a deliberate correction), then a real name from names.en.json, then a name a batch import carried in its Lua comment. Import names are never written into record data.
export class NameStore {
  constructor(names = {}) {
    this.base = names;
    this.overrides = new Map();
    this.recordNames = new Map();
  }
  get(id) {
    return this.recordNames.get(id) || this.gameName(id);
  }
  setRecordName(id, name) {
    if (id == null) return;
    if (typeof name === "string" && name.trim()) this.recordNames.set(id, name);
    else this.recordNames.delete(id);
  }
  hasRealName(id) {
    const n = this.base[id];
    return typeof n === "string" && n.length > 0 && n !== `Item ${id}`;
  }
  // The names file wins so a stale import comment never masks the real name.
  gameName(id) {
    if (this.hasRealName(id)) return this.base[id];
    const o = this.overrides.get(id);
    if (o) return o;
    return this.base[id] || "";
  }
  addOverride(id, name) {
    if (id == null || !name) return;
    if (this.hasRealName(id)) return;
    this.overrides.set(id, String(name));
  }
}

export function symbolOf(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") return String(entry.symbol ?? "");
  return "";
}

export function symbolsOf(enums, key) {
  const list = enums && enums[key];
  return Array.isArray(list) ? list.map(symbolOf) : [];
}

export function entryOf(enums, key, symbol) {
  const list = enums && enums[key];
  if (!Array.isArray(list) || symbol == null || symbol === "") return null;
  for (const e of list) {
    if (symbolOf(e) === symbol) return typeof e === "string" ? { symbol: e } : e;
  }
  return null;
}

// A vocabulary whose label comes from the game at render time ships no `name`, so the symbol is the fallback.
// A zone vocabulary entry carries only the game's zone id; its name comes from the names reference data when that is loaded.
let zoneName = () => null;
export function setZoneNameLookup(fn) {
  if (typeof fn === "function") zoneName = fn;
}

export function labelOf(enums, key, symbol) {
  const entry = entryOf(enums, key, symbol);
  const name = entry && entry.name;
  if (typeof name === "string" && name !== "") return stripMarker(name);
  if (key === "locations" && Number.isInteger(entry?.zone)) return zoneName(entry.zone) || String(symbol ?? "");
  return String(symbol ?? "");
}

// The addon's en.lua strings carry trailing grammar markers ("Undaunted Enclaves^p,in") that only the game's string formatter consumes.
function stripMarker(name) {
  const i = name.indexOf("^");
  return i === -1 ? name : name.slice(0, i);
}

// `0` on some id fields means "gated on something whose id nobody recorded"; enums.id_unknown declares which fields accept it. It is a state, never rendered or offered as a number. The fallback covers an enums.json without the declaration.
const ID_UNKNOWN_FALLBACK = { value: 0, fields: ["achievement", "quest"] };

export function unknownIdFields(enums) {
  const declared = enums?.id_unknown;
  return Array.isArray(declared?.fields) ? declared.fields
                                         : ID_UNKNOWN_FALLBACK.fields;
}

export function isUnknownId(enums, field, value) {
  const declared = enums?.id_unknown || ID_UNKNOWN_FALLBACK;
  const sentinel = typeof declared.value === "number" ? declared.value : 0;
  return value === sentinel && unknownIdFields(enums).includes(field);
}

// A places symbol in source.note is legacy (it belongs in a placement's `place`); this detects it for the validator and the health screen.
export function isNoteSymbol(enums, note) {
  if (typeof note !== "string" || note === "") return false;
  return symbolsOf(enums, "places").includes(note);
}

export function noteLabel(enums, note) {
  if (note == null) return "";
  if (isNoteSymbol(enums, note)) return labelOf(enums, "places", note);
  return String(note);
}

export function placementText(enums, p) {
  const parts = [];
  if (p?.location) parts.push(labelOf(enums, "locations", p.location));
  if (p?.place) parts.push(labelOf(enums, "places", p.place));
  if (p?.note) parts.push(String(p.note));
  return parts.join(", ");
}

export function placementsText(enums, list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => placementText(enums, p))
    .filter(Boolean)
    .join("; ");
}

// Vendor placements ship once in enums.vendor_locations: a record with no placement of its own inherits its vendor's, one that states any overrides them. Absence is the marker.
export function vendorPlacements(enums, vendor) {
  const table = enums?.vendor_locations;
  if (!table || typeof vendor !== "string") return [];
  const entries = table[vendor];
  return Array.isArray(entries) ? entries : [];
}

export function effectivePlacements(enums, source) {
  const own = Array.isArray(source?.locations) ? source.locations : [];
  if (own.length) return { placements: own, inherited: false, vendor: null };
  const vendor = source?.vendor;
  const fromVendor = vendorPlacements(enums, vendor);
  if (fromVendor.length) {
    return { placements: fromVendor, inherited: true, vendor };
  }
  return { placements: [], inherited: false, vendor: null };
}

export function effectivePlacementsText(enums, source) {
  const { placements, inherited, vendor } = effectivePlacements(enums, source);
  const text = placementsText(enums, placements);
  if (!text || !inherited) return text;
  const who = labelOf(enums, "vendors", vendor) || vendor;
  return `${text} (from ${who})`;
}

function asVersionMeta(v, i) {
  if (typeof v === "string") return { symbol: v, ordinal: i + 1, name: v };
  return { symbol: v.symbol, ordinal: v.ordinal ?? i + 1, name: v.name || v.symbol };
}

function asCrateMeta(c) {
  if (typeof c === "string") return { symbol: c, season: null, name: c };
  return { symbol: c.symbol, season: c.season ?? null, name: c.name || c.symbol };
}

export function versionSymbols(enums) {
  return symbolsOf(enums, "versions");
}

export function crateSymbols(enums) {
  return symbolsOf(enums, "crates");
}

export function versionsDesc(enums) {
  return (enums.versions || [])
    .map(asVersionMeta)
    .sort((a, b) => b.ordinal - a.ordinal);
}

export function latestVersion(enums) {
  const sorted = versionsDesc(enums);
  return sorted.length ? sorted[0].symbol : "";
}

export function versionLabel(enums, symbol) {
  const meta = (enums.versions || []).map(asVersionMeta)
    .find((v) => v.symbol === symbol);
  if (!meta) return String(symbol);
  return `${meta.ordinal} - ${meta.name} (${meta.symbol})`;
}

// Newest season first, TBA crates (season null) on top; the GetCrownCrateName() ordinal is not used.
export function cratesDesc(enums) {
  return (enums.crates || [])
    .map(asCrateMeta)
    .sort((a, b) => {
      if (a.season == null && b.season == null) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (a.season == null) return -1;
      if (b.season == null) return 1;
      return b.season.localeCompare(a.season);
    });
}

export function crateLabel(enums, symbol) {
  const meta = (enums.crates || []).map(asCrateMeta)
    .find((c) => c.symbol === symbol);
  if (!meta) return String(symbol);
  return `${meta.name} - ${meta.season || "TBA"}`;
}

// Every screen that says "record N of M for this item" must agree on which record is N, so the list and its order come from here only.
export function recordsForItem(records, id, enums) {
  if (!Array.isArray(records) || id == null) return [];
  const paired = records.find(r => r.blueprint === id && r.id != null);
  const itemId = paired?.id ?? id;
  const mine = records.filter((r) => r && (r.id === itemId || (r.id == null && r.blueprint === id)));
  return sortBySourcePriority(mine, enums);
}

export function computeSourcelessIds(records) {
  const hasRealSource = new Set();
  const hasRumour = new Set();
  for (const r of records) {
    if (!Number.isInteger(r.id)) continue;
    if (r.source && r.source.type === "rumour") hasRumour.add(r.id);
    else hasRealSource.add(r.id);
  }
  const out = new Set();
  for (const id of hasRumour) {
    if (!hasRealSource.has(id)) out.add(id);
  }
  return out;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Quota or file:// restrictions; the app refetches next load.
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (_) {}
}

// enums.source_priority ranks ItemSources symbols, not source types, and records do not store their ItemSources bucket; this table is the only place that mapping is written down.
const ORIGIN_BY_TYPE = {
  recipe: "CRAFTING",
  vendor: "VENDOR",
  writ_vendor: "WRIT_VENDOR",
  pvp_vendor: "PVP",
  luxury: "LUXURY",
  event_vendor: "FESTIVAL_DROP",
  event_drop: "FESTIVAL_DROP",
  drop: "DROP",
  dungeon_drop: "DROP",
  crown_store: "CROWN",
  crown_crate: "CROWN",
  housing: "EDITOR",
  tome_pack: "TOMES",
  quest_reward: "OTHER",
  companion: "OTHER",
  guild_gift: "OTHER",
  rumour: "RUMOUR",
  ignored: "IGNORED",
};

const ORIGIN_BY_DROP_SUBTYPE = {
  fish: "FISHING",
  steal: "JUSTICE",
  pickpocket: "JUSTICE",
  safebox: "JUSTICE",
  dark_brotherhood: "JUSTICE",
  scryable: "ANTIQUITY",
};

export function originOf(record) {
  const s = record?.source || {};
  if (s.type === "drop" && ORIGIN_BY_DROP_SUBTYPE[s.subtype]) {
    return ORIGIN_BY_DROP_SUBTYPE[s.subtype];
  }
  if (s.type === "vendor" && s.subtype === "home_goods") return "HOME_GOODS";
  if (s.type === "vendor" && s.subtype === "achievement") return "ACHIEVEMENT";
  if (s.vendor === "COLL_MERCH") return "COLL_MERCH";
  if ((record?.cost || []).some((c) => c && c.currency === "TEL_VAR")) return "TELVAR";
  return ORIGIN_BY_TYPE[s.type] || "OTHER";
}

export function sortBySourcePriority(records, enums) {
  const order = new Map((enums?.source_priority || []).map((s, i) => [s, i]));
  const rank = (r) => {
    const i = order.get(originOf(r));
    return i == null ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...records].sort((a, b) => rank(a) - rank(b));
}
