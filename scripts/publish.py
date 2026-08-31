#!/usr/bin/env python3

import argparse
import json

import furc_utils as FU
import esoui_utils as EU

"""Perform all steps required for Publishing.
    - get AddOn data from manifest
    - get AddOn data from API
    - prepare request body
    - save GitHub release note to CHANGELOG
    - get truncated version of CHANGELOG
"""

ADDON_ID = EU.ADDON_ID
ADDON_MANIFEST_FILE = EU.ADDON_MANIFEST_FILE

ARCHIVE_MIN_SIZE_IN_BYTES = 1024
"""Minimum size in bytes the archive needs for a release.

  Regular zip (manifest, locales, data tables) is ~180 KB,
  anything near 1 KB means packaging went wrong.
"""

CL_LIVE_MAX_ENTRIES = 15
CL_LIVE_HEADER_DELIM = '---'
CL_LIVE_HEADER_DEFAULT =f'''If you don't find change notes, it's because it's Luxury Furnisher. Booooring.

Speaking of boring: if you're really bored you can find the full changelog [URL="https://github.com/wookiefriseur/LFC/blob/main/{FU.CL_FILE}"]here[/URL] and all undocumented changes [URL="https://github.com/wookiefriseur/LFC/commits/main"]here[/URL].
'''

RELEASE_NOTE_DELIM = "[//]:"

def publish_to_esoui(optional_params: dict = None):
  optional_params = optional_params or {}
  manifest = FU.get_manifest_data(ADDON_MANIFEST_FILE)

  # Get AddOn details from API
  body = EU.get_addon_details(ADDON_ID)
  # generate compatibility list, because APIVersion might have been updated
  body[EU.PROP_LIVE_COMPATIBLE] = EU.get_compatible(manifest[FU.PROP_MF_APIVERSION])

  # Check versions before proceeding
  new_version = manifest[FU.PROP_MF_VERSION]
  current_version = body[EU.PROP_LIVE_VERSION]
  if FU.compare_versions(new_version, current_version) < 1:
    FU.crash_and_burn(f"Not an update, our new version ({new_version}) is not higher than on ESOUI (${current_version})")
  # The new version seems fine, we can replace it in the request body
  body[EU.PROP_LIVE_VERSION] = FU.to_semver(new_version)

  # Get content of zip file, abort if too smol
  try:
    archivename = f"{manifest[FU.PROP_MF_TITLE]}-{manifest[FU.PROP_MF_VERSION]}.zip"
    archive_content = FU.file_to_binary_string(optional_params.get('archive_file') or archivename)
  except Exception:
    FU.crash_and_burn('no zip, no live')

  if len(archive_content) < ARCHIVE_MIN_SIZE_IN_BYTES:
    FU.crash_and_burn(f"Zip archive is too small ({len(archive_content)}B), something must be wrong or compression algorithms have gotten way better")
  body[EU.PROP_LIVE_UPDATEFILE] = archive_content

  # ESOUI: Extract and save changelog comment
  esoui_cl_comment = FU.extract_header(body[EU.PROP_LIVE_CHANGELOG], CL_LIVE_HEADER_DELIM)
  if esoui_cl_comment:
    esoui_cl_comment = f"{esoui_cl_comment}\n{CL_LIVE_HEADER_DELIM}\n"
  else:
    esoui_cl_comment = CL_LIVE_HEADER_DEFAULT
  new_kids_on_the_log = [esoui_cl_comment]

  # Pick latest x changes to show in the ESOUI CL
  changelog_file = optional_params.get('changelog_file') or FU.CL_FILE
  max_entries = optional_params.get('changelog_max_entries') or CL_LIVE_MAX_ENTRIES
  new_kids_on_the_log.extend(FU.get_log_entries(changelog_file, max_entries))
  body[EU.PROP_LIVE_CHANGELOG] = '\n'.join(new_kids_on_the_log)

  test = bool(optional_params.get('test'))
  response = EU.send_update_request(body, archivename, test)
  print(f"Done{' (simulated, nothing published)' if test else ''}, received status code: {response.get('status', '0')}")
  if optional_params.get('print_response'):
    print(json.dumps(response, indent=2))

if __name__ == '__main__':
  parser = argparse.ArgumentParser(description='Publish a new release.')
  parser.add_argument('--changelog-file', help='Path to the changelog file')
  parser.add_argument('--changelog-max-entries', type=int, help='Send only the latest X entries to the ESOUI changelog')
  parser.add_argument('--archive-file', help='Path to the release archive file')
  parser.add_argument('--print-response', action='store_true', default=False,  help='Prints the full ESOUI response to the terminal')
  parser.add_argument('--test', action='store_true', default=False, help='Send to the ESOUI /updatetest endpoint: simulates the upload, publishes nothing')

  params = {}
  args = parser.parse_args()
  params['changelog_file'] = args.changelog_file
  params['changelog_max_entries'] = args.changelog_max_entries
  params['archive_file'] = args.archive_file
  params['print_response'] = args.print_response
  params['test'] = args.test

  try:
    publish_to_esoui(params)
  except Exception as ex:
    # Abort for safety reasons
    FU.crash_and_burn(f"Error: {ex}")
