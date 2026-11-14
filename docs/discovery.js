import { rumourClash } from "./validate.js";

export function parseDiscovery(value) {
  if (value?.format !== "furniture-discovery-v1") throw new Error("unsupported discovery format");
  const { record, meta, locale, apiVersion } = value;
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  if (!record || !positive(record.id) || (record.blueprint !== undefined && !positive(record.blueprint))) {
    throw new Error("discovery needs a furnishing id and an optional blueprint id");
  }
  const invalid = [];
  if (!meta || meta.id !== record.id) invalid.push("meta.id");
  if (typeof meta?.name !== "string" || !meta.name.trim()) invalid.push("meta.name");
  if (typeof meta?.icon !== "string" || !meta.icon.startsWith("/esoui/art/icons/")
      || !/\.dds$/i.test(meta.icon)) invalid.push("meta.icon");
  for (const k of ["quality", "cat", "sub", "theme"]) {
    if (!Number.isSafeInteger(meta?.[k]) || meta[k] < 0) invalid.push(`meta.${k}`);
  }
  if (typeof locale !== "string" || !/^[a-z]{2,8}$/.test(locale)) invalid.push("locale");
  if (!positive(apiVersion)) invalid.push("apiVersion");
  // A trader line's price: a currency key, an amount and, when the store reported a gate, an achievement id.
  const { offer } = value;
  if (offer !== undefined && (!offer || typeof offer.currency !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(offer.currency)
      || !positive(offer.amount) || (offer.achievement !== undefined && !positive(offer.achievement)))) invalid.push("offer");
  if (invalid.length) {
    const err = new Error(`item ${record.id}: discovery metadata is missing or invalid: ${invalid.join(", ")}`);
    if (meta && invalid.every((k) => ["meta.cat", "meta.sub"].includes(k) && meta[k.slice(5)] == null)) {
      err.code = "UNFINALISED_FURNISHING";
    }
    throw err;
  }
  // Category 0 is no furniture category: a datamine also meets equipment (e.g. 101051 Smuggler's Shoes).
  if (meta.cat === 0) {
    const err = new Error(`item ${record.id}: "${meta.name}" is not a furnishing (furniture category 0)`);
    err.code = "NOT_FURNITURE";
    throw err;
  }
  // Copy only the contract fields. Acquisition cannot be inferred from an ID scan.
  const cleanRecord = { id: record.id, ...(record.blueprint === undefined ? {} : { blueprint: record.blueprint }),
    source: { type: "rumour" }, cost: [], availability: { version: "NONE" } };
  const cleanMeta = Object.fromEntries(["id", "name", "icon", "quality", "cat", "sub", "theme"].map((k) => [k, meta[k]]));
  const cleanOffer = offer && { currency: offer.currency, amount: offer.amount,
    ...(offer.achievement === undefined ? {} : { achievement: offer.achievement }) };
  return { record: cleanRecord, reference: { format: value.format, locale, apiVersion, meta: cleanMeta }, offer: cleanOffer };
}

