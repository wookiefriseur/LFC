// The "Crown store" mask: fast one-at-a-time manual entry of Crown prices. The Crown Store has no public price API, so a contributor types prices in with the game open beside the page; the loop is keyboard-driven and refocuses search after every save.
// One id may own several legitimate crown_store records (bare price, pack, bundle, note). This mask only writes and edits the bare price source, so "does this item have a Crown price?" is asked of that source alone, never of "any crown_store record".

import { parseLuaBlocks, successPanelText } from "./luxury.js";
import { versionsDesc, versionLabel, latestVersion, labelOf } from "./data.js";
import { labelFor, tipFor, sourceTypeLabel } from "./lexicon.js";
import { messageFor } from "./validate.js";

export const CROWN_STORE_CATEGORY = "crown_store";

// Item search shared by the Prices and Crate seasons loops: every id a record or the names file knows, matched by id digits or by name. `reset()` drops the index after the records change.
export function itemSearch(state, nameOf, limit = 40) {
  let index = null;
  const search = (raw) => {
    const q = String(raw).trim().toLowerCase();
    if (!q) return [];
    if (!index) {
      const ids = new Set();
      for (const r of state.records) if (Number.isInteger(r.id)) ids.add(r.id);
      // Names-file ids with no record yet: an item may be brand new to the DB.
      if (state.names && state.names.base) {
        for (const k of Object.keys(state.names.base)) {
          const id = Number(k);
          if (Number.isInteger(id)) ids.add(id);
        }
      }
      index = [...ids].map((id) => ({ id, name: nameOf(id) || "" }));
    }
    const out = [];
    const numeric = /^\d+$/.test(q);
    for (const e of index) {
      if (numeric ? String(e.id).includes(q) : e.name.toLowerCase().includes(q)) out.push(e);
      if (out.length >= limit) break;
    }
    if (numeric) out.sort((a, b) => (String(a.id) === q ? -1 : 0) - (String(b.id) === q ? -1 : 0));
    return out;
  };
  search.reset = () => { index = null; };
  return search;
}

const PRICE_SOURCE = { type: "crown_store" };

// True for the bare price source: a crown_store source with no pack, bundle or note qualifier.
export function isPriceSource(source) {
  return !!source && source.type === "crown_store"
    && Object.keys(source).length === 1;
}

function crownAmount(record) {
  const c = (record?.cost || []).find((e) => e && e.currency === "CROWNS");
  return c && Number.isInteger(c.amount) ? c.amount : null;
}

export function buildCrownStoreRecord(id, price, version) {
  return {
    id,
    source: { ...PRICE_SOURCE },
    cost: [{ currency: "CROWNS", amount: price }],
    availability: { version },
  };
}

