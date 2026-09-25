// The record editor. opts.partition "reduced" is the quick-edit modal: required fields plus an "Add a detail" expander. "open" is Batch edit, which also puts the schema path in every label's title.
// The record is mutated in place and `onChange` fires after every edit; the caller owns the dirty buffer, the validator and the diff.

import {
  versionsDesc, versionLabel, cratesDesc, crateLabel, latestVersion,
  symbolOf, symbolsOf, entryOf, labelOf, placementsText, effectivePlacements,
} from "./data.js";
import {
  labelFor, tipFor, sourceTypeLabel, orderedSourceTypes, valueLabel, subtypeVocab, NOT_IN_GAME_DATA,
} from "./lexicon.js";
import { messageFor, SOURCE_ENUM_FIELD, allowedSourceFields } from "./validate.js";

// Which side of the build a field lands on: "game" reaches the in-game addon DB, "browser" is stripped.
export const FIELD_META = {
  description: { translationClass: "browser" },
  notes: { translationClass: "browser" },
  name_overrides: { translationClass: "browser" },
  note: { translationClass: "game" },
};

// The validator's table, imported so a picker always offers the vocabulary the validator checks against. `subtype` is absent: its vocabulary depends on the source type (lexicon.subtypeVocab).
const ENUM_FIELD = SOURCE_ENUM_FIELD;

const INT_FIELDS = new Set(["achievement", "quest", "skill_rank", "pieces",
  "collectible", "part_of"]);
const INT_LIST_FIELDS = new Set(["houses"]);

// One date is left, but the group is how the form offers an absent date at all.
const AVAIL_DATES = [
  "availability.last_seen",
];
export const DATES_GROUP = "availability.dates";

const BATCH_PATHS = new Set(["cost", "availability.version"]);

export const SITE_ONLY_FIELDS = ["description", "notes", "name_overrides"];

// Where the ticked records disagree. No vocabulary contains it, and the caller writes only paths moved off their starting value, so a field left on it is never written.
export const MIXED = "\u0000mixed";
const MIXED_LABEL = "(mixed - leave unchanged)";

const NOTE_PLACEHOLDER = {
  guild_gift: "the guild's name, e.g. Aetherius Art",
  tome_pack: "the tome-pack keyword: armor | dawn | logic",
};

// Visibility rule

