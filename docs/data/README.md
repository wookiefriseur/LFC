# data: FurnitureCatalogue records, schema v2

Initially generated from the LibFurnitureCatalogue Lua data files but will now be the only source of truth and Lua is generated from that.

## Strings

`strings.json` is generated from `LibFurnitureCatalogue/locale/*.lua`. It holds text for `si` strings and for `source.note` (where localised). See CONTRIBUTING, section on generation.

## Names

`names.en.json` covers every emitted id. Two sources, export wins: the game export `itemName`
(`reference/lua2json/FurnitureCatalogue_Export.lua.json`), then the trailing `-- <name>` comment of the data row. Items that have neither got an `Item <id>` placeholder. New meta dumps should have all required names though and can be used to fix old entries.
