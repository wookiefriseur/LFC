// Every mask shares one dirty buffer (state.buffer) and one Review & Submit flow (quick-edit modal is a reduced view of the same write path)

import {
  loadAll, newKey, categoriesFrom, NameStore, isPlaceholderName,
  versionsDesc, versionLabel, latestVersion,
  labelOf, entryOf, noteLabel, crateLabel, recordsForItem, placementsText,
  isUnknownId,
} from "./data.js";
import { renderForm, partitionFields, SITE_ONLY_FIELDS, MIXED } from "./form.js";
import {
  DirtyBuffer, buildIssueBody, buildIssueURL, suggestTitle,
  MAX_ISSUE_URL_LENGTH, ISSUE_REPO,
} from "./diff.js";
import {
  validateRecord, validateBuffer, findDuplicateRecord, messageFor,
  SOURCE_ENUM_FIELD,
} from "./validate.js";
import {
  labelFor, sourceTypeLabel, orderedSourceTypes, valueLabel, subtypeVocab, NOT_IN_GAME_DATA,
  ID_NOT_RECORDED,
} from "./lexicon.js";
import {
  parseLuxuryPaste, parseLuaBlocks, computeLuxuryPlan, mostRecentFriday, snapToFriday,
  LUX_ACTION_LABEL,
  LUX_ACTION, priceEffect, successPanelText,
} from "./luxury.js";
import {
  itemLinkAnchor, itemIconImg, setIconPathLookup, setIconPendingLookup, refreshLoadingIcons,
} from "./external-links.js";
import { registerMask, mountMasks, switchMask, activeMaskId } from "./masks.js";
import { zanilPortrait } from "./zanil.js";
import { crownCrateMask } from "./crown-crate.js";
import { browseMask } from "./browse.js";
import { crownStoreMask } from "./crown-store.js";
import { maintenanceMask } from "./maintenance.js";
import { renderAbout } from "./about.js";
import { buildTaxonomy } from "./taxonomy.js";
import { parseDiscovery, discoveryKnown } from "./discovery.js";
import { isIgnoredItem, ignoredMessage } from "./ignored-items.js";
import { ReferenceData } from "./reference-data.js";

const state = {
  enums: null,
  manifest: null,
  categories: [],
  names: null,
  records: [],
  index: new Map(),     // _key -> record, ids are not unique
  filtered: [],
  selectedKey: null,
  editing: null,        // working copy of the selected record, mutated in place by the form
  // Ticked rows are what a batch edit acts on, the selected row is what the side form edits, and both are wanted at once.
  ticked: new Set(),    // _keys
  multiDraft: null,     // the batch panel's record-shaped draft
  multiBase: null,      // that draft as it opened; only paths moved off it are written
  multiMixed: null,     // the paths the ticked records disagree on
  buffer: new DirtyBuffer(),
  search: "",
  sourceType: "",
  version: "",
  changedOnly: false,
  selectedOnly: false,  // "Selected only": the ticked rows
  tickAnchor: null,     // _key a Shift-click ranges from
  luxPlan: null,
  luxMode: "paste",     // "paste" | "manual"
  luxManualRows: [],    // [{id, name, price, query}]
  cratePlan: null,
  crateShowIcons: false,
};

// Optional reference-data overlay (icon map + item list), loaded lazily after first paint; the app works fully without it.
const referenceData = new ReferenceData();

// Kept so the header search box and Maintenance's leaf chips can drive it through browse.focus().
let browse = null;

// quick-edit.js and changelist.js are imported dynamically: a static import of a missing file takes the whole module graph down, and every other screen works without them.
const optionalModules = new Map();   // path -> Promise<module|null>
function importOptional(path) {
  if (!optionalModules.has(path)) {
    optionalModules.set(path, import(path).catch((e) => {
      console.warn(`optional module ${path} not loaded: ${e.message}`);
      return null;
    }));
  }
  return optionalModules.get(path);
}

let quickEditInstance = null;   // a factory-style module's single instance
async function openQuickEdit(recordKey) {
  const mod = await importOptional("./quick-edit.js");
  if (!mod) return;
  if (typeof mod.openQuickEdit === "function") {
    mod.openQuickEdit(recordKey, maskDeps());
    return;
  }
  if (typeof mod.quickEditModal === "function") {
    if (!quickEditInstance) quickEditInstance = mod.quickEditModal(maskDeps());
    quickEditInstance.open(recordKey);
  }
}

const ROW_H = 36;       // px per <tr>; style.css fixes the row at this height
const OVERSCAN = 8;     // extra rows above/below the viewport

const $ = (sel) => document.querySelector(sel);

async function init() {
  try {
    const { enums, records, names, errors, manifest } = await loadAll();
    state.enums = enums;
    state.manifest = manifest;
    state.categories = categoriesFrom(manifest);
    state.names = new NameStore(names);
    for (const r of state.records) state.names.setRecordName(r.id ?? r.blueprint, r.name_overrides?.en);
    state.records = records;
    state.index = new Map(records.map((r) => [r._key, r]));
    if (errors && errors.length) {
      console.warn(`${errors.length} JSONL parse error(s):`, errors);
    }
    applyFilters();
    bindSubmit();

    // Registration order is tab order.
    registerMask({ id: "luxury", label: "Luxury", render: renderLuxuryPanel });
    registerMask({
      id: "crown-store",
      label: "Crown",
      subtabs: [
        crownStoreMask(maskDeps()),   // default subtab
        crownCrateMask(maskDeps()),
      ],
    });
    browse = browseMask(maskDeps());
    registerMask(browse);
    registerMask({ id: "advanced", label: "Batch edit",
                   render: renderAdvancedPanel, onShow: () => renderTable() });
    registerMask(maintenanceMask(maskDeps()));
    // Not in KNOWN_TABS, so it is never remembered as the landing tab.
    registerMask({ id: "about", label: "About", render: renderAbout });
    mountMasks({
      tabBar:    $("#tab-bar"),
      panelHost: $("#panel-host"),
      defaultId: lastTab(),
    });
    bindTabMemory();
    renderFooter();
    installTestHook();
    // Warm the optional modules so the first "Fix this" / "Send it" does not wait on a network round trip.
    importOptional("./quick-edit.js");
    importOptional("./changelist.js");

    // Wire the icon lookups first so they are live the moment shards land, then fetch the overlay lazily after first paint.
    setIconPathLookup((id) => referenceData.iconPath(id));
    setIconPendingLookup((id) => referenceData.iconPending(id));
    referenceData.onShardLoaded(refreshLoadingIcons);
    const startRefData = () => { referenceData.init(); };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(startRefData, { timeout: 3000 });
    } else {
      setTimeout(startRefData, 1200);
    }
  } catch (e) {
    $("#status").textContent = `load failed: ${e.message}`;
    console.error(e);
  }
}


// A stored id that no longer exists falls back to the landing tab rather than throwing out of mountMasks.
const LAST_TAB_KEY = "furcat-last-tab";
const DEFAULT_TAB = "luxury";
const KNOWN_TABS = ["luxury", "crown-store", "browse", "maintenance", "advanced"];

function lastTab() {
  try {
    const id = localStorage.getItem(LAST_TAB_KEY);
    return KNOWN_TABS.includes(id) ? id : DEFAULT_TAB;
  } catch (_) {
    return DEFAULT_TAB;   // private mode / file:// with storage disabled
  }
}

// Batch edit's "Add a detail" expander stays as the contributor last left it.
const DETAIL_OPEN_KEY = "furcat-add-detail-open";
function detailExpanderOpen() {
  try { return localStorage.getItem(DETAIL_OPEN_KEY) === "1"; } catch (_) { return false; }
}
function rememberDetailExpander(open) {
  try { localStorage.setItem(DETAIL_OPEN_KEY, open ? "1" : "0"); } catch (_) { /* forgets */ }
}

function rememberTab(id) {
  if (!KNOWN_TABS.includes(id)) return;
  try {
    localStorage.setItem(LAST_TAB_KEY, id);
  } catch (_) { /* storage unavailable: the app just forgets */ }
}

// masks.js has no switch callback, so the write hangs off a click on the bar and this module's own switchTo* helpers.
function bindTabMemory() {
  $("#tab-bar").addEventListener("click", () => rememberTab(activeMaskId()));
}

// Test hook for facts not reliably readable off the DOM. The only place the app writes to `window`; nothing in the UI depends on it.
function installTestHook() {
  window.__proto = {
    ready: true,
    get schemaVersion() { return state.enums?.schema_version; },
    get sourceTypes() { return state.enums?.source_types || []; },
    get contracts() { return state.enums?.source_type_contracts || {}; },
    get enums() { return state.enums; },
    get manifest() { return state.manifest; },
    get recordCount() { return state.records.length; },
    records: () => state.records,
    validate: (record) => validateRecord(record, state.enums, state.records),
    taxonomy: () => {
      const t = buildTaxonomy(state.enums || {}, state.records);
      return {
        leaves: t.leaves,
        catchAll: t.catchAll,
        unknown: t.unknown,
        groups: t.groups.map((g) => ({
          id: g.id,
          leaves: [...g.leaves, ...g.subgroups.flatMap((sg) => sg.leaves)],
        })),
      };
    },
    // The form edits in place, so a test reads the result here rather than from the table DOM.
    editing: () => state.editing || null,
    // So a test can ask whether an icon map actually resolves rather than inferring it from the DOM.
    refData: () => ({
      state: referenceData.state,
      iconPath: (id) => referenceData.iconPath(id),
      meta: (id) => referenceData.meta(id),
      resultOf: (id) => referenceData.resultOf(id),
    }),
    sampleRecord: (type) =>
      state.records.find((r) => r.source && r.source.type === type) || null,
    // partitionFields reads both keys of the {errors, warnings} pair, so a flat array silently drops rule V3.
    partition: (recordKey) => {
      const rec = state.index.get(recordKey);
      if (!rec) return null;
      const findings = validateRecord(rec, state.enums, state.records);
      return partitionFields(rec, state.enums?.source_type_contracts || {}, findings);
    },
    openQuickEdit: (recordKey) => openQuickEdit(recordKey),
  };
}