function hasSiteValue(record, field) {
  const v = record ? record[field] : null;
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

// `cost.0.amount` collapses onto `cost`, the row that renders it.
function findingPaths(findings) {
  const out = new Set();
  for (const f of [...(findings?.errors || []), ...(findings?.warnings || [])]) {
    const field = f && f.field;
    if (!field) continue;
    out.add(/^cost\./.test(field) ? "cost" : field);
  }
  return out;
}

/**
 * Which fields this record shows, which it offers to add, and which it can only display. Paths are lexicon paths (`source.vendor`, `cost`, `rarity`), so the caller can label anything it gets back.
 * @returns {{visible:string[], addable:string[], orphans:string[], readonly:string[], noContract:boolean}}
 */
export function partitionFields(record, contracts, findings) {
  const source = (record && record.source) || {};
  const c = contracts ? contracts[source.type] : null;
  const present = Object.keys(source).filter((k) => k !== "type");
  const readonly = SITE_ONLY_FIELDS.filter((f) => hasSiteValue(record, f));

  // No contract: the rule for what is legal is missing, so nothing renders as an input.
  if (!c) {
    return {
      visible: [], addable: [], orphans: [],
      readonly: [...present.map((f) => `source.${f}`), ...readonly],
      noContract: true,
    };
  }

  const required = c.required || [];
  const optional = c.optional || [];
  // Decides only what is shown first and what the expander offers, not what the record may hold. `note` is legal on every type.
  const featured = [];
  for (const f of [...required, ...optional, "note"]) {
    if (!featured.includes(f)) featured.push(f);
  }
  // A key outside every contract has no widget or vocabulary, so it is an orphan; inside, it is an ordinary field whatever this type features.
  const known = allowedSourceFields(contracts);
  const named = findingPaths(findings);

  // Required fields, fields with a value and fields with a finding are never behind the expander.
  const visSource = featured.filter((f) => (
    required.includes(f) || present.includes(f) || named.has(`source.${f}`)
  ));
  for (const f of present) {
    if (known.has(f) && !visSource.includes(f)) visSource.push(f);
  }
  for (const path of named) {
    if (!path.startsWith("source.")) continue;
    const f = path.slice("source.".length);
    if (known.has(f) && !visSource.includes(f)) visSource.push(f);
  }
  const orphans = present
    .filter((f) => !known.has(f))
    .map((f) => `source.${f}`);

  const visible = ["cost", "availability.version", ...visSource.map((f) => `source.${f}`)];
  const addable = featured
    .filter((f) => !visSource.includes(f))
    .map((f) => `source.${f}`);

  // A date the record has stays visible even when cleared to null: the contributor must see what they emptied.
  const av = (record && record.availability) || {};
  const datesVisible = AVAIL_DATES.filter((p) => (
    Object.prototype.hasOwnProperty.call(av, p.slice("availability.".length)) || named.has(p)
  ));
  visible.push(...datesVisible);
  if (datesVisible.length < AVAIL_DATES.length) addable.push(DATES_GROUP);


  if ((record && record.rarity) || named.has("rarity")) visible.push("rarity");
  else addable.push("rarity");

  return { visible, addable, orphans, readonly, noContract: false };
}

// DOM plumbing

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// `title` alone reaches neither keyboard nor touch, hence a focusable button with a sibling role="tooltip".
function tipAffordance(ctx, text, labelText, path = "") {
  if (!text) return null;
  const id = ctx.uid(`tip${ctx.seq++}`);
  const btn = h("button", {
    type: "button", class: "tip-btn", "aria-describedby": id,
    "aria-expanded": "false", "aria-label": `Explain: ${labelText}`,
  }, "?");
  const bubble = h("span", { class: "tip-bubble", role: "tooltip", id }, text,
    path && h("code", { class: "tip-path" }, path));
  const wrap = h("span", { class: "tip" }, btn, bubble);
  wrap.addEventListener("mouseenter", () => placeTip(btn, bubble));
  btn.addEventListener("focus", () => placeTip(btn, bubble));
  btn.addEventListener("click", () => {
    const open = wrap.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    placeTip(btn, bubble);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    wrap.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });
  return wrap;
}

// The bubble is fixed-position so no scrolling pane clips it; it shifts left at the right edge and flips above at the bottom.
const TIP_MARGIN = 8;
function placeTip(btn, bubble) {
  if (getComputedStyle(bubble).display === "none") return;
  const b = btn.getBoundingClientRect();
  const { width, height } = bubble.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const left = Math.max(TIP_MARGIN, Math.min(b.left, vw - width - TIP_MARGIN));
  let top = b.bottom + 5;
  if (top + height > vh - TIP_MARGIN) top = Math.max(TIP_MARGIN, b.top - height - 5);
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

// One tooltip at a time: a label with a bubble carries the schema path in the bubble and no `title`.
function fieldLabel(ctx, path, opts = {}) {
  const type = ctx.record.source?.type;
  const text = opts.text || labelFor(path, type);
  const el = h("label", { class: "form-label" }, text);
  if (opts.forId) el.setAttribute("for", opts.forId);
  if (opts.required) el.append(h("span", { class: "req" }, " *"));
  const showPath = ctx.opts.partition === "open" ? path : "";
  const tip = tipAffordance(ctx, opts.tip ?? tipFor(path, type), text, showPath);
  if (tip) {
    el.append(tip);
    el.classList.add("has-tip");
    el.addEventListener("mouseenter", () =>
      placeTip(tip.querySelector(".tip-btn"), tip.querySelector(".tip-bubble")));
  } else if (showPath) {
    el.title = path;
  }
  return el;
}

// A row marks itself invalid from its rendered error lines, so the mark and the message cannot disagree.
function row(labelEl, control, extras = [], block = false) {
  const r = h("div", { class: block ? "form-row form-row-block" : "form-row" },
    labelEl, control, ...extras.filter(Boolean));
  markRow(r);
  return r;
}

// Own error lines only: `querySelector` alone would reach into a nested row and paint the parent.
function markRow(r) {
  const own = [...r.querySelectorAll(".field-error")]
    .some((el) => el.closest(".form-row") === r);
  r.classList.toggle("is-invalid", own);
}

function readonlyValue(text) {
  return h("div", { class: "readonly-value" }, text === "" || text == null ? "(none)" : text);
}

function clearLink(onClear) {
  const a = h("button", { type: "button", class: "clear-link" }, "clear");
  a.addEventListener("click", onClear);
  return a;
}

// Vocabulary widgets

function optionText(enums, key, symbol) {
  const label = labelOf(enums, key, symbol);
  const base = label && label !== symbol ? `${label} (${symbol})` : symbol;
  return entryOf(enums, key, symbol)?.undefined_in_library ? base + NOT_IN_GAME_DATA : base;
}

// An entry the library does not define is offered only when the record already carries it.
function optionPairs(enums, key, current) {
  return symbolsOf(enums, key)
    .filter((s) => s === current || !entryOf(enums, key, s)?.undefined_in_library)
    .map((s) => ({ value: s, label: optionText(enums, key, s) }));
}

function flatPairs(enums, key) {
  const list = Array.isArray(enums[key]) ? enums[key] : [];
  return list.map((s) => ({ value: s, label: valueLabel(key, s) }));
}

// Every select carries an empty option, required or not, so a required field can be cleared and the validator can say so. `empty: false` is for currency: an amount with no currency is Gold, so a blank choice would state something the data cannot mean.
function selectFromPairs(name, value, pairs, opts = {}) {
  const sel = h("select", { name, "data-field": name });
  if (value === MIXED) {
    const o = h("option", { value: MIXED }, MIXED_LABEL);
    o.selected = true;
    sel.append(o);
  }
  if (opts.empty !== false) sel.append(h("option", { value: "" }, "(none)"));
  const v = value === MIXED ? "" : value ?? "";
  if (v !== "" && !pairs.some((p) => p.value === v)) {
    // A stored value the vocabulary lacks is kept and marked: the editor must surface it.
    pairs = [{ value: v, label: `${v} - not in the list` }, ...pairs];
  }
  for (const p of pairs) {
    const o = h("option", { value: p.value }, p.label);
    if (p.value === v) o.selected = true;
    sel.append(o);
  }
  return sel;
}

function isUndefinedInLibrary(enums, key, value) {
  return Boolean(value && entryOf(enums, key, value)?.undefined_in_library);
}

// Int lists

export function parseIntList(raw) {
  const values = [];
  const invalid = [];
  for (const tok of String(raw).split(/[,;\s]+/)) {
    if (tok === "") continue;
    if (/^-?\d+$/.test(tok)) values.push(parseInt(tok, 10));
    else invalid.push(tok);
  }
  return { values, invalid };
}

export function formatIntList(list) {
  return Array.isArray(list) ? list.join(", ") : (list ?? "");
}

function renderIntList(ctx, field, id) {
  const source = ctx.record.source;
  const wrap = h("div", { class: "int-list" });
  const input = h("input", {
    type: "text", id,
    value: formatIntList(source[field]),
    placeholder: "(comma-separated ids)",
    "data-field": `source.${field}`,
  });
  const warn = h("p", { class: "field-error", hidden: true });
  input.addEventListener("input", (e) => {
    const { values, invalid } = parseIntList(e.target.value);
    if (values.length === 0) delete source[field];
    else source[field] = values;
    warn.textContent = invalid.length ? `not a number, ignored: ${invalid.join(", ")}` : "";
    warn.hidden = invalid.length === 0;
    wrap.classList.toggle("is-invalid", invalid.length > 0);
    ctx.onChange();
  });
  wrap.append(input, warn, clearLink(() => {
    input.value = "";
    delete source[field];
    warn.hidden = true;
    wrap.classList.remove("is-invalid");
    ctx.onChange();
  }));
  return wrap;
}

// source.locations

// A record with no placement inherits its vendor's; that is shown, never written.

function placementRow(ctx, index, repaint) {
  const list = ctx.record.source.locations;
  const placement = list[index];
  const row_ = h("div", { class: "placement-row" });

  const bind = (field, vocab) => {
    const sel = selectFromPairs(`source.locations.${index}.${field}`,
      placement[field] ?? "", optionPairs(ctx.enums, vocab, placement[field]));
    sel.addEventListener("change", (e) => {
      if (e.target.value === "") delete placement[field];
      else placement[field] = e.target.value;
      repaint();
      ctx.onChange();
    });
    return sel;
  };

  const remove = h("button", { type: "button", class: "clear-link" }, "remove");
  remove.addEventListener("click", () => {
    list.splice(index, 1);
    if (list.length === 0) delete ctx.record.source.locations;
    repaint();
    ctx.onChange();
  });

  row_.append(h("label", {}, "Zone", bind("location", "locations")), h("label", {}, "Place", bind("place", "places")), remove);
  row_.title = "Zone: Murkmire. Place: Lilmoth. Use both for a vendor in Lilmoth, Murkmire.";
  return row_;
}

function renderPlacements(ctx, id) {
  const source = ctx.record.source;
  const wrap = h("div", { class: "placement-list", id });

  const repaint = () => {
    wrap.textContent = "";
    const list = Array.isArray(source.locations) ? source.locations : [];
    list.forEach((_, i) => wrap.append(placementRow(ctx, i, repaint)));

    // The one invalid shape this widget can produce, so it is flagged at the row.
    const empty = list.some((p) => p.location == null && p.place == null);
    wrap.classList.toggle("is-invalid", empty);
    if (empty) {
      wrap.append(h("p", { class: "field-error" },
        "Each row needs a zone or a place."));
    }

    if (!list.length) {
      const { placements, inherited, vendor } = effectivePlacements(ctx.enums, source);
      if (inherited) {
        wrap.append(h("p", { class: "field-hint" },
          `Inherited from ${labelOf(ctx.enums, "vendors", vendor) || vendor}: `
          + `${placementsText(ctx.enums, placements)}. `
          + "Add a place to override it."));
      }
    }

    const add = h("button", { type: "button", class: "clear-link" }, "add a place");
    add.addEventListener("click", () => {
      if (!Array.isArray(source.locations)) source.locations = [];
      source.locations.push({});
      repaint();
      ctx.onChange();
    });
    wrap.append(add);
  };

  repaint();
  return wrap;
}

// Cost

// The defaults ship in enums.json so the form's prefill and the exporter never disagree.
function defaultCurrency(enums, sourceType) {
  const d = enums.currency_defaults || {};
  return d[sourceType] || d.default || "GOLD";
}

// One amount and one currency; emptying the amount removes the price. The currency shows the type's effective default rather than a blank.
function renderCostSingle(ctx, id) {
  const cost = ctx.record.cost;
  const enums = ctx.enums;
  const wrap = h("div", { class: "cost-row" });
  const amt = h("input", {
    type: "number", step: 1, min: 1, id,
    value: cost[0]?.amount ?? "",
    // An amount left empty is not written.
    placeholder: ctx.opts.mixed?.has("cost") ? MIXED_LABEL : null,
    "data-field": "cost.0.amount",
    "aria-label": labelFor("cost[].amount"),
  });
  const cur = selectFromPairs("cost.0.currency",
    cost[0]?.currency || defaultCurrency(enums, ctx.record.source?.type),
    flatPairs(enums, "currencies"), { empty: false });
  cur.setAttribute("aria-label", labelFor("cost[].currency"));
  const sync = () => {
    const raw = amt.value.trim();
    if (raw === "") {
      cost.length = 0;
      ctx.onChange();
      return;
    }
    const currency = cur.value || defaultCurrency(enums, ctx.record.source?.type);
    cur.value = currency;
    cost.length = 0;
    cost.push({ currency, amount: parseInt(raw, 10) || 0 });
    ctx.onChange();
  };
  amt.addEventListener("input", sync);
  cur.addEventListener("change", sync);
  wrap.append(amt, cur);
  return wrap;
}

// Batch edit only - the schema allows more than one price.
function renderCostRows(ctx) {
  const cost = ctx.record.cost;
  const enums = ctx.enums;
  const currencies = symbolsOf(enums, "currencies");
  const wrap = h("div", { class: "cost-rows" });
  const rerender = () => {
    wrap.innerHTML = "";
    cost.forEach((c, i) => {
      const cur = selectFromPairs(`cost.${i}.currency`,
        c.currency || defaultCurrency(enums, ctx.record.source?.type),
        flatPairs(enums, "currencies"), { empty: false });
      cur.setAttribute("aria-label", labelFor("cost[].currency"));
      cur.addEventListener("change", (e) => {
        cost[i].currency = e.target.value;
        ctx.onChange();
      });
      const amt = h("input", {
        type: "number", step: 1, min: 1, value: c.amount ?? 1,
        "data-field": `cost.${i}.amount`,
        "aria-label": labelFor("cost[].amount"),
      });
      amt.addEventListener("input", (e) => {
        cost[i].amount = parseInt(e.target.value, 10) || 0;
        ctx.onChange();
      });
      const rm = h("button", { type: "button", class: "btn-mini", "aria-label": "Remove this price" }, "x");
      rm.addEventListener("click", () => {
        cost.splice(i, 1);
        ctx.onChange();
        rerender();
      });
      wrap.append(h("div", { class: "cost-row" }, cur, amt, rm));
    });
    const add = h("button", { type: "button", class: "btn-mini" }, "+ price");
    add.addEventListener("click", () => {
      cost.push({
        currency: defaultCurrency(enums, ctx.record.source?.type)
          || currencies[0],
        amount: 1,
      });
      ctx.onChange();
      rerender();
    });
    wrap.append(add);
  };
  rerender();
  return wrap;
}

// source.note

function renderNoteField(ctx, id) {
  const source = ctx.record.source;
  const wrap = h("div", { class: "note-field" });
  const mixed = source.note === MIXED;
  const txt = h("input", {
    type: "text", id,
    value: mixed ? "" : source.note ?? "",
    placeholder: mixed ? MIXED_LABEL
      : NOTE_PLACEHOLDER[source.type] || "a one-off qualifier, in a few words",
    "data-field": "source.note",
  });
  const empty = () => {
    if (mixed) source.note = MIXED;
    else delete source.note;
  };
  txt.addEventListener("input", (e) => {
    const raw = e.target.value.trim();
    if (raw === "") empty();
    else source.note = raw;
    ctx.onChange();
  });
  wrap.append(h("div", { class: "note-combo" }, txt, clearLink(() => {
    txt.value = "";
    empty();
    ctx.onChange();
  })));
  return wrap;
}

// One source field

function sourceControl(ctx, field, id) {
  const source = ctx.record.source;
  const enums = ctx.enums;
  const value = source[field] ?? "";
  const name = `source.${field}`;

  if (field === "note") return { widget: renderNoteField(ctx, id), block: true };

  let widget;
  let block = false;
  if (field === "crate") {
    // Newest season first.
    const pairs = cratesDesc(enums)
      .map((c) => symbolOf(c))
      .filter((sym) => sym === value || !isUndefinedInLibrary(enums, "crates", sym))
      .map((sym) => ({
        value: sym,
        label: crateLabel(enums, sym) +
          (isUndefinedInLibrary(enums, "crates", sym) ? NOT_IN_GAME_DATA : ""),
      }));
    widget = selectFromPairs(name, value, pairs);
  } else if (field === "subtype") {
    widget = selectFromPairs(name, value, flatPairs(enums, subtypeVocab(source.type)));
  } else if (field === "locations") {
    return { widget: renderPlacements(ctx, id), block: true };
  } else if (ENUM_FIELD[field] && enums[ENUM_FIELD[field]]) {
    widget = selectFromPairs(name, value, optionPairs(enums, ENUM_FIELD[field], value));
  } else if (INT_LIST_FIELDS.has(field)) {
    return { widget: renderIntList(ctx, field, id), block: true };
  } else {
    const mixed = value === MIXED;
    widget = h("input", {
      type: INT_FIELDS.has(field) ? "number" : "text",
      step: INT_FIELDS.has(field) ? 1 : null,
      value: mixed ? "" : value, id, "data-field": name,
      placeholder: mixed ? MIXED_LABEL : null,
    });
  }
  if (widget.tagName === "SELECT") widget.id = id;

  if (widget.tagName === "SELECT") {
    widget.addEventListener("change", (e) => {
      if (e.target.value === "") delete source[field];
      else source[field] = e.target.value;
      ctx.onChange();
    });
  } else {
    const wasMixed = value === MIXED;
    widget.addEventListener("input", (e) => {
      const raw = e.target.value;
      // Emptying a mixed field again means leaving it alone, not clearing it on every ticked record.
      if (raw === "") {
        if (wasMixed) source[field] = MIXED;
        else delete source[field];
      } else if (/^-?\d+$/.test(raw)) source[field] = parseInt(raw, 10);
      else source[field] = raw;
      ctx.onChange();
    });
  }
  return { widget, block };
}

// A value the library does not define is read-only in the reduced view: the contributor must not "fix" it by inventing a different crate season.
function sourceRow(ctx, field) {
  const source = ctx.record.source;
  const enums = ctx.enums;
  const path = `source.${field}`;
  const required = (ctx.contract?.required || []).includes(field);
  const id = ctx.uid(path.replace(/\./g, "-"));
  const enumKey = ENUM_FIELD[field];

  if (ctx.opts.partition === "reduced" && enumKey &&
      isUndefinedInLibrary(enums, enumKey, source[field])) {
    const r = row(fieldLabel(ctx, path, { required }),
      readonlyValue(optionText(enums, enumKey, source[field])));
    r.classList.add("is-locked");
    return r;
  }
  if (source[field] === MIXED && (field === "locations" || INT_LIST_FIELDS.has(field))) {
    return row(fieldLabel(ctx, path, { required }), readonlyValue(MIXED_LABEL));
  }

  const { widget, block } = sourceControl(ctx, field, id);
  return row(fieldLabel(ctx, path, { required, forId: id }), widget,
    findingLines(ctx, path), block);
}

// The raw finding text stays in the title, for a maintainer.
// Each arrives in a host carrying the path, empty host and all, so `refreshFindings` can repaint a field without a rebuild, which would take the focus out of the control being typed into.
function findingLines(ctx, path) {
  return [h("div", { class: "field-findings", "data-findings": path },
    ...messageLines(ctx, path))];
}

function messageLines(ctx, path) {
  const out = [];
  const line = (cls, f) => h("p", { class: cls, title: `${f.field}: ${f.message}` },
    messageFor(f));
  // A bad amount has no row of its own, so the price row takes every `cost.<i>.<field>` finding.
  const mine = (f) => f.field === path || (path === "cost" && /^cost\./.test(f.field || ""));
  for (const f of ctx.findings.errors || []) {
    if (mine(f)) out.push(line("field-error", f));
  }
  for (const f of ctx.findings.warnings || []) {
    if (mine(f)) out.push(line("field-warn", f));
  }
  return out;
}

// Envelope rows

function versionRow(ctx) {
  const id = ctx.uid("availability-version");
  const enums = ctx.enums;
  const sel = selectFromPairs("availability.version", ctx.record.availability.version,
    versionsDesc(enums).map((v) => {
      const sym = symbolOf(v);
      return { value: sym, label: versionLabel(enums, sym) };
    }));
  sel.id = id;
  sel.addEventListener("change", (e) => {
    if (e.target.value === "") delete ctx.record.availability.version;
    else ctx.record.availability.version = e.target.value;
    ctx.onChange();
  });
  return row(fieldLabel(ctx, "availability.version", { required: true, forId: id }), sel,
    findingLines(ctx, "availability.version"));
}

function costRow(ctx) {
  // A batch edits one price: a repeater has no "mixed" state.
  const open = ctx.opts.partition === "open" && !ctx.opts.batch;
  const id = ctx.uid("cost-0-amount");
  // The repeater has no single control to point a label at; its rows carry their own aria-labels.
  const label = fieldLabel(ctx, "cost", { forId: open ? null : id });
  const control = open ? renderCostRows(ctx) : renderCostSingle(ctx, id);
  return row(label, control, findingLines(ctx, "cost"), open);
}

// Emptying a date the record had writes an explicit null; emptying one just typed removes the key, so a clean record stays clean.
function dateInput(ctx, path, onPaint) {
  const key = path.slice("availability.".length);
  const av = ctx.record.availability;
  const id = ctx.uid(path.replace(/\./g, "-"));
  const input = h("input", {
    type: "date", id, value: av[key] ?? "", "data-field": path,
  });
  input.addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "") {
      if (ctx.origAvail.has(key)) av[key] = null;
      else delete av[key];
    } else {
      av[key] = raw;
    }
    onPaint();
    ctx.onChange();
  });
  return { id, input };
}

