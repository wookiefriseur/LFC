# Webview tests

Tests for the web interface in `docs/`, run separately from the Lua tests.

```sh
cd tests/web
npm ci
npm test
```

Individual suites: `npm run test:unit`, `npm run test:browser` and `npm run test:cache`. The cache suite simulates successive Pages deployments in temporary directories.

After editing web modules, CSS or reference data, run `python3 scripts/webview_stamp.py` from the repository root to refresh the content hashes in the module and reference-shard URLs.
