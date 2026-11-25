#!/usr/bin/env python3
"""Import a FurCDev names dump ("Names dump" on the Dump tab) into the site's per-language names.

    python3 scripts/import_names.py <FurnitureCatalogue_DevUtility.lua> [--date YYYY-MM-DD]

The dump's own locale decides the file, docs/reference-data/names.<locale>.json. A name in the dump replaces
the stored one; an id the dump does not carry keeps its name. The manifest is updated with it.

English item names live in docs/data/names.en.json. Item details (discovery lines) and name changes from the site bring
them in, and an English dump replaces them like any other name, so a renamed item, a hand-set name and a blueprint,
which no discovery line carries, are corrected.

A language file other than English holds two things: the names read from a client in that language, per table,
and under "fallback" the English names of every id that has none. The fallback is generated here and by
apply_issue.py, never edited: a translated name that happens to equal the English one stays in its table.
"""
import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# The game's own codes, as the Language.2 setting reports them
GAME_LOCALES = ('en', 'de', 'fr', 'es', 'ru', 'jp', 'zh')
KINDS = ('items', 'houses', 'quests', 'achievements', 'zones', 'categories', 'themes', 'skills')
# Not names, but in the same dump: [furnishing id] = id of the crafting skill that makes it. The same in every language.
CRAFTS = 'docs/reference-data/crafts.json'
ITEMS = 'docs/data/names.en.json'
MANIFEST = 'docs/reference-data/manifest.json'
DATA_MANIFEST = 'docs/data/manifest.json'

