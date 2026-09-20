-- Static validator for the source model:
--   * every source type says where its data lives
--   * it says it in one of the known ways: a reader, the misc files, unmodelled, filter-only
--   * nothing is declared for a source type that does not exist
-- Called by run_static.sh

local here = ((arg and arg[0]) or ""):match("^(.*[/\\])") or ""
local makeSandbox = dofile(here .. "eso_sandbox.lua")

local root = (arg and arg[1]) or "../LibFurnitureCatalogue"

-- The read path, in manifest order
local FILES = { "LibFurnitureCatalogue.lua", "Constants.lua", "Format.lua", "Build.lua", "Query.lua" }

local env = makeSandbox()
for _, name in ipairs(FILES) do
  local path = root .. "/" .. name
  local chunk, err = loadfile(path)
  assert(chunk, "cannot load " .. path .. ": " .. tostring(err))
  setfenv(chunk, env)
  chunk()
end

local internal = env.LibFurnitureCatalogue.Internal
local sources = internal.Constants.ItemSources
local names = internal.Constants.SourceNames
local model = internal.Query.SourceModel
local kinds = internal.Query.SourceModelKinds
assert(type(model) == "table", "Query exports no SourceModel")
assert(type(kinds) == "table" and next(kinds), "Query exports no SourceModelKinds")

local failures = {}
local function fail(message)
  failures[#failures + 1] = message
end

local isKind, counts = {}, { reader = 0 }
for _, kind in pairs(kinds) do
  isKind[kind] = true
  counts[kind] = 0
end

local declaredFor = {}
for _, id in pairs(sources) do
  declaredFor[id] = true
end

local ordered = {}
for name, id in pairs(sources) do
  ordered[#ordered + 1] = { name = name, id = id }
end
table.sort(ordered, function(a, b)
  return a.id < b.id
end)

for _, source in ipairs(ordered) do
  local declaration = model[source.id]
  if declaration == nil then
    fail(
      string.format(
        "%s (%d) is not in SOURCE_MODEL: say which reader fills it, or that it is misc-shaped, unmodelled or filter-only",
        source.name,
        source.id
      )
    )
  elseif type(declaration) == "function" then
    counts.reader = counts.reader + 1
  elseif isKind[declaration] then
    counts[declaration] = counts[declaration] + 1
  else
    fail(
      string.format(
        "%s (%d) is declared as %q, which is not a known kind",
        source.name,
        source.id,
        tostring(declaration)
      )
    )
  end
end

for id in pairs(model) do
  if not declaredFor[id] then
    fail(
      string.format(
        "SOURCE_MODEL declares %s (%s), which is not a value in Constants.ItemSources",
        tostring(names and names[id] or "?"),
        tostring(id)
      )
    )
  end
end

-- constants carry their own list of enum values that are not item sources, those and the declarations mustn't drift apart
for id in pairs(internal.Constants.NotASource or {}) do
  if model[id] ~= kinds.FILTER then
    fail(
      string.format(
        "%s (%s) is in Constants.NotASource but SOURCE_MODEL declares it %s",
        tostring(names and names[id] or "?"),
        tostring(id),
        tostring(model[id])
      )
    )
  end
end

if #failures > 0 then
  for _, message in ipairs(failures) do
    print("  FAIL: " .. message)
  end
  print(string.format("  %d source model problem(s)", #failures))
  os.exit(1)
end

local summary = {}
for kind, n in pairs(counts) do
  summary[#summary + 1] = string.format("%d %s", n, kind)
end
table.sort(summary)
print(string.format("  ok: %d source types, %s", #ordered, table.concat(summary, ", ")))
