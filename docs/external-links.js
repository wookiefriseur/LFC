// Do not fetch() these URLs: esoicons.uesp.net sends no ACAO header and sits behind a Cloudflare challenge, so only <a href> and <img src> work. Only resolved icon URL strings are cached, never image bytes.

import { dropCachedIconURL, getCachedIconURL, putCachedIconURL } from "./icon-cache.js";
import { t, valueLabel } from "./lexicon.js";
import { language, tradeSettings } from "./prefs.js";

const ESO_LINKS = {
  UESP_ITEM:       (id) => `https://esoitem.uesp.net/itemLink.php?itemid=${id}`,
  UESP_ITEM_EMBED: (id) => `https://esoitem.uesp.net/itemLink.php?itemid=${id}&embed`,
  // The site appends the name after the id; the id alone is enough.
  ESOHUB_TRADING:  (lang, id) => `https://eso-hub.com/${lang}/trading/${id}`,
  // Screenshots, 3D model and prices, but furnishings only, and keyed by the name in that language: any other slug is a 404.
  ESOHUB_FURNITURE: (lang, slug) => `https://eso-hub.com/${lang}/furniture/${slug}`,
  // TTC has ids of its own, so the exact name it is: the pattern also matches partial names.
  TTC_SEARCH: (server, platform, name, lang) =>
    `https://${server}.tamrieltradecentre.com/${platform}/Trade/SearchResult?ItemNamePattern=${encodeURIComponent(name)}&lang=${lang}`,
};

// Page language -> each site's own language code. ESO-Hub has no Japanese or Chinese pages; TTC speaks every game language.
const ESOHUB_LANGUAGES = { en: "en", de: "de", fr: "fr", es: "es", ru: "ru" };
const TTC_LANGUAGES = { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES", ru: "ru-RU", jp: "ja-JP", zh: "zh-CN" };

// Cyrillic as ICU's Any-Latin then Latin-ASCII write it, which is what ESO-Hub's slugs match ("Сырные крошки (эшатер)" -> syrnye-kroski-esater).
const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "z", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "c", ш: "s", щ: "s", ъ: "",
  ы: "y", ь: "", э: "e", ю: "u", я: "a",
};
const LATIN_EXTRA = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l", þ: "th" };

/** ESO-Hub's furniture slug: lower case ASCII, accents dropped, words joined by hyphens, other punctuation removed. */
export function esoHubSlug(name) {
  return String(name).toLowerCase()
    .replace(/[\u0400-\u04ff]/g, (c) => CYRILLIC[c] ?? c)
    .replace(/[ßæœøđłþ]/g, (c) => LATIN_EXTRA[c])
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/[\s-]+/g, "-");
}

// (id) -> { local, english }: the item's name in the chosen language ("" when it has none) and in English.
let itemNameLookup = (_id) => ({ local: "", english: "" });

export function setItemNameLookup(fn) {
  if (typeof fn === "function") itemNameLookup = fn;
}