// Mask 1: Luxury weekly update

// itemIds are unique within luxury.jsonl, so a flat id map is safe here, unlike the global index, which keys on _key because ids collide across categories.
function buildLuxuryIndex() {
  const m = new Map();
  for (const r of state.records) {
    if (r._category !== "luxury" || m.has(r.id)) continue;
    // Live records already carry committed edits and added rows, but a re-sale is measured against the data file: an edited row is read from its pre-edit copy, and a row the change list added was never there to be re-sold.
    const pending = state.buffer.entries.get(r._key);
    if (pending && pending.op === "add") continue;
    m.set(r.id, { record: clean(pending?.before || r), _key: r._key });
  }
  return m;
}

function renderLuxuryPanel(container) {
  container.innerHTML = `
    <section class="luxury-mask">
      <div class="zanil-host" id="zanil-host" aria-hidden="true"></div>
      <h2 class="lux-title">Luxury Furnisher</h2>

      <ol class="lux-steps">
        <li class="lux-step">
          <div class="lux-step-head"><span class="lux-step-num">1</span>
            <h3>When?</h3></div>
          <div class="luxury-controls">
            <label class="lc-field">
              <span>Weekend date</span>
              <input id="lux-date" type="date">
              <small class="muted">Pick the weekend the items went on sale.</small>
            </label>
            <label class="lc-field lc-checkbox lux-adv-toggle">
              <input id="lux-advanced" type="checkbox">
              <span>Advanced</span>
            </label>
          </div>
          <div id="lux-advanced-fields" class="luxury-controls lux-advanced" hidden>
            <label class="lc-field">
              <span>Patch / version</span>
              <select id="lux-version"></select>
              <small class="muted">For new items, re-sales remain unchanged.</small>
            </label>
            <label class="lc-field lc-checkbox">
              <input id="lux-update-prices" type="checkbox">
              <span title="In-game events temporarily discount luxury items. The DB keeps the canonical price, so a re-sale updates the date and not the price unless you say otherwise.">Update prices</span>
              <small class="muted">Only check if the prices really changed, temporary event sales don't count.</small>
            </label>
          </div>
        </li>

        <li class="lux-step">
          <div class="lux-step-head"><span class="lux-step-num">2</span>
            <h3>What is Zanil selling?</h3></div>
          <div class="lux-mode-switch" role="tablist">
            <button id="lux-mode-paste" class="lux-mode is-active" role="tab" aria-selected="true">Paste from game</button>
            <button id="lux-mode-manual" class="lux-mode" role="tab" aria-selected="false">Type items manually</button>
          </div>

          <div id="lux-paste-panel">
            <label class="lux-paste-label" for="lux-paste">Paste the in-game DevUtility export</label>
            <textarea id="lux-paste" rows="8" placeholder="	[126560] = {		-- Dwarven Fountain, Forged&#10;		itemPrice = 50000,		-- Gold&#10;	},"></textarea>
            <details class="lux-format-help">
            <summary>What can I paste here?</summary>
            <ol class="lux-help-list muted">
              <li>
                <p>Open the Luxury Furnisher's inventory in the game, open the
                Dev Toolbox (the <code>/furcdev</code> command or its hotkey)
                and use <em>Add all from trader</em>. Paste what it gives you:</p>
                <pre><code>	[126560] = {		-- Dwarven Fountain, Forged
		itemPrice = 50000,		-- Gold
	},</code></pre>
              </li>
              <li>
                <p>Or type one item per line, mixing whichever of these you
                have:</p>
                <pre><code>126560, 50000, Dwarven Fountain
118243, 25000
126561</code></pre>
              </li>
            </ol>
            </details>
          </div>

          <div id="lux-manual-panel" hidden>
            <div id="lux-manual-rows" class="lux-manual-rows"></div>
            <button id="lux-manual-add" class="btn-mini">+ add another item</button>
          </div>

          <div class="lux-actions">
            <button id="lux-parse" class="btn-primary">Preview items</button>
            <button id="lux-clear">Clear</button>
            <span id="lux-status" class="muted"></span>
          </div>
        </li>

        <li class="lux-step">
          <div class="lux-step-head"><span class="lux-step-num">3</span>
            <h3>Check &amp; add</h3></div>
          <p id="lux-step3-hint" class="muted">The preview appears here once you hit “Preview items”.</p>
          <div id="lux-preview-wrap" class="lux-preview-wrap" hidden>
            <div class="lux-preview-head">
              <h3>Preview</h3>
            </div>
            <table class="lux-preview">
              <thead>
                <tr><th class="lux-col-icon"></th><th class="lux-col-id">id</th>
                  <th class="lux-col-name">name</th><th>price</th><th>action</th>
                  <th>notes</th></tr>
              </thead>
              <tbody id="lux-preview-body"></tbody>
            </table>
            <div class="lux-commit-row">
              <button id="lux-commit" class="btn-primary">Add previewed items to the change list</button>
              <span id="lux-commit-status" class="muted"></span>
            </div>
          </div>
        </li>
      </ol>

      <div id="lux-success" class="lux-success" hidden>
        <div class="lux-success-msg"><span class="lux-success-tick">✓</span>
          <span id="lux-success-text"></span></div>
        <div class="lux-success-actions">
          <button id="lux-success-review" class="btn-primary">Send now</button>
          <button id="lux-success-more">Keep adding</button>
        </div>
      </div>
    </section>`;

  $("#zanil-host").append(zanilPortrait());

  $("#lux-date").value = mostRecentFriday();
  // The sale is one weekend whatever the contributor's timezone or calendar says, so a Saturday, Sunday or Monday is that weekend's Friday.
  $("#lux-date").addEventListener("change", (e) => {
    const snapped = snapToFriday(e.target.value);
    if (snapped && snapped !== e.target.value) e.target.value = snapped;
  });
  $("#lux-advanced").addEventListener("change", (e) => {
    $("#lux-advanced-fields").hidden = !e.target.checked;
  });
  fillVersionSelect("#lux-version");

  $("#lux-mode-paste").addEventListener("click", () => setLuxMode("paste"));
  $("#lux-mode-manual").addEventListener("click", () => setLuxMode("manual"));

  if (state.luxManualRows.length === 0) state.luxManualRows.push(blankLuxRow());
  renderLuxManualRows();
  $("#lux-manual-add").addEventListener("click", () => {
    state.luxManualRows.push(blankLuxRow());
    renderLuxManualRows();
    focusLastLuxRow();
  });

  $("#lux-parse").addEventListener("click", () => runLuxuryPreview());
  $("#lux-clear").addEventListener("click", () => clearLuxuryInputs());
  $("#lux-commit").addEventListener("click", () => commitLuxuryPlan());
  $("#lux-success-review").addEventListener("click", () => openSubmitModal());
  $("#lux-success-more").addEventListener("click", () => {
    $("#lux-success").hidden = true;
    clearLuxuryInputs();
    if (state.luxMode === "manual") focusLastLuxRow();
  });
}

function setLuxMode(mode) {
  state.luxMode = mode;
  $("#lux-mode-paste").classList.toggle("is-active", mode === "paste");
  $("#lux-mode-paste").setAttribute("aria-selected", String(mode === "paste"));
  $("#lux-mode-manual").classList.toggle("is-active", mode === "manual");
  $("#lux-mode-manual").setAttribute("aria-selected", String(mode === "manual"));
  $("#lux-paste-panel").hidden = mode !== "paste";
  $("#lux-manual-panel").hidden = mode !== "manual";
  if (mode === "manual") focusLastLuxRow();
}

function clearLuxuryInputs() {
  $("#lux-paste").value = "";
  state.luxManualRows = [blankLuxRow()];
  renderLuxManualRows();
  $("#lux-preview-wrap").hidden = true;
  $("#lux-step3-hint").hidden = false;
  $("#lux-status").textContent = "";
  state.luxPlan = null;
}

// Manual-assistant row editor

function blankLuxRow() {
  return { id: null, name: "", price: null, query: "" };
}

// Real names only: placeholders are unfindable by name anyway.
let luxSearchIndex = null;
function buildLuxSearchIndex() {
  if (luxSearchIndex) return luxSearchIndex;
  luxSearchIndex = [];
  const base = state.names ? state.names.base : {};
  for (const [idStr, name] of Object.entries(base)) {
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id)) continue;
    if (isPlaceholderName(name, id)) continue;
    luxSearchIndex.push({ id, name, lower: name.toLowerCase() });
  }
  return luxSearchIndex;
}

// Accepts a name fragment, a bare itemId or a pasted ESO item link; name matches rank prefix-first.
function luxSuggestionsFor(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const link = q.match(/\|H\d*:item:(\d+):/i);
  if (link) return [{ id: parseInt(link[1], 10), name: nameOf(parseInt(link[1], 10)) || "(unnamed item)" }];
  if (/^\d+$/.test(q)) {
    const idNum = parseInt(q, 10);
    const out = [];
    for (const e of buildLuxSearchIndex()) {
      if (String(e.id).startsWith(q)) out.push(e);
      if (out.length >= 8) break;
    }
    // A bare id the names file doesn't know is still selectable (new item).
    if (!out.some((e) => e.id === idNum)) {
      out.unshift({ id: idNum, name: nameOf(idNum) || "(unnamed item)" });
    }
    return out.slice(0, 8);
  }
  const lower = q.toLowerCase();
  const starts = [];
  const contains = [];
  for (const e of buildLuxSearchIndex()) {
    if (e.lower.startsWith(lower)) starts.push(e);
    else if (e.lower.includes(lower)) contains.push(e);
    if (starts.length >= 8) break;
  }
  return [...starts, ...contains].slice(0, 8);
}

