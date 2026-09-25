export function parseDiscovery(value) {
  if (value?.format !== "furniture-discovery-v1") throw new Error("unsupported discovery format");
  const { record, meta, locale, apiVersion } = value;
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  if (!record || !positive(record.id) || (record.blueprint !== undefined && !positive(record.blueprint))) {
    throw new Error("discovery needs a furnishing id and an optional blueprint id");
  }
  if (!meta || meta.id !== record.id || typeof meta.name !== "string" || !meta.name.trim()
      || typeof meta.icon !== "string" || !meta.icon.startsWith("/esoui/art/icons/")
      || !/\.dds$/i.test(meta.icon)
      || !["quality", "cat", "sub", "theme"].every((k) => Number.isSafeInteger(meta[k]) && meta[k] >= 0)
      || typeof locale !== "string" || !/^[a-z]{2,8}$/.test(locale) || !positive(apiVersion)) {
    throw new Error("discovery metadata is missing or invalid");
  }
  // Copy only the contract fields. Acquisition cannot be inferred from an ID scan.
  const cleanRecord = { id: record.id, ...(record.blueprint === undefined ? {} : { blueprint: record.blueprint }),
    source: { type: "rumour" }, cost: [], availability: { version: "NONE" } };
  const cleanMeta = Object.fromEntries(["id", "name", "icon", "quality", "cat", "sub", "theme"].map((k) => [k, meta[k]]));
  return { record: cleanRecord, reference: { format: value.format, locale, apiVersion, meta: cleanMeta } };
}

export function discoveryKnown(record, records) {
  return record.blueprint !== undefined
    ? records.some((r) => r.blueprint === record.blueprint)
    : records.some((r) => r.id === record.id);
}
