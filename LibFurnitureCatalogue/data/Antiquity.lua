--- Data: Antiquities (many available at trader for gold after first excavation) (`src.ANTIQUITY`)
FurC.Antiquities = FurC.Antiquities or {}

local LFC = LibFurnitureCatalogue
local places = LFC.Internal.Constants.PlaceIds
local src = LFC.Internal.Constants.ItemSources
local ver = LFC.Internal.Constants.Versioning
local zones = LFC.Internal.Constants.ZoneIds

-- 39 Season One
FurC.Antiquities[ver.THIEVES] = {
  [src.ANTIQUITY] = {
    [224857] = { location = zones.GLENUMBRA }, -- Window of Divinity
    [224858] = { location = zones.GLENUMBRA }, -- Zenithar Devotional Stele
    [224855] = { location = zones.GLENUMBRA }, -- Fool's Gold Pile
    [224856] = { location = zones.GLENUMBRA }, -- Tapestry of the Prince's Hunt
    [224854] = { location = zones.HEWSBANE, pieces = 5 }, -- Thieves Guild Armory Station
  },
}

-- 38 Season Zero
FurC.Antiquities[ver.ZERO] = {
  [src.ANTIQUITY] = {
    [223867] = { location = zones.COLDH }, -- Bearer of Fargrave, Skeletal Jaw
    [223868] = { location = zones.COLDH }, -- Bearer of Fargrave, Broken Skull
    [223869] = { location = zones.COLDH }, -- Imperial Titan Slayer
    [223870] = { location = zones.COLDH }, -- Valenwood Skull Blocks
    [223871] = { location = zones.COLDH }, -- Hourglass of Akatosh Brace, Massive
  },
}

-- 37 Seasons of the Worm Cult Part 2
FurC.Antiquities[ver.WORMS2] = {
  [src.ANTIQUITY] = {
    [223147] = { location = zones.SOLSTICE }, -- Stone-Nest Pillar, Temple
    [223148] = { location = zones.SOLSTICE }, -- Stone-Nest Gazebo
    [223149] = { location = zones.SOLSTICE }, -- Stone-Nest Counterweight
    [223150] = { location = zones.SOLSTICE }, -- Stone-Nest Pendulum
    [223151] = { location = zones.SOLSTICE }, -- Vitrified Soul Crystal
    [223152] = { location = zones.SOLSTICE }, -- Molag Bal Statue, Fractured Arm
    [223153] = { location = zones.SOLSTICE }, -- Molag Bal Statue, Fractured Head
    [223154] = { location = zones.SOLSTICE }, -- Coldharbour Soul Furnace
    [223155] = { location = zones.SOLSTICE }, -- Daedric Gate, Coldharbour
    [223156] = { location = zones.SOLSTICE }, -- Reaper, Pattern Template
    [219870] = { location = zones.SOLSTICE }, -- Antique Map of Solstice
    [219871] = { location = zones.SOLSTICE, pieces = 5 }, -- Cult Blacksmithing Station
  },
}

-- 35 Seasons of the Worm Cult // Solstice
FurC.Antiquities[ver.WORMS] = {
  [src.ANTIQUITY] = {
    [214358] = { location = zones.SOLSTICE }, -- Large Solstice Bismuth Tower
    [214343] = { location = zones.SOLSTICE, pieces = 5 }, -- Music Box, The Hermit Crab Dance
    [214355] = { location = zones.SOLSTICE }, -- Solstice Giant Crocodile Skull
    [214356] = { location = zones.SOLSTICE }, -- Solstice Giant Crocodile Ribs
    [214357] = { location = zones.SOLSTICE }, -- Solstice Giant Crocodile Tail
    [214359] = { location = zones.SOLSTICE }, -- Geometric Stone-Nest Totem
    [214360] = { location = zones.SOLSTICE }, -- Stone-Nest Totem, Iguana
    [214361] = { location = zones.SOLSTICE }, -- Stone-Nest Totem, Behemoth
    [214362] = { location = zones.SOLSTICE }, -- Stone-Nest Totem, Massive Skull
  },
}

-- 32 Home Tours
FurC.Antiquities[ver.BASE43] = {
  [src.ANTIQUITY] = {
    [208128] = { location = zones.APOCRYPHA, pieces = 10 }, -- Apocrypha Jewelry Crafting Station
  },
}

