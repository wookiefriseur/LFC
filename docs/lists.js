// Named furnishing lists, kept in this browser only. The text form is FurnitureCatalogue's own list line, so a list copied here pastes into the add-on's import window, and an add-on export pastes back here.
import { itemSearch } from "./crown-store.js";
import { tradingLinkGroups, isTradeable, costNode } from "./external-links.js";
import {
  forgetKnowledge, getKnowledge, importKnowledge, kindReport, kindStatus, knowledgeLine, knowledgeMarker, knowledgeOf, missingPages, onKnowledgeChange, recipeResolver,
} from "./knowledge.js";
import { t, tn, translateTree } from "./lexicon.js";

const STORE_KEY = "lfc.lists";
export const MAX_NAME_LENGTH = 32;   // bytes, for each part of a path
export const MAX_DEPTH = 3;
const SEP = " > ";
const PREFIX = "FURC LIST";
const FAVES_PREFIX = "FURC FAVES";
export const FAVES_NAME = "Favorites";   // english name of SI_FURC_FILTER_SRC_FAVE
export const MAX_IDS_PER_LINE = 1000;
// The add-on's import box holds 20000 characters and treats a paste that fills it as cut off. A page stays clear of that, with room for line breaks pasted as two characters.
export const PAGE_BYTES = 19000;
// `last` value naming the favourites, which have no name of their own to remember.
const LAST_FAVES = "\u0000faves";

// { lists: [{ name, ids: [itemId, ...], faves?: true }], last: name of the list "Add to list" offers first }
// The favourites are the one entry flagged `faves`, always first. Name lookups skip it, so a list a user already called "Favorites" stays an ordinary list beside it.
// A sublist carries its whole path as its name ("Guildhall > Entrance"), and every parent is a list of its own. The array is the display order: a parent first, everything below it right after.
let data = null;
const listeners = new Set();

function load() {
  if (!data) {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { /* storage unavailable or damaged */ }
    data = { lists: [], last: "" };
    // Rebuilt through ensure(), so an old store (or a hand-edited one) comes out grouped, with every parent present
    for (const l of Array.isArray(stored?.lists) ? stored.lists : []) {
      if (!l || !Array.isArray(l.ids)) continue;
      if (l.faves) { data.lists.push(l); continue; }
      const into = ensure(normPath(l.name) || "/", data.lists);
      for (const id of l.ids) if (!into.ids.includes(id)) into.ids.push(id);
    }
    const last = typeof stored?.last === "string" ? stored.last : "";
    data.last = last === LAST_FAVES ? last : normPath(last);
  }
  const at = data.lists.findIndex((l) => l?.faves);
  if (at !== 0) data.lists.unshift(at > 0 ? data.lists.splice(at, 1)[0] : { name: FAVES_NAME, ids: [], faves: true });
  data.lists[0].name = FAVES_NAME;
  return data;
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_) { /* kept for this visit only */ }
  for (const fn of listeners) fn();
}

export function onListsChange(fn) { listeners.add(fn); }
export function getLists() { return load().lists; }
export function favourites() { return load().lists[0]; }
export function namedLists() { return getLists().filter((l) => !l.faves); }
export function isFave(id) { return favourites().ids.includes(id); }
export function toggleFave(id) { setItem(favourites(), id, !isFave(id)); }

function find(lists, name) {
  const lower = String(name ?? "").trim().toLowerCase();
  return lists.find((l) => !l.faves && l.name.toLowerCase() === lower) || null;
}
export function findList(name) { return find(getLists(), name); }

// Paths

const partsOf = (name) => name.split(SEP);
export const depthOf = (list) => (list.faves ? 1 : partsOf(list.name).length);
export const leafOf = (list) => partsOf(list.name).at(-1);
const isUnder = (list, parent) => !list.faves && !parent.faves && list.name.toLowerCase().startsWith(parent.name.toLowerCase() + SEP);
export function parentOf(list) {
  return depthOf(list) > 1 ? findList(partsOf(list.name).slice(0, -1).join(SEP)) : null;
}
export function hasChildren(list) { return getLists().some((l) => isUnder(l, list)); }

// Index after the last list below lists[i].
function subtreeEnd(lists, i) {
  let j = i + 1;
  while (j < lists.length && isUnder(lists[j], lists[i])) j++;
  return j;
}

// The add-on's rules, as far as the site can check them: it also refuses a name equal to any of its (localised) source labels.
function fitName(raw) {
  let name = String(raw ?? "").replace(/[\r\n]+/g, " ").trim();
  while (new TextEncoder().encode(name).length > MAX_NAME_LENGTH) name = [...name].slice(0, -1).join("");
  return name.trim();
}

// The written form of a path: parts trimmed and cut to length, " > " between them. Levels beyond the third are folded into the third part's name.
export function normPath(raw) {
  let parts = String(raw ?? "").replace(/[\r\n]+/g, " ").split(">").map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_DEPTH) parts = [...parts.slice(0, MAX_DEPTH - 1), parts.slice(MAX_DEPTH - 1).join(" / ")];
  return parts.map(fitName).filter(Boolean).join(SEP);
}

// The list at a written path, made together with every missing parent. A new sublist goes below its parent's last one, a new root list to the end.
function ensure(name, lists = load().lists) {
  let list = null;
  for (const part of partsOf(name)) {
    const parent = list;
    const path = parent ? parent.name + SEP + part : part;
    list = find(lists, path);
    if (list) continue;
    list = { name: path, ids: [] };
    lists.splice(parent ? subtreeEnd(lists, lists.indexOf(parent)) : lists.length, 0, list);
  }
  return list;
}

const isReserved = (name) => ["favorites", "favourites"].includes(name.toLowerCase());

/**
 * A new list takes a whole path ("Guildhall > Entrance"). A rename changes the last part of `own` only, so `>` in it becomes `/`.
 * A stored root list that already holds the reserved name may keep it, and have sublists.
 */
export function cleanName(raw, own = null) {
  let name = normPath(raw);
  if (own) {
    const leaf = fitName(String(raw ?? "").replace(/>/g, "/"));
    name = leaf && [...partsOf(own.name).slice(0, -1), leaf].join(SEP);
  }
  if (!name) return { error: t("lists.error.no_name") };
  const root = partsOf(name)[0];
  if (isReserved(root) && !findList(root)) return { error: t("lists.error.reserved", { name: root, favourites: t("lists.favourites") }) };
  const taken = findList(name);
  if (taken && taken !== own) return { error: t("lists.error.taken", { name: taken.name }) };
  return { name };
}

export function createList(raw) {
  const { name, error } = cleanName(raw);
  if (error) return { error };
  const list = ensure(name);
  save();
  return { list };
}

