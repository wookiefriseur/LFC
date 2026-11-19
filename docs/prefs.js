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
