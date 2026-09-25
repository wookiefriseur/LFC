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

// Both lookups for every id in one pass
export function containerIndex(records) {
  const contents = new Map();
  const seen = new Map();
  const parents = new Set();
  for (const r of records) {
    const holder = r.source?.part_of;
    if (Number.isInteger(holder)) {
      const key = r.id ?? r.blueprint;
      if (!seen.has(holder)) { seen.set(holder, new Set()); contents.set(holder, []); }
      if (!seen.get(holder).has(key)) {
        seen.get(holder).add(key);
        contents.get(holder).push(r);
      }
    }
    if (r.container && Number.isInteger(r.id)) parents.add(r.id);
  }
  return {
    contents: (id) => contents.get(id) || [],
    // Ids of the containers that hold any of these records.
    parentIds: (itemRecords) => itemRecords.map((r) => r.source?.part_of)
      .filter((id) => Number.isInteger(id) && parents.has(id)),
  };
}

export function containerLabel(record) {
  return record?.container === "folio" ? "Furnishing folio" : "Book collection";
}
