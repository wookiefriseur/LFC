export function containerContents(records, id) {
  const seen = new Set();
  return records.filter(r => {
    const key = r.id ?? r.blueprint;
    if (r.source?.part_of !== id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function containerParents(records, itemRecords) {
  const ids = new Set(itemRecords.map(r => r.source?.part_of).filter(Number.isInteger));
  return records.filter(r => r.container && ids.has(r.id));
}

export function containerLabel(record) {
  return record?.container === "folio" ? "Furnishing folio" : "Book collection";
}
