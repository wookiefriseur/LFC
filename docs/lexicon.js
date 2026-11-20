// Contributor-facing labels. Every lookup falls back to a title-cased rendering of the key, so a value appended to enums.json gets a rough label and is never hidden. A tooltip may explain but never warn: anything whose absence would let a wrong record through belongs in visible text.

// The interface's own text: locale/en.js holds the English text by id, locale/<lang>.json the translations, { id: translation }.
// A text nobody translated is simply absent from that file and shows in English.
import en from "./locale/en.js";

const translations = new Map(); // language -> { id: translation }, once loaded
let translation = {};

/** Resolves with that language's translations, {} when it has none. Never rejects. */
export function loadInterfaceTranslation(language) {
  if (language === "en") return Promise.resolve({});
  if (translations.has(language)) return Promise.resolve(translations.get(language));
  return fetch(`./locale/${language}.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((map) => { translations.set(language, map); return map; });
}

/** What is loaded of that language, {} before loadInterfaceTranslation() brought it. */
export function interfaceTranslationOf(language) {
  return translations.get(language) || {};
}

export function setInterfaceTranslation(map) {
  translation = map && typeof map === "object" ? map : {};
}

const has = (id) => Object.hasOwn(en, id);

/** The text of that id in the chosen language, in English where it has none. `{name}` in it is filled from `values`. */
export function t(id, values) {
  const hit = translation[id];
  // An id the master file lacks shows as itself, which is how a mistyped one is noticed.
  const out = (typeof hit === "string" && hit) || (has(id) ? en[id] : id);
  return values ? out.replace(HOLE, (hole, name) => (name in values ? values[name] : hole)) : out;
}

const HOLE = /\{(\w+)\}/g;

/** A counted text: `<id>_one` for exactly one, `<id>` for any other number; `{n}` is the number unless `values` gives it. */
export function tn(n, id, values) {
  return t(n === 1 ? `${id}_one` : id, { n, ...values });
}

const englishSwitches = [];

/** Registers what else has a language: `enter` switches it to English and returns the function that switches it back. */
export function alsoInEnglish(enter) {
  englishSwitches.push(enter);
}

/** Runs `fn` with the interface text, and whatever registered itself, in English whatever language is chosen: for text that is sent to the maintainers. */
export function inEnglish(fn) {
  const chosen = translation;
  translation = {};
  const back = englishSwitches.map((enter) => enter());
  try { return fn(); } finally {
    back.forEach((undo) => undo());
    translation = chosen;
  }
}

/** The English texts by id, which is what the Translation list offers. */
export function englishTexts() {
  return en;
}

/** Throws unless `id` is a text of the interface and the translation fills the same `{name}` holes as its English text. */
export function checkInterfaceText(id, text) {
  if (!has(id)) throw new Error(`${JSON.stringify(id)} is not a text of this interface`);
  const holes = (s) => (s.match(HOLE) || []).sort().join(" ");
  if (holes(text) !== holes(en[id])) throw new Error(`the translation must keep ${holes(en[id]) || "the text free of {name} holes"}`);
}

// A page's fixed markup names its text id in data-t (the element's text) and data-t-<attribute>.
const MARKED = ["title", "placeholder", "aria-label"];

/** Writes the chosen language into every marked element under `root`. */
export function translateTree(root) {
  for (const el of root.querySelectorAll("[data-t]")) {
    // A child marked data-hole="name" stands where the text has {name}, so markup inside a sentence survives translation.
    const kept = [...el.querySelectorAll(":scope > [data-hole]")];
    el.replaceChildren(...t(el.dataset.t).split(/(\{\w+\})/).map((part) => kept.find((k) => `{${k.dataset.hole}}` === part) || part));
  }
  for (const attr of MARKED) {
    for (const el of root.querySelectorAll(`[data-t-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-t-${attr}`)));
  }
}

// New types without a custom label still sort in, after the known ones.
export function orderedSourceTypes(types = []) {
  const ordinary = types.filter((type) => type !== "rumour" && type !== "ignored");
  const order = Object.keys(en).filter((id) => id.startsWith("kind.")).map((id) => id.slice("kind.".length));
  ordinary.sort((a, b) => {
    const rank = (t) => order.includes(t) ? order.indexOf(t) : order.length;
    return rank(a) - rank(b);
  });
  return [...ordinary, ...["rumour", "ignored"].filter((t) => types.includes(t))];
}

export function titleCase(key) {
  return String(key == null ? "" : key)
    .replace(/^source\./, "")
    .replace(/[_.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A source kind's own wording of a field wins over the general one.
const fieldId = (group, path, sourceType) =>
  (has(`${group}.${path}@${sourceType}`) ? `${group}.${path}@${sourceType}` : `${group}.${path}`);

export function labelFor(path, sourceType) {
  const id = fieldId("field", path, sourceType);
  return has(id) ? t(id) : titleCase(path);
}

export function tipFor(path, sourceType) {
  if (isKnownField(path, sourceType)) {
    const id = fieldId("tip", path, sourceType);
    return has(id) ? t(id) : "";
  }
  return path.startsWith("source.") ? t("tip.orphan") : "";
}

export function isKnownField(path, sourceType) {
  return has(fieldId("field", path, sourceType));
}

export function sourceTypeLabel(type) {
  return has(`kind.${type}`) ? t(`kind.${type}`) : titleCase(type);
}

// Flat symbol lists only; object-shaped vocabularies carry their own `name`, read by data.js `labelOf`.
export function valueLabel(vocab, symbol) {
  const id = `value.${vocab}.${symbol}`;
  return has(id) ? t(id) : titleCase(symbol);
}

/** The name of a sidebar group spanning several source kinds, null when it has none of its own. */
export function groupLabel(prefix) {
  return has(`group.${prefix}`) ? t(`group.${prefix}`) : null;
}

export function subtypeVocab(sourceType) {
  return `${sourceType}_subtypes`;
}

// Text ids. The first is the suffix for a vocabulary entry the library does not define; shown, never selectable as a new value, and kept on a record that already carries one.
export const NOT_IN_GAME_DATA = "common.not_in_game_data";

// Never the number: "0" in an achievement column is indistinguishable from bad data.
export const ID_NOT_RECORDED = "common.id_not_recorded";

export function knownPaths() {
  return Object.keys(en).filter((id) => id.startsWith("field.") && !id.includes("@")).map((id) => id.slice("field.".length));
}