-- 30 Gold Road
FurC.Antiquities[ver.WEALD] = {
  [src.ANTIQUITY] = {
    [204424] = { location = zones.WEALD }, -- Antique Map of West Weald
    [204423] = { location = zones.WEALD, pieces = 5 }, -- Music Box, Lament for the Path Not Taken
    [204618] = { location = zones.WEALD }, -- Ayleid Arch, Wide
    [204619] = { location = zones.WEALD }, -- Ayleid Window, Large
    [204620] = { location = zones.WEALD }, -- Ayleid Sculpture, Simple Tree
    [204621] = { location = zones.WEALD }, -- Ayleid Sculpture, Complex Tree
    [204622] = { location = zones.WEALD }, -- Ayleid Lens Array, Reassembled
    [204419] = { location = zones.WEALD }, -- Ayleid Sculpture, Grand Tree
    [204418] = { location = zones.WEALD }, -- Pottery, Sanguine Repaired
    [204417] = { location = zones.WEALD }, -- Fresco, Colovian Lady
    [204623] = { location = zones.WEALD }, -- Colovian Tapestry, Worn
    [204624] = { location = zones.WEALD }, -- Colovian Tapestry, Pastoral Farm
    [204625] = { location = zones.WEALD }, -- Colovian Tapestry, Fancy Gate
    [204420] = { location = zones.WEALD, pieces = 5 }, -- Ayleid Blacksmithing Station
  },
}

-- 28 Secrets of the Telvanni
FurC.Antiquities[ver.ENDLESS] = {
  [src.ANTIQUITY] = {
    [199933] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Scrying Brazier, Tall
    [199932] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Scrying Brazier, Short
    [199890] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Archival Light Diffuser, Large
    [199132] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Tree
    [199131] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Wall Beast
    [199130] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Slug
    [199129] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Ribcage
    [199128] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Watchful Light
    [199127] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Petrified Watcher
    [199126] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Forged Black Book
    [199119] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 3 }, -- Infinite Tome
    [199118] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 5 }, -- Apocryphal Clothier Station
    [198576] = { location = zones.DEADLANDS }, -- Shelf, Black Soul Gems
    [198575] = { location = zones.SELSWEYR }, -- Khajiiti Well
    [198574] = { location = zones.NELSWEYR }, -- Khajiiti Water Vessel, Large
    [198573] = { location = zones.SUMMERSET }, -- High Elf Altar, Crystal
    [198572] = { location = zones.CWC }, -- Clockwork Wall Gears
    [198571] = { location = zones.GOLDCOAST }, -- Shrine to Dibella
    [198570] = { location = zones.SHADOWFEN }, -- Painted Stone Frog
    [198569] = { location = zones.DESHAAN }, -- Dark Elf Altar, Ceremonial
    [198568] = { location = zones.ALIKR }, -- Stone Relief, Yokudan
    [198567] = { location = zones.GLENUMBRA }, -- Breton Well, Storm Grey
    [198566] = { location = zones.REAPER }, -- Khajiiti Arch, Rising
    [198325] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 3 }, -- Vision of Mora
    [197916] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Archival Light Diffuser, Small
  },
}

-- 26 Necrom
FurC.Antiquities[ver.NECROM] = {
  [src.ANTIQUITY] = {
    [197829] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 10 }, -- Music Box, Glyphic Secrets
    [197712] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Antique Map of Apocrypha
    [197711] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Antique Map of the Telvanni Peninsula
    [197710] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Mushroom Classification Book
    [197709] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Tribunal Window, Stained Glass
    [197707] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 3 }, -- Apocryphal Well
    [197706] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 3 }, -- Trifold Mirror of Alternatives
    [197705] = { locations = { zones.TELVANNI, zones.APOCRYPHA }, pieces = 10 }, -- Telvanni Alchemy Station
    [197703] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Arch
    [197702] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Worm
    [197701] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Nautilus
    [197700] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Apocrypha Fossil, Bones Large
  },
}

-- 24 Firesong
FurC.Antiquities[ver.DRUID] = {
  [src.ANTIQUITY] = {
    [192432] = { location = zones.GALEN, pieces = 3 }, -- Shipbuilder's Crafting Station
    [192431] = { location = zones.GALEN }, -- Antique Map of Galen
    [192430] = { location = zones.GALEN }, -- Vulk'esh Egg
    [190938] = { location = zones.GALEN, pieces = 5 }, -- Music Box, Blessings of Stone
  },
}

-- 22 High Isle
FurC.Antiquities[ver.BRETON] = {
  [src.ANTIQUITY] = {
    [187802] = { location = zones.HIGHISLE }, -- Druidic Provisioning Station
    [187801] = { location = zones.HIGHISLE }, -- Sea Elf Galleon Helm
    [187800] = { location = zones.HIGHISLE }, -- Draoife Storystone
    [187799] = { location = zones.HIGHISLE }, -- Antique Map of High Isle
  },
}