// Renames the list for everything below it as well.
export function renameList(list, raw) {
  if (list.faves) return { error: t("lists.error.faves_rename", { favourites: t("lists.favourites") }) };
  const { name, error } = cleanName(raw, list);
  if (error) return { error };
  const old = list.name;
  const moved = (n) => name + n.slice(old.length);
  const below = getLists().filter((l) => isUnder(l, list));
  if (data.last === old || isUnder({ name: data.last }, list)) data.last = moved(data.last);
  for (const l of below) l.name = moved(l.name);
  list.name = name;
  save();
  return { list };
}

// A list with sublists is emptied and stays, as their parent; it goes once they are gone.
export function deleteList(list) {
  if (list.faves) return;
  const lists = load().lists;
  const i = lists.indexOf(list);
  if (i === -1) return;
  if (hasChildren(list)) list.ids = [];
  else {
    lists.splice(i, 1);
    if (data.last === list.name) data.last = "";
  }
  save();
}

// Every named list goes; the favourites stay, and so does `last` when it names them.
export function deleteAllLists() {
  load().lists.splice(1);
  if (data.last !== LAST_FAVES) data.last = "";
  save();
}

// [start, length, destination] for moving a list, with everything below it, past the sibling before (-1) or after (+1) it; null at either end.
function moveSpan(list, delta) {
  const lists = load().lists;
  const i = lists.indexOf(list);
  if (i < 1) return null;
  const depth = depthOf(list);
  const end = subtreeEnd(lists, i);
  if (delta < 0) {
    let j = i - 1;
    while (j > 0 && depthOf(lists[j]) > depth) j--;
    return j > 0 && depthOf(lists[j]) === depth ? [i, end - i, j] : null;
  }
  if (end >= lists.length || depthOf(lists[end]) !== depth) return null;
  return [end, subtreeEnd(lists, end) - end, i];
}
export function canMove(list, delta) { return Boolean(moveSpan(list, delta)); }
export function moveList(list, delta) {
  const span = moveSpan(list, delta);
  if (!span) return false;
  const [from, count, to] = span;
  data.lists.splice(to, 0, ...data.lists.splice(from, count));
  save();
  return true;
}

// Where a list goes when it moves out of its parent (-1, after the parent's whole subtree) or into the sibling directly above (+1, as its last sublist), taking everything below along; null when it cannot. Levels are never folded.
function shiftTarget(list, delta) {
  const lists = load().lists;
  const i = lists.indexOf(list);
  if (i < 1 || list.faves) return null;
  const depth = depthOf(list);
  const end = subtreeEnd(lists, i);
  if (delta < 0) {
    const parent = parentOf(list);
    if (!parent) return null;
    return { name: [...partsOf(parent.name).slice(0, -1), leafOf(list)].join(SEP), to: subtreeEnd(lists, lists.indexOf(parent)), end, via: parent };
  }
  let j = i - 1;
  while (j > 0 && depthOf(lists[j]) > depth) j--;
  if (j < 1 || depthOf(lists[j]) !== depth) return null;
  if (Math.max(...lists.slice(i, end).map(depthOf)) >= MAX_DEPTH) return null;
  return { name: lists[j].name + SEP + leafOf(list), to: end, end, via: lists[j] };
}

// { ok, via: the parent left or the list entered, reason: only for what the tree does not show }
export function canShift(list, delta) {
  const to = shiftTarget(list, delta);
  if (!to) return { ok: false };
  if (!to.name.includes(SEP) && isReserved(to.name)) return { ok: false, via: to.via, reason: t("lists.error.reserved", { name: to.name, favourites: t("lists.favourites") }) };
  const taken = findList(to.name);
  if (taken) return { ok: false, via: to.via, reason: t("lists.error.taken", { name: taken.name }) };
  return { ok: true, via: to.via };
}

export function shiftList(list, delta) {
  if (!canShift(list, delta).ok) return false;
  const { name, to, end } = shiftTarget(list, delta);
  const lists = data.lists;
  const i = lists.indexOf(list);
  const old = list.name;
  const moved = (n) => name + n.slice(old.length);
  if (data.last === old || isUnder({ name: data.last }, list)) data.last = moved(data.last);
  for (const l of lists.slice(i, end)) l.name = moved(l.name);
  if (to > end) lists.splice(to - (end - i), 0, ...lists.splice(i, end - i));
  save();
  return true;
}

export function setItem(list, id, on) {
  const at = list.ids.indexOf(id);
  if (on && at === -1) list.ids.push(id);
  else if (!on && at !== -1) list.ids.splice(at, 1);
  else return;
  save();
}

export function listsWith(id) { return namedLists().filter((l) => l.ids.includes(id)); }
export function lastList() {
  const last = load().last;
  return last === LAST_FAVES ? favourites() : findList(last);
}
export function rememberList(list) {
  const key = list.faves ? LAST_FAVES : list.name;
  if (load().last === key) return;
  data.last = key;
  save();
}

// Text form

function chunks(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_LINE) out.push(ids.slice(i, i + MAX_IDS_PER_LINE));
  return out.length ? out : [[]];
}

// One line per 1000 ids, each repeating the head with the full path, so the game's edit box never cuts one and every line stands alone.
// The first line is the list ("FURC LIST name:"), every further one adds to it ("FURC LIST+ name:"), so an import replaces the list once however its lines are spread over pages.
export function formatList(list) {
  const head = (plus) => (list.faves ? `${FAVES_PREFIX}${plus}:` : `${PREFIX}${plus} ${list.name}:`);
  return chunks(list.ids).map((ids, i) => `${head(i ? "+" : "")} ${ids.join(",")}`.trimEnd()).join("\n");
}

export function formatListNames(list, nameOf) {
  const title = list.faves ? "Favorites" : list.name;
  return [title, ...list.ids.map((id) => nameOf(id) || `#${id}`)].join("\n");
}

export function formatLists(lists = getLists()) {
  return lists.filter((l) => !l.faves || l.ids.length).map(formatList).join("\n");
}

// Whole lines packed into pages for the game's box, as the add-on pages its own export. A line longer than a page gets one of its own.
export function paginate(text, maxBytes = PAGE_BYTES) {
  const size = (line) => new TextEncoder().encode(line).length;
  const pages = [];
  let page = [], used = 0;
  for (const line of String(text ?? "").split("\n")) {
    const bytes = size(line) + 1;
    if (page.length && used + bytes > maxBytes) { pages.push(page.join("\n")); page = []; used = 0; }
    page.push(line);
    used += bytes;
  }
  pages.push(page.join("\n"));
  return pages;
}