function focusLastLuxRow() {
  const rows = document.querySelectorAll("#lux-manual-rows .lux-mrow");
  const lastRow = rows[rows.length - 1];
  if (!lastRow) return;
  const input = lastRow.querySelector(".lux-mrow-search, .lux-mrow-price");
  if (input) input.focus();
}

function renderLuxManualRows() {
  const host = $("#lux-manual-rows");
  if (!host) return;
  host.innerHTML = "";
  const luxIndex = buildLuxuryIndex();

  state.luxManualRows.forEach((row, i) => {
    const rowEl = elem("div", { class: "lux-mrow" });

    if (!Number.isInteger(row.id)) {
      const search = elem("input", {
        type: "search", class: "lux-mrow-search",
        placeholder: "item name, itemId, or paste an item link…",
      });
      search.value = row.query;
      const dropdown = elem("div", { class: "lux-suggest", hidden: "" });
      let active = -1;
      let current = [];

      const select = (s) => {
        row.id = s.id;
        row.name = s.name;
        row.query = "";
        renderLuxManualRows();
        const el = host.querySelectorAll(".lux-mrow")[i]?.querySelector(".lux-mrow-price");
        if (el) el.focus();
      };
      const refresh = () => {
        current = luxSuggestionsFor(row.query);
        active = -1;
        dropdown.innerHTML = "";
        dropdown.hidden = current.length === 0;
        current.forEach((s, si) => {
          const known = luxIndex.get(s.id);
          const opt = elem("button", { type: "button", class: "lux-suggest-opt" });
          opt.append(elem("span", { class: "lux-suggest-name" }, s.name || "(unnamed item)"));
          opt.append(elem("span", { class: "lux-suggest-id muted" }, `#${s.id}`));
          if (known) {
            const amt = known.record.cost?.[0]?.amount;
            opt.append(elem("span", { class: "lux-suggest-known" },
              amt != null ? `in DB - ${amt.toLocaleString()}g` : "in DB"));
          }
          opt.addEventListener("click", () => select(s));
          opt.dataset.idx = si;
          dropdown.append(opt);
        });
      };
      const highlight = () => {
        dropdown.querySelectorAll(".lux-suggest-opt").forEach((o, oi) =>
          o.classList.toggle("is-active", oi === active));
      };
      search.addEventListener("input", (e) => {
        row.query = e.target.value;
        refresh();
      });
      search.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault(); active = Math.min(active + 1, current.length - 1); highlight();
        } else if (e.key === "ArrowUp") {
          e.preventDefault(); active = Math.max(active - 1, 0); highlight();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (current.length) select(current[active >= 0 ? active : 0]);
        } else if (e.key === "Escape") {
          dropdown.hidden = true;
        }
      });
      rowEl.append(search, dropdown);
      if (row.query) refresh();
    } else {
      const known = luxIndex.get(row.id);
      const chip = elem("span", { class: "lux-mrow-chip" });
      chip.append(itemIconImg(row.id, row.name || `item ${row.id}`));
      chip.append(elem("span", { class: "lux-mrow-chip-name" },
        row.name || nameOf(row.id) || "(unnamed item)"));
      chip.append(elem("span", { class: "muted" }, `#${row.id}`));
      rowEl.append(chip);

      const price = elem("input", {
        type: "number", class: "lux-mrow-price", min: 0, step: 1,
        placeholder: known ? "price (empty = keep stored)" : "price in gold",
      });
      if (row.price != null) price.value = row.price;
      price.addEventListener("input", (e) => {
        const v = parseInt(e.target.value, 10);
        row.price = Number.isFinite(v) ? v : null;
      });
      price.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        // Enter on the last row's price starts the next item.
        if (i === state.luxManualRows.length - 1) {
          state.luxManualRows.push(blankLuxRow());
          renderLuxManualRows();
          focusLastLuxRow();
        }
      });
      rowEl.append(price);

      const hintTxt = known
        ? (known.record.cost?.[0]?.amount != null
            ? `re-sale - stored ${known.record.cost[0].amount.toLocaleString()}g`
            : "re-sale - no stored price yet")
        : "new item - price needed";
      rowEl.append(elem("span", { class: `lux-mrow-hint muted${known ? "" : " lux-mrow-new"}` }, hintTxt));
    }

    const rm = elem("button", { type: "button", class: "btn-mini lux-mrow-rm", title: "remove this row" }, "×");
    rm.addEventListener("click", () => {
      state.luxManualRows.splice(i, 1);
      if (state.luxManualRows.length === 0) state.luxManualRows.push(blankLuxRow());
      renderLuxManualRows();
    });
    rowEl.append(rm);
    host.append(rowEl);
  });
}

function runLuxuryPreview() {
  const date = $("#lux-date").value;
  const version = $("#lux-version").value;
  const keepPrices = !$("#lux-update-prices").checked;

  if (!date) {
    $("#lux-status").textContent = "set a weekend date first (step 1).";
    return;
  }
  let rows;
  if (state.luxMode === "manual") {
    // Manual rows take the paste parser's row shape, so one plan/preview/commit pipeline serves both modes.
    rows = state.luxManualRows
      .filter((r) => Number.isInteger(r.id))
      .map((r, i) => ({
        lineNo: i + 1, raw: `${r.id}${r.price != null ? `, ${r.price}` : ""}`,
        id: r.id, price: r.price, comment: r.name || "", error: null,
      }));
  } else {
    rows = parseLuxuryPaste($("#lux-paste").value);
  }
  if (rows.length === 0) {
    $("#lux-status").textContent = state.luxMode === "manual"
      ? "no items yet - search and pick at least one item above."
      : "nothing to parse - paste at least one item line.";
    $("#lux-preview-wrap").hidden = true;
    $("#lux-step3-hint").hidden = false;
    state.luxPlan = null;
    return;
  }
  // A Lua-block paste carries the item name in its `-- ` comment: a display-only fallback for ids the names file does not cover, never written into record data.
  for (const r of rows) {
    if (Number.isInteger(r.id) && r.comment) {
      state.names.addOverride(r.id, r.comment);
    }
  }
  const plan = computeLuxuryPlan(rows, {
    date, version, keepPrices, luxuryById: buildLuxuryIndex(),
  });
  state.luxPlan = plan;
  renderLuxuryPreview();
}

const LUX_BADGE_CLASS = {
  [LUX_ACTION.NEW]: "b-new",
  [LUX_ACTION.RESALE_DATE]: "b-resale",
  [LUX_ACTION.RESALE_PRICE]: "b-price",
  [LUX_ACTION.PRICE_ADDED]: "b-added",
  [LUX_ACTION.WARN]: "b-warn",
};

function renderLuxuryPreview() {
  const plan = state.luxPlan || [];
  const body = $("#lux-preview-body");
  body.innerHTML = "";

  for (const p of plan) {
    const tr = document.createElement("tr");
    if (p.action === LUX_ACTION.WARN) tr.className = "lux-warn";

    // The icon resolves only once the reference overlay carries a path for the id; until then the cell stays empty.
    const iconTd = elem("td", { class: "lux-col-icon" });
    if (Number.isInteger(p.id)) {
      iconTd.append(itemIconImg(p.id, nameOf(p.id) || `item ${p.id}`));
    }
    tr.append(iconTd);

    const idTd = elem("td", { class: "lux-col-id" });
    if (Number.isInteger(p.id)) idTd.append(itemLinkAnchor(p.id, p.id));
    else idTd.textContent = "?";
    tr.append(idTd);

    const nameTd = elem("td", { class: "lux-name lux-col-name" });
    if (Number.isInteger(p.id)) {
      const nm = nameOf(p.id) || "(no name)";
      nameTd.append(itemLinkAnchor(p.id, nm));
    } else {
      nameTd.textContent = "-";
    }
    tr.append(nameTd);

    // What the commit will do, not what was pasted: a contributor who ticks "Update prices" on an event-sale week must see the rewrites before committing them.
    tr.append(elem("td", { class: "lux-price-effect" }, priceEffect(p)));

    const actTd = elem("td");
    const badgeCls = LUX_BADGE_CLASS[p.action] || "b-warn";
    const badgeText = LUX_ACTION_LABEL[p.action] || p.action;
    actTd.append(elem("span", { class: `lux-badge ${badgeCls}` }, badgeText));
    tr.append(actTd);

    // Clipped to one line on an ordinary row, so the full text goes in the title.
    const notes = p.messages.join(" · ");
    tr.append(elem("td", notes ? { class: "lux-notes", title: notes } : { class: "lux-notes" }, notes));

    body.append(tr);
  }

  const counts = {};
  let committable = 0;
  let invalid = 0;
  for (const p of plan) {
    counts[p.action] = (counts[p.action] || 0) + 1;
    if (p.action !== LUX_ACTION.WARN && p.record) {
      committable++;
      const { errors } = validateRecord(p.record, state.enums);
      if (errors.length) invalid++;
    }
  }
  const summary = Object.entries(counts)
    .map(([a, n]) => `${n} ${a}`).join(" · ");
  let statusTxt = `${plan.length} line(s): ${summary}.`;
  if (invalid) statusTxt += ` ⚠ ${invalid} record(s) fail validation.`;
  $("#lux-status").textContent = statusTxt;

  $("#lux-commit").disabled = committable === 0;
  $("#lux-commit-status").textContent =
    committable === 0
      ? "no committable rows (all WARN)."
      : `${committable} record(s) will be added to the change list` +
        (invalid ? ` - ${invalid} have validation errors and are skipped.` : ".");
  $("#lux-preview-wrap").hidden = false;
  $("#lux-step3-hint").hidden = true;
}