function datesGroup(ctx, paths) {
  const wrap = h("div", { class: "dates-group" });
  for (const path of paths) {
    const { id, input } = dateInput(ctx, path, () => {});
    wrap.append(row(fieldLabel(ctx, path, { forId: id }), input, findingLines(ctx, path)));
  }
  return wrap;
}

function rarityRow(ctx) {
  const id = ctx.uid("rarity");
  const sel = selectFromPairs("rarity", ctx.record.rarity ?? "", flatPairs(ctx.enums, "rarities"));
  sel.id = id;
  sel.addEventListener("change", (e) => {
    if (e.target.value) ctx.record.rarity = e.target.value;
    else delete ctx.record.rarity;
    ctx.onChange();
  });
  return row(fieldLabel(ctx, "rarity", { forId: id }), sel, findingLines(ctx, "rarity"));
}

// A source key no contract names. validate.js makes it a blocking error, so without this removable row the record is unsaveable from every surface.
function orphanRow(ctx, path) {
  const field = path.slice("source.".length);
  const value = ctx.record.source[field];
  const label = fieldLabel(ctx, path);
  const rm = h("button", { type: "button", class: "btn-mini btn-remove" }, "Remove");
  rm.addEventListener("click", () => {
    delete ctx.record.source[field];
    ctx.onChange();
    ctx.rerender();
  });
  const r = row(label, h("div", { class: "orphan-value" },
    readonlyValue(Array.isArray(value) ? value.join(", ") : String(value ?? "")), rm),
  findingLines(ctx, path));
  r.classList.add("orphan-row");
  return r;
}

