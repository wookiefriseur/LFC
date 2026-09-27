local root = assert(arg[1])
local env = setmetatable({
  CURT_MONEY = 1,
  CURT_ALLIANCE_POINTS = 2,
  CURT_TELVAR_STONES = 3,
  CURT_WRIT_VOUCHERS = 4,
  CURT_CROWN_GEMS = 6,
  CURT_CROWNS = 7,
  CURT_TRADE_BARS = 9,
  CURT_UNDAUNTED_KEYS = 10,
  CURT_ENDEAVOR_SEALS = 11,
  CURT_ARCHIVAL_FORTUNES = 12,
}, {
  __index = function(_, key)
    if key:match("^CURT_") then
      error("unsupported currency constant: " .. key)
    end
    return _G[key]
  end,
})
local function copy(value)
  if type(value) ~= "table" then
    return value
  end
  local result = {}
  for key, item in pairs(value) do
    result[key] = copy(item)
  end
  return result
end
env.ZO_DeepTableCopy = copy
env.LibFurnitureCatalogue = { Internal = { Constants = { ItemSources = { DROP = 14 }, SOURCE_PRIORITY = {} } } }
local expected = {
  GOLD = 1,
  AP = 2,
  TEL_VAR = 3,
  WRIT_VOUCHERS = 4,
  EVENT_TICKETS = 9,
  CROWNS = 7,
  CROWN_GEMS = 6,
  TRADE_BARS = 9,
  UNDAUNTED_KEYS = 10,
  SEALS = 11,
  ARCHIVAL_FORTUNES = 12,
}
local symbols, items = {}, {}
local count = 0
for name in pairs(expected) do
  count = count + 1
  symbols[count] = name
  items[count] = { 1, 2, 0, { 1, 2, { { count, 25 } } } }
end
env.LFCGeneratedConstants =
  { sourceFields = {}, sourceVocabularies = {}, symbols = { source_types = { "drop" }, currencies = symbols } }
env.LFCGeneratedDatabase = { items = items }
local chunk = assert(loadfile(root .. "/LibFurnitureCatalogue/Generated.lua"))
setfenv(chunk, env)
chunk()
for id, name in ipairs(symbols) do
  local record = env.LibFurnitureCatalogue.Internal.Generated.Records(id)[1]
  assert(record.cost.currency == expected[name], name)
end
