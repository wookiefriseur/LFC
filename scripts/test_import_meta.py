import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import import_meta as IM

SCRIPT = Path(__file__).with_name('import_meta.py')

DUMP = r'''FurCDev_SavedVariables =
{
    ["probe"] = { "kept", },
    ["meta"] =
    {
        ["locale"] = "%(locale)s",
        ["format"] = "furniture-meta-v1",
        ["apiVersion"] = 101051,
        ["items"] =
        {
            [120001] =
            {
                ["name"] = "Lied \"Pelinal\"",
                ["quality"] = 3,
                ["cat"] = 4,
                ["sub"] = 217,
                ["theme"] = 1,
                ["icon"] = "/esoui/art/icons/book_new.dds",
            },
            [120002] =
            {
                ["name"] = "Truhe",
                ["quality"] = 2,
                ["cat"] = 2,
                ["sub"] = 49,
                ["theme"] = 1,
                ["icon"] = "/esoui/art/icons/icon_missing.dds",
                ["blueprint"] = 120900,
            },
            [120003] =
            {
                ["name"] = "",
                ["quality"] = 0,
                ["icon"] = "/esoui/art/icons/icon_missing.dds",
            },
            [120004] =
            {
                ["name"] = "Einrichtungsmappe",
                ["quality"] = 5,
                ["icon"] = "/esoui/art/icons/folio.dds",
            },
            [130005] =
            {
                ["name"] = "Neu",
                ["quality"] = 1,
                ["cat"] = 5,
                ["sub"] = 66,
                ["theme"] = 2,
                ["icon"] = "/esoui/art/icons/new.dds",
            },
        },
        ["categories"] =
        {
            [4] = { ["name"] = "Bibliothek", ["parent"] = 0, ["order"] = 2, },
            [62] = { ["name"] = "Literatur", ["parent"] = 4, ["order"] = 0, },
            [217] = { ["name"] = "Lesbare Literatur", ["parent"] = 4, ["order"] = 0, },
        },
    },
}
'''

ROWS = [
    {'id': 120001, 'name': 'Song of Pelinal', 'quality': 3, 'cat': 4, 'sub': 62, 'theme': 1, 'icon': 'book_old'},
    {'id': 120002, 'name': 'Chest', 'quality': 2, 'cat': 2, 'sub': 49, 'theme': 1, 'icon': 'chest'},
    {'id': 120003, 'name': 'Holding Cell', 'quality': 3, 'cat': 7, 'sub': 76, 'theme': 1, 'icon': 'cell'},
    {'id': 120004, 'name': 'Folio', 'icon': 'folio', 'quality': 5},
    {'id': 120005, 'name': 'Not in the dump', 'quality': 1, 'cat': 3, 'sub': 53, 'theme': 1, 'icon': 'rug'},
]


class ImportMetaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        ref = self.root / 'docs/reference-data'
        (ref / 'meta').mkdir(parents=True)
        (self.root / 'docs/data').mkdir()
        shard = IM.jsonl(ROWS)
        (ref / 'meta/meta-0120000-0129999.jsonl').write_bytes(shard)
        categories = {'4': {'name': 'Library', 'parent': 0, 'order': 2}, '62': {'name': 'Literature', 'parent': 4, 'order': 0}}
        (ref / 'categories.en.json').write_bytes(IM.dumps(categories, 2))
        (ref / 'names.en.json').write_text(json.dumps({'categories': {'217': 'Readable Literature'}}))
        (self.root / 'docs/data/names.en.json').write_text(json.dumps({'130005': 'New Thing'}))
        self.manifest = {'shard_size': 10000, 'datasets': {
            'meta': {'locale': 'en', 'id_max': 129999, 'shards': [
                {'file': 'meta/meta-0120000-0129999.jsonl', 'id_min': 120000, 'id_max': 129999,
                 'count': 5, 'bytes': len(shard), 'digest': IM.digest(shard)}]},
            'categories': {'file': 'categories.en.json', 'count': 2, 'digest': 'old'}}}
        (ref / 'manifest.json').write_bytes(IM.dumps(self.manifest, 2))

    def tearDown(self):
        self.tmp.cleanup()

    def run_import(self, locale='de', *extra):
        dump = self.root / 'dump.lua'
        dump.write_text(DUMP % {'locale': locale}, encoding='utf-8')
        return subprocess.run([sys.executable, str(SCRIPT), str(dump), '--root', str(self.root), '--date', '2026-11-25', *extra],
                              capture_output=True, text=True, check=True).stdout

    def rows(self, file='meta/meta-0120000-0129999.jsonl'):
        text = (self.root / 'docs/reference-data' / file).read_text(encoding='utf-8')
        return {r['id']: r for r in map(json.loads, text.splitlines())}

    def test_parse_lua_reads_savedvariables(self):
        parsed = IM.parse_lua(DUMP % {'locale': 'de'})
        meta = parsed['FurCDev_SavedVariables']['meta']
        self.assertEqual(meta['items'][120001]['name'], 'Lied "Pelinal"')
        self.assertEqual(meta['categories'][217]['parent'], 4)
        self.assertEqual(parsed['FurCDev_SavedVariables']['probe'], {1: 'kept'})

    def test_refreshes_metadata_and_keeps_english_names(self):
        out = self.run_import('de')
        rows = self.rows()
        self.assertEqual(rows[120001], {'id': 120001, 'name': 'Song of Pelinal', 'quality': 3, 'cat': 4, 'sub': 217,
                                        'theme': 1, 'icon': 'book_new'})
        self.assertIn('moved from 4/62 to 4/217', out)

    def test_placeholder_icon_never_replaces_a_real_one(self):
        self.run_import('de')
        row = self.rows()[120002]
        self.assertEqual(row['icon'], 'chest')
        self.assertEqual(row['blueprint'], 120900)

    def test_item_the_client_cannot_name_keeps_its_row(self):
        out = self.run_import('de')
        self.assertEqual(self.rows()[120003], ROWS[2])
        self.assertIn('1 skipped', out)

    def test_item_without_furniture_data_has_category_zero(self):
        self.run_import('de')
        row = self.rows()[120004]
        self.assertEqual((row['cat'], row['sub'], row['theme']), (0, 0, 0))

    def test_item_missing_from_the_dump_stays(self):
        self.run_import('de')
        self.assertEqual(self.rows()[120005], ROWS[4])

    def test_new_item_opens_a_shard_with_its_english_name(self):
        self.run_import('de')
        row = self.rows('meta/meta-0130000-0139999.jsonl')[130005]
        self.assertEqual(row['name'], 'New Thing')
        manifest = json.loads((self.root / 'docs/reference-data/manifest.json').read_text())
        files = [s['file'] for s in manifest['datasets']['meta']['shards']]
        self.assertEqual(files, ['meta/meta-0120000-0129999.jsonl', 'meta/meta-0130000-0139999.jsonl'])
        self.assertEqual(manifest['datasets']['meta']['id_max'], 139999)

    def test_category_tree_from_any_dump_names_in_english(self):
        self.run_import('de')
        cats = json.loads((self.root / 'docs/reference-data/categories.en.json').read_text())
        self.assertEqual(cats['62']['name'], 'Literature')
        self.assertEqual(cats['217'], {'name': 'Readable Literature', 'parent': 4, 'order': 0})

    def test_manifest_digests_match_the_files(self):
        self.run_import('de')
        ref = self.root / 'docs/reference-data'
        manifest = json.loads((ref / 'manifest.json').read_text())
        for shard in manifest['datasets']['meta']['shards']:
            data = (ref / shard['file']).read_bytes()
            self.assertEqual(shard['digest'], hashlib.sha256(data).hexdigest()[:12])
            self.assertEqual(shard['count'], data.count(b'\n'))
        self.assertEqual(manifest['datasets']['categories']['digest'],
                         hashlib.sha256((ref / 'categories.en.json').read_bytes()).hexdigest()[:12])
        self.assertEqual((manifest['datasets']['meta']['dumped'], manifest['datasets']['meta']['apiVersion']),
                         ('2026-11-25', 101051))

    def test_english_dump_names_only_rows_without_a_name(self):
        self.run_import('en')
        rows = self.rows()
        self.assertEqual(rows[120001]['name'], 'Song of Pelinal')

    def test_dry_run_writes_nothing(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*.json*')}
        out = self.run_import('de', '--dry-run')
        self.assertIn('dry run', out)
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*.json*')})

    def test_a_second_import_changes_nothing(self):
        self.run_import('de')
        before = {p: p.read_bytes() for p in self.root.rglob('*.json*')}
        self.assertIn('wrote 0 changed file(s)', self.run_import('de'))
        after = {p: p.read_bytes() for p in self.root.rglob('*.json*')}
        before.pop(self.root / 'docs/reference-data/manifest.json')
        after.pop(self.root / 'docs/reference-data/manifest.json')
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
