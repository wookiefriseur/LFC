import copy
import os
import random
import subprocess
import tempfile
import unittest
from pathlib import Path

from generate_db import (
    LUA_MAX_EXACT_INTEGER,
    ROOT,
    Catalogue,
    canonical,
    load_inputs,
    read_json,
    render,
    verify,
)


class GeneratedDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalogue, cls.records = load_inputs(ROOT / 'docs/data', ROOT / 'docs/reference-data/recipes.json')
        cls.command = [os.environ.get('LUA', str(ROOT / 'bin/lua'))]
        if os.environ.get('ESOUI'):
            cls.command += ['-s', os.environ['ESOUI']]

    def row(self, item=1, source=None, **fields):
        return {'id': item, 'source': source or {'type': 'drop'}, 'cost': [],
                'availability': {'version': 'HOMESTEAD'}, **fields}

    def roundtrip(self, records, catalogue=None):
        constants, database, projection = (catalogue or self.catalogue).build(records)
        with tempfile.TemporaryDirectory() as temp:
            for name, content in render(constants, database, self.catalogue.labels).items():
                (Path(temp) / name).write_text(content)
            verify(Path(temp), projection, self.command)
        return constants, database, projection

    def test_full_catalogue(self):
        _, database, projection = self.roundtrip(self.records)
        expected = [{k: v for k, v in r.items() if k not in ('notes', 'name_overrides')} for r in self.records]
        self.assertEqual(projection, sorted(expected, key=canonical))
        self.assertEqual(len(projection), len(self.records))
        self.assertEqual(database['blueprints'][225123], 224910)
        self.assertIn(225123, database['rumours'])
        self.assertNotIn(224910, database['rumours'])

    def test_runtime_currency_constants(self):
        result = subprocess.run([*self.command, str(ROOT / 'tests/generated_currencies.lua'), str(ROOT)],
                                text=True, capture_output=True, timeout=30, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_added_vocabulary_entry_and_declared_mapping(self):
        enums = copy.deepcopy(self.catalogue.enums)
        enums['test_vendors'] = copy.deepcopy(enums['vendors']) + [{'symbol': 'NEW_VENDOR', 'si': 'SI_NEW_VENDOR'}]
        enums['source_field_vocabularies']['vendor'] = 'test_vendors'
        catalogue = Catalogue(enums, self.catalogue.recipes)
        constants, _, _ = self.roundtrip([
            self.row(source={'type': 'vendor', 'vendor': 'NEW_VENDOR', 'subtype': 'other'})
        ], catalogue)
        self.assertEqual(constants['metadata']['test_vendors'][constants['ids']['test_vendors']['NEW_VENDOR']]['si'], 'SI_NEW_VENDOR')
        self.assertEqual(constants['sourceVocabularies']['vendor'], 'test_vendors')

    def test_every_field_and_string_escaping(self):
        source = {
            'type': 'vendor', 'vendor': 'AF', 'subtype': 'achievement',
            'locations': [{'location': 'ALIKR', 'place': 'ANY', 'note': 'inside'}, {'place': 'ANY'}],
            'achievement': 0, 'quest': 0, 'skill_line': 'MAGES', 'skill_rank': 2,
            'note': 'Ä漢字 "quote" \\ \n\r\t\x00123', 'part_of': 2, 'event': 'ANNIVERSARY',
            'container': 'BOONBOX', 'collectible': 3, 'crate': 'UNKNOWN',
            'packs': ['ALCHEMIST', 'AMBITIONS'], 'bundle': 'DWEMER',
            'npc_class': 'CLASS_ALCHEMIST', 'npc_group': 'ENEMY_RND',
            'leads': False, 'houses': [], 'companion': 'EMBER',
        }
        rows = [self.row(source=source, cost=[{'currency': 'GOLD', 'amount': 42}, {'currency': 'AP', 'amount': 8}],
                         availability={'version': 'HOMESTEAD', 'last_seen': '2024-02-29'}, rarity='rare',
                         notes='exclude me', name_overrides={'en': 'also excluded'}),
                self.row(item=2, container='books')]
        self.roundtrip(rows)

    def test_per_record_versions_prices_and_blueprints(self):
        rows = [self.row(114327, {'type': 'recipe'}, blueprint=118991),
                self.row(114327, {'type': 'luxury', 'vendor': 'LUXF'},
                         availability={'version': 'TIDES', 'last_seen': '2026-09-18'},
                         cost=[{'currency': 'GOLD', 'amount': 20000}])]
        constants, database, _ = self.roundtrip(rows)
        row = database['items'][114327]
        self.assertEqual(row[:3], [2**(constants['ids']['source_types']['recipe'] - 1) +
                                  2**(constants['ids']['source_types']['luxury'] - 1), 2, 118991])
        self.assertEqual(sorted(r[1] for r in row[3:]), [2, constants['ids']['versions']['TIDES']])
        self.assertEqual(sum(r[6] is not None for r in row[3:]), 1)
        luxury = next(r for r in row[3:] if r[0] == constants['ids']['source_types']['luxury'])
        self.assertEqual(luxury[:8], [constants['ids']['source_types']['luxury'],
                                    constants['ids']['versions']['TIDES'], [[1, 20000]],
                                    '2026-09-18', None, None, None, constants['ids']['vendors']['LUXF']])

    def test_same_source_multiple_offers(self):
        a = self.row(source={'type': 'crown_store', 'packs': ['ALCHEMIST']})
        b = self.row(source={'type': 'crown_store', 'packs': ['AMBITIONS']})
        constants, db, result = self.roundtrip([a, b])
        self.assertEqual(len(result), 2)
        self.assertEqual(db['items'][1][0], 2**(constants['ids']['source_types']['crown_store'] - 1))

    def test_blueprint_only_confirmed_is_resolved(self):
        row = self.row(source={'type': 'recipe'}, blueprint=118991)
        del row['id']
        _, _, result = self.roundtrip([row])
        self.assertEqual(result[0]['id'], 114327)

    def test_ignored_and_unresolved_rumour(self):
        rumour = self.row(source={'type': 'rumour'}, blueprint=9000001)
        del rumour['id']
        _, db, result = self.roundtrip([rumour, self.row(191611, {'type': 'ignored'})])
        self.assertEqual(db['blueprints'][9000001], 0)
        self.assertIn(rumour, result)

    def test_deterministic(self):
        first = render(*self.catalogue.build(self.records)[:2])
        shuffled = copy.deepcopy(self.records)
        random.Random(42).shuffle(shuffled)
        second = render(*self.catalogue.build(shuffled)[:2])
        self.assertEqual(first, second)

    def test_bad_inputs_fail(self):
        base = self.row()
        invalid = [dict(base, surprise=True), dict(base, id=True), dict(base, id=LUA_MAX_EXACT_INTEGER + 1),
                   dict(base, blueprint=9000000), dict(base, blueprint=118991),
                   dict(base, source={'type': '../bad'}), dict(base, source={'type': 'drop', 'typo': 1}),
                   dict(base, source={'type': 'vendor', 'vendor': 'AF'}),
                   dict(base, source={'type': 'drop', 'vendor': 'UNKNOWN_VENDOR'}),
                   dict(base, source={'type': 'drop', 'locations': [{'location': 'ALIKR', 'extra': 4}]}),
                   dict(base, source={'type': 'drop', 'locations': [{}]}),
                   dict(base, source={'type': 'drop', 'leads': 1}),
                   dict(base, cost=[{'currency': 'GOLD', 'amount': 1, 'extra': 0}]),
                   dict(base, cost=[{'currency': 'GOLD', 'amount': 0}]),
                   dict(base, cost=[{'currency': 'GOLD', 'amount': True}]),
                   dict(base, availability={'version': 'HOMESTEAD', 'extra': 1}),
                   dict(base, availability={'version': 'HOMESTEAD', 'last_seen': '2025-02-29'}),
                   dict(base, source={'type': 'rumour', 'note': 'would be lost'}),
                   dict(base, source={'type': 'rumour'}, rarity='rare'),
                   dict(base, container='crate')]
        for row in invalid:
            with self.subTest(row=row), self.assertRaises(ValueError):
                self.catalogue.build([row])

    def test_duplicate_and_dangling_records(self):
        for rows in ([self.row(), self.row()],
                     [self.row(source={'type': 'container', 'part_of': 99})],
                     [self.row(container='books', source={'type': 'container', 'part_of': 1})],
                     [self.row(), self.row(source={'type': 'rumour'})]):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                self.catalogue.build(rows)

    def test_duplicate_json_keys(self):
        with self.assertRaisesRegex(ValueError, 'duplicate JSON key'):
            read_json('{"id":1,"id":2}')

    def test_vocabulary_mismatch_refused_by_lua(self):
        constants, db, _ = self.catalogue.build([self.row()])
        with tempfile.TemporaryDirectory() as temp:
            for name, content in render(constants, db).items():
                (Path(temp) / name).write_text(content)
            path = Path(temp) / 'GeneratedConstants.lua'
            path.write_text(path.read_text().replace(constants['vocabulary'], 'wrong'))
            with self.assertRaisesRegex(ValueError, 'vocabulary mismatch'):
                verify(Path(temp), [], self.command)

    def test_corrupt_record_is_caught(self):
        constants, db, projection = self.catalogue.build([self.row(cost=[{'currency': 'GOLD', 'amount': 42}])])
        db['items'][1][3][2][0][1] = 43
        with tempfile.TemporaryDirectory() as temp:
            for name, content in render(constants, db).items():
                (Path(temp) / name).write_text(content)
            with self.assertRaisesRegex(ValueError, 'roundtrip differs'):
                verify(Path(temp), projection, self.command)

    def test_runtime_enum_compatibility(self):
        constants, db, _ = self.catalogue.build(self.records)
        with tempfile.TemporaryDirectory() as temp:
            for name, content in render(constants, db).items():
                (Path(temp) / name).write_text(content)
            command = [*self.command, str(ROOT / 'tests/decode_generated_db.lua'), temp,
                       str(Path(temp) / 'decoded.jsonl'), str(ROOT)]
            result = subprocess.run(command, text=True, capture_output=True, timeout=120, check=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_name_comments_cannot_break_out(self):
        records = [self.row(1)]
        constants, database, projection = self.catalogue.build(records)
        labels = {'items': {1: 'Chair\nerror("escaped")\r--'}, 'enums': {}}
        with tempfile.TemporaryDirectory() as temp:
            for name, content in render(constants, database, labels).items():
                (Path(temp) / name).write_text(content)
            self.assertIn('-- Chair error("escaped") --', (Path(temp) / 'GeneratedDatabase.lua').read_text())
            verify(Path(temp), projection, self.command)

    def test_container_cycle(self):
        rows = [self.row(1, {'type': 'container', 'part_of': 2}, container='books'),
                self.row(2, {'type': 'container', 'part_of': 1}, container='books')]
        with self.assertRaisesRegex(ValueError, 'container cycle'):
            self.catalogue.build(rows)

    def test_ignored_with_acquisition_source(self):
        with self.assertRaisesRegex(ValueError, 'ignored item'):
            self.catalogue.build([self.row(), self.row(source={'type': 'ignored'})])

    def test_vocabulary_metadata_not_display_names(self):
        constants, _, _ = self.catalogue.build([self.row()])
        self.assertEqual(constants['metadata']['locations'][constants['ids']['locations']['ALIKR']], {'zone': 104})
        self.assertNotIn('name', constants['metadata']['vendors'][constants['ids']['vendors']['AF']])


if __name__ == '__main__':
    unittest.main()