-- 20 Deadlands
FurC.Antiquities[ver.DEADL] = {
  [src.ANTIQUITY] = {
    [182302] = { location = zones.DEADLANDS, pieces = 3 }, -- Daedric Enchanting Station
    [183196] = { location = zones.DEADLANDS }, -- Antique Map of the Deadlands
    [182303] = { location = zones.DEADLANDS }, -- Dagon's Scalding Gibbet
    [197708] = { locations = { zones.TELVANNI, zones.APOCRYPHA } }, -- Cliff Strider Skeleton Stand
    [187922] = { location = zones.FARGRAVE }, -- Antique Map of Fargrave
  },
}

-- 19 Blackwood
FurC.Antiquities[ver.BLACKW] = {
  [src.ANTIQUITY] = {
    [175729] = { location = zones.BLACKWOOD }, -- Kothringi Tidal Canoe
    [175728] = { location = zones.BLACKWOOD }, -- Z'en Idol
    [178459] = { location = zones.BLACKWOOD }, -- Antique Map of Blackwood
  },
}

-- 17 Markarth
FurC.Antiquities[ver.MARKAT] = {
  [src.ANTIQUITY] = {
    [171428] = { location = zones.REACH, note = "Harrowstorms" }, -- Vampiric Stained Glass
    [171431] = { location = zones.REACH }, -- Antique Map of the Reach
    [171429] = { location = zones.REACH }, -- Red Eagle Cave Painting
  },
}

