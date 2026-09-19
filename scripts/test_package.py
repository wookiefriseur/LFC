#!/usr/bin/env python3

# Checks if the packaging actually works, because it just silently continued even if something failed

import os
import package
import tempfile
import unittest
import zipfile

from unittest import mock



MANIFEST = """## Title: TestAddon
## Version: 1.0.0
## AddOnVersion: 1000000
## APIVersion: 101050

file1.lua
file2.lua
"""


class PackageAddonTest(unittest.TestCase):

  def setUp(self):
    self._cwd = os.getcwd()
    self._tmp = tempfile.TemporaryDirectory()
    os.chdir(self._tmp.name)

  def tearDown(self):
    os.chdir(self._cwd)
    self._tmp.cleanup()

  def _write_manifest(self, manifest=MANIFEST):
    with open('TestAddon.txt', 'w') as f:
      f.write(manifest)

  def test_missing_source_aborts_packaging(self):
    self._write_manifest()
    with open('file1.lua', 'w') as f:
      f.write('-- present\n')
    # file2.lua is listed in the manifest and never created

    with self.assertRaises(SystemExit) as ctx:
      package.package_addon('TestAddon', 'Custom.lua')
    self.assertNotEqual(ctx.exception.code, 0)
    self.assertFalse(os.path.exists('TestAddon-1.0.0.zip'))

  def test_manifest_actual_mismatch_aborts_packaging(self):
    self._write_manifest()
    with open('file1.lua', 'w') as f:
      f.write('-- present\n')
    with open('file2.lua', 'w') as f:
      f.write('-- present\n')

    # Simulate a copy that reports success but doesn't actually place the file
    real_copy = package.shutil.copy
    def half_copy(source, target):
      if source.endswith('file2.lua'):
        return
      real_copy(source, target)

    with mock.patch.object(package.shutil, 'copy', side_effect=half_copy), self.assertRaises(SystemExit) as ctx:
      package.package_addon('TestAddon', 'Custom.lua')
    self.assertNotEqual(ctx.exception.code, 0)
    self.assertFalse(os.path.exists('TestAddon-1.0.0.zip'))

  def test_happy_path_packages_all_manifest_files(self):
    self._write_manifest()
    with open('file1.lua', 'w') as f:
      f.write('-- present\n')
    with open('file2.lua', 'w') as f:
      f.write('-- present\n')

    package.package_addon('TestAddon', 'Custom.lua')

    archive = 'TestAddon-1.0.0.zip'
    self.assertTrue(os.path.exists(archive))
    with zipfile.ZipFile(archive) as zf:
      names = set(zf.namelist())
    self.assertIn(os.path.join('TestAddon', 'file1.lua').replace(os.sep, '/').lstrip('/'),
                  {n.replace(os.sep, '/').lstrip('/') for n in names})
    self.assertIn(os.path.join('TestAddon', 'file2.lua').replace(os.sep, '/').lstrip('/'),
                  {n.replace(os.sep, '/').lstrip('/') for n in names})
    self.assertIn(os.path.join('TestAddon', 'TestAddon.txt').replace(os.sep, '/').lstrip('/'),
                  {n.replace(os.sep, '/').lstrip('/') for n in names})


if __name__ == '__main__':
  unittest.main()
