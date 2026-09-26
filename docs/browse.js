import { containerContents, containerParents, containerIndex, containerLabel } from "./containers.js";
import { ignoredMessage } from "./ignored-items.js";
import {
  versionLabel, labelOf, entryOf, isNoteSymbol, noteLabel, placementsText,
  effectivePlacementsText, sortBySourcePriority, isUnknownId,
} from "./data.js";
import {
  buildTaxonomy, recordsForLeaves, enumerateLeaves,
} from "./taxonomy.js";
import {
  labelFor, tipFor, sourceTypeLabel, valueLabel, subtypeVocab,
  NOT_IN_GAME_DATA, ID_NOT_RECORDED,
} from "./lexicon.js";
import { SOURCE_ENUM_FIELD } from "./validate.js";
import { SITE_ONLY_FIELDS } from "./form.js";
// Re-exported: this module was the helpers' original home.
export { originOf, sortBySourcePriority } from "./data.js";

// Must match the rendered card height.
const CARD_H = 92;
const CARD_OVERSCAN = 6;

const SOURCE_FIELD_ENUM = SOURCE_ENUM_FIELD;

// Identifying fields first; unlisted fields follow in record order.
const FIELD_ORDER = [
  "vendor", "locations", "note", "event", "container",
  "book_container", "crate", "packs", "bundle", "companion", "houses", "quest",
  "achievement", "skill_line", "skill_rank", "npc_class",
  "npc_group", "subtype", "rarity", "leads",
];

function plainLabel(text) {
  const s = String(text ?? "");
  const i = s.indexOf("^");
  return i === -1 ? s : s.slice(0, i);
}

