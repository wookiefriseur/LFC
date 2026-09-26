// Contributor-facing labels. Every lookup falls back to a title-cased rendering of the key, so a value appended to enums.json gets a rough label and is never hidden. A tooltip may explain but never warn: anything whose absence would let a wrong record through belongs in visible text.

const FIELDS = {
  "id": ["Item ID", "It identifies the item and is never edited here."],
  "source.type": ["Source", "Way of getting this item. 1 item can have several records, each a different way."],
  "cost": ["Price", "Blank means no price."],
  "cost.empty": ["Price - none", "Free, or not bought at all."],
  "cost[].amount": ["Amount", "A whole number, no separators."],
  "cost[].currency": ["Currency", "Gold, Crowns, Writ Vouchers and so on."],
  "availability.version": ["Version", "Game update this belongs to, not necessarily when the item first appeared"],
  "availability.last_seen": ["Last seen", "Date this item was last offered (only relevant for Luxury furnishings)"],
  "rarity": ["Drop rarity", "How rare the drop is. Usually not needed. Blank means ordinary."],
  "notes": ["Data note - why this record looks like this", "Written script or a maintainer"],
  "name_overrides": ["Item name", "The name this site shows for the item."],
  "_category": ["Data file", "Which file the record lives in. Always the same as where it comes from."],
  "source.vendor": ["Sold by", "The NPC who sells it"],
  "source.locations": ["Where", "Zone is the map area (Murkmire etc). Place is more precise, such as Lilmoth (but also any capital city). Use both for a vendor in Lilmoth, Murkmire. Leave blank to use the vendor's location."],
  "source.note": ["Extra detail", "This source's own description, shown in the game (a known place belongs in Place). Don't use it to join two sources together: a second source is a second record"],
  "source.event": ["Event", "The event this record is tied to"],
  "source.container": ["Found in", "Containers with a drop chance (like daily reward coffers). Use Part of container for a fixed collection such as a furnishing folio."],
  "source.part_of": ["Part of container", "The item ID of a box that always contains this item (like book collections)"],
  "source.crate": ["Crown Crate season", "A Crown Crate season, such as Hidden Kindred. Use this for an item in that season's reward pool, not for an ordinary loot coffer."],
  "source.packs": ["Furnishing packs", "A Crown Store furnishing pack with a fixed collection, such as an Alinor pack"],
  "source.bundle": ["Bundle", "A named store offer containing several purchases, such as the Dwemer bundle"],
  "source.houses": ["Houses it comes with", "House collectible numbers, separated by commas."],
  "source.companion": ["Companion", "The companion whose rapport rewards it."],
  "source.quest": ["Quest ID", "a number, not its name. Use 0 when you know it needs one but not which."],
  "source.achievement": ["Achievement ID", "a number, not its name. Use 0 when you know it needs one but not which."],
  "source.collectible": ["Collectible it comes with", "The collectible number"],
  "source.skill_line": ["Skill line", "The skill line you need."],
  "source.skill_rank": ["Rank required", "How far up that skill line."],
  "source.npc_class": ["Dropped by", "The kind of NPC that drops it."],
  "source.npc_group": ["Dropped by (group)", "A broad group of NPCs rather than one kind - \"random enemies\"."],
  "source.subtype": ["How it is found", "Chest, fishing, pickpocketing and so on."],
  "source.leads": ["Several leads", "Ticked when the furnishing takes more than one antiquity lead."],
};

// Per-source-type overrides; on the two types whose whole payload is `note`, the generic wording says nothing.
const FIELD_BY_TYPE = {
  vendor: { "source.subtype": ["Vendor kind", "Home Goods stock varies by location and needs no achievement. Achievement furnishings require an achievement. Choose Other for other vendors."] },
  guild_gift: {"source.note": ["Which guild", "The player guild that it is dedicated to, e.g. Aetherius Art."],},
  tome_pack: { "source.note": ["Which tome pack", "The tome-pack keyword: armor, dawn or logic."],},
};

const ORPHAN_TIP =
  "This detail is no longer allowed for this kind of source. Remove it to save.";

