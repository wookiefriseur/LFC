// Tables on desktop, cards on mobile
const headerLabels = (table) => [...(table.tHead?.rows[0]?.cells || [])].map((header) => header.textContent.trim());

function labelRow(row, labels) {
  row.setAttribute("role", "row");
  let column = 0;
  for (const cell of row.cells) {
    cell.setAttribute("role", cell.tagName === "TH" ? "columnheader" : "cell");
    if (cell.tagName === "TD" && !row.classList.contains("spacer")) {
      cell.dataset.label = cell.colSpan > 1 ? "" : labels[column] || "";
    }
    column += cell.colSpan;
  }
}

function labelTable(table) {
  table.classList.add("responsive-table");
  table.setAttribute("role", "table");
  const labels = headerLabels(table);
  for (const row of table.rows) labelRow(row, labels);
}

for (const table of document.querySelectorAll("table")) labelTable(table);

new MutationObserver((records) => {
  const tables = new Set();
  const rows = new Map();   // table -> rows added to one of its bodies
  for (const { target, addedNodes } of records) {
    const table = target.closest?.("table") ?? target.parentElement?.closest("table");
    if (table) {
      if (target.tagName === "TBODY" && [...addedNodes].every((n) => n.tagName === "TR")) {
        if (!rows.has(table)) rows.set(table, []);
        rows.get(table).push(...addedNodes);
      } else tables.add(table);
      continue;
    }
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.tagName === "TABLE") tables.add(node);
      else for (const inner of node.getElementsByTagName("table")) tables.add(inner);
    }
  }
  for (const table of tables) labelTable(table);
  for (const [table, added] of rows) {
    if (tables.has(table)) continue;
    const labels = headerLabels(table);
    for (const row of added) if (row.isConnected) labelRow(row, labels);
  }
}).observe(document.body, { childList: true, subtree: true });
