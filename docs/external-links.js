// Do not fetch() these URLs: esoicons.uesp.net sends no ACAO header and sits behind a Cloudflare challenge, so only <a href> and <img src> work. Only resolved icon URL strings are cached, never image bytes.

import { dropCachedIconURL, getCachedIconURL, putCachedIconURL } from "./icon-cache.js";

const ESO_LINKS = {
  UESP_ITEM:       (id) => `https://esoitem.uesp.net/itemLink.php?itemid=${id}`,
  UESP_ITEM_EMBED: (id) => `https://esoitem.uesp.net/itemLink.php?itemid=${id}&embed`,
  // Keyed by name slug, not itemId; ESO-Hub's slug rules are not guaranteed stable.
  ESOHUB_FURNITURE: (slug) => `https://eso-hub.com/en/furniture/${slug}`,
};

export function bareIconURL(iconPath) {
  let p = String(iconPath).trim();
  // `.dds` is what GetItemLinkIcon returns.
  p = p.replace(/^\/+/, "").replace(/\.(png|dds)$/i, "");
  p = p.replace(/^esoui\/art\/icons\//i, "");
  // Explicit https: a protocol-relative URL on an http page is upgraded and logged by the browser every time.
  return `https://esoicons.uesp.net/esoui/art/icons/${p}.png`;
}

// Best-effort ESO-Hub slug; not authoritative.
function esohubSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function itemPageURL(id, name, variant = 'uesp') {
  if (variant === 'esohub' && name) return ESO_LINKS.ESOHUB_FURNITURE(esohubSlug(name));
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

export function itemLinkAnchor(id, text) {
  const a = document.createElement('a');
  a.href = itemPageURL(id);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = String(text);
  a.className = 'ext-link';
  return a;
}

export function itemIconImg(id, alt, retry = 0) {
  const url = itemIcon(id);
  // Clicking the placeholder retries: the covering shard may have loaded since, or the CDN may have answered badly once.
  const placeholder = (why, extra = '') => {
    const ph = document.createElement('span');
    ph.className = `ext-icon ext-icon-placeholder${extra}`;
    ph.title = `${why} - click to retry`;
    ph.setAttribute('role', 'button');
    ph.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dropCachedIconURL(Number(id));
      ph.replaceWith(itemIconImg(id, alt, retry + 1));
    });
    return ph;
  };
  if (!url) {
    if (!iconPendingLookup(Number(id))) return placeholder('no icon known');
    const ph = placeholder('icon still loading', ' ext-icon-loading');
    loadingIcons.set(ph, { id, alt });
    return ph;
  }
  const img = document.createElement('img');
  img.loading = 'lazy';
  // A retry must not be answered from the browser's record of the failure.
  img.src = retry ? `${url}?retry=${retry}` : url;
  img.alt = alt || `item ${id}`;
  img.className = 'ext-icon';
  img.onerror = () => img.replaceWith(placeholder('icon failed to load'));
  return img;
}
