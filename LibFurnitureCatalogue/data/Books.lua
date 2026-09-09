-- Book containers: buying container item unpacks into individual book furnishings
--
-- A collection is shorthand helper, not the stored data shape: `location` a ZoneIds value, `place` a PlaceIds value, `itemPrice` with its `currency`, and the `contents` it unpacks into.
-- The loop at the end expands it into one row per book, `Query.GetMiscItemSource` renders the "part of <container>" line on demand
FurC.BookCollections = FurC.BookCollections or {}

local LFC = LibFurnitureCatalogue
local bc = LFC.Internal.Constants.BookContainers
local places = LFC.Internal.Constants.PlaceIds
local src = LFC.Internal.Constants.ItemSources
local ver = LFC.Internal.Constants.Versioning
local zones = LFC.Internal.Constants.ZoneIds

FurC.BookCollections[bc.TEMPLE_DOCTRINE] = { -- Temple Doctrine: The 36 Lessons
  version = ver.MORROWIND,
  location = zones.VVARDENFELL,
  itemPrice = 130000,
  currency = CURT_MONEY,
  contents = {
    126793, -- The 36 Lessons: Sermon 1
    -- 126794 Sermon 37/36 is sold separately, same trader
    126795, -- The 36 Lessons: Sermon 2
    126796, -- The 36 Lessons: Sermon 3
    126797, -- The 36 Lessons: Sermon 4
    126798, -- The 36 Lessons: Sermon 5
    126799, -- The 36 Lessons: Sermon 6
    126800, -- The 36 Lessons: Sermon 7
    126801, -- The 36 Lessons: Sermon 8
    126802, -- The 36 Lessons: Sermon 9
    126803, -- The 36 Lessons: Sermon 10
    126804, -- The 36 Lessons: Sermon 11
    126805, -- The 36 Lessons: Sermon 12
    126806, -- The 36 Lessons: Sermon 13
    126807, -- The 36 Lessons: Sermon 14
    126808, -- The 36 Lessons: Sermon 15
    126809, -- The 36 Lessons: Sermon 16
    126810, -- The 36 Lessons: Sermon 17
    126811, -- The 36 Lessons: Sermon 18
    126812, -- The 36 Lessons: Sermon 19
    126813, -- The 36 Lessons: Sermon 20
    126814, -- The 36 Lessons: Sermon 21
    126815, -- The 36 Lessons: Sermon 22
    126816, -- The 36 Lessons: Sermon 23
    126817, -- The 36 Lessons: Sermon 24
    126818, -- The 36 Lessons: Sermon 25
    126819, -- The 36 Lessons: Sermon 26
    126820, -- The 36 Lessons: Sermon 27
    126821, -- The 36 Lessons: Sermon 28
    126822, -- The 36 Lessons: Sermon 29
    126823, -- The 36 Lessons: Sermon 30
    126824, -- The 36 Lessons: Sermon 31
    126825, -- The 36 Lessons: Sermon 32
    126826, -- The 36 Lessons: Sermon 33
    126827, -- The 36 Lessons: Sermon 34
    126828, -- The 36 Lessons: Sermon 35
    126829, -- The 36 Lessons: Sermon 36
  },
}

FurC.BookCollections[bc.TRUTH_IN_SEQUENCE] = { -- The Truth in Sequence
  version = ver.CLOCKWORK,
  location = zones.CWC,
  itemPrice = 20000,
  currency = CURT_MONEY,
  contents = {
    134548, -- The Truth in Sequence: Volume 1
    134549, -- The Truth in Sequence: Volume 2
    134550, -- The Truth in Sequence: Volume 3
    134551, -- The Truth in Sequence: Volume 4
    134552, -- The Truth in Sequence: Volume 5
    134553, -- The Truth in Sequence: Volume 6
    134554, -- The Truth in Sequence: Volume 7
    134555, -- The Truth in Sequence: Volume 8
    134556, -- The Truth in Sequence: Volume 9
    134557, -- The Truth in Sequence: Volume 10
    134558, -- The Truth in Sequence: Volume 11
    134559, -- The Truth in Sequence: Volume 12
  },
}

FurC.BookCollections[bc.NOTHING_EYES] = { -- Look Upon Their Nothing Eyes
  version = ver.SLAVES,
  location = zones.MURKMIRE,
  place = places.MURKMIRE_LIL,
  itemPrice = 15000,
  currency = CURT_MONEY,
  contents = {
    145597, -- Scales of Shadow
    145923, -- Lies of the Dread-Father
    145926, -- That of Void
    145927, -- Acts of Honoring
    145928, -- Speakers of Nothing
  },
}

-- TODO: Add the Mages Guild books

-- One row per book, all naming the container they come out of
for containerId, collection in pairs(FurC.BookCollections) do
  local versionData = FurC.MiscItemSources[collection.version] or {}
  FurC.MiscItemSources[collection.version] = versionData
  local dropData = versionData[src.DROP] or {}
  versionData[src.DROP] = dropData

  local row = {
    partOf = containerId,
    location = collection.location,
    place = collection.place,
    itemPrice = collection.itemPrice,
    currency = collection.currency,
  }
  for _, bookId in ipairs(collection.contents) do
    dropData[bookId] = dropData[bookId] or row
  end
end