function valueText(key, value, type, enums) {
  if (isUnknownId(enums, key, value)) return ID_NOT_RECORDED;
  if (key === "subtype" && typeof value === "string") {
    return valueLabel(subtypeVocab(type), value);
  }
  if (key === "rarity" && typeof value === "string") {
    return valueLabel("rarities", value);
  }
  if (key === "locations" && Array.isArray(value)) {
    return placementsText(enums, value);
  }
  const vocab = SOURCE_FIELD_ENUM[key];
  if (vocab && typeof value === "string") {
    const entry = entryOf(enums, vocab, value);
    const label = plainLabel(labelOf(enums, vocab, value)) || value;
    return entry && entry.undefined_in_library ? label + NOT_IN_GAME_DATA : label;
  }
  // Empty means "comes furnished with a house nobody has named yet", not "no house"
  if (key === "houses" && Array.isArray(value)) {
    return value.length ? value.map((id) => `collectible ${id}`).join(", ") : "a house not yet identified";
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function browseMask(deps) {
  const {
    state, $, elem, nameOf, itemLinkAnchor, itemIconImg, validateRecord,
    sourceDetail, messageFor, recordsForItem,
  } = deps;

  // A crafted record is keyed by the blueprint; where the reference overlay knows the pair, the furnishing is shown and the recipe is the footnote.
  const craftedItem = (id) =>
    (typeof deps.craftedItem === "function" ? deps.craftedItem(id) : null);

  const view = {
    value: "",
    leaves: [],
    search: "",
    list: [],
    selectedKey: null,
    tax: null,
  };

  let pendingFilter = deps.initialFilter || null;

  // Quick Edit's modal sits over this mask, so a save never passes through onShow(); redraw on its save event.
  document.addEventListener("furcat:quick-edit-saved", () => {
    if ($("#browse-grid")) onShow();
  });

  function taxonomy() {
    view.tax = buildTaxonomy(state.enums || {}, state.records || []);
    return view.tax;
  }

  function leafLabel(leaf) {
    const i = String(leaf).indexOf(":");
    if (i === -1) return sourceTypeLabel(leaf);
    const type = leaf.slice(0, i);
    return `${sourceTypeLabel(type)} - ${valueLabel(subtypeVocab(type), leaf.slice(i + 1))}`;
  }

  function leavesForType(type) {
    return enumerateLeaves(state.enums || {})
      .filter((l) => l === type || l.startsWith(`${type}:`));
  }

  // One grid card per item id; an id shows under a group if any of its records matches.
  function filteredRecords() {
    if (!view.leaves.length) return state.records;
    return recordsForLeaves(state.records, view.leaves);
  }

  function buildItemList() {
    const ids = new Set();
    for (const r of filteredRecords()) if (Number.isInteger(r.id ?? r.blueprint)) ids.add(r.id ?? r.blueprint);
    for (const r of filteredRecords()) if (r.source?.part_of) ids.add(r.source.part_of);
    const byId = new Map();
    for (const r of state.records) {
      const id = r.id ?? r.blueprint;
      if (!ids.has(id)) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(r);
    }
    const q = view.search;
    const out = [];
    const index = containerIndex(state.records);
    for (const [id, recs] of byId) {
      const contents = index.contents(id);
      if (index.parentIds(recs).some((pid) => byId.has(pid))) continue;
      if (q) {
        const nm = nameOf(id).toLowerCase();
        if (!nm.includes(q) && !String(id).includes(q) && !recs.some(r => r.blueprint != null && String(r.blueprint).includes(q)) && !contents.some(r => nameOf(r.id ?? r.blueprint).toLowerCase().includes(q) || String(r.id ?? r.blueprint).includes(q) || String(r.blueprint || "").includes(q))) continue;
      }
      out.push({ id, records: recs, contents });
    }
    out.sort((a, b) => a.id - b.id);
    view.list = out;
  }

  // A leaf with zero records is legitimate (leaves are declared, not harvested), so it reads as "nothing here yet".
  function emptyState() {
    const wrap = elem("div", { class: "browse-empty" });
    wrap.append(elem("img", {
      class: "browse-empty-art", src: "./assets/coffer.png", alt: "",
      width: "200", height: "150", loading: "lazy",
    }));
    const q = view.search.trim();
    if (q) {
      wrap.append(elem("p", { class: "browse-empty-lead" },
        "No items match your search."));
      wrap.append(elem("p", { class: "muted" },
        `Nothing called “${q}” under the current filter - try fewer letters, or clear the filter.`));
    } else {
      wrap.append(elem("p", { class: "browse-empty-lead" }, "Nothing here yet."));
      wrap.append(elem("p", { class: "muted" },
        "This kind of source is real but has no records so far - the first contribution starts the list."));
    }
    return wrap;
  }

  function sourceSummary(item) {
    const labels = [];
    for (const r of item.records) {
      const l = r.source?.type ? sourceTypeLabel(r.source.type) : "Unknown source";
      if (!labels.includes(l)) labels.push(l);
    }
    if (labels.length <= 3) return labels.join(", ");
    return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
  }

  function render(container) {
    container.innerHTML = `
      <section class="browse-mask">
        <aside class="browse-sidebar">
          <h2>Find an item</h2>
          <ul id="browse-facet-list" class="browse-facet-list"></ul>
        </aside>

        <div class="browse-main">
          <div class="browse-toolbar">
            <span class="search-box">
              <input id="browse-search" type="search" placeholder="search by id or name…">
              <button id="browse-search-clear" type="button" class="search-clear"
                      aria-label="Clear the search" hidden>×</button>
            </span>
            <span id="browse-count" class="muted"
                  title="Items, not records. One item can have several sources."></span>
          </div>
          <div id="browse-scroller" class="browse-scroller">
            <div id="browse-grid" class="browse-grid"></div>
          </div>
        </div>

        <aside id="browse-detail" class="browse-detail" hidden></aside>
      </section>`;

    let searchTimer = null;
    $("#browse-search").addEventListener("input", (e) => {
      const v = e.target.value.toLowerCase();
      $("#browse-search-clear").hidden = !v;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        view.search = v;
        buildItemList();
        $("#browse-scroller").scrollTop = 0;
        renderGrid();
      }, 150);
    });

    $("#browse-search-clear").addEventListener("click", () => {
      const box = $("#browse-search");
      box.value = "";
      box.dispatchEvent(new Event("input"));
      box.focus();
    });

    let raf = null;
    $("#browse-scroller").addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; renderGrid(); });
    });

    if (deps.onRefDataShard) {
      deps.onRefDataShard(() => {
        if (!$("#browse-grid")) return;
        renderGrid();
        if (view.selectedKey) renderDetail();
      });
    }

    taxonomy();
    if (pendingFilter) {
      const f = pendingFilter;
      pendingFilter = null;
      applyFilter(f);
      return;
    }
    renderTree();
    buildItemList();
    renderGrid();
  }

  function refresh() {
    renderTree();
    buildItemList();
    const sc = $("#browse-scroller");
    if (sc) sc.scrollTop = 0;
    renderGrid();
  }

  function applyFilter(filter) {
    if (!filter) return;
    if (filter.leaf || filter.leaves) {
      view.leaves = filter.leaves ? [...filter.leaves] : [filter.leaf];
      view.value = filter.leaf ? `leaf:${filter.leaf}` : `leaves:${view.leaves.join(",")}`;
    } else if (filter.type) {
      view.leaves = leavesForType(filter.type);
      view.value = `leaves:${view.leaves.join(",")}`;
    }
    if (filter.query != null) {
      view.search = String(filter.query).toLowerCase();
      const box = $("#browse-search");
      if (box) {
        box.value = filter.query;
        $("#browse-search-clear").hidden = !box.value;
      }
      // A header search addresses the whole catalogue, not the last selected group.
      if (!filter.leaf && !filter.leaves && !filter.type) {
        view.leaves = [];
        view.value = "";
      }
    }
    taxonomy();
    refresh();
  }

  function renderTree() {
    const ul = $("#browse-facet-list");
    if (!ul) return;
    ul.innerHTML = "";

    // A filter can name a single leaf while the sidebar offers groups, so the narrowest entry holding that leaf lights up.
    const focusLeaf = String(view.value).startsWith("leaf:")
      ? String(view.value).slice("leaf:".length) : null;
    let activeKey = view.value;
    if (focusLeaf) {
      for (const g of view.tax?.groups || []) {
        if ((g.leaves || []).includes(focusLeaf)) activeKey = `grp:${g.id}`;
        for (const sg of g.subgroups || []) {
          if (sg.leaves.includes(focusLeaf)) activeKey = `sub:${g.id}/${sg.id}`;
        }
      }
    }

    const mkItem = (key, label, count, extraClass = "") => {
      const li = elem("li", { class: "browse-facet-item" });
      const btn = elem("button", {
        class: "browse-facet-link" + (extraClass ? ` ${extraClass}` : "") +
          (activeKey === key ? " is-active" : ""),
      });
      btn.append(elem("span", { class: "bf-label" }, label));
      btn.append(elem("span", { class: "bf-count" }, String(count)));
      li.append(btn);
      ul.append(li);
      return btn;
    };

    const select = (key, leaves) => {
      view.value = key;
      view.leaves = leaves;
      refresh();
    };

    mkItem("", "All items", state.records.length)
      .addEventListener("click", () => select("", []));

    const t = view.tax || taxonomy();
    const countOf = (leaves) => leaves.reduce((n, l) => n + (t.counts[l] || 0), 0);

    for (const g of t.groups) {
      const own = [...g.leaves, ...(g.subgroups || []).flatMap((sg) => sg.leaves)];
      mkItem(`grp:${g.id}`, g.label, countOf(own))
        .addEventListener("click", () => select(`grp:${g.id}`, own));
      for (const sg of g.subgroups || []) {
        mkItem(`sub:${g.id}/${sg.id}`, sg.label, countOf(sg.leaves), "is-sub")
          .addEventListener("click", () => select(`sub:${g.id}/${sg.id}`, sg.leaves));
      }
    }

    // Every leaf is placed by construction, so "Other" only appears for a leaf the derivation missed.
    if (!t.catchAll.length) return;
    const other = mkItem("grp:other", "Other", countOf(t.catchAll));
    other.title = "Sources this site has not sorted into a group yet.";
    other.addEventListener("click", () => select("grp:other", t.catchAll));
    for (const leaf of t.catchAll) {
      mkItem(`leaf:${leaf}`, leafLabel(leaf), t.counts[leaf] || 0, "is-sub")
        .addEventListener("click", () => select(`leaf:${leaf}`, [leaf]));
    }
  }

  // One icon node per item, reused across renders: a fresh <img> paints blank until decoded, even from cache, so rebuilding the cards made icons flicker. Placeholders are not kept - they swap themselves out when a shard lands.
  const iconNodes = new Map();
  function cardIcon(id) {
    const kept = iconNodes.get(id);
    // A failed load (complete, no pixels) already replaced itself with a placeholder; build a new one.
    const failed = kept && kept.complete && kept.naturalWidth === 0;
    if (kept && !failed && !kept.isConnected) return kept;
    const node = itemIconImg(id, nameOf(id) || `item ${id}`);
    if (node.tagName === "IMG") iconNodes.set(id, node);
    return node;
  }

  function renderGrid() {
    const grid = $("#browse-grid");
    const scroller = $("#browse-scroller");
    if (!grid || !scroller) return;
    const total = view.list.length;

    const scrollTop = scroller.scrollTop;
    const viewH = scroller.clientHeight || 600;
    let first = Math.floor(scrollTop / CARD_H) - CARD_OVERSCAN;
    if (first < 0) first = 0;
    const visible = Math.ceil(viewH / CARD_H) + CARD_OVERSCAN * 2;
    const last = Math.min(total, first + visible);

    grid.innerHTML = "";
    if (total === 0) {
      grid.append(emptyState());
      $("#browse-count").textContent = "0 items";
      return;
    }
    if (first > 0) grid.append(spacer(first * CARD_H));

    for (let i = first; i < last; i++) {
      const item = view.list[i];
      const card = elem("div", {
        class: "browse-card" + (item.records.some(r => r.container) ? " browse-container" : "") + (item.records.some((r) => r._key === view.selectedKey) ? " is-selected" : ""),
      });

      const iconWrap = elem("div", { class: "browse-card-icon" });
      iconWrap.append(cardIcon(item.id));
      card.append(iconWrap);

      const body = elem("div", { class: "browse-card-body" });
      body.append(elem("div", { class: "browse-card-name" },
        nameOf(item.id) || "(no name)"));
      const meta = elem("div", { class: "browse-card-meta muted" });
      const blueprint = item.records.find(r => r.blueprint)?.blueprint;
      meta.append(elem("span", {
        class: "browse-card-id",
      }, `#${item.id}`));
      if (blueprint) {
        meta.append(elem("span", {
          class: "browse-card-recipe",
          title: "The blueprint that teaches this furnishing.",
        }, item.records.some(r => r.id) ? `from recipe #${blueprint}` : "Unpaired blueprint"));
      }
      // An item whose only record is a rumour has no confirmed source and must not look as settled as a verified row.
      const unconfirmed = item.records.every((r) => r.source?.type === "rumour");
      meta.append(elem("span", {
        class: unconfirmed ? "browse-card-src browse-card-unverified" : "browse-card-src",
        ...(unconfirmed ? {
          title: "Only heard of - nobody has recorded where this actually " +
                 "comes from yet. If you know, that is a contribution.",
        } : {}),
      }, sourceSummary(item)));
      if (item.records.length > 1) {
        meta.append(elem("span", {
          class: "browse-card-n",
          title: "Each one is a separate record you can correct.",
        }, `${item.records.length} ways to get it`));
      }
      const container = item.records.find(r => r.container);
      if (container) {
        const contents = containerContents(state.records, item.id);
        body.prepend(elem("strong", { class: "container-label" }, `${containerLabel(container)} - ${contents.length} contents`));
        const names = contents.map(r => nameOf(r.id ?? r.blueprint) || `#${r.id ?? r.blueprint}`);
        card.title = `${containerLabel(container)} contains:\n${names.join("\n")}`;
        body.append(elem("div", { class: "container-preview" }, names.slice(0, 2).join("; ") + (names.length > 2 ? `; +${names.length - 2} more` : "")));
      }
      body.append(meta);
      card.append(body);

      card.addEventListener("click", () => {
        view.selectedKey = item.records[0]._key;
        view._detailItem = item;
        renderDetail();
        for (const c of grid.querySelectorAll(".browse-card.is-selected")) c.classList.remove("is-selected");
        card.classList.add("is-selected");
      });
      grid.append(card);
    }

    if (last < total) grid.append(spacer((total - last) * CARD_H));

    $("#browse-count").textContent =
      `${total.toLocaleString()} item${total === 1 ? "" : "s"}` +
      (total > 0 ? ` - showing ${first + 1}–${last}` : "");
  }

  function itemButton(id) {
    const button = elem("button", { class: "btn-mini container-item", type: "button", "data-item-id": id }, nameOf(id) || `#${id}`);
    button.addEventListener("click", () => {
      const records = state.records.filter(r => (r.id ?? r.blueprint) === id);
      if (!records.length) return;
      view.selectedKey = records[0]._key;
      view._detailItem = { id, records };
      renderDetail();
      renderGrid();
    });
    return button;
  }

  function spacer(heightPx) {
    const d = document.createElement("div");
    d.className = "browse-spacer";
    d.style.height = `${heightPx}px`;
    return d;
  }

  function renderDetail() {
    const host = $("#browse-detail");
    if (!host) return;
    const item = view._detailItem;
    if (!item) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = "";

    const head = elem("div", { class: "browse-detail-head" });
    const closeBtn = elem("button", { class: "btn-mini browse-detail-close" }, "×");
    closeBtn.addEventListener("click", () => {
      view.selectedKey = null;
      view._detailItem = null;
      host.hidden = true;
      renderGrid();
    });
    head.append(closeBtn);
    const titleWrap = elem("div", {});
    titleWrap.append(itemIconImg(item.id, nameOf(item.id) || `item ${item.id}`));
    const title = elem("div", { class: "browse-detail-title" });
    title.append(elem("h3", {}, nameOf(item.id) || "(no name)"));
    const blueprint = item.records.find(r => r.blueprint)?.blueprint;
    title.append(itemLinkAnchor(item.id, `#${item.id}`));
    if (blueprint && item.records.some(r => r.id)) {
      const from = elem("span", { class: "browse-detail-recipe muted" }, "from recipe ");
      from.append(itemLinkAnchor(blueprint, `#${blueprint}`));
      title.append(from);
    }
    titleWrap.append(title);
    head.append(titleWrap);
    host.append(head);

    // The modal header's "record N of M" and Crown Store's "also:" note must agree on this order.
    const ordered = typeof recordsForItem === "function"
      ? recordsForItem(item.id)
      : sortBySourcePriority(item.records, state.enums);
    if (ordered.some((r) => r.source?.type === "ignored")) {
      host.append(elem("p", {}, ignoredMessage));
    }
    const n = ordered.length;
    host.append(elem("div", {
      class: "muted browse-detail-sub",
      title: "Each one is a separate record you can correct.",
    }, n === 1 ? "1 way to get it" : `${n} ways to get it`));

    const container = item.records.find(r => r.container);
    if (container) {
      host.append(elem("h3", { class: "container-label" }, containerLabel(container)));
      host.append(elem("p", { class: "muted" }, "The price below buys the whole collection."));
      const list = elem("ul", { class: "container-contents" });
      for (const child of containerContents(state.records, item.id)) {
        const li = elem("li", {});
        li.append(itemButton(child.id ?? child.blueprint));
        if (child.blueprint) li.append(" (recipe)");
        list.append(li);
      }
      host.append(elem("h4", {}, "Contents"), list);
    }
    for (const parent of containerParents(state.records, item.records)) {
      host.append(elem("p", { class: "container-parent" }, "Part of ", itemButton(parent.id)));
    }
    ordered.forEach((r) => host.append(sourceBlock(r)));

    if (deps.pairRecord && !container) {
      const pair = elem("button", { class: "btn-mini browse-pair" }, "Link a blueprint and furnishing");
      pair.addEventListener("click", () => deps.pairRecord(item.records[0]._key));
      host.append(pair);
    }

    const add = elem("button", { class: "btn-mini browse-add-way" },
      "+ Add another way to get this item");
    add.addEventListener("click", () => {
      if (typeof deps.addRecordForItem === "function") deps.addRecordForItem(item.id);
    });
    host.append(add);
  }

  function sourceBlock(r) {
    const type = r.source?.type || "";
    const block = elem("div", { class: "browse-source-rec" });

    const recHead = elem("div", { class: "browse-source-head" });
    recHead.append(elem("h4", {
      class: "browse-source-type",
      ...(type === "rumour" ? {
        title: "The exclusive fallback: it exists in the catalogue, but no " +
               "confirmed way to get it has been recorded.",
      } : {}),
    }, type ? sourceTypeLabel(type) : "No source"));
    if (state.buffer.entries.has(r._key)) {
      recHead.append(elem("span", { class: "browse-source-dirty" }, "edited"));
    }
    block.append(recHead);

    // Records of one item can share a type and differ only in `location`, so the type label alone never identifies a record.
    const loc = sourceDetail(r.source);
    if (loc && loc.text) {
      block.append(elem("div", {
        class: "browse-source-locator muted", title: loc.title,
      }, loc.text));
    }

    block.append(fieldList(r, type));

    // A data note is for contributor notes, if something is non-standard or peculiar
    const siteOnly = SITE_ONLY_FIELDS.filter((f) => hasValue(r[f]));
    if (siteOnly.length) {
      const box = elem("div", { class: "browse-siteonly" });
      box.append(elem("div", { class: "browse-siteonly-legend" },
        "Only on this site - the build removes these"));
      const dl = elem("dl", { class: "browse-source-fields" });
      for (const f of siteOnly) {
        appendRow(dl, labelFor(f), tipFor(f), textNode(fieldText(r[f])));
      }
      box.append(dl);
      block.append(box);
    }

    appendFindings(block, r);

    const actions = elem("div", { class: "browse-rec-actions" });
    const fix = elem("button", { class: "btn-mini btn-primary browse-fix-this" },
      "Quick Edit");
    fix.addEventListener("click", () => {
      if (typeof deps.openQuickEdit === "function") deps.openQuickEdit(r._key);
    });
    actions.append(fix);
    const batch = elem("button", { class: "btn-mini browse-batch-edit" },
      "Batch edit");
    batch.addEventListener("click", () => {
      if (typeof deps.switchToBatchEdit === "function") deps.switchToBatchEdit(r._key);
    });
    actions.append(batch);
    block.append(actions);
    return block;
  }

  function fieldList(r, type) {
    const dl = elem("dl", { class: "browse-source-fields" });
    const src = r.source || {};
    const keys = Object.keys(src).filter((k) => k !== "type");
    keys.sort((a, b) => {
      const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const k of keys) {
      const path = `source.${k}`;
      appendRow(dl, labelFor(path, type), tipFor(path, type),
        valueOf(k, src[k], type, state.enums));
    }

    // Absence is the marker for an inherited vendor placement, so the row only exists when the lookup finds something.
    const inheritedText = src.locations ? "" : effectivePlacementsText(state.enums, src);
    if (inheritedText) {
      appendRow(dl, labelFor("source.locations", type),
        tipFor("source.locations", type), textNode(inheritedText));
    }

    const cost = Array.isArray(r.cost) ? r.cost : [];
    if (cost.length) {
      appendRow(dl, labelFor("cost"), tipFor("cost"), textNode(costText(cost)));
    } else {
      appendRow(dl, labelFor("cost.empty"), tipFor("cost.empty"), textNode("-"));
    }

    const av = r.availability || {};
    if (av.version) {
      appendRow(dl, labelFor("availability.version"), tipFor("availability.version"),
        elem("span", { title: av.version }, plainLabel(versionLabel(state.enums, av.version))));
    }
    if (av.last_seen) {
      appendRow(dl, labelFor("availability.last_seen"), tipFor("availability.last_seen"),
        textNode(av.last_seen));
    }
    if (r.rarity) {
      appendRow(dl, labelFor("rarity"), tipFor("rarity"),
        textNode(valueLabel("rarities", r.rarity)));
    }
    return dl;
  }

  function appendRow(dl, label, tip, valueNode) {
    const dt = elem("dt", {}, label);
    if (tip) dt.title = tip;
    dl.append(dt);
    dl.append(elem("dd", {}, valueNode));
  }

  function appendFindings(block, r) {
    // Passed with _key/_category attached, so the composite-dup check excludes the record from itself and the wrong-file rule can run.
    const { errors } = validateRecord(r, state.enums, state.records);
    if (!errors.length) return;
    let known = false;
    for (const f of errors) {
      // A value the library itself does not define is not the contributor's doing: one grey line instead of amber ones.
      if (isKnownBadValue(r, f.field)) { known = true; continue; }
      block.append(elem("p", {
        class: "warn browse-source-invalid",
        title: `${f.field}: ${f.message}`,
      }, messageFor(f)));
    }
    if (known) {
      block.append(elem("p", { class: "muted browse-source-known" },
        "Known problem in the source data - not something you did."));
    }
  }

  // Derived from enums.json `undefined_in_library`, so no mask carries a list of known-broken values.
  function isKnownBadValue(record, field) {
    const key = String(field || "").replace(/^source\./, "");
    const vocab = SOURCE_FIELD_ENUM[key];
    if (!vocab) return false;
    const entry = entryOf(state.enums, vocab, record.source?.[key]);
    return Boolean(entry && entry.undefined_in_library);
  }

  function textNode(text) {
    return document.createTextNode(String(text));
  }

  function hasValue(v) {
    if (v == null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  function fieldText(v) {
    if (Array.isArray(v)) return v.join(", ");
    if (v && typeof v === "object") {
      return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(" · ");
    }
    return String(v);
  }

  function costText(cost) {
    return cost
      .map((c) => `${(c.amount ?? 0).toLocaleString()} ${valueLabel("currencies", c.currency)}`)
      .join(" / ");
  }

  function valueOf(key, value, type, enums) {
    if (key === "note") return noteNode(value);
    const vocab = SOURCE_FIELD_ENUM[key];
    if (vocab && typeof value === "string") {
      return symbolNode(vocab, value, valueText(key, value, type, enums), enums);
    }
    return textNode(valueText(key, value, type, enums));
  }

  function symbolNode(vocab, symbol, label, enums) {
    const entry = entryOf(enums, vocab, symbol);
    const bits = [symbol];
    for (const k of ["zone", "item", "si", "crate", "skill_line", "def", "ordinal", "season"]) {
      if (entry && entry[k] != null) bits.push(`${k} ${entry[k]}`);
    }
    if (!entry) bits.push(`not in enums.${vocab}`);
    const bad = !entry || entry.undefined_in_library;
    return elem("span", {
      class: "browse-symbol" + (bad ? " warn" : ""),
      title: bits.join(" · "),
    }, label);
  }

  function noteNode(value) {
    const sym = isNoteSymbol(state.enums, value);
    return elem("span", {
      class: sym ? "note-symbol" : "note-freetext",
      title: sym ? `${value} · enums.places` : String(value),
    }, plainLabel(noteLabel(state.enums, value)));
  }

  // Records may have changed in another mask (an add or a modal save).
  function onShow() {
    if (!$("#browse-grid")) return;
    taxonomy();
    if (pendingFilter) {
      const f = pendingFilter;
      pendingFilter = null;
      applyFilter(f);
    } else {
      renderTree();
      buildItemList();
      renderGrid();
    }
    if (view._detailItem) {
      const id = view._detailItem.id;
      view._detailItem = { id, records: state.records.filter((r) => r.id === id) };
      renderDetail();
    }
  }

  // Safe before the mask has rendered: the filter is held and applied then.
  function focus(filter) {
    if (!$("#browse-facet-list")) { pendingFilter = filter; return; }
    applyFilter(filter);
  }

  return { id: "browse", label: "Browse", render, onShow, focus };
}