// The add-on's line (the path runs to the last colon), plus `"name": {1, 2}` for hand-written files.
// The line carries no version. The prefix is still read in every earlier spelling: "FURC LIST: ...", "[FURC LIST] ..." and a version 1 before the colon.
function payloadOf(line, kind) {
  const bracketed = line.match(/^\[\s*([^\]]*?)\s*\]\s*:?\s*(.*)$/);
  if (bracketed) {
    const head = bracketed[1].replace(/\s+/g, " ").toUpperCase().match(/^(.*?)(?: (\d+))?$/);
    return head[1] === kind && (head[2] ?? "1") === "1" ? bracketed[2] : null;
  }
  const rest = line.match(new RegExp(`^${kind.replace(/[+]/g, "\\$&").replace(/ /g, "\\s+")}(?=$|[\\s:])(.*)$`, "i"))?.[1];
  if (rest == null) return null;
  // A number is the version only right before the colon: "FURC LIST 2 chairs: ..." is a list called "2 chairs".
  const versioned = rest.match(/^\s+(\d+)\s*:\s*(.*)$/);
  if (versioned) return versioned[1] === "1" ? versioned[2] : null;
  return rest.replace(/^\s*:?\s*/, "");
}
const LINE = /^(.*):\s*([\d,\s]*)$/;
const FAVES_LINE = /^([\d,\s]*)$/;
const BRACES = /^"((?:[^"\\]|\\.)*)"\s*:\s*\{([\d,\s]*)\}\s*,?$/;
const BARE = /^[\d,\s]*\d[\d,\s]*$/;

function idsOf(text) {
  return (text.match(/\d+/g) || []).map(Number).filter((id) => id > 0 && Number.isSafeInteger(id));
}

/**
 * Ids are kept as written, repeats included, so the import can count them as duplicates.
 * A line of ids without a prefix continues the line right above it, joined as it stands: the game breaks a long pasted line in two, also in the middle of an id. Standing alone it is a `bare` entry for the selected list.
 * Crafting knowledge lines go to `knowledge`, as `{ knowledge: "known" | "unknown", page, pages, ids }`.
 */
export function parseLists(text) {
  const lists = [];
  const knowledge = [];
  let skipped = 0;
  let above = null;
  const entry = (head, ids, into = lists) => { into.push(above = { ...head, ids }); };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const open = above;
    above = null;
    if (!line) continue;
    if (BARE.test(line)) {
      if (open) (above = open).ids += line;
      else entry({ bare: true }, line);
      continue;
    }
    const known = knowledgeLine(line);
    if (known?.bad) { skipped++; continue; }
    if (known) { entry({ knowledge: known.kind, page: known.page, pages: known.pages }, known.ids, knowledge); continue; }
    // The plus belongs to the prefix ("FURC LIST+ name"); apart from it, it starts the list's name.
    const favAdd = payloadOf(line, FAVES_PREFIX + "+")?.match(FAVES_LINE);
    const fav = favAdd || payloadOf(line, FAVES_PREFIX)?.match(FAVES_LINE);
    if (fav) { entry({ faves: true, ...(favAdd && { add: true }) }, fav[1]); continue; }
    const listAdd = payloadOf(line, PREFIX + "+")?.match(LINE);
    const m = listAdd || payloadOf(line, PREFIX)?.match(LINE) || line.match(BRACES);
    // Brought into its written form before matching, as the add-on does, so an over-long or over-deep path merges into the list it became.
    const name = m && normPath(m[0].startsWith('"') ? m[1].replace(/\\(.)/g, "$1") : m[1]);
    if (!name) { skipped++; continue; }
    entry({ name, ...(listAdd && { add: true }) }, m[2]);
  }
  for (const l of [...lists, ...knowledge]) l.ids = idsOf(l.ids);
  return { lists, knowledge, skipped };
}

/**
 * Like the add-on's import: the first line of a list or of the favourites in a paste replaces what it held, unless it is an add line ("FURC LIST+") or `mode.merge` is set; every further line, and a line of ids alone, adds. A list the paste does not name is left alone, missing parents are made empty. Saved and announced once, after the whole paste.
 * @param mode `check`: count what the import would do (`removed` above all) and change nothing; `merge`: add only, remove nothing.
 * @param resolve maps a furnishing or blueprint id to the furnishing id, or null when the catalogue does not know it; the default keeps every id.
 * @param target the selected list, which takes lines of ids that name no list; without one they are refused.
 * @param craftable the same for crafting knowledge lines, which name craftables only.
 */
export function importLists(text, resolve = (id) => id, target = null, craftable = (id) => id, mode = {}) {
  const { lists, knowledge, skipped } = parseLists(text);
  const report = { lists: 0, added: 0, duplicates: 0, unknown: 0, removed: 0, skipped, errors: [], first: null, knowledge: null };
  if (knowledge.length && !mode.check) report.knowledge = importKnowledge(knowledge, craftable);
  const work = new Map();     // list -> its ids, a copy when only checking
  const before = new Map();   // list -> what it held when its first line replaced it
  for (const incoming of lists) {
    let list = incoming.faves ? favourites() : incoming.bare ? target : findList(incoming.name);
    if (!list && incoming.bare) { report.errors.push(t("lists.error.bare_ids")); continue; }
    if (!list) {
      const { name, error } = cleanName(incoming.name);
      if (error) { report.errors.push(error); continue; }
      if (mode.check) continue;   // a new list loses nothing
      list = ensure(name);
    }
    if (!work.has(list)) work.set(list, mode.check ? [...list.ids] : list.ids);
    const ids = work.get(list);
    if (!incoming.add && !incoming.bare && !mode.merge && !before.has(list)) {
      before.set(list, [...ids]);
      ids.length = 0;
    }
    report.first ??= list;
    for (const raw of incoming.ids) {
      const id = resolve(raw);
      if (id == null) report.unknown++;
      else if (ids.includes(id)) report.duplicates++;
      else { ids.push(id); report.added++; }
    }
  }
  for (const [list, old] of before) {
    // What was there and stays is no addition.
    const kept = old.filter((id) => work.get(list).includes(id)).length;
    report.added -= kept;
    report.duplicates += kept;
    report.removed += old.length - kept;
  }
  report.lists = work.size;
  if (lists.length && !mode.check) save();
  return report;
}

// Furnishing ids answer for themselves, a blueprint for the furnishing it makes; anything else is unknown (null).
export function catalogueResolver(records) {
  const furnishing = new Map();
  for (const r of records) if (Number.isInteger(r.id)) furnishing.set(r.id, r.id);
  for (const r of records) {
    if (Number.isInteger(r.blueprint) && !furnishing.has(r.blueprint)) furnishing.set(r.blueprint, r.id ?? r.blueprint);
  }
  for (const r of records) {
    if (r.source?.type === "ignored") for (const id of [r.id, r.blueprint]) furnishing.delete(id);
  }
  return (id) => furnishing.get(id) ?? null;
}

