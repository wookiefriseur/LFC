import { orderedSourceTypes, sourceTypeLabel, valueLabel } from "./lexicon.js";
// The database ships a flat set of leaf sources; grouping belongs to each consumer. Leaves this tree fails to place land in a computed catch-all (Other), so a new source type can never blank the UI.

/** An illegal subtype yields a leaf the enumeration does not know, which buildTaxonomy() surfaces as drift. */
export function leafOf(record) {
  const type = record?.source?.type;
  if (!type) return "(untyped)";
  const sub = record?.source?.subtype;
  if (!sub) return type;
  return `${type}:${sub}`;
}

/** Every leaf the contract declares, in canonical order; subtyped types are those with a `<type>_subtypes` key in enums.json. */
export function enumerateLeaves(enums) {
  const out = [];
  for (const type of orderedSourceTypes(enums.source_types)) {
    // subtype is optional, so a subtyped type keeps a bare leaf too.
    out.push(type);
    for (const s of enums[`${type}_subtypes`] || []) {
      out.push(`${type}:${symbolOf(s)}`);
    }
  }
  return out;
}

/** enums.json vocabularies are lists of strings or of {symbol, ...} objects. */
export function symbolOf(entry) {
  return typeof entry === "string" ? entry : entry?.symbol;
}

// Acronyms the data spells in lower case.
const CASED = { pvp: "PvP", npc: "NPC" };

