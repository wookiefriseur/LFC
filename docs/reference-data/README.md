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
└── categories.en.json                ← category taxonomy (real data, en)
```