export function bareIconURL(iconPath) {
  let p = String(iconPath).trim();
  // `.dds` is what GetItemLinkIcon returns.
  p = p.replace(/^\/+/, "").replace(/\.(png|dds)$/i, "");
  p = p.replace(/^esoui\/art\/icons\//i, "");
  // Explicit https: a protocol-relative URL on an http page is upgraded and logged by the browser every time.
  return `https://esoicons.uesp.net/esoui/art/icons/${p}.png`;
}

export function itemPageURL(id) {
  return ESO_LINKS.UESP_ITEM(id);
}

let iconPathLookup = (_id) => null;

export function setIconPathLookup(fn) {
  if (typeof fn === "function") iconPathLookup = fn;
}

// Without this, an id the icon map has not reached yet and one it will never cover look the same.
let iconPendingLookup = (_id) => false;

export function setIconPendingLookup(fn) {
  if (typeof fn === "function") iconPendingLookup = fn;
}

// Loading placeholders on screen, so they can turn into their icon in place when the map arrives, without re-rendering their screen.
const loadingIcons = new Map();

/** Call after each piece of the icon map lands. */
export function refreshLoadingIcons() {
  for (const [ph, { id, alt }] of loadingIcons) {
    if (!ph.isConnected) { loadingIcons.delete(ph); continue; }
    if (!itemIcon(id) && iconPendingLookup(Number(id))) continue;
    loadingIcons.delete(ph);
    ph.replaceWith(itemIconImg(id, alt));
  }
}

export function itemIcon(id) {
  const numId = Number(id);
  // The live lookup wins: a cached URL is only a stand-in until the covering shard has loaded, never a second authority that outlives a corrected icon map.
  const path = iconPathLookup(id);
  if (path) {
    const url = bareIconURL(path);
    if (Number.isInteger(numId) && getCachedIconURL(numId) !== url) putCachedIconURL(numId, url);
    return url;
  }
  return Number.isInteger(numId) ? getCachedIconURL(numId) : null;
}

function extLink(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = String(text);
  a.className = 'ext-link';
  return a;
}

export function itemLinkAnchor(id, text) {
  return extLink(itemPageURL(id), text);
}

export const TRADING_ICONS = {
  item:      { glyph: '💰', label: "links.trading.item" },
  blueprint: { glyph: '📜', label: "links.trading.blueprint" },
};

export const TRADE_SITES = {
  esohub: { name: "ESO-Hub", tag: "EH" },
  ttc:    { name: "Tamriel Trade Centre", tag: "TTC" },
};

const BOUND_SOURCES = new Set(['crown_store', 'crown_crate', 'housing']);

export function isTradeable(records) {
  return !records.length || records.some((r) => !BOUND_SOURCES.has(r.source?.type));
}

function esoHubURL(id, kind, lang, names) {
  const hubLang = ESOHUB_LANGUAGES[lang] || "en";
  // Blueprints have no furniture page; a furnishing without a name in the page language would have no valid slug.
  const name = hubLang === lang ? names.local : names.english;
  const slug = kind === "item" && name ? esoHubSlug(name) : "";
  return slug ? ESO_LINKS.ESOHUB_FURNITURE(hubLang, slug) : ESO_LINKS.ESOHUB_TRADING(hubLang, id);
}

function ttcURL(lang, names, { ttcServer, ttcPlatform }) {
  const [name, ttcLang] = names.local ? [names.local, TTC_LANGUAGES[lang] || "en-US"] : [names.english, "en-US"];
  return name ? ESO_LINKS.TTC_SEARCH(ttcServer, ttcPlatform, name, ttcLang) : null;
}

function tradeNames(id, lang) {
  const raw = itemNameLookup(id) || {};
  const real = (n) => (n && !/^Item \d+$/.test(n) ? String(n) : "");
  return { english: real(raw.english), local: lang === "en" ? real(raw.english) : real(raw.local) };
}

function tradeLink(site, id, kind, lang, settings) {
  const names = tradeNames(id, lang);
  const href = site === "esohub" ? esoHubURL(id, kind, lang, names) : ttcURL(lang, names, settings);
  if (!href) return null;
  const label = t(TRADING_ICONS[kind].label, { site: TRADE_SITES[site].name });
  const a = extLink(href, TRADING_ICONS[kind].glyph);
  a.classList.add('trade-link');
  a.dataset.site = site;
  a.title = label;
  a.setAttribute('aria-label', label);
  return a;
}

/**
 * One group per trade site the visitor chose, in TRADE_SITES order: the site's tag, then its item and blueprint links.
 * None when they chose no site or nothing is linkable.
 * @param ids { item, blueprint }: either may be missing, e.g. a bound item has no item link
 */
export function tradingLinkGroups({ item = null, blueprint = null } = {}) {
  const settings = tradeSettings();
  const lang = language();
  return Object.keys(TRADE_SITES).filter((site) => settings.sites.includes(site)).flatMap((site) => {
    const links = [[item, "item"], [blueprint, "blueprint"]]
      .filter(([id]) => id != null).map(([id, kind]) => tradeLink(site, id, kind, lang, settings)).filter(Boolean);
    if (!links.length) return [];
    const group = document.createElement("span");
    group.className = "trade-group";
    group.dataset.site = site;
    const tag = Object.assign(document.createElement("span"), { className: "trade-site", textContent: TRADE_SITES[site].tag, title: TRADE_SITES[site].name });
    group.append(tag, ...links);
    return [group];
  });
}

// The game's own currency icons under esoui/art/currency/, kept by hand: currencies change rarely.
const CURRENCY_ICONS = {
  GOLD: "currency_gold_32",
  AP: "alliancepoints_32",
  TEL_VAR: "currency_telvar_32",
  WRIT_VOUCHERS: "currency_writvoucher",
  CROWNS: "currency_crowns_32",
  CROWN_GEMS: "currency_crown_gems",
  SEALS: "currency_seals_of_endeavor_32",
  UNDAUNTED_KEYS: "undauntedkey",
  ARCHIVAL_FORTUNES: "archivalfragments_32",
  TRADE_BARS: "u49_tt_tradebars_32",
};

function currencyNode(symbol) {
  const name = valueLabel("currencies", symbol);
  const path = CURRENCY_ICONS[symbol];
  if (!path) return name;
  const img = document.createElement("img");
  img.src = `https://esoicons.uesp.net/esoui/art/currency/${path}.png`;
  img.alt = name;
  img.title = name;
  img.className = "currency-icon";
  // An icon that does not load must not leave a bare amount.
  img.onerror = () => img.replaceWith(name);
  return img;
}

/** A price list as amounts with their currency icons; the icon names its currency as tooltip and alternative text. */
export function costNode(cost) {
  const span = document.createElement("span");
  span.className = "cost";
  cost.forEach((c, i) => {
    const amount = Number.isFinite(c?.amount) ? c.amount.toLocaleString() : String(c?.amount ?? "");
    span.append(i ? " / " : "", amount, amount ? "\u00a0" : "", currencyNode(c?.currency));
  });
  return span;
}

export function itemIconImg(id, alt, retry = 0) {
  const url = itemIcon(id);
  // Clicking the placeholder retries: the covering shard may have loaded since, or the CDN may have answered badly once.
  const placeholder = (why, extra = '') => {
    const ph = document.createElement('span');
    ph.className = `ext-icon ext-icon-placeholder${extra}`;
    ph.title = t("links.icon.retry", { problem: why });
    ph.setAttribute('role', 'button');
    ph.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dropCachedIconURL(Number(id));
      ph.replaceWith(itemIconImg(id, alt, retry + 1));
    });
    return ph;
  };
  if (!url) {
    if (!iconPendingLookup(Number(id))) return placeholder(t("links.icon.unknown"));
    const ph = placeholder(t("links.icon.loading"), ' ext-icon-loading');
    loadingIcons.set(ph, { id, alt });
    return ph;
  }
  const img = document.createElement('img');
  img.loading = 'lazy';
  // A retry must not be answered from the browser's record of the failure.
  img.src = retry ? `${url}?retry=${retry}` : url;
  img.alt = alt || t("common.item_fallback", { id });
  img.className = 'ext-icon';
  img.onerror = () => img.replaceWith(placeholder(t("links.icon.failed")));
  return img;
}
