#!/usr/bin/env python3

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


if __name__ == '__main__':
  unittest.main()
