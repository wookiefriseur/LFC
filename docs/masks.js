// A mask is one tab page: render(container) runs once, lazily, on first show. onShow(container) runs on every later show. With subtabs, render is optional and draws chrome above the subtab bar. The first subtab is the default.

const masks = [];
let activeId = null;
let tabBarEl = null;
let panelHostEl = null;
const rendered = new Set();
const subRendered = new Set();
const activeSub = new Map();

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

export function mountMasks({ tabBar, panelHost, defaultId }) {
  if (masks.length === 0) throw new Error("mountMasks: no masks registered");
  tabBarEl = tabBar;
  panelHostEl = panelHost;
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
      btn.textContent = m.label;
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

  switchMask(defaultId || masks[0].id);
}

export function switchMask(id) {
  const mask = masks.find((m) => m.id === id);
  if (!mask) throw new Error(`switchMask: unknown mask "${id}"`);
  activeId = id;

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
    btn.textContent = st.label;
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

  switchSubtab(mask.id, mask.subtabs[0].id);
}

export function switchSubtab(maskId, subId) {
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
}

export function activeSubtabId(maskId) {
  return activeSub.get(maskId) || null;
}