/** The "Prices" subtab of the Crown Store mask. */
export function crownStoreMask(deps) {
  const {
    state, $, elem, escapeHTML, fillSelectPairs, nameOf, newKey,
    validateRecord, findDuplicateRecord, itemLinkAnchor, itemIconImg,
    applyFilters, renderFooter,
  } = deps;

  const m = {
    candidates: [],   // current search matches
    picked: null,     // the chosen item: { id, name }
    session: [],      // [{ id, name, price, key, op }] added this session
  };

  // id -> { price, others }: `price` is the bare-source record (the only one the mask edits), `others` are the id's pack / bundle / note siblings, shown but never a reason to block. Rebuilt per use because the session adds records.
  function buildCrownStoreIndex() {
    const map = new Map();
    for (const r of state.records) {
      if (!Number.isInteger(r.id) || !r.source || r.source.type !== "crown_store") continue;
      let e = map.get(r.id);
      if (!e) map.set(r.id, (e = { price: null, others: [] }));
      if (isPriceSource(r.source)) {
        if (!e.price) e.price = r;
      } else {
        e.others.push(r);
      }
    }
    return map;
  }

  function siblingTag(record) {
    const s = record.source || {};
    if (s.packs) {
      return `${labelFor("source.packs")} ` +
        s.packs.map((p) => labelOf(state.enums, "packs", p)).join(", ");
    }
    if (s.bundle) return `${labelFor("source.bundle")} ${labelOf(state.enums, "bundles", s.bundle)}`;
    if (s.note) return `${labelFor("source.note")} "${s.note}"`;
    return "another Crown Store source";
  }

  function findingText(errors) {
    return errors.map((e) => messageFor(e)).join(" · ");
  }

  function render(container) {
    container.innerHTML = `
      <section class="cstore-mask">
        <div class="cstore-head">
          <h2>Crown Store prices</h2>
          <p class="muted">
            Search an item, type its Crown price, press <kbd>Enter</kbd>, and
            the form clears for the next one.
          </p>
        </div>

        <div class="cstore-controls">
          <label class="lc-field">
            <span title="${escapeHTML(tipFor("availability.version"))}">Game update</span>
            <select id="cstore-version"></select>
            <small class="muted">Applies to every price you add - defaults to the newest update.</small>
          </label>
        </div>

        <div class="cstore-loop">
          <div class="cstore-step">
            <label class="cstore-step-label" for="cstore-search">Find the item</label>
            <input id="cstore-search" type="search" autocomplete="off"
                   placeholder="type an itemId or name, then ↑↓ + Enter…">
            <ul id="cstore-matches" class="cstore-matches"></ul>
          </div>

          <div id="cstore-price-step" class="cstore-step" hidden>
            <label class="cstore-step-label" for="cstore-price">Crown price</label>
            <div class="cstore-picked" id="cstore-picked"></div>
            <div class="cstore-price-row">
              <input id="cstore-price" type="number" min="1" step="1"
                     placeholder="price in Crowns">
              <button id="cstore-save" class="btn-primary">Save &amp; next (Enter)</button>
              <button id="cstore-cancel">Cancel (Esc)</button>
            </div>
            <p id="cstore-price-note" class="muted cstore-price-note"></p>
          </div>
        </div>

        <div class="cstore-session">
          <div class="cstore-session-head">
            <h3>Added this session</h3>
            <span id="cstore-session-count" class="muted">0 items</span>
            <button id="cstore-undo" class="btn-mini" disabled>Undo last</button>
          </div>
          <ul id="cstore-session-list" class="cstore-session-list"></ul>
        </div>

        <div id="cstore-success" class="lux-success" hidden>
          <div class="lux-success-msg"><span class="lux-success-tick">✓</span>
            <span id="cstore-success-text"></span></div>
          <div class="lux-success-actions">
            <button id="cstore-success-send" class="btn-primary">Send now</button>
            <button id="cstore-success-more">Keep adding</button>
          </div>
        </div>

        <details class="cstore-batch">
          <summary>Optional - paste a whole batch at once</summary>
          <div class="cstore-batch-body">
            <details class="cstore-batch-format">
              <summary>What can I paste here?</summary>
              <p class="muted">
                The in-game DevUtility <code>Add data to textbox</code> dump -
                blocks of <code>[itemId] = { … },</code>. Each block's
                <code>itemPrice</code> is read as the Crown price. Blocks with
                no price are skipped: a Crown item with no price is not useful.
                An item that already has a Crown price is skipped; an item sold
                only inside a pack or a bundle is not, because that is a
                different way of getting it.
              </p>
            </details>
            <textarea id="cstore-batch-paste" rows="6"
              placeholder="	[126560] = {		-- Some Crown furnishing&#10;		itemPrice = 400,		-- Crowns&#10;	},"></textarea>
            <div class="cstore-batch-actions">
              <button id="cstore-batch-run" class="btn-primary">Add batch to the change list</button>
              <button id="cstore-batch-clear">Clear</button>
              <span id="cstore-batch-status" class="muted"></span>
            </div>
          </div>
        </details>
      </section>`;

    fillSelectPairs("#cstore-version",
      versionsDesc(state.enums).map((v) => ({
        value: v.symbol, label: versionLabel(state.enums, v.symbol),
      })));
    $("#cstore-version").value = latestVersion(state.enums);

    bindSearch();
    bindPriceStep();
    bindBatch();
    $("#cstore-success-send").addEventListener("click", () => {
      if (typeof deps.openSubmitModal === "function") deps.openSubmitModal();
    });
    $("#cstore-success-more").addEventListener("click", () => {
      $("#cstore-success").hidden = true;
      $("#cstore-search").focus();
    });
    renderSession();

    $("#cstore-search").focus();
  }

  // Step 1: search
  let activeMatch = -1;

  function bindSearch() {
    const input = $("#cstore-search");
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => runSearch(input.value), 120);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveMatch(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveMatch(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeMatch >= 0 ? activeMatch : 0;
        if (m.candidates[idx]) pickItem(m.candidates[idx]);
      } else if (e.key === "Escape") {
        input.value = "";
        runSearch("");
      }
    });
  }

  const searchItems = itemSearch(state, nameOf);

  function runSearch(raw) {
    activeMatch = -1;
    m.candidates = searchItems(raw);
    renderMatches();
  }

  function moveMatch(delta) {
    if (m.candidates.length === 0) return;
    activeMatch = (activeMatch + delta + m.candidates.length) % m.candidates.length;
    renderMatches();
    const el = $(`#cstore-match-${activeMatch}`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function renderMatches() {
    const ul = $("#cstore-matches");
    ul.innerHTML = "";
    if (m.candidates.length === 0) return;
    const known = buildCrownStoreIndex();
    m.candidates.forEach((c, i) => {
      const li = elem("li", {
        id: `cstore-match-${i}`,
        class: "cstore-match" + (i === activeMatch ? " is-active" : ""),
      });
      li.append(itemIconImg(c.id, c.name || `item ${c.id}`));
      const txt = elem("span", { class: "cstore-match-txt" });
      txt.append(elem("span", { class: "cstore-match-name" }, c.name || "(no name)"));
      txt.append(elem("span", { class: "cstore-match-id muted" }, `#${c.id}`));
      li.append(txt);
      const existing = known.get(c.id);
      if (existing && existing.price) {
        const amt = crownAmount(existing.price);
        li.append(elem("span", { class: "cstore-match-has" },
          amt != null ? `has crown price: ${amt}` : "has a crown price record"));
      } else if (existing && existing.others.length) {
        // A pack/bundle/note record only: no Crown price yet, so still an add.
        li.append(elem("span", { class: "cstore-match-has" },
          `in ${siblingTag(existing.others[0])} - no price yet`));
      }
      li.addEventListener("click", () => pickItem(c));
      ul.append(li);
    });
  }

  // Step 2: price entry
  function pickItem(cand) {
    m.picked = { id: cand.id, name: cand.name || nameOf(cand.id) || "" };
    const entry = buildCrownStoreIndex().get(cand.id);
    const existing = entry ? entry.price : null;
    const siblings = entry ? entry.others : [];

    const pickedHost = $("#cstore-picked");
    pickedHost.innerHTML = "";
    pickedHost.append(itemIconImg(cand.id, m.picked.name || `item ${cand.id}`));
    const info = elem("div", {});
    info.append(elem("strong", {}, m.picked.name || "(no name)"));
    info.append(itemLinkAnchor(cand.id, ` #${cand.id} ↗`));
    pickedHost.append(info);

    const note = $("#cstore-price-note");
    const priceInput = $("#cstore-price");
    const sibNote = siblings.length
      ? ` It is also sold as ${siblings.map(siblingTag).join(", ")} - those are` +
        ` separate ways to get it and are left alone.`
      : "";

    if (existing) {
      // A second bare-source record would be an exact dup, so this becomes an edit of the existing price.
      m.picked.editing = existing;
      const amt = crownAmount(existing);
      note.textContent =
        `This item already has a Crown price: ${amt != null ? amt.toLocaleString() : "(none)"}. ` +
        `Saving changes that price - it does not add a second one.` + sibNote;
      note.className = "cstore-price-note cstore-note-editing";
      priceInput.value = amt ?? "";
    } else {
      m.picked.editing = null;
      // The item's records come from the shared helper, so this note, the item detail list and the modal header agree about what an item owns.
      const itemRecs = typeof deps.recordsForItem === "function"
        ? deps.recordsForItem(cand.id)
        : state.records.filter((r) => r.id === cand.id);
      const otherRecs = itemRecs.filter((r) => r.source?.type !== "crown_store");
      if (otherRecs.length || siblings.length) {
        const types = [...new Set(otherRecs.map((r) => r.source?.type))]
          .filter(Boolean).map(sourceTypeLabel).join(", ");
        note.textContent =
          (types ? `This item can also be got another way (${types}). ` : "") +
          `A Crown price is one more way to get it, not a duplicate.` + sibNote;
        note.className = "cstore-price-note";
      } else {
        note.textContent = "This is the first Crown price for this item.";
        note.className = "cstore-price-note";
      }
      priceInput.value = "";
    }

    $("#cstore-price-step").hidden = false;
    priceInput.focus();
    priceInput.select();
  }

  function bindPriceStep() {
    $("#cstore-save").addEventListener("click", () => commitPicked());
    $("#cstore-cancel").addEventListener("click", () => resetLoop());
    $("#cstore-price").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitPicked();
      } else if (e.key === "Escape") {
        e.preventDefault();
        resetLoop();
      }
    });
    $("#cstore-undo").addEventListener("click", () => undoLast());
  }

  function commitPicked() {
    if (!m.picked) return;
    const priceRaw = $("#cstore-price").value;
    const price = parseInt(priceRaw, 10);
    if (!Number.isInteger(price) || price < 1) {
      $("#cstore-price-note").textContent =
        "A price has to be a whole number, 1 or more.";
      $("#cstore-price-note").className = "cstore-price-note cstore-note-error";
      $("#cstore-price").focus();
      return;
    }
    const version = $("#cstore-version").value;
    const id = m.picked.id;

    if (m.picked.editing) {
      const before = m.picked.editing;
      const after = JSON.parse(JSON.stringify(before));
      // cost[] lists alternative prices: replace only the Crowns one and keep any other currency.
      after.cost = [
        { currency: "CROWNS", amount: price },
        ...(after.cost || []).filter((c) => c && c.currency !== "CROWNS"),
      ];
      delete after._category;
      delete after._key;
      const beforeClean = clean(before);
      const { errors } = validateRecord(after, state.enums);
      if (errors.length) {
        $("#cstore-price-note").textContent =
          `Cannot save - ${findingText(errors)}`;
        $("#cstore-price-note").className = "cstore-price-note cstore-note-error";
        return;
      }
      state.buffer.update(before._key, beforeClean, after, before._category);
      Object.assign(before, after);
      m.session.push({
        id, name: m.picked.name, price, key: before._key, op: "edited",
      });
    } else {
      const rec = buildCrownStoreRecord(id, price, version);
      const { errors } = validateRecord(rec, state.enums);
      if (errors.length) {
        $("#cstore-price-note").textContent =
          `Cannot save - ${findingText(errors)}`;
        $("#cstore-price-note").className = "cstore-price-note cstore-note-error";
        return;
      }
      // Rejects only a second bare-source record; pickItem already routes an id with a price to the edit path, so this guards a re-pick race.
      const { exact } = findDuplicateRecord(
        id, CROWN_STORE_CATEGORY, rec.source, state.records);
      if (exact) {
        $("#cstore-price-note").textContent =
          `This item already got a Crown price this session - search for it ` +
          `again to change that price.`;
        $("#cstore-price-note").className = "cstore-price-note cstore-note-error";
        return;
      }
      const key = newKey(CROWN_STORE_CATEGORY);
      const live = { ...rec, _category: CROWN_STORE_CATEGORY, _key: key };
      state.buffer.add(key, rec, CROWN_STORE_CATEGORY);
      state.records.push(live);
      state.index.set(key, live);
      m.session.push({ id, name: m.picked.name, price, key, op: "added" });
    }

    searchItems.reset();
    renderSession();
    applyFilters();
    renderFooter();
    resetLoop();
  }

  function undoLast() {
    const last = m.session.pop();
    if (!last) return;
    const entry = state.buffer.entries.get(last.key);
    if (entry) {
      if (entry.op === "add") {
        state.buffer.entries.delete(last.key);
        const i = state.records.findIndex((r) => r._key === last.key);
        if (i >= 0) {
          state.records.splice(i, 1);
        }
        state.index.delete(last.key);
      } else if (entry.op === "update") {
        const live = state.index.get(last.key);
        if (live && entry.before) {
          Object.assign(live, entry.before);
        }
        state.buffer.entries.delete(last.key);
      }
    }
    searchItems.reset();
    renderSession();
    applyFilters();
    renderFooter();
    $("#cstore-search").focus();
  }

  function renderSession() {
    const ul = $("#cstore-session-list");
    ul.innerHTML = "";
    for (let i = m.session.length - 1; i >= 0; i--) {
      const s = m.session[i];
      const li = elem("li", { class: "cstore-session-item" });
      li.append(elem("span", { class: "cstore-session-op cstore-op-" + s.op }, s.op));
      li.append(elem("span", { class: "cstore-session-name" },
        s.name || `item ${s.id}`));
      li.append(elem("span", { class: "cstore-session-id muted" }, `#${s.id}`));
      li.append(elem("span", { class: "cstore-session-price" },
        `${s.price.toLocaleString()} Crowns`));
      ul.append(li);
    }
    $("#cstore-session-count").textContent =
      `${m.session.length} item${m.session.length === 1 ? "" : "s"}`;
    $("#cstore-undo").disabled = m.session.length === 0;
    renderSuccess();
  }

  // Sits below the session list rather than interrupting the loop: nothing may come between Enter and the next item.
  function renderSuccess() {
    const host = $("#cstore-success");
    if (!host) return;
    if (m.session.length === 0) { host.hidden = true; return; }
    let added = 0, updated = 0;
    for (const s of m.session) (s.op === "added" ? added++ : updated++);
    $("#cstore-success-text").textContent = successPanelText({
      added, updated, pending: state.buffer.size(),
    });
    host.hidden = false;
  }

  function resetLoop() {
    m.picked = null;
    m.candidates = [];
    activeMatch = -1;
    $("#cstore-price-step").hidden = true;
    $("#cstore-matches").innerHTML = "";
    const search = $("#cstore-search");
    search.value = "";
    search.focus();
  }

  // Optional batch path
  function bindBatch() {
    $("#cstore-batch-run").addEventListener("click", () => runBatch());
    $("#cstore-batch-clear").addEventListener("click", () => {
      $("#cstore-batch-paste").value = "";
      $("#cstore-batch-status").textContent = "";
    });
  }

  function runBatch() {
    const text = $("#cstore-batch-paste").value;
    const version = $("#cstore-version").value;
    const blocks = parseLuaBlocks(text);
    if (blocks.length === 0) {
      $("#cstore-batch-status").textContent = "nothing to parse - paste Lua blocks.";
      return;
    }
    let added = 0, skippedNoPrice = 0, skippedDup = 0, skippedRepeat = 0, invalid = 0;
    const seen = new Set();
    for (const b of blocks) {
      if (!Number.isInteger(b.id) || b.id < 1) { invalid++; continue; }
      // parseLuaBlocks flags a non-Gold currency comment as an error; here "Crowns" is correct and the price is still in b.price.
      if (b.price == null || b.price <= 0) { skippedNoPrice++; continue; }
      if (seen.has(b.id)) { skippedRepeat++; continue; }
      seen.add(b.id);
      if (b.comment) state.names.addOverride(b.id, b.comment);
      const probe = buildCrownStoreRecord(b.id, b.price, version);
      // An existing price record blocks; a pack/bundle/note record does not.
      if (findDuplicateRecord(b.id, CROWN_STORE_CATEGORY, probe.source, state.records).exact) {
        skippedDup++;
        continue;
      }
      const rec = probe;
      const { errors } = validateRecord(rec, state.enums);
      if (errors.length) { invalid++; continue; }
      const key = newKey(CROWN_STORE_CATEGORY);
      const live = { ...rec, _category: CROWN_STORE_CATEGORY, _key: key };
      state.buffer.add(key, rec, CROWN_STORE_CATEGORY);
      state.records.push(live);
      state.index.set(key, live);
      m.session.push({ id: b.id, name: nameOf(b.id), price: b.price, key, op: "added" });
      added++;
    }
    searchItems.reset();
    let msg = `added ${added}`;
    if (skippedNoPrice) msg += `, ${skippedNoPrice} skipped (no price)`;
    if (skippedDup) msg += `, ${skippedDup} skipped (already has a Crown price)`;
    if (skippedRepeat) msg += `, ${skippedRepeat} skipped (repeated in this paste)`;
    if (invalid) msg += `, ${invalid} invalid`;
    $("#cstore-batch-status").textContent = msg + ".";
    renderSession();
    applyFilters();
    renderFooter();
  }

  function clean(record) {
    const o = {};
    for (const [k, v] of Object.entries(record)) {
      if (!k.startsWith("_")) o[k] = v;
    }
    return o;
  }

  function onShow() {
    const s = $("#cstore-search");
    if (s) s.focus();
  }

  return { id: "add-prices", label: "Prices", render, onShow };
}