function commitLuxuryPlan() {
  const plan = state.luxPlan || [];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let blocked = 0;

  for (const p of plan) {
    if (p.action === LUX_ACTION.WARN || !p.record) { skipped++; continue; }
    const { errors } = validateRecord(p.record, state.enums);
    if (errors.length) { skipped++; continue; }

    if (p.before && p._key) {
      state.buffer.update(p._key, p.before, p.record, "luxury");
      // Mirror into the in-memory record so the batch-edit table reflects it.
      const live = state.index.get(p._key);
      if (live) Object.assign(live, p.record);
      updated++;
    } else {
      // Luxury ids stay unique, so reaching the add path means the id is new; this exact-duplicate block is a re-press safety net.
      const { exact } = findDuplicateRecord(
        p.record.id, "luxury", p.record.source, state.records);
      if (exact) {
        blocked++;
        p.action = LUX_ACTION.WARN;
        p.messages.push(
          `id ${p.record.id} with an identical source already exists in luxury - edit that record instead`,
        );
        continue;
      }
      const key = newKey("luxury");
      const rec = { ...p.record, _category: "luxury", _key: key };
      state.buffer.add(key, p.record, "luxury");
      state.records.push(rec);
      state.index.set(key, rec);
      added++;
    }
  }

  let msg = `Added to the change list: ${added} new, ${updated} re-sale update(s)`;
  if (skipped) msg += `, ${skipped} skipped (WARN / invalid)`;
  if (blocked) msg += `, ${blocked} BLOCKED (duplicate id)`;
  $("#lux-commit-status").textContent = msg + ".";
  if (blocked) renderLuxuryPreview();
  applyFilters();
  renderFooter();

  if (added + updated > 0) {
    $("#lux-success-text").textContent = successPanelText({
      added, updated, skipped, blocked, pending: state.buffer.size(),
    });
    $("#lux-success").hidden = false;
    $("#lux-success").scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }
}

// Mask 2: Batch edit (virtualised table + schema-driven form)
function renderAdvancedPanel(container) {
  container.innerHTML = `
    <div class="adv-controls">
      <button id="btn-add" class="btn-primary">+ Add new</button>
      <button id="btn-add-dump" class="btn-dump" aria-expanded="false" aria-controls="adv-import">++Add from Dump</button>
      <span class="search-box">
        <input id="search" type="search" placeholder="search by id or name…">
        <button id="search-clear" type="button" class="search-clear"
                aria-label="Clear the search" hidden>×</button>
      </span>
      <select id="filter-type" title="source.type"></select>
      <select id="filter-version" title="availability.version"></select>
      <label class="adv-changed-toggle" title="Show only the rows you have ticked.">
        <input id="filter-selected" type="checkbox" role="switch">
        <span>Selected only</span>
      </label>
      <label class="adv-changed-toggle" title="Show only records you have edited this session.">
        <input id="filter-changed" type="checkbox" role="switch">
        <span>Changed only</span>
        <span id="changed-count" class="adv-changed-count"></span>
      </label>
    </div>

    <section class="adv-import" id="adv-import" hidden aria-label="Add from Dump">
      <div class="adv-import-body">
        <p class="muted">Paste output from DevUtility's Datamine text box. You can paste
          several pages together. New discoveries arrive as Unconfirmed; choose their source
          when you know it. Existing entries are skipped.</p>
        <textarea id="adv-import-paste" rows="7" placeholder="Paste your dump here"></textarea>
        <div class="adv-import-actions">
          <button id="adv-import-run" class="btn-primary">Import to the change list</button>
          <button id="adv-import-clear">Clear</button>
          <span id="adv-import-status" class="muted"></span>
        </div>
      </div>
    </section>

    <div class="adv-split">
      <section class="table-pane">
        <div id="row-count" class="muted">loading…</div>
        <div id="scroller" class="scroller">
          <table>
            <thead>
              <tr><th class="cell-tick"><input id="tick-all" type="checkbox"
                      title="Tick every row the filters leave"></th>
                  <th title="id">Item ID</th><th>Name</th>
                  <th title="source.type">Source</th>
                  <th title="source.*">Details</th>
                  <th title="cost">Price</th>
                  <th title="availability.version">Version</th></tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </section>
      <aside id="detail" class="detail-pane">
        <p class="muted">Select a row to edit, or click + Add new above.</p>
      </aside>
    </div>`;

  populateFilters();
  bindHeader();
  bindScroller();
  bindTickAll();
  bindBatchImport();
  renderTable();
  renderDetail();
  // The panel renders lazily on first switch, by which time edits from other masks may already be buffered.
  renderChangedCount();
}

function populateFilters() {
  fillSelect("#filter-type", ["", ...orderedSourceTypes(state.enums.source_types)],
    (t) => (t ? sourceTypeLabel(t) : "(anywhere it comes from)"));
  fillVersionSelect("#filter-version", { includeAny: true });
}

function fillSelect(sel, values, label) {
  const el = $(sel);
  el.innerHTML = "";
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label(v);
    el.append(o);
  }
}

function fillSelectPairs(sel, pairs) {
  const el = $(sel);
  el.innerHTML = "";
  for (const p of pairs) {
    const o = document.createElement("option");
    o.value = p.value;
    o.textContent = p.label;
    el.append(o);
  }
}

// The option value is the bare symbol stored in a record; without `opts.includeAny` the newest version is pre-selected.
function fillVersionSelect(sel, opts = {}) {
  const el = $(sel);
  el.innerHTML = "";
  if (opts.includeAny) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(any version)";
    el.append(o);
  }
  for (const v of versionsDesc(state.enums)) {
    const o = document.createElement("option");
    o.value = v.symbol;
    o.textContent = versionLabel(state.enums, v.symbol);
    el.append(o);
  }
  if (opts.value != null) el.value = opts.value;
  else if (!opts.includeAny) el.value = latestVersion(state.enums);
}

function refilter() {
  applyFilters();
  const scroller = $("#scroller");
  if (scroller) scroller.scrollTop = 0;
  renderTable();
}

function bindHeader() {
  let searchTimer = null;
  $("#search").addEventListener("input", (e) => {
    const v = e.target.value.toLowerCase();
    $("#search-clear").hidden = !v;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = v;
      refilter();
    }, 150);
  });
  $("#search-clear").addEventListener("click", () => {
    const box = $("#search");
    box.value = "";
    box.dispatchEvent(new Event("input"));
    box.focus();
  });
  $("#filter-type").addEventListener("change", (e) => {
    state.sourceType = e.target.value;
    refilter();
  });
  $("#filter-version").addEventListener("change", (e) => {
    state.version = e.target.value;
    refilter();
  });
  $("#filter-changed").addEventListener("change", (e) => {
    state.changedOnly = e.target.checked;
    refilter();
  });
  $("#filter-selected").addEventListener("change", (e) => {
    state.selectedOnly = e.target.checked;
    refilter();
  });
  $("#btn-add").addEventListener("click", () => addNewRecord());
}

function addNewRecord(opts = {}) {
  const blank = {
    ...(Number.isInteger(opts.id) ? { id: opts.id } : {}),
    source: { type: opts.sourceType || state.enums.source_types[0] },
    cost: [],
    availability: { version: latestVersion(state.enums) },
    _isNew: true,
  };
  blank._category = deriveCategory(blank, state.categories[0]);
  blank._key = newKey(blank._category);
  state.selectedKey = null;
  state.editing = blank;
  renderDetail();
}

function applyFilters() {
  const q = state.search;
  state.filtered = state.records.filter((r) => {
    if (state.changedOnly && !state.buffer.entries.has(r._key)) return false;
    if (state.selectedOnly && !state.ticked.has(r._key)) return false;
    if (state.sourceType && r.source?.type !== state.sourceType) return false;
    if (state.version && r.availability?.version !== state.version) return false;
    if (q) {
      const name = nameOf(r.id ?? r.blueprint).toLowerCase();
      if (!name.includes(q) && ![r.id, r.blueprint].some(id => id != null && String(id).includes(q))) return false;
    }
    return true;
  });
}

// validate.js's vocabulary table, so what the table renders as a resolved name is what the validator checks against.
const SOURCE_VOCAB = SOURCE_ENUM_FIELD;

// Unknown key, symbol or vocabulary falls through to the raw value: enums.json is the source of truth and this table may lag it.
function sourceValueText(key, value, sourceType) {
  if (isUnknownId(state.enums, key, value)) return ID_NOT_RECORDED;
  if (key === "locations" && Array.isArray(value)) {
    return placementsText(state.enums, value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => sourceValueText(key, v, sourceType)).join(", ");
  }
  const raw = String(value);
  if (key === "note") return noteLabel(state.enums, raw);
  if (key === "subtype") return valueLabel(subtypeVocab(sourceType), raw);
  const vocab = SOURCE_VOCAB[key];
  if (!vocab) return raw;
  const entry = entryOf(state.enums, vocab, raw);
  const label = vocab === "crates" ? crateLabel(state.enums, raw)
                                   : labelOf(state.enums, vocab, raw);
  // A value the library does not define (crates.IRONY) says so wherever it is shown: a known problem in the source data, not a typo.
  return entry && entry.undefined_in_library ? label + NOT_IN_GAME_DATA : label;
}

// One id routinely owns several records of the same type, so without this column the table shows identical-looking rows that are not duplicates. Values go in the cell, lexicon labels in the title.
function sourceDetail(source) {
  if (!source) return { text: "", title: "", parts: [] };
  const type = source.type;
  const vals = [];
  const full = [];
  for (const [k, v] of Object.entries(source)) {
    if (k === "type") continue;
    const shown = sourceValueText(k, v, type);
    vals.push(shown);
    full.push(`${labelFor(`source.${k}`, type)}: ${shown}`);
  }
  return { text: vals.join(" · "), title: full.join("\n"), parts: vals };
}