export function iconLeaf(icon) {
  return String(icon ?? "").replace(/^.*\//, "").replace(/\.dds$/i, "");
}

const DETAIL_FIELDS = ["icon", "quality", "cat", "sub", "theme"];

// What a discovery of a catalogued item would change in the published {name, meta}: the changed field names, empty when it says nothing new. A discovery in another language than `locale` (the site's metadata) brings everything but the name.
export function itemDetailsChanges(reference, published, locale = reference.locale) {
  const m = reference.meta;
  const changed = [];
  if (reference.locale === locale && m.name !== (published?.name ?? null)) changed.push("name");
  const had = published?.meta;
  for (const k of DETAIL_FIELDS) {
    const want = k === "icon" ? iconLeaf(m.icon) : m[k];
    // The game's placeholder never replaces a real icon; the pipeline skips it the same way.
    if (k === "icon" && want === "icon_missing" && had?.icon && had.icon !== want) continue;
    if (!had || had[k] !== want) changed.push(k);
  }
  return changed;
}

export function discoveryKnown(record, records) {
  return record.blueprint !== undefined
    ? records.some((r) => r.blueprint === record.blueprint)
    : records.some((r) => r.id === record.id);
}

// A new blueprint for an item that already has a confirmed source is another way to get it, not an unconfirmed item. The version stays as scanned: the scan cannot tell which update the blueprint arrived in.
// It's not really correct, but do this so a change is not blocked. You should still check what item the recipe really belongs to (there are items that have the identical name, but one is a drop and the other one is crafted, there is a difference).
export function discoveryAsRecipe(record, records) {
  if (record.blueprint === undefined || !rumourClash(record, records)) return record;
  return { ...record, source: { type: "recipe" } };
}

// Source types a trader's store sells under; their records carry the price.
export const OFFER_TYPES = new Set(["vendor", "pvp_vendor", "writ_vendor", "luxury", "event_vendor", "crown_store"]);

/**
 * A trader offer applied to the one trader or rumour record it is attributed to: the dump's price and gate replace the record's, and a key the dump does not bring stays (a character who already owns the achievement sees no gate). The price replaces the entry in the offer's currency, or becomes the price of a record that has none; which record an offer belongs to is `offerPlan`'s choice. The gate is written only where the type has the field.
 * @returns {{record: object, changed: boolean, replaced: string[]}} `record` is a new object only when `changed`; `replaced` describes values the dump overwrote
 */
export function applyOffer(record, offer, contracts) {
  const type = record?.source?.type;
  if (!offer || !(OFFER_TYPES.has(type) || type === "rumour")) return { record, changed: false, replaced: [] };
  const out = structuredClone(record);
  const replaced = [];
  let changed = false;
  const cost = Array.isArray(out.cost) ? out.cost : [];
  const at = cost.findIndex((c) => c?.currency === offer.currency);
  const priced = (list) => list.map((c) => `${c?.amount} ${c?.currency}`).join(" + ");
  if (at === -1 || cost[at].amount !== offer.amount) {
    if (cost.length) replaced.push(`price ${priced(cost)} -> ${offer.amount} ${offer.currency}`);
    if (at === -1) out.cost = [{ currency: offer.currency, amount: offer.amount }];
    else out.cost[at] = { ...cost[at], amount: offer.amount };
    changed = true;
  }
  const contract = contracts?.[type];
  const gated = contract && [...(contract.required || []), ...(contract.optional || [])].includes("achievement");
  if (offer.achievement !== undefined && gated && out.source.achievement !== offer.achievement) {
    if (out.source.achievement != null) replaced.push(`achievement ${out.source.achievement} -> ${offer.achievement}`);
    out.source.achievement = offer.achievement;
    changed = true;
  }
  return { record: changed ? out : record, changed, replaced };
}

// Currency -> the trader source types the catalogue prices in it.
export function offerTypeSets(records) {
  const seen = new Map();
  for (const r of records) {
    const type = r.source?.type;
    if (!OFFER_TYPES.has(type)) continue;
    for (const c of r.cost || []) {
      if (!c?.currency) continue;
      if (!seen.has(c.currency)) seen.set(c.currency, new Set());
      seen.get(c.currency).add(type);
    }
  }
  return seen;
}

/**
 * Currency -> source type, read from the catalogue: a currency that only one trader source type is ever priced in names that type (e.g. WRIT_VOUCHERS: writ_vendor); one several types share (GOLD) names none.
 */
export function offerTypes(records) {
  return new Map([...offerTypeSets(records)].filter(([, types]) => types.size === 1).map(([currency, types]) => [currency, [...types][0]]));
}

/**
 * What a trader offer does to a catalogued item, given the item's live records and `offerTypeSets` of the catalogue. Another currency is another offer, almost always another trader, so the offer goes only to the one record priced in its currency (or, when none is, the one unpriced trader record of a type priced in that currency). An item with no trader record takes it on its one rumour.
 * @returns {{kind: "apply", target: object, record: object, changed: boolean, replaced: string[]} | {kind: "add", record: object} | {kind: "unrecorded"} | {kind: "several", count: number} | {kind: "none"}}
 *   "add": a new record typed from the currency, trader left empty; "unrecorded": the currency names no type (GOLD), so only a warning
 */
export function offerPlan(itemRecords, offer, typeSets, contracts) {
  const traders = itemRecords.filter((r) => OFFER_TYPES.has(r.source?.type));
  const priced = (r) => (r.cost || []).some((c) => c?.currency === offer.currency);
  let pool = traders.filter(priced);
  if (!pool.length) pool = traders.filter((r) => !(r.cost || []).length && typeSets.get(offer.currency)?.has(r.source.type));
  if (!traders.length) pool = itemRecords.filter((r) => r.source?.type === "rumour");
  if (pool.length === 1) return { kind: "apply", target: pool[0], ...applyOffer(pool[0], offer, contracts) };
  if (pool.length > 1) {
    const stated = pool.some((r) => (r.cost || []).some((c) => c?.currency === offer.currency && c?.amount === offer.amount));
    return stated ? { kind: "none" } : { kind: "several", count: pool.length };
  }
  const types = typeSets.get(offer.currency);
  if (types?.size !== 1) return { kind: "unrecorded" };
  const id = itemRecords[0]?.id;
  return { kind: "add", record: recordFromOffer({ id, availability: { version: "NONE" } }, offer, new Map([[offer.currency, [...types][0]]]), contracts) };
}

// A new item with an offer: a currency that names one source type makes it that type, with the trader left for the contributor (the record stays invalid until it is picked); any other currency keeps it a rumour carrying the price. The gate is kept only where the type has the field.
export function recordFromOffer(record, offer, types, contracts) {
  if (!offer) return null;
  const type = types.get(offer.currency) || "rumour";
  const base = { id: record.id, ...(record.blueprint === undefined ? {} : { blueprint: record.blueprint }),
    source: { type }, cost: [], availability: { ...record.availability } };
  return applyOffer(base, offer, contracts).record;
}
