-- Static data validator for LibFurnitureCatalogue:
--   * every vocabulary symbol is defined in Constants
--   * a de-baked data file stays de-baked
--   * a data file reads no global the library does not provide
-- Called by run_static.sh
--
-- TODO: no duplicate item IDs, each entry matches expected schema.
--       Needs the data files to actually load, which needs the locale files + Format.lua
--       Do it once the rows carry records instead of strings

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"
local luac = (arg and arg[2]) or "luac"

local failures = {}
local function fail(message)
  failures[#failures + 1] = message
end

local function readFile(path)
  local handle = io.open(path, "r")
  if not handle then
    return nil
  end
  local text = handle:read("*a")
  handle:close()
  return text
end

local constantsPath = root .. "/Constants.lua"
local chunk, err = loadfile(constantsPath)
assert(chunk, "cannot load " .. constantsPath .. ": " .. tostring(err))
local env = makeSandbox()
setfenv(chunk, env)
chunk()
local constants = env.LibFurnitureCatalogue.Internal.Constants
assert(type(constants) == "table", "Constants.lua defined no constants table")

-- The manifest is the authority on which data files ship
local manifestPath = root .. "/LibFurnitureCatalogue.txt"
local manifest = readFile(manifestPath)
assert(manifest, "cannot read " .. manifestPath)

local dataFiles = {}
for line in manifest:gmatch("[^\r\n]+") do
  local rel = line:match("^%s*(data[\\/][%w_]+%.lua)%s*$")
  if rel then
    dataFiles[#dataFiles + 1] = rel:gsub("\\", "/")
  end
end
assert(#dataFiles > 0, "no data files listed in " .. manifestPath)

-- Files whose rows are records of ids. These have no business reaching for a formatter and we check for that regression
local DEBAKED = {
  ["data/Books.lua"] = true,
  ["data/MiscItemSources.lua"] = true,
  ["data/RecipeSources.lua"] = true,
}

-- A name a data file never declared is a nil
local KNOWN_GLOBALS = {
  FurC = true,
  LibFurnitureCatalogue = true,
  GetCollectibleName = true,
  GetQuestName = true,
  GetString = true,
  ipairs = true,
  pairs = true,
  string = true,
  table = true,
  type = true,
  zo_strformat = true,
}

---Every global a chunk reads or writes, taken from the bytecode listing
---@param path string
---@return table|nil names, string|nil err
local function globalNames(path)
  local pipe = io.popen('"' .. luac .. '" -p -l "' .. path .. '" 2>&1')
  if not pipe then
    return nil, "cannot run " .. luac
  end
  local listing = pipe:read("*a")
  pipe:close()
  if listing == "" then
    return nil, "no bytecode listing for " .. path
  end
  local names = {}
  -- 5.1 lists `GETGLOBAL 0 -1 ; name`, 5.2+ lists `GETTABUP 0 0 -1 ; _ENV "name"`
  for name in listing:gmatch("[GS]ETGLOBAL[^;\n]*;%s+([%a_][%w_]*)") do
    names[name] = true
  end
  for name in listing:gmatch('_ENV%s+"([%a_][%w_]*)"') do
    names[name] = true
  end
  return names
end

for _, rel in ipairs(dataFiles) do
  local text = readFile(root .. "/" .. rel)
  if not text then
    fail(rel .. " is in the manifest but not on disk")
  else
    if DEBAKED[rel] and text:find("Internal%.Format") then
      fail(rel .. " is de-baked but uses Internal.Format, so it renders at load again")
    end

    local globals, err = globalNames(root .. "/" .. rel)
    if not globals then
      fail(rel .. ": " .. err)
    else
      local undeclared = {}
      for name in pairs(globals) do
        if
          not KNOWN_GLOBALS[name]
          and not name:find("^SI_")
          and not name:find("^CURT_")
          and not name:find("^FURC_")
        then
          undeclared[#undeclared + 1] = name
        end
      end
      table.sort(undeclared)
      for _, name in ipairs(undeclared) do
        fail(string.format("%s: reads the global `%s`, which is nil - a missing local, so its rows vanish", rel, name))
      end
    end
    -- local <alias> = LFC.Internal.Constants.<Vocabulary>
    local aliases = {}
    for alias, vocabulary in text:gmatch("local%s+([%a_][%w_]*)%s*=%s*[%w_%.]-Constants%.([%a_][%w_]*)") do
      if type(constants[vocabulary]) == "table" then
        aliases[alias] = vocabulary
      else
        fail(string.format("%s: Constants.%s does not exist", rel, vocabulary))
      end
    end

    for alias, vocabulary in pairs(aliases) do
      local seen = {}
      for key in text:gmatch(alias .. "%.([%a_][%w_]*)") do
        if not seen[key] then
          seen[key] = true
          if constants[vocabulary][key] == nil then
            fail(string.format("%s: %s.%s is not defined in Constants.%s", rel, alias, key, vocabulary))
          end
        end
      end
    end
  end
end

if #failures > 0 then
  print("DATA VALIDATION FAILED:")
  table.sort(failures)
  for _, message in ipairs(failures) do
    print("  " .. message)
  end
  os.exit(1)
end
print(string.format("  ok: %d data files", #dataFiles))