// Counts only, short enough for the status line; `warn` when something was left out.
export function reportText(r) {
  const k = r.knowledge;
  if (!r.lists && !k) return { text: r.errors[0] || t("lists.report.none"), warn: true };
  const parts = [];
  if (r.lists) {
    let text = t("lists.report.imported", { lists: tn(r.lists, "common.count_lists"), items: tn(r.added, "lists.report.added") });
    if (r.removed) text += `, ${t("lists.report.removed", { n: r.removed })}`;
    if (r.duplicates) text += `, ${tn(r.duplicates, "lists.report.duplicates")}`;
    if (r.unknown) text += `, ${t("lists.report.unknown", { n: r.unknown })}`;
    parts.push(text);
  }
  if (k) parts.push(t("lists.report.knowledge", { kinds: k.kinds.map(kindReport).join("; ") }) + (k.notCraftable ? `, ${t("lists.report.not_craftable", { n: k.notCraftable })}` : ""));
  let text = parts.join(". ");
  if (r.skipped) text += `, ${tn(r.skipped, "lists.report.lines_skipped")}`;
  if (r.errors.length) text += `. ${r.errors[0]}`;
  const gaps = k?.kinds.some((kind) => missingPages(kind).length);
  return { text, warn: Boolean(r.skipped || r.errors.length || r.unknown || k?.notCraftable || gaps) };
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileName(name) {
  return `${String(name).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "list"}.txt`;
}

// The Lists tab

const ROWS_PER_BATCH = 100;

export function listsMask(deps) {
  const { state, $, elem, nameOf, itemIconImg } = deps;
  const searchItems = itemSearch(state, nameOf);
  let current = null;
  let rowWatch = null;
  let matches = [];
  let activeMatch = -1;

  function render(container) {
    container.innerHTML = `
      <section class="lists-mask">
        <aside class="lists-side">
          <h2 data-t="tab.lists"></h2>
          <p class="muted" data-t="lists.stored"></p>
          <ul id="lists-index" class="lists-index"></ul>
          <form id="lists-new" class="lists-inline">
            <input id="lists-new-name" data-t-placeholder="lists.new.placeholder" data-t-aria-label="lists.new.label">
            <button class="btn-primary" data-t="lists.create"></button>
          </form>
          <p id="lists-new-error" class="warn" role="alert" hidden></p>
          <div id="lists-knowledge" class="lists-knowledge"></div>
        </aside>
        <div class="lists-col">
          <details id="lists-transfer" class="lists-transfer">
            <summary data-t="lists.transfer"></summary>
            <textarea id="lists-text" rows="4" spellcheck="false" data-t-aria-label="lists.text.label"></textarea>
            <div id="lists-pager" class="lists-row" hidden>
              <button id="lists-page-prev" type="button" class="btn-mini" data-t="lists.page_prev"></button>
              <strong id="lists-page-pos"></strong>
              <button id="lists-page-next" type="button" class="btn-mini" data-t="lists.page_next"></button>
              <span class="muted" data-t="lists.page_hint"></span>
            </div>
            <div class="lists-row">
              <button id="lists-import" type="button" class="btn-primary" disabled data-t-title="lists.import.tip" data-t="lists.import"></button>
              <label class="btn-like" data-t-title="lists.import_file.tip"><span data-t="lists.import_file"></span><input id="lists-file" type="file" accept=".txt,text/plain" hidden></label>
              <span class="lists-row-gap"></span>
              <select id="lists-format" data-t-aria-label="lists.format.label" data-t-title="lists.format.tip">
                <option value="ids" data-t="lists.format.ids"></option>
                <option value="names" data-t="lists.format.names"></option>
              </select>
              <button id="lists-copy" type="button" data-t-title="lists.copy.tip" data-t="lists.copy"></button>
              <button id="lists-download" type="button" data-t-title="lists.download.tip" data-t="lists.download"></button>
              <button id="lists-help-toggle" type="button" class="btn-mini" aria-expanded="false" aria-controls="lists-help" data-t-aria-label="lists.help.label" data-t-title="lists.help.label">?</button>
            </div>
            <div id="lists-help" class="lists-help muted" hidden>
              <p data-t="lists.help.box"></p>
              <p data-t="lists.help.copy"></p>
              <p data-t="lists.help.pages"></p>
              <p data-t="lists.help.import"></p>
              <p data-t="lists.help.merge"></p>
              <p data-t="lists.help.names"></p>
              <p data-t="lists.help.ids"><code data-hole="example">115647,118303</code></p>
            </div>
          </details>
          <p id="lists-status" class="lists-status" role="status"></p>
          <div id="lists-main" class="lists-main"></div>
        </div>
      </section>`;
    translateTree(container);

    $("#lists-new").addEventListener("submit", (e) => {
      e.preventDefault();
      const made = createList($("#lists-new-name").value);
      $("#lists-new-error").hidden = !made.error;
      $("#lists-new-error").textContent = made.error || "";
      if (made.error) return;
      $("#lists-new-name").value = "";
      select(made.list);
      $("#lists-search")?.focus();
    });
    const text = $("#lists-text");
    text.addEventListener("input", () => { edited = true; syncImport(); });
    // The whole export is what gets copied, and what a paste replaces.
    text.addEventListener("focus", () => { if (!edited) text.select(); });
    $("#lists-import").addEventListener("click", () => runImport(text.value));
    $("#lists-help-toggle").addEventListener("click", (e) => {
      const help = $("#lists-help");
      help.hidden = !help.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!help.hidden));
    });
    $("#lists-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) runImport(await file.text());
    });
    $("#lists-copy").addEventListener("click", copyOut);
    $("#lists-page-prev").addEventListener("click", () => showPage(page - 1));
    $("#lists-page-next").addEventListener("click", () => showPage(page + 1));
    $("#lists-format").addEventListener("change", () => { page = 0; fillBox(true); });
    $("#lists-download").addEventListener("click", () => {
      const out = exportText();
      if (out) download(current === ALL ? "furnishing-lists.txt" : fileName(current === KNOWLEDGE ? t("lists.knowledge") : current.name), out);
      else status(t("lists.nothing_to_export"), true);
    });
    onListsChange(() => { if ($("#lists-index")) { drawIndex(); fillBox(); } });
    onKnowledgeChange(() => { if ($("#lists-index")) drawIndex(); });
    current = defaultList();
    drawMain();
  }

  let statusTimer = null;
  // A confirmation clears itself; a warning stays until the next action.
  function status(text, warn = false) {
    const el = $("#lists-status");
    el.textContent = text;
    el.classList.toggle("is-warn", warn);
    clearTimeout(statusTimer);
    if (!warn) statusTimer = setTimeout(() => { el.textContent = ""; }, 5000);
  }

  // The box is the export of the selection until the visitor types or pastes into it; then it is theirs until imported or another row is chosen.
  let edited = false;
  const asNames = () => $("#lists-format")?.value === "names";
  const exportText = () => {
    // the game's own knowledge export comes from the add-on; as names, the shown selection (All, Known, Unknown) goes out
    if (current === KNOWLEDGE) {
      const ids = asNames() ? knowledgeIds() : [];
      return ids.length ? formatListNames({ name: `${t("lists.knowledge")}: ${t(KNOWLEDGE_CHOICES[knowledgeFilter])}`, ids }, nameOf) : "";
    }
    if (!asNames()) return current === ALL ? formatLists() : formatList(current);
    const lists = current === ALL ? getLists().filter((l) => !l.faves || l.ids.length) : [current];
    return lists.map((l) => formatListNames(l, nameOf)).join("\n\n");
  };
  function syncImport() { $("#lists-import").disabled = !edited || !$("#lists-text").value.trim(); }
  let pages = [""];
  let page = 0;
  function fillBox(force = false) {
    if (edited && !force) return;
    // pages are the game's import box; names go elsewhere, in one piece
    pages = asNames() ? [exportText()] : paginate(exportText());
    showPage(page);
  }
  // Also takes the box back from whatever was typed into it.
  function showPage(n) {
    page = Math.max(0, Math.min(pages.length - 1, n));
    edited = false;
    $("#lists-text").value = pages[page];
    $("#lists-pager").hidden = pages.length < 2;
    $("#lists-page-pos").textContent = t("lists.page_pos", { page: page + 1, pages: pages.length });
    $("#lists-page-prev").disabled = page === 0;
    $("#lists-page-next").disabled = page === pages.length - 1;
    syncImport();
  }

  // Replacing a list is only asked about when it would lose items.
  function runImport(text, mode) {
    const args = [text, catalogueResolver(state.records), current === ALL || current === KNOWLEDGE ? null : current, recipeResolver(state.records)];
    const removed = mode ? 0 : importLists(...args, { check: true }).removed;
    if (removed) {
      const choice = (label, onClick) => {
        const btn = elem("button", { type: "button", class: "btn-mini" }, t(label));
        btn.addEventListener("click", onClick);
        return btn;
      };
      status("", true);
      $("#lists-status").replaceChildren(t("lists.import.confirm", { n: removed }), " ",
        choice("lists.import.replace", () => runImport(text, {})), " ",
        choice("lists.import.add_only", () => runImport(text, { merge: true })), " ",
        choice("common.cancel", () => status("")));
      return;
    }
    const r = importLists(...args, mode);
    const { text: message, warn } = reportText(r);
    status(message, warn);
    if (r.first && current !== ALL && current.faves) current = r.first;
    // A refused paste stays in the box to be corrected; an imported one gives way to the fresh export.
    if (r.lists || r.knowledge) edited = false;
    drawMain();
  }

  async function copyOut() {
    const box = $("#lists-text");
    if (!box.value.trim()) { status(t("lists.nothing_to_export"), true); return; }
    box.select();
    try {
      await navigator.clipboard.writeText(box.value);
      status(pages.length > 1 && !edited ? t("lists.copied_page", { page: page + 1, pages: pages.length }) : t("lists.copied"));
    } catch (_) {
      status(t("lists.copy_manual"), true);
    }
  }

  function select(list) {
    // Knowledge only goes out as names; coming back to a list, the box is ids again.
    if ((list === KNOWLEDGE) !== (current === KNOWLEDGE)) $("#lists-format").value = list === KNOWLEDGE ? "names" : "ids";
    current = list;
    matches = [];
    edited = false;
    page = 0;
    drawMain();
  }

  function drawIndex() {
    const ul = $("#lists-index");
    ul.innerHTML = "";
    $("#lists-new-name").title = t("lists.new.tip", { n: MAX_DEPTH });
    const all = elem("button", { type: "button", class: "lists-index-item" + (current === ALL ? " is-active" : ""), title: t("lists.all.tip") },
      elem("span", {}, t("lists.all")), elem("span", { class: "muted" }, String(namedLists().length)));
    all.addEventListener("click", () => select(ALL));
    ul.append(elem("li", { class: "lists-index-all" }, all));
    for (const list of getLists()) {
      const btn = elem("button", { type: "button", class: "lists-index-item" + (list === current ? " is-active" : ""), title: list.name },
        elem("span", {}, listLabel(list)), elem("span", { class: "muted" }, String(list.ids.length)));
      btn.style.setProperty("--depth", depthOf(list) - 1);
      btn.addEventListener("click", () => select(list));
      ul.append(elem("li", {}, btn));
    }
    if (!namedLists().length) ul.append(elem("li", { class: "muted" }, t("lists.none")));
    drawKnowledge();
  }

  // Apart from the lists, as the add-on's manager shows it. Selecting it shows what the markers mean and offers Forget; it never takes bare ids.
  function drawKnowledge() {
    const host = $("#lists-knowledge");
    const k = getKnowledge();
    const kinds = ["known", "unknown"].filter((kind) => k[kind]);
    const btn = elem("button", { type: "button", class: "lists-index-item" + (current === KNOWLEDGE ? " is-active" : ""), title: t("lists.knowledge.tip") },
      elem("span", {}, t("lists.knowledge")));
    btn.addEventListener("click", () => select(KNOWLEDGE));
    // Known and unknown on one line; with both complete, a bar of the known share above it. A missing page would skew it.
    const lines = kinds.length ? [elem("p", { class: "lists-knowledge-counts" }, kinds.map((kind) => elem("span", {}, kindStatus(kind))))] : [];
    if (kinds.length === 2 && !missingPages("known").length && !missingPages("unknown").length) lines.unshift(knowledgeBar(new Set([...k.known.ids, ...k.learned]).size, k.unknown.ids.length));
    if (k.learned.length) lines.push(elem("p", {}, t("lists.knowledge.learned", { n: k.learned.length })));
    if (kinds.length === 1) {
      const other = kinds[0] === "known" ? "unknown" : "known";
      lines.push(elem("p", {}, t("lists.knowledge.import_other", { kind: other.toUpperCase() })));
    }
    if (!kinds.length) lines.push(elem("p", {}, t("lists.knowledge.source")));
    host.replaceChildren(btn, elem("div", { class: "muted lists-knowledge-status" }, lines));
  }

  function knowledgeBar(known, unknown) {
    const share = known + unknown ? known / (known + unknown) : 0;
    let pct;
    try { pct = new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(share); } catch (_) { pct = `${Math.round(share * 100)} %`; }
    const label = t("lists.knowledge.share");
    const bar = elem("span", { class: "knowledge-bar", role: "progressbar", "aria-label": label, title: label,
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(share * 100)), "aria-valuetext": pct },
      elem("span", { class: "knowledge-bar-known" }));
    bar.firstChild.style.width = `${share * 100}%`;
    return elem("p", { class: "lists-knowledge-share" }, bar, elem("span", {}, pct));
  }

  let knowledgeFilter = "all";
  // The ids the knowledge view shows: the chosen selection, by name
  function knowledgeIds() {
    const k = getKnowledge();
    const all = [...new Set([...(k.known?.ids || []), ...k.learned, ...(k.unknown?.ids || [])])];
    return all.map((id) => [id, nameOf(id) || ""]).sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])
      .map(([id]) => id).filter((id) => knowledgeFilter === "all" || knowledgeOf(id) === knowledgeFilter);
  }
  // A heading with a danger button that asks once, inline, before `act`.
  function headWithDanger(host, heading, { label, title, question, yes, done, disabled, act }) {
    const btn = elem("button", { type: "button", class: "btn-mini btn-danger", title }, label);
    btn.disabled = disabled;
    const ask = elem("p", { class: "lists-confirm", hidden: "" }, question,
      elem("button", { type: "button", class: "btn-mini btn-danger" }, yes),
      elem("button", { type: "button", class: "btn-mini" }, t("lists.keep")));
    const [ok, no] = ask.querySelectorAll("button");
    btn.addEventListener("click", () => { ask.hidden = false; });
    ok.addEventListener("click", () => { act(); drawMain(); status(done); });
    no.addEventListener("click", () => { ask.hidden = true; });
    host.append(elem("div", { class: "lists-head" }, elem("h2", {}, heading), btn), ask);
  }

  function drawKnowledgeMain(host) {
    const k = getKnowledge();
    headWithDanger(host, t("lists.knowledge"), {
      label: t("lists.knowledge.forget"), title: t("lists.knowledge.forget.tip"),
      question: `${t("lists.knowledge.forget.ask")} `, yes: t("lists.knowledge.forget.yes"), done: t("lists.knowledge.forgotten"),
      disabled: !k.known && !k.unknown && !k.learned.length, act: forgetKnowledge,
    });
    host.append(elem("p", {}, t("lists.knowledge.paste")));
    if (!k.known?.ids.length && !k.learned.length && !k.unknown?.ids.length) { host.append(elem("p", { class: "muted" }, t("lists.knowledge.source"))); return; }

    const pick = elem("div", { class: "lists-switch", role: "radiogroup", "aria-label": t("lists.knowledge.show") },
      Object.entries(KNOWLEDGE_CHOICES).map(([value, label]) => {
        const radio = elem("input", { type: "radio", name: "lists-knowledge-filter", value });
        radio.checked = value === knowledgeFilter;
        radio.addEventListener("change", () => { knowledgeFilter = value; drawItems(); fillBox(); });
        return elem("label", {}, radio, ` ${t(label)}`);
      }));
    const count = elem("p", { class: "muted lists-count" });
    const items = elem("ul", { class: "lists-items" });
    host.append(pick, count, items);
    function drawItems() {
      const ids = knowledgeIds();
      count.textContent = tn(ids.length, "common.count_items");
      items.replaceChildren();
      drawRows(items, ids, (id) => itemRow(id, null));
    }
    drawItems();
  }

  function drawMain() {
    const host = $("#lists-main");
    host.innerHTML = "";
    matches = [];   // the search box is rebuilt empty; Enter must not add a match it no longer shows
    activeMatch = -1;
    // The first list may have been made from Browse while this tab showed none.
    if (!current || (current !== ALL && current !== KNOWLEDGE && !getLists().includes(current))) current = defaultList();
    drawIndex();
    fillBox();
    const list = current;
    if (list === ALL) {
      const n = namedLists().length;
      const favourites = t("lists.favourites");
      headWithDanger(host, t("lists.all"), {
        label: t("lists.delete_all"), title: t("lists.delete_all.tip", { favourites }),
        question: `${tn(n, "lists.delete_all.ask")} `, yes: t("lists.delete_all.yes"), done: t("lists.delete_all.done"),
        disabled: !n, act: deleteAllLists,
      });
      host.append(elem("p", { class: "muted" }, tn(n, "lists.all.summary", { favourites })));
      return;
    }
    if (list === KNOWLEDGE) { drawKnowledgeMain(host); return; }

    const head = elem("div", { class: "lists-head" });
    const titleBtn = elem("button", { type: "button", class: "lists-title-button", title: t("lists.rename.tip") }, listLabel(list));
    // Only the last part is the button: a rename changes this list's own name, not where it sits.
    const crumb = () => elem("span", { class: "lists-crumb muted" }, list.name.slice(0, -leafOf(list).length));
    const title = elem("h2", {}, list.faves ? listLabel(list) : [crumb(), titleBtn]);
    const del = elem("button", { type: "button", class: "btn-mini btn-danger" }, t("lists.delete"));
    const up = elem("button", { type: "button", class: "btn-mini", title: t("lists.move_up"), "aria-label": t("lists.move_up") }, "▲");
    const down = elem("button", { type: "button", class: "btn-mini", title: t("lists.move_down"), "aria-label": t("lists.move_down") }, "▼");
    up.disabled = !canMove(list, -1);
    down.disabled = !canMove(list, 1);
    up.addEventListener("click", () => { moveList(list, -1); drawMain(); });
    down.addEventListener("click", () => { moveList(list, 1); drawMain(); });
    const shift = (delta) => {
      const can = canShift(list, delta);
      const label = can.via ? t(delta < 0 ? "lists.move_out_of" : "lists.move_into", { name: leafOf(can.via) }) : delta < 0 ? t("lists.move_out") : t("lists.move_in");
      const deep = delta > 0 && !can.ok && getLists().some((l) => (l === list || isUnder(l, list)) && depthOf(l) >= MAX_DEPTH);
      const btn = elem("button", { type: "button", class: "btn-mini", title: can.reason || (deep ? t("lists.move_too_deep") : label), "aria-label": label }, delta < 0 ? "\u25C4" : "\u25BA");   // not U+25C0/U+25B6, which many systems draw as emoji
      btn.disabled = !can.ok;
      btn.addEventListener("click", () => { shiftList(list, delta); drawMain(); });
      return btn;
    };
    const sub = elem("button", { type: "button", class: "btn-mini", title: t("lists.sublist.tip") }, t("lists.sublist"));
    // Shown but disabled on the last level, so the buttons beside it keep their place.
    if (depthOf(list) >= MAX_DEPTH) { sub.disabled = true; sub.title = t("lists.sublist.too_deep"); }
    sub.addEventListener("click", () => {
      const box = $("#lists-new-name");
      box.value = list.name + SEP;
      box.focus();
    });
    const parent = hasChildren(list);
    // The favourites cannot be renamed or deleted, so they get neither control.
    // The four arrows wrap as one group.
    head.append(title, ...(list.faves ? [] : [elem("span", { class: "lists-arrows" }, up, down, shift(-1), shift(1))]), ...(list.faves ? [] : [sub, del]));
    host.append(head);

    const renameError = elem("p", { class: "warn", role: "alert", hidden: "" });
    const ask = elem("p", { class: "lists-confirm", hidden: "" },
      parent
        ? `${t("lists.delete.ask_parent", { name: list.name, items: tn(list.ids.length, "common.count_items") })} `
        : `${t("lists.delete.ask", { name: list.name, items: tn(list.ids.length, "common.count_items") })} `,
      elem("button", { type: "button", class: "btn-mini btn-danger" }, parent ? t("lists.delete.empty") : t("lists.delete.yes")),
      elem("button", { type: "button", class: "btn-mini" }, t("lists.keep")));
    host.append(renameError, ask);

    // Rename in place, like the Names tab: Enter or leaving the field saves, Escape cancels.
    titleBtn.addEventListener("click", () => {
      const input = elem("input", { class: "lists-title-edit", maxlength: String(MAX_NAME_LENGTH), "aria-label": t("lists.name.label") });
      input.value = leafOf(list);
      let done = false;
      const finish = (keep) => {
        if (done) return;
        if (keep && input.value.trim() !== leafOf(list)) {
          const r = renameList(list, input.value);
          renameError.hidden = !r.error;
          renameError.textContent = r.error || "";
          if (r.error) return;   // stay in the field; the next Enter or blur tries again
        }
        done = true;
        renameError.hidden = true;
        drawMain();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", () => finish(true));
      title.replaceChildren(crumb(), input);
      input.focus();
      input.select();
    });
    del.addEventListener("click", () => { ask.hidden = false; });
    const [yes, no] = ask.querySelectorAll("button");
    yes.addEventListener("click", () => {
      const above = parentOf(list);
      deleteList(list);
      select(getLists().includes(list) ? list : above || defaultList());
    });
    no.addEventListener("click", () => { ask.hidden = true; });

    const search = elem("input", {
      id: "lists-search", type: "search", autocomplete: "off",
      placeholder: t("lists.search.placeholder"), "aria-label": t("lists.search.label"),
    });
    const results = elem("ul", { id: "lists-matches", class: "cstore-matches" });
    host.append(search, results);
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        searchItems.reset();   // names and records can change while the tab is open
        // A blueprint stands for the furnishing it makes, as in an import; ids the catalogue does not know are not offered.
        const resolve = catalogueResolver(state.records);
        const ids = new Set(searchItems(search.value).map((m) => resolve(m.id)).filter((id) => id != null));
        matches = [...ids].map((id) => ({ id, name: nameOf(id) || "" }));
        activeMatch = -1;
        drawMatches();
      }, 120);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!matches.length) return;
        activeMatch = (activeMatch + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        drawMatches();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const m = matches[Math.max(activeMatch, 0)];
        if (m) addMatch(m);
      } else if (e.key === "Escape") {
        search.value = "";
        matches = [];
        drawMatches();
      }
    });

    if (list.faves && !list.ids.length) {
      host.append(elem("p", { class: "muted lists-empty" }, t("lists.faves_empty")));
    }
    const count = elem("p", { class: "muted lists-count" });
    const drawCount = () => { count.textContent = tn(list.ids.length, "common.count_items"); };
    drawCount();
    const items = elem("ul", { class: "lists-items" });
    host.append(count, items);

    // Changing one row does not rebuild the list: a long one would lose its place and stall the page.
    const drop = (li) => { li.remove(); drawCount(); };
    drawRows(items, list.ids, (id) => itemRow(id, list, drop));
  }

  // `list` null: a row of no list, as the knowledge view shows them, without Remove.
  function itemRow(id, list, drop) {
    const name = nameOf(id);
    const ways = waysToGet(id);
    const li = elem("li", { class: "lists-item" });
    const line = elem("div", { class: "lists-item-row", title: ways.map((w) => w.text + w.price).join("\n") });
    line.append(itemIconImg(id, name || t("common.item_fallback", { id })));
    // The marker goes inside, right before the name, so it is not taken for a button of its own.
    const mark = knowledgeMarker(id);
    const toggle = elem("button", { type: "button", class: "lists-item-name", "aria-expanded": "false" }, mark ? [mark, " "] : [], name || t("lists.unknown_item"));
    line.append(toggle);
    const recs = deps.recordsForItem?.(id) || [];
    const blueprint = recs.some((r) => r.id) ? recs.find((r) => r.blueprint)?.blueprint : null;
    const where = elem("ul", { class: "lists-item-ways", hidden: "" }, ways.map((w) => elem("li", {}, w.text, w.cost ? [": ", costNode(w.cost)] : [])));
    toggle.addEventListener("click", () => {
      where.hidden = !where.hidden;
      li.classList.toggle("is-open", !where.hidden);
      toggle.setAttribute("aria-expanded", String(!where.hidden));
    });
    const show = elem("button", { type: "button", class: "btn-mini", title: t("lists.show_in_browse"), "aria-label": t("lists.show_in_browse.label", { name: name || id }) }, elem("span", { class: "ico ico-book-open", "aria-hidden": "true" }));
    show.addEventListener("click", () => deps.switchToBrowse?.({ query: String(id) }));
    let remove = [];
    if (list) {
      remove = elem("button", {
        type: "button", class: "btn-mini lists-remove", "aria-label": t("lists.remove.label", { name: name || id }), title: list.faves ? t("lists.fave.remove", { favourites: t("lists.favourites") }) : t("lists.remove.from_list"),
      }, "🗑️");
      remove.addEventListener("click", () => { setItem(list, id, false); drop(li); });
    }
    // In the favourites the star would only do what Remove does.
    const star = () => starButton(id, () => line.querySelector(".lists-fave").replaceWith(star()));
    // One group, so at narrow widths it wraps whole and keeps its order; trader icon stays beside the id
    line.append(elem("span", { class: "lists-item-tail" },
      tradingLinkGroups({ item: isTradeable(recs) ? id : null, blueprint: blueprint || null }), elem("span", { class: "muted" }, `#${id}`),
      show, list?.faves ? [] : star(), remove));
    li.append(line, where);
    return li;
  }

  // Rows are built a screenful at a time, the next batch when the end of the last one comes near.
  function drawRows(items, ids, rowOf) {
    const todo = [...ids];
    const more = elem("li", { class: "lists-more", "aria-hidden": "true" });
    const watch = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) fill(); }, { rootMargin: "800px" });
    function fill() {
      // Observed anew after each batch: an observer reports changes only, and a marker still in view after a batch is none.
      watch.unobserve(more);
      more.remove();
      items.append(...todo.splice(0, ROWS_PER_BATCH).map(rowOf));
      if (!todo.length) return;
      items.append(more);
      watch.observe(more);
    }
    rowWatch?.disconnect();
    rowWatch = watch;
    fill();
  }

  // One line per way to get the item, in the order Browse lists them.
  function waysToGet(id) {
    const recs = deps.recordsForItem?.(id) || [];
    if (!recs.length) return [{ text: t("lists.not_in_catalogue"), price: "" }];
    // `price` is the tooltip's text form of `cost`.
    return recs.map((r) => {
      const cost = r.cost?.length ? r.cost : null;
      return { text: deps.recordLocator(r), cost, price: cost ? `: ${deps.formatCost(cost)}` : "" };
    });
  }

  function drawMatches() {
    const ul = $("#lists-matches");
    if (!ul) return;
    ul.innerHTML = "";
    matches.forEach((m, i) => {
      const li = elem("li", { class: "cstore-match" + (i === activeMatch ? " is-active" : "") });
      li.append(itemIconImg(m.id, m.name || t("common.item_fallback", { id: m.id })));
      const txt = elem("span", { class: "cstore-match-txt" },
        elem("span", { class: "cstore-match-name" }, m.name || t("common.no_name")),
        elem("span", { class: "cstore-match-id muted" }, `#${m.id}`));
      if (current?.ids.includes(m.id)) txt.append(elem("span", { class: "cstore-match-has" }, t("lists.on_this_list")));
      li.append(txt);
      li.addEventListener("click", () => addMatch(m));
      ul.append(li);
      if (i === activeMatch) li.scrollIntoView({ block: "nearest" });
    });
  }

  function addMatch(m) {
    setItem(current, m.id, true);
    rememberList(current);
    drawMain();
    $("#lists-search").focus();
  }

  return { id: "lists", render, onShow: () => { if ($("#lists-main")) { drawIndex(); drawMain(); } } };
}

