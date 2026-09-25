// The quick-edit modal is a view: it renders through the same renderForm() as Batch edit with a reduced partition, validates with validateRecord() and saves through state.buffer.update(). Which fields a record shows is renderForm()'s decision; no per-type field list lives here.

import { labelFor, sourceTypeLabel, subtypeVocab } from "./lexicon.js";
import { entryOf } from "./data.js";
import { messageFor, sourceEnumFields } from "./validate.js";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Dispatched on `document` after a successful save. detail: {key, id}.
const SAVED_EVENT = "furcat:quick-edit-saved";

// The one open instance. `draft` is a deep copy the form mutates, so Cancel needs no undo; `before` holds the findings the record had when the modal opened.
let ui = null;

export function openQuickEdit(key, deps) {
  if (!deps || !deps.state) return;
  if (typeof deps.recordsForItem !== "function") {
    // The detail list, this header and Crown Store's "also:" note must read the item's records from one helper, or they disagree about ordering. No local fallback on purpose.
    throw new Error("quick-edit: deps.recordsForItem() is required (AN section 5.3)");
  }
  if (ui) { render(key); return; }   // already open - switch records in place

  const overlay = deps.elem("div", { class: "modal-backdrop qe-backdrop" });
  const inner = deps.elem("div", {
    class: "modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "qe-dialog-title",
  });
  overlay.append(inner);

  ui = {
    deps, key: null, draft: null, before: [],
    overlay, inner,
    restore: document.activeElement,
    timer: null,
    onKeydown: (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); closeQuickEdit(); return; }
      if (ev.key === "Tab") trapTab(ev);
    },
  };
  // On the document, not the overlay: a stray click outside must not leave the dialog unclosable by Escape.
  document.addEventListener("keydown", ui.onKeydown, true);
  document.body.append(overlay);
  render(key);
}

export function closeQuickEdit() {
  if (!ui) return;
  const { overlay, restore, timer } = ui;
  if (timer) clearTimeout(timer);
  document.removeEventListener("keydown", ui.onKeydown, true);
  overlay.remove();
  ui = null;
  if (restore && typeof restore.focus === "function" && restore.isConnected) {
    restore.focus();
  }
}

// Render

function render(key) {
  const { deps } = ui;
  const { state, elem } = deps;
  const live = recordOf(key);
  if (!live) { closeQuickEdit(); return; }

  ui.key = key;
  ui.draft = deepClone(live);
  ui.inner.innerHTML = "";

  // Save blocks on findings absent from this arrival set, never on the ones already there.
  const beforeProbe = { ...clean(live), _key: key, _category: live._category };
  ui.before = deps.validateRecord(beforeProbe, state.enums, state.records).errors;

  ui.inner.append(renderHeader(live));

  const body = elem("div", { class: "modal-body" });

  const onChange = () => {
    // Full validation walks the record set; coalesce keystrokes.
    if (ui.timer) clearTimeout(ui.timer);
    ui.timer = setTimeout(() => { ui.timer = null; paint(); }, 200);
  };
  const formEl = deps.renderForm(ui.draft, state.enums, onChange, {
    partition: "reduced",
    allowIdEdit: false,
    allowTypeChange: false,
    webviewOnly: "hidden",      // description / notes / name_overrides
    idPrefix: idPrefixFor(key),
    // The arrival findings: an errored field is never behind the expander, and a value flagged `undefined_in_library` renders read-only instead of inviting a different pick to make the red go away.
    findings: { errors: ui.before, warnings: [] },
  });
  body.append(formEl);
  ui.formHost = formEl;

  ui.findingsHost = elem("div", { class: "modal-findings" });
  body.append(ui.findingsHost);
  ui.inner.append(body);

  ui.status = elem("p", { class: "modal-status" });
  ui.saveBtn = elem("button", { class: "btn-primary modal-save" }, "Save change");
  ui.saveBtn.addEventListener("click", () => save());
  const cancelBtn = elem("button", { class: "modal-cancel" }, "Cancel");
  cancelBtn.addEventListener("click", () => closeQuickEdit());
  const batchLink = elem("button", { class: "modal-quiet", type: "button" },
    "Open in Batch edit instead");
  batchLink.addEventListener("click", () => jumpToBatchEdit());
  ui.inner.append(elem("div", { class: "modal-footer" },
    ui.status, cancelBtn, ui.saveBtn,
    elem("p", { class: "modal-escape" }, batchLink)));

  paint();
  focusFirst();
}