function renderTable() {
  const tbody = $("#table-body");
  const scroller = $("#scroller");
  if (!tbody || !scroller) return;   // advanced panel not yet rendered
  const total = state.filtered.length;

  const scrollTop = scroller.scrollTop;
  const viewH = scroller.clientHeight || 600;
  let first = Math.floor(scrollTop / ROW_H) - OVERSCAN;
  if (first < 0) first = 0;
  let visible = Math.ceil(viewH / ROW_H) + OVERSCAN * 2;
  let last = Math.min(total, first + visible);

  tbody.innerHTML = "";

  if (first > 0) tbody.append(spacerRow(first * ROW_H));

  for (let i = first; i < last; i++) {
    const r = state.filtered[i];
    const tr = document.createElement("tr");
    if (r._key === state.selectedKey) tr.className = "selected";
    if (state.ticked.has(r._key)) tr.classList.add("ticked");
    // Solid dirty marker when the edit reaches the game database, hollow when it only changed site-only text.
    const entry = state.buffer.entries.get(r._key);
    if (entry) {
      tr.classList.add("dirty");
      if (isSiteOnlyEdit(entry)) tr.classList.add("dirty-site-only");
    }

    // A tick never selects the row: ticking twenty rows would otherwise walk the side form through twenty records.
    const tickTd = elem("td", { class: "cell-tick" });
    const tick = elem("input", { type: "checkbox" });
    tick.checked = state.ticked.has(r._key);
    tick.setAttribute("aria-label", `Tick record ${r.id}`);
    tick.addEventListener("click", (ev) => ev.stopPropagation());
    tick.addEventListener("change", () => {
      state.tickAnchor = r._key;
      if (tick.checked) state.ticked.add(r._key);
      else state.ticked.delete(r._key);
      tr.classList.toggle("ticked", tick.checked);
      onTickChange();
    });
    tickTd.append(tick);
    tr.append(tickTd);

    // Plain text: a link here made Ctrl/Shift-clicking rows open tabs.
    tr.append(elem("td", {}, String(r.id ?? r.blueprint ?? "")));
    const name = nameOf(r.id ?? r.blueprint) || "(no name)";
    tr.append(elem("td", { class: "cell-clamp", title: name }, elem("div", { class: "clamp2" }, name)));

    const detail = sourceDetail(r.source);
    const note = typeof r.notes === "string" ? r.notes.trim() : "";
    const detailTitle = note ? `${detail.title}\nData note: ${note}` : detail.title;
    const typeText = r.source?.type ? sourceTypeLabel(r.source.type) : "";
    const typeTitle = typeText ? `${typeText} (${r.source.type})` : "";
    const rest = document.createElement("template");
    rest.innerHTML =
      // Clamped to two lines because the row height is fixed for the virtualisation; the whole text is in the title.
      `<td class="cell-clamp" title="${escapeHTML(typeTitle)}"><div class="clamp2">` +
        `${escapeHTML(typeText)}</div></td>` +
      `<td class="cell-clamp cell-source-detail" title="${escapeHTML(detailTitle)}"><div class="clamp2">` +
        (note ? `<span class="note-glyph" title="This record carries a data note.">✎</span> ` : "") +
        `${escapeHTML(detail.text)}</div></td>` +
      `<td class="cell-clamp" title="${escapeHTML(formatCost(r.cost))}"><div class="clamp2">` +
        `${escapeHTML(formatCost(r.cost))}</div></td>` +
      `<td title="${escapeHTML(versionLabel(state.enums, r.availability?.version || ""))}">` +
        `${escapeHTML(r.availability?.version || "")}</td>`;
    tr.append(rest.content);

    // Shift would otherwise extend a text selection across the rows.
    tr.addEventListener("mousedown", (ev) => { if (ev.shiftKey) ev.preventDefault(); });
    // Ctrl/Cmd-click ticks one row, Shift-click ticks the range from the last row clicked; a plain click selects the row for editing.
    tr.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) return;
      if (ev.shiftKey && state.tickAnchor != null) {
        const keys = state.filtered.map((x) => x._key);
        const a = keys.indexOf(state.tickAnchor);
        const b = keys.indexOf(r._key);
        if (a !== -1 && b !== -1) {
          for (let k = Math.min(a, b); k <= Math.max(a, b); k++) {
            state.ticked.add(keys[k]);
          }
          renderTable();
          onTickChange({ rerender: false });
          return;
        }
      }
      state.tickAnchor = r._key;
      if (ev.ctrlKey || ev.metaKey) {
        if (state.ticked.has(r._key)) state.ticked.delete(r._key);
        else state.ticked.add(r._key);
        renderTable();
        onTickChange({ rerender: false });
        return;
      }
      state.selectedKey = r._key;
      state.editing = deepClone(r);
      renderTable();
      renderDetail();
    });
    tbody.append(tr);
  }

  if (last < total) tbody.append(spacerRow((total - last) * ROW_H));

  renderTickAll();
  $("#row-count").textContent =
    `${total.toLocaleString()} record${total === 1 ? "" : "s"}` +
    (state.changedOnly ? " (changed only)" : "") +
    (total > 0 ? ` - showing ${first + 1}–${last}` : "");
}

// The table is virtualised, so the header tick reads the filtered set, not the rendered rows.
function renderTickAll() {
  const all = $("#tick-all");
  if (!all) return;
  const rows = state.filtered;
  const n = rows.reduce((acc, r) => acc + (state.ticked.has(r._key) ? 1 : 0), 0);
  all.checked = rows.length > 0 && n === rows.length;
  all.indeterminate = n > 0 && n < rows.length;
}

function bindTickAll() {
  const all = $("#tick-all");
  if (!all) return;
  all.addEventListener("change", () => {
    for (const r of state.filtered) {
      if (all.checked) state.ticked.add(r._key);
      else state.ticked.delete(r._key);
    }
    renderTable();
    onTickChange({ rerender: false });
  });
}

// Re-rendering the side form on every tick would rebuild the form the contributor is filling in.
function onTickChange({ rerender = true } = {}) {
  // "Selected only" shows the ticked set, so a tick changes the table.
  if (state.selectedOnly) { applyFilters(); renderTable(); }
  const showing = !!$("#multi-edit");
  const wanted = state.ticked.size >= BATCH_MIN;
  // The batch panel shows what the ticked set shares; renderMultiEdit carries over what the contributor already set.
  if (rerender || showing || wanted || state.ticked.size === 1) renderDetail();
}

function refreshTickCount() {
  const n = state.ticked.size;
  const count = $("#multi-count");
  if (count) count.textContent = `${n} record${n === 1 ? "" : "s"} ticked`;
  const apply = $("#multi-apply");
  if (apply) apply.textContent = `Apply to these ${n} records`;
}

function spacerRow(heightPx) {
  const tr = document.createElement("tr");
  tr.className = "spacer";
  const td = document.createElement("td");
  td.colSpan = 7;
  td.style.height = `${heightPx}px`;
  td.style.padding = "0";
  td.style.border = "none";
  tr.append(td);
  return tr;
}

function bindScroller() {
  let raf = null;
  $("#scroller").addEventListener("scroll", () => {
    // Coalesce scroll events to one render per frame.
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      renderTable();
    });
  });
}

function renderDetail() {
  const host = $("#detail");
  if (!host) return;
  host.innerHTML = "";
  // Ticked rows take the pane; a single tick is not a batch and gets the ordinary editor.
  if (state.ticked.size >= BATCH_MIN) {
    renderMultiEdit(host);
    return;
  }
  state.multiDraft = state.multiBase = state.multiMixed = null;
  if (state.ticked.size === 1) {
    const [key] = state.ticked;
    if (key !== state.selectedKey && state.index.has(key)) {
      state.selectedKey = key;
      state.editing = deepClone(state.index.get(key));
      renderTable();
    }
  }
  if (!state.editing) {
    host.append(em("Select a row to edit, or click + Add new above."));
    return;
  }
  const title = state.editing._isNew
    ? "Add new record"
    : `Edit ${state.editing.id ?? state.editing.blueprint} - ${nameOf(state.editing.id ?? state.editing.blueprint)}`;
  host.append(elem("h2", {}, title));
  if (!state.editing._isNew) {
    const links = elem("p", { class: "detail-links muted" });
    const { id, blueprint } = state.editing;
    if (id != null) links.append(itemLinkAnchor(id, `#${id} on UESP`));
    if (blueprint != null) {
      if (id != null) links.append(" - ");
      links.append(itemLinkAnchor(blueprint, `recipe #${blueprint} on UESP`));
    }
    host.append(links);
  }
  if (state.editing._pairFrom) {
    host.append(elem("p", { class: "muted" }, "This adds a paired replacement. The old record remains until the maintainer reviews and removes it."));
    const original = state.index.get(state.editing._pairFrom);
    const wanted = nameOf(original.id ?? original.blueprint).toLowerCase().replace(/^(diagram|blueprint|pattern|praxis|formula|design|sketch):\s*/, "");
    const candidates = [...new Set(state.records.filter(r => original.id ? (r.blueprint && !r.id) : r.id)
      .filter(r => {
        const name = nameOf(r.id ?? r.blueprint).toLowerCase().replace(/^(diagram|blueprint|pattern|praxis|formula|design|sketch):\s*/, "");
        return wanted && name && (name === wanted || (wanted.length >= 5 && (name.includes(wanted) || wanted.includes(name))));
      }).map(r => original.id ? r.blueprint : r.id))].slice(0, 8);
    if (candidates.length) {
      host.append(elem("p", { class: "muted" }, "Possible matches by name - verify before linking:"));
      for (const id of candidates) {
        const button = elem("button", { class: "btn-mini", type: "button" }, `${nameOf(id)} #${id}`);
        button.addEventListener("click", () => {
          state.editing[original.id ? "blueprint" : "id"] = id;
          renderDetail();
        });
        host.append(button);
      }
    }
  }

  // The form mutates state.editing in place. A source.type change moves the record to another file, and live findings are refreshed in place: rebuilding the form mid-keystroke takes the focus with it.
  let formEl = null;
  const onChange = () => {
    state.editing._category = deriveCategory(state.editing, state.editing._category);
    formEl?.refreshFindings?.(editingFindings());
  };
  // The id is editable only on a new record: an update line for a changed id is addressed to the new id and silently edits another item's record. `idPrefix` keeps DOM ids from colliding with a quick-edit modal open over it.
  formEl = renderForm(state.editing, state.enums, onChange, {
    allowIdEdit: !!state.editing._isNew,
    // Puts the raw schema path in each label's title.
    partition: "open",
    // A new record has nothing to disclose progressively, so the expander would hold the whole form.
    expanderOpen: !!state.editing._isNew || detailExpanderOpen(),
    onExpanderToggle: state.editing._isNew ? null : rememberDetailExpander,
    // The Item name box starts from the game's name, and typing it back is not a change.
    knownName: state.names?.gameName(state.editing.id ?? state.editing.blueprint) || "",
    idPrefix: "adv",
    findings: editingFindings(),
    onPair: state.editing._isNew ? null : () => pairRecord(state.editing._key),
  });
  host.append(formEl);

  // Where a blocked save says what to do about it; no dialogs.
  host.append(elem("div", { class: "detail-message", id: "detail-message" }));

  const saveBtn = elem("button", { class: "btn-primary" }, "Save to the change list");
  saveBtn.addEventListener("click", () => commitEdit());
  const discardBtn = elem("button", {}, "Discard");
  discardBtn.addEventListener("click", () => {
    state.editing = state.selectedKey
      ? deepClone(state.index.get(state.selectedKey))
      : null;
    renderDetail();
  });
  let deleteBtn = null;
  if (!state.editing._isNew) {
    deleteBtn = elem("button", { class: "btn-danger" }, "Delete");
    deleteBtn.addEventListener("click", () => confirmDelete());
  }
  const row = elem("div", { class: "form-actions" }, saveBtn, discardBtn);
  if (deleteBtn) row.append(deleteBtn);
  host.append(row);
}

