#!/usr/bin/env python3
"""Build the versioned game database from JSONL"""

import argparse
import collections
import datetime
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from luaDoc_generateStr import extract_strings

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 1
LUA_MAX_EXACT_INTEGER = 2**53 - 1
# Fixed record head before the SOURCE_FIELDS columns
SOURCE_FIELD_OFFSET = 7
HEADER = '-- DO NOT MANUALLY EDIT THIS FILE, USE THE WEBINTERFACE PIPELINE INSTEAD\n\n'
SOURCE_FIELDS = (
    'vendor', 'subtype', 'locations', 'achievement', 'quest', 'skill_line',
    'skill_rank', 'note', 'part_of', 'event', 'container', 'collectible',
    'crate', 'packs', 'bundle', 'npc_class', 'npc_group', 'leads', 'houses', 'companion',
)
WEB_FIELDS = {'notes', 'name_overrides'}
CONTAINER_KINDS = ('books', 'folio')
LOCALE_BEGIN = '  -- BEGIN WEBINTERFACE STRINGS - generated from docs/data/enums.json\n'
LOCALE_END = '  -- END WEBINTERFACE STRINGS\n'


def render_locale(enums, english):
    """Fill only missing addon strings; handwritten definitions remain authoritative."""
    require(english.count(LOCALE_BEGIN) == english.count(LOCALE_END) == 1,
            'English locale needs one pair of webinterface string markers')
    before, rest = english.split(LOCALE_BEGIN)
    require(LOCALE_END in rest, 'English locale string markers are reversed')
    _, after = rest.split(LOCALE_END)
    manual = extract_strings((before + after).splitlines())
    generated = {}
    for entries in enums.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            key = entry.get('si', '')
            # Game-owned SI_* constants already exist in the client.
            if not key.startswith('SI_FURC_') or key in manual:
                continue
            require(re.fullmatch(r'SI_FURC_[A-Z0-9_]+', key), f'invalid addon string id: {key}')
            name = entry.get('name')
            require(isinstance(name, str) and name.strip(), f'missing English name for {key}')
            require(key not in generated or generated[key] == name, f'conflicting English names for {key}')
            generated[key] = name
    body = ''.join(f'  {key} = {lua(value)},\n' for key, value in sorted(generated.items()))
    return before + LOCALE_BEGIN + body + LOCALE_END + after


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, minimum=1):
    return type(value) is int and minimum <= value <= LUA_MAX_EXACT_INTEGER


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
        return '"' + ''.join(f'\\{ord(c):03d}' if ord(c) < 32 or c in '\\"' else c for c in value) + '"'
    if isinstance(value, (list, tuple)):
        values = list(value)
        while values and values[-1] is None:
            values.pop()
        return '{' + ','.join(map(lua, values)) + '}'
    if isinstance(value, dict):
        return '{' + ','.join(f'[{lua(k)}]={lua(v)}' for k, v in sorted(value.items())) + '}'
    raise ValueError(f'cannot emit {type(value).__name__}')


def comment(text):
    # A line comment ends at any line break, so free text must not carry one into the code
    text = ' '.join(''.join(' ' if ord(c) < 32 else c for c in str(text)).split())
    return f' -- {text}' if text else ''


def lua_block(value, note=lambda path, key: None, path=(), depth=0):
    """One entry per line, nested by indentation; a leaf table short enough stays on its line."""
    inline = lua(value)
    if not isinstance(value, (dict, list, tuple)):
        return inline
    scalar = all(not isinstance(v, (dict, list, tuple)) for v in (value.values() if isinstance(value, dict) else value))
    if path and scalar and len(inline) <= 100 and not any(note(path, k) for k in (value if isinstance(value, dict) else range(len(value)))):
        return inline
    pad = '  ' * (depth + 1)
    items = sorted(value.items()) if isinstance(value, dict) else enumerate(value)
    lines = []
    for key, item in items:
        prefix = f'[{lua(key)}]=' if isinstance(value, dict) else ''
        text, remark = lua_block(item, note, (*path, key), depth + 1), comment(note(path, key) or '')
        # A multi-line entry is named on its opening line, where a reader meets it
        lines.append(f'{pad}{prefix}{{{remark}{text[1:]},' if text.startswith('{\n') else f'{pad}{prefix}{text},{remark}')
    return '{\n' + '\n'.join(lines) + '\n' + '  ' * depth + '}'


