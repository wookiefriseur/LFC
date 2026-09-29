import copy
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))

from apply_issue import BEGIN, END, extract, plan, validate_diff
from generate_db import ROOT


def body(*lines):
    return 'Opening post\n' + BEGIN + '\n```jsonl\n' + '\n'.join(json.dumps(x) for x in lines) + '\n```\n' + END


class IssueApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.command = [os.environ.get('LUA', str(ROOT / 'bin/lua'))]
        if os.environ.get('ESOUI'):
            cls.command += ['-s', os.environ['ESOUI']]
        cls.rows = [json.loads(s) for s in (ROOT / 'docs/data/luxury.jsonl').read_text().splitlines()]

    def update(self, item=184200, date='2026-09-18'):
        record = next(r for r in self.rows if r.get('id') == item)
        return {'v': 1, 'op': 'update', 'id': item, 'category': 'luxury',
                'match': copy.deepcopy(record['source']),
                'fields': {'availability': {**record['availability'], 'last_seen': date}}}

    def run_plan(self, *lines, root=ROOT):
        return plan(body(*lines), root, self.command)

    def snapshot(self):
        return {str(p.relative_to(ROOT)): p.read_bytes()
                for folder in ('docs/data', 'docs/reference-data', 'LibFurnitureCatalogue/data')
                for p in (ROOT / folder).rglob('*') if p.is_file()}

    def test_real_issue_5_minimal_deterministic_and_no_writes(self):
        before = self.snapshot()
        files, report = self.run_plan(self.update())
        self.assertEqual(set(files), {'docs/data/luxury.jsonl', 'docs/data/manifest.json',
                                     'LibFurnitureCatalogue/data/GeneratedDatabase.lua'})
        rows = [json.loads(s) for s in files['docs/data/luxury.jsonl'].decode().splitlines()]
        changed = [(a, b) for a, b in zip(self.rows, rows) if a != b]
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0][1]['availability'], {'version': 'TIDES', 'last_seen': '2026-09-18'})
        self.assertEqual(report['records'], 9686)
        self.assertEqual((files, report), self.run_plan(self.update()))
        self.assertEqual(before, self.snapshot())

    def test_real_issue_6_fourteen_records(self):
        ids = [120815, 120816, 120817, 120818, 120823, 134831, 145476,
               145477, 156654, 171826, 184201, 196204, 203592, 212580]
        files, report = self.run_plan(*(self.update(i, '2026-09-25') for i in ids))
        rows = [json.loads(s) for s in files['docs/data/luxury.jsonl'].decode().splitlines()]
        self.assertEqual([a['id'] for a, b in zip(self.rows, rows) if a != b], ids)
        self.assertEqual(len(report['operations']), 14)

    def test_reject_bad_envelope_and_json(self):
        valid = body(self.update())
        for text in ('', valid + valid, valid.replace('```jsonl', '```lua'),
                     valid.replace('"v": 1', '"v": 1, "v": 1'),
                     valid.replace('"v": 1', '"v": NaN')):
            with self.subTest(text=text[:40]), self.assertRaises(ValueError):
                extract(text)
        self.assertEqual(extract(valid + '\nComments are not parsed {bad json}'), [self.update()])

    def test_schema_rejects_unsafe_and_unknown_operations(self):
        for change in ({**self.update(), 'category': '../../bad'}, {**self.update(), 'v': 2},
                       {**self.update(), 'op': 'shell'}, {**self.update(), 'fields': {'id': 1}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_diff([change])

    def test_failure_is_atomic(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'expected one match, found 0'):
            self.run_plan(self.update(), {**self.update(), 'id': 999999999})
        self.assertEqual(before, self.snapshot())

    def test_ambiguous_match_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT / 'docs', root / 'docs', ignore=shutil.ignore_patterns('*.js', '*.css', '*.html', 'assets'))
            shutil.copytree(ROOT / 'schemas', root / 'schemas')
            path = root / 'docs/data/luxury.jsonl'
            row = copy.deepcopy(next(r for r in self.rows if r.get('id') == 184200))
            row['source']['note'] = 'a second source instance'
            with path.open('a') as f:
                f.write(json.dumps(row) + '\n')
            line = self.update()
            del line['match']
            with self.assertRaisesRegex(ValueError, 'found 2'):
                self.run_plan(line, root=root)

    def test_move_and_null_field_removal(self):
        row = {'id': 999991, 'source': {'type': 'drop'}, 'cost': [],
               'availability': {'version': 'HOMESTEAD'}, 'notes': 'temporary'}
        files, _ = self.run_plan(
            {'v': 1, 'op': 'add', 'id': row['id'], 'category': 'drop', 'record': row},
            {'v': 1, 'op': 'update', 'id': row['id'], 'category': 'drop', 'fields': {'notes': None}},
            {'v': 1, 'op': 'delete', 'id': row['id'], 'category': 'drop'},
            {'v': 1, 'op': 'add', 'id': row['id'], 'category': 'rumour',
             'record': {**row, 'source': {'type': 'rumour'}, 'notes': 'moved'}})
        self.assertNotIn('docs/data/drop.jsonl', files)
        self.assertIn('docs/data/rumour.jsonl', files)

    def test_new_enum_applied_before_dependent_record(self):
        row = {'id': 999992, 'source': {'type': 'vendor', 'vendor': 'NEW_TEST_VENDOR', 'subtype': 'other'},
               'cost': [], 'availability': {'version': 'HOMESTEAD'}}
        files, _ = self.run_plan(
            {'v': 1, 'op': 'add', 'id': row['id'], 'category': 'vendor', 'record': row},
            {'v': 1, 'op': 'add-enum', 'enum': 'vendors', 'value': 'NEW_TEST_VENDOR',
             'meta': {'si': 'SI_NEW_TEST_VENDOR', 'name': 'A vendor'}})
        self.assertIn('docs/data/enums.json', files)
        self.assertIn('LibFurnitureCatalogue/data/GeneratedConstants.lua', files)

    def test_name_preserves_other_names_and_does_not_change_lua(self):
        files, _ = self.run_plan({'v': 1, 'op': 'name', 'kind': 'houses', 'id': 99999,
                                 'locale': 'en', 'name': 'Test house'})
        self.assertEqual(set(files), {'docs/reference-data/names.en.json', 'docs/reference-data/manifest.json'})
        names = json.loads(files['docs/reference-data/names.en.json'])
        old = json.loads((ROOT / 'docs/reference-data/names.en.json').read_text())
        self.assertEqual(names['achievements'], old['achievements'])
        self.assertEqual(names['houses']['99999'], 'Test house')

    def test_discovery_adds_shard_and_recipe_without_dropping_references(self):
        row = {'id': 230123, 'blueprint': 230124, 'source': {'type': 'recipe'}, 'cost': [],
               'availability': {'version': 'HOMESTEAD'}}
        reference = {'format': 'furniture-discovery-v1', 'locale': 'en', 'apiVersion': 101051,
                     'meta': {'id': row['id'], 'name': 'Test furnishing',
                              'icon': '/esoui/art/icons/test.dds', 'quality': 3, 'cat': 1, 'sub': 2, 'theme': 3}}
        files, _ = self.run_plan({'v': 1, 'op': 'add', 'id': row['id'], 'blueprint': row['blueprint'],
                                 'category': 'recipe', 'record': row, 'reference': reference})
        self.assertIn('docs/reference-data/meta/meta-0230000-0239999.jsonl', files)
        recipes = json.loads(files['docs/reference-data/recipes.json'])
        self.assertEqual(recipes['230124'], 230123)
        self.assertEqual(recipes['139587'], 139264)
        self.assertEqual(recipes['225123'], 224910)

    def test_duplicate_add_rejected(self):
        row = next(r for r in self.rows if r.get('id') == 184200)
        with self.assertRaisesRegex(ValueError, 'duplicate record'):
            self.run_plan({'v': 1, 'op': 'add', 'id': row['id'], 'category': 'luxury', 'record': row})

    def test_noop_does_not_rewrite_any_file(self):
        row = next(r for r in self.rows if r.get('id') == 184200)
        files, _ = self.run_plan(self.update(date=row['availability']['last_seen']))
        self.assertEqual(files, {})


if __name__ == '__main__':
    unittest.main()