// Batch edit: the ticked records' agreed values fill the draft and disagreements show MIXED; applying writes only the paths moved off that draft, so an untouched control changes nothing on any record.
const BATCH_MIN = 2;

function getPath(rec, path) {
  const [a, b] = path.split(".");
  return b === undefined ? rec[a] : rec[a]?.[b];
}

function setPath(rec, path, value) {
  const [a, b] = path.split(".");
  const holder = b === undefined ? rec : (rec[a] ??= {});
  const key = b === undefined ? a : b;
  if (value === undefined) delete holder[key];
  else holder[key] = deepClone(value);
}

function batchPaths(...recs) {
  const keys = new Set();
  for (const r of recs) for (const k of Object.keys(r?.source || {})) keys.add(k);
  keys.delete("type");
  return ["source.type", ...[...keys].map((k) => `source.${k}`), "cost", "availability.version", "notes"];
}

function batchBaseline(records) {
  const draft = { id: null, source: {}, cost: [], availability: {} };
  const mixed = new Set();
  for (const path of batchPaths(...records)) {
    const values = records.map((r) => getPath(r, path));
    const same = values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]));
    if (same) setPath(draft, path, values[0]);
    else {
      mixed.add(path);
      // A price has no one-value mixed symbol: it starts empty, and an empty amount is not a change.
      setPath(draft, path, path === "cost" ? [] : MIXED);
    }
  }
  return { draft, mixed };
}

function batchTouched(draft, base) {
  return batchPaths(draft, base).filter((p) =>
    JSON.stringify(getPath(draft, p)) !== JSON.stringify(getPath(base, p)));
}

function renderMultiEdit(host) {
  const records = [...state.ticked].map((k) => state.index.get(k)).filter(Boolean);
  const { draft, mixed } = batchBaseline(records);
  // A tick changed while the panel is open: start from what the new set shares and keep what the contributor already changed.
  if (state.multiDraft && state.multiBase) {
    for (const p of batchTouched(state.multiDraft, state.multiBase)) {
      setPath(draft, p, getPath(state.multiDraft, p));
    }
  }
  state.multiBase = batchBaseline(records).draft;
  state.multiDraft = draft;
  state.multiMixed = mixed;

  host.append(elem("h2", {}, "Edit these records together"));
  const count = elem("p", { class: "muted", id: "multi-count" });
  host.append(count);
  host.append(em("Only what you change is written. A field the records " +
    "disagree on starts as \"(mixed - leave unchanged)\", and left that way " +
    "each record keeps its own. A row that would become an exact copy of a " +
    "record you already have is left alone and reported."));

  host.append(renderForm(draft, state.enums, () => {}, {
    partition: "open",
    batch: true,
    mixed,
    idPrefix: "multi",
    expanderOpen: detailExpanderOpen(),
    onExpanderToggle: rememberDetailExpander,
  }));

  host.append(elem("div", { class: "detail-message", id: "multi-message" }));

  const apply = elem("button", { class: "btn-primary", id: "multi-apply" });
  apply.addEventListener("click", () => applyMultiEdit());
  const clear = elem("button", {}, "Untick them");
  clear.addEventListener("click", () => {
    state.ticked.clear();
    renderTable();
    renderDetail();
  });
  host.append(elem("div", { class: "form-actions", id: "multi-edit" }, apply, clear));
  refreshTickCount();
}

// Per record, the same rules as commitEdit(): the validator gates it, an exact (id, source) twin blocks it, and the diff line is addressed to the file the row is in.
function applyMultiEdit() {
  const draft = state.multiDraft;
  const touched = batchTouched(draft, state.multiBase)
    .filter((p) => getPath(draft, p) !== MIXED);
  let applied = 0, unchanged = 0, duplicate = 0;
  const invalid = [];
  for (const key of [...state.ticked]) {
    const live = state.index.get(key);
    if (!live) continue;
    const before = clean(live);
    const after = deepClone(before);
    for (const p of touched) setPath(after, p, getPath(draft, p));
    if (touched.includes("source.type") && after.source.type === "ignored") {
      after.source = { type: "ignored" };
      after.cost = [];
    }
    if (JSON.stringify(before) === JSON.stringify(after)) {
      unchanged++;
      continue;
    }
    const { errors } = validateRecord(after, state.enums);
    if (errors.length) {
      invalid.push(messageFor(errors[0]));
      continue;
    }
    const { exact } = findDuplicateRecord(
      after.id, deriveCategory(after), after.source, state.records, key, after.blueprint);
    if (exact) { duplicate++; continue; }
    state.buffer.update(key, before, after, live._category);
    for (const k of Object.keys(before)) if (!(k in after)) delete live[k];
    Object.assign(live, after);
    live._category = deriveCategory(after, live._category);
    applied++;
  }

  const parts = [];
  if (applied) parts.push(`${changeCountText(applied)} saved to the change list`);
  if (unchanged) parts.push(`${unchanged} already had it`);
  if (duplicate) parts.push(`${duplicate} left alone (would repeat a record you already have)`);
  if (invalid.length) parts.push(`${invalid.length} cannot take it: ${invalid[0]}`);
  if (applied) renderDetail();
  const host = $("#multi-message");
  if (host) {
    host.innerHTML = "";
    host.className = "detail-message " +
      (applied ? "dm-ok" : (invalid.length || duplicate ? "dm-warn" : "dm-error"));
    host.append(elem("p", {}, parts.length ? parts.join(". ") + "." : "Nothing to change."));
  }
  if (applied) {
    applyFilters();
    renderTable();
    renderFooter();
  }
}

function formMessage(text, level = "error") {
  const host = $("#detail-message");
  if (!host) return;
  host.innerHTML = "";
  host.className = `detail-message dm-${level}`;
  if (text) host.append(elem("p", {}, text));
}

// The delete line carries an id and a filename and no payload, so the question quotes the record: "which one?" cannot be answered afterwards.
function confirmDelete() {
  const live = state.index.get(state.selectedKey);
  if (!live) return;
  // The live record carries any pending edit, so the question describes the buffer's `before` (the file's version, which the delete line states); the row's key and category still come from the live record.
  const pending = state.buffer.list().find(
    (e) => e.key === state.selectedKey && e.before);
  const orig = pending?.before || live;
  const host = $("#detail-message");
  if (!host) return;
  host.innerHTML = "";
  host.className = "detail-message dm-warn";
  host.append(elem("p", {}, `Delete this record? ${recordLocator(orig)}, ` +
    `${nameOf(orig.id) || "(no name)"} (#${orig.id}), ${formatCost(orig.cost)}.`));
  const yes = elem("button", { class: "btn-danger" }, "Delete it");
  const no = elem("button", {}, "Keep it");
  yes.addEventListener("click", () => {
    state.buffer.delete(state.selectedKey, clean(orig), live._category);
    state.editing = null;
    state.selectedKey = null;
    applyFilters();
    renderTable();
    renderDetail();
    renderFooter();
  });
  no.addEventListener("click", () => formMessage(""));
  host.append(elem("div", { class: "form-actions" }, yes, no));
}

// The one way this app names which record of an item is meant; the quick-edit header, the change list and the delete confirmation all read it.
// A value the type label already names is dropped: there is one luxury vendor.
function recordLocator(record) {
  const type = record?.source?.type;
  const label = type ? sourceTypeLabel(type) : "(no source)";
  const parts = sourceDetail(record?.source).parts
    .filter((v) => v && !label.includes(v));
  return parts.length ? `${label} - ${parts.join(" · ")}` : label;
}

// Findings are stated at the field they are about. validateRecord omits the same-id-different-source warning (the normal multi-source case), so it is added here, addressed to `id`.
function editingFindings() {
  const { errors, warnings } = validateRecord(state.editing, state.enums, state.records);
  if (!Number.isInteger(state.editing.id)) return { errors, warnings };
  const { sameId } = findDuplicateRecord(
    state.editing.id, state.editing._category, state.editing.source, state.records,
    state.editing._isNew ? null : state.editing._key,
  );
  if (sameId.length) {
    warnings.push({
      level: "warning", field: "id", code: "same_id_other_source",
      message: `id ${state.editing.id} already has ${sameId.length} other source(s) in ${state.editing._category} - same item, another source; check you are not duplicating`,
    });
  }
  return { errors, warnings };
}

