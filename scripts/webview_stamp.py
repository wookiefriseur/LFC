#!/usr/bin/env python3
"""Version the web interface's module URLs by content hash, for cache invalidation:

    "./quick-edit.js": "./quick-edit.js?v=<hash>"

webview_serve.py runs this before serving docs/.

    python3 scripts/webview_stamp.py [--check]

--check changes nothing and exits 1 when the stamp is out of date, for CI.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"

ENTRY = re.compile(r'<script type="module" src="(?:\./)?app\.js(?:\?v=[0-9a-f]+)?"></script>')
STYLE = re.compile(r'<link rel="stylesheet" href="(?:\./)?style\.css(?:\?v=[0-9a-f]+)?">')
IMPORT_MAP = re.compile(r'\n?[ \t]*<script type="importmap">.*?</script>', re.DOTALL)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def versions(docs):
    return {p.name: digest(p) for p in sorted(docs.iterdir())
            if p.is_file() and (p.suffix == ".js" or p.name == "style.css")}


def stamp(html, v, name):
    """index.html / 404.html with every versioned reference brought up to date. Refuses a page whose entry script or stylesheet it cannot find."""
    html, n = STYLE.subn(f'<link rel="stylesheet" href="./style.css?v={v["style.css"]}">', html)
    if n != 1:
        raise SystemExit(f"{name}: expected one style.css link, found {n}")
    if name != "index.html":
        return html
    html, n = ENTRY.subn(f'<script type="module" src="./app.js?v={v["app.js"]}"></script>', html)
    if n != 1:
        raise SystemExit(f"{name}: expected one app.js entry script, found {n}")
    html = IMPORT_MAP.sub("", html)
    imports = {f"./{m}": f"./{m}?v={h}" for m, h in v.items() if m.endswith(".js")}
    block = json.dumps({"imports": imports}, indent=2).replace("\n", "\n  ")
    # End of <head>: before every module script, and after <meta charset>, which a browser only looks for in the first 1024 bytes.
    html, n = re.subn(r"</head>",
                      lambda _: f'  <script type="importmap">\n  {block}\n  </script>\n</head>',
                      html, count=1)
    if n != 1:
        raise SystemExit(f"{name}: no </head> to put the import map before")
    return html


def main(argv):
    check = "--check" in argv
    v = versions(DOCS)
    stale = []
    manifest_path = DOCS / "reference-data" / "manifest.json"
    old = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(old)
    for dataset in manifest["datasets"].values():
        for entry in dataset.get("shards", []):
            entry["digest"] = digest(manifest_path.parent / entry["file"])
        if "file" in dataset:
            dataset["digest"] = digest(manifest_path.parent / dataset["file"])
    new = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    if new != old:
        stale.append("reference-data/manifest.json")
        if not check:
            manifest_path.write_text(new, encoding="utf-8")
    for name in ("index.html", "404.html"):
        path = DOCS / name
        old = path.read_text(encoding="utf-8")
        new = stamp(old, v, name)
        if new != old:
            stale.append(name)
            if not check:
                path.write_text(new, encoding="utf-8")
    if check:
        if stale:
            print("out of date: " + ", ".join(stale) + " - run scripts/webview_stamp.py")
            return 1
        print("stamp is current")
        return 0
    print(("restamped " + ", ".join(stale)) if stale else "stamp was already current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
