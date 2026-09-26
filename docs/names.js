// Names tab: every id -> name table the site shows, the game names from the reference data and the vocabularies from enums.json. A names dump from FurCDev updates the game names through the change list.
import { NAME_KINDS } from "./reference-data.js";
import { parseNamesDump, diffNames } from "./names-dump.js";
import { labelOf } from "./data.js";
import { titleCase } from "./lexicon.js";

// Past this many matches the table asks for a narrower search; a full achievement list is thousands of rows.
const ROW_LIMIT = 500;

const KIND_LABELS = {
  houses: "Houses", quests: "Quests", achievements: "Achievements", zones: "Zones",
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

export function namesMask(deps) {
  const { state, $, elem, renderFooter, referenceData } = deps;
  const view = { list: "game:houses", search: "" };

  function locale() {
    return referenceData.namesLocale;
  }

  // Rows for the selected list: [{ id, name, extra, pending }]
  function rows() {
    const [group, key] = view.list.split(":");
    if (group === "game") {
      const table = referenceData.names?.[key] || new Map();
      const ids = new Set(table.keys());
      for (const e of state.buffer.entries.values()) {
        if (e.op === "name" && e.kind === key && e.locale === locale()) ids.add(e.id);
      }
      return [...ids].sort((a, b) => a - b).map((id) => {
        const pending = state.buffer.entries.get(`name:${locale()}:${key}:${id}`);
        return {
          id: String(id),
          name: pending?.name ?? table.get(id) ?? "",
          extra: pending ? (pending.before ? `was: ${pending.before}` : "new") : "",
          pending: !!pending,
        };
      });
    }
    const enums = state.enums || {};
    return (enums[key] || []).map((entry) => {
      if (typeof entry === "string") return { id: entry, name: "", extra: "", pending: false };
      const extra = Object.entries(entry)
        .filter(([k]) => k !== "symbol" && k !== "name")
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
      return { id: entry.symbol, name: labelOf(enums, key, entry.symbol), extra, pending: false };
    });
  }

  function renderSidebar() {
    const ul = $("#names-lists");
    ul.innerHTML = "";
    const item = (id, label, count) => {
      const btn = elem("button", {
        type: "button",
        class: `browse-facet-link${view.list === id ? " is-active" : ""}`,
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
    for (const kind of NAME_KINDS) {
      ul.append(item(`game:${kind}`, KIND_LABELS[kind], referenceData.names?.[kind]?.size));
    }
    ul.append(elem("li", { class: "names-group" }, "Vocabularies"));
    for (const key of vocabularies(state.enums)) {
      ul.append(item(`vocab:${key}`, titleCase(key), state.enums[key].length));
    }
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
    if (game && !referenceData.names) {
      $("#names-count").textContent = referenceData.state === "unavailable" ? "names not available" : "loading…";
    } else {
      $("#names-count").textContent = hits.length === all.length
        ? `${all.length} entries`
        : `${hits.length} of ${all.length} entries`;
    }
    const table = elem("table", { class: "names-list" });
    const head = elem("tr", {});
    for (const h of [game ? "Id" : "Symbol", "Name", game ? "" : "Details"]) head.append(elem("th", {}, h));
    table.append(elem("thead", {}, head));
    const body = elem("tbody", {});
    for (const r of hits.slice(0, ROW_LIMIT)) {
      const tr = elem("tr", { class: r.pending ? "is-pending" : "" });
      const nameCell = elem("td", {}, r.name);
      if (game) {
        nameCell.classList.add("names-editable");
        nameCell.title = "Click to correct this name";
        nameCell.addEventListener("click", () => editName(nameCell, Number(r.id), r.name));
      }
      tr.append(elem("td", { class: "names-id" }, r.id), nameCell, elem("td", { class: "muted" }, r.extra));
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
    const published = referenceData.publishedName(kind, id);
    state.buffer.setName(kind, id, locale(), name.trim() || published || "", published);
    renderFooter();
    renderSidebar();
    renderTable();
  }

  function editName(cell, id, current) {
    if (cell.querySelector("input")) return;
    const kind = kindOfList();
    const input = elem("input", { type: "text", class: "names-edit", "aria-label": `Name for ${id}` });
    input.value = current;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() !== current) setName(kind, id, input.value);
      else renderTable();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
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
    status.textContent = referenceData.publishedName(kind, id) ? `Changed ${id}.` : `Added ${id}.`;
    idBox.value = "";
    nameBox.value = "";
    idBox.focus();
  }

  // Reading a dump only reports; the change list is written by the button below the report.
  let lastImport = null;

  async function readDump(text) {
    const status = $("#names-import-status");
    const parsed = parseNamesDump(text);
    const kinds = Object.keys(parsed.kinds);
    if (kinds.length === 0) {
      status.textContent = parsed.skipped
        ? "These lines do not say which table they belong to. Paste the page including its first line."
        : "No names found. Paste a page from FurCDev's Dump tab, or choose the saved names file.";
      $("#names-import-report").innerHTML = "";
      $("#names-import-apply").hidden = true;
      lastImport = null;
      return;
    }
    await referenceData.init();
    await referenceData.loadNames();
    const dumpLocale = parsed.locale || locale();
    // Only one locale is published so far; another locale's names are all new.
    const current = dumpLocale === locale() ? referenceData.names : {};
    const diff = diffNames(parsed, current);
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
      + (parsed.skipped ? `, skipped ${parsed.skipped} lines that name no table` : "") + ".";
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
          <h2>Names</h2>
          <ul id="names-lists" class="browse-facet-list"></ul>
        </aside>
        <div class="browse-main">
          <div class="browse-toolbar">
            <span class="search-box">
              <input id="names-search" type="search" placeholder="search by id or name…">
              <button id="names-search-clear" type="button" class="search-clear"
                      aria-label="Clear the search" hidden>×</button>
            </span>
            <span id="names-count" class="muted"></span>
            <button id="names-import-toggle" type="button" class="btn-dump" aria-expanded="false" aria-controls="names-import">Import a names dump</button>
          </div>
          <section id="names-import" class="names-import" hidden aria-label="Import a names dump">
            <p class="muted">Paste pages from FurCDev's Dump tab (Houses, Quests, Achievements or Zones names),
              or choose the SavedVariables file "All names to file" wrote. Only names that are new or
              different become changes.</p>
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
    referenceData.init().then(() => referenceData.loadNames());
  }

  function onShow() {
    renderSidebar();
    renderTable();
  }

  return { id: "names", label: "Names", render, onShow };
}
