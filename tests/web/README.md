# Webview tests

These tests maintain the live working copy in `../../docs`, independently of the static Lua tests.

```sh
cd tests/web
npm ci
npm test
```

`CHROMIUM` overrides `/usr/bin/chromium`. For restricted container homes, set `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` to a writable temporary directory.
Individual commands: `npm run test:unit`, `npm run test:browser`, and `npm run test:cache`. The last simulates successive Pages deployments in temporary directories; it does not publish anything. The browser suite defaults
to LFC/docs; `WEBVIEW_ROOT` can override it for explicit comparison only.

After editing web modules, CSS or reference data, run
`python3 scripts/webview_stamp.py` from the repository root. It hashes each reference shard separately, preserving caches for unchanged shards and leaving
UESP image URLs untouched. Old unversioned shard caches refresh once from Pages.
