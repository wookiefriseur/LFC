// Named furnishing lists, kept in this browser only. The text form is FurnitureCatalogue's own list line, so a list copied here pastes into the add-on's import window, and an add-on export pastes back here.
import { itemSearch } from "./crown-store.js";

const STORE_KEY = "lfc.lists";
export const MAX_NAME_LENGTH = 32;   // bytes, for each part of a path
export const MAX_DEPTH = 3;
const SEP = " > ";
const PREFIX = "FURC LIST";
const FAVES_PREFIX = "FURC FAVES";
export const FAVES_NAME = "Favorites";   // english name of SI_FURC_FILTER_SRC_FAVE
export const MAX_IDS_PER_LINE = 1000;
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
  if (!name) return { error: "A list needs a name." };
  const root = partsOf(name)[0];
  if (isReserved(root) && !findList(root)) return { error: `"${root}" is reserved for ${FAVES_NAME}.` };
  const taken = findList(name);
  if (taken && taken !== own) return { error: `There already is a list called "${taken.name}".` };
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
  if (list.faves) return { error: `${FAVES_NAME} cannot be renamed.` };
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
export function formatList(list) {
  const head = list.faves ? `${FAVES_PREFIX}:` : `${PREFIX} ${list.name}:`;
  return chunks(list.ids).map((ids) => `${head} ${ids.join(",")}`.trimEnd()).join("\n");
}

// In display order, a parent before its sublists, so an import into an empty store restores grouping and order.
// Empty favourites are left out: they are always there, so the line would carry nothing.
export function formatLists(lists = getLists()) {
  return lists.filter((l) => !l.faves || l.ids.length).map(formatList).join("\n");
}

// The add-on's line (the path runs to the last colon), plus `"name": {1, 2}` for hand-written files.
// The line carries no version. The prefix is still read in every earlier spelling: "FURC LIST: ...", "[FURC LIST] ..." and a version 1 before the colon.
function payloadOf(line, kind) {
  const bracketed = line.match(/^\[\s*([^\]]*?)\s*\]\s*:?\s*(.*)$/);
  if (bracketed) {
    const head = bracketed[1].replace(/\s+/g, " ").toUpperCase().match(/^(.*?)(?: (\d+))?$/);
    return head[1] === kind && (head[2] ?? "1") === "1" ? bracketed[2] : null;
  }
  const rest = line.match(new RegExp(`^${kind.replace(/ /g, "\\s+")}(?=$|[\\s:])(.*)$`, "i"))?.[1];
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
 * A line of ids without a prefix continues the line right above it (the game breaks a long pasted line in two); standing alone it is a `bare` entry for the selected list.
 */
export function parseLists(text) {
  const lists = [];
  let skipped = 0;
  let above = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const entry = above;
    above = null;
    if (!line) continue;
    if (BARE.test(line)) {
      above = entry || { bare: true, ids: [] };
      if (!entry) lists.push(above);
      above.ids.push(...idsOf(line));
      continue;
    }
    const fav = payloadOf(line, FAVES_PREFIX)?.match(FAVES_LINE);
    if (fav) { lists.push(above = { faves: true, ids: idsOf(fav[1]) }); continue; }
    const m = payloadOf(line, PREFIX)?.match(LINE) || line.match(BRACES);
    // Brought into its written form before matching, as the add-on does, so an over-long or over-deep path merges into the list it became.
    const name = m && normPath(m[0].startsWith('"') ? m[1].replace(/\\(.)/g, "$1") : m[1]);
    if (!name) { skipped++; continue; }
    lists.push(above = { name, ids: idsOf(m[2]) });
  }
  return { lists, skipped };
}

/**
 * Merges into the favourites or the list at the same path, like the add-on's import: nothing is removed, new ids go to the end, missing parents are made empty. Saved and announced once, after the whole paste.
 * @param resolve maps a furnishing or blueprint id to the furnishing id, or null when the catalogue does not know it; the default keeps every id.
 * @param target the selected list, which takes lines of ids that name no list; without one they are refused.
 */
