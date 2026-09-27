#!/usr/bin/env python3
"""Build the versioned game database from JSONL"""

import argparse
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 1
SOURCE_FIELDS = (
    'vendor', 'subtype', 'locations', 'achievement', 'quest', 'skill_line',
    'skill_rank', 'note', 'part_of', 'event', 'container', 'collectible',
    'crate', 'packs', 'bundle', 'npc_class', 'npc_group', 'leads', 'houses', 'companion',
)
WEB_FIELDS = {'notes', 'name_overrides'}
CONTAINER_KINDS = ('books', 'folio')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, minimum=1):
    return type(value) is int and minimum <= value <= 2**53 - 1


def object_keys(value, allowed, required=()):
    require(isinstance(value, dict), 'expected an object')
    require(not (set(value) - set(allowed)), f'unsupported fields: {set(value) - set(allowed)}')
    require(set(required) <= set(value), f'missing fields: {set(required) - set(value)}')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'duplicate JSON key: {key}')
        result[key] = value
    return result


def read_json(text):
    return json.loads(text, object_pairs_hook=unique_object,
                      parse_constant=lambda s: require(False, f'invalid JSON number: {s}'))


def lua(value):
    if value is None:
        return 'nil'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return '"' + ''.join('\\%03d' % ord(c) if ord(c) < 32 or c in '\\"' else c for c in value) + '"'
    if isinstance(value, (list, tuple)):
        values = list(value)
        while values and values[-1] is None:
            values.pop()
        return '{' + ','.join(map(lua, values)) + '}'
    if isinstance(value, dict):
        return '{' + ','.join(f'[{lua(k)}]={lua(v)}' for k, v in sorted(value.items())) + '}'
    raise ValueError(f'cannot emit {type(value).__name__}')


