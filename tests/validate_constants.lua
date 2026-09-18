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

-- Every source type has a stable English name
-- Without this, adding a source silently degrades to the raw key
do
  local sources = constants.ItemSources
  local labels = constants.SourceLabels
  if type(sources) ~= "table" or type(labels) ~= "table" then
    fail("ItemSources or SourceLabels is missing")
  else
    local known = {}
    for key, value in pairs(sources) do
      known[value] = key
      local label = labels[value]
      if type(label) ~= "string" or label == "" then
        fail(string.format("ItemSources.%s has no entry in SourceLabels", key))
      end
    end
    for value in pairs(labels) do
      if not known[value] then
        fail(string.format("SourceLabels[%s] names no ItemSources value", tostring(value)))
      end
    end
    for value in pairs(constants.NotASource or {}) do
      if not known[value] then
        fail(string.format("NotASource[%s] names no ItemSources value", tostring(value)))
      end
    end

    local names = constants.SourceNames
    if type(names) ~= "table" then
      fail("SourceNames is missing")
    else
      for value in pairs(labels) do
        if names[value] == nil then
          fail(string.format("SourceNames has no key for source %s", tostring(value)))
        end
      end
      for value, key in pairs(names) do
        if sources[key] ~= value then
          fail(string.format("SourceNames[%s] is %s, which is not that value's key", tostring(value), tostring(key)))
        end
      end
    end
  end
end

-- A published number keeps its meaning
--
-- The aliases below each table are deliberately not pinned: `LATEST` is defined to move with every release
local COUNTER_TABLES = {
  ITEM_SOURCES = "ItemSources",
  VERSIONING = "Versioning",
}

do
  local handle = io.open(path, "r")
  assert(handle, "cannot read " .. path)
  local text = handle:read("*a")
  handle:close()

  local seen = {}
  for _, tableName in pairs(COUNTER_TABLES) do
    seen[tableName] = {}
  end

  local number = 0
  for line in (text .. "\n"):gmatch("([^\n]*)\n") do
    number = number + 1
    -- The trailing comment is matched separately so that a member with none is still seen
    local key, idType, tail = line:match('^%s*([%a_][%w_]*)%s*=%s*getNextIdFor%("([A-Z_]+)"%)%s*,(.*)$')
    local published = key and (tail:match("^%s*%-%-%s*(%d+)") or "") or nil
    if key then
      local tableName = COUNTER_TABLES[idType]
      if not tableName then
        fail(string.format("%s:%d: %s counts against the unknown id type %q", "Constants.lua", number, key, idType))
      elseif published == "" then
        fail(
          string.format(
            "Constants.lua:%d: %s.%s states no number, so nothing records what it was published as",
            number,
            tableName,
            key
          )
        )
      else
        local ids = constants[tableName] or {}
        local actual = ids[key]
        local claimed = tonumber(published)
        if actual ~= claimed then
          fail(
            string.format(
              "%s.%s is %s and says %d: a published number moved, which renames every consumer's stored value",
              tableName,
              key,
              tostring(actual),
              claimed
            )
          )
        end
        local first = seen[tableName][claimed]
        if first then
          fail(string.format("%s.%s and %s.%s both claim %d", tableName, key, tableName, first, claimed))
        else
          seen[tableName][claimed] = key
        end
      end
    end
  end

  -- A table that stopped using the counter would otherwise pass by matching nothing
  for idType, tableName in pairs(COUNTER_TABLES) do
    if not next(seen[tableName]) then
      fail(string.format("no %s member counts against %q, so nothing here is pinned", tableName, idType))
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
