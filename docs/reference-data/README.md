# reference-data/

**Webui-only / generator-only reference datasets. NOT part of ESOUI release**

This directory carries **reference data unrelated to the furniture DB**: data the webview and the data generator use only to *check* the furniture DB. The furniture DB (`data/*.jsonl`) is the source of truth for generating Lua files. Everything here is an **optional overlay** for the webinterface.

## Layout

```
reference-data/
├── README.md          ← this file
├── manifest.json       ← index of available datasets + shards (the contract)
├── meta/
│   └── meta-*.jsonl                  ← furniture-meta shards (real data, carries `icon`)
├── recipes.json                      ← blueprint id -> furnishing (real data)
├── categories.en.json                ← category taxonomy (real data, en)
├── names.en.json                     ← game names: houses, quests, achievements, zones, furnishing categories, themes and crafting skills (real data, en)
└── names.<locale>.json               ← the same plus items, one file per other game language (de, fr, es, ru, jp, zh)
```

## Names in other languages

- `names.<locale>.json`: names read from a client in that language, per table
- `fallback` inside it: English names of the ids that have none yet. Generated, never edited
- First full dump of a language: `python3 scripts/import_names.py <SavedVariables file>` (updates the manifest too)
- Later corrections: Names tab, through the change list
- `manifest.json` records per language: counts, `dumped` (date) and `apiVersion` of the last full dump
