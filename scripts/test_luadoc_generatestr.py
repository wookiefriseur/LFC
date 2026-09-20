#!/usr/bin/env python3

import unittest

import luaDoc_generateStr as LD


class ExtractStringsTest(unittest.TestCase):

  def test_plain_pair(self):
    self.assertEqual(
      LD.extract_strings(['  SI_FURC_CHAT_MATS = "Mats:",\n']),
      {'SI_FURC_CHAT_MATS': '"Mats:"'},
    )

  def test_trailing_comment_is_dropped(self):
    self.assertEqual(
      LD.extract_strings(['  SI_FURC_EVENT = "event", -- keep lowercase\n']),
      {'SI_FURC_EVENT': '"event"'},
    )

  def test_double_dash_inside_the_value_is_kept(self):
    # a `--` is not a Lua comment when inside quotes
    self.assertEqual(
      LD.extract_strings(['  SI_FURC_SRC_EMPTY = "Unknown -- ask a maintainer",\n']),
      {'SI_FURC_SRC_EMPTY': '"Unknown -- ask a maintainer"'},
    )

  def test_double_dash_inside_the_value_with_a_trailing_comment(self):
    self.assertEqual(
      LD.extract_strings(['  SI_X = "a -- b", -- todo\n']),
      {'SI_X': '"a -- b"'},
    )

  def test_escaped_quote_inside_the_value(self):
    self.assertEqual(
      LD.extract_strings([r'  SI_X = "say \"hi\" -- now",' + '\n']),
      {'SI_X': r'"say \"hi\" -- now"'},
    )

  def test_non_string_value_still_parses(self):
    self.assertEqual(
      LD.extract_strings(['  SI_X = GetString(SI_Y), -- indirection\n']),
      {'SI_X': 'GetString(SI_Y)'},
    )

  def test_lines_that_are_not_pairs_are_skipped(self):
    self.assertEqual(LD.extract_strings(['local strings = {\n', '-- a comment\n', '}\n']), {})


if __name__ == '__main__':
  unittest.main()
