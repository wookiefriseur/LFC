-- Static locale validator for LibFurnitureCatalogue:
--   * every SI_FURC_ string id a shipped file reads is declared in locale/en.lua,
--     so a renamed constant fails here instead of rendering as a blank in a tooltip
--   * every string en.lua declares is read by a shipped file
--   * a translation declares exactly the keys the master declares
-- Called by run_static.sh

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")
local globalNames = dofile(here .. "lua_globals.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"
local luac = (arg and arg[2]) or "luac"

-- ESO's `$(language)` in the manifest, so the set of translations is read from disk
local LANGUAGES = { "en", "de", "es", "fr", "it", "jp", "pl", "ru", "th", "tr", "zh" }

-- Strings no shipped file reads, and the reason each is still declared here
local UNREAD = {
  SI_FURC_ACHIEVEMENT_UNKNOWN = "consumer renders it",
  SI_FURC_EVENT = "consumer renders it",
  SI_FURC_GRAMMAR_CONJ_OR = "consumer renders it",
  SI_FURC_GRAMMAR_PREP_LOC_DEFAULT = "consumer renders it",
  SI_FURC_GRAMMAR_PREP_SRC_DEFAULT = "consumer renders it",
  SI_FURC_HOUSE = "consumer renders it",
  SI_FURC_HOUSE_MORE = "consumer renders it",
  SI_FURC_PART_OF = "consumer renders it",
  SI_FURC_RANK = "consumer renders it",
  SI_FURC_REQUIRES_ACHIEVEMENT = "consumer renders it",
  SI_FURC_SRC_COLLECTIBLE = "consumer renders it",
  SI_FURC_SRC_EDITOR = "consumer renders it",
  SI_FURC_SRC_EDITOR_TAG = "consumer renders it",
  SI_FURC_SRC_ITEMBUNDLE = "consumer renders it",
  SI_FURC_SRC_ITEMPACK = "consumer renders it",
  SI_FURC_SRC_RUMOUR_RECIPE = "consumer renders it",
  SI_FURC_SRC_SCAMBOX = "consumer renders it",
  SI_FURC_SRC_TOMESPACK = "consumer renders it",
  SI_FURC_STRING_WEEKEND_AROUND = "consumer renders it",
  SI_FURC_CHAT_NO_MATS = "last read by a released consumer",
  SI_FURC_STRING_REWARD_FOR = "last read by a released consumer",
}

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

---The table a locale file hands to RegisterStrings
---@param rel string path under the library root
---@return table|nil strings
local function loadStrings(rel)
  local chunk = loadfile(root .. "/" .. rel)
  if not chunk then
    return nil
  end
  local captured
  local env = makeSandbox()
  env.LibFurnitureCatalogue.Internal.RegisterStrings = function(strings)
    captured = strings
  end
  setfenv(chunk, env)
  chunk()
  return captured
end

local master = loadStrings("locale/en.lua")
assert(type(master) == "table", "locale/en.lua registered no strings")

-- The manifest is the authority on which files ship
local manifestPath = root .. "/LibFurnitureCatalogue.txt"
local manifest = assert(readFile(manifestPath), "cannot read " .. manifestPath)

local shipped = {}
for line in manifest:gmatch("[^\r\n]+") do
  local rel = line:match("^%s*([%w_\\/]+%.lua)%s*$")
  if rel then
    rel = rel:gsub("\\", "/")
    -- locale files declare the strings, they do not read them
    if not rel:find("^locale/") then
      shipped[#shipped + 1] = rel
    end
  end
end
assert(#shipped > 0, "no library files listed in " .. manifestPath)

local referenced, clientOwned = {}, {}
for _, rel in ipairs(shipped) do
  local globals, err = globalNames(root .. "/" .. rel, luac)
  if not globals then
    fail(rel .. ": " .. err)
  else
    for name in pairs(globals) do
      if name:find("^SI_FURC_") then
        referenced[name] = referenced[name] or rel
      elseif name:find("^SI_") then
        clientOwned[name] = true
      end
    end
  end
  -- Constants keeps the client's social class ids as names rather than as globals
  local text = readFile(root .. "/" .. rel) or ""
  for name in text:gmatch('"(SI_[%u%d_]+)"') do
    if not name:find("^SI_FURC_") then
      clientOwned[name] = true
    end
  end
end

for name, rel in pairs(referenced) do
  if master[name] == nil then
    fail(string.format("%s reads %s, which locale/en.lua does not declare", rel, name))
  end
end

local unread = 0
for name in pairs(master) do
  if referenced[name] == nil then
    unread = unread + 1
    if UNREAD[name] == nil then
      fail(
        string.format(
          "locale/en.lua declares %s, which no shipped file reads - delete it, or name it in UNREAD with its reason",
          name
        )
      )
    end
  end
end

for name, reason in pairs(UNREAD) do
  if master[name] == nil then
    fail(string.format("%s is named in UNREAD (%s) but locale/en.lua no longer declares it", name, reason))
  elseif referenced[name] then
    fail(string.format("%s is named in UNREAD (%s) but %s reads it now", name, reason, referenced[name]))
  end
end

local translations = {}
for _, language in ipairs(LANGUAGES) do
  local rel = "locale/" .. language .. ".lua"
  if language ~= "en" and readFile(root .. "/" .. rel) then
    local strings = loadStrings(rel)
    if type(strings) ~= "table" then
      fail(rel .. " registered no strings")
    else
      local missing = 0
      for name in pairs(master) do
        if strings[name] == nil then
          missing = missing + 1
        end
      end
      for name in pairs(strings) do
        if master[name] == nil then
          fail(string.format("%s declares %s, which locale/en.lua does not - nothing reads it", rel, name))
        end
      end
      translations[#translations + 1] = string.format("%s -%d", language, missing)
    end
  end
end

if #failures > 0 then
  print("LOCALE VALIDATION FAILED:")
  table.sort(failures)
  for _, message in ipairs(failures) do
    print("  " .. message)
  end
  os.exit(1)
end

local declared, clientCount = 0, 0
for _ in pairs(master) do
  declared = declared + 1
end
for _ in pairs(clientOwned) do
  clientCount = clientCount + 1
end
table.sort(translations)
print(
  string.format(
    "  ok: %d strings over %d shipped files, %d of them for consumers only; %d client-owned ids unchecked; translations %s",
    declared,
    #shipped,
    unread,
    clientCount,
    table.concat(translations, " ")
  )
)
