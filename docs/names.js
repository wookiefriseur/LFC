// Names tab: every id -> name table the site shows, the game names from the reference data, per game language, and the vocabularies from enums.json. A names dump from FurCDev updates the game names of its language through the change list.
import { NAME_KINDS, GAME_LOCALES } from "./reference-data.js";
import { parseNamesDump, diffNames } from "./names-dump.js";
import { labelOf, libraryStrings, checkTranslation } from "./data.js";
import { titleCase, englishTexts, interfaceTranslationOf, loadInterfaceTranslation, checkInterfaceText } from "./lexicon.js";
import { language } from "./prefs.js";

// Past this many matches the table asks for a narrower search; a full achievement list is thousands of rows.
const ROW_LIMIT = 500;

// Past this many changes a dump no longer fits one contribution; a first full dump of a language goes in by script.
const ISSUE_LIMIT = 2000;

const KIND_LABELS = {
  items: "Items", houses: "Houses", quests: "Quests", achievements: "Achievements", zones: "Zones",
  categories: "Furnishing categories", themes: "Furnishing styles", skills: "Crafting skills",
};

// The vocabularies worth reading as a name list: object entries with a symbol, or flat string lists.
function vocabularies(enums) {
  const out = [];
  for (const [key, value] of Object.entries(enums || {})) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const first = value[0];
    if (typeof first === "string" || (first && typeof first === "object" && typeof first.symbol === "string")) {
      out.push(key);
    }
  }
  return out.sort();
}

// A library string is edited on one line; its line breaks show as \n
const oneLine = (text) => text.replaceAll("\n", "\\n");
const manyLines = (text) => text.replaceAll("\\n", "\n");

