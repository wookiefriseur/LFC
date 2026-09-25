// The weekly luxury-furnishing update: a lenient paste parser (parseLuxuryPaste) and the price-update rule (computeLuxuryPlan), both pure. Zanil Theran (vendor LUXF, source.type "luxury") sells about five furnishings once a week.
// A re-sale update deep-copies the stored record, so `source.note` or any other field this mask does not know about survives untouched.
//
// Paste formats, auto-detected by the `[<int>] = {` opener:
// 1. The Lua-block dump of the in-game DevUtility (`AddAllFromTrader()` / `generateItemText()`):
//   	[126560] = {		-- Dwarven Fountain, Forged
//   		itemPrice = 50000,		-- Gold
//   	},
//    The opener's trailing comment is the item name; `itemPrice` (present only if > 0) carries the currency as its comment; an `achievement` line is surfaced as a note, not stored; a block with no `itemPrice` is a bare re-sale.
// 2. One item per line:
//   220369, 100000                  itemId, price
//   220369, 100000, Horse Skeleton  itemId, price, comment (not stored)
//   |H1:item:220369:...|h|h 100000  an ESO item link, optional price
//   220369                          itemId alone: a re-sale keeping the stored price
//    Separators are comma, semicolon, tab or whitespace; `--` / `#` comment lines and trailing comments are stripped.

// The id is the 3rd colon-delimited field of an ESO item link.
const ITEM_LINK_RE = /\|H\d*:item:(\d+):/i;

