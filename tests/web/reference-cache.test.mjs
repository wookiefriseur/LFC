import test from "node:test";
import assert from "node:assert/strict";
import { ReferenceData } from "../../docs/reference-data.js";
import { DirtyBuffer, buildIssueURL } from "../../docs/diff.js";

test("reference revisions refresh only changed shards, not icon URLs", async (t) => {
  const storage = new Map();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("manifest.json")) return { ok: true, text: async () => JSON.stringify(manifest) };
    const record = url.includes("icons.jsonl") ? { id: 1, path: "icons/chair.dds" } : { id: 1, name };
    return { ok: true, text: async () => JSON.stringify(record) };
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, "localStorage", previous) : delete globalThis.localStorage);
  let calls = [], name = "Old chair";
  const manifest = { manifest_version: 1, datasets: {
    icons: { record_format: "icon-map-v1", shards: [{ file: "icons.jsonl", id_min: 1, id_max: 9, digest: "icon1" }] },
    meta: { record_format: "furniture-meta-v1", shards: [{ file: "meta.jsonl", id_min: 1, id_max: 9, digest: "meta1" }] },
  } };
  async function visit() {
    calls = [];
    const ref = new ReferenceData();
    await ref.init();
    ref.iconPath(1); ref.meta(1);
    await Promise.all(ref.inflight.values());
    assert.equal(calls[0][1].cache, "no-cache");
    assert.equal(ref.iconPath(1), "icons/chair.dds");
    assert.equal(ref.meta(1).name, name);
    return calls.slice(1).map(([url]) => url);
  }
  assert.equal((await visit()).length, 2);
  assert.deepEqual(await visit(), []);
  name = "New chair";
  manifest.datasets.meta.shards[0].digest = "meta2";
  assert.deepEqual(await visit(), ["./reference-data/meta.jsonl?v=meta2"]);
  assert.deepEqual(await visit(), []);
  storage.set("furcat-refdata-icons.jsonl", JSON.stringify({ 1: { id: 1, path: "stale" } }));
  assert.deepEqual(await visit(), ["./reference-data/icons.jsonl?v=icon1"]);
  assert.deepEqual(await visit(), []);
  delete manifest.datasets.meta.shards[0].digest;
  assert.deepEqual(await visit(), ["./reference-data/meta.jsonl"]);
  assert.deepEqual(await visit(), ["./reference-data/meta.jsonl"]);
});

test("plain issue link carries Markdown without a template", () => {
  const url = new URL(buildIssueURL(new DirtyBuffer()));
  assert.equal(url.searchParams.has("template"), false);
  assert.ok(url.searchParams.get("body"));
});

test("unavailable or malformed optional shards degrade without caching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, text: async () => "not JSONL" }));
  const ref = new ReferenceData();
  ref.state = "ready";
  ref.manifest = { datasets: { meta: { record_format: "furniture-meta-v1",
    shards: [{ file: "broken.jsonl", id_min: 1, id_max: 9, digest: "broken1" }] } } };
  assert.equal(ref.meta(1), null);
  await Promise.all(ref.inflight.values());
  assert.equal(ref.meta(1), null);
  assert.equal(ref.shards.size, 0);
  assert.equal(ref.missingShards.has("broken.jsonl"), true);
});