// Markers for the two rows that are no list; neither holds items.
const ALL = { ids: [] };
const KNOWLEDGE = { ids: [] };
// Text ids
const KNOWLEDGE_CHOICES = { all: "lists.knowledge.choice_all", known: "lists.knowledge.choice_known", unknown: "lists.knowledge.choice_unknown" };
function defaultList() { return lastList() || namedLists()[0] || favourites(); }
function listLabel(list) { return list.faves ? `\u2605 ${t("lists.favourites")}` : leafOf(list); }
// A select cannot indent its options with CSS, so the level is written as spaces.
function optionLabel(list) { return "\u00a0\u00a0\u00a0".repeat(depthOf(list) - 1) + listLabel(list); }

// Empty or filled star; `after` redraws whatever shows it (onListsChange already redraws Browse).
export function starButton(id, after) {
  const on = isFave(id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-mini lists-fave" + (on ? " is-on" : "");
  btn.textContent = on ? "\u2605" : "\u2606";
  btn.title = t(on ? "lists.fave.remove" : "lists.fave.add", { favourites: t("lists.favourites") });
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-pressed", String(on));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFave(id);
    after?.();
  });
  return btn;
}

// "Add to list" from Browse: a small dialog, the last used list preselected, so adding takes two clicks.

let dialog = null;