// Thousands separators a contributor might leave in ("100,000", "100.000") are stripped.
function parseIntLoose(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[\s,._]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parseLine(raw, lineNo) {
  const out = { lineNo, raw, id: null, price: null, comment: "", error: null };
  let line = raw.trim();
  if (!line) return null;
  if (line.startsWith("--") || line.startsWith("#")) return null;

  const cm = line.match(/\s+(--|#)\s*(.*)$/);
  if (cm) {
    out.comment = cm[2].trim();
    line = line.slice(0, cm.index).trim();
  }

  const link = line.match(ITEM_LINK_RE);
  if (link) {
    out.id = parseInt(link[1], 10);
    const after = line.slice(line.indexOf("|h|h") + 4) || line.slice(link.index + link[0].length);
    const priceTok = (after.match(/\d[\d\s,._]*/) || [])[0];
    if (priceTok != null) out.price = parseIntLoose(priceTok);
    if (!Number.isInteger(out.id) || out.id < 1) out.error = "could not read itemId from item link";
    return out;
  }

  const parts = line.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  out.id = parseIntLoose(parts[0]);
  if (out.id == null || out.id < 1) {
    out.error = `unrecognised line - expected "itemId, price", got "${raw.trim()}"`;
    return out;
  }
  if (parts.length >= 2) {
    out.price = parseIntLoose(parts[1]);
    if (out.price == null) {
      if (!out.comment) out.comment = parts.slice(1).join(" ");
    } else if (parts.length >= 3 && !out.comment) {
      out.comment = parts.slice(2).join(" ");
    }
  }
  return out;
}

const LUA_BLOCK_OPEN_RE = /^\s*\[\s*(\d+)\s*\]\s*=\s*\{\s*(?:--\s*(.*?)\s*)?$/;
const LUA_ITEMPRICE_RE = /^\s*itemPrice\s*=\s*([\d,._]+)\s*,?\s*(?:--\s*(.*?)\s*)?$/i;
const LUA_ACHIEVEMENT_RE = /^\s*achievement\s*=\s*(\d+)\s*,?\s*(?:--\s*(.*?)\s*)?$/i;

function looksLikeLuaBlocks(text) {
  return String(text).split(/\r?\n/).some((ln) => LUA_BLOCK_OPEN_RE.test(ln));
}

export function parseLuaBlocks(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const open = raw.match(LUA_BLOCK_OPEN_RE);
    if (open) {
      // A previous block that never closed is kept anyway: contributors may drop the `},`.
      if (cur) rows.push(cur);
      cur = {
        lineNo: i + 1, raw: raw.trim(),
        id: parseInt(open[1], 10),
        price: null, comment: (open[2] || "").trim(), error: null,
      };
      if (!Number.isInteger(cur.id) || cur.id < 1) {
        cur.error = `could not read itemId from "${raw.trim()}"`;
      }
      continue;
    }
    if (!cur) continue;

    const priceM = raw.match(LUA_ITEMPRICE_RE);
    if (priceM) {
      cur.price = parseIntLoose(priceM[1]);
      const currency = (priceM[2] || "").trim();
      if (currency && !/^gold$/i.test(currency)) {
        cur.error = `itemPrice currency is "${currency}", not Gold - luxury items must be Gold`;
      }
      continue;
    }
    const achM = raw.match(LUA_ACHIEVEMENT_RE);
    if (achM) {
      // Irrelevant to the Gold-only luxury flow. Surfaced so the contributor sees it was dropped.
      const achName = (achM[2] || "").trim();
      cur._achievementNote = `block carries achievement ${achM[1]}` +
        (achName ? ` (${achName})` : "") + " - ignored for the luxury mask";
      continue;
    }
    if (/^\s*\},?\s*$/.test(raw)) {
      rows.push(cur);
      cur = null;
    }
  }
  if (cur) rows.push(cur);
  return rows;
}

export function parseLuxuryPaste(text) {
  if (looksLikeLuaBlocks(text)) {
    return parseLuaBlocks(text);
  }
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i], i + 1);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export const LUX_ACTION = {
  NEW: "NEW",                         // no luxury record with this id - add one
  RESALE_DATE: "RE-SALE, date only",  // re-sale; price suppressed by the checkbox
  RESALE_PRICE: "RE-SALE + price",    // re-sale; price also updated
  PRICE_ADDED: "PRICE ADDED",         // re-sale; record had no price - price set
  WARN: "WARN",                       // parse error / unknown id / price ignored
};

// One word each: the price column states the effect, the badge only says which kind of row this is. The codes above stay distinct because the summary counts them separately.
export const LUX_ACTION_LABEL = {
  [LUX_ACTION.NEW]: "NEW",
  [LUX_ACTION.RESALE_DATE]: "date",
  [LUX_ACTION.RESALE_PRICE]: "price",
  [LUX_ACTION.PRICE_ADDED]: "price",
  [LUX_ACTION.WARN]: "WARN",
};

function storedAmount(record) {
  const c = record && Array.isArray(record.cost) ? record.cost[0] : null;
  return c && Number.isInteger(c.amount) ? c.amount : null;
}

function goldSuffix(record) {
  const c = record && Array.isArray(record.cost) ? record.cost[0] : null;
  const cur = c && c.currency;
  return !cur || cur === "GOLD" ? "g" : cur;
}

/**
 * What the commit will do to this row's price, as one token for the preview's price column, so an event-sale paste shows its rewrites before they are committed:
 *     25,000g    a re-sale, the stored price kept
 *     +25,000g   the record had no price and gains one
 *     *30,000g   the stored price is rewritten to this
 *     -25,000g   the price is removed
 */
export function priceEffect(entry) {
  if (!entry) return "-";
  const before = storedAmount(entry.before);
  const after = storedAmount(entry.record);
  const g = goldSuffix(entry.record || entry.before);
  const n = (v) => v.toLocaleString();

  if (!entry.record) return entry.price != null ? `${n(entry.price)}${g}` : "-";
  if (!entry.before) return after != null ? `${n(after)}${g}` : "no price";
  if (before == null && after != null) return `+${n(after)}${g}`;
  if (before != null && after == null) return `-${n(before)}${g}`;
  if (before == null && after == null) return "no price";
  if (before === after) return `${n(before)}${g}`;
  return `*${n(after)}${g}`;
}

/**
 * The success panel's line after any commit, shared by the Luxury, Crown Store and Crate seasons masks, e.g. `5 items added, 2 skipped (WARN) - 7 changes ready to send.` The skipped count must survive into the panel: "5 added" with two rows silently dropped hides a mistake.
 */
export function successPanelText(c) {
  const added = c.added || 0;
  const parts = [];
  // "0 items added, 1 changed" reads as a failure, so a price-only commit leads with what it did.
  if (added || !c.updated) parts.push(`${added} item${added === 1 ? "" : "s"} added`);
  if (c.updated) parts.push(`${c.updated} item${c.updated === 1 ? "" : "s"} changed`);
  if (c.skipped) parts.push(`${c.skipped} skipped (WARN)`);
  if (c.blocked) parts.push(`${c.blocked} blocked (duplicate)`);
  const n = c.pending || 0;
  return `${parts.join(", ")} - ${n} change${n === 1 ? "" : "s"} ready to send.`;
}

function hasNoPrice(record) {
  return storedAmount(record) == null;
}

/**
 * Apply the luxury price-update rule to every parsed row. Prices essentially never change but in-game events discount them temporarily, so by default only the date churns:
 *  - existing record -> set availability.last_seen; price untouched (RESALE_DATE), or also set when keepPrices is false (RESALE_PRICE); a record with no price always gets one (PRICE_ADDED)
 *  - no existing record -> add one; a missing price is a WARN (NEW)
 * @param {Map} opts.luxuryById  Map<id, {record, _key}> of existing luxury records; a value may be an array when an id owns several, and the first is updated with a note.
 */
export function computeLuxuryPlan(parsedRows, opts) {
  const { date, version, keepPrices, luxuryById } = opts;
  const plan = [];

  for (const row of parsedRows) {
    const entry = {
      row,
      id: row.id,
      price: row.price,
      action: null,
      record: null,   // the record to commit (add or updated copy)
      before: null,   // the pre-edit record (update only)
      _key: null,     // existing record's dirty-buffer key (update only)
      messages: [],
    };

    if (row.error) {
      entry.action = LUX_ACTION.WARN;
      entry.messages.push(row.error);
      plan.push(entry);
      continue;
    }

    if (row._achievementNote) entry.messages.push(row._achievementNote);

    // An id may own several luxury records (e.g. one qualified by `source.note`): update the first and say so.
    const hit = luxuryById.get(row.id);
    const existing = Array.isArray(hit) ? hit[0] : hit;
    if (Array.isArray(hit) && hit.length > 1) {
      entry.messages.push(
        `id ${row.id} has ${hit.length} luxury records - updating the first; ` +
        `check the others in Batch edit`,
      );
    }

    if (!existing) {
      entry.action = LUX_ACTION.NEW;
      if (row.price == null) {
        entry.action = LUX_ACTION.WARN;
        entry.messages.push("new item but no price in the paste - add a price");
      } else if (row.price === 0) {
        // A price of 0 is almost always a mis-parse, e.g. a comma splitting "100,000".
        entry.action = LUX_ACTION.WARN;
        entry.messages.push("price is 0 - check the paste (thousands separators split on commas)");
      }
      entry.record = {
        id: row.id,
        source: { type: "luxury", vendor: "LUXF" },
        cost: row.price != null ? [{ currency: "GOLD", amount: row.price }] : [],
        availability: { version, last_seen: date },
      };
      plan.push(entry);
      continue;
    }

    const before = existing.record;
    entry.before = before;
    entry._key = existing._key;
    const after = JSON.parse(JSON.stringify(before));
    after.availability = after.availability || {};
    after.availability.last_seen = date;

    const missingPrice = hasNoPrice(before);
    if (missingPrice) {
      if (row.price != null) {
        after.cost = [{ currency: "GOLD", amount: row.price }];
        entry.action = LUX_ACTION.PRICE_ADDED;
        entry.messages.push("record had no price - price added");
      } else {
        after.cost = Array.isArray(after.cost) ? after.cost : [];
        entry.action = LUX_ACTION.WARN;
        entry.messages.push("record has no price and the paste gives none");
      }
    } else if (!keepPrices && row.price != null) {
      after.cost = [{ ...(after.cost[0] || { currency: "GOLD" }), amount: row.price }];
      entry.action = LUX_ACTION.RESALE_PRICE;
      if (row.price !== before.cost[0].amount) {
        entry.messages.push(`was ${before.cost[0].amount}`);
      }
    } else {
      entry.action = LUX_ACTION.RESALE_DATE;
      if (keepPrices && row.price != null && row.price !== before.cost[0].amount) {
        // Kept short: this is on every re-sale whose paste disagrees, and a sentence wraps the row.
        entry.messages.push(`pasted ${row.price} ignored`);
      }
    }
    entry.record = after;
    plan.push(entry);
  }
  return plan;
}

/**
 * The Friday of the weekend a picked date belongs to, as YYYY-MM-DD. The sale runs Friday to Monday, so Saturday, Sunday and Monday snap back; an earlier weekday is a different weekend and is left alone.
 */
export function snapToFriday(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return value;
  const day = d.getDay();
  if (day !== 6 && day !== 0 && day !== 1) return value;
  d.setDate(d.getDate() - ((day - 5 + 7) % 7));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Most recent Friday on or before `ref`, as a local-time YYYY-MM-DD.
export function mostRecentFriday(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const back = (d.getDay() - 5 + 7) % 7;
  d.setDate(d.getDate() - back);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