class Catalogue:
    def __init__(self, enums, recipes):
        require(enums.get('schema_version') == 2, 'unsupported vocabulary schema')
        self.enums = enums
        self.recipes = recipes
        self.vocab_fields = enums['source_field_vocabularies']
        require(isinstance(self.vocab_fields, dict), 'source vocabularies must be an object')
        require(enums.get('id_unknown', {}).get('value') == 0 and enums['id_unknown'].get('fields') == ['achievement', 'quest'], 'unknown-id contract changed')
        self.symbols = {}
        self.ids = {}
        for key, values in enums.items():
            if not isinstance(values, list) or key == 'source_priority':
                continue
            symbols = [v['symbol'] if isinstance(v, dict) else v for v in values]
            require(all(isinstance(v, str) and v for v in symbols), f'invalid vocabulary: {key}')
            require(len(symbols) == len(set(symbols)), f'duplicate symbols: {key}')
            numbers = [v['ordinal'] for v in values] if key == 'versions' else range(1, len(values) + 1)
            require(all(integer(n) for n in numbers) and len(set(numbers)) == len(symbols), f'invalid ids: {key}')
            self.symbols[key] = dict(zip(numbers, symbols))
            self.ids[key] = dict(zip(symbols, numbers))
        require(len(self.ids['source_types']) <= 53, 'source mask exceeds exact integer range')
        require(all(re.fullmatch(r'[a-z][a-z0-9_]*', t) for t in self.ids['source_types']), 'invalid source slug')
        require(set(enums['source_type_contracts']) == set(self.ids['source_types']), 'source contracts do not match types')
        declared = set()
        for contract in enums['source_type_contracts'].values():
            declared.update(contract['required'] + contract['optional'])
        require(set(self.vocab_fields) <= set(SOURCE_FIELDS) and all(v in self.ids for v in self.vocab_fields.values()), 'invalid source vocabulary mapping')
        require(declared == set(SOURCE_FIELDS), 'source field contract changed; update the format deliberately')
        require(isinstance(recipes, dict), 'recipe map must be an object')
        for blueprint, item in recipes.items():
            require(re.fullmatch(r'[1-9][0-9]*', blueprint) and integer(int(blueprint)) and integer(item), 'invalid recipe mapping')

    def enum(self, key, value):
        require(isinstance(value, str) and value in self.ids.get(key, {}), f'unknown {key}: {value!r}')
        return self.ids[key][value]

    def source_value(self, source_type, field, value):
        if field in self.vocab_fields or field == 'subtype':
            key = self.vocab_fields.get(field, source_type + '_subtypes')
            if isinstance(value, list):
                require(bool(value), f'empty source.{field}')
                return [self.enum(key, v) for v in value]
            return self.enum(key, value)
        if field == 'locations':
            require(isinstance(value, list) and value, 'locations must be a nonempty list')
            result = []
            for placement in value:
                object_keys(placement, ('location', 'place', 'note'))
                require('location' in placement or 'place' in placement, 'placement needs location or place')
                if 'note' in placement:
                    require(isinstance(placement['note'], str), 'placement note must be text')
                result.append([self.enum('locations', placement['location']) if 'location' in placement else None,
                               self.enum('places', placement['place']) if 'place' in placement else None,
                               placement.get('note')])
            return result
        if field == 'note':
            require(isinstance(value, str), 'source.note must be text')
        elif field == 'leads':
            require(type(value) is bool, 'leads must be boolean')
        elif field == 'houses':
            require(isinstance(value, list) and all(integer(v) for v in value), f'{field} must be an id list')
        else:
            require(integer(value, 0 if field in ('achievement', 'quest') else 1), f'invalid source.{field}')
        return value

    def project(self, record):
        object_keys(record, {'id', 'blueprint', 'source', 'cost', 'availability', 'rarity', 'container'} | WEB_FIELDS,
                    ('source', 'cost', 'availability'))
        for key in ('id', 'blueprint'):
            if key in record:
                require(integer(record[key]), f'invalid {key}')
        require('id' in record or 'blueprint' in record, 'record needs id or blueprint')
        source = record['source']
        object_keys(source, {'type', *SOURCE_FIELDS}, ('type',))
        kind = source['type']
        self.enum('source_types', kind)
        for key in self.enums['source_type_contracts'][kind]['required']:
            require(key in source and source[key] not in (None, '', []), f'{kind} requires {key}')
        for field, value in source.items():
            if field != 'type':
                self.source_value(kind, field, value)
        av = record['availability']
        object_keys(av, ('version', 'last_seen'), ('version',))
        self.enum('versions', av['version'])
        if 'last_seen' in av:
            require(isinstance(av['last_seen'], str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', av['last_seen']), 'invalid last_seen')
            datetime.date.fromisoformat(av['last_seen'])
        require(isinstance(record['cost'], list), 'cost must be a list')
        for cost in record['cost']:
            object_keys(cost, ('currency', 'amount'), ('currency', 'amount'))
            self.enum('currencies', cost['currency'])
            require(integer(cost['amount']), 'cost amount must be a positive integer')
        if 'rarity' in record:
            self.enum('rarities', record['rarity'])
        if 'container' in record:
            require(record['container'] in CONTAINER_KINDS, 'unknown container kind')
        result = {k: v for k, v in record.items() if k not in WEB_FIELDS}
        if kind == 'rumour':
            require(source == {'type': 'rumour'} and not record['cost'] and set(av) == {'version'}, 'rumour carries unsupported details')
            require(not (set(result) - {'id', 'blueprint', 'source', 'cost', 'availability'}), 'rumour carries unsupported fields')
        elif 'blueprint' in record:
            blueprint = record['blueprint']
            mapped = self.recipes.get(str(blueprint))
            require(mapped is not None, f'unresolved blueprint {blueprint}; update the recipe reference dump')
            require('id' not in record or record['id'] == mapped, f'blueprint {blueprint} disagrees with furnishing id')
            result['id'] = mapped
        return result

    def encode_record(self, record):
        source = record['source']
        av = record['availability']
        return [self.enum('source_types', source['type']), self.enum('versions', av['version']),
                [[self.enum('currencies', c['currency']), c['amount']] for c in record['cost']],
                av.get('last_seen'), self.enum('rarities', record['rarity']) if 'rarity' in record else None,
                CONTAINER_KINDS.index(record['container']) + 1 if 'container' in record else None,
                record.get('blueprint')] + [self.source_value(source['type'], f, source[f]) if f in source else None for f in SOURCE_FIELDS]

    def build(self, records):
        projected = []
        identities = set()
        for record in records:
            row = self.project(record)
            identity = (row.get('id'), row.get('blueprint'), canonical(row['source']))
            require(identity not in identities, f'duplicate record: {identity}')
            identities.add(identity)
            projected.append(row)
        parents = {r['id'] for r in projected if 'container' in r}
        for row in projected:
            parent = row['source'].get('part_of')
            require(parent is None or parent in parents, f'missing container {parent} for {row.get("id", row.get("blueprint"))}')
            require(parent is None or parent != row.get('id'), f'container {parent} contains itself')
        edges = collections.defaultdict(set)
        for row in projected:
            if row['source'].get('part_of') is not None:
                edges[row['id']].add(row['source']['part_of'])
        completed = set()
        def visit(item, active):
            require(item not in active, f'container cycle at {item}')
            if item not in completed:
                for parent in edges.get(item, ()):
                    visit(parent, active | {item})
                completed.add(item)
        for item in edges:
            visit(item, set())
        grouped = collections.defaultdict(list)
        rumours = {}
        blueprints = {}
        for row in projected:
            if 'blueprint' in row:
                blueprint, target = row['blueprint'], row.get('id', 0)
                require(blueprint not in blueprints or blueprints[blueprint] == target, f'conflicting blueprint {blueprint}')
                blueprints[blueprint] = target
            if row['source']['type'] == 'rumour':
                key = row.get('blueprint', row.get('id'))
                require(key not in rumours, f'duplicate rumour {key}')
                rumours[key] = self.enum('versions', row['availability']['version'])
            else:
                grouped[row['id']].append(row)
        rumour_ids = {r.get('id', r.get('blueprint')) for r in projected if r['source']['type'] == 'rumour'}
        require(not (set(rumours) | rumour_ids).intersection(grouped), 'rumour also has a confirmed source')
        require(not set(blueprints).intersection(grouped), 'blueprint id also used as a furnishing id')
        items = {}
        for item, rows in sorted(grouped.items()):
            item_blueprints = {r['blueprint'] for r in rows if 'blueprint' in r}
            require(len(item_blueprints) <= 1, f'multiple blueprints for {item}')
            kinds = {r['container'] for r in rows if 'container' in r}
            require(len(kinds) <= 1, f'conflicting container kinds for {item}')
            require(not any(r['source']['type'] == 'ignored' for r in rows) or len(rows) == 1, f'ignored item {item} also has acquisition sources')
            types = {self.enum('source_types', r['source']['type']) for r in rows}
            mask = sum(2 ** (t - 1) for t in types)
            version = min(self.enum('versions', r['availability']['version']) for r in rows)
            items[item] = [mask, version, next(iter(item_blueprints), 0)] + [self.encode_record(r) for r in sorted(rows, key=canonical)]
        metadata = {}
        for key in self.ids:
            metadata[key] = {}
            for entry in self.enums[key]:
                if isinstance(entry, dict):
                    object_keys(entry, ('symbol', 'name', 'season', 'ordinal', 'si', 'zone', 'item', 'crate', 'skill_line'))
                    detail = {k: v for k, v in entry.items() if k not in ('symbol', 'name', 'season', 'ordinal')}
                    if detail:
                        metadata[key][self.enum(key, entry['symbol'])] = detail
        vendor_locations = {self.enum(self.vocab_fields['vendor'], k): self.source_value('vendor', 'locations', v)
                            for k, v in self.enums['vendor_locations'].items()}
        currency_defaults = {(0 if k == 'default' else self.enum('source_types', k)): self.enum('currencies', v)
                             for k, v in self.enums['currency_defaults'].items()}
        priority = [self.enum('item_sources', value) for value in self.enums['source_priority']]
        constants = {'vendorLocations': vendor_locations, 'currencyDefaults': currency_defaults, 'sourcePriority': priority,
                     'format': FORMAT, 'ids': self.ids, 'symbols': self.symbols, 'metadata': metadata,
                     'sourceFields': list(SOURCE_FIELDS), 'sourceVocabularies': self.vocab_fields, 'containerKinds': list(CONTAINER_KINDS)}
        digest = hashlib.sha256(canonical(constants).encode()).hexdigest()
        constants['vocabulary'] = digest
        db = {'format': FORMAT, 'vocabulary': digest, 'items': items, 'rumours': rumours, 'blueprints': blueprints}
        return constants, db, sorted(projected, key=canonical)


def load_inputs(data_dir, recipes_path):
    enums = read_json((data_dir / 'enums.json').read_text())
    catalogue = Catalogue(enums, read_json(recipes_path.read_text()))
    expected = {f'{t}.jsonl' for t in catalogue.ids['source_types']}
    actual = {p.name for p in data_dir.glob('*.jsonl')}
    require(expected == actual, f'source files differ: {sorted(expected ^ actual)}')
    records = []
    for filename in sorted(expected):
        for line_number, line in enumerate((data_dir / filename).read_text().splitlines(), 1):
            if not line.strip():
                continue
            try:
                row = read_json(line)
                require(isinstance(row, dict), 'record must be an object')
                require(row.get('source', {}).get('type') == filename[:-6], 'source does not match filename')
                catalogue.project(row)
                records.append(row)
            except (ValueError, TypeError, KeyError) as exc:
                raise ValueError(f'{filename}:{line_number}: {exc}') from exc
    return catalogue, records


def render(constants, database):
    data = ('local C=assert(LFCGeneratedConstants,"load GeneratedConstants.lua first")\n'
            f'assert(C.format=={FORMAT} and C.vocabulary=={lua(database["vocabulary"])},"generated vocabulary mismatch")\n'
            f'LFCGeneratedDatabase={{format={FORMAT},vocabulary=C.vocabulary,items={{\n')
    data += ''.join(f'[{item}]={lua(row)},\n' for item, row in sorted(database['items'].items()))
    data += '},rumours=' + lua(database['rumours']) + ',blueprints=' + lua(database['blueprints']) + '}\n'
    return {'GeneratedConstants.lua': 'LFCGeneratedConstants=' + lua(constants) + '\n', 'GeneratedDatabase.lua': data}


def verify(output, projection, lua_command):
    with tempfile.TemporaryDirectory() as temp:
        decoded = Path(temp) / 'decoded.jsonl'
        command = [*lua_command, str(ROOT / 'tests/decode_generated_db.lua'), str(output), str(decoded)]
        result = subprocess.run(command, text=True, capture_output=True, timeout=120)
        require(result.returncode == 0, f'Lua decode failed:\n{result.stdout}\n{result.stderr}')
        actual = sorted((read_json(line) for line in decoded.read_text().splitlines()), key=canonical)
        require(actual == projection, 'game-data roundtrip differs from canonical JSONL')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'docs/data')
    parser.add_argument('--recipes', type=Path, default=ROOT / 'docs/reference-data/recipes.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'LibFurnitureCatalogue/data')
    parser.add_argument('--lua', default=str(ROOT / 'bin/lua'))
    parser.add_argument('--esoui', type=Path)
    parser.add_argument('--check', action='store_true', help='verify existing artifacts instead of writing')
    args = parser.parse_args()
    catalogue, records = load_inputs(args.data, args.recipes)
    constants, database, projection = catalogue.build(records)
    artifacts = render(constants, database)
    command = [args.lua] + (['-s', str(args.esoui)] if args.esoui else [])
    with tempfile.TemporaryDirectory() as temp:
        candidate = Path(temp)
        for name, content in artifacts.items():
            (candidate / name).write_text(content, encoding='utf-8')
        verify(candidate, projection, command)
        for name, content in artifacts.items():
            path = args.output / name
            if args.check:
                require(path.is_file() and path.read_bytes() == content.encode(), f'outdated artifact: {path}')
            else:
                args.output.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
    print(f'Verified {len(projection)} records: {len(database["items"])} items, {len(database["rumours"])} rumours.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        raise SystemExit(str(exc)) from exc
