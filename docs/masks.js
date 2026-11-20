// A mask is one tab page: render(container) runs once, lazily, on first show. onShow(container) runs on every later show. With subtabs, render is optional and draws chrome above the subtab bar. The first subtab is the default.
// A mask with tabs of its own instead offers `tab: { get(), set(id) }` (set ignores an id it does not know) and calls tabChanged() when the user picks one.
// The address fragment names the page: `#<mask id>`, then `~key~value` pairs, of which only `tab` is read; anything else is left for later versions and ignored.

const masks = [];
let activeId = null;
let startId = null;
let tabBarEl = null;
let panelHostEl = null;
const rendered = new Set();
const subRendered = new Set();
const activeSub = new Map();

// Tab names are text ids, tab.<mask id> and tab.<mask id>.<subtab id>, drawn through this translator
let translate = (id) => id;

function labelTab(btn, mask) {
  btn.textContent = translate(`tab.${mask.id}`);
  // The glyph is decoration; the tab's name stays the label.
  if (mask.icon) btn.prepend(Object.assign(document.createElement("span"), { textContent: `${mask.icon} `, ariaHidden: "true" }));
}

/** Redraws the tab names with a new translator. */
export function relabelMasks(fn) {
  translate = fn;
  for (const m of masks) {
    const btn = document.getElementById(`tab-${m.id}`);
    if (btn) labelTab(btn, m);
    for (const st of m.subtabs || []) {
      const sub = document.getElementById(`subtab-${m.id}-${st.id}`);
      if (sub) sub.textContent = translate(`tab.${m.id}.${st.id}`);
    }
  }
}

export function registerMask(mask) {
  if (!mask || typeof mask !== "object") {
    throw new Error("registerMask: mask must be an object");
  }
  if (!mask.id || !/^[a-z0-9-]+$/.test(mask.id)) {
    throw new Error(`registerMask: bad id ${JSON.stringify(mask.id)}`);
  }
  const hasSubtabs = Array.isArray(mask.subtabs) && mask.subtabs.length > 0;
  if (typeof mask.render !== "function" && !hasSubtabs) {
    throw new Error(`registerMask: mask "${mask.id}" needs a render() function`);
  }
  if (hasSubtabs) {
    const seen = new Set();
    for (const st of mask.subtabs) {
      if (!st || !st.id || !/^[a-z0-9-]+$/.test(st.id)) {
        throw new Error(`registerMask: mask "${mask.id}" has a subtab with a bad id`);
      }
      if (typeof st.render !== "function") {
        throw new Error(`registerMask: subtab "${mask.id}/${st.id}" needs a render() function`);
      }
      if (seen.has(st.id)) {
        throw new Error(`registerMask: mask "${mask.id}" has a duplicate subtab id "${st.id}"`);
      }
      seen.add(st.id);
    }
  }
  if (masks.some((m) => m.id === mask.id)) {
    throw new Error(`registerMask: duplicate mask id "${mask.id}"`);
  }
  masks.push(mask);
}

export function activeMaskId() {
  return activeId;
}

// Below 900px the bar is a popover behind #nav-toggle. Without the Popover API `:popover-open` throws, so the bar stays inline.
function bindNavMenu(tabBar) {
  const menu = document.getElementById("nav-toggle");
  if (!("popover" in HTMLElement.prototype)) { menu?.remove(); return; }
  const narrow = matchMedia("(max-width: 900px)");
  const syncMenu = () => {
    if (tabBar.matches(":popover-open")) tabBar.hidePopover();
    if (narrow.matches) tabBar.setAttribute("popover", "auto");
    else tabBar.removeAttribute("popover");
  };
  syncMenu();
  narrow.addEventListener("change", syncMenu);
  tabBar.addEventListener("toggle", () => {
    menu?.setAttribute("aria-expanded", String(tabBar.matches(":popover-open")));
  });
}