export function humanise(id) {
  const words = String(id || "").split("_");
  return words
    .map((w, i) => CASED[w] || (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The tree is the source types grouped by the prefix before the first `_`; a type's subtype leaves hang under it. */
export function deriveTree(enums) {
  const types = orderedSourceTypes(enums?.source_types);
  const order = [];
  const byPrefix = new Map();
  for (const type of types) {
    const prefix = String(type).split("_")[0];
    if (!byPrefix.has(prefix)) { byPrefix.set(prefix, []); order.push(prefix); }
    byPrefix.get(prefix).push(type);
  }

  const subLeaves = (type) =>
    (enums[`${type}_subtypes`] || []).map((s) => `${type}:${symbolOf(s)}`);

  return order.map((prefix) => {
    const members = byPrefix.get(prefix);
    const group = {
      id: prefix,
      label: humanise(prefix),
      note: members.length > 1
        ? `Source types beginning ${prefix}_.`
        : `Source type ${members[0]}.`,
      leaves: [],
      subgroups: [],
    };
    if (members.length === 1) {
      group.label = sourceTypeLabel(members[0]);
      group.leaves = [members[0]];
      group.subgroups = subLeaves(members[0]).map(leaf => ({ id: leaf, label: valueLabel(`${members[0]}_subtypes`, leaf.split(":")[1]), leaves: [leaf] }));
      return group;
    }
    for (const type of members) {
      group.subgroups.push({
        id: type, label: humanise(type),
        leaves: [type, ...subLeaves(type)],
      });
    }
    return group;
  });
}

/**
 * `catchAll`: enumerated leaves the tree does not place (rendered as Other).
 * `unknown`: leaves in the data but not in the enumeration - contract drift.
 * `placedTwice`: leaves the derivation placed twice.
 */
export function buildTaxonomy(enums, records) {
  const leaves = enumerateLeaves(enums);
  const known = new Set(leaves);

  const counts = Object.create(null);
  for (const l of leaves) counts[l] = 0;
  const unknown = new Set();
  for (const r of records || []) {
    const l = leafOf(r);
    if (!known.has(l)) unknown.add(l);
    counts[l] = (counts[l] || 0) + 1;
  }

  const placed = new Set();
  const placedTwice = [];
  const claim = (leaf) => {
    if (placed.has(leaf)) placedTwice.push(leaf);
    placed.add(leaf);
  };
  const groups = deriveTree(enums).map((g) => {
    const copy = { id: g.id, label: g.label, note: g.note, leaves: [], subgroups: [] };
    for (const l of g.leaves || []) { claim(l); copy.leaves.push(l); }
    for (const sg of g.subgroups || []) {
      const sub = { id: sg.id, label: sg.label, leaves: [] };
      for (const l of sg.leaves || []) { claim(l); sub.leaves.push(l); }
      copy.subgroups.push(sub);
    }
    return copy;
  });

  const catchAll = leaves.filter((l) => !placed.has(l));

  return {
    leaves, counts, groups, catchAll,
    unknown: [...unknown],
    placedTwice,
  };
}

export function recordsForLeaf(records, leaf) {
  return (records || []).filter((r) => leafOf(r) === leaf);
}

export function recordsForLeaves(records, leafList) {
  const want = new Set(leafList);
  return (records || []).filter((r) => want.has(leafOf(r)));
}

const SOURCES_HEADLINE =
  "Every kind of source in the database, and how this site groups them.";

const OTHER_TIP =
  "Computed, not written down - a new kind of source lands here.";

/** `opts.focusLeaf` rings that leaf's chip and scrolls it into view. */
export function renderSourcesSection(container, deps, opts = {}) {
  const { state, elem, switchToBrowse } = deps;

  container.innerHTML = "";
  const t = buildTaxonomy(state.enums || {}, state.records || []);
  const wrap = elem("div", { class: "tax-embed" });
  wrap.append(header(t));

  const cols = elem("div", { class: "tax-cols" });
  cols.append(leafColumn(t));
  cols.append(treeColumn(t));
  wrap.append(cols);
  container.append(wrap);

  if (opts.focusLeaf) {
    const chip = container.querySelector(
      `.tax-chip[data-leaf="${cssEscape(opts.focusLeaf)}"]`);
    if (chip) {
      chip.classList.add("is-focus");
      chip.scrollIntoView({ block: "center" });
    }
  }

  function header(t) {
    const head = elem("div", { class: "tax-head" });
    head.append(elem("h3", {}, SOURCES_HEADLINE));
    const stats = elem("p", { class: "tax-stats" });
    stats.append(elem("span", { class: "tax-stat" },
      `${t.leaves.length} leaves enumerated`));
    stats.append(elem("span", { class: "tax-stat" },
      `${t.leaves.length - t.catchAll.length} placed`));
    stats.append(elem("span", { class: "tax-stat" + (t.catchAll.length ? " is-catchall" : "") },
      `${t.catchAll.length} in Other`));
    if (t.unknown.length) {
      stats.append(elem("span", { class: "tax-stat warn" },
        `${t.unknown.length} leaf/leaves in the data but not in the contract: ${t.unknown.join(", ")}`));
    }
    if (t.placedTwice.length) {
      stats.append(elem("span", { class: "tax-stat warn" },
        `placed twice by the derivation: ${t.placedTwice.join(", ")}`));
    }
    head.append(stats);
    return head;
  }

  function leafColumn(t) {
    const col = elem("div", { class: "tax-col tax-leaves" });
    col.append(elem("h4", {
      title: "What the data declares. A leaf with no records is still a leaf.",
    }, "Every kind of source"));
    const list = elem("ul", { class: "tax-leaf-list" });
    for (const leaf of t.leaves) {
      const li = elem("li", { class: "tax-leaf" + (t.counts[leaf] ? "" : " is-empty") });
      li.append(leafChip(leaf, t.counts[leaf]));
      list.append(li);
    }
    col.append(list);
    return col;
  }

  function treeColumn(t) {
    const col = elem("div", { class: "tax-col tax-tree" });
    col.append(elem("h4", {
      title: "Derived from the source-type vocabulary, by the prefix before " +
             "the first underscore. Nothing is written down here.",
    }, "How this site groups them"));
    for (const g of t.groups) col.append(groupBox(g, t, false));
    col.append(groupBox({
      id: "other", label: "Other", note: OTHER_TIP,
      leaves: t.catchAll, subgroups: [],
    }, t, true));
    return col;
  }

  function groupBox(g, t, isCatchAll) {
    const box = elem("div", {
      class: "tax-group" + (isCatchAll ? " is-catchall" : ""),
      id: isCatchAll ? "tax-other" : `tax-group-${g.id}`,
    });
    if (g.note) box.setAttribute("title", g.note);
    const head = elem("div", { class: "tax-group-head" });
    head.append(elem("strong", {}, g.label));
    head.append(elem("span", { class: "tax-group-count muted" },
      `${countLeaves(g, t)} records`));
    box.append(head);

    if (g.leaves.length) {
      const row = elem("div", { class: "tax-chips" });
      for (const l of g.leaves) row.append(leafChip(l, t.counts[l]));
      box.append(row);
    }
    for (const sg of g.subgroups || []) {
      const sub = elem("div", { class: "tax-subgroup" });
      sub.append(elem("span", { class: "tax-subgroup-label" }, sg.label));
      const row = elem("div", { class: "tax-chips" });
      for (const l of sg.leaves) row.append(leafChip(l, t.counts[l]));
      sub.append(row);
      box.append(sub);
    }
    if (isCatchAll && !g.leaves.length) {
      box.append(elem("span", { class: "muted tax-empty" },
        "Empty - this tree places every kind of source there is."));
    }
    return box;
  }

  function countLeaves(g, t) {
    let n = 0;
    for (const l of g.leaves || []) n += t.counts[l] || 0;
    for (const sg of g.subgroups || []) {
      for (const l of sg.leaves) n += t.counts[l] || 0;
    }
    return n;
  }

  function leafChip(leaf, count) {
    const chip = elem("button", {
      class: "tax-chip" + (count ? "" : " is-empty"),
      title: count
        ? `Show ${count} record(s) in Browse`
        : "no records yet",
    });
    chip.dataset.leaf = leaf;
    chip.append(elem("span", { class: "tax-chip-id" }, leaf));
    chip.append(elem("span", { class: "tax-chip-n" }, String(count || 0)));
    chip.addEventListener("click", () => {
      if (typeof switchToBrowse === "function") switchToBrowse({ leaf });
    });
    return chip;
  }
}

// Escape defensively rather than trusting the leaf id shape.
function cssEscape(s) {
  const str = String(s == null ? "" : s);
  return (globalThis.CSS && typeof CSS.escape === "function")
    ? CSS.escape(str)
    : str.replace(/["\\]/g, "\\$&");
}
