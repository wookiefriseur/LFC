import {
  computeSourcelessIds, isPlaceholderName,
  symbolOf, entryOf, isNoteSymbol,
} from "./data.js";
import { buildTaxonomy, leafOf, renderSourcesSection } from "./taxonomy.js";
// Imported rather than mirrored: validator and editor must agree on what "a value from a vocabulary" means.
import { canonicalSource, messageFor, SOURCE_ENUM_FIELD } from "./validate.js";
import { labelFor, sourceTypeLabel } from "./lexicon.js";

// Lists can be thousands of rows. The spacer arithmetic assumes a uniform ROW_H, which a wrapped detail cell breaks, so anything short enough to paint whole is painted whole.
const ROW_H = 30;
const OVERSCAN = 8;
const VIRT_MIN = 600;

// A note is a promotion candidate when it is shaped like a stored symbol rather than like something a player would read.
const CODE_WORD_RE = /^[A-Z][A-Z0-9_]*$/;

// Where a vocabulary's values turn up in a record - used to count the buffered records that depend on a pending `add-enum` value.
const ENUM_DEP_VALUES = {
  places: (r) => [r.source?.note],
  versions: (r) => [r.availability?.version],
  currencies: (r) => (Array.isArray(r.cost) ? r.cost : []).map((c) => c?.currency),
};
for (const [field, enumKey] of Object.entries(SOURCE_ENUM_FIELD)) {
  ENUM_DEP_VALUES[enumKey] = (r) => [r.source?.[field]];
}

// Vocabulary editor table
// One row per extendable vocabulary. `meta` lists the extra fields the entry needs beyond its symbol, in render order:
//   key         the enums.json entry key it writes ("si", "zone", "item", ...)
//   label       the form label
//   hint        the small print under the label - say where the id comes from
//   type        "int" | "text"
//   required    a value must be given
//   unique      no existing entry of this vocabulary may carry the same value
//   min         "int" only, default 1
//   pattern     "text" only, a RegExp the value must match
//   patternHint the message shown when `pattern` fails
//   prefill     (list) => value, used to seed the input on kind switch
// An empty `meta` is a flat string list (currencies), mirrored and serialised as a bare symbol.
// `path` is the schema path the vocabulary feeds and the tooltip; the visible name comes from the lexicon unless `label` overrides it.

const SI_RE = /^SI_[A-Z0-9_]+$/;
const SEASON_RE = /^\d{4}-\d{2}$/;

function siField(hint) {
  return {
    key: "si", label: "SI string id", hint, type: "text",
    required: true, unique: true, pattern: SI_RE,
    patternHint: "an SI_… locale key - uppercase letters, digits, underscore",
  };
}

function nameField(hint, required = false) {
  return { key: "name", label: "English label", hint, type: "text", required };
}

function intField(key, label, hint, extra = {}) {
  return { key, label, hint, type: "int", required: true, unique: true, ...extra };
}