-- 15 Greymoor
FurC.Antiquities[ver.SKYRIM] = {
  [src.ANTIQUITY] = {
    [165866] = { location = zones.STONEFALLS }, -- Ashen Infernace Gate
    [165992] = { location = zones.WSKYRIM }, -- Antique Map of Western Skyrim
    [163431] = { place = places.ANY, pieces = 3 }, -- Music Box, Dreams and Memories
    [165863] = { location = zones.GRAHTWOOD }, -- St. Alessia, Paravant
    [165859] = { location = zones.BALFOYEN }, -- The Dutiful Guar
    [165854] = { location = zones.MURKMIRE }, -- Nisswo's Soul Tender
    [165860] = { location = zones.GRAHTWOOD }, -- Eight-Star Chandelier
    [166474] = { location = zones.CRAGLORN }, -- Altar of Celestial Convergence
    [161204] = { location = zones.WROTHGAR }, -- Anvil of Old Orsinium
    [165875] = { location = zones.BETNIKH }, -- Ayleid Lightwell
    [163705] = { location = zones.BETNIKH }, -- Warcaller's Painted Drum
    [165848] = { location = zones.WSKYRIM }, -- Font of Auri-El
    [165870] = { location = zones.COLDH }, -- Daedric Pillar of Torment
    [166434] = { location = zones.ALIKR }, -- The Heartland
    [165876] = { location = zones.BLEAK }, -- Ruby Dragon Skull
    [161216] = { location = zones.BALFOYEN }, -- Tri-Angled Truth Altar
    [163706] = { location = zones.STROSMKAI }, -- Dwemer Star Chart
    [166013] = { location = zones.RIFT }, -- Ebony Fox Totem
    [165849] = { location = zones.AURIDON }, -- Echoes of Aldmeris
    [161206] = { location = zones.GREENSHADE }, -- Branch of Falinesti
    [165857] = { location = zones.BLEAK }, -- Brazier of Frozen Flame
    [165871] = { location = zones.EASTMARCH }, -- Carved Whale Totem
    [165864] = { location = zones.DESHAAN }, -- Blessed Dais of Almalexia
    [165861] = { location = zones.GOLDCOAST }, -- Golden Idol of Morihaus
    [166473] = { location = zones.GREENSHADE }, -- Greensong Gathering Circle
    [166436] = { location = zones.WROTHGAR }, -- Tusks of the Orc-Father
    [165856] = { location = zones.EASTMARCH }, -- Sacred Chalice of Ysgramor
    [165852] = { location = zones.VVARDENFELL }, -- St. Nerevar, Moon-and-Star
    [161207] = { location = zones.MALABAL }, -- Hollowbone Wind Chimes
    [165874] = { location = zones.GLENUMBRA }, -- Jeweled Skull of Ayleid Kings
    [165867] = { location = zones.KHENARTHI }, -- Cat's Eye Prism
    [161213] = { location = zones.REAPER }, -- Sorcerer-King's Blade
    [163704] = { location = zones.GLENUMBRA }, -- Kingmaker's Trove
    [166471] = { location = zones.BANG }, -- Tall Papa's Lamp
    [161205] = { location = zones.COLDH }, -- Void-Crystal Anomaly
    [165865] = { location = zones.STORMHAVEN }, -- Beacon of Tower Zero
    [166015] = { location = zones.KHENARTHI }, -- Sweet Khenarthi's Song
    [165869] = { location = zones.AURIDON }, -- Maormeri Serpent Shrine
    [165873] = { location = zones.GOLDCOAST }, -- Meridian Sconce
    [165850] = { location = zones.CWC }, -- Mnemonic Star-Sphere
    [165853] = { location = zones.SELSWEYR }, -- Moons-Blessed Ceremonial Pool
    [165868] = { location = zones.REAPER }, -- Moonlight Mirror
    [165872] = { location = zones.NELSWEYR }, -- Stained Glass of Lunar Phases
    [166472] = { location = zones.HEWSBANE }, -- Morwha's Blessing
    [165862] = { location = zones.NELSWEYR }, -- Moth Priest's Cleansing Bowl
    [161210] = { location = zones.SUMMERSET }, -- Prismatic Sunbird Feather
    [165878] = { location = zones.STROSMKAI }, -- Dwarven Puzzle Box
    [165851] = { location = zones.VVARDENFELL }, -- Sixth House Ritual Table
    [165855] = { location = zones.STORMHAVEN }, -- Noble Knight's Rest
    [161208] = { location = zones.RIFT }, -- Rune-Carved Mammoth Skull
    [161209] = { location = zones.SHADOWFEN }, -- Nest of Shadows
    [161212] = { location = zones.MALABAL }, -- Silvenari Sap-Stone
    [166435] = { location = zones.WSKYRIM }, -- Seat of the Snow Prince
    [166451] = { location = zones.RIVENSPIRE }, -- Riven King's Throne
    [161211] = { location = zones.RIVENSPIRE }, -- Remnant of the False Tower
    [165858] = { location = zones.ALIKR }, -- Coil of Satakal
    [161215] = { location = zones.HEWSBANE }, -- Yokudan Skystone Scabbard
    [161214] = { location = zones.CRAGLORN }, -- Spellscar Shard
    [166014] = { location = zones.SELSWEYR }, -- Shrine of Boethra
    [163710] = { location = zones.ALIKR }, -- Antique Map of Alik'r Desert
    [165996] = { location = zones.GOLDCOAST }, -- Antique Map of Gold Coast
    [163727] = { location = zones.NELSWEYR }, -- Antique Map of Northern Elsweyr
    [163728] = { location = zones.SELSWEYR }, -- Antique Map of Southern Elsweyr
    [163717] = { location = zones.AURIDON }, -- Antique Map of Auridon
    [163711] = { location = zones.BANG }, -- Antique Map of Bangkorai
    [163713] = { location = zones.DESHAAN }, -- Antique Map of Deshaan
    [163707] = { location = zones.GLENUMBRA }, -- Antique Map of Glenumbra
    [163718] = { location = zones.GRAHTWOOD }, -- Antique Map of Grahtwood
    [163719] = { location = zones.GREENSHADE }, -- Antique Map of Greenshade
    [165997] = { location = zones.HEWSBANE }, -- Antique Map of Hew's Bane
    [165993] = { location = zones.COLDH }, -- Antique Map of Coldharbour
    [165994] = { location = zones.CRAGLORN }, -- Antique Map of Craglorn
    [163709] = { location = zones.RIVENSPIRE }, -- Antique Map of Rivenspire
    [163720] = { location = zones.MALABAL }, -- Antique Map of Malabal Tor
    [163715] = { location = zones.EASTMARCH }, -- Antique Map of Eastmarch
    [163716] = { location = zones.RIFT }, -- Antique Map of The Rift
    [163714] = { location = zones.SHADOWFEN }, -- Antique Map of Shadowfen
    [163721] = { location = zones.REAPER }, -- Antique Map of Reaper's March
    [163725] = { location = zones.SUMMERSET }, -- Antique Map of Summerset
    [163708] = { location = zones.STORMHAVEN }, -- Antique Map of Stormhaven
    [163712] = { location = zones.STONEFALLS }, -- Antique Map of Stonefalls
    [163724] = { location = zones.VVARDENFELL }, -- Antique Map of Vvardenfell
    [163726] = { location = zones.MURKMIRE }, -- Antique Map of Murkmire
    [163723] = { location = zones.WROTHGAR }, -- Antique Map of Wrothgar
  },
}
