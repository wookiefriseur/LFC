#!/usr/bin/env python3

import unittest
from unittest import mock

import requests

import esoui_utils as EU


class FakeResponse:
  """Enough of a requests.Response for the calls these tests exercise."""

  def __init__(self, payload=None, status_code: int = 200, raise_for_status: Exception | None = None):
    self.payload = payload
    self.status_code = status_code
    self.content = b'{}'
    self._raise = raise_for_status

  def raise_for_status(self):
    if self._raise: raise self._raise

  def json(self):
    return self.payload


COMPATIBLE_LIST = [
  {'id': '8.0', 'interface': '101031'},
  {'id': '9.0', 'interface': '101038'},
  {'id': '10.0', 'interface': '101050'},
]


class GetCompatibleTest(unittest.TestCase):

  def setUp(self):
    self.env = mock.patch.dict('os.environ', {'ESOUI_API_TOKEN': 'x'})
    self.env.start()
    self.addCleanup(self.env.stop)

  def test_lists_every_patch_up_to_the_manifest_apiversion(self):
    with mock.patch.object(requests, 'get', return_value=FakeResponse(COMPATIBLE_LIST)):
      self.assertEqual(EU.get_compatible('101038'), '8.0,9.0')

  def test_takes_the_highest_of_several_apiversions(self):
    with mock.patch.object(requests, 'get', return_value=FakeResponse(COMPATIBLE_LIST)):
      self.assertEqual(EU.get_compatible('101050 101038'), '8.0,9.0,10.0')

  def test_compares_apiversions_as_numbers(self):
    listing = [{'id': '1.0', 'interface': '99999'}] + COMPATIBLE_LIST
    with mock.patch.object(requests, 'get', return_value=FakeResponse(listing)):
      self.assertEqual(EU.get_compatible('101031'), '1.0,8.0')

  def test_server_error_aborts_instead_of_returning_nothing(self):
    failure = requests.exceptions.RequestException('503 from ESOUI')
    with mock.patch.object(requests, 'get', return_value=FakeResponse(raise_for_status=failure)), \
         self.assertRaises(requests.exceptions.RequestException):
      EU.get_compatible('101050')

  def test_unreadable_response_aborts_instead_of_returning_nothing(self):
    broken = FakeResponse()
    broken.json = mock.Mock(side_effect=requests.exceptions.JSONDecodeError('nope', '', 0))
    with mock.patch.object(requests, 'get', return_value=broken), \
         self.assertRaises(requests.exceptions.JSONDecodeError):
      EU.get_compatible('101050')

  def test_empty_apiversion_is_rejected(self):
    with self.assertRaises(ValueError):
      EU.get_compatible('')

  def test_request_carries_a_timeout(self):
    with mock.patch.object(requests, 'get', return_value=FakeResponse(COMPATIBLE_LIST)) as get:
      EU.get_compatible('101050')
    self.assertIsNotNone(get.call_args.kwargs.get('timeout'))


class SendUpdateRequestTest(unittest.TestCase):

  def setUp(self):
    self.env = mock.patch.dict('os.environ', {'ESOUI_API_TOKEN': 'x'})
    self.env.start()
    self.addCleanup(self.env.stop)

  def body(self, **overrides) -> dict:
    data = {
      EU.PROP_LIVE_ID: 4804,
      EU.PROP_LIVE_VERSION: '1.2.0',
      EU.PROP_LIVE_CHANGELOG: 'a change',
      EU.PROP_LIVE_COMPATIBLE: '10.0',
      EU.PROP_LIVE_UPDATEFILE: b'PK\x03\x04',
    }
    data.update(overrides)
    return data

  def post(self, data: dict):
    response = FakeResponse({'ok': True})
    with mock.patch.object(requests, 'post', return_value=response) as post:
      result = EU.send_update_request(data, 'LFC-1.2.0.zip')
    return post, result

  def test_sends_every_field_when_all_are_present(self):
    post, result = self.post(self.body())
    files = post.call_args.kwargs['files']
    self.assertEqual(set(files), {
      EU.PROP_LIVE_ID, EU.PROP_LIVE_VERSION, EU.PROP_LIVE_CHANGELOG,
      EU.PROP_LIVE_COMPATIBLE, EU.PROP_LIVE_UPDATEFILE,
    })
    self.assertEqual(result['status'], 200)

  def test_omitted_changelog_is_left_out_rather_than_crashing(self):
    data = self.body()
    del data[EU.PROP_LIVE_CHANGELOG]  # documented optional
    post, _ = self.post(data)
    files = post.call_args.kwargs['files']
    self.assertNotIn(EU.PROP_LIVE_CHANGELOG, files)
    self.assertIn(EU.PROP_LIVE_UPDATEFILE, files)

  def test_request_carries_a_timeout(self):
    post, _ = self.post(self.body())
    self.assertIsNotNone(post.call_args.kwargs.get('timeout'))

  def test_empty_body_is_rejected(self):
    with self.assertRaises(ValueError):
      EU.send_update_request({}, 'LFC-1.2.0.zip')


if __name__ == '__main__':
  unittest.main()