// Type alone does not name a record: one item can own several records of one type differing only in `location`.
function renderHeader(live) {
  const { deps } = ui;
  const { elem, nameOf } = deps;
  const head = elem("header", { class: "modal-header" });
  const itemId = live.id ?? live.blueprint;
  const name = nameOf(itemId) || "(unnamed item)";
  head.append(deps.itemIconImg(itemId, name));

  const lines = elem("div", { class: "modal-headings" });
  const title = elem("h2", { class: "modal-title", id: "qe-dialog-title" }, name, " ");
  title.append(deps.itemLinkAnchor(itemId, `#${itemId}`));
  lines.append(title);

  const loc = locatorLine(live);
  const locRow = elem("p", { class: "modal-locator" }, loc.text);
  if (loc.title) locRow.title = loc.title;
  lines.append(locRow);

  const siblings = deps.recordsForItem(itemId) || [];
  const n = siblings.findIndex((r) => r._key === live._key) + 1;
  const m = siblings.length || 1;
  lines.append(elem("p", { class: "modal-ordinal" },
    `record ${n || 1} of ${m} for this item`));

  // The item's other records, clickable: this stops a price being typed into the wrong record of the same item.
  const others = siblings.filter((r) => r._key !== live._key);
  if (others.length) {
    const also = elem("p", { class: "modal-also" }, elem("span", {}, "also:"));
    for (const other of others) {
      const oloc = locatorLine(other);
      const btn = elem("button", { class: "modal-also-link", type: "button" },
        oloc.text);
      if (oloc.title) btn.title = oloc.title;
      btn.addEventListener("click", () => render(other._key));
      also.append(btn);
    }
    lines.append(also);
  }
  head.append(lines);

  const closeBtn = elem("button", { class: "modal-close", "aria-label": "close" }, "×");
  closeBtn.addEventListener("click", () => closeQuickEdit());
  head.append(closeBtn);
  return head;
}

// Prefers app.js's `recordLocator`, since this header, the Batch-edit table and the change list have to agree word for word; the fallback matches changelist.js's.
function locatorLine(record) {
  const source = record?.source;
  const detail = sourceLocator(source);
  if (typeof ui.deps.recordLocator === "function") {
    return { text: ui.deps.recordLocator(record), title: detail.title };
  }
  const head = sourceTypeLabel(source?.type);
  return {
    text: detail.text ? `${head} - ${detail.text}` : head,
    title: detail.title,
  };
}

// Values in the line, field names in the title. Symbols, not resolved labels: this is a locator, and the form below shows the resolved names.
function sourceLocator(source) {
  if (!source) return { text: "", title: "" };
  const vals = [];
  const full = [];
  for (const [k, v] of Object.entries(source)) {
    if (k === "type" || k.startsWith("_")) continue;
    const shown = Array.isArray(v) ? v.join("/") : String(v);
    vals.push(shown);
    full.push(`${labelFor(`source.${k}`, source.type)}: ${shown}`);
  }
  return { text: vals.join(" · "), title: full.join("  ") };
}

// Findings: a delta over the same validator, not a second gate

function paint() {
  if (!ui || !ui.findingsHost) return;
  const { deps } = ui;
  const { state } = deps;
  const live = recordOf(ui.key);
  if (!live) return;

  const probe = { ...clean(ui.draft), _key: ui.key, _category: live._category };
  const { errors, warnings } = deps.validateRecord(probe, state.enums, state.records);
  const beforeSigs = new Set(ui.before.map(sig));
  const fresh = errors.filter((f) => !beforeSigs.has(sig(f)));
  const stale = errors.filter((f) => beforeSigs.has(sig(f)));

  const host = ui.findingsHost;
  host.innerHTML = "";
  for (const f of stale) host.append(preexistingLine(f, live));
  for (const f of [...fresh, ...warnings]) {
    host.append(deps.elem("p", {
      class: "warn modal-finding", title: `${f.field}: ${f.message}`,
    }, findingText(f)));
  }

  // The form painted the arrival findings when it rendered; this passes the whole current set.
  ui.formHost.refreshFindings?.({ errors, warnings });

  const blocked = fresh.length > 0;
  ui.saveBtn.disabled = blocked;
  ui.status.textContent = blocked ? "Fix the highlighted field to save." : "";
  ui.status.className = blocked ? "modal-status warn" : "modal-status";
}

// Grey, not amber: a problem the record already had is not this contributor's doing and must not read as their mistake.
function preexistingLine(f, live) {
  const type = live.source?.type;
  const field = bareField(f.field);
  const value = live.source ? live.source[field] : undefined;
  const opener = "This record already had a problem before you opened it: ";
  let text = opener + findingText(f);
  if (isLibraryUndefined(field, value, type, ui.deps.state.enums)) {
    text = `${opener}the ` +
      `${labelFor(`source.${field}`, type)} ${value} is not in the game data. ` +
      "That is a known problem in the source data, not something you did.";
  }
  return ui.deps.elem("p", { class: "muted modal-preexisting" }, text);
}

// The raw `field: message` is a schema path a contributor should never have to read; it stays in the line's title.
function findingText(f) {
  return messageFor(f);
}

function sig(f) {
  return `${f.field}|${f.message}`;
}

function bareField(path) {
  return String(path || "").replace(/^source\./, "");
}

