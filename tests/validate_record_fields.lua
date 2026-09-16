-- Static record-field validator for LibFurnitureCatalogue:
--   * a field has exactly one shape across every row of every data file
--   * every row field is one somebody declared, so a typo is not silently dropped
--   * no field has a plural twin
-- Called by run_static.sh

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

local failures = {}
local function fail(message)
  failures[#failures + 1] = message
end

-- Fields that may take more than one shape
local MULTI_SHAPE = {
  -- a string id, a literal, a tagged part, or a list of any of those
  note = true,
}

-- A row field the published record does not carry, and what reads it
local DATA_ONLY = {
  contents = "the item ids a container unpacks into",
  currency = "the currency `itemPrice` is paid in",
  itemDate = "the luxury furnisher's last-seen date, published as availability.lastSeen",
  itemPrice = "the price, published as cost.amount",
  pack = "one furnishing pack, published as the `packs` list",
  source = "the source type of a row that states its own",
  version = "the game version of a row that states its own",
}

-- `location` beside `locations` is the plural twin the convention forbids (if both exist, the list wins)
local PLURAL_TWINS = {
  location = "locations",
}

local function readFile(path)
  local handle = io.open(path, "r")
  if not handle then
    return nil
  end
  local text = handle:read("*a")
  handle:close()
  return text
end

-- The published fields, from the annotation block that defines them
local apiText = assert(readFile(root .. "/Api.lua"), "cannot read Api.lua")
local originBlock = apiText:match("---@class LFCSourceOrigin(.-)\n[^-]") or ""
local declared = {}
for field in originBlock:gmatch("---@field%s+([%a_][%w_]*)") do
  declared[field] = "published"
end
assert(next(declared), "no ---@field entries found for LFCSourceOrigin")
for field, reason in pairs(DATA_ONLY) do
  declared[field] = reason
end

-- Load the library's vocabulary and its data files into one sandbox
local env = makeSandbox()
local function run(rel)
  local chunk, err = loadfile(root .. "/" .. rel)
  if not chunk then
    return nil, err
  end
  setfenv(chunk, env)
  local ok, problem = pcall(chunk)
  return ok, problem
end

for _, rel in ipairs({ "Constants.lua", "Format.lua" }) do
  local ok, err = run(rel)
  assert(ok, "cannot load " .. rel .. ": " .. tostring(err))
end

-- Whatever FurC holds before the data files is not data
local notData = {}
for key in pairs(env.FurC) do
  notData[key] = true
end

local manifest = assert(readFile(root .. "/LibFurnitureCatalogue.txt"), "cannot read the manifest")
local dataFiles = {}
for line in manifest:gmatch("[^\r\n]+") do
  local rel = line:match("^%s*(data[\\/][%w_]+%.lua)%s*$")
  if rel then
    dataFiles[#dataFiles + 1] = rel:gsub("\\", "/")
  end
end
assert(#dataFiles > 0, "no data files listed in the manifest")

for _, rel in ipairs(dataFiles) do
  local ok, err = run(rel)
  if not ok then
    fail(rel .. " does not load: " .. tostring(err))
  end
end

---How a value is written
---@param value any
---@return string
local function shapeOf(value)
  if type(value) ~= "table" then
    return type(value)
  end
  if value[1] ~= nil then
    return "list[" .. shapeOf(value[1]) .. "]"
  end
  -- an empty table is the empty-list sentinel
  if next(value) == nil then
    return "list[]"
  end
  return "record{" .. tostring(next(value)) .. "}"
end

---The shapes a field takes, with the empty list folded into the list (`houses = {}` results in "houses)
---@param by table<string, integer>
---@return string[] shapes
local function shapesOf(by)
  local shapes, lists = {}, 0
  for shape in pairs(by) do
    if shape:find("^list%[") and shape ~= "list[]" then
      lists = lists + 1
    end
  end
  for shape in pairs(by) do
    if not (shape == "list[]" and lists > 0) then
      shapes[#shapes + 1] = shape
    end
  end
  table.sort(shapes)
  return shapes
end

local shapes, rows = {}, 0
local seen = {}

local function walk(value, depth)
  if depth > 8 or seen[value] then
    return
  end
  seen[value] = true
  local isRow = false
  for key, entry in pairs(value) do
    if type(key) == "string" and key:match("^[%a_][%w_]*$") then
      isRow = true
      shapes[key] = shapes[key] or {}
      local shape = shapeOf(entry)
      shapes[key][shape] = (shapes[key][shape] or 0) + 1
    end
    -- a note is a tagged value rather than a row, so its parts are not row fields
    if type(entry) == "table" and key ~= "note" then
      walk(entry, depth + 1)
    end
  end
  if isRow then
    rows = rows + 1
  end
end

local tables = 0
for name, value in pairs(env.FurC) do
  if type(value) == "table" and not notData[name] then
    tables = tables + 1
    walk(value, 0)
  end
end
if tables == 0 then
  fail("no data tables were loaded, so this check inspected nothing")
end

local fields = {}
for field in pairs(shapes) do
  fields[#fields + 1] = field
end
table.sort(fields)

local multiShaped = 0
for _, field in ipairs(fields) do
  local taken = shapesOf(shapes[field])
  local written, count = {}, #taken
  for _, shape in ipairs(taken) do
    written[#written + 1] = string.format("%s=%d", shape, shapes[field][shape])
  end

  if count > 1 then
    multiShaped = multiShaped + 1
    if not MULTI_SHAPE[field] then
      fail(
        string.format(
          "`%s` is written %d different ways (%s) - a field takes one shape on every row, or it is named in MULTI_SHAPE with the reason",
          field,
          count,
          table.concat(written, " ")
        )
      )
    end
  end

  if not declared[field] then
    fail(
      string.format(
        "`%s` (%s) is on no declared field list, so the library reads nothing from it and the value is dropped on load",
        field,
        table.concat(written, " ")
      )
    )
  end

  local plural = PLURAL_TWINS[field]
  if shapes[field .. "s"] and not plural then
    fail(
      string.format("`%s` has the plural twin `%ss`, which is the convention this check exists to stop", field, field)
    )
  end
end

for field, reason in pairs(DATA_ONLY) do
  if not shapes[field] then
    fail(string.format("`%s` is declared as a row field (%s) and no row carries one", field, reason))
  end
end

if #failures > 0 then
  print("RECORD FIELD VALIDATION FAILED:")
  table.sort(failures)
  for _, message in ipairs(failures) do
    print("  " .. message)
  end
  os.exit(1)
end
print(
  string.format(
    "  ok: %d fields over %d rows in %d data tables, %d of them multi-shaped by exception",
    #fields,
    rows,
    tables,
    multiShaped
  )
)