class Catalogue:
    def __init__(self, enums, recipes):
        require(enums.get('schema_version') == 2, 'unsupported vocabulary schema')
        self.enums = enums
        self.recipes = recipes
        # Comments only: display names from the data never reach the game tables
        self.labels = {'items': {}, 'enums': {key: {e['symbol']: e['name'] for e in values if isinstance(e, dict) and e.get('name')}
                                              for key, values in enums.items() if isinstance(values, list)}}
        self.vocab_fields = enums['source_field_vocabularies']
        require(isinstance(self.vocab_fields, dict), 'source vocabularies must be an object')

        # The unknown-id contract is declared explicitly (fields that may carry 0 or value 0 are covered)
        self.id_unknown = enums.get('id_unknown') or {}
        require(isinstance(self.id_unknown, dict), 'id_unknown must be an object')
        self.id_unknown_value = self.id_unknown.get('value')
        self.id_unknown_fields = self.id_unknown.get('fields')
        unknown_value = self.id_unknown_value
        if type(unknown_value) is not int or not 0 <= unknown_value <= LUA_MAX_EXACT_INTEGER:
            raise ValueError('id_unknown.value must be a non-negative integer')
        self.id_unknown_floor: int = unknown_value
        require(isinstance(self.id_unknown_fields, list) and self.id_unknown_fields
                and all(f in SOURCE_FIELDS for f in self.id_unknown_fields)
                and len(set(self.id_unknown_fields)) == len(self.id_unknown_fields),
                'id_unknown.fields must name distinct source fields')
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
            floor: int = self.id_unknown_floor if field in self.id_unknown_fields else 1
            require(integer(value, floor), f'invalid source.{field}')
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
        head = [self.enum('source_types', source['type']), self.enum('versions', av['version']),
                [[self.enum('currencies', c['currency']), c['amount']] for c in record['cost']],
                av.get('last_seen'), self.enum('rarities', record['rarity']) if 'rarity' in record else None,
                CONTAINER_KINDS.index(record['container']) + 1 if 'container' in record else None,
                record.get('blueprint')]
        require(len(head) == SOURCE_FIELD_OFFSET, 'record head changed; update SOURCE_FIELD_OFFSET')
        return head + [self.source_value(source['type'], f, source[f]) if f in source else None for f in SOURCE_FIELDS]

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
        # A rumour answers for its id and its blueprint; the message names both so a contributor can find the line
        clashes = [r for r in projected if r['source']['type'] == 'rumour' and {r.get('id'), r.get('blueprint')} & grouped.keys()]
        require(not clashes, 'rumour also has a confirmed source: ' + ', '.join(
            f"id {r.get('id', '-')}" + (f" / blueprint {r['blueprint']}" if 'blueprint' in r else '') for r in clashes)
            + ' (a blueprint for a confirmed item is a recipe record)')
        reused = sorted(set(blueprints) & grouped.keys())
        require(not reused, f'blueprint id also used as a furnishing id: {", ".join(map(str, reused))}')
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
                     'sourceFields': list(SOURCE_FIELDS), 'sourceFieldOffset': SOURCE_FIELD_OFFSET, 'sourceVocabularies': self.vocab_fields, 'containerKinds': list(CONTAINER_KINDS)}
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
    names = data_dir / 'names.en.json'
    if names.exists():
        catalogue.labels['items'] = {int(k): v for k, v in read_json(names.read_text()).items()}
    # Comments only: an item added by a discovery is named in the reference metadata beside the recipe map, not in names.en.json
    labels = catalogue.labels['items']
    for shard in sorted((recipes_path.parent / 'meta').glob('*.jsonl')):
        for line in shard.read_text().splitlines():
            if line.strip():
                row = read_json(line)
                labels.setdefault(row['id'], row['name'])
    for blueprint, item in catalogue.recipes.items():
        if item in labels:
            labels.setdefault(int(blueprint), labels[item])
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


