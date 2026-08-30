# LibFurnitureCatalogue

Official Furniture Catalogue database library. Used by FurnitureCatalogue.

This repo contains the following:

1. AddOn src files in [./LibFurnitureCatalogue](./LibFurnitureCatalogue)
2. hand-maintained DB files in [./LibFurnitureCatalogue/data](./LibFurnitureCatalogue/data)


Future plans:

1. helper scripts to build compact DB files from human readable ones
2. webinterface for contributors and lookups

## Release

- packaged from `./LibFurnitureCatalogue`, which is the AddOn as it ships
- everything else here is tool or webinterface related stuff that stays out of the zip


## Tools

- `scripts/stylua.sh`: formatting (WIP)


## Tests

- `tests/run_static.sh`: syntax (WIP)
- `tests/validate_data.lua`: duplication + schema (WIP)


## Local setup

`lua` and `luac` go in `../bin`, next to this repo. Override with `LUAC` and `LUA`, in the environment or in `.env` at the repo root (tools and tests both read those).

Data validation script is doing nothing for now.
