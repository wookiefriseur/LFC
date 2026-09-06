-- Static data validator for LibFurnitureCatalogue:
--   * every vocabulary symbol is defined in Constants
-- Called by run_static.sh
--
-- TODO: no duplicate item IDs, each entry matches expected schema.
--       Needs the data files to actually load, which needs the locale files + Format.lua
--       Do it once the rows carry records instead of strings

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

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

for _, rel in ipairs(dataFiles) do
  local text = readFile(root .. "/" .. rel)
  if not text then
    fail(rel .. " is in the manifest but not on disk")
  else
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
