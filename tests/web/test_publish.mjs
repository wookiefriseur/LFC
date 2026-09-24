#!/usr/bin/env node
// test_publish.mjs - a deploy under GitHub Pages' caching serves one version.


import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(HERE, "..", "..", "docs");
const SCRIPTS = path.resolve(HERE, "..", "..", "scripts");
const CHROMIUM = process.env.CHROMIUM || "/usr/bin/chromium";
const CHANGED = ["lexicon.js", "form.js"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".jsonl": "application/x-ndjson", ".png": "image/png" };

// A static server whose root can be swapped - the deploy - answering every file the way Pages does.
function pagesServer() {
  let root = null;
  const server = http.createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    try {
      const body = await fs.readFile(path.join(root, path.normalize(rel)));
      res.writeHead(200, { "content-type": MIME[path.extname(rel)] || "application/octet-stream",
        "cache-control": "max-age=600" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    server, port: server.address().port, deploy: (dir) => { root = dir; },
  })));
}

async function mark(dir, tag) {
  for (const f of CHANGED) {
    const p = path.join(dir, f);
    const src = (await fs.readFile(p, "utf8")).replace(/\nexport const __deploy = .*\n$/, "\n");
    await fs.writeFile(p, `${src}\nexport const __deploy = "${tag}";\n`);
  }
}

async function publish(src, dest) {
  await fs.cp(src, dest, { recursive: true });
  execFileSync("python3", ["-c",
    "import sys; from pathlib import Path; sys.dont_write_bytecode = True; sys.path.insert(0, sys.argv[1]); import webview_stamp; webview_stamp.DOCS = Path(sys.argv[2]); sys.exit(webview_stamp.main([]))",
    SCRIPTS, dest]);
}

const importMap = async (dir) => {
  const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).imports : null;
};

// Load deploy A, switch the server to B, load again. Returns what each load ran and which module responses the second load took from the browser's cache.
async function twoLoads(browser, srv, a, b) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname === "127.0.0.1") r.continue().catch(() => {});
    else r.abort().catch(() => {});
  });
  const ran = () => page.evaluate(async (files) => {
    const out = [];
    for (const f of files) out.push((await import(`./${f}`)).__deploy);
    return out;
  }, CHANGED);
  const boot = () => page.waitForFunction(() => window.__proto?.ready === true, { timeout: 30000 });

  srv.deploy(a);
  await page.goto(`http://127.0.0.1:${srv.port}/`, { waitUntil: "domcontentloaded" });
  await boot();
  const first = await ran();

  srv.deploy(b);
  const modules = [];
  const onResponse = (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith(".js")) modules.push({ file: u.pathname.slice(1), cached: r.fromCache() });
  };
  page.on("response", onResponse);
  await page.reload({ waitUntil: "domcontentloaded" });
  await boot();
  const second = await ran();
  page.off("response", onResponse);
  await ctx.close();
  return { first, second, modules };
}

let failed = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "furcat-publish-"));
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const srv = await pagesServer();
  try {
    // The current LFC working tree, then two versions of it.
    const src = path.join(tmp, "src");
    await fs.cp(DOCS, src, { recursive: true });
    const raw = { a: path.join(tmp, "raw-a"), b: path.join(tmp, "raw-b") };
    const pub = { a: path.join(tmp, "pub-a"), b: path.join(tmp, "pub-b") };
    await mark(src, "A");
    await fs.cp(src, raw.a, { recursive: true });
    await publish(src, pub.a);
    await mark(src, "B");
    await fs.cp(src, raw.b, { recursive: true });
    await publish(src, pub.b);

    const mapA = await importMap(pub.a);
    const mapB = await importMap(pub.b);
    check(mapA && mapB, "each published index.html carries an import map");
    const moved = Object.keys(mapA).filter((k) => mapA[k] !== mapB[k]).sort();
    check(JSON.stringify(moved) === JSON.stringify(CHANGED.map((f) => `./${f}`).sort()),
      `the URLs that changed are exactly the changed modules: ${moved.join(", ")}`);

    const u = await twoLoads(browser, srv, raw.a, raw.b);
    check(u.first.join() === "A,A", `unstamped: the first load runs deploy A (${u.first})`);
    check(u.second.join() !== "B,B",
      `unstamped: after the deploy the next load still runs old modules (${u.second}) - the defect`);

    const p = await twoLoads(browser, srv, pub.a, pub.b);
    check(p.first.join() === "A,A", `published: the first load runs deploy A (${p.first})`);
    check(p.second.join() === "B,B", `published: the next load runs deploy B (${p.second})`);
    const refetched = p.modules.filter((m) => !m.cached).map((m) => m.file).sort();
    check(JSON.stringify(refetched) === JSON.stringify([...CHANGED].sort()),
      `published: only the changed modules were fetched again (${refetched.join(", ")})`);
  } finally {
    await browser.close();
    srv.server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} failure(s)` : "\nall passed");
  process.exitCode = failed ? 1 : 0;
}

main();
