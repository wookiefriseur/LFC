-- Static/headless validator for the public API surface:
--   * every member of LibFurnitureCatalogue.API is named in Api.lua's header
--   * every name the header claims exists, on API or on FurC
-- Called by run_static.sh
--
-- The point is that the header stays the map and a quick documentation. It catches undocumented endpoints and deletion of endpoints
--
-- NOTE: If this test fails for you, it's an indicator that API.lua needs some changes, but it could also just mean that it failed parsing the text in the header (it's not stable enough for a pipeline yet)

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

local failures = {}
local function fail(message)
  failures[#failures + 1] = message
end

local function loadInto(env, path)
  local chunk, err = loadfile(path)
  assert(chunk, "cannot load " .. path .. ": " .. tostring(err))
  setfenv(chunk, env)
  chunk()
end

local env = makeSandbox()
-- Api.lua only reads these at load time, so a name per entry is enough
env.ZO_DeepTableCopy = function(t)
  return t
end
env.ZO_ShallowTableCopy = function(t)
  return t
end

loadInto(env, root .. "/LibFurnitureCatalogue.lua")
loadInto(env, root .. "/Constants.lua")

local internal = env.LibFurnitureCatalogue.Internal
local function stub(name)
  return function() end
end
internal.Format = { GetItemId = stub(), GetItemLink = stub() }
internal.Query = {
  Find = stub(),
  GetSourceRecords = stub(),
  GetIngredients = stub(),
  GetItemDescription = stub(),
  GetMiscItemPrice = stub(),
  GetMats = stub(),
}
internal.Build = { EnsureDB = stub(), SourceSet = stub() }

loadInto(env, root .. "/Api.lua")

-- The header is the leading run of comment lines in Api.lua
local header = {}
do
  local handle = io.open(root .. "/Api.lua", "r")
  assert(handle, "cannot read Api.lua")
  for line in handle:lines() do
    if line:match("^%s*%-%-") then
      header[#header + 1] = line
    elseif line:match("%S") then
      break
    end
  end
  handle:close()
end
local headerText = table.concat(header, "\n")
if #header == 0 then
  fail("Api.lua has no header comment block")
end

-- Parse luadoc string to extract endpoint names. The header groups them under headings. Heading does not have a well-defined structure, so the match is trying to be less strict (indented 3 spaces are interpreted as entries, their continuation 4+ spaes, anything else carrying text is interpreted as a heading)
local function namesRemoval(text)
  local lowered = text:lower()
  return lowered:find("removed", 1, true) ~= nil or lowered:find("no longer exist", 1, true) ~= nil
end

local listed, removed = {}, {}
do
  local intoRemoved = false
  for _, line in ipairs(header) do
    local name = line:match("^%-%-   ([%w_.]+)")
    if name then
      if intoRemoved then
        removed[name] = true
      else
        listed[name] = true
      end
    elseif not line:match("^%-%-%s%s%s%s") then
      local text = line:match("^%-%-%s*(.-)%s*$") or ""
      if text ~= "" then
        intoRemoved = namesRemoval(text)
      end
    end
  end
end

for name in pairs(env.LibFurnitureCatalogue.API) do
  if not listed[name] then
    fail(string.format("API.%s is public but the header's endpoint list does not carry it", name))
  end
end

-- A flat alias the header still lists as live has to exist and one it lists as removed must not
for _, line in ipairs(header) do
  local removedLine = false
  for name in line:gmatch("FurC%.([%w_]+)") do
    removedLine = removedLine or removed["FurC." .. name]
    if removed["FurC." .. name] then
      if env.FurC[name] ~= nil then
        fail(string.format("the header says FurC.%s was removed, but it still exists", name))
      end
    elseif not removedLine and env.FurC[name] == nil then
      fail(string.format("the header names FurC.%s, which does not exist", name))
    end
  end
end

-- no line may promise an endpoint that is not there, or keep one it says is gone
for name in pairs(listed) do
  local looksLikeMember = name:match("^%u") and name:match("%l") and not name:match("%.")
  if looksLikeMember and env.LibFurnitureCatalogue.API[name] == nil then
    fail(string.format("the header lists %s, which is not on the API", name))
  end
end
for name in pairs(removed) do
  local looksLikeMember = name:match("^%u") and name:match("%l") and not name:match("%.")
  if looksLikeMember and env.LibFurnitureCatalogue.API[name] ~= nil then
    fail(string.format("the header says %s was removed, but it is still on the API", name))
  end
end

-- The landing pad has to stay callable
local landingPad = { Find = "table", GetItemDescription = "string", GetIngredients = "table", GetMats = "string" }
for name, answers in pairs(landingPad) do
  local endpoint = env.FurC[name]
  if type(endpoint) ~= "function" then
    fail(string.format("FurC.%s is %s, and a consumer calling it errors", name, type(endpoint)))
  else
    local ok, answer = pcall(endpoint, 134686, {}, true)
    if not ok then
      fail(string.format("FurC.%s raised: %s", name, tostring(answer)))
    elseif type(answer) ~= answers then
      fail(string.format("FurC.%s answers %s, the old contract missed with %s", name, type(answer), answers))
    elseif answers == "table" and next(answer) ~= nil then
      fail(string.format("FurC.%s answers data, it reads the DB again", name))
    elseif answers == "string" and answer ~= "" then
      fail(string.format("FurC.%s answers text, it reads the DB again", name))
    end
  end
end

-- and the two that only translate an id or a link stay the API's own
for _, name in ipairs({ "GetItemId", "GetItemLink" }) do
  if env.FurC[name] ~= env.LibFurnitureCatalogue.API[name] then
    fail(string.format("FurC.%s is not the API's %s", name, name))
  end
end

if #failures > 0 then
  print("API SURFACE VALIDATION FAILED:")
  table.sort(failures)
  for _, message in ipairs(failures) do
    print("  " .. message)
  end
  os.exit(1)
end

local count = 0
for _ in pairs(env.LibFurnitureCatalogue.API) do
  count = count + 1
end
print(string.format("  ok: %d public members, all named in the header", count))
