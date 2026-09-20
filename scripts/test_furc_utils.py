#!/usr/bin/env python3

import os
import tempfile
import textwrap
import unittest

import furc_utils as FU


def gh_list(block: str) -> str:
  return textwrap.dedent(block).strip("\n")


class GhListFixtureTest(unittest.TestCase):

  def test_block_becomes_tab_separated_rows(self):
    self.assertEqual(
      gh_list("""
        Version 4.5\tLatest\t4.5\t2023-05-15T00:59:34Z
        Version 1.0\t\t1.0\t2022-01-01T00:00:00Z
      """),
      "Version 4.5\tLatest\t4.5\t2023-05-15T00:59:34Z\nVersion 1.0\t\t1.0\t2022-01-01T00:00:00Z",
    )


class GetHighestVersionFromGhListTest(unittest.TestCase):
  """Rows are tab separated: title, status, tag name, published date."""

  def test_ignores_prerelease_with_higher_version(self):
    listing = gh_list("""
      Version 1.23\tPre-release\t1.23\t2023-05-16T15:12:00Z
      Version 4.6\tPre-release\t4.6\t2023-05-15T00:36:49Z
      Version 4.5\tLatest\t4.5\t2023-05-15T00:59:34Z
    """)
    self.assertEqual(FU.get_highest_version_from_gh_list(listing), "4.5")

  def test_ignores_draft_with_higher_version(self):
    listing = gh_list("""
      Version 4.5\tLatest\t4.5\t2023-05-15T00:59:34Z
      Version 9.9\tDraft\t9.9\t2023-05-17T00:00:00Z
    """)
    self.assertEqual(FU.get_highest_version_from_gh_list(listing), "4.5")

  def test_ignores_both_prerelease_and_draft_together(self):
    listing = gh_list("""
      Version 1.0\t\t1.0\t2022-01-01T00:00:00Z
      Version 1.23\tPre-release\t1.23\t2023-05-16T15:12:00Z
      Version 4.6\tDraft\t4.6\t2023-05-15T00:36:49Z
      Version 4.5\tLatest\t4.5\t2023-05-15T00:59:34Z
    """)
    self.assertEqual(FU.get_highest_version_from_gh_list(listing), "4.5")

  def test_falls_back_to_plain_release_when_none_marked_latest(self):
    # an older release carries an empty status column and stays eligible
    listing = gh_list("""
      Version 1.0\t\t1.0\t2022-01-01T00:00:00Z
      Version 2.0\t\t2.0\t2022-06-01T00:00:00Z
      Version 3.0\tPre-release\t3.0\t2023-01-01T00:00:00Z
    """)
    self.assertEqual(FU.get_highest_version_from_gh_list(listing), "2.0")

  def test_empty_list_returns_zero(self):
    self.assertEqual(FU.get_highest_version_from_gh_list(""), "0")

  def test_only_prerelease_and_draft_rows_returns_zero(self):
    listing = gh_list("""
      Version 1.0\tPre-release\t1.0\t2022-01-01T00:00:00Z
      Version 2.0\tDraft\t2.0\t2022-06-01T00:00:00Z
    """)
    self.assertEqual(FU.get_highest_version_from_gh_list(listing), "0")


class SemverToIntTest(unittest.TestCase):

  def test_three_components(self):
    self.assertEqual(FU.semver_to_int("1.23.4"), 1_023_004)

  def test_missing_components_default_to_zero(self):
    self.assertEqual(FU.semver_to_int("2"), 2_000_000)
    self.assertEqual(FU.semver_to_int("2.1"), 2_001_000)

  def test_four_components_are_rejected(self):
    # truncating to 1.2.3 would ship a version nobody asked for
    with self.assertRaises(ValueError):
      FU.semver_to_int("1.2.3.4")


class UpdateChangelogTest(unittest.TestCase):

  def setUp(self):
    self.workdir = tempfile.TemporaryDirectory()
    self.addCleanup(self.workdir.cleanup)
    self.cl_file = os.path.join(self.workdir.name, 'CHANGELOG')
    with open(self.cl_file, 'w', encoding='utf-8') as f:
      f.write("1.0.0 (2026-01-01)\n- the first release\n")

  def write_notes(self, text: str) -> str:
    path = os.path.join(self.workdir.name, 'notes.tmp')
    with open(path, 'w', encoding='utf-8') as f:
      f.write(text)
    return path

  def read_changelog(self) -> str:
    with open(self.cl_file, encoding='utf-8') as f:
      return f.read()

  def test_keeps_note_lines_that_start_with_a_digit(self):
    notes = self.write_notes("- a fix\n2026 event items added\n3 new luxury furnishings\n")
    FU.update_changelog(notes, "1.1.0 (2026-02-02)", self.cl_file)
    changelog = self.read_changelog()
    self.assertIn("2026 event items added", changelog)
    self.assertIn("3 new luxury furnishings", changelog)

  def test_replaces_a_version_header_the_notes_already_carry(self):
    notes = self.write_notes("1.1.0 (2026-01-15)\n- a fix\n")
    FU.update_changelog(notes, "1.1.0 (2026-02-02)", self.cl_file)
    changelog = self.read_changelog()
    self.assertTrue(changelog.startswith("1.1.0 (2026-02-02)\n- a fix"), changelog)
    self.assertNotIn("2026-01-15", changelog)

  def test_missing_notes_file_is_a_no_op(self):
    FU.update_changelog(os.path.join(self.workdir.name, 'nope.tmp'), "1.1.0", self.cl_file)
    self.assertEqual(self.read_changelog(), "1.0.0 (2026-01-01)\n- the first release\n")

  def test_omitted_notes_file_is_a_no_op(self):
    # `update_changelog --header ...` without --notes-file: documented as nothing to mention
    FU.update_changelog(None, "1.1.0", self.cl_file)
    self.assertEqual(self.read_changelog(), "1.0.0 (2026-01-01)\n- the first release\n")


if __name__ == '__main__':
  unittest.main()
