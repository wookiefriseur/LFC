-- Static data validator for LibFurnitureCatalogue:
--   * no duplicate item IDs
--   * each entry matches expected schema
-- Skeleton: fill DATA_FILES + SCHEMA once the data files are extracted here
-- Called by run_static.sh

-- TODO: recipeResult == recipe? just ignore?
--       pain in the ass to statically check, would have to be tracked
--       (unless we need reverse lookup getRecipeFor function if getRecipeResult is too slow)
-- TODO: unsure yet if it should only generated DB
--       or human-readable too (depends on file extension)

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

-- Data files to validate, relative to root
local DATA_FILES = {
  -- "data/Vendor.lua", ...
}

-- Minimal env for data files that need a fake FurC.* table
local function makeSandbox()
  local env = setmetatable({}, { __index = _G })
  env.FurC = { Constants = { Versioning = setmetatable({}, { __index = function() return 0 end }) } }
  return env
end

local seen, dupes = {}, {}
local function recordId(id, where)
  if seen[id] then
    dupes[#dupes + 1] = string.format("duplicate id %s (in %s and %s)", tostring(id), seen[id], where)
  else
    seen[id] = where
  end
end

if #DATA_FILES == 0 then
  print("  ok: no data files yet")
  os.exit(0)
end

for _, rel in ipairs(DATA_FILES) do
  local path = root .. "/" .. rel
  local chunk, err = loadfile(path)
  assert(chunk, "cannot load " .. path .. ": " .. tostring(err))
  setfenv(chunk, makeSandbox())
  chunk()
  -- TODO: check tables, recordId(id, rel), assert schema per entry
end

if #dupes > 0 then
  print("DATA VALIDATION FAILED:")
  for _, m in ipairs(dupes) do print("  " .. m) end
  os.exit(1)
end
print("  ok")
