// Curated presets for easier contributions
// A blank value has to be filled by contributor

export const PRESETS = [
  {
    id: "impresario",
    label: "Event vendor: Impresario (TB)",
    source: { type: "event_vendor", event: "", vendor: "EVENT" },
    cost: [{ currency: "TRADE_BARS" }],
  },
//  {
//    id: "holiday",
//    label: "Event vendor: Holiday Furnisher (gold)",
//    source: { type: "event_vendor", event: "", vendor: "HOLIDAY" },
//    cost: [{ currency: "GOLD" }],
//  },
  {
    id: "event-box",
    label: "Event drop: from event container",
    source: { type: "event_drop", event: "", container: "" },
    cost: [],
  },
  {
    id: "housing-editor",
    label: "Crown Store: Housing Editor",
    source: { type: "crown_store", subtype: "housing_editor" },
    cost: [{ currency: "CROWNS" }],
  },
//  {
//    id: "pack",
//    label: "Crown Store: part of a furnishing pack",
//    source: { type: "crown_store", packs: [] },
//    cost: [],
//  },
//  {
//    id: "bundle",
//    label: "Crown Store: part of a bundle",
//    source: { type: "crown_store", bundle: "" },
//    cost: [],
//  },
//  {
//    id: "crate",
//    label: "Crown Crate",
//    source: { type: "crown_crate", crate: "" },
//    cost: [],
//  },
//  {
//    id: "house",
//    label: "Comes with a house",
//    source: { type: "housing", houses: [] },
//    cost: [],
//    },
  {
    id: "tome",
    label: "Tamriel Tomes",
    source: { type: "tome_pack", tome: "" },
    cost: [],
  },
  {
    id: "rolis",
    label: "Master writ vendor (Vouchers)",
    source: { type: "writ_vendor", vendor: "ROLIS" },
    cost: [{ currency: "WRIT_VOUCHERS" }],
  },
];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

// The record keeps its item, source and price come from the preset
export function applyPreset(record, preset, version) {
  return {
    ...record,
    source: JSON.parse(JSON.stringify(preset.source)),
    cost: JSON.parse(JSON.stringify(preset.cost)),
    availability: { version },
    _preset: preset.id,
  };
}
