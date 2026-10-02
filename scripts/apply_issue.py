#!/usr/bin/env python3
"""Plan an opening-post diff -> JSONL -> Lua update without touching the checkout.

Writes a preview directory only. issue_pipeline.py publishes it.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from generate_db import ROOT, canonical, load_inputs, read_json, render, require, verify
from jsonschema import Draft202012Validator

BEGIN = '[//]: # (diff-begin)'
END = '[//]: # (diff-end)'


def extract(body):
    require(isinstance(body, str) and body.count(BEGIN) == body.count(END) == 1,
            'opening post must contain exactly one diff-begin / diff-end block')
    start, end = body.index(BEGIN) + len(BEGIN), body.index(END)
    require(start < end, 'diff markers are reversed')
    lines = body[start:end].strip().splitlines()
    require(len(lines) >= 3 and lines[0].strip() in ('```', '```json', '```jsonl')
            and lines[-1].strip() == '```', 'diff block must be fenced JSONL')
    result = []
    for number, line in enumerate(lines[1:-1], 1):
        if line.strip():
            try:
                result.append(read_json(line))
            except ValueError as exc:
                raise ValueError(f'diff line {number}: {exc}') from exc
    require(result, 'diff block is empty')
    return result


def validate_diff(lines, root=ROOT):
    schema = read_json((root / 'schemas/diff-line.schema.json').read_text())
    validator = Draft202012Validator(schema)
    for number, line in enumerate(lines, 1):
        errors = list(validator.iter_errors(line))
        require(not errors, f'diff line {number}: {errors[0].message}' if errors else '')
    return schema


def payload_hash(lines):
    return hashlib.sha256(canonical(lines).encode()).hexdigest()


def json_bytes(value, indent=2):
    return (json.dumps(value, ensure_ascii=False, indent=indent) + '\n').encode()


def digest(data, length=16):
    return hashlib.sha256(data).hexdigest()[:length]


class Files:
    """Only changed, explicitly addressed files enter the publication plan."""
    def __init__(self, root):
        self.root = root
        self.changed = {}

    def read(self, name):
        return self.changed[name] if name in self.changed else (self.root / name).read_bytes()

    def put(self, name, data):
        path = self.root / name
        if path.exists() and path.read_bytes() == data:
            self.changed.pop(name, None)
        else:
            self.changed[name] = data

    def obj(self, name):
        return read_json(self.read(name).decode())

    def put_obj(self, name, value, indent=2):
        path = self.root / name
        # Preserve existing formatting when the value did not change.
        if name not in self.changed and path.exists() and self.obj(name) == value:
            return
        self.put(name, json_bytes(value, indent))


def add_name(files, item, name):
    """A discovered item's game name joins the catalogue's names, which the site and the generated comments read; a known name is kept."""
    names = files.obj('docs/data/names.en.json')
    if str(item) in names:
        return
    names[str(item)] = name
    files.put_obj('docs/data/names.en.json', dict(sorted(names.items(), key=lambda kv: int(kv[0]))), 0)


def update_reference(files, line, record):
    if 'id' in record and 'blueprint' in record:
        recipes = files.obj('docs/reference-data/recipes.json')
        key = str(record['blueprint'])
        require(key not in recipes or recipes[key] == record['id'], 'conflicting recipe reference')
        recipes[key] = record['id']
        files.put_obj('docs/reference-data/recipes.json', recipes, None)
        manifest = files.obj('docs/reference-data/manifest.json')
        manifest['datasets']['recipes']['count'] = len(recipes)
        manifest['datasets']['recipes']['digest'] = digest(files.read('docs/reference-data/recipes.json'), 12)
        files.put_obj('docs/reference-data/manifest.json', manifest)
    reference = line.get('reference')
    if not reference:
        return
    meta = copy.deepcopy(reference['meta'])
    require(meta['id'] == record.get('id'), 'discovery metadata must address the furnishing id')
    manifest = files.obj('docs/reference-data/manifest.json')
    dataset = manifest['datasets']['meta']
    require(reference['locale'] == dataset['locale'], 'discovery locale differs from the metadata dataset')
    add_name(files, meta['id'], meta['name'])
    size = manifest['shard_size']
    low = meta['id'] // size * size
    name = f'meta/meta-{low:07d}-{low + size - 1:07d}.jsonl'
    path = 'docs/reference-data/' + name
    rows = [read_json(s) for s in files.read(path).decode().splitlines() if s.strip()] if (files.root / path).exists() or path in files.changed else []
    # A partial discovery updates one row and preserves all other reference rows.
    meta['icon'] = meta['icon'].rsplit('/', 1)[-1][:-4]
    if 'blueprint' in record:
        meta['blueprint'] = record['blueprint']
    existing = next((r for r in rows if r['id'] == meta['id']), None)
    if existing is not None:
        existing.update(meta)
    else:
        rows.append(meta)
    rows.sort(key=lambda r: r['id'])
    data = ''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n' for r in rows).encode()
    files.put(path, data)
    entry = next((s for s in dataset['shards'] if s['file'] == name), None)
    if entry is None:
        entry = {'file': name, 'id_min': low, 'id_max': low + size - 1}
        dataset['shards'].append(entry)
    entry.update(count=len(rows), bytes=len(data), digest=digest(data, 12))
    dataset['shards'].sort(key=lambda s: s['id_min'])
    dataset['id_max'] = max(s['id_max'] for s in dataset['shards'])
    files.put_obj('docs/reference-data/manifest.json', manifest)


def update_name(files, line):
    manifest = files.obj('docs/reference-data/manifest.json')
    dataset = manifest['datasets']['names']
    require(line['locale'] == dataset['locale'], 'name locale is not published by this site')
    name = f"docs/reference-data/names.{line['locale']}.json"
    names = files.obj(name)
    names.setdefault(line['kind'], {})[str(line['id'])] = line['name']
    files.put_obj(name, names, 0)
    dataset['counts'] = {k: len(v) for k, v in names.items()}
    dataset['digest'] = digest(files.read(name), 12)
    files.put_obj('docs/reference-data/manifest.json', manifest)


def refresh_manifest(files, groups):
    name = 'docs/data/manifest.json'
    manifest = files.obj(name)
    fingerprint = hashlib.sha256()
    counts = {}
    for entry in manifest['files']:
        kind = entry['type']
        require(entry['name'] == kind + '.jsonl' and kind in groups, 'invalid data manifest entry')
        entry['records'] = counts[kind] = len(groups[kind])
        entry['digest'] = digest(files.read('docs/data/' + entry['name']))
        fingerprint.update(f"{entry['name']}:{entry['digest']}\n".encode())
    require(set(counts) == set(groups), 'data manifest does not cover the catalogue')
    for extra in ('enums.json', 'names.en.json'):
        fingerprint.update(f'{extra}:{digest(files.read("docs/data/" + extra))}\n'.encode())
    manifest['digest'] = fingerprint.hexdigest()[:16]
    manifest['counts'].update(records=sum(counts.values()), files=len(counts), by_type=counts,
                              ids=len({r[k] for rows in groups.values() for r in rows for k in ('id', 'blueprint') if k in r}))
    files.put_obj(name, manifest)


def plan(body, root=ROOT, lua_command=None):
    return apply(extract(body), root, lua_command)


def check(root=ROOT, lua_command=None):
    """Canonical data, manifests and generated Lua agree: an empty diff changes nothing."""
    files, _ = apply([], root, lua_command)
    require(not files, 'out of date with canonical data: ' + ', '.join(sorted(files)))


def apply(lines, root=ROOT, lua_command=None):
    schema = validate_diff(lines, root)
    files = Files(root)
    enums = files.obj('docs/data/enums.json')
    groups, originals = {}, {}
    for kind in enums['source_types']:
        name = f'docs/data/{kind}.jsonl'
        texts = files.read(name).decode().splitlines(keepends=True)
        groups[kind] = [read_json(s) for s in texts if s.strip()]
        originals[kind] = {canonical(read_json(s)): s for s in texts if s.strip()}
    summaries = []
    for line in lines:
        if line['op'] != 'add-enum':
            continue
        key, value = line['enum'], line['value']
        require(key in schema['$defs']['metaFor'], f'unsupported editable vocabulary: {key}')
        require(re.fullmatch(r'[A-Z][A-Z0-9_]*', value), 'invalid vocabulary symbol')
        entry = {'symbol': value, **line['meta']} if 'meta' in line else value
        found = [e for e in enums[key] if (e.get('symbol') if isinstance(e, dict) else e) == value]
        require(not found or found == [entry], f'vocabulary symbol already has different metadata: {value}')
        if not found:
            enums[key].append(entry)
        summaries.append({'op': 'add-enum', 'enum': key, 'value': value})
    files.put_obj('docs/data/enums.json', enums)
    for line in lines:
        op = line['op']
        if op == 'add-enum':
            continue
        if op == 'name':
            update_name(files, line)
            summaries.append(line)
            continue
        kind = line['category']
        require(kind in groups, f'unknown source file: {kind}')
        rows = groups[kind]
        before = None
        if op == 'add':
            after = copy.deepcopy(line['record'])
            require(all(after.get(k) == line[k] for k in ('id', 'blueprint') if k in line), 'add identity disagrees with record')
            require(after['source']['type'] == kind, 'add source disagrees with its file')
            rows.append(after)
        else:
            matches = [r for r in rows if all(r.get(k) == line[k] for k in ('id', 'blueprint') if k in line)
                       and ('match' not in line or r['source'] == line['match'])]
            require(len(matches) == 1, f'{op} {line.get("id", line.get("blueprint"))}: expected one match, found {len(matches)}')
            before = copy.deepcopy(matches[0])
            if op == 'delete':
                rows.remove(matches[0])
                after = None
            else:
                after = matches[0]
                for key, value in line['fields'].items():
                    if value is None:
                        after.pop(key, None)
                    else:
                        after[key] = copy.deepcopy(value)
                require(after.get('source', {}).get('type') == kind, 'source-file moves must use delete plus add')
        if after is not None:
            update_reference(files, line, after)
        summaries.append({'op': op, 'category': kind, 'before': before, 'after': copy.deepcopy(after)})
    for kind, rows in groups.items():
        encoded = ''.join(originals[kind].get(canonical(r), json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n') for r in rows)
        files.put(f'docs/data/{kind}.jsonl', encoded.encode())
    refresh_manifest(files, groups)
    command = lua_command or [os.environ.get('LUA', str(root / 'bin/lua'))]
    with tempfile.TemporaryDirectory() as tmp:
        candidate = Path(tmp)
        data = candidate / 'data'
        data.mkdir()
        for name in ['enums.json', 'names.en.json', *[k + '.jsonl' for k in groups]]:
            (data / name).write_bytes(files.read('docs/data/' + name))
        recipes = candidate / 'recipes.json'
        recipes.write_bytes(files.read('docs/reference-data/recipes.json'))
        # The metadata names the discovered items in the generated comments
        (candidate / 'meta').mkdir()
        for shard in files.obj('docs/reference-data/manifest.json')['datasets']['meta']['shards']:
            (candidate / shard['file']).write_bytes(files.read('docs/reference-data/' + shard['file']))
        catalogue, records = load_inputs(data, recipes)
        constants, database, projection = catalogue.build(records)
        outputs = render(constants, database, catalogue.labels)
        require(outputs == render(*catalogue.build(records)[:2], catalogue.labels), 'generation is not deterministic')
        for name, content in outputs.items():
            (candidate / name).write_text(content, encoding='utf-8')
        verify(candidate, projection, command)
        for name, content in outputs.items():
            files.put('LibFurnitureCatalogue/data/' + name, content.encode())
    return files.changed, {'payload_sha256': payload_hash(lines), 'operations': summaries,
                           'records': len(records), 'items': len(database['items']), 'rumours': len(database['rumours'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('body', type=Path, nargs='?', help='opening post saved as UTF-8 text')
    parser.add_argument('--out', type=Path, help='preview directory to create, outside the checkout')
    parser.add_argument('--check', action='store_true', help='verify the checkout is consistent, write nothing')
    parser.add_argument('--lua', default=os.environ.get('LUA', str(ROOT / 'bin/lua')))
    parser.add_argument('--esoui')
    args = parser.parse_args()
    command = [args.lua] + (['-s', args.esoui] if args.esoui else [])
    if args.check:
        check(lua_command=command)
        print('Canonical data, manifests and generated Lua agree')
        return
    require(args.body and args.out, 'body and --out are required without --check')
    require(not args.out.exists(), 'preview directory must not exist yet')
    require(not args.out.resolve().is_relative_to(ROOT), 'preview must be outside the checkout')
    files, report = plan(args.body.read_text(), lua_command=command)
    args.out.mkdir(parents=True)
    for name, data in files.items():
        path = args.out / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    (args.out / 'report.json').write_bytes(json_bytes(report))
    print(f'Verified {report["records"]} records; {len(files)} changed files in {args.out}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        raise SystemExit(str(exc)) from exc