function commitEdit() {
  const e = state.editing;
  if (e._isNew && e.source?.type !== "ignored" && isIgnoredItem(e, state.records)) {
    formMessage(ignoredMessage);
    return;
  }
  // The data file is derived from source.type on every save, so a type change here is a file change.
  e._category = deriveCategory(e, e._category || state.categories[0]);
  formMessage("");
  if (!Number.isInteger(e.id) && !Number.isInteger(e.blueprint)) {
    formMessage("Enter a furnishing ID or blueprint ID, then save.");
    return;
  }
  const { errors } = validateRecord(e, state.enums, state.records);
  if (errors.length) {
    formMessage(
      `This cannot be saved yet: ${errors.map((f) => messageFor(f)).join(" ")} ` +
      `Fix the highlighted field and save again.`,
    );
    return;
  }
  // Block only a byte-identical (id, source) record; the same id with a different source is a legitimate second record.
  const { exact } = findDuplicateRecord(
    e.id, e._category, e.source, state.records, e._isNew ? null : e._key, e.blueprint,
  );
  if (exact) {
    formMessage(
      `There is already a record exactly like this one (${recordLocator(exact)}). ` +
      `Edit that record instead, or change something about this source - the ` +
      `same item with a different source is a second record and is allowed.`,
    );
    return;
  }
  if (e._isNew) {
    if (e._pairFrom && (!e.id || !e.blueprint)) {
      formMessage("Enter both IDs to propose a paired replacement.");
      return;
    }
    const clone = deepClone(e);
    delete clone._isNew;
    if (e._pairFrom) {
      const old = clean(state.index.get(e._pairFrom));
      const note = `Paired replacement: maintainer should review removal of ${JSON.stringify({ id: old.id, blueprint: old.blueprint, source: old.source })}.`;
      clone.notes = clone.notes ? `${clone.notes}\n${note}` : note;
      delete clone._pairFrom;
    }
    state.buffer.add(clone._key, clean(clone), clone._category);
    state.records.push(clone);
    state.index.set(clone._key, clone);
    state.selectedKey = clone._key;
    state.editing = deepClone(clone);
  } else {
    const before = state.index.get(state.selectedKey);
    const after = deepClone(e);
    // Addressed to the file the row is in; the serializer emits delete + add for a source change.
    state.buffer.update(e._key, clean(before), clean(after), before._category);
    Object.assign(before, after);
  }
  state.names.setRecordName(e.id ?? e.blueprint, e.name_overrides?.en);
  applyFilters();
  renderTable();
  renderDetail();
  renderFooter();
  formMessage(`Saved. ${changeCountText()} ready to send.`, "ok");
}

function changeCountText(n = state.buffer.size()) {
  return `${n} change${n === 1 ? "" : "s"}`;
}

// Batch import

function bindBatchImport() {
  $("#btn-add-dump").addEventListener("click", () => {
    const panel = $("#adv-import");
    panel.hidden = !panel.hidden;
    $("#btn-add-dump").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("#adv-import-paste").focus();
  });
  $("#adv-import-run").addEventListener("click", () => runBatchImport());
  $("#adv-import-clear").addEventListener("click", () => {
    $("#adv-import-paste").value = "";
    $("#adv-import-status").textContent = "";
  });
}

function hasUsableSource(rec) {
  return !!(rec && rec.source && typeof rec.source === "object"
            && typeof rec.source.type === "string" && rec.source.type);
}

// A record's file is its own source.type, never a carried `_category`; `fallback` applies only when source.type is absent, which fails validation anyway.
function deriveCategory(rec, fallback) {
  return hasUsableSource(rec) ? rec.source.type : fallback;
}

// A sourceless import of a known id is a real error; of an unknown id, the rumour-fallback case.
function idKnownAnywhere(id) {
  if (!Number.isInteger(id)) return false;
  for (const r of state.records) {
    if (r.id === id) return true;
  }
  return false;
}

// JSONL is checked first because a Lua-block paste also contains `{`.
function looksLikeJSONL(text) {
  for (const ln of String(text).split(/\r?\n/)) {
    const t = ln.trim();
    if (!t) continue;
    return t.startsWith("{");
  }
  return false;
}

function runBatchImport() {
  const text = $("#adv-import-paste").value;
  const status = $("#adv-import-status");
  const targetCat = "";
  let droppedPrices = 0;
  let knownDiscoveries = 0;

  let candidates;
  const parseErrors = [];
  if (looksLikeJSONL(text)) {
    candidates = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      let obj;
      try {
        obj = JSON.parse(t);
      } catch (err) {
        parseErrors.push({ lineNo: i + 1, message: `not valid JSON - ${err.message}` });
        continue;
      }
      if (obj?.format !== undefined) {
        try {
          const discovery = parseDiscovery(obj);
          candidates.push({ ...discovery, category: "rumour", sourceName: null, lineNo: i + 1 });
        } catch (err) {
          parseErrors.push({ lineNo: i + 1, message: err.message });
        }
        continue;
      }
      const cat = deriveCategory(obj, targetCat);
      candidates.push({ record: obj, category: cat, sourceName: null, lineNo: i + 1 });
    }
  } else {
    // A dump has no source, so each block becomes a rumour record, which carries no cost: prices are dropped and counted. The version is the newest patch this data set knows.
    const blocks = parseLuaBlocks(text);
    candidates = [];
    for (const b of blocks) {
      if (b.error) {
        parseErrors.push({ lineNo: b.lineNo, message: b.error });
        continue;
      }
      if (b.price != null) droppedPrices++;
      const rec = {
        id: b.id,
        source: { type: "rumour" },
        cost: [],
        availability: { version: latestVersion(state.enums) },
      };
      candidates.push({
        record: rec, category: "rumour", sourceName: b.comment || null,
        lineNo: b.lineNo, rumourFallback: true,
      });
    }
  }

  if (candidates.length === 0 && parseErrors.length === 0) {
    status.textContent = "nothing to import - paste at least one record.";
    return;
  }

  let imported = 0;
  let updated = 0;
  let ignored = 0;
  let rumoured = 0;
  const warnLines = [];
  const errorLines = [...parseErrors.map((e) => `line ${e.lineNo}: ${e.message}`)];

  for (const c of candidates) {
    let rec = c.record;
    if (rec.source?.type !== "ignored" && isIgnoredItem(rec, state.records)) {
      ignored++;
      continue;
    }
    if (c.reference && discoveryKnown(rec, state.records)) {
      knownDiscoveries++;
      continue;
    }
    const where = `line ${c.lineNo} (id ${rec.id ?? "?"})`;

    if (Number.isInteger(rec.id) && c.sourceName) {
      state.names.addOverride(rec.id, c.sourceName);
    }

    // Only a genuinely unknown id falls back to a rumour record; a known id with a missing source is a real input error and fails validation below.
    if (Number.isInteger(rec.id) && !hasUsableSource(rec)
        && !idKnownAnywhere(rec.id)) {
      rec = {
        id: rec.id,
        source: { type: "rumour" },
        cost: [],
        availability: {
          version: rec.availability?.version || "NONE",
        },
      };
      c.category = "rumour";
      c.rumourFallback = true;
      warnLines.push(`${where}: no known source - imported as a rumour record`);
    }

    if (!c.category) {
      errorLines.push(`${where}: no category - pick a target category`);
      continue;
    }

    const { errors, warnings } = validateRecord(rec, state.enums);
    if (errors.length) {
      errorLines.push(`${where}: ${errors.map((f) => messageFor(f)).join(" ")}`);
      continue;
    }
    for (const w of warnings) warnLines.push(`${where}: ${messageFor(w)}`);

    // An exact (id, source) match re-states that record as an update; a same-id-different-source paste is a new record. Never a hard block here.
    const { exact: existing } = findDuplicateRecord(
      rec.id, c.category, rec.source, state.records, undefined, rec.blueprint);
    const cleanRec = clean(rec);
    if (existing) {
      state.buffer.update(existing._key, clean(existing), cleanRec, c.category);
      Object.assign(existing, cleanRec);
      updated++;
    } else {
      const key = newKey(c.category);
      const live = { ...cleanRec, _category: c.category, _key: key };
      state.buffer.add(key, cleanRec, c.category);
      if (c.reference) {
        state.buffer.references.set(key, c.reference);
        referenceData.addDiscovery(c.reference.meta, rec.blueprint);
        state.names.addOverride(rec.id, c.reference.meta.name);
        if (rec.blueprint) state.names.addOverride(rec.blueprint, c.reference.meta.name);
      }
      state.records.push(live);
      state.index.set(key, live);
      imported++;
      if (c.rumourFallback) rumoured++;
    }
  }

  const parts = [`${imported} added`, `${updated} updated`];
  if (ignored) parts.push(`${ignored} ignored (skipped)`);
  if (knownDiscoveries) parts.push(`${knownDiscoveries} already catalogued (skipped)`);
  if (rumoured) parts.push(`${rumoured} as ${sourceTypeLabel("rumour")} (no source yet)`);
  if (droppedPrices) {
    parts.push(`${droppedPrices} price(s) left out (a record with no source carries none)`);
  }
  if (warnLines.length) parts.push(`${warnLines.length} warning(s)`);
  if (errorLines.length) parts.push(`${errorLines.length} error(s)`);
  status.textContent = parts.join(" · ") + ".";
  if (errorLines.length || warnLines.length) {
    console.warn("batch import - errors:", errorLines, "warnings:", warnLines);
    status.textContent += " See console for details.";
  }

  if (imported > 0 || updated > 0) {
    state.changedOnly = true;
    const cb = $("#filter-changed");
    if (cb) cb.checked = true;
    refilter();
    renderFooter();
  }
}

// Shared footer + submit modal
function renderFooter() {
  const n = state.buffer.size();
  let txt = n === 0 ? "Nothing to send yet." : `${changeCountText(n)} ready`;
  $("#pending-count").textContent = txt;
  $("#btn-submit").hidden = n === 0;
  $("#btn-submit").disabled = n === 0;
  renderChangedCount();
}

