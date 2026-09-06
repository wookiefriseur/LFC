-- Static/headless validator for the constants:
--   * id tables hold stable ids, not rendered text
--   * name tables cover exactly the id tables keys
-- Called by run_static.sh
-- If this test fails, assume the test is wrong, but does not hurt to check if you re-introduced the old constants structure by mistake.
-- It's WIP and currently just a helper, don't put it in CI yet

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

-- key: from name table, value: id tables it's built from
-- update as new ones are added or existing ones are changed
local VOCABULARIES = {
  Locations = { "ZoneIds", "PlaceIds" },
  NPC = { "NpcIds", "NpcClassIds", "NpcGroupIds" },
  CrownCrates = { "CrownCrateIds" },
  SkillLines = { "SkillLineIds" },
  Events = { "EventIds" },
}

local path = root .. "/Constants.lua"
local chunk, err = loadfile(path)
assert(chunk, "cannot load " .. path .. ": " .. tostring(err))
local env = makeSandbox()
setfenv(chunk, env)
chunk()

local constants = env.LibFurnitureCatalogue.Internal.Constants
local failures = {}
local function fail(message)
  failures[#failures + 1] = message
end

for nameTable, idTables in pairs(VOCABULARIES) do
  local names = constants[nameTable]
  if type(names) ~= "table" then
    fail(nameTable .. " is missing")
  else
    local expected = {}
    for _, idTable in ipairs(idTables) do
      local ids = constants[idTable]
      if type(ids) ~= "table" then
        fail(idTable .. " is missing")
      else
        for key, id in pairs(ids) do
          if type(id) ~= "number" then
            fail(string.format("%s.%s is %s, expected a stable id", idTable, key, type(id)))
          end
          if expected[key] then
            fail(string.format("%s is in both %s and %s", key, expected[key], idTable))
          end
          expected[key] = idTable
          if names[key] == nil then
            fail(string.format("%s.%s has no entry in %s", idTable, key, nameTable))
          end
        end
      end
    end
    for key in pairs(names) do
      if not expected[key] then
        fail(string.format("%s.%s is not derived from an id table", nameTable, key))
      end
    end
  end
end

if #failures > 0 then
  print("CONSTANTS VALIDATION FAILED:")
  table.sort(failures)
  for _, message in ipairs(failures) do
    print("  " .. message)
  end
  os.exit(1)
end
print("  ok")