export function namesMask(deps) {
  const { state, $, elem, renderFooter, referenceData } = deps;
  const view = { list: "game:houses", search: "", locale: referenceData.namesLocale };

  function locale() {
    return view.locale;
  }

  // { names, fallback } of the shown language, null while it loads
  function store() {
    return referenceData.namesOf(locale());
  }

  // English item names are the catalogue's own and are not edited here
  function kinds() {
    return NAME_KINDS.filter((kind) => kind !== "items" || locale() !== referenceData.namesLocale);
  }

  async function setLocale(next) {
    view.locale = next;
    const select = $("#names-locale");
    if (select) select.value = next;
    if (!kinds().includes(kindOfList()) && view.list.startsWith("game:")) view.list = "game:houses";
    await Promise.all([referenceData.loadTranslation(next), loadInterfaceTranslation(next)]);
    renderSidebar();
    renderTable();
  }

  // Rows for the selected list: [{ id, name, extra, pending }]
  function rows() {
    const [group, key] = view.list.split(":");
    if (group === "game") {
      const table = store()?.names[key] || new Map();
      const english = store()?.fallback[key] || new Map();
      const ids = new Set([...table.keys(), ...english.keys()]);
      for (const e of state.buffer.entries.values()) {
        if (e.op === "name" && e.kind === key && e.locale === locale()) ids.add(e.id);
      }
      return [...ids].sort((a, b) => a - b).map((id) => {
        const pending = state.buffer.entries.get(`name:${locale()}:${key}:${id}`);
        return {
          id: String(id),
          name: pending?.name ?? table.get(id) ?? "",
          extra: pending ? (pending.before ? `was: ${pending.before}` : "new")
            : (!table.has(id) && english.has(id) ? `English: ${english.get(id)}` : ""),
          pending: !!pending,
        };
      });
    }
    if (view.list === "strings:interface") {
      const mine = interfaceTranslationOf(locale()), translating = locale() !== "en";
      const english = englishTexts();
      const list = Object.keys(english).sort().map((id) => {
        const pending = state.buffer.entries.get(`text:${locale()}:${id}`);
        return {
          id,
          name: translating ? pending?.text ?? mine[id] ?? "" : english[id],
          extra: translating ? `English: ${english[id]}${pending?.before ? ` - was: ${pending.before}` : ""}` : "",
          pending: !!pending,
          editable: translating,
        };
      });
      return translating ? [...list.filter((r) => !r.name), ...list.filter((r) => r.name)] : list;
    }
    if (group === "strings") {
      const all = libraryStrings(), english = all.en || {}, mine = all[locale()];
      const translating = locale() !== "en";
      const list = Object.keys(english).sort().map((id) => {
        const pending = state.buffer.entries.get(`string:${locale()}:${id}`);
        return {
          id,
          name: oneLine(translating ? pending?.text ?? mine?.[id] ?? "" : english[id]),
          extra: translating ? `English: ${oneLine(english[id])}${pending?.before ? ` - was: ${oneLine(pending.before)}` : ""}` : "",
          pending: !!pending,
          editable: translating && !!mine,
        };
      });
      // What still needs a translation comes first
      return translating ? [...list.filter((r) => !r.name), ...list.filter((r) => r.name)] : list;
    }
    const enums = state.enums || {};
    return (enums[key] || []).map((entry) => {
      if (typeof entry === "string") return { id: entry, name: "", extra: "", pending: false };
      const extra = Object.entries(entry)
        .filter(([k]) => k !== "symbol" && k !== "name")
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
      const pending = state.buffer.entries.get(`enum-name:${key}:${entry.symbol}`);
      return { id: entry.symbol, name: pending?.name ?? labelOf(enums, key, entry.symbol, { english: true }),
        extra: pending ? `was: ${pending.before}` : extra, pending: !!pending,
        editable: typeof entry.name === "string" };
    });
  }

  function renderSidebar() {
    const ul = $("#names-lists");
    ul.innerHTML = "";
    const item = (id, label, count) => {
      const [group, key] = id.split(":");
      const pending = [...state.buffer.entries.values()].some((e) => group === "game"
        ? e.op === "name" && e.kind === key && e.locale === locale()
        : id === "strings:interface" ? e.op === "text" && e.locale === locale()
        : group === "strings" ? e.op === "string" && e.locale === locale()
        : e.op === "enum-name" && e.enumName === key);
      const btn = elem("button", {
        type: "button",
        class: `browse-facet-link${view.list === id ? " is-active" : ""}${pending ? " is-pending" : ""}`,
        "data-list": id,
      });
      btn.append(elem("span", {}, label), elem("span", { class: "muted" }, count == null ? "" : String(count)));
      btn.addEventListener("click", () => {
        view.list = id;
        renderSidebar();
        renderTable();
      });
      const li = elem("li", { class: "browse-facet-item" });
      li.append(btn);
      return li;
    };
    ul.append(elem("li", { class: "names-group" }, `Game names (${locale()})`));
    for (const kind of kinds()) {
      ul.append(item(`game:${kind}`, KIND_LABELS[kind], store()?.names[kind].size));
    }
    ul.append(elem("li", { class: "names-group" }, "Vocabularies"));
    for (const key of vocabularies(state.enums)) {
      ul.append(item(`vocab:${key}`, titleCase(key), state.enums[key].length));
    }
    // The library's own strings, which the game shows; a language without a locale file has none to edit
    const all = libraryStrings(), total = Object.keys(all.en || {}).length;
    if (total) {
      ul.append(elem("li", { class: "names-group" }, `Translation (${locale()})`));
      const mine = all[locale()];
      ul.append(item("strings:library", "Library strings",
        locale() === "en" ? total : mine ? `${Object.keys(mine).length} of ${total}` : "no file"));
    }
    // The web interface's own text; only the pages already moved into the master file
    const texts = Object.keys(englishTexts());
    if (!total) ul.append(elem("li", { class: "names-group" }, `Translation (${locale()})`));
    ul.append(item("strings:interface", "Interface text", locale() === "en" ? texts.length
      : `${texts.filter((id) => interfaceTranslationOf(locale())[id]).length} of ${texts.length}`));
  }

  function renderTable() {
    const host = $("#names-table");
    if (!host) return;
    const all = rows();
    const q = view.search.trim().toLowerCase();
    const hits = q
      ? all.filter((r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.extra.toLowerCase().includes(q))
      : all;
    const game = view.list.startsWith("game:");
    $("#names-add").hidden = !game;
    if (game && !store()) {
      $("#names-count").textContent = referenceData.state === "unavailable" ? "names not available" : "loading…";
    } else {
      $("#names-count").textContent = hits.length === all.length
        ? `${all.length} entries`
        : `${hits.length} of ${all.length} entries`;
    }
    const table = elem("table", { class: "names-list" });
    const head = elem("tr", {});
    const strings = view.list.startsWith("strings:");
    const texts = view.list === "strings:interface";
    for (const h of [game ? "Id" : strings ? "String" : "Symbol", strings ? "Text" : "Name", game ? "" : "Details"]) head.append(elem("th", {}, h));
    table.append(elem("thead", {}, head));
    const body = elem("tbody", {});
    for (const r of hits.slice(0, ROW_LIMIT)) {
      const tr = elem("tr", { class: r.pending ? "is-pending" : "" });
      const nameCell = elem("td", {}, r.name);
      if (game || r.editable) {
        nameCell.classList.add("names-editable");
        nameCell.dataset.nameId = r.id;
        nameCell.title = "Edit this name";
        const edit = elem("button", { type: "button", class: "names-edit-button",
          "aria-label": `Edit name for ${r.id}` }, r.name || (strings ? "Translate" : "Add name"));
        edit.addEventListener("click", () => editName(nameCell, game ? Number(r.id) : r.id, r.name));
        nameCell.replaceChildren(edit);
      }
      const details = elem("td", { class: "muted" }, r.extra);
      if (r.pending) {
        const revert = elem("button", { type: "button", class: "btn-mini names-revert",
          "aria-label": `Revert name for ${r.id}` }, "Revert");
        revert.addEventListener("click", () => {
          if (game) setName(kindOfList(), Number(r.id), "");
          else if (texts) setText(r.id, "");
          else if (strings) setString(r.id, "");
          else {
            const vocab = view.list.slice("vocab:".length);
            const published = state.enums[vocab].find((e) => e.symbol === r.id).name;
            state.buffer.setEnumName(vocab, r.id, published, published);
            renderFooter();
            renderSidebar();
            renderTable();
          }
        });
        details.append(" ", revert);
      }
      tr.append(elem("td", { class: "names-id" }, r.id), nameCell, details);
      body.append(tr);
    }
    table.append(body);
    host.innerHTML = "";
    host.append(table);
    if (hits.length > ROW_LIMIT) {
      host.append(elem("p", { class: "muted" }, `Showing the first ${ROW_LIMIT}. Search to narrow the list.`));
    }
  }

  function kindOfList() {
    const [group, key] = view.list.split(":");
    return group === "game" ? key : null;
  }

  // One name into the change list. The published name, or an empty box, drops the change.
  function setName(kind, id, name) {
    const published = referenceData.publishedName(kind, id, locale());
    state.buffer.setName(kind, id, locale(), name.trim() || published || "", published);
    renderFooter();
    renderSidebar();
    renderTable();
  }

  // One translation into the change list. The published text, or an empty box, drops the change.
  function setString(id, text) {
    const published = libraryStrings()[locale()]?.[id] ?? null;
    state.buffer.setString(locale(), id, manyLines(text.trim()) || published || "", published);
    renderFooter();
    renderSidebar();
    renderTable();
  }

  // One interface text into the change list. The published translation, or an empty box, drops the change.
  function setText(id, text) {
    const published = interfaceTranslationOf(locale())[id] ?? null;
    state.buffer.setText(locale(), id, text.trim() || published || "", published);
    renderFooter();
    renderSidebar();
    renderTable();
  }

  function editName(cell, id, current) {
    if (cell.querySelector("input")) return;
    const kind = kindOfList();
    const vocab = view.list.startsWith("vocab:") ? view.list.slice("vocab:".length) : null;
    const strings = view.list.startsWith("strings:");
    const texts = view.list === "strings:interface";
    const input = elem("input", { type: "text", class: "names-edit", "aria-label": `Name for ${id}` });
    input.value = current;
    let done = false;
    const finish = (save, refocus = true) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() !== current && vocab) {
        const published = state.enums[vocab].find((e) => e.symbol === id).name;
        state.buffer.setEnumName(vocab, id, input.value.trim() || published, published);
        renderFooter();
        renderSidebar();
        renderTable();
      } else if (save && input.value.trim() !== current && texts) setText(id, input.value);
      else if (save && input.value.trim() !== current && strings) setString(id, input.value);
      else if (save && input.value.trim() !== current) setName(kind, id, input.value);
      else renderTable();
      const restored = [...$("#names-table").querySelectorAll(".names-editable")]
        .find((el) => el.dataset.nameId === String(id));
      if (refocus) restored?.querySelector(".names-edit-button")?.focus();
    };
    // A vocabulary name: the pipeline keeps the existing grammar suffix. A translation carries its own.
    const problem = () => {
      if (vocab && input.value.includes("^")) return "A name cannot contain ^";
      if (!strings || !input.value.trim()) return "";
      if (texts) { try { checkInterfaceText(id, input.value.trim()); } catch (e) { return e.message; } return ""; }
      try { checkTranslation(locale(), id, manyLines(input.value.trim())); } catch (e) { return e.message; }
      return "";
    };
    const invalid = () => problem() !== "";
    input.addEventListener("input", () => {
      input.setAttribute("aria-invalid", String(invalid()));
      input.title = problem();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !invalid()) { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    // A blur already moved the focus where the user wanted it.
    input.addEventListener("blur", () => finish(!invalid(), false));
    cell.innerHTML = "";
    cell.append(input);
    input.focus();
    input.select();
  }

  function addName() {
    const kind = kindOfList();
    const idBox = $("#names-add-id"), nameBox = $("#names-add-name"), status = $("#names-add-status");
    const id = Number(idBox.value);
    const name = nameBox.value.trim();
    if (!kind || !Number.isInteger(id) || id < 1 || !name) {
      status.textContent = "Enter a whole-number id above 0 and a name.";
      return;
    }
    setName(kind, id, name);
    status.textContent = referenceData.publishedName(kind, id, locale()) ? `Changed ${id}.` : `Added ${id}.`;
    idBox.value = "";
    nameBox.value = "";
    idBox.focus();
  }

  // Reading a dump only reports; the change list is written by the button below the report.
  let lastImport = null;

  async function readDump(text) {
    const status = $("#names-import-status");
    const parsed = parseNamesDump(text);
    const dumpLocale = parsed.locale || locale();
    const englishItems = dumpLocale === referenceData.namesLocale && parsed.kinds.items;
    if (englishItems) delete parsed.kinds.items;
    const kinds = Object.keys(parsed.kinds);
    if (!GAME_LOCALES.includes(dumpLocale)) {
      status.textContent = `This dump is in "${dumpLocale}", which is not a game language.`;
      $("#names-import-report").innerHTML = "";
      $("#names-import-apply").hidden = true;
      lastImport = null;
      return;
    }
    if (kinds.length === 0) {
      status.textContent = englishItems ? "English item names come from item details, not from a names dump."
        : parsed.skipped
        ? "These lines do not say which table they belong to. Paste the page including its first line."
        : "No names found. Paste a page from FurCDev's Dump tab, or choose the saved names file.";
      $("#names-import-report").innerHTML = "";
      $("#names-import-apply").hidden = true;
      lastImport = null;
      return;
    }
    // The tab follows the dump's language, so the report compares against that language's names
    await setLocale(dumpLocale);
    const diff = diffNames(parsed, store().names);
    lastImport = { locale: dumpLocale, diff };

    const report = $("#names-import-report");
    report.innerHTML = "";
    let total = 0;
    for (const kind of kinds) {
      const d = diff[kind];
      total += d.added.length + d.changed.length;
      const li = elem("li", {},
        `${KIND_LABELS[kind]}: ${d.added.length} new, ${d.changed.length} changed, ${d.same} unchanged`
        + (d.missing ? `, ${d.missing} not in this dump (kept)` : ""));
      const examples = [...d.changed.slice(0, 3).map((c) => `${c.id}: ${c.before} -> ${c.name}`),
        ...d.added.slice(0, 3).map((c) => `${c.id}: ${c.name}`)];
      if (examples.length) li.append(elem("div", { class: "muted names-examples" }, examples.join("; ")));
      report.append(li);
    }
    status.textContent = `Read ${kinds.map((k) => parsed.kinds[k].size).reduce((a, b) => a + b, 0)} names (${dumpLocale})`
      + (parsed.skipped ? `, skipped ${parsed.skipped} lines that name no table` : "") + "."
      + (total > ISSUE_LIMIT ? ` ${total} changes are too many for one contribution: a maintainer imports a full dump with scripts/import_names.py.` : "");
    const apply = $("#names-import-apply");
    apply.hidden = total === 0;
    apply.textContent = `Add ${total} change${total === 1 ? "" : "s"} to the change list`;
  }

  function applyImport() {
    if (!lastImport) return;
    let n = 0;
    for (const [kind, d] of Object.entries(lastImport.diff)) {
      for (const c of [...d.added, ...d.changed]) {
        state.buffer.setName(kind, c.id, lastImport.locale, c.name, c.before ?? null);
        n++;
      }
    }
    lastImport = null;
    $("#names-import-apply").hidden = true;
    $("#names-import-status").textContent = `${n} change${n === 1 ? "" : "s"} added to the change list.`;
    renderFooter();
    renderSidebar();
    renderTable();
  }

  function render(container) {
    container.innerHTML = `
      <section class="browse-mask names-mask">
        <aside class="browse-sidebar">
          <details id="names-filters" class="browse-filters">
            <summary>Name categories</summary>
            <ul id="names-lists" class="browse-facet-list"></ul>
          </details>
        </aside>
        <div class="browse-main">
          <div class="browse-toolbar">
            <span class="search-box">
              <input id="names-search" type="search" placeholder="search by id or name…">
              <button id="names-search-clear" type="button" class="search-clear"
                      aria-label="Clear the search" hidden>×</button>
            </span>
            <label class="names-locale">Language
              <select id="names-locale">${GAME_LOCALES.map((l) => `<option value="${l}">${l}</option>`).join("")}</select></label>
            <span id="names-count" class="muted"></span>
            <button id="names-import-toggle" type="button" class="btn-dump" aria-expanded="false" aria-controls="names-import">Import a names dump</button>
          </div>
          <section id="names-import" class="names-import" hidden aria-label="Import a names dump">
            <p class="muted">Paste pages from FurCDev's Dump tab (Item, Houses, Quests, Achievements or Zones names),
              or choose the SavedVariables file "All names to file" wrote. The dump says which game language
              it is in. Only names that are new or different become changes.</p>
            <textarea id="names-import-paste" rows="6" placeholder="Paste the dump here"></textarea>
            <div class="names-import-actions">
              <button id="names-import-read" type="button" class="btn-primary">Read</button>
              <label class="names-import-file">or choose a file
                <input id="names-import-file" type="file" accept=".lua,.txt,text/plain"></label>
              <span id="names-import-status" class="muted"></span>
            </div>
            <ul id="names-import-report" class="names-import-report"></ul>
            <button id="names-import-apply" type="button" class="btn-primary" hidden></button>
          </section>
          <form id="names-add" class="names-add">
            <input id="names-add-id" type="number" min="1" step="1" placeholder="id" aria-label="Id">
            <input id="names-add-name" type="text" placeholder="name as the game shows it" aria-label="Name">
            <button id="names-add-run" type="submit">Add or change</button>
            <span id="names-add-status" class="muted"></span>
          </form>
          <div id="names-table" class="browse-scroller"></div>
        </div>
      </section>`;

    const narrow = window.matchMedia("(max-width: 760px)");
    const filters = $("#names-filters");
    const syncFilters = () => {
      filters.open = !narrow.matches;
      filters.querySelector("summary").tabIndex = narrow.matches ? 0 : -1;
    };
    syncFilters();
    narrow.addEventListener("change", syncFilters);
    filters.querySelector("summary").addEventListener("click", (e) => { if (!narrow.matches) e.preventDefault(); });

    let searchTimer = null;
    $("#names-search").addEventListener("input", (e) => {
      $("#names-search-clear").hidden = !e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        view.search = e.target.value;
        renderTable();
      }, 150);
    });
    $("#names-search-clear").addEventListener("click", () => {
      const box = $("#names-search");
      box.value = "";
      box.dispatchEvent(new Event("input"));
      box.focus();
    });
    $("#names-locale").value = locale();
    $("#names-locale").addEventListener("change", (e) => setLocale(e.target.value));
    $("#names-import-toggle").addEventListener("click", (e) => {
      const section = $("#names-import");
      section.hidden = !section.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!section.hidden));
    });
    $("#names-import-read").addEventListener("click", () => readDump($("#names-import-paste").value));
    $("#names-import-file").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await readDump(await file.text());
    });
    $("#names-import-apply").addEventListener("click", applyImport);
    $("#names-add").addEventListener("submit", (e) => {
      e.preventDefault();
      addName();
    });

    // Names arrive after first paint; redraw when they land.
    referenceData.onShardLoaded(() => {
      if (!$("#names-table")) return;
      renderSidebar();
      renderTable();
    });
    renderSidebar();
    renderTable();
    referenceData.loadTranslation(locale());
    if (language() !== followed) onShow();
  }

  // The tab opens in the language chosen for the site and follows a change of it; its own select still overrides.
  let followed = referenceData.namesLocale;
  function onShow() {
    if (language() !== followed) {
      followed = language();
      setLocale(followed);
      return;
    }
    renderSidebar();
    renderTable();
  }

  return { id: "names", render, onShow };
}