// "Known" is derived from enums.json's `undefined_in_library` flag.
function isLibraryUndefined(field, value, sourceType, enums) {
  if (value == null || value === "") return false;
  const vocab = vocabFor(field, sourceType);
  if (!vocab) return false;
  const entry = entryOf(enums, vocab, value);
  return Boolean(entry && entry.undefined_in_library);
}

// The published `enums.source_field_vocabularies` pairing is the authority the validator also reads, so a picker offers exactly what it accepts. Pluralising is only a fallback for an older enums.json and gets `packs -> packses` wrong.
function vocabFor(field, sourceType) {
  const enums = ui?.deps?.state?.enums;
  if (!field || !enums) return null;
  if (field === "note") return "places";
  if (field === "subtype") return subtypeVocab(sourceType);
  const published = sourceEnumFields(enums)[field];
  if (published) return Array.isArray(enums[published]) ? published : null;
  const key = pluralise(field);
  return Array.isArray(enums[key]) ? key : null;
}

function pluralise(word) {
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

// Save

function save() {
  const { deps } = ui;
  const { state } = deps;
  const key = ui.key;
  const live = recordOf(key);
  if (!live) return;

  // Re-serialise the whole draft; copying only non-empty values would make emptying a field a silent no-op.
  const before = clean(deepClone(live));
  const after = dropPhantoms(before, clean(deepClone(ui.draft)));

  // The probe carries the row identity so the composite-dup check excludes the record from itself and the wrong-file rule can fire. `after` stays clean.
  const probe = { ...after, _key: key, _category: live._category };
  const { errors } = deps.validateRecord(probe, state.enums, state.records);
  const beforeSigs = new Set(ui.before.map(sig));
  if (errors.some((f) => !beforeSigs.has(sig(f)))) { paint(); return; }

  state.buffer.update(key, before, after, live._category);
  mirror(live, after);
  deps.applyFilters();
  deps.renderFooter();

  const id = live.id;
  closeQuickEdit();
  document.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { key, id } }));
  showToast(deps);
}

function showToast(deps) {
  document.querySelectorAll(".qe-toast").forEach((t) => t.remove());
  const n = deps.state.buffer.size();
  const toast = deps.elem("div", { class: "toast qe-toast", role: "status" },
    deps.elem("span", { class: "toast-text" },
      `Saved. ${n} change${n === 1 ? "" : "s"} ready to send.`));
  const send = deps.elem("button", { class: "btn-mini btn-primary" }, "Send now");
  send.addEventListener("click", () => {
    toast.remove();
    const btn = deps.$("#btn-submit");
    if (btn) btn.click();
  });
  const keep = deps.elem("button", { class: "btn-mini" }, "Keep editing");
  keep.addEventListener("click", () => toast.remove());
  toast.append(send, keep);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 12000);
}

function jumpToBatchEdit() {
  const { deps, key } = ui;
  closeQuickEdit();
  deps.switchToBatchEdit(key);
}

// Keyboard and focus

function trapTab(ev) {
  const all = [...ui.inner.querySelectorAll(FOCUSABLE)];
  // A control inside a closed <details> is unreachable, so it must not be the wrap point - unless nothing measures (no layout engine), where the unfiltered list is better than an empty one.
  const shown = all.filter(isVisible);
  const items = shown.length ? shown : all;
  if (items.length === 0) { ev.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (ev.shiftKey && (active === first || !ui.inner.contains(active))) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (active === last || !ui.inner.contains(active))) {
    ev.preventDefault();
    first.focus();
  }
}

function focusFirst() {
  const all = [...(ui.formHost?.querySelectorAll(FOCUSABLE) || [])];
  const target = all.find(isVisible) || all[0] || ui.inner.querySelector(".modal-close");
  if (target) target.focus();
}

function isVisible(el) {
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// Record helpers

function recordOf(key) {
  const { state } = ui.deps;
  return state.index?.get(key) || state.records.find((r) => r._key === key) || null;
}

function clean(record) {
  const o = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith("_")) o[k] = v;
  }
  return o;
}

// renderForm() fills in defaults a partial record is missing (`cost: []`); on a record that never carried the key that is not an edit. Only keys absent from `before` and still empty are dropped, so clearing a real value still reaches the diff.
function dropPhantoms(before, after) {
  for (const [k, v] of Object.entries(after)) {
    if (k in before) continue;
    if (Array.isArray(v) ? v.length === 0
      : v && typeof v === "object" && Object.keys(v).length === 0) {
      delete after[k];
    }
  }
  return after;
}

// Object.assign alone would leave a key the edit removed standing.
function mirror(live, after) {
  for (const k of Object.keys(live)) {
    if (!k.startsWith("_") && !(k in after)) delete live[k];
  }
  Object.assign(live, deepClone(after));
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

// `_key` contains "#", which is legal in a DOM id but breaks every CSS selector built from it.
function idPrefixFor(key) {
  return `qe-${String(key).replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
