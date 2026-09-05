-- Compatibility for other AddOns.
-- TODO: delete with next major FC update
-- documenting in case we have to use it a bit longer

local LFC = LibFurnitureCatalogue

local this = {}
LFC.Internal.Compat = this

local src = LFC.Internal.Constants.ItemSources

--- Old, coarse, source types
this.SOURCE_PARENT = {
  [src.DUNGEON] = src.DROP,
  [src.HARVEST] = src.DROP,
  [src.CHEST] = src.DROP,
  [src.QUEST] = src.DROP,
  [src.PICKPOCKET] = src.JUSTICE,
  [src.CONTAINER] = src.JUSTICE,
}

local SOURCE_PARENT = this.SOURCE_PARENT

---Add source each fine-grained value was split from (mostly for tests)
---@param sources table<integer, boolean> mutated in place
---@param injected table<integer, boolean> records what was added here
function this.CloseOverAncestors(sources, injected)
  for s in pairs(sources) do
    local parent = SOURCE_PARENT[s]
    if parent and not sources[parent] then
      injected[parent] = true
    end
  end
  for parent in pairs(injected) do
    sources[parent] = true
  end
end

---Mirror each fine-grained source's rows for AddOns reading data tables directly.. ha, they won't even notice!
---@param dataFile table [version][source][itemId]
---@param mirrorRegistry table bucket -> true, or a set of the item ids already scanned
function this.MirrorAncestorBuckets(dataFile, mirrorRegistry)
  for _, versionData in pairs(dataFile) do
    local pending = {}
    for source, items in pairs(versionData) do
      local parent = SOURCE_PARENT[source]
      if parent then
        local target = pending[parent] or {}
        pending[parent] = target
        for itemId, entry in pairs(items) do
          target[itemId] = entry
        end
      end
    end

    for parent, added in pairs(pending) do
      local existing = versionData[parent]
      local merged, covered = {}, true
      if existing then
        local prior = mirrorRegistry[existing]
        covered = {}
        for itemId, entry in pairs(existing) do
          merged[itemId] = entry
          if prior == true or (prior and prior[itemId]) then
            covered[itemId] = true
          end
        end
      end
      for itemId, entry in pairs(added) do
        merged[itemId] = entry
        if covered ~= true then
          covered[itemId] = true
        end
      end
      versionData[parent] = merged
      mirrorRegistry[merged] = covered
    end
  end
end
