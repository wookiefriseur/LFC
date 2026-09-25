// The "Crown crate update" mask: adds a whole crate season as crown_crate records. A crate item has no price of its own (the crate is what is bought), so `cost` is always empty; crate contents cannot be dumped from the game, so items are typed one at a time.

import { successPanelText } from "./luxury.js";
import {
  versionsDesc, versionLabel, cratesDesc, crateLabel, latestVersion, entryOf,
} from "./data.js";
import { labelFor, tipFor, NOT_IN_GAME_DATA } from "./lexicon.js";
import { queueEnumValue, nextFreeIntFor } from "./maintenance.js";
import { itemSearch } from "./crown-store.js";

// The composite dup check namespaces by category: the same id under another source type, or in a different crate, is a separate record, not a duplicate.
export const CRATE_CATEGORY = "crown_crate";

// An item may be re-issued in a later crate, so only (id + crate) together identify a row.
export function crateKey(id, crate) {
  return `${id}|${crate}`;
}

const ITEM_LINK_RE = /\|H\d*:item:(\d+):/i;

function parseIntLoose(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[\s,._]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one manual-entry line into a token record. Never throws.
 * Accepted shapes (one item per line):
 *   220369                          itemId alone
 *   220369, Sweetroll Display       itemId, name
 *   220369, 400                     itemId, number
 *   220369, 400, Sweetroll Display  itemId, number, name
 *   |H1:item:220369:...|h|h         a full ESO item link (optional trailing number)
 * Separators: comma / semicolon / tab / whitespace. `--` / `#` comment lines and trailing `--...` / `#...` are stripped.
 */
function parseLine(raw, lineNo) {
  const out = { lineNo, raw, id: null, price: null, comment: "", error: null };
  let line = raw.trim();
  if (!line) return null;
  if (line.startsWith("--") || line.startsWith("#")) return null;

  const cm = line.match(/\s+(--|#)\s*(.*)$/);
  if (cm) {
    out.comment = cm[2].trim();
    line = line.slice(0, cm.index).trim();
  }

  const link = line.match(ITEM_LINK_RE);
  if (link) {
    out.id = parseInt(link[1], 10);
    const after = line.slice(line.indexOf("|h|h") + 4) || "";
    const priceTok = (after.match(/\d[\d\s,._]*/) || [])[0];
    if (priceTok != null) out.price = parseIntLoose(priceTok);
    if (!Number.isInteger(out.id) || out.id < 1) {
      out.error = "could not read itemId from item link";
    }
    return out;
  }

  const parts = line.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  out.id = parseIntLoose(parts[0]);
  if (out.id == null || out.id < 1) {
    out.error = `unrecognised line - expected "itemId" or "itemId, name", got "${raw.trim()}"`;
    return out;
  }
  if (parts.length >= 2) {
    // A 2nd numeric token is taken as a number; anything else is a name/comment.
    const asPrice = parseIntLoose(parts[1]);
    if (asPrice != null) {
      out.price = asPrice;
      if (parts.length >= 3 && !out.comment) out.comment = parts.slice(2).join(" ");
    } else if (!out.comment) {
      out.comment = parts.slice(1).join(" ");
    }
  }
  return out;
}

export const CRATE_ACTION = {
  NEW: "NEW",                       // no record for (id + this crate) - add
  EXISTS: "ALREADY EXISTS",         // (id + this crate) already exists
  WARN: "WARN",                     // parse error / bad id / duplicate in list
};

/**
 * Build the crown-crate add-plan from the items entered so far.
 * A row is EXISTS (skipped) only when a record for (id + this crate) already exists, in the loaded data or earlier in this list; the same item in a different crate is a second legitimate source and stays NEW with a note. A number typed after the id is reported back rather than stored.
 * @param {Set<string>} opts.existingCrateKeys  `crateKey(id, crate)` of every loaded crown-crate record (the hard block)
 * @param {Set<number>} [opts.existingCrateIds]  ids with a crown-crate record in any crate (informational only)
 */
export function computeCratePlan(parsedRows, opts) {
  const { crate, version, existingCrateKeys, existingCrateIds } = opts;
  const plan = [];
  const seenInList = new Set();

  for (const row of parsedRows) {
    const entry = { row, id: row.id, action: null, record: null, messages: [] };

    if (row.error) {
      entry.action = CRATE_ACTION.WARN;
      entry.messages.push(row.error);
      plan.push(entry);
      continue;
    }
    if (!Number.isInteger(row.id) || row.id < 1) {
      entry.action = CRATE_ACTION.WARN;
      entry.messages.push("no usable itemId on this line");
      plan.push(entry);
      continue;
    }

    // A second number after the id is not a price, so it is reported rather than stored or folded into the name.
    if (row.ignoredNumber != null) {
      entry.messages.push(
        `"${row.ignoredNumber}" ignored - a crate item has no price of its ` +
        `own, the crate is what is bought`);
    }

    if (seenInList.has(row.id)) {
      entry.action = CRATE_ACTION.WARN;
      entry.messages.push(`id ${row.id} is already on this list`);
      plan.push(entry);
      continue;
    }
    seenInList.add(row.id);

    if (existingCrateKeys && existingCrateKeys.has(crateKey(row.id, crate))) {
      entry.action = CRATE_ACTION.EXISTS;
      entry.messages.push(
        `id ${row.id} is already recorded in crate ${crate} - skipped ` +
        `(edit that record in Batch edit instead)`,
      );
      plan.push(entry);
      continue;
    }

    // Same item in a different crate: a legitimate second source, noted so a mis-picked crate is still noticed.
    if (existingCrateIds && existingCrateIds.has(row.id)) {
      entry.messages.push(
        `id ${row.id} already has a crown_crate record in another crate - ` +
        `adding it to ${crate} is a second source; check the crate is right`,
      );
    }

    entry.action = CRATE_ACTION.NEW;
    entry.record = {
      id: row.id,
      source: { type: "crown_crate", crate },
      cost: [],                    // always: the crate is what is bought
      availability: { version },
    };
    plan.push(entry);
  }
  return plan;
}

// DOM: `deps` is the interface app.js hands every mask.

const CRATE_BADGE_CLASS = {
  [CRATE_ACTION.NEW]: "b-new",
  [CRATE_ACTION.EXISTS]: "b-resale",
  [CRATE_ACTION.WARN]: "b-warn",
};

/** The "Crate seasons" subtab of the Crown Store mask. */
export function crownCrateMask(deps) {
  const {
    state, $, fillSelectPairs, elem, escapeHTML, validateRecord,
    findDuplicateRecord, newKey, itemLinkAnchor, itemIconImg, nameOf,
    applyFilters, renderFooter,
  } = deps;

  // (id + crate) keys of every crown_crate record loaded or added this session: the namespace the mask blocks on.
  function buildCrateKeySet() {
    const s = new Set();
    for (const r of state.records) {
      if (r._category === CRATE_CATEGORY && r.source) {
        s.add(crateKey(r.id, r.source.crate));
      }
    }
    return s;
  }
  // Ids that have a crown_crate record in ANY crate - informational only.
  function buildKnownCrownCrateIdSet() {
    const s = new Set();
    for (const r of state.records) {
      if (r.source && r.source.type === "crown_crate") s.add(r.id);
    }
    return s;
  }

  // Rebuilt from the live vocabulary, which grows while the screen is open. Newest season first, so a dateless crate sorts to the top. A crate the library does not define is labelled as such and never the default, but stays selectable so the broken data stays visible.
  function fillCrateOptions(select) {
    const options = cratesDesc(state.enums).map((c) => {
      const meta = entryOf(state.enums, "crates", c.symbol) || {};
      const broken = meta.undefined_in_library === true
        || ("crate" in meta && meta.crate == null);
      return {
        value: c.symbol,
        label: crateLabel(state.enums, c.symbol) + (broken ? NOT_IN_GAME_DATA : ""),
        broken,
      };
    });
    fillSelectPairs("#crate-crate",
      options.map(({ value, label }) => ({ value, label })));
    const want = select || (options.find((o) => !o.broken) || options[0])?.value;
    if (want) $("#crate-crate").value = want;
  }

  function render(container) {
    container.innerHTML = `
      <section class="crate-mask">
        <div class="crate-head">
          <div class="crate-head-text">
            <h2>Add a Crown Crate season</h2>
            <p class="muted">
              A new Crown Crate ships a batch of furnishings at once. Crate
              contents cannot be dumped out of the game, so they are entered by
              hand: pick the crate - adding it here if it is new - then list its
              items one at a time.
            </p>
          </div>
        </div>

        <ol class="lux-steps">
          <li class="lux-step">
            <div class="lux-step-head"><span class="lux-step-num">1</span>
              <h3>Which crate?</h3></div>
            <div class="luxury-controls">
              <label class="lc-field">
                <span title="${escapeHTML(tipFor("source.crate"))}">${escapeHTML(labelFor("source.crate"))}</span>
                <span class="crate-pick">
                  <select id="crate-crate"></select>
                  <button id="crate-new-open" type="button">New crate</button>
                </span>
                <small class="muted">Every item you list is filed under this season.</small>
              </label>
              <label class="lc-field">
                <span title="${escapeHTML(tipFor("availability.version"))}">Game update</span>
                <select id="crate-version"></select>
                <small class="muted">The update the season launched in - applies to every item.</small>
              </label>
            </div>

            <div id="crate-new" class="crate-new" hidden>
              <div class="luxury-controls">
                <label class="lc-field">
                  <span>Crate name</span>
                  <input id="crate-new-name" type="text" placeholder="e.g. Wild Hunt">
                  <small class="muted" id="crate-new-symbol">Recorded as -</small>
                </label>
                <label class="lc-field">
                  <span>Crown crate id</span>
                  <input id="crate-new-id" type="number" min="1">
                  <small class="muted">What <code>GetCrownCrateName(N)</code> answers to. Prefilled with the next free one.</small>
                </label>
                <label class="lc-field">
                  <span>Season</span>
                  <input id="crate-new-season" type="text" placeholder="2026-06">
                  <small class="muted">The month it opened, <code>YYYY-MM</code>. Leave blank if it is not announced.</small>
                </label>
              </div>
              <div class="lux-actions">
                <button id="crate-new-add" class="btn-primary">Add this crate</button>
                <button id="crate-new-cancel">Cancel</button>
                <span id="crate-new-status" class="muted"></span>
              </div>
            </div>
          </li>

          <li class="lux-step">
            <div class="lux-step-head"><span class="lux-step-num">2</span>
              <h3>What is in it?</h3></div>
            <div class="crate-entry">
              <label class="lc-field">
                <span>Item</span>
                <input id="crate-item" type="text" autocomplete="off"
                       placeholder="item number, or number and name">
                <small class="muted">Search by name or number and pick a match,
                  or type the number (an item link pasted from the game works
                  too). Press Enter to add it and keep typing.</small>
                <ul id="crate-matches" class="cstore-matches"></ul>
              </label>
              <button id="crate-add" class="btn-primary">Add to the list</button>
              <button id="crate-clear">Start the list again</button>
              <span id="crate-status" class="muted"></span>
            </div>
          </li>

          <li class="lux-step">
            <div class="lux-step-head"><span class="lux-step-num">3</span>
              <h3>Check &amp; add</h3></div>
            <p id="crate-step3-hint" class="muted">The items you add appear here.</p>
            <div id="crate-preview-wrap" class="lux-preview-wrap" hidden>
              <div class="lux-preview-head">
                <h3>The list so far</h3>
                <label class="lc-checkbox lc-icons">
                  <input id="crate-show-icons" type="checkbox">
                  <span>Show item icons</span>
                </label>
              </div>
              <table class="lux-preview">
                <thead>
                  <tr><th>icon</th><th>id</th><th>name</th><th>${escapeHTML(labelFor("source.crate"))}</th><th>action</th><th>notes</th><th></th></tr>
                </thead>
                <tbody id="crate-preview-body"></tbody>
              </table>
              <div class="lux-commit-row">
                <button id="crate-commit" class="btn-primary">Add these items to the change list</button>
                <span id="crate-commit-status" class="muted"></span>
              </div>
            </div>
          </li>
        </ol>

        <div id="crate-success" class="lux-success" hidden>
          <div class="lux-success-msg"><span class="lux-success-tick">✓</span>
            <span id="crate-success-text"></span></div>
          <div class="lux-success-actions">
            <button id="crate-success-send" class="btn-primary">Send now</button>
            <button id="crate-success-more">Keep adding</button>
          </div>
        </div>
      </section>`;

    fillCrateOptions();
    fillSelectPairs("#crate-version",
      versionsDesc(state.enums).map((v) => ({
        value: v.symbol, label: versionLabel(state.enums, v.symbol),
      })));
    $("#crate-version").value = latestVersion(state.enums);

    $("#crate-add").addEventListener("click", () => addOneItem());
    bindItemSearch();
    $("#crate-clear").addEventListener("click", () => {
      crateRows = [];
      $("#crate-item").value = "";
      $("#crate-preview-wrap").hidden = true;
      $("#crate-step3-hint").hidden = false;
      $("#crate-status").textContent = "";
      state.cratePlan = null;
    });
    $("#crate-commit").addEventListener("click", () => commitPlan());
    $("#crate-success-send").addEventListener("click", () => {
      if (typeof deps.openSubmitModal === "function") deps.openSubmitModal();
    });
    $("#crate-success-more").addEventListener("click", () => {
      $("#crate-success").hidden = true;
      $("#crate-item").focus();
    });
    // Changing the crate re-files every item already listed, rather than making the list be typed again.
    $("#crate-crate").addEventListener("change", () => { if (crateRows.length) replan(); });
    $("#crate-version").addEventListener("change", () => { if (crateRows.length) replan(); });
    bindNewCrate();
    $("#crate-show-icons").addEventListener("change", (e) => {
      state.crateShowIcons = e.target.checked;
      if (state.cratePlan) renderPreview();
    });
  }

  // Items entered so far. The plan is recomputed from the whole list on every change, so the duplicate rules hold whatever order the items were typed in.
  let crateRows = [];

  // Step 2: item search, shared with the Prices loop
  const searchItems = itemSearch(state, nameOf);
  let matches = [];
  let activeMatch = -1;

  function bindItemSearch() {
    const input = $("#crate-item");
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // A typed "id, name" or a pasted link is the item already, not a search.
        const raw = input.value;
        matches = /[,|\[]/.test(raw) ? [] : searchItems(raw);
        activeMatch = -1;
        renderMatches();
      }, 120);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!matches.length) return;
        e.preventDefault();
        activeMatch = (activeMatch + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        renderMatches();
        $(`#crate-match-${activeMatch}`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        // A highlighted match wins; otherwise a typed number is the item itself and a typed name takes its first match.
        const q = input.value.trim();
        // Enter can beat the debounce; search now rather than miss the name.
        if (activeMatch < 0 && q && !/^\d+$/.test(q) && !/[,|\[]/.test(q)) matches = searchItems(q);
        const pick = matches[activeMatch] ?? (/^\d+$/.test(q) ? null : matches[0]);
        if (pick) pickMatch(pick); else addOneItem();
      } else if (e.key === "Escape") {
        input.value = "";
        matches = [];
        renderMatches();
      }
    });
  }

  function renderMatches() {
    const ul = $("#crate-matches");
    ul.innerHTML = "";
    const crate = $("#crate-crate").value;
    const inThis = buildCrateKeySet();
    const inAny = buildKnownCrownCrateIdSet();
    matches.forEach((c, i) => {
      const li = elem("li", {
        id: `crate-match-${i}`,
        class: "cstore-match" + (i === activeMatch ? " is-active" : ""),
      });
      li.append(itemIconImg(c.id, c.name || `item ${c.id}`));
      const txt = elem("span", { class: "cstore-match-txt" });
      txt.append(elem("span", { class: "cstore-match-name" }, c.name || "(no name)"));
      txt.append(elem("span", { class: "cstore-match-id muted" }, `#${c.id}`));
      li.append(txt);
      if (inThis.has(crateKey(c.id, crate))) {
        li.append(elem("span", { class: "cstore-match-has" }, "already in this crate"));
      } else if (inAny.has(c.id)) {
        li.append(elem("span", { class: "cstore-match-has" }, "in another crate"));
      }
      li.addEventListener("click", () => pickMatch(c));
      ul.append(li);
    });
  }

  function pickMatch(c) {
    $("#crate-item").value = c.name ? `${c.id}, ${c.name}` : String(c.id);
    matches = [];
    renderMatches();
    addOneItem();
  }

  function addOneItem() {
    const raw = $("#crate-item").value;
    const row = parseOneItem(raw);
    if (!row) {
      $("#crate-status").textContent = "type an item number first.";
      return;
    }
    if (row.error) {
      $("#crate-status").textContent = row.error;
      return;
    }
    // A typed name is a display-only fallback for ids the names file misses; it is never written into record data.
    if (Number.isInteger(row.id) && row.comment) {
      state.names.addOverride(row.id, row.comment);
    }
    crateRows.push(row);
    $("#crate-item").value = "";
    $("#crate-item").focus();
    replan();
  }

  // Any price token is discarded: a crate item has no price of its own.
  function parseOneItem(raw) {
    const row = parseLine(String(raw || ""), crateRows.length + 1);
    if (!row) return null;
    if (row.price != null) {
      row.ignoredNumber = row.price;
      row.price = null;
    }
    return row;
  }

  function replan() {
    const crate = $("#crate-crate").value;
    const version = $("#crate-version").value;
    state.cratePlan = computeCratePlan(crateRows, {
      crate, version,
      existingCrateKeys: buildCrateKeySet(),
      existingCrateIds: buildKnownCrownCrateIdSet(),
    });
    renderPreview();
  }

  // Adding the crate itself
  function crateSymbolFor(name) {
    return String(name || "").toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^[^A-Z]+/, "")
      .replace(/_+$/, "");
  }

  function bindNewCrate() {
    const open = $("#crate-new-open");
    const box = $("#crate-new");
    const nameEl = $("#crate-new-name");
    const idEl = $("#crate-new-id");
    const seasonEl = $("#crate-new-season");
    const status = $("#crate-new-status");
    const close = () => {
      box.hidden = true;
      status.textContent = "";
      status.className = "muted";
    };

    open.addEventListener("click", () => {
      box.hidden = false;
      nameEl.value = "";
      seasonEl.value = "";
      idEl.value = String(nextFreeIntFor(state.enums, "crates", "crate"));
      $("#crate-new-symbol").textContent = "Recorded as -";
      nameEl.focus();
    });
    $("#crate-new-cancel").addEventListener("click", () => close());
    nameEl.addEventListener("input", () => {
      const sym = crateSymbolFor(nameEl.value);
      $("#crate-new-symbol").textContent = sym ? `Recorded as ${sym}` : "Recorded as -";
    });
    $("#crate-new-add").addEventListener("click", () => {
      const name = nameEl.value.trim();
      const symbol = crateSymbolFor(name);
      const setErr = (msg) => { status.textContent = msg; status.className = "v-error"; };
      if (!name) return setErr("the crate needs a name.");
      if (!symbol) return setErr("that name gives no usable code word - it has to start with a letter.");
      const crateId = parseInt(idEl.value, 10);
      if (!Number.isInteger(crateId) || crateId < 1) return setErr("the crown crate id has to be a whole number.");
      const season = seasonEl.value.trim();
      if (season && !/^\d{4}-\d{2}$/.test(season)) return setErr('the season is a month, written "YYYY-MM".');

      const meta = { crate: crateId, name };
      if (season) meta.season = season;
      const res = queueEnumValue(state, "crates", symbol, meta);
      if (!res.ok) return setErr(res.error);

      // The word is usable at once: refill the picker and select it.
      fillCrateOptions(symbol);
      renderFooter();
      if (crateRows.length) replan();
      close();
      $("#crate-status").textContent =
        `${name} added - it goes with this submission. Now list its items.`;
      $("#crate-item").focus();
    });
  }

  function renderPreview() {
    const plan = state.cratePlan || [];
    const body = $("#crate-preview-body");
    body.innerHTML = "";

    for (const p of plan) {
      const tr = document.createElement("tr");
      if (p.action === CRATE_ACTION.WARN) tr.className = "lux-warn";

      const iconTd = elem("td");
      if (state.crateShowIcons && Number.isInteger(p.id)) {
        iconTd.append(itemIconImg(p.id, nameOf(p.id) || `item ${p.id}`));
      } else {
        iconTd.textContent = "-";
      }
      tr.append(iconTd);

      const idTd = elem("td");
      if (Number.isInteger(p.id)) idTd.append(itemLinkAnchor(p.id, p.id));
      else idTd.textContent = "?";
      tr.append(idTd);

      const nameTd = elem("td", { class: "lux-name" });
      if (Number.isInteger(p.id)) {
        nameTd.append(itemLinkAnchor(p.id, nameOf(p.id) || "(no name)"));
      } else {
        nameTd.textContent = "-";
      }
      tr.append(nameTd);

      tr.append(elem("td", {}, p.record ? p.record.source.crate : "-"));

      const actTd = elem("td");
      const cls = CRATE_BADGE_CLASS[p.action] || "b-warn";
      actTd.append(elem("span", { class: `lux-badge ${cls}` }, p.action));
      tr.append(actTd);

      tr.append(elem("td", { class: "lux-notes" }, p.messages.join(" · ")));

      const dropTd = elem("td", { class: "crate-drop" });
      const drop = elem("button", { class: "linklike", type: "button" }, "remove");
      drop.setAttribute("aria-label", `Remove ${p.id ?? "this line"} from the list`);
      drop.addEventListener("click", () => {
        const at = crateRows.indexOf(p.row);
        if (at >= 0) crateRows.splice(at, 1);
        if (crateRows.length) { replan(); return; }
        state.cratePlan = null;
        $("#crate-preview-wrap").hidden = true;
        $("#crate-step3-hint").hidden = false;
        $("#crate-status").textContent = "";
      });
      dropTd.append(drop);
      tr.append(dropTd);
      body.append(tr);
    }

    const counts = {};
    let committable = 0;
    let invalid = 0;
    for (const p of plan) {
      counts[p.action] = (counts[p.action] || 0) + 1;
      if (p.action === CRATE_ACTION.NEW && p.record) {
        committable++;
        const { errors } = validateRecord(p.record, state.enums);
        if (errors.length) invalid++;
      }
    }
    const summary = Object.entries(counts)
      .map(([a, n]) => `${n} ${a}`).join(" · ");
    let statusTxt = `${plan.length} item(s): ${summary}.`;
    if (invalid) statusTxt += ` ⚠ ${invalid} record(s) fail validation.`;
    $("#crate-status").textContent = statusTxt;

    $("#crate-commit").disabled = committable === 0;
    $("#crate-commit-status").textContent =
      committable === 0
        ? "no new crate items to add (all skipped / WARN)."
        : `${committable} new record(s) will be added to the change list` +
          (invalid ? ` - ${invalid} have validation errors and are skipped.` : ".");
    $("#crate-preview-wrap").hidden = false;
    const hint = $("#crate-step3-hint");
    if (hint) hint.hidden = true;
  }

  // Push every NEW, valid plan row into the shared dirty buffer as an `add`.
  function commitPlan() {
    const plan = state.cratePlan || [];
    let added = 0;
    let skipped = 0;
    let blocked = 0;

    for (const p of plan) {
      if (p.action !== CRATE_ACTION.NEW || !p.record) { skipped++; continue; }
      const { errors } = validateRecord(p.record, state.enums);
      if (errors.length) { skipped++; continue; }

      // Re-checked here because a second Commit press sees the first press's adds mirrored into state.records.
      const { exact } = findDuplicateRecord(
        p.record.id, CRATE_CATEGORY, p.record.source, state.records);
      if (exact) {
        blocked++;
        p.action = CRATE_ACTION.WARN;
        p.messages.push(
          `id ${p.record.id} with an identical source already exists in ` +
          `crown_crate - skipped`,
        );
        continue;
      }
      const key = newKey(CRATE_CATEGORY);
      const rec = { ...p.record, _category: CRATE_CATEGORY, _key: key };
      state.buffer.add(key, p.record, CRATE_CATEGORY);
      state.records.push(rec);
      state.index.set(key, rec);
      // Flip the row so a re-preview or second commit press sees it as EXISTS.
      p.action = CRATE_ACTION.EXISTS;
      added++;
    }

    let msg = `Added to the change list: ${added} new crate item(s)`;
    if (skipped) msg += `, ${skipped} skipped (EXISTS / WARN / invalid)`;
    if (blocked) msg += `, ${blocked} BLOCKED (duplicate id)`;
    // Re-render first: the re-render writes this same status line, and its "nothing left to add" would otherwise be the last word after a successful commit.
    renderPreview();
    $("#crate-commit-status").textContent = msg + ".";
    applyFilters();
    renderFooter();

    if (added > 0) {
      $("#crate-success-text").textContent = successPanelText({
        added, skipped, blocked, pending: state.buffer.size(),
      });
      $("#crate-success").hidden = false;
      $("#crate-success").scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }

  return { id: "crate-seasons", label: "Crate seasons", render };
}
