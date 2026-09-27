local root, fc, generatedDir, destination = arg[1], arg[2], arg[3], arg[4]
dofile(fc .. "/.scripts/test_stubs.lua")
dofile(generatedDir .. "/GeneratedConstants.lua")
dofile(generatedDir .. "/GeneratedDatabase.lua")
local blueprints = LFCGeneratedDatabase.blueprints
LFCGeneratedConstants, LFCGeneratedDatabase = nil, nil
local function idOf(link)
  return tonumber(link:match("item:(%d+)"))
end
IsItemLinkFurnitureRecipe = function(link)
  return blueprints[idOf(link)] ~= nil
end
GetItemLinkRecipeResultItemLink = function(link)
  local id = blueprints[idOf(link)]
  return id and id ~= 0 and string.format("|H1:item:%d:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0|h|h", id) or ""
end
for line in io.lines(root .. "/LibFurnitureCatalogue.txt") do
  local file = line:gsub("\\", "/"):match("^([%w_/]+%.lua)$")
  if file then
    dofile(root .. "/" .. file)
  end
end
local api = LibFurnitureCatalogue.API
LibFurnitureCatalogue.Internal.Build.EnsureDB(true)
assert(api.IsReady())
local function quote(value)
  return '"' .. value:gsub('[%z\1-\31\\"]', function(c)
    return string.format("\\u%04x", c:byte())
  end) .. '"'
end
local function json(value)
  if type(value) == "string" then
    return quote(value)
  end
  if type(value) ~= "table" then
    return tostring(value)
  end
  local parts = {}
  if #value > 0 then
    for _, item in ipairs(value) do
      parts[#parts + 1] = json(item)
    end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  for key, item in pairs(value) do
    parts[#parts + 1] = quote(tostring(key)) .. ":" .. json(item)
  end
  table.sort(parts)
  return "{" .. table.concat(parts, ",") .. "}"
end
local file = assert(io.open(destination, "w"))
local keys = {}
for id in pairs(LibFurnitureCatalogue.Internal.DB) do
  keys[#keys + 1] = id
end
table.sort(keys)
for _, id in ipairs(keys) do
  local records = api.GetSourceDetails(id)
  local rendered = {}
  for _, record in ipairs(records) do
    rendered[#rendered + 1] = LibFurnitureCatalogue.Internal.Query.RenderRecord(record)
  end
  file:write(json({ id = id, entry = api.GetEntry(id), records = records, rendered = rendered }), "\n")
end
file:close()