// Counts the loaded rows the filter would leave, not buffer.size(), which also counts entries with no loaded row behind them. Blank at zero.
function renderChangedCount() {
  const el = $("#changed-count");
  if (!el) return;             // advanced panel not yet rendered
  const n = state.records.reduce(
    (acc, r) => acc + (state.buffer.entries.has(r._key) ? 1 : 0), 0);
  el.textContent = n === 0 ? "" : `(${n})`;
}

function bindSubmit() {
  $("#btn-submit").addEventListener("click", () => openSubmitModal());
  $("#modal-close").addEventListener("click", () => closeSubmitModal());
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeSubmitModal();
  });
  bindDiscard();
}

// Discarding reloads rather than emptying the buffer: every mask mirrors its edits into the loaded records, and the unpersisted buffer is the only copy of what they looked like before.
function bindDiscard() {
  const trigger = $("#modal-discard");
  const ask = $("#modal-discard-ask");
  if (!trigger || !ask) return;
  const hideAsk = () => { ask.hidden = true; trigger.hidden = false; };
  trigger.addEventListener("click", () => {
    $("#modal-discard-question").textContent =
      `Discard all ${changeCountText()} and start over?`;
    trigger.hidden = true;
    ask.hidden = false;
  });
  $("#modal-discard-no").addEventListener("click", hideAsk);
  $("#modal-edit-changes")?.addEventListener("click", () => {
    closeSubmitModal();
    hideAsk();
    switchMask("advanced");
    rememberTab("advanced");
    setBatchFilters({ changedOnly: true });
    refilter();
  });
  $("#modal-discard-yes").addEventListener("click", () => {
    state.buffer.clear();
    renderFooter();
    closeSubmitModal();
    hideAsk();
    location.reload();
  });
}

function openSubmitModal() {
  if (state.buffer.size() === 0) return;
  const title = suggestTitle(state.buffer);
  // The raw box holds the whole issue body, so the manual path files the same issue as the GitHub link.
  const issueBody = buildIssueBody(state.buffer, title, state.records, maskDeps());
  $("#modal-summary").textContent = title;
  $("#modal-diff").textContent = issueBody;

  renderChangeListInto($("#modal-changelist"));

  const { errors, warnings } = validateBuffer(state.buffer, state.enums, state.records);
  const vHost = $("#modal-validation");
  vHost.innerHTML = "";
  if (errors) {
    vHost.append(elem("span", { class: "v-error" },
      `${changeCountText(errors)} cannot be sent yet - open it and fix the highlighted field.`));
  } else if (warnings) {
    vHost.append(elem("span", { class: "v-warning" },
      `${changeCountText(warnings)} to look over before sending.`));
  } else {
    vHost.append(elem("span", { class: "v-ok" }, "Looks good."));
  }

  const blocked = errors > 0;
  const issueURL = buildIssueURL(state.buffer, undefined, state.records, maskDeps());
  const tooManyForALink = issueURL.length > MAX_ISSUE_URL_LENGTH;
  const openBtn = $("#modal-open-issue");
  const copyBtn = $("#modal-copy");
  const oversize = $("#modal-oversize");
  oversize.hidden = true;
  openBtn.textContent = "Send using GitHub";
  if (blocked) {
    openBtn.classList.add("is-disabled");
    openBtn.removeAttribute("href");
    openBtn.setAttribute("aria-disabled", "true");
  } else {
    openBtn.classList.remove("is-disabled");
    openBtn.removeAttribute("aria-disabled");
    // Too long for a URL: the button explains the two-step way instead of opening a truncated issue.
    if (tooManyForALink) openBtn.removeAttribute("href");
    else openBtn.href = issueURL;
  }
  openBtn.onclick = (e) => {
    if (blocked || !tooManyForALink) return;
    e.preventDefault();
    oversize.hidden = false;
    $("#modal-oversize-copy").focus();
  };
  // The blank issue still carries the title and label, which fit in a URL; only the body is pasted.
  $("#modal-oversize-open").href = `https://github.com/${ISSUE_REPO}/issues/new?` +
    new URLSearchParams({ title: suggestTitle(state.buffer), labels: "db-edit" }).toString();

  const copyInto = (btn) => () => {
    navigator.clipboard?.writeText(issueBody).then(
      () => (btn.textContent = "Copied!"),
      () => (btn.textContent = "Copy failed (use Ctrl+C from the raw data)"),
    );
    setTimeout(() => (btn.textContent = "Copy to clipboard"), 2000);
  };
  copyBtn.onclick = copyInto(copyBtn);
  $("#modal-oversize-copy").onclick = copyInto($("#modal-oversize-copy"));
  $("#modal").classList.add("open");
}

// changelist.js loads lazily, so the host is filled asynchronously.
function renderChangeListInto(host) {
  if (!host) return;
  host.innerHTML = "";
  importOptional("./changelist.js").then((mod) => {
    if (!mod || typeof mod.renderChangeList !== "function") return;
    if (!$("#modal").classList.contains("open")) return;   // closed meanwhile
    const out = mod.renderChangeList(state.buffer, maskDeps());
    host.innerHTML = "";
    if (out instanceof Node) host.append(out);
    else if (typeof out === "string") host.innerHTML = out;
  });
}

function closeSubmitModal() {
  $("#modal").classList.remove("open");
}

// What a module-defined mask receives in place of this module's closures. No mask gets a private buffer or record set: every mask feeds the one Review & Submit flow.
function maskDeps() {
  return {
    state,
    get CATEGORIES() { return state.categories; },
    $, elem, escapeHTML, fillSelect, fillSelectPairs,
    nameOf,
    newKey,
    renderForm,
    validateRecord, findDuplicateRecord,
    messageFor,
    itemLinkAnchor, itemIconImg,
    applyFilters, renderFooter,
    openQuickEdit,
    // Find an item's detail list, the modal header's "record N of M" and Crown Store's "also:" note must agree, so they all read this.
    recordsForItem: (id) => recordsForItem(state.records, id, state.enums),
    recordLocator, sourceDetail,
    switchToBatchEdit, pairRecord,
    switchToBrowse,
    // Without it the Crown Store panels' "Send now" is a silent no-op.
    openSubmitModal,
    addRecordForItem,
    onRefDataShard: (fn) => referenceData.onShardLoaded(fn),
    // A crafted record is keyed by the blueprint, whose id names nothing a player recognises, so a mask showing an id asks this first.
    craftedItem: (id) => referenceData.resultOf(id),
  };
}

function switchToBrowse(filter) {
  switchMask("browse");
  rememberTab("browse");
  if (filter && browse && typeof browse.focus === "function") browse.focus(filter);
}

// Pre-filtered to the record's id, so it lands on the few rows the item owns rather than on thousands.
function switchToBatchEdit(key) {
  const rec = state.index.get(key);
  switchMask("advanced");
  rememberTab("advanced");
  if (!rec) return;
  setBatchFilters({ search: String(rec.id ?? rec.blueprint ?? "") });
  state.selectedKey = key;
  state.editing = deepClone(rec);
  applyFilters();
  renderTable();
  renderDetail();
  const idx = state.filtered.findIndex((r) => r._key === key);
  const scroller = $("#scroller");
  if (idx >= 0 && scroller) {
    scroller.scrollTop = Math.max(0, idx * ROW_H - 100);
    renderTable();
  }
}

function pairRecord(key) {
  const original = state.index.get(key);
  if (!original) return;
  switchMask("advanced");
  rememberTab("advanced");
  state.ticked.clear();
  state.selectedKey = null;
  state.editing = { ...deepClone(original), _key: newKey(original._category), _isNew: true, _pairFrom: key };
  renderDetail();
}

function addRecordForItem(id, sourceType) {
  const ignored = state.records.find((r) => r.id === id && r.source?.type === "ignored");
  if (ignored) {
    switchToBatchEdit(ignored._key);
    return;
  }
  switchMask("advanced");
  rememberTab("advanced");
  setBatchFilters({ search: Number.isInteger(id) ? String(id) : "" });
  applyFilters();
  renderTable();
  addNewRecord({ id, sourceType });
}

// State and widgets together: they drifted apart whenever one was updated alone.
function setBatchFilters({ search = "", sourceType = "", version = "", changedOnly = false } = {}) {
  state.search = search.toLowerCase();
  state.sourceType = sourceType;
  state.version = version;
  state.changedOnly = changedOnly;
  state.selectedOnly = false;
  const fsel = $("#filter-selected"); if (fsel) fsel.checked = false;
  const s = $("#search");           if (s) s.value = search;
  const sc = $("#search-clear");    if (sc) sc.hidden = !search;
  const ft = $("#filter-type");     if (ft) ft.value = sourceType;
  const fv = $("#filter-version");  if (fv) fv.value = version;
  const fch = $("#filter-changed"); if (fch) fch.checked = changedOnly;
}

function nameOf(id) {
  return state.names ? state.names.get(id) : "";
}

function elem(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

function em(text) {
  return elem("p", { class: "muted" }, text);
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// `800` against `8000` is invisible, `800 Crowns` against `8,000 Crowns` is not.
function formatCost(cost) {
  if (!cost || cost.length === 0) return "-";
  return cost.map((c) => {
    const amount = Number.isFinite(c.amount) ? c.amount.toLocaleString() : String(c.amount ?? "");
    return `${amount} ${valueLabel("currencies", c.currency)}`.trim();
  }).join(" / ");
}

// An add or a delete is never site-only, whatever it carries, because the whole record ships.
function isSiteOnlyEdit(entry) {
  if (!entry || entry.op !== "update" || !entry.before || !entry.after) return false;
  const keys = new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]);
  let touched = 0;
  for (const k of keys) {
    if (k.startsWith("_")) continue;
    if (JSON.stringify(entry.before[k]) === JSON.stringify(entry.after[k])) continue;
    if (!SITE_ONLY_FIELDS.includes(k)) return false;
    touched++;
  }
  return touched > 0;
}

// Mirrors diff.js clean, kept local to avoid an extra import.
function clean(record) {
  const o = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith("_")) o[k] = v;
  }
  return o;
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

init();
