-- Public API: LibFurnitureCatalogue.API
--
-- Start here. The whole surface is on the API table from load; OnReady tells you when the DB behind it is populated:
--
--   local LFC = LibFurnitureCatalogue.API
--   LFC.OnReady(function()
--     myAddon:BuildWhateverNeedsTheDB()
--   end)
--
-- One OnReady is enough: wrap the first use so you don't query an empty DB, then reach LFC from anywhere
--
-- Returns:
-- Every call hands out a fresh copy, yours to keep and to mutate. State and Events are the exceptions: one shared table each, read-only
-- Mostly ids. Resolve them with GetZoneNameById, GetString, etc.
-- Numeric source and version values shift between releases, so if you need to persist references in your addon, use the string keys / enums
--
-- Shapes:
--  a list is 1..n (order means nothing unless the endpoint says otherwise)
--  a set is [id] = true
--  a map names its own key
--
-- [FC] markers show what FurnitureCatalogue itself uses internally
--
-- Lifecycle
--   State                 the values GetState returns
--   Events           [FC] event names RegisterCallback takes
--   RegisterCallback [FC] subscribe to an event
--   UnregisterCallback    drop such a subscription
--   OnReady               run one callback once the DB is complete
--   IsReady               ask instead of waiting: can I query yet, yes or no
--   GetState              which of the four states, and why it failed if it did
--   GetDBRevision    [FC] opaque change counter, compare for equality to invalidate caches
--   GetVersion            library's AddOnVersion
--
-- Item identity - pure link/id conversion, no DB, works before OnReady
--   GetItemId        [FC] link or id -> id, nil when it's neither
--   GetItemLink      [FC] id or link -> link, empty str when it's neither
--
-- One item
--   Has                   is this item in the DB
--   GetEntry              record copy. Promised: sources, origin, version, blueprint. Also carries cached game ids, unwarranted
--   GetSourceDetails      one record per source, ranked, with cost and availability (the structured and slow answer)
--   GetIngredients        what a craftable item is made of (empty table if not craftable)
--
-- The whole DB
--   GetItemIds            every item id, in no useful order
--   GetEntryCount         just asks how many, without building that list
--
-- Vocabularies - so nobody transcribes an enum
--   GetSourceTypes   [FC] source key -> id, for comparing
--   GetSourceTypeInfo     id -> stable key and English label, for exporting
--   GetDataVersions       update key -> id, for comparing
--   GetDataVersionKeys    id -> the one canonical update key (LATEST is an alias and does not come back out)
--   GetFurnitureCategories  the client's furnishing category ids, names, parents and display order
--
-- Deprecated - we'll call the guards if you keep using those
--   GetItemDescription [FC] rendered source text (moves to FC). Use GetSourceDetails instead
--   GetMiscItemPrice      a price extracted back out of formatted string. Use GetSourceDetails
--   FurC.Find        [FC] mutable internal row, and {} on a miss, where GetEntry copies and returns nil. Not the same call, so switching to GetEntry is not a rename
--   FurC.GetItemId        flat alias
--   FurC.GetItemLink      flat alias
--   FurC.GetIngredients   flat alias
--   FurC.GetItemDescription [FC]  flat alias
--   FurC.GetMats     [FC] renders the ingredient list as a string. No namespaced
--                         twin, so moving off it means calling GetIngredients
--                         and formatting the map yourself, not just re-spelling
--   FURC_* globals        source and version enums under their old names in Constants.lua. Use GetSourceTypes and GetDataVersions
--
-- Not public: everything under LibFurnitureCatalogue.Internal

local LFC = LibFurnitureCatalogue
local api = LFC.API
local internal = LFC.Internal
local lifecycle = internal.Lifecycle
local state = lifecycle.State

local fmt, query = internal.Format, internal.Query
local getItemId, getItemLink = fmt.GetItemId, fmt.GetItemLink
local find, getSourceRecords = query.Find, query.GetSourceRecords
local getIngredients, getItemDescription = query.GetIngredients, query.GetItemDescription
local getMiscItemPrice = query.GetMiscItemPrice
local ensureDB = internal.Build.EnsureDB

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------

