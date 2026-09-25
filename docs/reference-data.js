// Optional reference-data overlay (icons, item metadata) that the site must work without. The manifest loads after first paint, shards load on demand, and every absent, 404 or unknown-format case is a degraded state rather than an error: lookups return null and nothing throws.

import { parseJSONL } from "./data.js";

const MANIFEST_URL = "./reference-data/manifest.json";

// A bumped format is a new string; an unknown one makes the dataset absent.
const SUPPORTED_FORMATS = {
  icons: "icon-map-v1",
  items: "item-ref-v1",
  // Covers the furniture id range, which `icons` never has, so it is where a furnishing's icon actually comes from; `icon` is optional on the record.
  meta: "furniture-meta-v1",
  // Blueprint id -> furnishing id. Unsharded, because the furnishing's shard is not the one the blueprint's id falls in.
  recipes: "furniture-recipes-v1",
};

const LS_PREFIX = "furcat-refdata-";

export class ReferenceData {
  constructor() {
    this.state = "unloaded";
    this.manifest = null;
    this.shards = new Map();
    this.inflight = new Map();
    this.missingShards = new Set();
    this._shardListeners = [];
    this.discoveries = new Map();
    this.discoveryRecipes = new Map();
    this.recipes = null;
    this._recipesInflight = null;
  }

  onShardLoaded(fn) {
    if (typeof fn === "function") this._shardListeners.push(fn);
  }

  _fireShardLoaded() {
    for (const fn of this._shardListeners) {
      try { fn(); } catch (e) { console.warn("refdata shard listener threw", e); }
    }
  }

  async init() {
    if (this.state !== "unloaded") return;
    this.state = "loading";
    try {
      const r = await fetch(MANIFEST_URL, { cache: "no-cache" });
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      const manifest = JSON.parse(await r.text());
      if (manifest.manifest_version !== 1) {
        throw new Error(`manifest_version ${manifest.manifest_version} unsupported`);
      }
      this.manifest = manifest;
      this.state = "ready";
      this._loadRecipes();
    } catch (e) {
      this.manifest = null;
      this.state = "unavailable";
      console.info(
        "reference-data not available - icon previews + item-list validation " +
        `are off (${e.message}). The furniture views work unchanged.`,
      );
    }
    // Either way the answer to "is this icon still coming?" changed.
    this._fireShardLoaded();
  }

  _loadRecipes() {
    if (this.recipes || this._recipesInflight) return;
    if (!this._datasetUsable("recipes")) return;
    const dataset = this.manifest.datasets.recipes;
    const file = dataset.file || "recipes.json";
    this._recipesInflight = (async () => {
      const r = await fetch(`./reference-data/${file}${dataset.digest ? `?v=${encodeURIComponent(dataset.digest)}` : ""}`,
        { cache: dataset.digest ? "default" : "no-cache" });
      if (!r.ok) throw new Error(`${file} ${r.status}`);
      const obj = JSON.parse(await r.text());
      const map = new Map();
      for (const [blueprint, made] of Object.entries(obj)) {
        const b = Number(blueprint);
        if (Number.isInteger(b) && Number.isInteger(made)) map.set(b, made);
      }
      this.recipes = map;
    })()
      .catch((e) => {
        this.recipes = new Map();
        console.info(`reference-data ${file} unavailable (${e.message})`);
      })
      .finally(() => {
        this._recipesInflight = null;
        this._fireShardLoaded();
      });
  }

  // A record keyed by a blueprint is about the furnishing it makes; this resolves one to the other.
  resultOf(id) {
    if (this.discoveryRecipes.has(id)) return this.discoveryRecipes.get(id);
    if (!Number.isInteger(id)) return null;
    if (!this.recipes) {
      this._loadRecipes();
      return null;
    }
    return this.recipes.get(id) ?? null;
  }

  _datasetUsable(name) {
    if (this.state !== "ready" || !this.manifest) return false;
    const ds = this.manifest.datasets?.[name];
    if (!ds) return false;
    return ds.record_format === SUPPORTED_FORMATS[name];
  }

  _coveringShard(dataset, id) {
    const ds = this.manifest?.datasets?.[dataset];
    if (!ds || !Array.isArray(ds.shards)) return null;
    for (const s of ds.shards) {
      if (id >= s.id_min && id <= s.id_max) return s;
    }
    return null;
  }

