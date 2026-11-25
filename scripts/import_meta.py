#!/usr/bin/env python3
"""Import a FurCDev meta dump ("Meta dump" on the Dump tab) into the site's item metadata and category tree.

    python3 scripts/import_meta.py <FurnitureCatalogue_DevUtility.lua> [--date YYYY-MM-DD] [--dry-run]

A meta dump holds every catalogued item, so it refreshes what the game says about each of them: quality, category,
subcategory, theme, icon and blueprint, in docs/reference-data/meta/*.jsonl. Item details from the site refresh one
item at a time; this is the same update for the whole catalogue, too big for an issue.

Names stay with import_names.py. The dump's names are in the client's language, the stored ones in English, so a
name is only taken from an English dump, and only for a row that has none yet.

An item the client cannot name is skipped: the game answers a blank placeholder for it, which says nothing. An
item the dump does not carry keeps its row: the dump lists what the catalogue holds, not what the game removed.
The category tree (parent, order) is the same in every language and is taken from any dump; the English name of a
category comes from an English dump or from the names files.
"""

import argparse
import collections
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

from import_names import GAME_LOCALES, names_file, unescape

ROOT = Path(__file__).resolve().parent.parent
FORMAT = 'furniture-meta-v1'
MANIFEST = 'docs/reference-data/manifest.json'
CATEGORIES = 'docs/reference-data/categories.en.json'
ITEM_NAMES = 'docs/data/names.en.json'
# the game's stand-in for a missing icon never replaces a real one
PLACEHOLDER_ICON = 'icon_missing'
FIELDS = ('quality', 'cat', 'sub', 'theme', 'icon', 'blueprint')

TOKEN_RE = re.compile(r'\s*(?:(--[^\n]*)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|([A-Za-z_]\w*)|(.))', re.S)


def tokens(text):
    for m in TOKEN_RE.finditer(text):
        comment, string, number, name, char = m.groups()
        if comment:
            continue
        if string is not None:
            yield 'str', unescape(string[1:-1])
        elif number is not None:
            yield 'num', float(number) if any(c in number for c in '.eE') else int(number)
        elif name is not None:
            yield 'name', name
        elif char is not None and not char.isspace():
            yield 'op', char


def parse_lua(text):
    """{global name: value} for a SavedVariables file: tables, strings, numbers and booleans, which is all it holds."""
    stream = list(tokens(text))
    pos = 0

    def take(kind=None, value=None):
        nonlocal pos
        if pos >= len(stream):
            raise ValueError('the file ends inside a table')
        tok = stream[pos]
        if (kind and tok[0] != kind) or (value is not None and tok[1] != value):
            raise ValueError(f'unexpected {tok[1]!r}, expected {value or kind}')
        pos += 1
        return tok[1]

    def peek(value):
        return pos < len(stream) and stream[pos][0] == 'op' and stream[pos][1] == value

    def value():
        kind, val = stream[pos]
        if kind == 'op' and val == '{':
            return table()
        take()
        if kind == 'name':
            return {'true': True, 'false': False, 'nil': None}.get(val, val)
        return val

    def table():
        take('op', '{')
        out, index = {}, 1
        while not peek('}'):
            if peek('['):
                take('op', '[')
                key = value()
                take('op', ']')
                take('op', '=')
            elif stream[pos][0] == 'name' and pos + 1 < len(stream) and stream[pos + 1][1] == '=':
                key = take('name')
                take('op', '=')
            else:
                key, index = index, index + 1
            out[key] = value()
            if not peek('}'):
                take('op', ',') if peek(',') else take('op', ';')
        take('op', '}')
        return out

    result = {}
    while pos < len(stream):
        name = take('name')
        take('op', '=')
        result[name] = value()
    return result


def dumps(value, indent):
    return (json.dumps(value, ensure_ascii=False, indent=indent) + '\n').encode()


def jsonl(rows):
    return ''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n' for r in rows).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()[:12]


def icon_leaf(path):
    leaf = str(path).rsplit('/', 1)[-1]
    return leaf[:-4] if leaf.lower().endswith('.dds') else leaf


def refreshed(row, item):
    """The row as the dump describes it. An item without furniture data has no category, which the rows store as 0."""
    new = dict(row)
    new['quality'] = int(item.get('quality', 0))
    for field in ('cat', 'sub', 'theme'):
        new[field] = int(item.get(field, 0))
    icon = icon_leaf(item['icon']) if item.get('icon') else None
    if icon and not (icon == PLACEHOLDER_ICON and row.get('icon') not in (None, '', PLACEHOLDER_ICON)):
        new['icon'] = icon
    if isinstance(item.get('blueprint'), int) and item['blueprint'] > 0:
        new['blueprint'] = item['blueprint']
    return new


def merge_items(shards, items, size, english, item_names):
    """-> (shards, report). shards: {file: [rows]}; items: {id: dump record}."""
    rows = {r['id']: (name, r) for name, file_rows in shards.items() for r in file_rows}
    report = {'read': len(items), 'new': 0, 'unknown': 0, 'fields': collections.Counter(), 'moves': collections.Counter(),
              'named': 0}
    out = {name: list(file_rows) for name, file_rows in shards.items()}
    for ident, item in sorted(items.items()):
        # no name: this client does not know the item (removed, or not live yet) and reads it as a blank placeholder
        if not item.get('name'):
            report['unknown'] += 1
            continue
        low = ident // size * size
        file = f'meta/meta-{low:07d}-{low + size - 1:07d}.jsonl'
        if ident in rows:
            file, old = rows[ident]
        else:
            old = {'id': ident, 'name': item_names.get(str(ident), '')}
            out.setdefault(file, [])
            report['new'] += 1
        new = refreshed(old, item)
        if english and not new.get('name') and item.get('name'):
            new['name'] = item['name']
            report['named'] += 1
        for field in FIELDS:
            if field in new and new.get(field) != old.get(field) and ident in rows:
                report['fields'][field] += 1
        if ident in rows and old.get('sub') != new['sub']:
            report['moves'][(old.get('cat'), old.get('sub'), new['cat'], new['sub'])] += 1
        file_rows = out[file]
        if ident in rows:
            file_rows[file_rows.index(old)] = new
        else:
            file_rows.append(new)
    for file_rows in out.values():
        file_rows.sort(key=lambda r: r['id'])
    return out, report