def render(constants, database, labels=None):
    """labels: {'items': {id: name}, 'enums': {group: {symbol: name}}} for comments; they never change the data."""
    items, enums = (labels or {}).get('items', {}), (labels or {}).get('enums', {})
    symbols = constants['symbols']

    def symbol(group, number):
        name = symbols.get(group, {}).get(number)
        return ' - '.join(str(s) for s in (name, enums.get(group, {}).get(name)) if s) or None

    def note(path, key):
        if path[:1] == ('ids',) and len(path) == 2:
            return enums.get(path[1], {}).get(key)
        if path[:1] in (('symbols',), ('metadata',)) and len(path) == 2:
            return enums.get(path[1], {}).get(symbols[path[1]].get(key)) if path[0] == 'symbols' else symbol(path[1], key)
        if path == ('vendorLocations',):
            return symbol(constants['sourceVocabularies']['vendor'], key)
        if path == ('currencyDefaults',):
            return 'default' if key == 0 else symbol('source_types', key)
        if path == ('sourcePriority',):
            return symbol('item_sources', constants['sourcePriority'][key])
        return None

    def rows(table):
        return ''.join(f'  [{key}]={lua(row)},{comment(items.get(key, ""))}\n' for key, row in sorted(table.items()))

    data = (HEADER + 'local C=assert(LFCGeneratedConstants,"load GeneratedConstants.lua first")\n'
            f'assert(C.format=={FORMAT} and C.vocabulary=={lua(database["vocabulary"])},"generated vocabulary mismatch")\n'
            f'LFCGeneratedDatabase={{format={FORMAT},vocabulary=C.vocabulary,\nitems={{\n' + rows(database['items'])
            + '},\n-- rumours[furnishing or blueprint id] = version\nrumours={\n' + rows(database['rumours'])
            + '},\n-- blueprints[blueprint id] = furnishing id\nblueprints={\n' + rows(database['blueprints']) + '}}\n')
    return {'GeneratedConstants.lua': HEADER + 'LFCGeneratedConstants=' + lua_block(constants, note) + '\n', 'GeneratedDatabase.lua': data}


def verify(output, projection, lua_command):
    with tempfile.TemporaryDirectory() as temp:
        decoded = Path(temp) / 'decoded.jsonl'
        command = [*lua_command, str(ROOT / 'tests/decode_generated_db.lua'), str(output), str(decoded)]
        result = subprocess.run(command, text=True, capture_output=True, timeout=120, check=False)
        require(result.returncode == 0, f'Lua decode failed:\n{result.stdout}\n{result.stderr}')
        actual = sorted((read_json(line) for line in decoded.read_text().splitlines()), key=canonical)
        require(actual == projection, 'game-data roundtrip differs from canonical JSONL')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'docs/data')
    parser.add_argument('--recipes', type=Path, default=ROOT / 'docs/reference-data/recipes.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'LibFurnitureCatalogue/data')
    parser.add_argument('--locale', type=Path, help='English locale output (default: ../locale/en.lua beside --output)')
    parser.add_argument('--lua', default=str(ROOT / 'bin/lua'))
    parser.add_argument('--esoui', type=Path)
    parser.add_argument('--check', action='store_true', help='verify existing artifacts instead of writing')
    args = parser.parse_args()
    catalogue, records = load_inputs(args.data, args.recipes)
    constants, database, projection = catalogue.build(records)
    artifacts = render(constants, database, catalogue.labels)
    locale = args.locale or args.output.parent / 'locale/en.lua'
    template = locale if locale.is_file() else ROOT / 'LibFurnitureCatalogue/locale/en.lua'
    english = render_locale(catalogue.enums, template.read_text(encoding='utf-8'))
    command = [args.lua] + (['-s', str(args.esoui)] if args.esoui else [])
    with tempfile.TemporaryDirectory() as temp:
        candidate = Path(temp)
        for name, content in artifacts.items():
            (candidate / name).write_text(content, encoding='utf-8')
        verify(candidate, projection, command)
        outputs = {args.output / name: content for name, content in artifacts.items()}
        outputs[locale] = english
        for path, content in outputs.items():
            if args.check:
                require(path.is_file() and path.read_bytes() == content.encode(), f'outdated artifact: {path}')
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
    print(f'Verified {len(projection)} records: {len(database["items"])} items, {len(database["rumours"])} rumours.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        raise SystemExit(str(exc)) from exc