  _ensureShard(dataset, id) {
    if (!this._datasetUsable(dataset)) return;
    const shard = this._coveringShard(dataset, id);
    if (!shard) return;
    const file = shard.file;
    if (this.shards.has(file) || this.missingShards.has(file)) return;
    if (this.inflight.has(file)) return;

    const revision = shard.digest;
    const url = `./reference-data/${file}${revision ? `?v=${encodeURIComponent(revision)}` : ""}`;
    const p = (async () => {
      const cached = readShardCache(file, revision);
      if (cached) {
        this.shards.set(file, cached);
        return;
      }
      const r = await fetch(url, { cache: revision ? "default" : "no-cache" });
      if (!r.ok) throw new Error(`${file} ${r.status}`);
      const { records, errors } = parseJSONL(await r.text());
      if (errors.length) throw new Error(`${file}: invalid JSONL`);
      const map = new Map();
      for (const rec of records) {
        if (Number.isInteger(rec.id)) map.set(rec.id, rec);
      }
      this.shards.set(file, map);
      writeShardCache(file, revision, map);
    })()
      .catch((e) => {
        this.missingShards.add(file);
        console.info(`reference-data shard ${file} unavailable (${e.message})`);
      })
      .finally(() => {
        this.inflight.delete(file);
        this._fireShardLoaded();
      });
    this.inflight.set(file, p);
  }

  iconPath(id) {
    if (!Number.isInteger(id)) return null;
    // The dedicated icons dataset is lighter and authoritative, so it goes before the items dataset's optional `icon`.
    if (this._datasetUsable("icons")) {
      const shard = this._coveringShard("icons", id);
      if (shard) {
        const map = this.shards.get(shard.file);
        if (map) {
          const rec = map.get(id);
          if (rec && rec.path) return rec.path;
        } else {
          this._ensureShard("icons", id);
        }
      }
    }
    const item = this.item(id);
    if (item && item.icon) return item.icon;
    const m = this.meta(id);
    if (m && m.icon) return m.icon;
    return null;
  }

  // False once every source has answered, so a null from iconPath() then means "no icon known", not "wait".
  iconPending(id) {
    if (this.state === "unloaded" || this.state === "loading") return true;
    if (this.state !== "ready" || !Number.isInteger(id)) return false;
    const waiting = (dataset) => {
      if (!this._datasetUsable(dataset)) return false;
      const shard = this._coveringShard(dataset, id);
      return Boolean(shard) && !this.shards.has(shard.file)
        && !this.missingShards.has(shard.file);
    };
    if (waiting("icons") || waiting("items") || waiting("meta")) return true;
    return this._datasetUsable("recipes") && !this.recipes;
  }

  addDiscovery(meta, blueprint) {
    this.discoveries.set(meta.id, meta);
    if (blueprint) this.discoveryRecipes.set(blueprint, meta.id);
  }

  meta(id) {
    const discovered = this.discoveries.get(this.discoveryRecipes.get(id) ?? id);
    if (discovered) return discovered;
    if (!Number.isInteger(id) || !this._datasetUsable("meta")) return null;
    const shard = this._coveringShard("meta", id);
    const map = shard && this.shards.get(shard.file);
    if (shard && !map) this._ensureShard("meta", id);
    const own = map ? map.get(id) || null : null;
    if (own) return own;
    // A blueprint has no metadata of its own; everything a caller wants from it belongs to the furnishing it makes, so one record answers for both ids.
    const made = this.resultOf(id);
    return made === null ? null : this.meta(made);
  }

  item(id) {
    if (!Number.isInteger(id) || !this._datasetUsable("items")) return null;
    const shard = this._coveringShard("items", id);
    if (!shard) return null;
    const map = this.shards.get(shard.file);
    if (map) return map.get(id) || null;
    this._ensureShard("items", id);
    return null;
  }

  prefetchForIds(ids, dataset = "items") {
    if (!this._datasetUsable(dataset)) return;
    const seen = new Set();
    for (const id of ids) {
      if (!Number.isInteger(id)) continue;
      const shard = this._coveringShard(dataset, id);
      if (!shard || seen.has(shard.file)) continue;
      seen.add(shard.file);
      this._ensureShard(dataset, id);
    }
  }

  statusNote() {
    switch (this.state) {
      case "ready":
        return "Reference data loaded - bare item icons are available.";
      case "loading":
        return "Loading reference data…";
      case "unavailable":
        return "Reference data not available - icon previews and item-list " +
               "validation are off. Furniture editing is unaffected.";
      default:
        return "Reference data not loaded yet.";
    }
  }
}

function readShardCache(file, revision) {
  if (!revision) return null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + file);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // Entries without a digest cannot prove freshness.
    if (obj.digest !== revision || !obj.records) return null;
    const map = new Map();
    for (const [k, v] of Object.entries(obj.records)) map.set(Number(k), v);
    return map;
  } catch (_) {
    return null;
  }
}

function writeShardCache(file, revision, map) {
  if (!revision) return;
  try {
    const obj = { digest: revision, records: Object.fromEntries(map) };
    localStorage.setItem(LS_PREFIX + file, JSON.stringify(obj));
  } catch (_) {
    // Quota or file:// restrictions. The shard refetches next session.
  }
}