function nextFreeInt(list, key) {
  const nums = (list || [])
    .map((v) => (typeof v === "string" ? 0 : Number(v?.[key]) || 0));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export const ENUM_KINDS = [
  {
    key: "vendors", path: "source.vendor",
    meta: [
      siField("the locale key the vendor's name resolves from (LFC locale/en.lua)"),
      nameField("what en.lua says for that key, e.g. \"Rolis Hlaalu\""),
    ],
  },
  {
    key: "locations", path: "source.locations[].location",
    label: "Where - a game zone",
    meta: [
      intField("zone", "Zone id",
        "the game zoneId GetZoneNameById() resolves. A game ZONE only - a " +
        "placeless qualifier is an Extra detail, not a zone."),
    ],
  },
  {
    key: "places", path: "source.locations[].place", label: "Where - a finer place",
    meta: [
      siField("the locale key the place name resolves from (LFC locale/en.lua)"),
      nameField("what en.lua says, e.g. \"any capital city\""),
    ],
  },
  {
    key: "versions", path: "availability.version", label: "Game update",
    meta: [
      intField("ordinal", "Update ordinal",
        "the running patch number - prefilled with the next free one",
        { prefill: (list) => nextFreeInt(list, "ordinal") }),
      nameField("the patch's marketing name, e.g. \"Fallen Banners (U45)\"", true),
    ],
  },
  {
    key: "crates", path: "source.crate",
    meta: [
      intField("crate", "Crown crate id",
        "the GetCrownCrateName(N) id - not monotonic with the season date",
        { prefill: (list) => nextFreeInt(list, "crate") }),
      {
        key: "season", label: "Season", type: "text", required: false,
        hint: "\"YYYY-MM\" - drives newest-season-first sorting; leave blank for TBA",
        pattern: SEASON_RE, patternHint: "a \"YYYY-MM\" month, e.g. 2026-06",
      },
      nameField("the crate's marketing name, e.g. \"Anu vs. Padomay\"", true),
    ],
  },
  {
    key: "packs", path: "source.packs",
    meta: [
      intField("item", "Pack itemId", "the itemId of the furnishing-pack container"),
      nameField("the pack's store name, e.g. \"Furnishing Pack: Darien's " +
        "Delights\"", true),
    ],
  },
  {
    key: "bundles", path: "source.bundle",
    meta: [
      siField("the locale key the bundle name resolves from (LFC locale/en.lua)"),
      nameField("what en.lua says for that key"),
    ],
  },
  {
    key: "containers", path: "source.container",
    meta: [
      intField("item", "Container itemId",
        "the itemId of the box/coffer the furnishing drops from"),
    ],
  },
  {
    key: "events", path: "source.event",
    meta: [
      siField("the locale key the event name resolves from (LFC locale/en.lua)"),
      nameField("the event's in-game name, e.g. \"Witches Festival\"", true),
    ],
  },
  {
    key: "npc_classes", path: "source.npc_class",
    meta: [
      siField("the game's social-class string, e.g. SI_MONSTERSOCIALCLASS23"),
    ],
  },
  {
    key: "skill_lines", path: "source.skill_line",
    meta: [
      intField("skill_line", "Skill line id",
        "the game's skill-line id (Constants.SkillLineIds)"),
    ],
  },
  {
    key: "companions", path: "source.companion",
    meta: [
      intField("def", "Companion defId",
        "the companion's definition id (Constants.CompanionIds)"),
      nameField("the companion's name, e.g. \"Isobel\""),
    ],
  },
  { key: "currencies", path: "cost[].currency", meta: [] },
];

function kindLabel(kind) {
  return kind.label || labelFor(kind.path);
}

export function nextFreeIntFor(enums, enumName, key) {
  return nextFreeInt(enums?.[enumName] || [], key);
}

/**
 * Queue one new vocabulary value. Refuses a symbol that is malformed, already in the vocabulary or already queued this session; otherwise writes the `add-enum` buffer entry and mirrors the value into the live enums so the rest of the session can use it immediately.
 * @returns {{ok: true, key: string} | {ok: false, error: string}}
 */
export function queueEnumValue(state, enumName, symbol, meta = null) {
  if (!CODE_WORD_RE.test(String(symbol || ""))) {
    return { ok: false, error:
      "the value has to be an UPPERCASE symbol - letters, digits and " +
      "underscores, starting with a letter." };
  }
  const existing = (state.enums?.[enumName] || [])
    .map((v) => (typeof v === "string" ? v : v?.symbol));
  if (existing.includes(symbol)) {
    return { ok: false, error: `"${symbol}" is already in the list.` };
  }
  const key = `enum#${enumName}:${symbol}`;
  if (state.buffer.entries.has(key)) {
    return { ok: false, error: `"${symbol}" is already waiting to be sent.` };
  }
  state.buffer.addEnum(key, enumName, symbol, meta);
  if (meta) state.enums[enumName].push({ symbol, ...meta });
  else state.enums[enumName].push(symbol);
  return { ok: true, key };
}

export function maintenanceMask(deps) {
  const {
    state, $, elem, nameOf, validateRecord, itemLinkAnchor, itemIconImg,
    switchToBatchEdit, renderFooter,
  } = deps;

  const view = {
    section: "check",       // "check" | "sources" | "vocab"
    filter: "sourceless",
    search: "",
    expanded: new Set(),    // group keys currently unfolded
    rows: [],
    display: [],            // what the virtualiser paints: groups + children
    summary: "",            // per-filter aggregate line
    badge: null,            // {failing, baseline} - the `invalid` filter only
  };

  // A quick-edit save mutates the record in place under a modal over this mask, so onShow() never fires; recompute the current filter when the modal announces the save.
  document.addEventListener("furcat:quick-edit-saved", () => {
    if (!$("#maint-body") || view.section !== "check") return;
    rebuildRows();
    renderTable();
    labelFilterCounts();
  });

  // Health views
  // Every compute() returns { rows, summary?, badge? }. A row is { id, key, detail, known?, group?, leaf? }, `key` being the record `_key` both row actions target. A filter with its own meaningful order sets `preSorted`; everything else is sorted by id. `groupable` filters attach a `group` = {key, label, promote?, leaf?} to every row.
  // `tip` is shown only as a tooltip; the computed `summary` is a result, so it stays visible.
  const FILTERS = {
    sourceless: {
      label: "Items with no known source",
      tip: "Items whose only record is a rumour - nobody has said yet where " +
           "the item actually comes from.",
      compute() {
        const ids = computeSourcelessIds(state.records);
        const rows = [];
        const byId = new Map();
        for (const r of state.records) {
          if (ids.has(r.id) && r.source?.type === "rumour" && !byId.has(r.id)) {
            byId.set(r.id, r);
          }
        }
        for (const [id, rec] of byId) {
          rows.push({ id, key: rec._key, detail: rec.source?.subtype || "rumour" });
        }
        return { rows };
      },
    },
    invalid: {
      label: "Records with a problem",
      tip: "Every record that fails the in-browser schema check. Some are " +
           "upstream library data that is genuinely wrong - surfacing them " +
           "is the point.",
      compute() {
        const rows = [];
        let failing = 0;
        let baseline = 0;
        for (const r of state.records) {
          const { errors } = validateRecord(r, state.enums);
          if (!errors.length) continue;
          failing++;
          const known = errors.every((e) => isKnownUpstream(r, e));
          if (known) baseline++;
          // The plain-English sentence, not the field list or a schema path. A row whose findings are all known-upstream says so once, in the grey line the renderer appends.
          const said = known ? "" : errors.map((e) => messageFor(e)).join(" ");
          rows.push({
            id: r.id, key: r._key, known,
            // A record's own `notes` often says the upstream library data is wrong there - that is why the row exists.
            detail: said + (r.notes ? `${said ? " - " : ""}noted: ${truncate(r.notes, 100)}` : ""),
          });
        }
        return { rows, badge: { failing, baseline } };
      },
    },
    duplicates: {
      label: "Exact duplicate records",
      tip: "One id with several records is the norm - one item, several ways " +
           "to get it. The error is two records sharing an id AND a " +
           "byte-identical source.",
      compute() {
        // canonicalSource is the same helper the buffer's dup check uses, so the two never drift.
        const byComposite = new Map();   // "id|canonical(source)" -> records
        const cats = new Map();          // id -> Set<category>
        const perId = new Map();         // id -> record count
        for (const r of state.records) {
          if (!Number.isInteger(r.id)) continue;
          const ck = `${r.id}|${canonicalSource(r.source)}`;
          if (!byComposite.has(ck)) byComposite.set(ck, []);
          byComposite.get(ck).push(r);
          if (!cats.has(r.id)) cats.set(r.id, new Set());
          cats.get(r.id).add(r._category);
          perId.set(r.id, (perId.get(r.id) || 0) + 1);
        }

        const rows = [];
        for (const [ck, recs] of byComposite) {
          if (recs.length < 2) continue;
          const canon = ck.slice(ck.indexOf("|") + 1);
          for (const r of recs) {
            rows.push({
              id: r.id, key: r._key,
              detail: `${recs.length} records with an identical source in ` +
                      `${r._category}: ${truncate(canon, 120)}`,
            });
          }
        }

        // The legitimate ones are counted, not listed - they are the norm.
        let multi = 0;
        let crossCat = 0;
        for (const [id, n] of perId) {
          if (n > 1) multi++;
          if ((cats.get(id)?.size || 0) > 1) crossCat++;
        }
        const summary =
          `${rows.length.toLocaleString()} record(s) are true duplicates. ` +
          `Legitimate multi-source ids, not listed: ${multi.toLocaleString()} ` +
          `id(s) carry more than one record, ${crossCat.toLocaleString()} of ` +
          `them across more than one data file.`;
        return { rows, summary };
      },
    },
    repeatednotes: {
      label: "Notes that repeat",
      tip: "An Extra detail that is free text, not a stored value, and turns " +
           "up on more than one record - shared authored text wants to become " +
           "a vocabulary entry.",
      groupable: true, preSorted: true,
      compute() {
        const groups = new Map();        // note text -> records
        for (const r of state.records) {
          const note = r.source?.note;
          if (note == null || note === "") continue;
          if (isNoteSymbol(state.enums, note)) continue;
          const txt = String(note);
          if (!groups.has(txt)) groups.set(txt, []);
          groups.get(txt).push(r);
        }
        const shared = [...groups.entries()]
          .filter(([, recs]) => recs.length > 1)
          .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

        const rows = [];
        for (const [txt, recs] of shared) {
          const group = { key: `note:${txt}`, label: txt, promote: txt };
          for (const r of recs) {
            rows.push({
              id: r.id, key: r._key, group,
              detail: `“${txt}” - shared by ${recs.length} records ` +
                      `(${r._category})`,
            });
          }
        }
        const summary = shared.length
          ? `${rows.length.toLocaleString()} record(s) over ${shared.length} ` +
            `distinct free-text note(s) used more than once.`
          : "No free-text note is shared by more than one record.";
        return { rows, summary };
      },
    },
    notesymbol: {
      label: "Notes that look like a code word",
      tip: "An Extra detail shaped like a stored symbol rather than like " +
           "something a player would read - it probably wants to be a " +
           "vocabulary entry instead of free text.",
      groupable: true,
      compute() {
        // The whole vocabulary space, symbols and labels, normalised. A note that is one of them is the strongest signal; the shape tests (SCREAMING_SNAKE, SI_ prefix) catch the rest.
        const vocab = vocabularyIndex();
        const rows = [];
        const texts = new Set();
        for (const r of state.records) {
          const note = r.source?.note;
          if (note == null || note === "") continue;
          if (isNoteSymbol(state.enums, note)) continue;
          const txt = String(note);
          const hit = vocab.get(normaliseLabel(txt));
          const shaped = CODE_WORD_RE.test(txt) || txt.startsWith("SI_");
          if (!hit && !shaped) continue;
          texts.add(txt);
          rows.push({
            id: r.id, key: r._key,
            group: { key: `note:${txt}`, label: txt, promote: txt },
            detail: hit
              ? `“${txt}” is already a value in enums.${hit.enumKey} ` +
                `(${hit.symbol}) - store the symbol instead?`
              : `“${txt}” is shaped like a stored symbol, not like something ` +
                `a player would read.`,
          });
        }
        const summary = rows.length
          ? `${rows.length.toLocaleString()} record(s) over ${texts.size} ` +
            `distinct note text(s).`
          : "No free-text note looks like a code word.";
        return { rows, summary };
      },
    },
    datanote: {
      label: "Records with a data note",
      tip: "The exporter or a maintainer wrote down what was approximated or " +
           "is missing upstream. The note never reaches the game - it only " +
           "lives on this site. Do not clear it.",
      groupable: true,
      compute() {
        const rows = [];
        const texts = new Set();
        for (const r of state.records) {
          const note = r.notes;
          if (note == null || note === "") continue;
          const txt = String(note);
          texts.add(txt);
          rows.push({
            id: r.id, key: r._key,
            group: { key: `data:${txt}`, label: txt },
            detail: truncate(txt, 160),
          });
        }
        const summary = rows.length
          ? `${rows.length.toLocaleString()} record(s) carry a data note, ` +
            `over ${texts.size} distinct text(s). The note stays on this ` +
            `site; the build removes it.`
          : "No record carries a data note.";
        return { rows, summary };
      },
    },
    unplacedleaves: {
      label: "Sources this site has not sorted",
      tip: "Records whose kind of source lands in the computed “Other” group. " +
           "Not an error: it means this site has not decided where that kind " +
           "belongs yet.",
      groupable: true, preSorted: true,
      compute() {
        const tax = buildTaxonomy(state.enums || {}, state.records);
        const unplaced = tax.catchAll.filter((l) => (tax.counts[l] || 0) > 0);
        const byLeaf = new Map(unplaced.map((l) => [l, []]));
        for (const r of state.records) {
          const bucket = byLeaf.get(leafOf(r));
          if (bucket) bucket.push(r);
        }
        const rows = [];
        for (const [leaf, recs] of byLeaf) {
          const group = { key: `leaf:${leaf}`, label: leaf, leaf };
          for (const r of recs) {
            rows.push({
              id: r.id, key: r._key, leaf, group,
              detail: `${sourceTypeLabel(r.source?.type)} - leaf "${leaf}", ` +
                      `${recs.length} record(s), in the computed “Other” group`,
            });
          }
        }
        let summary = unplaced.length
          ? `${unplaced.length} kind(s) of source with records are unsorted: ` +
            unplaced.map((l) => `${l} (${tax.counts[l]})`).join(", ") +
            `. ${tax.catchAll.length - unplaced.length} further one(s) are ` +
            `unsorted but carry no records.`
          : "Every kind of source that carries records is sorted into a group.";
        if (tax.unknown.length) {
          summary += ` DRIFT: ${tax.unknown.join(", ")} appear(s) in the data ` +
                     `but not in the contract's enumeration.`;
        }
        return { rows, summary };
      },
    },
    missingcost: {
      label: "Missing a price",
      tip: "Records you buy the item from but that carry no price - a likely " +
           "gap. Drops, rumours and crates are excluded, and so is a Crown " +
           "Store record sold inside a pack or bundle: the pack carries the " +
           "price, not the item.",
      compute() {
        // Vendor-ish source types expect a purchase, so an empty cost is suspicious. Crate/drop/rumour/recipe legitimately have no cost.
        const costExpected = new Set([
          "vendor", "pvp_vendor", "writ_vendor",
          "luxury", "event_vendor", "crown_store",
        ]);
        const rows = [];
        let inPack = 0;
        for (const r of state.records) {
          const src = r.source || {};
          if (!costExpected.has(src.type)) continue;
          if (Array.isArray(r.cost) && r.cost.length > 0) continue;
          // A crown_store row carrying `pack`/`bundle` is the item as sold inside that pack: the Crowns price sits on the pack, and the item's own price, if any, is a second bare-source crown_store record (crown-store.js#isPriceSource).
          if (src.type === "crown_store" && (src.packs || src.bundle)) {
            inPack++;
            continue;
          }
          rows.push({
            id: r.id, key: r._key,
            detail: `${sourceTypeLabel(src.type)} with no price`,
          });
        }
        const summary = inPack
          ? `${rows.length.toLocaleString()} row(s). Not listed: ` +
            `${inPack.toLocaleString()} Crown Store record(s) sold inside a ` +
            `pack or bundle - those carry no price by design.`
          : "";
        return { rows, summary };
      },
    },
    unpaired: {
      label: "Unpaired blueprints",
      tip: "Blueprints whose furnishing ID is not recorded yet. Linking creates a replacement for maintainer review.",
      compute() {
        return { rows: state.records.filter(r => r.blueprint && !r.id).map(r => ({
          id: r.blueprint, key: r._key, detail: "Furnishing not linked",
        })) };
      },
    },
    missingname: {
      label: "Missing a name",
      tip: "Items whose display name is effectively absent - empty, a " +
           "generated placeholder (\"Item 94091\"), or the bare id. The name " +
           "file is an incomplete build artefact.",
      compute() {
        const rows = [];
        const seen = new Set();
        for (const r of state.records) {
          if (!Number.isInteger(r.id) || seen.has(r.id)) continue;
          const nm = nameOf(r.id);
          if (!isPlaceholderName(nm, r.id)) continue;
          seen.add(r.id);
          const shown = String(nm == null ? "" : nm).trim();
          rows.push({
            id: r.id, key: r._key,
            detail: shown === "" ? "empty name" : `placeholder name "${shown}"`,
          });
        }
        return { rows };
      },
    },
  };

  // Every symbol and label in every vocabulary, normalised, mapped back to its origin. Built per compute() so a value added this session counts immediately.
  function vocabularyIndex() {
    const idx = new Map();
    for (const [enumKey, list] of Object.entries(state.enums || {})) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const symbol = symbolOf(entry);
        if (!symbol) continue;
        const label = typeof entry === "string" ? null : entry.name;
        for (const cand of [symbol, label]) {
          const k = normaliseLabel(cand);
          if (k && !idx.has(k)) idx.set(k, { enumKey, symbol });
        }
      }
    }
    return idx;
  }

  // A value the vocabulary carries but the library defines no game id for (enums.json `undefined_in_library`). Derived from enums.json, never from a manifest key.
  function isKnownUpstream(record, finding) {
    if (finding.code === "undefined_in_library") return true;
    const m = /^source\.(.+)$/.exec(finding.field || "");
    const enumKey = m && SOURCE_ENUM_FIELD[m[1]];
    if (!enumKey) return false;
    const value = record.source?.[m[1]];
    if (value == null || value === "") return false;
    return Boolean(entryOf(state.enums, enumKey, value)?.undefined_in_library);
  }

  function render(container) {
    container.innerHTML = `
      <section class="maint-mask">
        <h2>Maintenance</h2>

        <div class="maint-tabs" role="tablist">
          <button id="maint-tab-check" class="maint-tab is-active">Check</button>
          <button id="maint-tab-sources" class="maint-tab">Sources</button>
          <button id="maint-tab-vocab" class="maint-tab">Vocabulary</button>
        </div>

        <div id="maint-check" class="maint-section">
          <div class="maint-filter-bar">
            <select id="maint-filter"></select>
            <span id="maint-count" class="muted"></span>
            <input id="maint-search" type="search" placeholder="search by id or name…">
            <span id="maint-badge" class="maint-badge" hidden></span>
          </div>
          <p id="maint-summary" class="muted maint-hint" hidden></p>
          <div id="maint-scroller" class="maint-scroller">
            <table class="maint-table">
              <thead><tr><th></th><th>id</th><th>name</th><th>what is wrong</th><th></th></tr></thead>
              <tbody id="maint-body"></tbody>
            </table>
          </div>
        </div>

        <div id="maint-sources" class="maint-section maint-sources" hidden></div>

        <div id="maint-vocab" class="maint-section" hidden>
          <div class="maint-enum-warn">
            Adding a value changes the shared vocabulary for everyone. Most
            missing values turn out to be a near-duplicate of one already
            there - check the highlighted chips first.
          </div>
          <div id="maint-enum-form" class="maint-enum-form">
            <label class="lc-field">
              <span>Vocabulary to extend</span>
              <select id="maint-enum-kind"></select>
            </label>
            <label class="lc-field">
              <span>New value <small class="muted">(UPPERCASE symbol - A–Z, 0–9, underscore)</small></span>
              <input id="maint-enum-value" type="text" autocomplete="off"
                     placeholder="e.g. NEW_VENDOR">
            </label>
            <button id="maint-enum-add" class="btn-primary">Add value</button>
            <span id="maint-enum-status" class="muted"></span>
          </div>
          <div id="maint-enum-existing" class="maint-enum-existing"></div>
          <div class="maint-enum-pending">
            <h3>Values added this session</h3>
            <ul id="maint-enum-pending-list" class="maint-enum-pending-list"></ul>
          </div>
        </div>
      </section>`;

    $("#maint-tab-check").addEventListener("click", () => showSection("check"));
    $("#maint-tab-sources").addEventListener("click", () => showSection("sources"));
    $("#maint-tab-vocab").addEventListener("click", () => showSection("vocab"));

    const fsel = $("#maint-filter");
    for (const [k, f] of Object.entries(FILTERS)) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = f.label;
      o.title = f.tip;
      fsel.append(o);
    }
    fsel.value = view.filter;
    labelFilterCounts();
    fsel.addEventListener("change", (e) => {
      view.filter = e.target.value;
      view.expanded.clear();
      refreshCheck();
    });
    let searchTimer = null;
    $("#maint-search").addEventListener("input", (e) => {
      const v = e.target.value.toLowerCase();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        view.search = v;
        view.expanded.clear();
        refreshCheck();
      }, 150);
    });
    let raf = null;
    $("#maint-scroller").addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; renderTable(); });
    });
    if (deps.onRefDataShard) {
      deps.onRefDataShard(() => { if ($("#maint-body")) renderTable(); });
    }

    const ksel = $("#maint-enum-kind");
    for (const kind of ENUM_KINDS) {
      const o = document.createElement("option");
      o.value = kind.key;
      o.textContent = kindLabel(kind);
      o.title = `${kind.path} - enums.${kind.key}`;
      ksel.append(o);
    }
    ksel.addEventListener("change", () => {
      renderMetaFields();
      renderExistingEnum();
    });
    renderMetaFields();
    $("#maint-enum-add").addEventListener("click", () => addEnumValue());
    const enumInput = $("#maint-enum-value");
    // Auto-uppercase as the user types (symbols are uppercase), preserving the caret, then refresh the duplicate highlight.
    enumInput.addEventListener("input", (e) => {
      const el = e.target;
      const up = el.value.toUpperCase();
      if (up !== el.value) {
        const pos = el.selectionStart;
        el.value = up;
        el.setSelectionRange(pos, pos);
      }
      highlightDuplicateChip();
    });
    enumInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addEnumValue(); }
    });

    refreshCheck();
    renderExistingEnum();
    renderPendingEnums();
  }

  function showSection(which) {
    view.section = which;
    for (const name of ["check", "sources", "vocab"]) {
      $(`#maint-${name}`).hidden = which !== name;
      $(`#maint-tab-${name}`).classList.toggle("is-active", which === name);
    }
    if (which === "sources") drawSources();
  }

  // Sources section
  // Re-drawn on every show: the counts come from the records, which the other masks edit.
  function drawSources(opts = {}) {
    const host = $("#maint-sources");
    if (!host) return;
    renderSourcesSection(host, deps, opts);
  }

  // Health table

  // Each check's row count goes in its own option. One check per idle slice: the validity check walks the whole record set.
  let countRun = 0;
  function labelFilterCounts() {
    const run = ++countRun;
    const pending = Object.keys(FILTERS);
    const idle = typeof requestIdleCallback === "function"
      ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
      : (fn) => setTimeout(fn, 50);
    const step = () => {
      if (run !== countRun || !pending.length) return;
      const key = pending.shift();
      const opt = $(`#maint-filter option[value="${key}"]`);
      if (opt) {
        const n = FILTERS[key].compute().rows.length;
        opt.textContent = `${FILTERS[key].label} (${n.toLocaleString()})`;
      }
      idle(step);
    };
    idle(step);
  }

  function refreshCheck() {
    rebuildRows();
    const scroller = $("#maint-scroller");
    if (scroller) scroller.scrollTop = 0;
    renderTable();
  }

  function rebuildRows() {
    const f = FILTERS[view.filter];
    const { rows: computed, summary, badge } = f.compute();
    let rows = computed;
    const q = view.search;
    if (q) {
      rows = rows.filter((r) => {
        const nm = (nameOf(r.id) || "").toLowerCase();
        return nm.includes(q) || String(r.id).includes(q)
          || String(r.group?.label ?? "").toLowerCase().includes(q);
      });
    }
    if (!f.preSorted) rows.sort((a, b) => a.id - b.id);
    view.rows = rows;
    view.summary = summary || "";
    view.badge = badge || null;
    view.display = buildDisplay(f, rows);

    const sum = $("#maint-summary");
    if (sum) {
      sum.textContent = view.summary;
      sum.hidden = view.summary === "";
    }
    renderBadge();
  }

  // The virtualiser paints one flat array; a group row is followed by its record rows only while expanded. A groupable filter is always grouped: the unit of work is the text, and the group row is where "promote to vocabulary" lives.
  function buildDisplay(f, rows) {
    if (!f.groupable) {
      return rows.map((row) => ({ kind: "row", row }));
    }
    const byKey = new Map();
    for (const row of rows) {
      const g = row.group;
      if (!g) continue;
      let bucket = byKey.get(g.key);
      if (!bucket) { bucket = { group: g, rows: [] }; byKey.set(g.key, bucket); }
      bucket.rows.push(row);
    }
    const groups = [...byKey.values()].sort((a, b) =>
      b.rows.length - a.rows.length ||
      String(a.group.label).localeCompare(String(b.group.label)));
    const out = [];
    for (const g of groups) {
      out.push({ kind: "group", group: g.group, count: g.rows.length, sample: g.rows[0] });
      if (view.expanded.has(g.group.key)) {
        for (const row of g.rows) out.push({ kind: "row", row, child: true });
      }
    }
    return out;
  }

  // Grey while every failing record is a known upstream problem, amber the moment one is not. Shown for the `invalid` filter only - its count carries the baseline.
  function renderBadge() {
    const el = $("#maint-badge");
    if (!el) return;
    const b = view.badge;
    if (!b) { el.hidden = true; return; }
    const over = b.failing - b.baseline;
    el.hidden = false;
    el.classList.toggle("is-baseline", over <= 0);
    el.classList.toggle("is-over", over > 0);
    el.textContent = over > 0
      ? `${b.failing} failing - ${over} beyond the known ${b.baseline}`
      : `${b.failing} failing - all known problems in the source data`;
    el.title = over > 0
      ? "More records fail than the known-bad vocabulary values account for."
      : "Every failing record fails on a value the game data does not define. " +
        "Nothing new is broken.";
  }

  function renderTable() {
    const tbody = $("#maint-body");
    const scroller = $("#maint-scroller");
    if (!tbody || !scroller) return;
    const total = view.display.length;
    const virtual = total > VIRT_MIN;

    let first = 0;
    let last = total;
    if (virtual) {
      const viewH = scroller.clientHeight || 500;
      first = Math.max(0, Math.floor(scroller.scrollTop / ROW_H) - OVERSCAN);
      last = Math.min(total, first + Math.ceil(viewH / ROW_H) + OVERSCAN * 2);
    }

    tbody.innerHTML = "";
    if (first > 0) tbody.append(spacerRow(first * ROW_H));
    for (let i = first; i < last; i++) {
      const item = view.display[i];
      tbody.append(item.kind === "group" ? groupTr(item) : recordTr(item));
    }
    if (last < total) tbody.append(spacerRow((total - last) * ROW_H));

    const grouped = view.display.some((d) => d.kind === "group");
    $("#maint-count").textContent = grouped
      ? `${countGroups().toLocaleString()} group(s), ` +
        `${view.rows.length.toLocaleString()} record(s)`
      : `${total.toLocaleString()} row${total === 1 ? "" : "s"}` +
        (virtual ? ` - showing ${first + 1}–${last}` : "");
  }

  function countGroups() {
    return view.display.filter((d) => d.kind === "group").length;
  }

  function groupTr(item) {
    const tr = elem("tr", { class: "maint-row-group" });

    const togTd = elem("td");
    const open = view.expanded.has(item.group.key);
    const tog = elem("button", {
      class: "btn-mini maint-expander",
      title: open ? "Hide the records" : `Show the ${item.count} record(s)`,
    }, open ? "▾" : "▸");
    tog.addEventListener("click", () => {
      if (open) view.expanded.delete(item.group.key);
      else view.expanded.add(item.group.key);
      view.display = buildDisplay(FILTERS[view.filter], view.rows);
      renderTable();
    });
    togTd.append(tog);
    tr.append(togTd);

    const idTd = elem("td");
    idTd.append(itemLinkAnchor(item.sample.id, item.sample.id));
    tr.append(idTd);
    tr.append(elem("td", { class: "maint-name" },
      nameOf(item.sample.id) || "(no name)"));

    const detail = elem("td", { class: "maint-detail", title: item.group.label });
    detail.append(elem("strong", {}, `${item.count.toLocaleString()} records`));
    detail.append(` - “${truncate(item.group.label, 120)}”`);
    tr.append(detail);

    tr.append(elem("td", {}, groupActions(item.group)));
    return tr;
  }

  function groupActions(group) {
    const wrap = elem("span", { class: "maint-actions" });
    if (group.promote != null) wrap.append(promoteButton(group.promote));
    if (group.leaf) wrap.append(sourcesButton(group.leaf));
    return wrap;
  }

  function recordTr(item) {
    const row = item.row;
    const tr = elem("tr", { class: item.child ? "maint-row-child" : "" });

    const iconTd = elem("td");
    iconTd.append(itemIconImg(row.id, nameOf(row.id) || `item ${row.id}`));
    tr.append(iconTd);

    const idTd = elem("td");
    idTd.append(itemLinkAnchor(row.id, row.id));
    tr.append(idTd);

    tr.append(elem("td", { class: "maint-name" }, nameOf(row.id) || "(no name)"));

    const detail = elem("td", { class: "maint-detail muted" }, row.detail || "");
    if (row.known) {
      // Grey, not amber: it is not something the contributor did.
      detail.append(elem("span", { class: "maint-known" },
        "Known problem in the source data - not something you did."));
    }
    tr.append(detail);

    const actTd = elem("td");
    const acts = elem("span", { class: "maint-actions" });
    const fix = elem("button", { class: "btn-mini btn-primary maint-fix" }, "Quick Edit");
    fix.addEventListener("click", () => openFix(row.key));
    acts.append(fix);
    const jump = elem("button", { class: "btn-mini maint-secondary" },
      "Open in Batch edit");
    jump.addEventListener("click", () => switchToBatchEdit(row.key));
    acts.append(jump);
    if (row.leaf) acts.append(sourcesButton(row.leaf));
    actTd.append(acts);
    tr.append(actTd);
    return tr;
  }

  // Batch edit is the fallback while maskDeps provides no openQuickEdit.
  function openFix(key) {
    if (typeof deps.openQuickEdit === "function") deps.openQuickEdit(key);
    else switchToBatchEdit(key);
  }

  // A repeated or code-word note into the Vocabulary section, prefilled. It does not rewrite the records; it produces the `add-enum` line that makes the rewrite possible.
  function promoteButton(text) {
    const b = elem("button", {
      class: "btn-mini maint-secondary",
      title: "Open the Vocabulary section with this note prefilled as a new " +
             "enums.places entry.",
    }, "Promote to a vocabulary entry");
    b.addEventListener("click", () => {
      showSection("vocab");
      prefillVocabulary("places", String(text));
    });
    return b;
  }

  // An unsorted kind of source to its position in the Sources catch-all, where the subtraction that put it there is visible.
  function sourcesButton(leaf) {
    const b = elem("button", {
      class: "btn-mini maint-secondary",
      title: "Show this kind of source in the computed “Other” group.",
    }, "Show in Sources");
    b.addEventListener("click", () => {
      showSection("sources");
      drawSources({ focusLeaf: leaf });
    });
    return b;
  }

  function spacerRow(h) {
    const tr = document.createElement("tr");
    tr.className = "spacer";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.style.height = `${h}px`;
    td.style.padding = "0";
    td.style.border = "none";
    tr.append(td);
    return tr;
  }

  // Vocabulary editor

  function kindOf(key) {
    return ENUM_KINDS.find((k) => k.key === key)
      || { key, path: key, label: key, meta: [] };
  }

  function currentKind() {
    return kindOf($("#maint-enum-kind").value);
  }

  // Vocabularies are arrays of {symbol,...} objects; a flat string array (currencies) still works.
  function enumSymbols(enumKey) {
    return (state.enums[enumKey] || []).map(symbolOf);
  }

  // {symbol, id, title} entries in enums.json order, not alphabetical. `id` is the vocabulary's own numeric id where it has one, else the 1-based position: an SI-backed vocabulary has no short number, and the full SI string would swamp the chip. `title` carries the entry's whole metadata as a tooltip.
  function enumEntries(kind) {
    const list = state.enums[kind.key] || [];
    const idField = kind.meta.find((f) => f.type === "int");
    return list.map((v, i) => {
      if (typeof v === "string") return { symbol: v, id: i + 1, title: v };
      const natural = idField ? v[idField.key] : null;
      const title = Object.entries(v)
        .filter(([k]) => k !== "symbol")
        .map(([k, val]) => `${k}: ${val}`)
        .join(", ");
      return {
        symbol: v.symbol,
        id: natural != null ? natural : i + 1,
        title: title || v.symbol,
      };
    });
  }

  function renderExistingEnum() {
    const host = $("#maint-enum-existing");
    if (!host) return;
    const kind = currentKind();
    host.innerHTML = "";
    const entries = enumEntries(kind);
    host.append(elem("h3", { class: "maint-enum-existing-head",
      title: `${kind.path} - enums.${kind.key}, in database order` },
    `${kindLabel(kind)} - ${entries.length} value(s)`));
    const wrap = elem("div", { class: "maint-enum-chips" });
    for (const e of entries) {
      const chip = elem("span", { class: "maint-enum-chip", title: e.title });
      chip.dataset.symbol = e.symbol;
      chip.append(elem("span", { class: "maint-enum-chip-id" }, `${e.id}:`));
      chip.append(elem("span", { class: "maint-enum-chip-sym" }, e.symbol));
      wrap.append(chip);
    }
    host.append(wrap);
    highlightDuplicateChip();
  }

  // Live match highlight, two tiers:
  //   * exact (.is-dup): equals an existing symbol; blocks the Add button.
  //   * partial (.is-near): a substring either way, a near-duplicate (LUX vs LUXF); visual only, does not block Add.
  // The vocabularies are tens of values, so this runs unthrottled on input.
  function highlightDuplicateChip() {
    const host = $("#maint-enum-existing");
    const input = $("#maint-enum-value");
    const addBtn = $("#maint-enum-add");
    if (!host || !input || !addBtn) return;
    const val = input.value.trim().toUpperCase();
    let matched = false;          // an EXACT match - blocks Add
    for (const chip of host.querySelectorAll(".maint-enum-chip")) {
      const sym = chip.dataset.symbol;
      const isDup = val !== "" && sym === val;
      const isNear = val !== "" && !isDup
        && (sym.includes(val) || val.includes(sym));
      chip.classList.toggle("is-dup", isDup);
      chip.classList.toggle("is-near", isNear);
      if (isDup) matched = true;
    }
    if (matched) {
      addBtn.disabled = true;
      addBtn.textContent = "Already exists";
      addBtn.classList.add("is-dup");
    } else {
      addBtn.disabled = false;
      addBtn.textContent = "Add value";
      addBtn.classList.remove("is-dup");
    }
  }

  // Rendered in place as plain .lc-field children of the flex form, so the layout needs no special case.
  function renderMetaFields() {
    const form = $("#maint-enum-form");
    const addBtn = $("#maint-enum-add");
    if (!form || !addBtn) return;
    for (const old of form.querySelectorAll("[data-meta-field]")) old.remove();

    const kind = currentKind();
    const list = state.enums[kind.key] || [];
    for (const f of kind.meta) {
      const label = elem("label", { class: "lc-field", "data-meta-field": f.key });
      const small = [f.required ? "" : "optional", f.hint].filter(Boolean).join(" - ");
      label.append(elem("span", {}, f.label, " ",
        elem("small", { class: "muted" }, small ? `(${small})` : "")));
      const input = elem("input", {
        id: metaInputId(f), type: f.type === "int" ? "number" : "text",
        autocomplete: "off",
      });
      if (f.type === "int") {
        input.min = String(f.min ?? 1);
        input.step = "1";
      }
      if (f.prefill) input.value = String(f.prefill(list));
      label.append(input);
      form.insertBefore(label, addBtn);
    }
  }

  function metaInputId(field) {
    return `maint-enum-meta-${field.key}`;
  }

  // Returns { meta } or { error }; `meta` is null for a flat string vocabulary.
  function readMeta(kind) {
    if (!kind.meta.length) return { meta: null };
    const list = state.enums[kind.key] || [];
    const meta = {};
    for (const f of kind.meta) {
      const el = $(`#${metaInputId(f)}`);
      const raw = (el?.value ?? "").trim();
      if (raw === "") {
        if (f.required) return { error: `enter the ${f.label}.` };
        continue;
      }
      let value = raw;
      if (f.type === "int") {
        value = parseInt(raw, 10);
        const min = f.min ?? 1;
        if (!Number.isInteger(value) || value < min) {
          return { error: `${f.label} must be a whole number >= ${min}.` };
        }
      } else if (f.pattern && !f.pattern.test(raw)) {
        return { error: `${f.label} must be ${f.patternHint}.` };
      }
      if (f.unique) {
        const taken = list.some((v) => typeof v !== "string" && v?.[f.key] === value);
        if (taken) {
          return { error: `${f.label} ${value} is already taken in enums.${kind.key}.` };
        }
      }
      meta[f.key] = value;
    }
    return { meta };
  }

  function suggestSymbol(text) {
    let s = String(text).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!/^[A-Z]/.test(s)) s = `X_${s}`;
    return s.slice(0, 40).replace(/_+$/, "");
  }

  // Landing point of the "Promote to a vocabulary entry" link: the game id the entry needs is the one thing only a human can supply.
  function prefillVocabulary(kindKey, text) {
    const ksel = $("#maint-enum-kind");
    if (!ksel) return;
    ksel.value = kindKey;
    renderMetaFields();
    renderExistingEnum();
    const symbol = suggestSymbol(text);
    $("#maint-enum-value").value = symbol;
    const nameEl = $("#maint-enum-meta-name");
    if (nameEl) nameEl.value = text;
    highlightDuplicateChip();
    const status = $("#maint-enum-status");
    status.className = "muted";
    status.textContent =
      `Prefilled from “${truncate(text, 60)}”. Add the SI string id, and ` +
      `check the highlighted chips for a near-duplicate first.`;
    const si = $("#maint-enum-meta-si");
    (si || $("#maint-enum-value")).focus();
  }

  function addEnumValue() {
    const kind = currentKind();
    const raw = $("#maint-enum-value").value.trim();
    const status = $("#maint-enum-status");
    const setErr = (msg) => {
      status.textContent = msg;
      status.className = "v-error";
    };

    if (!raw) return setErr("enter a value.");

    // An entry carries the game id its label resolves from, so a bare symbol is not usable; the extras ride the buffer entry and the diff line as `meta`.
    const { meta, error } = readMeta(kind);
    if (error) return setErr(error);

    const res = queueEnumValue(state, kind.key, raw, meta);
    if (!res.ok) return setErr(res.error);

    status.textContent = `queued: enums.${kind.key} += "${raw}". See Review & Submit.`;
    status.className = "v-ok";
    $("#maint-enum-value").value = "";
    renderMetaFields();          // clears the extras + re-prefills the ids
    $("#maint-enum-value").focus();
    renderExistingEnum();
    renderPendingEnums();
    renderFooter();
  }

  // Removing a pending value breaks exactly the buffered records that reference it, hence the count beside the remove button.
  function bufferedDependents(enumName, value) {
    const pick = ENUM_DEP_VALUES[enumName];
    if (!pick) return null;      // a vocabulary no record field draws from
    let n = 0;
    for (const e of state.buffer.entries.values()) {
      if (e.op !== "update" && e.op !== "add") continue;
      if (e.after && pick(e.after).includes(value)) n++;
    }
    return n;
  }

  function renderPendingEnums() {
    const ul = $("#maint-enum-pending-list");
    if (!ul) return;
    ul.innerHTML = "";
    const pending = [...state.buffer.entries.values()]
      .filter((e) => e.op === "add-enum");
    if (pending.length === 0) {
      ul.append(elem("li", { class: "muted" }, "none yet."));
      return;
    }
    for (const e of pending) {
      const li = elem("li", { class: "maint-enum-pending-item" });
      const metaTxt = e.meta
        ? ` (${Object.entries(e.meta).map(([k, v]) => `${k}: ${v}`).join(", ")})`
        : "";
      li.append(elem("code", {}, `enums.${e.enumName} += "${e.value}"${metaTxt}`));

      const dependents = bufferedDependents(e.enumName, e.value);
      if (dependents != null) {
        li.append(elem("span", {
          class: "maint-enum-deps" + (dependents > 0 ? " maint-dep-warn" : ""),
          title: "Records you have already changed that use this value. " +
                 "Removing it breaks exactly those.",
        }, dependents === 0
          ? "no change of yours uses it yet"
          : `${dependents} change${dependents === 1 ? "" : "s"} of yours ` +
            `use${dependents === 1 ? "s" : ""} it`));
      }

      const rm = elem("button", { class: "btn-mini" }, "remove");
      rm.addEventListener("click", () => {
        // Drop the buffer entry and undo the in-memory enum mirror.
        state.buffer.entries.delete(e.key);
        const list = state.enums[e.enumName];
        if (Array.isArray(list)) {
          const idx = list.findIndex((v) => symbolOf(v) === e.value);
          if (idx >= 0) list.splice(idx, 1);
        }
        renderMetaFields();
        renderExistingEnum();
        renderPendingEnums();
        renderFooter();
      });
      li.append(rm);
      ul.append(li);
    }
  }

  // Health views depend on records other masks may have changed; recompute, and the Sources counts and pending list too.
  function onShow() {
    if (!$("#maint-body")) return;
    rebuildRows();
    renderTable();
    if (view.section === "sources") drawSources();
    renderExistingEnum();
    renderPendingEnums();
  }

  return { id: "maintenance", label: "Maintenance", render, onShow };
}

// Shared helpers

function truncate(s, n) {
  const str = String(s);
  return str.length <= n ? str : `${str.slice(0, n - 1)}…`;
}

// The game's grammar markers ("Undaunted Enclaves^p,in") are not part of the words a contributor would type.
function normaliseLabel(s) {
  return String(s == null ? "" : s).split("^")[0].trim().toLowerCase();
}