---The values GetState returns
---Read-only: every AddOn gets this same table, so a write to it hits all of them
---@type table<string, LFCDBState>
api.State = {
  UNINITIALIZED = state.UNINITIALIZED,
  BUILDING = state.BUILDING,
  READY = state.READY,
  FAILED = state.FAILED,
}

---Event names RegisterCallback takes
---Read-only: every AddOn gets this same table, so a write to it hits all of them
---Copied from Constants.lua, which declares it because of load order
---@type table<string, string>
api.Events = ZO_ShallowTableCopy(internal.Constants.ApiEvents)

-- Built from the internal table. An AddOn writing to the public copy must not be able to teach RegisterCallback a new event
local knownEvents = {}
for _, eventName in pairs(internal.Constants.ApiEvents) do
  knownEvents[eventName] = true
end

--  ================================================
-- // START: INTERNAL HELPERS, NOT PART OF THE API //
--  ================================================
--
-- The callback registry, plus the two publishers Build.lua fires when a build finishes or fails. In LFC.Internal, not in API table

local function logCallbackError(eventName, err)
  local ok, logger = pcall(internal.GetLogger)
  if ok then
    pcall(logger.Error, logger, "Public callback %s failed: %s", eventName, tostring(err))
  end
end

local function invokeCallback(eventName, callback, callbackArg, ...)
  local ok, err
  if callbackArg ~= nil then
    ok, err = pcall(callback, callbackArg, ...)
  else
    ok, err = pcall(callback, ...)
  end
  if not ok then
    logCallbackError(eventName, err)
  end
end

local function callbackRegistry(eventName)
  if not knownEvents[eventName] then
    return nil
  end
  local registry = lifecycle.callbacks[eventName]
  if not registry then
    registry = {}
    lifecycle.callbacks[eventName] = registry
  end
  return registry
end

local function findRegistration(registry, callback, arg)
  for index, registration in ipairs(registry) do
    if registration.callback == callback and registration.arg == arg then
      return index
    end
  end
end

---INTERNAL: Fire one public event
---@param eventName string
---@param ... any the event's payload, passed straight to each callback
function internal.PublishEvent(eventName, ...)
  local registry = lifecycle.callbacks[eventName]
  if not registry then
    return
  end
  -- Snapshot registrations so callbacks may safely unregister while firing
  local snapshot = {}
  for index, registration in ipairs(registry) do
    snapshot[index] = registration
  end
  for _, registration in ipairs(snapshot) do
    invokeCallback(eventName, registration.callback, registration.arg, ...)
  end
end

---Drain the one-shot OnReady queue. Persistent listeners get SCAN_COMPLETE, published by Build.lua right after this
---@param revision integer
function internal.PublishReady(revision)
  local waiters = lifecycle.readyWaiters
  lifecycle.readyWaiters = {}
  for callback in pairs(waiters) do
    invokeCallback("OnReady", callback, nil, revision)
  end
end

--  ==============================================
-- // END: INTERNAL HELPERS, NOT PART OF THE API //
--  ==============================================

