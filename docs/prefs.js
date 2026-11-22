// What a visitor chose for this browser: the theme now, the data language later. One stored object, so both
// are read once and neither needs its own key.
const KEY = "furcat-prefs-v1";
export const THEMES = ["system", "light", "dark"];

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch (_) {
    return {}; // storage unavailable or damaged: defaults, for this visit
  }
}

export function getPref(name, fallback) {
  const value = read()[name];
  return value === undefined ? fallback : value;
}

export function setPref(name, value) {
  const prefs = read();
  if (value === undefined) delete prefs[name];
  else prefs[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) { /* kept for this visit only */ }
}

// The game's own language codes, with the name each language gives itself
export const LANGUAGES = [
  ["en", "English"], ["de", "Deutsch"], ["fr", "Français"], ["es", "Español"],
  ["ru", "Русский"], ["jp", "日本語"], ["zh", "中文"],
];
// Browser codes that differ from the game's
const BROWSER_TO_GAME = { ja: "jp" };

/** The game language if they match the browser (default = en) */
export function gameLanguage(browserLanguages = []) {
  for (const tag of browserLanguages) {
    const base = String(tag).toLowerCase().split("-")[0];
    const code = BROWSER_TO_GAME[base] || base;
    if (LANGUAGES.some(([game]) => game === code)) return code;
  }
  return "en";
}

/** The language item names are shown and searched in: the visitor's choice, else the browser's. */
export function language() {
  const stored = getPref("language");
  if (LANGUAGES.some(([code]) => code === stored)) return stored;
  return gameLanguage(typeof navigator === "undefined" ? [] : navigator.languages || [navigator.language]);
}

export function bindLanguageSelect(select, onChange) {
  if (!select) return;
  select.replaceChildren(...LANGUAGES.map(([code, label]) => {
    const option = document.createElement("option");
    option.value = code;
    option.lang = code === "jp" ? "ja" : code;
    option.textContent = label;
    return option;
  }));
  select.value = language();
  select.addEventListener("change", () => {
    setPref("language", select.value);
    onChange(select.value);
  });
}

export function theme() {
  const stored = getPref("theme", "system");
  return THEMES.includes(stored) ? stored : "system";
}

// "system" leaves the attribute off, and the stylesheet follows prefers-color-scheme. index.html applies a stored
// choice before first paint with the same rule, so the page does not flash the other theme.
export function applyTheme(choice, root = document.documentElement) {
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
}

export function bindThemeSelect(select) {
  if (!select) return;
  select.value = theme();
  select.addEventListener("change", () => {
    const choice = THEMES.includes(select.value) ? select.value : "system";
    setPref("theme", choice === "system" ? undefined : choice);
    applyTheme(choice);
  });
}

// Guild trader price links: which sites, and the Tamriel Trade Centre megaserver and platform, whose listings are separate.
export const TRADE_SITE_IDS = ["esohub", "ttc"];
export const TTC_SERVERS = ["eu", "us"];
export const TTC_PLATFORMS = ["pc", "xb", "ps"];

export function tradeSettings() {
  const sites = getPref("tradeSites");
  const server = getPref("ttcServer");
  const platform = getPref("ttcPlatform");
  return {
    // ESO-Hub alone until the visitor chooses: that is what the page linked before there was a choice.
    sites: Array.isArray(sites) ? sites.filter((s) => TRADE_SITE_IDS.includes(s)) : ["esohub"],
    ttcServer: TTC_SERVERS.includes(server) ? server : "eu",
    ttcPlatform: TTC_PLATFORMS.includes(platform) ? platform : "pc",
  };
}

/** Wires the trade link settings dialog; `onChange` runs after every stored change. */
export function bindTradeSettings(dialog, opener, onChange) {
  if (!dialog || !opener) return;
  const site = (id) => dialog.querySelector(`input[name="trade-site"][value="${id}"]`);
  const server = dialog.querySelector("#ttc-server");
  const platform = dialog.querySelector("#ttc-platform");
  const fill = () => {
    const s = tradeSettings();
    TRADE_SITE_IDS.forEach((id) => { if (site(id)) site(id).checked = s.sites.includes(id); });
    server.value = s.ttcServer;
    platform.value = s.ttcPlatform;
    server.disabled = platform.disabled = !s.sites.includes("ttc");
  };
  opener.addEventListener("click", () => { fill(); dialog.showModal(); });
  dialog.addEventListener("change", () => {
    setPref("tradeSites", TRADE_SITE_IDS.filter((id) => site(id)?.checked));
    setPref("ttcServer", server.value);
    setPref("ttcPlatform", platform.value);
    fill();
    onChange?.();
  });
  dialog.querySelector(".modal-close")?.addEventListener("click", () => dialog.close());
  // A click on the backdrop lands on the dialog itself.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) return dialog.close();
    // The "?" next to a site opens its note on links that do not work; a title would never show on a touch screen.
    const help = e.target.closest(".help-toggle");
    if (!help) return;
    const note = dialog.querySelector(`#${help.getAttribute("aria-controls")}`);
    note.hidden = !note.hidden;
    help.setAttribute("aria-expanded", String(!note.hidden));
  });
}