export function importLists(text, resolve = (id) => id, target = null) {
  const { lists, skipped } = parseLists(text);
  const report = { lists: 0, added: 0, duplicates: 0, unknown: 0, skipped, errors: [], first: null };
  const touched = new Set();
  for (const incoming of lists) {
    let list = incoming.faves ? favourites() : incoming.bare ? target : findList(incoming.name);
    if (!list && incoming.bare) { report.errors.push("Ids without a list name need a selected list."); continue; }
    if (!list) {
      const { name, error } = cleanName(incoming.name);
      if (error) { report.errors.push(error); continue; }
      list = ensure(name);
    }
    touched.add(list);
    report.first ??= list;
    for (const raw of incoming.ids) {
      const id = resolve(raw);
      if (id == null) report.unknown++;
      else if (list.ids.includes(id)) report.duplicates++;
      else { list.ids.push(id); report.added++; }
    }
  }
  report.lists = touched.size;
  if (lists.length) save();
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
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (!r.lists) return { text: r.errors[0] || "No list lines found", warn: true };
  let text = `Imported ${plural(r.lists, "list")}: ${plural(r.added, "item")} added`;
  if (r.duplicates) text += `, ${plural(r.duplicates, "duplicate")}`;
  if (r.unknown) text += `, ${r.unknown} unknown skipped`;
  if (r.skipped) text += `, ${plural(r.skipped, "line")} skipped`;
  if (r.errors.length) text += `. ${r.errors[0]}`;
  return { text, warn: Boolean(r.skipped || r.errors.length || r.unknown) };
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

export function listsMask(deps) {
  const { state, $, elem, nameOf, itemIconImg } = deps;
  const searchItems = itemSearch(state, nameOf);
  let current = null;
  let matches = [];
  let activeMatch = -1;

  function render(container) {
    container.innerHTML = `
      <section class="lists-mask">
        <aside class="lists-side">
          <h2>Lists</h2>
          <p class="muted">Furnishing lists stored in your browser. Export them to a file or FurnitureCatalogue to keep them safe.</p>
          <details id="lists-transfer" class="lists-transfer">
            <summary>Import and export</summary>
            <textarea id="lists-text" rows="3" spellcheck="false" aria-label="List text to import"
              placeholder="FURC LIST My list: 115647,118303&#10;FURC FAVES: 115647"></textarea>
            <div class="lists-row">
              <span class="lists-row-label">Import</span>
              <button id="lists-import" type="button" disabled title="Import the lists pasted into the box above">📝 Text</button>
              <label class="btn-like" title="Import lists from a text file">📂 File ...<input id="lists-file" type="file" accept=".txt,text/plain" hidden></label>
            </div>
            <div class="lists-row">
              <span class="lists-row-label">Export all</span>
              <button id="lists-copy-all" type="button" title="Copy every list to the clipboard">📋 Text</button>
              <button id="lists-download-all" type="button" title="Download every list as a text file">💾 File</button>
            </div>
            <p id="lists-status" class="lists-status" role="status"></p>
          </details>
          <ul id="lists-index" class="lists-index"></ul>
          <form id="lists-new" class="lists-inline">
            <input id="lists-new-name" placeholder="New list, or List > Sublist" aria-label="New list name" title="A name with > makes a sublist and every list above it, ${MAX_DEPTH} levels at most">
            <button class="btn-primary">Create</button>
          </form>
          <p id="lists-new-error" class="warn" role="alert" hidden></p>
        </aside>
        <div id="lists-main" class="lists-main"></div>
      </section>`;

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
    const syncImport = () => { $("#lists-import").disabled = !text.value.trim(); };
    text.addEventListener("input", syncImport);
    $("#lists-import").addEventListener("click", () => runImport(text.value));
    $("#lists-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) runImport(await file.text());
    });
    $("#lists-copy-all").addEventListener("click", () => copyOut(formatLists()));
    $("#lists-download-all").addEventListener("click", () => {
      const all = formatLists();
      if (all) download("furnishing-lists.txt", all);
      else status("No lists to export", true);
    });
    onListsChange(() => { if ($("#lists-index")) drawIndex(); });
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

  function runImport(text) {
    const r = importLists(text, catalogueResolver(state.records), current);
    const { text: message, warn } = reportText(r);
    status(message, warn);
    if (r.first && (!current || current.faves)) current = r.first;
    drawMain();
  }

  async function copyOut(text) {
    $("#lists-transfer").open = true;
    if (!text) { status("No lists to export", true); return; }
    const box = $("#lists-text");
    box.value = text;
    box.dispatchEvent(new Event("input"));
    box.select();
    try {
      await navigator.clipboard.writeText(text);
      status("Copied to clipboard");
    } catch (_) {
      status("Press Ctrl+C to copy", true);
    }
  }

  function select(list) {
    current = list;
    matches = [];
    drawIndex();
    drawMain();
  }

  function drawIndex() {
    const ul = $("#lists-index");
    ul.innerHTML = "";
    for (const list of getLists()) {
      const btn = elem("button", { type: "button", class: "lists-index-item" + (list === current ? " is-active" : ""), title: list.name },
        elem("span", {}, listLabel(list)), elem("span", { class: "muted" }, String(list.ids.length)));
      btn.style.setProperty("--depth", depthOf(list) - 1);
      btn.addEventListener("click", () => select(list));
      ul.append(elem("li", {}, btn));
    }
    if (!namedLists().length) ul.append(elem("li", { class: "muted" }, "No lists yet."));
  }

  function drawMain() {
    const host = $("#lists-main");
    host.innerHTML = "";
    matches = [];   // the search box is rebuilt empty; Enter must not add a match it no longer shows
    activeMatch = -1;
    // The first list may have been made from Browse while this tab showed none.
    if (!current || !getLists().includes(current)) current = defaultList();
    drawIndex();
    const list = current;

    const head = elem("div", { class: "lists-head" });
    const titleBtn = elem("button", { type: "button", class: "lists-title-button", title: "Click to rename" }, listLabel(list));
    // Only the last part is the button: a rename changes this list's own name, not where it sits.
    const crumb = () => elem("span", { class: "lists-crumb muted" }, list.name.slice(0, -leafOf(list).length));
    const title = elem("h2", {}, list.faves ? listLabel(list) : [crumb(), titleBtn]);
    const del = elem("button", { type: "button", class: "btn-mini btn-danger" }, "🗑️ Delete");
    const up = elem("button", { type: "button", class: "btn-mini", title: "Move up", "aria-label": "Move up" }, "▲");
    const down = elem("button", { type: "button", class: "btn-mini", title: "Move down", "aria-label": "Move down" }, "▼");
    up.disabled = !canMove(list, -1);
    down.disabled = !canMove(list, 1);
    up.addEventListener("click", () => { moveList(list, -1); drawMain(); });
    down.addEventListener("click", () => { moveList(list, 1); drawMain(); });
    const sub = elem("button", { type: "button", class: "btn-mini", title: "Start a sublist of this list" }, "+ Sublist");
    sub.addEventListener("click", () => {
      const box = $("#lists-new-name");
      box.value = list.name + SEP;
      box.focus();
    });
    const parent = hasChildren(list);
    const copy = elem("button", { type: "button", class: "btn-mini", title: "Copy this list to the clipboard" }, "📋 Copy");
    const save = elem("button", { type: "button", class: "btn-mini", title: "Download this list as a text file" }, "💾 Download");
    // The favourites cannot be renamed or deleted, so they get neither control.
    head.append(title, ...(list.faves ? [] : [up, down]), ...(list.faves || depthOf(list) >= MAX_DEPTH ? [] : [sub]), copy, save, ...(list.faves ? [] : [del]));
    host.append(head);

    const renameError = elem("p", { class: "warn", role: "alert", hidden: "" });
    const ask = elem("p", { class: "lists-confirm", hidden: "" },
      parent
        ? `"${list.name}" has sublists, so it is emptied (${list.ids.length} item${list.ids.length === 1 ? "" : "s"}) and stays. Delete its sublists first to remove it. `
        : `Delete "${list.name}" and its ${list.ids.length} item${list.ids.length === 1 ? "" : "s"}? `,
      elem("button", { type: "button", class: "btn-mini btn-danger" }, parent ? "Empty it" : "Delete it"),
      elem("button", { type: "button", class: "btn-mini" }, "Keep it"));
    host.append(renameError, ask);

    // Rename in place, like the Names tab: Enter or leaving the field saves, Escape cancels.
    titleBtn.addEventListener("click", () => {
      const input = elem("input", { class: "lists-title-edit", maxlength: String(MAX_NAME_LENGTH), "aria-label": "List name" });
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
    copy.addEventListener("click", () => copyOut(formatList(list)));
    save.addEventListener("click", () => download(fileName(list.name), formatList(list)));

    const search = elem("input", {
      id: "lists-search", type: "search", autocomplete: "off",
      placeholder: "Add an item: search by name or id", "aria-label": "Add an item",
    });
    const results = elem("ul", { id: "lists-matches", class: "cstore-matches" });
    host.append(search, results);
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        searchItems.reset();   // names and records can change while the tab is open
        matches = searchItems(search.value);
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
      host.append(elem("p", { class: "muted lists-empty" }, "Star an item in Browse, or search for one above."));
    }
    host.append(elem("p", { class: "muted lists-count" },
      `${list.ids.length} item${list.ids.length === 1 ? "" : "s"}`));
    const items = elem("ul", { class: "lists-items" });
    for (const id of list.ids) {
      const name = nameOf(id);
      const ways = waysToGet(id);
      const li = elem("li", { class: "lists-item" });
      const row = elem("div", { class: "lists-item-row", title: ways.join("\n") });
      row.append(itemIconImg(id, name || `item ${id}`));
      const toggle = elem("button", { type: "button", class: "lists-item-name", "aria-expanded": "false" }, name || "(unknown item)");
      row.append(toggle, elem("span", { class: "muted" }, `#${id}`));
      const where = elem("ul", { class: "lists-item-ways", hidden: "" }, ways.map((w) => elem("li", {}, w)));
      toggle.addEventListener("click", () => {
        where.hidden = !where.hidden;
        li.classList.toggle("is-open", !where.hidden);
        toggle.setAttribute("aria-expanded", String(!where.hidden));
      });
      const show = elem("button", { type: "button", class: "btn-mini" }, "Browse");
      show.addEventListener("click", () => deps.switchToBrowse?.({ query: String(id) }));
      const remove = elem("button", { type: "button", class: "btn-mini", "aria-label": `Remove ${name || id}` }, "Remove");
      remove.addEventListener("click", () => { setItem(list, id, false); drawMain(); });
      row.append(starButton(id, drawMain), show, remove);
      li.append(row, where);
      items.append(li);
    }
    host.append(items);
  }

  // One line per way to get the item, in the order Browse lists them.
  function waysToGet(id) {
    const recs = deps.recordsForItem?.(id) || [];
    if (!recs.length) return ["Not in the catalogue."];
    return recs.map((r) => {
      const cost = deps.formatCost ? deps.formatCost(r.cost) : "-";
      return cost === "-" ? deps.recordLocator(r) : `${deps.recordLocator(r)}: ${cost}`;
    });
  }

  function drawMatches() {
    const ul = $("#lists-matches");
    if (!ul) return;
    ul.innerHTML = "";
    matches.forEach((m, i) => {
      const li = elem("li", { class: "cstore-match" + (i === activeMatch ? " is-active" : "") });
      li.append(itemIconImg(m.id, m.name || `item ${m.id}`));
      const txt = elem("span", { class: "cstore-match-txt" },
        elem("span", { class: "cstore-match-name" }, m.name || "(no name)"),
        elem("span", { class: "cstore-match-id muted" }, `#${m.id}`));
      if (current?.ids.includes(m.id)) txt.append(elem("span", { class: "cstore-match-has" }, "on this list"));
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

  return { id: "lists", label: "Lists", render, onShow: () => { if ($("#lists-main")) { drawIndex(); drawMain(); } } };
}

function defaultList() { return lastList() || namedLists()[0] || favourites(); }
function listLabel(list) { return list.faves ? `\u2605 ${FAVES_NAME}` : leafOf(list); }
// A select cannot indent its options with CSS, so the level is written as spaces.
function optionLabel(list) { return "\u00a0\u00a0\u00a0".repeat(depthOf(list) - 1) + listLabel(list); }

// Empty or filled star; `after` redraws whatever shows it (onListsChange already redraws Browse).
export function starButton(id, after) {
  const on = isFave(id);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-mini lists-fave" + (on ? " is-on" : "");
  btn.textContent = on ? "\u2605" : "\u2606";
  btn.title = on ? `Remove from ${FAVES_NAME}` : `Add to ${FAVES_NAME}`;
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
        <label>List <select class="list-pick-select"></select></label>
        <input class="list-pick-name" placeholder="New list, or List > Sublist" aria-label="New list name">
        <p class="list-pick-msg muted" role="status"></p>
        <div class="list-pick-actions">
          <button class="btn-primary list-pick-ok" value="ok">Add</button>
          <button value="cancel" formnovalidate>Cancel</button>
        </div>
      </form>`;
    document.body.append(dialog);
  }
  const NEW = "\u0000new";
  const q = (sel) => dialog.querySelector(sel);
  const select = q(".list-pick-select"), nameBox = q(".list-pick-name"), ok = q(".list-pick-ok"), msg = q(".list-pick-msg");
  q(".list-pick-title").textContent = `Add ${itemName || `#${id}`} to a list`;
  select.innerHTML = "";
  const valueOf = (l) => (l.faves ? LAST_FAVES : l.name);
  const listOf = (v) => (v === NEW ? null : v === LAST_FAVES ? favourites() : findList(v));
  for (const l of getLists()) select.append(new Option(l.ids.includes(id) ? `${optionLabel(l)} (on it)` : optionLabel(l), valueOf(l)));
  select.append(new Option("New list...", NEW));
  select.value = valueOf(defaultList());

  const sync = () => {
    const list = listOf(select.value);
    nameBox.hidden = Boolean(list);
    const on = list?.ids.includes(id);
    ok.textContent = on ? "Remove from list" : "Add";
    msg.textContent = on ? "Already on this list." : "";
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