export function openAddToList(id, itemName) {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "list-pick";
    dialog.setAttribute("aria-labelledby", "list-pick-title");
    dialog.innerHTML = `
      <form method="dialog">
        <h3 id="list-pick-title" class="list-pick-title"></h3>
        <label><span data-t="lists.pick.list"></span> <select class="list-pick-select"></select></label>
        <input class="list-pick-name" data-t-placeholder="lists.new.placeholder" data-t-aria-label="lists.new.label">
        <p class="list-pick-msg muted" role="status"></p>
        <div class="list-pick-actions">
          <button class="btn-primary list-pick-ok" value="ok"></button>
          <button value="cancel" formnovalidate data-t="common.cancel"></button>
        </div>
      </form>`;
    document.body.append(dialog);
  }
  translateTree(dialog);
  const NEW = "\u0000new";
  const q = (sel) => dialog.querySelector(sel);
  const select = q(".list-pick-select"), nameBox = q(".list-pick-name"), ok = q(".list-pick-ok"), msg = q(".list-pick-msg");
  q(".list-pick-title").textContent = t("lists.pick.title", { name: itemName || `#${id}` });
  select.innerHTML = "";
  const valueOf = (l) => (l.faves ? LAST_FAVES : l.name);
  const listOf = (v) => (v === NEW ? null : v === LAST_FAVES ? favourites() : findList(v));
  for (const l of getLists()) select.append(new Option(l.ids.includes(id) ? t("lists.pick.on_it", { list: optionLabel(l) }) : optionLabel(l), valueOf(l)));
  select.append(new Option(t("lists.pick.new"), NEW));
  select.value = valueOf(defaultList());

  const sync = () => {
    const list = listOf(select.value);
    nameBox.hidden = Boolean(list);
    const on = list?.ids.includes(id);
    ok.textContent = on ? t("lists.pick.remove") : t("lists.pick.add");
    msg.textContent = on ? t("lists.pick.already") : "";
  };
  select.onchange = () => { sync(); if (select.value === NEW) nameBox.focus(); };
  q("form").onsubmit = (e) => {
    if (e.submitter?.value !== "ok") return;
    let list = listOf(select.value);
    if (!list) {
      const made = createList(nameBox.value);
      if (made.error) { e.preventDefault(); msg.textContent = made.error; nameBox.focus(); return; }
      list = made.list;
    }
    setItem(list, id, !list.ids.includes(id));
    rememberList(list);
  };
  nameBox.value = "";
  sync();
  dialog.showModal();
  (nameBox.hidden ? ok : nameBox).focus();
}
