export const ignoredMessage = "FurnitureCatalogue does not track this item on purpose.";

export function isIgnoredItem(record, records = []) {
  if (record?.source?.type === "ignored") return true;
  return records.some((r) => r.source?.type === "ignored"
    && [record?.id, record?.blueprint].some((id) => Number.isInteger(id)
      && (id === r.id || id === r.blueprint)));
}
