// Which furnishing plans the game says this character knows, from the add-on's knowledge export. Kept apart from the lists: it never becomes one and is never exported from here.

const STORE_KEY = "lfc.knowledge";
const KINDS = ["known", "unknown"];
export const MARKS = {
  known: { glyph: "✅", title: "You can craft this" },
  unknown: { glyph: "✅", title: "You cannot craft this yet" },   // greyed out by its class
  missing: { glyph: "❓", title: "Missing craftable knowledge. Either you didn't import it or it's not in the current game version." },
};

// { known?: { total, pages: [n, ...], ids }, unknown?: { total, pages, ids, previous?: ids }, learned: ids }
// `previous` holds what older unknown exports named while a newer one is still missing pages; once it is complete, the ids it no longer names move to `learned`, which answers as known.
let data = null;
let index = null;
const listeners = new Set();

const isIds = (a) => Array.isArray(a) && a.every(Number.isInteger);

function load() {
  if (!data) {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { /* storage unavailable or damaged */ }
    data = { learned: isIds(stored?.learned) ? stored.learned : [] };
    for (const kind of KINDS) {
      const k = stored?.[kind];
      if (!Number.isInteger(k?.total) || !isIds(k.pages) || !isIds(k.ids)) continue;
      data[kind] = { total: k.total, pages: k.pages, ids: k.ids };
      if (kind === "unknown" && isIds(k.previous)) data[kind].previous = k.previous;
    }
  }
  return data;
}

function save() {
  index = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_) { /* kept for this visit only */ }
  for (const fn of listeners) fn();
}

// Whether an item is made from a blueprint; set where the records are, and asked anew each time, so it follows their changes.
let isCraftable = (_id) => false;
export function setCraftableLookup(fn) {
  if (typeof fn === "function") isCraftable = fn;
}

export function onKnowledgeChange(fn) { listeners.add(fn); }
export function getKnowledge() { return load(); }

export function knowledgeOf(id) {
  if (!index) {
    const d = load();
    index = new Map();
    for (const i of d.unknown?.ids || []) index.set(i, "unknown");
    for (const i of [...(d.known?.ids || []), ...d.learned]) index.set(i, "known");
  }
  const d = load();
  // A craftable no import named is "missing", but only once there is knowledge to miss it from.
  return index.get(id) ?? ((d.known || d.unknown || d.learned.length) && isCraftable(id) ? "missing" : null);
}

export function missingPages(kind) {
  const k = load()[kind];
  if (!k) return [];
  return Array.from({ length: k.total }, (_, i) => i + 1).filter((p) => !k.pages.includes(p));
}

export function forgetKnowledge() {
  data = { learned: [] };
  save();
}

const HEAD = /^furc\s+(known|unknown)(?=$|[\s:])(.*)$/i;
const PAGE = /^\s*(\d+)\s*\/\s*(\d+)\s*:\s*([\d,\s]*)$/;

// null for any other line; `bad` for a knowledge line without a usable page/pages.
export function knowledgeLine(line) {
  const head = line.match(HEAD);
  if (!head) return null;
  const m = head[2].match(PAGE);
  const page = Number(m?.[1]), pages = Number(m?.[2]);
  if (!m || page < 1 || page > pages) return { kind: head[1].toLowerCase(), bad: true };
  return { kind: head[1].toLowerCase(), page, pages, ids: m[3] };
}

// The game keeps knowledge for craftables only: a recipe record's furnishing answers for itself and for its blueprint; anything else (rumours too) is null.
export function recipeResolver(records) {
  const to = new Map();
  for (const r of records) {
    if (r.source?.type !== "recipe") continue;
    const id = r.id ?? r.blueprint;
    for (const k of [r.id, r.blueprint]) if (Number.isInteger(k)) to.set(k, id);
  }
  return (id) => to.get(id) ?? null;
}

/**
 * Lines of one import action, `{ knowledge: kind, page, pages, ids }`. A stored export of another size, or one already holding an incoming page, is replaced; otherwise the pages add up.
 * @param resolve maps a craftable furnishing or its blueprint to the furnishing id, or null for anything else (counted as `notCraftable`).
 */
export function importKnowledge(entries, resolve = (id) => id) {
  const d = load();
  const report = { kinds: [], notCraftable: 0 };
  for (const kind of KINDS) {
    const ofKind = entries.filter((e) => e.knowledge === kind);
    // Lines of different sizes in one paste are separate exports, applied in the order they first appear.
    for (const total of new Set(ofKind.map((e) => e.pages))) {
      const lines = ofKind.filter((e) => e.pages === total);
      const ids = [];
      for (const raw of lines.flatMap((e) => e.ids)) {
        const id = resolve(raw);
        if (id == null) report.notCraftable++;
        else ids.push(id);
      }
      const pages = new Set(lines.map((e) => e.page));
      let cur = d[kind];
      if (!cur || cur.total !== total || cur.pages.some((p) => pages.has(p))) {
        const previous = kind === "unknown" && cur ? [...new Set([...(cur.previous || []), ...cur.ids])] : [];
        cur = d[kind] = { total, pages: [], ids: [], ...(previous.length ? { previous } : {}) };
      }
      for (const p of pages) if (!cur.pages.includes(p)) cur.pages.push(p);
      cur.pages.sort((a, b) => a - b);
      const have = new Set(cur.ids);
      for (const id of ids) if (!have.has(id)) { have.add(id); cur.ids.push(id); }

      const named = new Set(ids);
      const other = d[kind === "known" ? "unknown" : "known"];
      if (other) other.ids = other.ids.filter((id) => !named.has(id));
      if (kind === "unknown") d.learned = d.learned.filter((id) => !named.has(id));
      if (cur.previous && cur.pages.length === total) {
        const learned = new Set(d.learned);
        for (const id of cur.previous) if (!have.has(id)) learned.add(id);
        d.learned = [...learned];
        delete cur.previous;
      }
      if (!report.kinds.includes(kind)) report.kinds.push(kind);
    }
  }
  if (entries.length) save();
  return report;
}

const pagesText = (ps) => `page${ps.length === 1 ? "" : "s"} ${ps.join(", ")}`;

// "2301 known, page 1 of 2 (page 2 missing)"
export function kindReport(kind) {
  const k = load()[kind];
  if (!k) return "";
  const missing = missingPages(kind);
  return `${k.ids.length} ${kind}` + (missing.length ? `, ${pagesText(k.pages)} of ${k.total} (${pagesText(missing)} missing)` : "");
}

// "Known: 2301 (page 2 of 2 missing)"
export function kindStatus(kind) {
  const k = load()[kind];
  if (!k) return "";
  const missing = missingPages(kind);
  return `${kind === "known" ? "Known" : "Unknown"}: ${k.ids.length}` + (missing.length ? ` (${pagesText(missing)} of ${k.total} missing)` : "");
}

// Read-only marker for an id with a stored state; null otherwise.
export function knowledgeMarker(id) {
  const state = knowledgeOf(id);
  if (!state) return null;
  const { glyph, title } = MARKS[state];
  const mark = document.createElement("span");
  mark.className = `knowledge-mark is-${state}`;
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", title);
  mark.title = title;
  mark.textContent = glyph;
  return mark;
}