export function mountMasks({ tabBar, panelHost, defaultId }) {
  if (masks.length === 0) throw new Error("mountMasks: no masks registered");
  tabBarEl = tabBar;
  panelHostEl = panelHost;
  bindNavMenu(tabBar);
  tabBar.innerHTML = "";
  panelHost.innerHTML = "";

  for (const m of masks) {
    // inTabBar: false builds a panel without a tab button, for a page reached from elsewhere (the footer's About link).
    if (m.inTabBar !== false) {
      const btn = document.createElement("button");
      btn.id = `tab-${m.id}`;
      btn.className = "tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.setAttribute("aria-controls", `panel-${m.id}`);
      labelTab(btn, m);
      btn.addEventListener("click", () => switchMask(m.id));
      tabBar.append(btn);
    }

    const panel = document.createElement("main");
    panel.id = `panel-${m.id}`;
    panel.className = `panel panel-${m.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.hidden = true;
    panelHost.append(panel);
  }

  // A page named in the address wins over the remembered one.
  if (!route()) switchMask(defaultId || masks[0].id, true);
  startId = activeId;
  addEventListener("hashchange", () => {
    // Back to the entry the visit started on, which had no fragment.
    if (!route() && !location.hash.slice(1)) switchMask(startId, true);
  });
}

// The only place that reads the fragment. Returns the mask it named, or null for an empty or unknown one, which changes nothing.
function route() {
  let parts;
  try { parts = decodeURIComponent(location.hash.slice(1)).split("~"); } catch (_) { return null; }
  const mask = masks.find((m) => m.id === parts[0].toLowerCase());
  if (!mask) return null;
  let tab = null;
  for (let i = 1; i + 1 < parts.length; i += 2) if (parts[i].toLowerCase() === "tab") tab = parts[i + 1].toLowerCase();
  if (mask.id !== activeId) switchMask(mask.id, true);
  if (tab) {
    if (mask.subtabs?.some((s) => s.id === tab)) switchSubtab(mask.id, tab, true);
    else mask.tab?.set(tab);
  }
  return mask;
}

// The only place that writes it: a new history entry, so Back returns to the page before. The hashchange it causes finds that page already shown.
function writeHash() {
  const mask = masks.find((m) => m.id === activeId);
  const tab = mask.subtabs?.length ? activeSub.get(mask.id) : mask.tab?.get();
  const hash = `#${mask.id}${tab ? `~tab~${tab}` : ""}`;
  if (location.hash !== hash) location.hash = hash;
}

export function tabChanged() { writeHash(); }

// `quiet`: the switch follows the address and must not write it.
export function switchMask(id, quiet = false) {
  const mask = masks.find((m) => m.id === id);
  if (!mask) throw new Error(`switchMask: unknown mask "${id}"`);
  activeId = id;
  if (tabBarEl.hasAttribute("popover") && tabBarEl.matches(":popover-open")) tabBarEl.hidePopover();
  document.getElementById("nav-toggle")?.setAttribute("aria-label", `Navigation, current page: ${translate(`tab.${mask.id}`)}`);

  for (const m of masks) {
    const isActive = m.id === id;
    const panel = document.getElementById(`panel-${m.id}`);
    const btn = document.getElementById(`tab-${m.id}`);
    panel.hidden = !isActive;
    if (!btn) continue;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  }

  const panel = document.getElementById(`panel-${id}`);
  const hasSubtabs = Array.isArray(mask.subtabs) && mask.subtabs.length > 0;
  if (!rendered.has(id)) {
    rendered.add(id);
    if (hasSubtabs) renderSubtabbed(mask, panel);
    else mask.render(panel);
  } else {
    if (typeof mask.onShow === "function") mask.onShow(panel);
    if (hasSubtabs) {
      const subId = activeSub.get(mask.id);
      const st = mask.subtabs.find((s) => s.id === subId);
      const subBody = document.getElementById(`subpanel-${mask.id}-${subId}`);
      if (st && subBody && typeof st.onShow === "function") st.onShow(subBody);
    }
  }
  if (!quiet) writeHash();
}

function renderSubtabbed(mask, panel) {
  const head = document.createElement("div");
  head.className = "subtab-head";
  panel.append(head);
  if (typeof mask.render === "function") mask.render(head);

  const bar = document.createElement("nav");
  bar.className = "subtabs";
  bar.setAttribute("role", "tablist");
  panel.append(bar);

  for (const st of mask.subtabs) {
    const btn = document.createElement("button");
    btn.id = `subtab-${mask.id}-${st.id}`;
    btn.className = "subtab";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("aria-controls", `subpanel-${mask.id}-${st.id}`);
    btn.textContent = translate(`tab.${mask.id}.${st.id}`);
    btn.addEventListener("click", () => switchSubtab(mask.id, st.id));
    bar.append(btn);

    const body = document.createElement("div");
    body.id = `subpanel-${mask.id}-${st.id}`;
    body.className = `subpanel subpanel-${st.id}`;
    body.setAttribute("role", "tabpanel");
    body.hidden = true;
    panel.append(body);
  }
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const btns = [...bar.querySelectorAll(".subtab")];
    const cur = btns.findIndex((b) => b.getAttribute("aria-selected") === "true");
    if (cur < 0) return;
    const next = (cur + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
    btns[next].focus();
    switchSubtab(mask.id, mask.subtabs[next].id);
  });

  switchSubtab(mask.id, mask.subtabs[0].id, true);
}

export function switchSubtab(maskId, subId, quiet = false) {
  const mask = masks.find((m) => m.id === maskId);
  if (!mask || !Array.isArray(mask.subtabs)) {
    throw new Error(`switchSubtab: "${maskId}" is not a subtabbed mask`);
  }
  const st = mask.subtabs.find((s) => s.id === subId);
  if (!st) throw new Error(`switchSubtab: unknown subtab "${maskId}/${subId}"`);
  activeSub.set(maskId, subId);

  for (const s of mask.subtabs) {
    const isActive = s.id === subId;
    const body = document.getElementById(`subpanel-${maskId}-${s.id}`);
    const btn = document.getElementById(`subtab-${maskId}-${s.id}`);
    if (body) body.hidden = !isActive;
    if (btn) {
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    }
  }

  const body = document.getElementById(`subpanel-${maskId}-${subId}`);
  const subKey = `${maskId}/${subId}`;
  if (!subRendered.has(subKey)) {
    subRendered.add(subKey);
    st.render(body);
  } else if (typeof st.onShow === "function") {
    st.onShow(body);
  }
  if (!quiet) writeHash();
}

export function activeSubtabId(maskId) {
  return activeSub.get(maskId) || null;
}
