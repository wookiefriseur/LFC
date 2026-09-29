local directory, destination = assert(arg[1]), assert(arg[2])
local env = { assert = assert }
for _, name in ipairs({ "GeneratedConstants.lua", "GeneratedDatabase.lua" }) do
  local chunk = assert(loadfile(directory .. "/" .. name))
  setfenv(chunk, env)
  chunk()
end
local constants, database = env.LFCGeneratedConstants, env.LFCGeneratedDatabase
assert(constants.format == 1 and database.format == 1)
assert(constants.vocabulary == database.vocabulary)

local arrays = setmetatable({}, { __mode = "k" })
local function array(value)
  value = value or {}
  arrays[value] = true
  return value
end
local function quote(value)
  return '"'
    .. value:gsub('[%z\1-\31\\"]', function(c)
      return string.format("\\u%04x", string.byte(c))
    end)
    .. '"'
end
local function json(value)
  if type(value) == "string" then
    return quote(value)
  elseif type(value) == "boolean" then
    return tostring(value)
  elseif type(value) == "number" then
    return string.format("%.0f", value)
  end
  assert(type(value) == "table", "unexpected JSON value")
  local parts = {}
  if arrays[value] then
    for _, item in ipairs(value) do
      parts[#parts + 1] = json(item)
    end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local keys = {}
  for key in pairs(value) do
    keys[#keys + 1] = key
  end
  table.sort(keys)
  for _, key in ipairs(keys) do
    parts[#parts + 1] = quote(key) .. ":" .. json(value[key])
  end
  return "{" .. table.concat(parts, ",") .. "}"
end
local function symbol(vocabulary, value)
  return assert(assert(constants.symbols[vocabulary], vocabulary)[value], "unknown vocabulary id")
end
local fields = {
  "vendor",
  "subtype",
  "locations",
  "achievement",
  "quest",
  "skill_line",
  "skill_rank",
  "note",
  "part_of",
  "event",
  "container",
  "collectible",
  "crate",
  "packs",
  "bundle",
  "npc_class",
  "npc_group",
  "leads",
  "houses",
  "companion",
}
local vocabularies = constants.sourceVocabularies
assert(#constants.sourceFields == #fields)
for index, field in ipairs(fields) do
  assert(constants.sourceFields[index] == field, "source field layout mismatch")
end
local function sourceValue(kind, field, value)
  local vocabulary = vocabularies[field] or (field == "subtype" and kind .. "_subtypes")
  if vocabulary then
    if type(value) ~= "table" then
      return symbol(vocabulary, value)
    end
    local result = array()
    for _, member in ipairs(value) do
      result[#result + 1] = symbol(vocabulary, member)
    end
    return result
  elseif field == "locations" then
    local result = array()
    for _, placement in ipairs(value) do
      local entry = {}
      if placement[1] then
        entry.location = symbol("locations", placement[1])
      end
      if placement[2] then
        entry.place = symbol("places", placement[2])
      end
      entry.note = placement[3]
      result[#result + 1] = entry
    end
    return result
  elseif type(value) == "table" then
    return array(value)
  end
  return value
end
local output = assert(io.open(destination, "w"))
for id, row in pairs(database.items) do
  local seen, mask, version, blueprint = {}, 0, math.huge, nil
  for index = 4, #row do
    local record = row[index]
    local kind = symbol("source_types", record[1])
    assert(kind ~= "rumour")
    if not seen[record[1]] then
      mask = mask + 2 ^ (record[1] - 1)
      seen[record[1]] = true
    end
    version = math.min(version, record[2])
    if record[7] then
      assert(not blueprint or blueprint == record[7])
      blueprint = record[7]
      assert(database.blueprints[blueprint] == id, "blueprint index mismatch")
    end
    local decoded = {
      id = id,
      blueprint = record[7],
      source = { type = kind },
      cost = array(),
      availability = { version = symbol("versions", record[2]), last_seen = record[4] },
    }
    for _, cost in ipairs(record[3]) do
      decoded.cost[#decoded.cost + 1] = { currency = symbol("currencies", cost[1]), amount = cost[2] }
    end
    if record[5] then
      decoded.rarity = symbol("rarities", record[5])
    end
    if record[6] then
      decoded.container = assert(({ "books", "folio" })[record[6]])
    end
    for fieldIndex, field in ipairs(fields) do
      local value = record[constants.sourceFieldOffset + fieldIndex]
      if value ~= nil then
        decoded.source[field] = sourceValue(kind, field, value)
      end
    end
    output:write(json(decoded), "\n")
  end
  assert(row[1] == mask and row[2] == version and row[3] == (blueprint or 0), "item summary mismatch")
end
for id, version in pairs(database.rumours) do
  assert(not database.items[id], "rumour also confirmed")
  local decoded = {
    id = id,
    source = { type = "rumour" },
    cost = array(),
    availability = { version = symbol("versions", version) },
  }
  if database.blueprints[id] ~= nil then
    decoded.blueprint = id
    decoded.id = database.blueprints[id] ~= 0 and database.blueprints[id] or nil
  end
  output:write(json(decoded), "\n")
end
output:close()

if arg[3] then
  local sandbox = dofile(arg[3] .. "/tests/eso_sandbox.lua")()
  local chunk = assert(loadfile(arg[3] .. "/LibFurnitureCatalogue/Constants.lua"))
  setfenv(chunk, sandbox)
  chunk()
  local legacy = sandbox.LibFurnitureCatalogue.Internal.Constants
  for name, id in pairs(constants.ids.item_sources) do
    assert(legacy.ItemSources[name] == id, "item source constant differs: " .. name)
  end
  for name, id in pairs(constants.ids.versions) do
    assert(legacy.Versioning[name] == id, "version constant differs: " .. name)
  end
end
