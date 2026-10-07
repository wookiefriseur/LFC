# Contributing furniture data

Use the [web interface](https://wookiefriseur.github.io/LFC/) to find an item, correct its source or price, and review the changes before submitting them. A GitHub account is needed to send the resulting issue (but you can post it on ESOUI instead, if you don't have an account). No Lua editing is required.

## Find missing items in game

Enable FurnitureCatalogue and FurnitureCatalogue_DevUtility. Open the developer
window, select **Datamine**, enter an item ID range and click **Scan**. No database reset or UI reload is needed. You can also right-click a furnishing or recipe
and choose **Add JSONL to textbox**.

Copy the output into **Batch edit -> ++Add from Dump or Diff** on the website. If the scan has several pages, you can paste them consecutively into the same box. Cancel keeps the previous completed output.

New discoveries appear as **UNCONFIRMED**. Existing catalogue items are skipped. If you know where an item comes from, select its row and set its source. You can tick several rows to change them together. Review the change list, then submit. Unsent changes are kept in your browser until you discard them, so a reload or a closed tab loses nothing. Large submissions use copy+paste into an issue instead of a prefilled link. If the issue body is too large, the page splits it into numbered parts. Submit every part. Please process and merge them in the numbered order (because they might depend on each other).

## Refresh names and metadata of catalogued items

**Maintenance -> Check -> Missing a name or metadata** lists catalogued items with a placeholder name ("Item 123") or no item metadata. **Copy id list** copies their ids as a request (narrow it with the search box first if you like). Paste those ids into the **Datamine** text box ingame and click **Item list**: it produces a dump for each requested item. Paste the output into **Batch edit -> ++Add from Dump or Diff**. Every catalogued item whose name or metadata differs becomes an **item details** change, shown in the change list as before and after; its records stay as they are.

## Correct sources and obsolete IDs

Search by name or ID. Open a record in **Batch edit** to change its source or other details. Tick several records to apply a shared change and data note.

For unwanted or obsolete item IDs, choose **IGNORED** and explain why in **Data note**, including replacement IDs where known. Ignored entries stay searchable here and identifiable in game, but FC hides them from normal lists
and Datamine does not report them as missing. Unignore them by setting a different source in the webinterface, if you think it should not be ignored.

## Database edits from issues

Webinterface submissions become PRs through **IssueToPR** (`issue_to_pr.yml`):

1. contributor submits the webinterface issue, a maintainer may edit its opening post
2. maintainer applies the `bot:ready4pipeline` label, or runs IssueToPR from the Actions tab with the issue number
3. the bot applies the diff from the opening post (comments are ignored), regenerates the database files and opens or refreshes `db-edit/issue-<N>`
4. maintainer approves the PR's workflow runs, inspects the data and merges. Because of the `Closes #<N>` line in the PR description, it auto-closes the issue on merge
5. maintainers decide when to release and it's a separate process (PrepareRelease)

Failures and refusals are commented on the issue. Applying the label again refreshes the PR against current `main`. To reject, close the PR. To start over, close PR and delete its branch.

## Preview a submitted issue locally

I suggest you instead preview it in the webinterface: paste the issue's diff or its whole text into **Batch edit -> ++Add from Dump or Diff**, where you can also change it. Testing it locally will involve some copy&paste if you don't set up a pipeline for that.

Install `scripts/requirements.txt`, then save the issue's opening post as a text file (UTF-8). You can paste the whole markdown code of the issue (only JSONL block between `diff-begin` and `diff-end` is processed anyways).

```sh
python3 scripts/apply_issue.py /tmp/issue-body.txt --out /tmp/issue-preview --lua /path/to/lua5.1
```

The output directory must not exist yet and must be outside the repo. It receives only the changed files plus `report.json`, the same files a generated PR in the GitHub repo would contain, including the regenerated game DB Lua files. Copy them over the repo to review them ingame.

Names and discovery metadata only support languages currently published on webinterface.
`python3 scripts/apply_issue.py --check` verifies that the checkout's data, manifests and generated Lua agree.

# Contributing to LFC itself

## Local setup

`lua` and `luac` (or symlinks) go in `bin/`, which is gitignored. `../bin` next to the repo also works. Override with `LUAC` and `LUA`, in the environment or in `.env` at the repo root (tools and tests both read those). See `scripts/env.example`.

## Local web development

GitHub Pages serves `docs/` on `main`.

From the LFC repository root, run `python3 scripts/webview_serve.py` and open `http://localhost:18001/`. The command refreshes the web asset cache stamps before
serving the site. Pass a port number to use another port.

Run the web checks from `tests/web` with `npm ci` followed by `npm test`. The public API header check is part of `tests/run_static.sh`.

## Tests

`tests/run_static.sh` runs the whole static suite and stops at the first fail (for a pipeline):

- syntax check: `luac -p` over every `.lua` in the repo
- `tests/validate_constants.lua`: no duplicate ids, no gaps, every key resolvable both ways
- `tests/validate_locale.lua`: every `SI_` string declared, used and translated
- `tests/validate_data.lua`: data files, duplication and the shape each row has to have
- `tests/validate_record_fields.lua`: every field of every published row, against the declared record shape
- `tests/validate_api_surface.lua`: API and the header in `Api.lua` name the same endpoints --TODO: make optional, if too many false positives

Some tests can only be run ingame and are part of FC (because that one has the Taneth test suite).

## Generate and verify game data locally

From the repository root:

```sh
python3 scripts/generate_db.py --lua /path/to/lua
LUA=/path/to/lua python3 -m unittest discover -s scripts -p test_generate_db.py
```

Use Lua 5.1 or ESOLua. With ESOLua, also pass `--esoui /path/to/esoui` to the generator and set `ESOUI=/path/to/esoui` for the tests. The default interpreter is `bin/lua`.

Every generation validates the data and verifies the generated Lua by decoding it back to JSONL before writing the outputs. Add `--check` to verify that existing outputs match a fresh build.

Both the generator and IssueToPR add missing `SI_FURC_*` strings from `enums.json` inside the `WEBINTERFACE STRINGS` comment markers in `locale/en.lua`. If you run into issues ingame check for missing strings first. Handwritten definitions outside the markers stay authoritative, game-owned string IDs are not generated.

## Release

- packaged from `./LibFurnitureCatalogue`, which is the AddOn as it ships
- everything else here is tool or webinterface related stuff that stays out of the zip

Releases are done through workflows with automatic version bumps, manual packaging only for plan B:

1. **PrepareRelease** (`prepare_release.yml`), started manually from the Actions tab
2. **FinalizeRelease** (`finalize_release.yml`), triggered by the generated PR being merged
3. **PublishToESOUI** (`publish_to_esoui.yml`), triggered by FinalizeRelease

Both PublishToESOUI and `build.sh --publish` support an optional `dry_run` flag, which uses ESOUI test endpoint and does not publish the AddOn.

## Tools

- `scripts/build.sh`: local equivalent of the GitHub pipeline, zips land in `.package/`
- `scripts/stylua.sh`: formatting with the exact StyLua version CI uses
- `scripts/furc_utils.py`: version, manifest and changelog helpers used by the workflows
