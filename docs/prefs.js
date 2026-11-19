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
