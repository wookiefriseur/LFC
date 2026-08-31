# LibFurnitureCatalogue

Official Furniture Catalogue database library. Used by FurnitureCatalogue.

- **This Library:** https://www.esoui.com/downloads/info4804-LibFurnitureCatalogue.html
- **Main AddOn:** https://www.esoui.com/downloads/info1617-FurnitureCatalogue.html

This repo contains the following:

1. AddOn src files in [./LibFurnitureCatalogue](./LibFurnitureCatalogue)
2. hand-maintained DB files in [./LibFurnitureCatalogue/data](./LibFurnitureCatalogue/data)


Future plans:

1. helper scripts to build compact DB files from human readable ones
2. webinterface for contributors and lookups

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


## Website

https://wookiefriseur.github.io/LFC/ - API docs and, later, the webinterface for contributors.

- served straight from `docs/` on `main`


## Tests

- `tests/run_static.sh`: syntax (WIP)
- `tests/validate_data.lua`: duplication + schema (WIP)


## Local setup

`lua` and `luac` (or symlinks) go in `bin/`, which is gitignored. `../bin` next to the repo also works. Override with `LUAC` and `LUA`, in the environment or in `.env` at the repo root (tools and tests both read those). See `scripts/env.example`.

Data validation script is doing nothing for now.