function batchNoteRow(ctx) {
  const notes = h("textarea", { rows: 2, "data-field": "notes",
    placeholder: ctx.record.notes === MIXED ? MIXED_LABEL : "Why are these records changing?" });
  notes.value = ctx.record.notes === MIXED ? "" : ctx.record.notes ?? "";
  notes.addEventListener("input", () => {
    if (notes.value.trim()) ctx.record.notes = notes.value;
    else if (ctx.opts.mixed?.has("notes")) ctx.record.notes = MIXED;
    else delete ctx.record.notes;
    ctx.onChange();
  });
  return row(fieldLabel(ctx, "notes"), notes, [], true);
}

// Site-only fieldset

function siteOnlyFieldset(ctx) {
  const mode = ctx.opts.webviewOnly || "edit";
  const fs = h("fieldset", { class: "form-fieldset form-fieldset-site" },
    h("legend", {}, "Only on this site"));
  const record = ctx.record;

  if (mode === "readonly") {
    let any = false;
    for (const field of SITE_ONLY_FIELDS) {
      if (!hasSiteValue(record, field)) continue;
      any = true;
      const v = field === "name_overrides"
        ? Object.entries(record.name_overrides).map(([k, s]) => `${k}: ${s}`).join(", ")
        : record[field];
      fs.append(row(fieldLabel(ctx, field), readonlyValue(v), [], true));
    }
    if (!any) fs.append(h("p", { class: "muted site-only-empty" }, "Nothing site-only on this record."));
    return fs;
  }

  const descId = ctx.uid("description");
  const desc = h("textarea", {
    rows: 2, id: descId,
    placeholder: "(optional)",
    "data-field": "description",
  });
  desc.value = record.description ?? "";
  desc.addEventListener("input", (e) => {
    const v = e.target.value;
    if (v.trim() === "") delete record.description;
    else record.description = v;
    ctx.onChange();
  });
  fs.append(row(fieldLabel(ctx, "description", { forId: descId }), desc, [], true));

  const notesId = ctx.uid("notes");
  const notes = h("textarea", {
    rows: 2, id: notesId,
    placeholder: "(optional)",
    "data-field": "notes",
  });
  notes.value = record.notes ?? "";
  notes.addEventListener("input", (e) => {
    const v = e.target.value;
    if (v.trim() === "") delete record.notes;
    else record.notes = v;
    ctx.onChange();
  });
  fs.append(row(fieldLabel(ctx, "notes", { forId: notesId }), notes, [], true));

  // The name_overrides map and its `en` key exist only while the box holds something other than the game's name, so saving untouched, or typing the game's name back, leaves the diff clean. Other keys are preserved.
  const known = typeof ctx.opts.knownName === "string" ? ctx.opts.knownName.trim() : "";
  const noId = ctx.uid("name-overrides-en");
  const no = h("input", {
    type: "text", id: noId,
    value: record.name_overrides?.en ?? known,
    placeholder: "(no name yet)",
    "data-field": "name_overrides.en",
  });
  no.addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (v === "" || v === known) {
      if (record.name_overrides) {
        delete record.name_overrides.en;
        if (Object.keys(record.name_overrides).length === 0) delete record.name_overrides;
      }
    } else {
      (record.name_overrides ??= {}).en = e.target.value;
    }
    ctx.onChange();
  });
  fs.append(row(fieldLabel(ctx, "name_overrides", { forId: noId }),
    h("div", { class: "name-override" }, no), [], true));
  return fs;
}