def merge_categories(stored, dumped, english, category_names):
    """-> (categories, new ids, ids without an English name). Tree from the dump, English names kept or looked up."""
    out = {k: dict(v) for k, v in stored.items()}
    new, unnamed = [], []
    for key, cat in dumped.items():
        key = str(key)
        entry = out.setdefault(key, {})
        if not entry:
            new.append(key)
        name = cat.get('name') if english else entry.get('name') or category_names.get(key, '')
        if not name:
            unnamed.append(key)
        entry.update(name=name or '', parent=int(cat.get('parent', 0)), order=int(cat.get('order', 0)))
    return dict(sorted(out.items(), key=lambda kv: int(kv[0]))), new, unnamed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('dump', type=Path)
    parser.add_argument('--date', default=str(datetime.date.today()), help='day the dump was taken (default: today)')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--dry-run', action='store_true', help='report what would change, write nothing')
    args = parser.parse_args()
    datetime.date.fromisoformat(args.date)

    def obj(name):
        return json.loads((args.root / name).read_text(encoding='utf-8'))

    try:
        saved = parse_lua(args.dump.read_text(encoding='utf-8'))
    except UnicodeDecodeError as e:
        sys.exit(f'the dump is not valid UTF-8 ({e}) - dumped with an old FurCDev? Nothing was written.')
    except ValueError as e:
        sys.exit(f'not a SavedVariables file: {e}. Nothing was written.')
    meta = (saved.get('FurCDev_SavedVariables') or {}).get('meta')
    if not isinstance(meta, dict) or not meta.get('items'):
        sys.exit('no meta dump in this file - use "Meta dump" on the Dump tab, then reload the UI')
    if meta.get('format') != FORMAT:
        sys.exit(f'unknown meta dump format {meta.get("format")!r}, expected {FORMAT}')
    locale = meta.get('locale')
    if locale not in GAME_LOCALES:
        sys.exit(f'the dump names no game language (locale: {locale})')

    manifest = obj(MANIFEST)
    dataset = manifest['datasets']['meta']
    english = locale == dataset['locale']
    shards = {s['file']: [json.loads(line) for line in obj_text(args.root, s['file']).splitlines() if line.strip()]
              for s in dataset['shards']}
    items = {int(k): v for k, v in meta['items'].items() if isinstance(v, dict)}
    shards, report = merge_items(shards, items, manifest['shard_size'], english, obj(ITEM_NAMES))

    stored_categories = obj(CATEGORIES)
    categories, new_categories, unnamed = merge_categories(
        stored_categories, meta.get('categories') or {}, english, obj(names_file('en')).get('categories', {}))

    fields = ', '.join(f'{f} {n}' for f, n in sorted(report['fields'].items())) or 'none'
    print(f'{"items":11} {report["read"]:6} read, {report["new"]} new rows, changed fields: {fields}')
    for (cat, sub, new_cat, new_sub), n in report['moves'].most_common(10):
        print(f'{"":11} {n:6} moved from {cat}/{sub} to {new_cat}/{new_sub}')
    if report['unknown']:
        print(f'{"":11} {report["unknown"]:6} skipped, unknown to this client (see Detect deleted)')
    if report['named']:
        print(f'{"":11} {report["named"]:6} rows without a name got the English one')
    print(f'{"categories":11} {len(meta.get("categories") or {}):6} read, new: {", ".join(new_categories) or "none"}')
    if unnamed:
        print(f'{"":11} no English name for {", ".join(unnamed)} - take an English names or meta dump')
    if args.dry_run:
        print('dry run, nothing was written.')
        return

    changed = 0
    for entry in dataset['shards']:
        data = jsonl(shards.pop(entry['file']))
        changed += write(args.root / 'docs/reference-data' / entry['file'], data)
        entry.update(count=data.count(b'\n'), bytes=len(data), digest=digest(data))
    size = manifest['shard_size']
    for file, rows in shards.items():  # shards the dump opened
        data = jsonl(rows)
        changed += write(args.root / 'docs/reference-data' / file, data)
        low = int(file.split('-')[1])
        dataset['shards'].append({'file': file, 'id_min': low, 'id_max': low + size - 1,
                                  'count': len(rows), 'bytes': len(data), 'digest': digest(data)})
    dataset['shards'].sort(key=lambda s: s['id_min'])
    dataset['id_max'] = max(s['id_max'] for s in dataset['shards'])
    dataset['dumped'] = args.date
    if meta.get('apiVersion'):
        dataset['apiVersion'] = int(meta['apiVersion'])

    data = dumps(categories, 2)
    changed += write(args.root / CATEGORIES, data)
    manifest['datasets']['categories'].update(count=len(categories), digest=digest(data))
    write(args.root / MANIFEST, dumps(manifest, 2))
    print(f'wrote {changed} changed file(s) and the manifest.')


def obj_text(root, file):
    return (root / 'docs/reference-data' / file).read_text(encoding='utf-8')


def write(path, data):
    """-> 1 when the file changed"""
    if path.exists() and path.read_bytes() == data:
        return 0
    path.write_bytes(data)
    return 1


if __name__ == '__main__':
    main()