TABLES = KINDS + ('crafts',)
KIND_RE = re.compile(r'^\s*(?:\["(%s)"\]|(%s))\s*=' % ('|'.join(TABLES), '|'.join(TABLES)))
CRAFT_RE = re.compile(r'^\s*\[(\d+)\]\s*=\s*(\d+)\s*,?\s*$')
ENTRY_RE = re.compile(r'^\s*\[(\d+)\]\s*=\s*"(.*)"\s*,?\s*$')
FIELD_RE = re.compile(r'^\s*\["(locale|apiVersion)"\]\s*=\s*"?([a-z0-9]+)"?')
ESCAPES = {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', "'": "'", '\n': '\n'}


def is_name(name, ident):
    """Not empty, not the id itself, and no run of six or more digits, which is an item id that leaked into the text."""
    name = name.strip()
    return bool(name) and name != str(ident) and not re.search(r'\d{6,}', name)


def names_file(locale):
    return f'docs/reference-data/names.{locale}.json'


def unescape(body):
    """Lua string escapes as the game writes them; a decimal escape is one byte of UTF-8."""
    if '\\' not in body:
        return body
    out, i = bytearray(), 0
    while i < len(body):
        c = body[i]
        i += 1
        if c != '\\' or i >= len(body):
            out += c.encode()
            continue
        c = body[i]
        i += 1
        if c.isdigit():
            digits = c
            while len(digits) < 3 and i < len(body) and body[i].isdigit():
                digits += body[i]
                i += 1
            out.append(int(digits) & 255)
        else:
            out += ESCAPES.get(c, c).encode()
    return out.decode()


def parse(text):
    """-> {'locale', 'apiVersion', 'kinds': {kind: {id: name}}}"""
    dump = {'locale': None, 'apiVersion': None, 'kinds': {}, 'crafts': {}}
    kind = None
    for line in text.splitlines():
        m = KIND_RE.match(line)
        if m:
            kind = m.group(1) or m.group(2)
            continue
        m = FIELD_RE.match(line)
        if m:
            dump[m.group(1)] = dump[m.group(1)] or m.group(2)
            continue
        m = CRAFT_RE.match(line)
        if m and kind == 'crafts':
            dump['crafts'][m.group(1)] = int(m.group(2))
            continue
        m = ENTRY_RE.match(line)
        if m and kind and kind != 'crafts':
            # the game's own data ends a few names in a comma and drops it when it shows them
            name = unescape(m.group(2)).strip().rstrip(',').rstrip()
            if is_name(name, m.group(1)):
                dump['kinds'].setdefault(kind, {})[m.group(1)] = name
    return dump


def by_id(names):
    return dict(sorted(names.items(), key=lambda kv: int(kv[0])))


def english(obj):
    """Every English name, items included. `obj(name)` reads a JSON file of the checkout."""
    en = dict(obj(names_file('en')))
    en['items'] = {k: v for k, v in obj(ITEMS).items() if v and v != f'Item {k}'}
    return en


def data_digest(manifest, read):
    """What the site compares to know its stored catalogue is stale: every data file, the enums and the English item names."""
    fingerprint = hashlib.sha256()
    for entry in manifest['files']:
        fingerprint.update(f"{entry['name']}:{entry['digest']}\n".encode())
    for extra in ('enums.json', 'names.en.json'):
        fingerprint.update(f'{extra}:{hashlib.sha256(read("docs/data/" + extra)).hexdigest()[:16]}\n'.encode())
    return fingerprint.hexdigest()[:16]


def with_fallback(names, en):
    out = {k: by_id(names.get(k, {})) for k in KINDS}
    out['fallback'] = {k: by_id({i: n for i, n in en.get(k, {}).items() if i not in out[k]}) for k in KINDS}
    return out


def manifest_entry(dataset, locale, names, data):
    """The manifest's record of one language file. English is the dataset itself, the others sit under it."""
    entry = dataset if locale == 'en' else dataset.setdefault('translations', {}).setdefault(locale, {})
    if locale != 'en':
        entry['file'] = names_file(locale).rsplit('/', 1)[-1]
        entry['fallback'] = sum(len(v) for v in names['fallback'].values())
    entry['counts'] = {k: len(v) for k, v in names.items() if k != 'fallback'}
    entry['digest'] = hashlib.sha256(data).hexdigest()[:12]
    return entry


def refresh_fallbacks(root, manifest, en):
    """New English names move the fallback of every other language file."""
    for other in manifest['datasets']['names'].get('translations', {}):
        path = root / names_file(other)
        names = with_fallback(json.loads(path.read_text(encoding='utf-8')), en)
        data = dumps(names, 0)
        path.write_bytes(data)
        manifest_entry(manifest['datasets']['names'], other, names, data)


def dumps(value, indent):
    return (json.dumps(value, ensure_ascii=False, indent=indent) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('dump', type=Path)
    parser.add_argument('--date', default=str(datetime.date.today()), help='day the dump was taken (default: today)')
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    datetime.date.fromisoformat(args.date)

    def obj(name):
        return json.loads((args.root / name).read_text(encoding='utf-8'))

    try:
        dump = parse(args.dump.read_text(encoding='utf-8'))
    except UnicodeDecodeError as e:
        sys.exit(f'the dump is not valid UTF-8 ({e}) - dumped with an old FurCDev? Nothing was written.')
    locale = dump['locale']
    if locale not in GAME_LOCALES:
        sys.exit(f'the dump names no game language (locale: {locale})')
    if not dump['kinds']:
        sys.exit('no names in this file - use "Names dump" on the Dump tab, then reload the UI')
    if locale == 'en' and 'items' in dump['kinds']:
        found = dump['kinds'].pop('items')
        items = obj(ITEMS)
        new = sum(1 for i in found if i not in items)
        changed = sum(1 for i, n in found.items() if i in items and items[i] != n)
        items.update(found)
        (args.root / ITEMS).write_bytes(dumps(by_id(items), 0))
        data = obj(DATA_MANIFEST)
        data['digest'] = data_digest(data, lambda name: (args.root / name).read_bytes())
        (args.root / DATA_MANIFEST).write_bytes(dumps(data, 2))
        print(f'{"items":13} {len(found):6} read, {new} new, {changed} changed')

    path = args.root / names_file(locale)
    names = obj(names_file(locale)) if path.exists() else {}
    names.pop('fallback', None)
    for kind, found in dump['kinds'].items():
        have = names.setdefault(kind, {})
        new = sum(1 for i in found if i not in have)
        changed = sum(1 for i, n in found.items() if i in have and have[i] != n)
        have.update(found)
        print(f'{kind:13} {len(found):6} read, {new} new, {changed} changed')
    if locale != 'en':
        names = with_fallback(names, english(obj))
        print(f'{"fallback":13} {sum(len(v) for v in names["fallback"].values()):6} ids only have an English name')
    data = dumps(names, 0)
    path.write_bytes(data)

    manifest = obj(MANIFEST)
    entry = manifest_entry(manifest['datasets']['names'], locale, names, data)
    if locale == 'en':
        refresh_fallbacks(args.root, manifest, english(obj))
    entry['dumped'] = args.date
    if dump['apiVersion']:
        entry['apiVersion'] = int(dump['apiVersion'])
    if dump['crafts']:
        data = dumps(by_id(dump['crafts']), 0)
        (args.root / CRAFTS).write_bytes(data)
        manifest['datasets']['crafts'] = {
            'description': 'The crafting skill that makes a furnishing, {furnishing id: skill id}. Skill names are the `skills` table of the names files.',
            'file': CRAFTS.rsplit('/', 1)[-1], 'count': len(dump['crafts']),
            'digest': hashlib.sha256(data).hexdigest()[:12]}
        print(f'{"crafts":13} {len(dump["crafts"]):6} furnishings with their crafting skill')
    (args.root / MANIFEST).write_bytes(dumps(manifest, 2))
    print(f'wrote {path.relative_to(args.root)} ({locale}) and the manifest.')


if __name__ == '__main__':
    main()