---Register a persistent lifecycle callback
---The callback receives the event's payload and nothing else:
---   `()`: SCAN_STARTED
---   `(revision)`: SCAN_COMPLETE
---   `(errorString)`: SCAN_FAILED
---SCAN_COMPLETE fires after every successful build, the first one included. For a one-shot, use OnReady
---@param eventName string one of LibFurnitureCatalogue.API.Events
---@param callback function
---@param arg? any prepended to the payload, so the callback sees `(arg, ...)`
---@return boolean registered
---```lua
---local LFC = LibFurnitureCatalogue.API
---
---local function onScanComplete(revision) end
---LFC.RegisterCallback(LFC.Events.SCAN_COMPLETE, onScanComplete) --> true
---
----- arg comes first, the payload follows it
---local function onScanCompleteFor(self, revision) self:Rebuild(revision) end
---LFC.RegisterCallback(LFC.Events.SCAN_COMPLETE, onScanCompleteFor, myAddon) --> true
---```
function api.RegisterCallback(eventName, callback, arg)
  local registry = callbackRegistry(eventName)
  if not registry or type(callback) ~= "function" then
    return false
  end
  if not findRegistration(registry, callback, arg) then
    registry[#registry + 1] = { callback = callback, arg = arg }
  end
  return true
end

---Unregister a persistent lifecycle callback
---Matches on the pair it was registered with, so pass the same `arg` again.
---@param eventName string one of API.Events
---@param callback function
---@param arg? any optional argument used during registration
---@return boolean removed
---```lua
---LFC.UnregisterCallback(LFC.Events.SCAN_COMPLETE, onScanComplete) --> true
---LFC.UnregisterCallback(LFC.Events.SCAN_COMPLETE, onScanComplete) --> false, already gone
---```
function api.UnregisterCallback(eventName, callback, arg)
  local registry = callbackRegistry(eventName)
  if not registry or type(callback) ~= "function" then
    return false
  end
  local index = findRegistration(registry, callback, arg)
  if not index then
    return false
  end
  table.remove(registry, index)
  return true
end

---Run once after a complete DB snapshot is available
---Calls immediately when already ready, otherwise starts the lazy build and waits.
---For every later rebuild, use RegisterCallback
---@param callback fun(revision: integer)
---@return boolean accepted false when the last build failed, so the callback would never run. Check GetState, or watch SCAN_FAILED
---```lua
---LFC.OnReady(function(revision)
---  d(LFC.GetEntryCount() .. " items at revision " .. revision)
---end) --> true
---```
function api.OnReady(callback)
  if type(callback) ~= "function" then
    return false
  end
  if api.IsReady() then
    invokeCallback("OnReady", callback, nil, internal.DBRevision)
    return true
  end

  if lifecycle.current == state.FAILED then
    return false
  end
  lifecycle.readyWaiters[callback] = true
  if lifecycle.current == state.UNINITIALIZED then
    ensureDB()
  end
  return true
end

---Can the DB be queried right now?
---(does not start a build, `OnReady` does)
---@return boolean ready true while a complete DB snapshot is available
---```lua
---LFC.IsReady() --> true
---```
function api.IsReady()
  return lifecycle.current == state.READY
end

---Current DB lifecycle state and the most recent build error, if any
---@return LFCDBState state
---@return string? error
---```lua
---local state, err = LFC.GetState()
---
---state --> "ready", compare against LFC.State.READY
---err   --> nil, or the build error while state is LFC.State.FAILED
---```
function api.GetState()
  return lifecycle.current, lifecycle.error
end

---Change counter
---Increments once per build or rescan, and once more when a query first completes a blueprint row (mostly useful for cache-invalidation)
---@return integer revision
---```lua
---if LFC.GetDBRevision() ~= myCachedRevision then
---  myCache, myCachedRevision = {}, LFC.GetDBRevision()
---end
---```
function api.GetDBRevision()
  return internal.DBRevision
end

---This library's AddOnVersion
---For a game update version see GetDataVersions, for a DB revision see GetDBRevision
---@return integer libVersion
---```lua
---LFC.GetVersion() --> 10000
---```
function api.GetVersion()
  return LFC.version
end

-- ---------------------------------------------------------------------------
-- Item identity
-- ---------------------------------------------------------------------------

---Resolve an item link or numeric id to a numeric item id
---Number only counts if id is above 9999
---@param itemOrLink string|integer
---@return integer? id nil on empty/invalid
---```lua
---LFC.GetItemId("|H1:item:134686:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0|h|h") --> 134686
---LFC.GetItemId(134686) --> 134686
---```
function api.GetItemId(itemOrLink)
  return getItemId(itemOrLink)
end

---Build item link from id, or pass through an existing link
---@param itemOrLink string|integer
---@return string link empty string on invalid
---```lua
---LFC.GetItemLink(134686) --> "|H1:item:134686:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0|h|h"
---```
function api.GetItemLink(itemOrLink)
  return getItemLink(itemOrLink)
end

-- ---------------------------------------------------------------------------
-- One item
-- ---------------------------------------------------------------------------

---Is this item in the DB
---@param itemOrLink string|integer
---@return boolean found
---```lua
---LFC.Has(134686)   --> true
---LFC.Has(99123456) --> false
---```
function api.Has(itemOrLink)
  return next(find(itemOrLink)) ~= nil
end

---Snapshot of one DB entry
---@param itemOrLink string|integer item link, blueprint link, or itemId
---@return FurCEntry? entry deep copy, nil when the item is not in the DB
---@see LibFurnitureCatalogue.API.GetSourceDetails for vendor, price and version per source
---
---`sources` carries backwards compatibility members.
--- Some sources were split into finer ones and the coarse one is added back so nothing breaks:
---   fine-grained DUNGEON also answers to the coarse DROP. `compatSources` is the subset that exists only for that reason, treat it as deprecated.
--- The real sources are `sources` minus `compatSources`, and those are the ones GetSourceDetails returns a record for
---
---Every call deep-copies the row, so hold the result rather than calling it per frame
---```lua
---local src = LFC.GetSourceTypes()
---local entry = LFC.GetEntry(203600)
---
---entry.origin  --> 6, top-ranked source, see GetSourceTypes
---entry.version --> 32, see GetDataVersions
---
----- sources is a SET of source types, so membership is just 1 lookup
---entry.sources --> { [6] = true, [7] = true, [13] = true }
---entry.sources[src.PVP] --> true
---
---LFC.GetEntry(99123456) --> nil
---```
function api.GetEntry(itemOrLink)
  local entry = find(itemOrLink)
  if nil == next(entry) then
    return nil
  end
  return ZO_DeepTableCopy(entry)
end

---Where one source of an item comes from
---@class LFCSourceOrigin
---@field type integer source type, see GetSourceTypes
---@field vendor integer|nil locale string id, resolve with GetString
---@field location integer|nil game zone id, resolve with GetZoneNameById
---@field place integer|nil locale string id for somewhere the game has no zone for, resolve with GetString
---@field note (integer|string)|nil qualifies location or place. Locale string id or a bare literal
---@field achievement integer|nil achievement id
---@field event integer|nil locale string id, resolve with GetString

---What one source costs. A source taking two currencies is modelled as two sources, not two costs
---@class LFCSourceCost
---@field currency integer ESO currency constant
---@field amount integer

---When one source was current (`lastSeen` is set on luxury furnisher records only)
---@class LFCSourceAvailability
---@field version integer game version, see GetDataVersions
---@field lastSeen string|nil YYYY-MM-DD

---One source of one item: where it comes from, what it costs, when it was current
---@class LFCSourceRecord
---@field source LFCSourceOrigin
---@field cost LFCSourceCost|nil nil when the source has no price
---@field availability LFCSourceAvailability

---Every source of an item, one record per source, ranked best-first (slow)
---
---Resolve at render time. Compare against `SI_FURC_*`
---
---A record normally carries `location` or `place`, not both. Prefer `location` when it has both
---@param itemOrLink string|integer item link, blueprint link, or itemId
---@return LFCSourceRecord[] records empty only when the item is not in the DB. Every stored item has at least one source
---```lua
---local src = LFC.GetSourceTypes()
---
----- 203600 has three: vendor, writ vendor and pvp
---for _, record in ipairs(LFC.GetSourceDetails(203600)) do
---  record.source.type              --> 6, then 13, then 7
---  GetString(record.source.vendor) --> "Faustina Curio" on the writ vendor one
---  record.availability.version     --> 32, see GetDataVersions
---
---  -- a zone, or place (somewhere the game has no zone for)
---  GetZoneNameById(record.source.location) --> "Wrothgar", nil on the writ vendor one
---  GetString(record.source.place)          --> "in any capital city" on that one
---
---  if record.cost then
---    record.cost.currency --> 12, then 4, then 2
---    record.cost.amount   --> 30000, then 800, then 1000000
---  end
---end
---
----- just checking membership? the entry answers it in one lookup
---LFC.GetEntry(203600).sources[src.CRAFTING] --> true
---```
function api.GetSourceDetails(itemOrLink)
  return getSourceRecords(itemOrLink)
end

---Ingredient list for a recipe
---@param itemOrLink string|integer item link, blueprint link, or itemId. Ignored when recipeArray is given
---@param recipeArray? FurCEntry entry from GetEntry; looked up when omitted
---@return table<string, integer> ingredients map of ingredient link -> quantity
---```lua
---local mats = LFC.GetIngredients(itemId, LFC.GetEntry(itemId))
---
----- keyed by ingredient LINK not by item id (it's what the game gives us)
-- quantity in pairs(mats) do
---  d(quantity .. "x " .. GetItemLinkName(ingredientLink)) --> "6x Rough Oak"
---end
---
----- not craftable gives an empty table, never nil. Test it with next()
---if next(mats) == nil then d("nothing to craft") end
---```
function api.GetIngredients(itemOrLink, recipeArray)
  return getIngredients(itemOrLink, recipeArray)
end

-- ---------------------------------------------------------------------------
-- The whole DB
-- ---------------------------------------------------------------------------

---Snapshot of every item id in the DB
---Built by walking a table, so the order is whatever Lua felt like. Sort it yourself if you need one
---@return integer[] itemIds
---```lua
---#LFC.GetItemIds() --> 8528
---```
function api.GetItemIds()
  local ids = {}
  for id in pairs(internal.DB) do
    -- malformed data files can leave string keys behind, we need numeric
    if type(id) == "number" then
      ids[#ids + 1] = id
    end
  end
  return ids
end

local countRevision, countMemo
---How many items are in the DB, without building the id list
---@return integer count
---```lua
---LFC.GetEntryCount() --> 8528
---```
function api.GetEntryCount()
  if countRevision ~= internal.DBRevision then
    countRevision = internal.DBRevision
    local count = 0
    for id in pairs(internal.DB) do
      -- keep in step with GetItemIds: only numeric keys are real entries
      if type(id) == "number" then
        count = count + 1
      end
    end
    countMemo = count
  end
  return countMemo
end

-- ---------------------------------------------------------------------------
-- Vocabularies
--
-- Two forward/reverse pairs, plus the category tree.
-- Use these constants and never the raw number values (the values can change)
-- ---------------------------------------------------------------------------

---Source key -> id, the forward direction
---@return table<string, integer> sourceTypes
---```lua
---local src = LFC.GetSourceTypes()
---
---src.CROWN --> 9
---src.DROP  --> 14
---```
function api.GetSourceTypes()
  return ZO_ShallowTableCopy(internal.Constants.ItemSources)
end

---Source id -> stable key and English label, the reverse direction of GetSourceTypes
---Build an export or a filter from this instead of transcribing the enum
---@return table<integer, { key: string, label: string }> sourceTypeInfo
---```lua
---local info = LFC.GetSourceTypeInfo()
---
---info[11].key   --> "LUXURY", stable across releases and languages
---info[11].label --> "Luxury Furnisher", always English, for exports and logs
---
----- label is not a UI string, just an untranslated help explaining what the value is (name sources in your own words)
---```
function api.GetSourceTypeInfo()
  local constants = internal.Constants
  local labels = constants.SourceLabels
  local info = {}
  for key, value in pairs(constants.ItemSources) do
    info[value] = { key = key, label = labels[value] or key }
  end
  return info
end

---Update key -> id, the forward direction
---@return table<string, integer> versions
---```lua
---local ver = LFC.GetDataVersions()
---
---ver.HOMESTEAD --> 2
---ver.LATEST    --> 39
---```
function api.GetDataVersions()
  return ZO_ShallowTableCopy(internal.Constants.Versioning)
end

---Update id -> the one canonical key, the reverse direction of GetDataVersions
---LATEST is an alias, so it shares a value with the update it points at and never comes back out
---@return table<integer, string> versionKeys
---```lua
---local versions, keys = LFC.GetDataVersions(), LFC.GetDataVersionKeys()
---
---versions.ALTMER --> 7
---keys[7]         --> "ALTMER"
---
---versions.LATEST       --> 39, the same value as THIEVES
---keys[versions.LATEST] --> "THIEVES", the update, never "LATEST"
---```
function api.GetDataVersionKeys()
  return ZO_ShallowTableCopy(internal.Constants.VersionNames)
end

local categoryMemo
---Game client's furnishing categories and subcategories in one id space
---`name` is the client's localised label, `parent` is 0 for a top-level category,
---and an entry's `furnCategory` of 0 means no category
---
---Read from the client once and kept for the session, so the names are in the language the client was started in
---@return table<integer, { name: string, parent: integer, order: integer }> categories
---```lua
---local categories = LFC.GetFurnitureCategories()
---local entry = LFC.GetEntry(120385)
---
---entry.furnCategory              --> 4
---entry.furnSubcategory           --> 62
---categories[4]                   --> { name = "Library", parent = 0, order = 3 }
---categories[62].parent           --> 4
---
----- right: an id comparison, same answer in every language
---if entry.furnCategory == 4 then end
----- wrong: breaks on a German client
---if categories[entry.furnCategory].name == "Library" then end
---```
function api.GetFurnitureCategories()
  if not categoryMemo then
    local built = {}
    local function add(id, fallbackParent)
      if id and id ~= 0 and not built[id] then
        local name, parent, _, order = GetFurnitureCategoryInfo(id)
        built[id] = { name = name or "", parent = parent or fallbackParent or 0, order = order or 0 }
      end
    end
    for categoryIndex = 1, GetNumFurnitureCategories() do
      local categoryId = GetFurnitureCategoryId(categoryIndex)
      add(categoryId, 0)
      for subcategoryIndex = 1, GetNumFurnitureSubcategories(categoryIndex) do
        add(GetFurnitureSubcategoryId(categoryIndex, subcategoryIndex), categoryId)
      end
    end
    categoryMemo = built
  end

  local copy = {}
  for id, category in pairs(categoryMemo) do
    copy[id] = { name = category.name, parent = category.parent, order = category.order }
  end
  return copy
end

-- ---------------------------------------------------------------------------
-- Deprecated and Bridge helpers
--
-- These exist so AddOns can migrate off old endpoints
-- Each entry names what to use instead
-- We'll call the guards if you keep using those for too long
-- ---------------------------------------------------------------------------

---Human-readable description for a primary source
---Pretty descriptions will move to the main AddOn
---@deprecated Use GetSourceDetails and render the records yourself
---@param recipeKey string|integer item link or id
---@param recipeArray? FurCEntry looked up via GetEntry when omitted
---@param stripColor? boolean strip colour control characters
---@param opts? { dateFormat?: string } render options, for instance luxury date format
---@return string description localised, empty when the item is not in the DB
---```lua
---LFC.GetItemDescription(134686, LFC.GetEntry(134686), true)
----->  "|H1:item:134686:...|h|h 2,000"
---```
function api.GetItemDescription(recipeKey, recipeArray, stripColor, opts)
  return getItemDescription(recipeKey, recipeArray, stripColor, opts)
end

---Temporary compatibility bridge for prices hidden in baked strings
---Goes away once the DB carries prices structurally and GetSourceDetails answers for every source
---@deprecated Use GetSourceDetails, which gives a stable price per source
---@param itemId integer
---@param version integer
---@param source integer source type constant, see GetSourceTypes
---@return integer? currency ESO currency constant
---@return integer? amount
---```lua
---local currency, amount = LFC.GetMiscItemPrice(134686, 6, LFC.GetSourceTypes().CROWN)
---
---currency --> 7, CURT_CROWNS
---amount   --> 2000
---
---LFC.GetMiscItemPrice(99123456, 1, LFC.GetSourceTypes().CROWN) --> nil
---```
function api.GetMiscItemPrice(itemId, version, source)
  return getMiscItemPrice(itemId, version, source)
end

-- Legacy flat aliases for third-party AddOns
-- The deprecated enum globals are in Constants.lua, all marked

---@deprecated Use LibFurnitureCatalogue.API.GetItemId
FurC.GetItemId = api.GetItemId

---@deprecated Use LibFurnitureCatalogue.API.GetItemLink
FurC.GetItemLink = api.GetItemLink

---@deprecated Use LibFurnitureCatalogue.API.GetIngredients
FurC.GetIngredients = api.GetIngredients

---@deprecated Uses the deprecated LibFurnitureCatalogue.API.GetItemDescription, which leaves when it moves to main AddOn
FurC.GetItemDescription = api.GetItemDescription

---@deprecated Use LibFurnitureCatalogue.API.GetEntry. Unlike GetEntry, this
---returns the mutable internal row and an empty table on a miss.
FurC.Find = internal.Query.Find

---@deprecated Use LibFurnitureCatalogue.API.GetIngredients and format the
---ingredient map in the consumer.
FurC.GetMats = internal.Query.GetMats