const SOURCE_TYPES = {
  vendor: "Vendor",
  container: "Container contents",
  pvp_vendor: "PvP vendor",
  writ_vendor: "Master writ vendor",
  luxury: "Luxury Furnisher",
  event_drop: "Event drop",
  event_vendor: "Event vendor",
  crown_crate: "Crown Crate",
  crown_store: "Crown Store",
  recipe: "Crafting",
  drop: "World drop",
  quest_reward: "Quest reward",
  dungeon_drop: "Dungeon drop",
  housing: "Comes with a house",
  companion: "Companion rapport",
  guild_gift: "Player gift",
  tome_pack: "Tome pack",
  rumour: "UNCONFIRMED",
  ignored: "IGNORED",
};

// New types without a custom label still sort in, after the known ones.
export function orderedSourceTypes(types = []) {
  const ordinary = types.filter((type) => type !== "rumour" && type !== "ignored");
  const order = Object.keys(SOURCE_TYPES);
  ordinary.sort((a, b) => {
    const rank = (t) => order.includes(t) ? order.indexOf(t) : order.length;
    return rank(a) - rank(b);
  });
  return [...ordinary, ...["rumour", "ignored"].filter((t) => types.includes(t))];
}

// Flat symbol lists only; object-shaped vocabularies carry their own `name`, read by data.js `labelOf`.
const VALUES = {
  currencies: {
    GOLD: "Gold", AP: "Alliance Points", TEL_VAR: "Tel Var Stones",
    WRIT_VOUCHERS: "Writ Vouchers", EVENT_TICKETS: "Event Tickets",
    CROWNS: "Crowns", CROWN_GEMS: "Crown Gems", SEALS: "Seals of Endeavour",
    UNDAUNTED_KEYS: "Undaunted Keys", ARCHIVAL_FORTUNES: "Archival Fortunes",
    TRADE_BARS: "Trade Bars",
  },
  crown_store_subtypes: { housing_editor: "Housing editor" },
  drop_subtypes: {
    chest: "Treasure chest", safebox: "Safebox", fish: "Fishing",
    steal: "Stealing", pickpocket: "Pickpocketing", harvest: "Harvesting node",
    mob: "Dropped by monsters", scryable: "Antiquity (scrying)",
    tales_of_tribute: "Tales of Tribute", dark_brotherhood: "Dark Brotherhood",
    lorebook: "Lorebook",
  },
  dungeon_drop_subtypes: {
    chest: "Treasure chest",
  },
  quest_reward_subtypes: { daily: "Daily quest" },
  rarities: { common: "Common", rare: "Rare", extremely_rare: "Very rare" },
};

export function titleCase(key) {
  return String(key == null ? "" : key)
    .replace(/^source\./, "")
    .replace(/[_.]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelFor(path, sourceType) {
  const byType = FIELD_BY_TYPE[sourceType];
  const hit = (byType && byType[path]) || FIELDS[path];
  return hit ? hit[0] : titleCase(path);
}

export function tipFor(path, sourceType) {
  const byType = FIELD_BY_TYPE[sourceType];
  const hit = (byType && byType[path]) || FIELDS[path];
  if (hit) return hit[1] || "";
  return path.startsWith("source.") ? ORPHAN_TIP : "";
}

export function isKnownField(path, sourceType) {
  const byType = FIELD_BY_TYPE[sourceType];
  return Boolean((byType && byType[path]) || FIELDS[path]);
}

export function sourceTypeLabel(type) {
  return SOURCE_TYPES[type] || titleCase(type);
}

export function valueLabel(vocab, symbol) {
  const table = VALUES[vocab];
  const hit = table && table[symbol];
  return hit || titleCase(symbol);
}

export function subtypeVocab(sourceType) {
  return `${sourceType}_subtypes`;
}

// Suffix for a vocabulary entry the library does not define; shown, never selectable as a new value, and kept on a record that already carries one.
export const NOT_IN_GAME_DATA = " (not in the game data)";

// Never the number: "0" in an achievement column is indistinguishable from bad data.
export const ID_NOT_RECORDED = "required, but not recorded";

export function knownPaths() {
  return Object.keys(FIELDS);
}
