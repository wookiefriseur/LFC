#!/usr/bin/env python3
"""Version the web interface's module URLs by content hash, for cache invalidation:

    "./quick-edit.js": "./quick-edit.js?v=<hash>"

webview_serve.py runs this before serving docs/.

    python3 scripts/webview_stamp.py [--check | --texts]

It also checks the interface's text: every id a page passes to t("...") or names in a data-t
attribute is in docs/locale/en.js, every id there is used, and each translation in
docs/locale/<language>.json has a known id and keeps the {name} holes of its English text.

--check changes nothing and exits 1 when the stamp is out of date or the text has a problem, for CI.
--texts checks the text alone, for a pull request, whose stamp the bot brings up to date after the merge.
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


MASTER = "locale/en.js"
ENTRY_LINE = re.compile(r'\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),(?:\s*//.*)?')
TEXT_ID = re.compile(r'[a-z]+\.[A-Za-z0-9_.@\[\]-]+')
USED = (re.compile(r'(?<![\w.$])t\(\s*"([^"]*)"'), re.compile(r'\bdata-t(?:-[a-z-]+)?="([^"]*)"'))
# Ids the code builds from a record's own keys, so no page names them literally
BUILT = ("tab.", "kind.", "group.", "field.", "tip.", "value.")


def holes(text):
    return sorted(re.findall(r'\{\w+\}', text))


def interface_texts(source):
    """{id: English text} of the master file, which is one "id": "text", line per text besides comments and blank lines."""
    lines = source.splitlines()
    start, end = lines.index("export default {"), lines.index("};")
    texts = {}
    for n, line in enumerate(lines[start + 1:end], start + 2):
        if not line.strip() or line.lstrip().startswith("//"):
            continue
        m = ENTRY_LINE.fullmatch(line)
        if not m:
            raise SystemExit(f'{MASTER}:{n}: expected "id": "text",')
        key, text = json.loads(m[1]), json.loads(m[2])
        if not TEXT_ID.fullmatch(key) or key in texts or not text:
            raise SystemExit(f"{MASTER}:{n}: {key!r} is not a new id with a text")
        texts[key] = text
    return texts


def text_problems(docs):
    """What disagrees between the master file, the pages that use its ids and the translations."""
    english = interface_texts((docs / MASTER).read_text(encoding="utf-8"))
    problems, literals = [], set()
    for path in sorted(docs.iterdir()):
        if path.suffix not in (".js", ".html"):
            continue
        source = path.read_text(encoding="utf-8")
        literals.update(re.findall(r'"([^"\n]*)"', source))
        problems += [f"{path.name}: {key!r} is not in {MASTER}"
                     for pattern in USED for key in pattern.findall(source) if key not in english]
    problems += [f"{MASTER}: {key!r} is used nowhere" for key in english
                 if key not in literals and not key.startswith(BUILT)]
    for path in sorted((docs / "locale").glob("*.json")):
        for key, text in json.loads(path.read_text(encoding="utf-8")).items():
            if key not in english:
                problems.append(f"locale/{path.name}: {key!r} is not in {MASTER}")
            elif holes(text) != holes(english[key]):
                problems.append(f"locale/{path.name}: {key!r} must keep {' '.join(holes(english[key])) or 'free of {name} holes'}")
    return problems


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def versions(docs):
    v = {p.name: digest(p) for p in sorted(docs.iterdir())
         if p.is_file() and (p.suffix == ".js" or p.name == "style.css")}
    v[MASTER] = digest(docs / MASTER)
    return v


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
    stale = []
    # Reported, but the stamp is still written: stale module versions break more than a text that shows its id
    problems = text_problems(DOCS)
    if problems:
        print("\n".join(problems))
    if "--texts" in argv:
        return 1 if problems else 0
    v = versions(DOCS)
    manifest_path = DOCS / "reference-data" / "manifest.json"
    old = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(old)
    for dataset in manifest["datasets"].values():
        for entry in dataset.get("shards", []):
            entry["digest"] = digest(manifest_path.parent / entry["file"])
        for entry in [dataset, *dataset.get("translations", {}).values()]:
            if "file" in entry:
                entry["digest"] = digest(manifest_path.parent / entry["file"])
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
        return 1 if problems else 0
    print(("restamped " + ", ".join(stale)) if stale else "stamp was already current")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