// The form

/**
 * @param {object} [opts]
 * @param {"reduced"|"open"} [opts.partition="open"]
 * @param {boolean} [opts.allowIdEdit=false] true only for a new record
 * @param {boolean} [opts.allowTypeChange=true]
 * @param {"edit"|"readonly"|"hidden"} [opts.webviewOnly="edit"]
 * @param {string} [opts.idPrefix=""] prefixed onto every DOM id, so two forms can be open at once
 * @param {{errors:Array,warnings:Array}} [opts.findings]
 */
export function renderForm(record, enums, onChange, opts = {}) {
  record.source ??= { type: enums.source_types[0] };
  record.cost ??= [];
  record.availability ??= { version: latestVersion(enums) };

  const prefix = opts.idPrefix ? `${opts.idPrefix}-` : "";
  const form = h("form", {
    class: `edit-form ${opts.partition === "reduced" ? "is-reduced" : "is-open"}`,
    onSubmit: (e) => e.preventDefault(),
  });

  const ctx = {
    record, enums, opts,
    onChange: typeof onChange === "function" ? onChange : () => {},
    findings: opts.findings || { errors: [], warnings: [] },
    // Emptying a key the record arrived with writes null; emptying one the contributor added removes it.
    origAvail: new Set(Object.keys(record.availability)),
    seq: 0,
    uid: (s) => `${prefix}${s}`,
    contract: null,
    // Kept across a rebuild so changing the source type does not shut the expander under the contributor.
    expanderOpen: opts.expanderOpen === true,
    rerender: () => build(),
  };

  function build() {
    form.innerHTML = "";
    ctx.seq = 0;
    ctx.contract = enums.source_type_contracts?.[record.source.type] || null;
    // ctx.findings, not opts.findings: a rebuild after a repaint must partition on the current findings.
    const part = partitionFields(record, enums.source_type_contracts, ctx.findings);

    const game = h("fieldset", { class: "form-fieldset form-fieldset-game" },
      h("legend", {}, "Ships to the game database"));

    // The reduced partition omits the id and source-type rows: the quick-edit header already states both.
    const reduced = opts.partition === "reduced";
    // Batch edit's several-records panel: only the source, the price and the game update, each MIXED where the ticked records disagree.
    const batch = opts.batch === true;

    for (const field of ["id", "blueprint"]) {
      if (!opts.allowIdEdit && record[field] == null) continue;
      const idId = ctx.uid(field);
      const idInput = h("input", { type: "number", min: "1", step: "1", id: idId, value: record[field] ?? "", "data-field": field });
      if (opts.allowIdEdit) {
        idInput.addEventListener("input", (e) => {
          if (e.target.value === "") delete record[field];
          else record[field] = Number(e.target.value);
          ctx.onChange();
        });
      } else {
        idInput.readOnly = true;
        idInput.classList.add("is-readonly");
      }
      if (!reduced && !batch) {
        game.append(row(h("label", { for: idId }, field === "id" ? "Furnishing ID" : "Blueprint ID"), idInput,
          findingLines(ctx, field)));
      }
    }
    if (!reduced && !batch && opts.allowIdEdit) {
      game.append(h("p", { class: "muted" }, "Enter a furnishing ID, a blueprint ID, or both when the pair is known."));
    }
    if (!reduced && !batch && typeof opts.onPair === "function"
        && (record.source?.type === "recipe" || record.blueprint != null)) {
      const pair = h("button", { type: "button", class: "btn-mini form-pair" },
        "Link a blueprint and furnishing");
      pair.addEventListener("click", () => opts.onPair());
      game.append(row(h("span", {}), pair));
    }

    if (opts.allowTypeChange === false) {
      if (!reduced) {
        game.append(row(fieldLabel(ctx, "source.type"),
          readonlyValue(sourceTypeLabel(record.source.type))));
      }
    } else {
      const typeId = ctx.uid("source-type");
      const typeSel = selectFromPairs("source.type", record.source.type,
        orderedSourceTypes(enums.source_types).map((t) => ({ value: t, label: sourceTypeLabel(t) })));
      typeSel.id = typeId;
      typeSel.addEventListener("change", (e) => {
        // Carry the whole source across: a field the new type does not feature renders after the ones it does. `_category` is re-derived by the caller.
        const next = e.target.value;
        const carried = { type: next };
        for (const [k, v] of Object.entries(record.source)) {
          if (k !== "type") carried[k] = v;
        }
        // A subtype belongs to its type's vocabulary; carrying one the new type lacks makes the record invalid.
        if (carried.subtype != null && !symbolsOf(enums, `${next}_subtypes`).includes(carried.subtype)) {
          delete carried.subtype;
        }
        record.source = next === "ignored" ? { type: next } : carried;
        if (next === "ignored") record.cost = [];
        ctx.onChange();
        build();
      });
      game.append(row(fieldLabel(ctx, "source.type", { required: true, forId: typeId }), typeSel,
        findingLines(ctx, "source.type")));
    }

    if (!batch && !reduced) {
      const kind = selectFromPairs("container", record.container || "", [
        { value: "", label: "Not a container" }, { value: "books", label: "Book collection" }, { value: "folio", label: "Furnishing folio" },
      ]);
      kind.addEventListener("change", () => {
        if (kind.value) record.container = kind.value; else delete record.container;
        ctx.onChange();
      });
      game.append(row(h("label", {}, "Container kind"), kind));
    }

    // No one contract to lay mixed source kinds out by, so only what every kind has is offered.
    if (batch && record.source.type === MIXED) {
      game.append(h("p", { class: "muted" },
        "These records come from different kinds of source. Pick one above to " +
        "set it on all of them; their details stay as they are."));
      game.append(costRow(ctx), versionRow(ctx), batchNoteRow(ctx));
      form.append(game);
      return;
    }

    if (part.noContract) {
      game.append(h("p", { class: "no-contract" },
        `This site has no rule for "${record.source.type}" sources, so this ` +
        "record cannot be edited here. Pick a kind of source from the list."));
      for (const path of part.orphans) game.append(orphanRow(ctx, path));
      form.append(game);
      if ((opts.webviewOnly || "edit") !== "hidden") form.append(siteOnlyFieldset(ctx));
      return;
    }

    // Quick Edit leaves out rarity always, and the last-seen date outside Luxury records.
    const quickHidden = (p) => reduced && (p === "rarity" ||
      ((p === DATES_GROUP || AVAIL_DATES.includes(p)) && record.source.type !== "luxury"));
    const visible = part.visible.filter((p) => !quickHidden(p));

    const visibleDates = AVAIL_DATES.filter((d) => visible.includes(d));
    let datesDone = false;
    for (const path of visible) {
      if (batch && !BATCH_PATHS.has(path) && !path.startsWith("source.")) continue;
      if (path === "cost") game.append(costRow(ctx));
      else if (path === "availability.version") game.append(versionRow(ctx));
      else if (path === "rarity") game.append(rarityRow(ctx));
      else if (AVAIL_DATES.includes(path)) {
        if (datesDone) continue;
        datesDone = true;
        game.append(datesGroup(ctx, visibleDates));
      } else if (path.startsWith("source.")) game.append(sourceRow(ctx, path.slice(7)));
    }

    for (const path of part.orphans) game.append(orphanRow(ctx, path));

    // The expander holds only empty fields, so it is an add control and is labelled as one.
    const addable = batch
      ? part.addable.filter((p) => p.startsWith("source."))
      : part.addable.filter((p) => !quickHidden(p));
    if (addable.length) {
      const body = h("div", { class: "add-detail-body" });
      for (const path of addable) {
        if (path === DATES_GROUP) {
          body.append(datesGroup(ctx, AVAIL_DATES.filter((d) => !part.visible.includes(d))));
        } else if (path === "rarity") {
          body.append(rarityRow(ctx));
        } else if (path.startsWith("source.")) {
          body.append(sourceRow(ctx, path.slice(7)));
        }
      }
      const det = h("details", { class: "add-detail" },
        h("summary", {}, `Add a detail (${addable.length} possible)`), body);
      det.open = ctx.expanderOpen === true;
      det.addEventListener("toggle", () => { ctx.expanderOpen = det.open; });
      game.append(det);
    }

    if (batch) game.append(batchNoteRow(ctx));
    form.append(game);
    if (!batch && (opts.webviewOnly || "edit") !== "hidden") {
      form.append(siteOnlyFieldset(ctx));
    }
  }

  // Repaints each field's findings and mark in place, keeping focus and caret. Moving a field between the visible rows and the expander needs a rebuild.
  form.refreshFindings = (findings) => {
    ctx.findings = findings || { errors: [], warnings: [] };
    for (const host of form.querySelectorAll("[data-findings]")) {
      host.innerHTML = "";
      for (const line of messageLines(ctx, host.getAttribute("data-findings"))) {
        host.append(line);
      }
      const r = host.closest(".form-row");
      if (r) markRow(r);
    }
  };

  build();
  return form;
}
