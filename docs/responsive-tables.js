// Tables on desktop, cards on mobile
function labelTable(table) {
  table.classList.add("responsive-table");
  table.setAttribute("role", "table");
  const headers = [...(table.tHead?.rows[0]?.cells || [])];
  const labels = headers.map((header) => header.textContent.trim());
  for (const row of table.rows) {
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
}

for (const table of document.querySelectorAll("table")) labelTable(table);
new MutationObserver((records) => {
  const tables = new Set();
  for (const record of records) {
    const owner = record.target.nodeType === Node.ELEMENT_NODE
      ? record.target.closest("table") : record.target.parentElement?.closest("table");
    if (owner) tables.add(owner);
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches("table")) tables.add(node);
      for (const table of node.querySelectorAll("table")) tables.add(table);
    }
  }
  for (const table of tables) labelTable(table);
}).observe(document.body, { childList: true, subtree: true });
