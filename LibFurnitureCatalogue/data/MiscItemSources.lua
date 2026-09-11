-- Data: MiscItemSources, that don't have their own file (yet)
--
-- `Query.GetMiscItemSource` builds the source line on demand from the same ids the bake used to resolve.
--
-- The bucket a row sits in names its source, and that decides the category word.
-- Every field is optional:
--
--   category   string id, when the row reads differently from its bucket (daily, special event drop, ToT)
--   location   ZoneIds value, a game zone
--   place      PlaceIds value, somewhere inside `location` that the game has no zone id for (with `location` --> "<zone>, <place>"; without it's all the row knows)
--   locations  ZoneIds values, for ONE source that covers several of them (group of dungeons, neighbouring zones, pub dung in a zone)
--   event      EventIds value. event is the category word and event name goes where a location would
--   note       source details: the mob or harvesting node it comes from (a list of notes is a list of alternatives, "A or B")
--   container  item id of the box it comes in
--   partOf     item id of the container the row unpacks from (renders as "part of <container>")
--   rarity     string id of a rarity remark
--   pieces     how many antiquity leads make the furnishing (renders "N pieces")
--   quest      quest id
--   reward     achievement id, for an item handed out for earning it
--   itemPack   TomesPacks value
--   itemPrice  what it costs, with `currency`
--   text       the row is prose rather than a source: the whole description, as one
--              value or a list joined with spaces
--
-- `note` and `text` take a string id, a literal, or a `{ npc = }`, `{ npcClass = }`, `{ npcGroup = }` or `{ item = }` part where the value needs its own vocabulary to resolve

FurC.MiscItemSources = FurC.MiscItemSources or {}

local LFC = LibFurnitureCatalogue
local events = LFC.Internal.Constants.EventIds
local npcClasses = LFC.Internal.Constants.NpcClassIds
local npcGroups = LFC.Internal.Constants.NpcGroupIds
local npcIds = LFC.Internal.Constants.NpcIds
local packs = LFC.Internal.Constants.TomesPacks
local places = LFC.Internal.Constants.PlaceIds
local src = LFC.Internal.Constants.ItemSources
local ver = LFC.Internal.Constants.Versioning
local zones = LFC.Internal.Constants.ZoneIds

-- Quests and guilds
local tribute = { category = SI_FURC_SRC_TOT }
local tribute_ranked = { category = SI_FURC_SRC_TOT, note = SI_FURC_REWARD_RANKED_MAIL }
local db_poison = { text = { SI_FURC_DB, SI_FURC_DB_POISON } }
local db_sneaky = { text = { SI_FURC_DB, SI_FURC_DB_STEALTH } }
local db_equip = { text = { SI_FURC_DB, SI_FURC_DB_EQUIP } }
local quest_worms = { quest = 5952 }

--- TODO maybe: add reward coffers to containers in Constants

-- reward boxes: 126030, 126031
local daily_ashlander = {
  category = SI_FURC_SRC_QUEST_DAILY,
  location = zones.VVARDENFELL,
  place = places.VVARDENFELL_ALDRUHN,
  container = 126030,
}
-- reward box: 145568 Tribal Treasure Crate
local daily_murk = { category = SI_FURC_SRC_QUEST_DAILY, location = zones.MURKMIRE, container = 145568 }

-- Player guilds are community entities the game has no id for, and they hand out an item rarely enough not to earn a field. The whole name is the note, "guild" included,
local guild_aetherius = { category = SI_FURC_EVENT, note = "Aetherius Art guild" }
local guild_bananas = { category = SI_FURC_EVENT, note = "Dauntless Bananas guild" }
local guild_disenfranchised = { category = SI_FURC_EVENT, note = "Disenfranchised guild" }
local guild_goldleaf = { category = SI_FURC_EVENT, note = "Goldleaf Acquisitions guild" }
local guild_museum = { category = SI_FURC_EVENT, note = "Museum guild" }
local guild_nomads = { category = SI_FURC_EVENT, note = "Nomads of Nirn guild" }

-- Events
local ev_elsweyr = { event = events.ELSWEYR }

-- Looting
local automaton_loot_cc = { location = zones.CWC, note = { npc = npcIds.ENEMY_AUTOMATON } }
local automaton_loot_vv = { location = zones.VVARDENFELL, note = { npc = npcIds.ENEMY_AUTOMATON } }
local drop_solstice_pubdung = { location = zones.SOLSTICE, note = "mobs in public dungeons and delves" }
local painting_vvardenfell = {
  location = zones.VVARDENFELL,
  note = { SI_FURC_SRC_CHESTS, SI_FURC_SRC_SAFEBOX },
  rarity = SI_FURC_RARITY_EXTREMELYRARE,
}
local pdung_vv_fw = { locations = { zones.VVARDENFELL, zones.PDUNG_VVARDENFELL_FW } }
local summerset_clamsngeysers = { location = zones.SUMMERSET, note = { SI_FURC_SRC_CLAM_GIANT, SI_FURC_SRC_GEYSER } }
local vvardenfell_tombsruins = { location = zones.VVARDENFELL, note = { SI_FURC_TOMBS, SI_FURC_RUINS } }

-- Dungeons
local book_hall = { location = zones.DUNG_SCRIV, note = "vault chests" }
local dung_dom = { location = zones.DUNG_DOM }
local dung_fl_scp = { locations = { zones.DUNG_FL, zones.DUNG_SCP } }
local dung_mhk_mos = { locations = { zones.DUNG_MHK, zones.DUNG_MOS } }
local frostvault = { location = zones.DUNG_FV, rarity = SI_FURC_RARITY_RARE }
local inf_archive = { location = zones.DUNG_IA }
local nymic = { location = zones.DUNG_NYMIC, note = SI_FURC_SRC_CHESTS }

-- Treasure chests
local chestsGeneral = {}
local chests_blackr_grcaverns = { location = zones.BLACKREACH_GMC }
local chests_blackwood = { location = zones.BLACKWOOD }
local chests_coldh = { location = zones.COLDH }
local chests_cwc = { location = zones.CWC }
local chests_elsweyr = { locations = { zones.NELSWEYR, zones.SELSWEYR } }
local chests_goldcoast = { location = zones.GOLDCOAST }
local chests_hewsbane = { location = zones.HEWSBANE }
local chests_high = { location = zones.HIGHISLE }
local chests_necrom = { locations = { zones.TELVANNI, zones.APOCRYPHA } }
local chests_nelsweyr = { location = zones.NELSWEYR }
local chests_selsweyr = { location = zones.SELSWEYR }
local chests_skyrim = { location = zones.WSKYRIM }
local chests_solstice = { location = zones.SOLSTICE }
local chests_summerset = { location = zones.SUMMERSET }
local chests_weald = { location = zones.WEALD }
local chests_wrothgar = { location = zones.WROTHGAR }
local elfpic = { location = zones.SUMMERSET, rarity = SI_FURC_RARITY_RARE }
local painting_vvardenfell_chests = { location = zones.VVARDENFELL, rarity = SI_FURC_RARITY_EXTREMELYRARE }

-- Harvesting
local harvest_any = {}
local harvest_solstice_cloth = { location = zones.SOLSTICE, note = "Clothing" }
local harvest_solstice_clothalch = { location = zones.SOLSTICE, note = "Clothing and Alchemy" }
local harvest_solstice_smith = { location = zones.SOLSTICE, note = "Blacksmithing" }
local harvest_solstice_smithjewel = { location = zones.SOLSTICE, note = "Blacksmithing and Jewelry" }
local harvest_solstice_wood = { location = zones.SOLSTICE, note = "Woodworking" }
local harvest_wood = { note = "Wood" }
local plants_vvardenfell = { location = zones.VVARDENFELL }

-- Trade Bars
local bazaar_1950 = { itemPrice = 1950, currency = CURT_TRADE_BARS }
local bazaar_2000 = { itemPrice = 2000, currency = CURT_TRADE_BARS }
local bazaar_2550 = { itemPrice = 2550, currency = CURT_TRADE_BARS }

-- Tamriel Tomes
local tomes_armor = { itemPack = packs.ARMOR }
local tomes_dawn = { itemPack = packs.DAWN }
local tomes_logic = { itemPack = packs.LOGIC }

-- Season One
FurC.MiscItemSources[ver.THIEVES] = {}

-- Season Zero
FurC.MiscItemSources[ver.ZERO] = {
  [src.BAZAAR] = {
    [197625] = bazaar_2000, -- Music Box, Oath of the Keepers
  },

  [src.TOMES] = {
    [224078] = tomes_dawn, -- Dusklight Rift
    [224077] = tomes_dawn, -- Dusklight Mote
    [224079] = tomes_dawn, -- Dawnlight Rift
    [224080] = tomes_dawn, -- Dawnlight Mote
    [224074] = tomes_logic, -- High Isle Fireplace, Stone
    [224076] = tomes_logic, -- Fireplace Screen, Wrought Iron
    [224075] = tomes_logic, -- Stained Glass of Julianos, Symbol
    [223996] = tomes_armor, -- Report: Quality of Recruits
    [224007] = tomes_armor, -- The Rotwood Enigma
    [224006] = tomes_armor, -- Armor of Myth and Legend
    [224005] = tomes_armor, -- Folly in Fixation
    [224003] = tomes_armor, -- Husks and Bones
    [224004] = tomes_armor, -- The Masters' Hall
    [224002] = tomes_armor, -- Azarrid's Race
    [224001] = tomes_armor, -- Settling the Debate
    [224000] = tomes_armor, -- Discomforts of War
    [223999] = tomes_armor, -- Call to the Faithful
    [223998] = tomes_armor, -- Undeniable Truths of Attire
    [223997] = tomes_armor, -- Xil-Go's Spell
  },
}

-- Seasons of the Worm Cult Part 2
FurC.MiscItemSources[ver.WORMS2] = {
  [src.DROP] = {
    [223161] = drop_solstice_pubdung, -- Worm Cult Tongs, Metal
    [223160] = drop_solstice_pubdung, -- Worm Cult Carving, Eye
    [223159] = drop_solstice_pubdung, -- Worm Cult Pickaxe, Mining
    [223158] = drop_solstice_pubdung, -- Worm Cult Hammer, Mining
    [223157] = drop_solstice_pubdung, -- Worm Cult Bucket, Bismuth Samples
    [223176] = drop_solstice_pubdung, -- Leg Armor, Arrow-Damaged
    [223177] = drop_solstice_pubdung, -- Skull, Extinct Seabeast
  },

  [src.HARVEST] = {
    [223173] = harvest_solstice_wood, -- Leaf Pile, Royal Palm
    [223172] = harvest_solstice_wood, -- Leaf Pile, Thatch Palm
    [223171] = harvest_solstice_cloth, -- Plant, Corrupted Fanik Goc
    [223170] = harvest_solstice_cloth, -- Plant, Corrupted Flowering Fanik Goc
    [223169] = harvest_solstice_smith, -- Stones, Jagged Granite Cluster
    [223168] = harvest_solstice_smith, -- Stone, Smooth Limestone
  },

  [src.CHEST] = {
    [223174] = chests_solstice, -- Cook's Still Life Painting, Unfinished
  },
}

-- Seasons of the Worm Cult // Solstice
FurC.MiscItemSources[ver.WORMS] = {
  [src.HARVEST] = {
    [214479] = harvest_solstice_smithjewel, -- Solstice Bismuth, Deposit II
    [214478] = harvest_solstice_smithjewel, -- Solstice Bismuth, Deposit I
    [214485] = harvest_solstice_clothalch, -- Plant, Pineapple
    [214482] = harvest_solstice_cloth, -- Fanik Goc, Sprouted
    [214480] = harvest_solstice_clothalch, -- Flowers, Poinsettia
    [214481] = harvest_solstice_clothalch, -- Flower Patch, Flame Lily
    [214483] = harvest_solstice_cloth, -- Flowering Gorse, Orange
    [214484] = harvest_solstice_cloth, -- Grass, Pampas Cluster
    [214486] = harvest_solstice_cloth, -- Flowers, Sea Lavender Cluster
    [214487] = harvest_solstice_clothalch, -- Bush, Sea Lavender
  },

  [src.CHEST] = {
    [214363] = chests_solstice, -- Tide-Born Tapestry, Turtle
    [214364] = chests_solstice, -- Tide-Born Tapestry, Contemplation
    [214365] = chests_solstice, -- Tide-Born Tapestry, Origins
    [214366] = chests_solstice, -- Tide-Born Tapestry, Training
    [214367] = chests_solstice, -- Tide-Born Tapestry, Lizard
    [214368] = chests_solstice, -- Tide-Born Tapestry, Triptych
    [214369] = chests_solstice, -- Tide-Born Tapestry, Sap
    [214370] = chests_solstice, -- Tide-Born Tapestry, Snake
    [214371] = chests_solstice, -- Tide-Born Reed Art, Turtle
    [214373] = chests_solstice, -- Meadow Study Painting, Unfinished
    [214372] = chests_solstice, -- Forest Study Painting, Unfinished
  },

  [src.QUEST] = {
    [211517] = quest_worms, -- Storm Lord Shield
    [211518] = quest_worms, -- Pit Daemon Shield
    [211519] = quest_worms, -- Fire Drake Shield
    [211520] = quest_worms, -- Pit Daemon Wreath
    [211521] = quest_worms, -- Storm Lord Wreath
    [211522] = quest_worms, -- Fire Drake Wreath
    [211523] = quest_worms, -- Storm Lord Rug, Round
    [211530] = quest_worms, -- Fire Drake Banner, Long
    [211531] = quest_worms, -- Fire Drake Banner, Short
    [211532] = quest_worms, -- Fire Drake Mug
    [211533] = quest_worms, -- Fire Drake Rug, Horizontal
    [211534] = quest_worms, -- Fire Drake Rug, Vertical
    [211535] = quest_worms, -- Pit Daemon Rug, Round
    [211536] = quest_worms, -- Pit Daemon Banner, Long
    [211537] = quest_worms, -- Pit Daemon Banner, Short
    [211538] = quest_worms, -- Pit Daemon Mug
    [211539] = quest_worms, -- Pit Daemon Rug, Horizontal
    [211540] = quest_worms, -- Pit Daemon Rug, Vertical
    [211525] = quest_worms, -- Storm Lord Mug
    [211524] = quest_worms, -- Storm Lord Banner, Short
    [211526] = quest_worms, -- Storm Lord Banner, Long
    [211527] = quest_worms, -- Storm Lord Rug, Horizontal
    [211529] = quest_worms, -- Fire Drake Rug, Round
    [211528] = quest_worms, -- Storm Lord Rug, Vertical
  },
}

-- 32 Golden Pursuits Update 44
FurC.MiscItemSources[ver.BASE44] = {
  [src.BAZAAR] = {
    [212186] = bazaar_2000, -- Statue, Breton Hero
    [212187] = bazaar_2000, -- Statue, Nord Hero
    [212188] = bazaar_2000, -- Statue, High Elf Hero
    [211303] = bazaar_2000, -- Statue of Molag Bal, Harvester
  },

  [src.QUEST] = {
    [211505] = { note = "Tanlorin rapport" }, -- Letter from Tanlorin
    [211503] = { note = "Zerith-Var rapport" }, -- Letter from Zerith-var
  },
}

-- 30 Gold Road
FurC.MiscItemSources[ver.WEALD] = {
  [src.CHEST] = {
    [204800] = chests_weald, -- Preparing to Entertain Painting, Wood
    [204801] = chests_weald, -- Great Chapel of Julianos Painting, Wood
    [204802] = chests_weald, -- Wonders of Water Painting, Wood
    [204803] = chests_weald, -- An Alfiq in Skingrad Painting, Metal
    [204804] = chests_weald, -- Arch to Ayleid Mysteries Painting, Wood
    [204805] = chests_weald, -- Colovian Windmill Painting, Wood
    [204806] = chests_weald, -- Autumn on the Gold Road Painting, Wood
    [204807] = chests_weald, -- A Clear Day in Colovia Painting, Metal
    [204808] = chests_weald, -- West Weald Adventures Painting, Metal
    [204754] = chests_weald, -- Sun-Gilded Vineyard Painting, Metal
    [204755] = chests_weald, -- Colovian Bounty Painting, Wood
    [204799] = chests_weald, -- The Optimism of Dogs Painting, Metal
  },

  [src.QUEST] = {
    [204416] = tribute, -- Saint's Wrath Tapestry, Large
    [204413] = tribute, -- Morihaus the Archer Tapestry
    [204414] = tribute, -- Morihaus the Archer Tapestry, Large
    [204415] = tribute, -- Saint's Wrath Tapestry
  },
}

-- 28 Secrets of the Telvanni
FurC.MiscItemSources[ver.ENDLESS] = {
  [src.DUNGEON] = {
    [203472] = inf_archive, -- Materials for Novice Necromancers
    [203471] = inf_archive, -- The Spotted Towers
    [203470] = inf_archive, -- Song of Fate
    [203469] = inf_archive, -- House Telvanni Song
    [203468] = inf_archive, -- The Waiting Door
    [203467] = inf_archive, -- Captain Burwarah's Records
    [203466] = inf_archive, -- The Silver Rose Blooms over Borderwatch
    [203465] = inf_archive, -- Archmagister Mavon's Ascension
    [203464] = inf_archive, -- Fynboar the Resurrected
    [203463] = inf_archive, -- Obscure Killers of the North
    [203462] = inf_archive, -- The Remnant Truth
    [203461] = inf_archive, -- Parables of Saint Vorys
    [203460] = inf_archive, -- Malkhest's Journal
    [203459] = inf_archive, -- A Servant's Tale
    [203458] = inf_archive, -- The Last Addition of Bikkus-Muz
    [203457] = inf_archive, -- Preparing Necrom Kwama, Fifth Draft
    [203456] = inf_archive, -- The Prior's Fulcrum
    [203455] = inf_archive, -- Plague Concoctor's Instructions
    [203454] = inf_archive, -- Dusksaber Report
    [203453] = inf_archive, -- Mouth Vabdru's Journal
    [203452] = inf_archive, -- First Mate Dalmir's Log
    [203451] = inf_archive, -- Fanlyrion's Journal
    [203450] = inf_archive, -- Tidefall Cantos I
    [203449] = inf_archive, -- Our Dunmer Heritage
    [203448] = inf_archive, -- A Feast Among the Dead, Chapter IV
    [203447] = inf_archive, -- A Feast Among the Dead, Chapter III
    [203446] = inf_archive, -- A Feast Among the Dead, Chapter II
    [203445] = inf_archive, -- What's an Arcanist? Part 1
    [203444] = inf_archive, -- What's an Arcanist? Part 2
    [203443] = inf_archive, -- Working in the Infinite Panopticon
    [203442] = inf_archive, -- What About Glyphics?
    [203441] = inf_archive, -- On Cipher's Midden
    [203440] = inf_archive, -- The Littlest Tomeshell
    [203439] = inf_archive, -- A New Cult Arises
    [203438] = inf_archive, -- Torvesard's Journal
    [203437] = inf_archive, -- Daedric Worship and the Dark Elves
    [203436] = inf_archive, -- Ciphers of the Eye
    [203435] = inf_archive, -- Planar Exploration Vol. 14: Darkreave Curators
    [203434] = inf_archive, -- Beverages for the Bereaved
    [203433] = inf_archive, -- Denizens of Apocrypha
    [203432] = inf_archive, -- History of Necrom: The City of the Dead
    [203431] = inf_archive, -- Brave Little Scrib and the River Troll
    [203430] = inf_archive, -- A Brief History of House Telvanni
    [203429] = inf_archive, -- A Feast Among the Dead, Chapter I
    [203428] = inf_archive, -- Visitor's Guide: Telvanni Peninsula
    [203427] = inf_archive, -- Critter Dangers: Telvanni Peninsula
    [203426] = inf_archive, -- We Reject the Pact
    [203425] = inf_archive, -- Our Puny Allies
    [203424] = inf_archive, -- The Spires of the 34th Sermon
    [203423] = inf_archive, -- Master of the Tides of Fate
    [203422] = inf_archive, -- On the Nature of Nymics
    [203421] = inf_archive, -- The Dangers of Truth
    [203420] = inf_archive, -- A Summoner's Guide to Nymics
    [203419] = inf_archive, -- Kynmarcher Strix's Journal
    [203418] = inf_archive, -- Life in the Camonna Tong
    [203417] = inf_archive, -- Herma-Mora: The Woodland Man?
    [203416] = inf_archive, -- How Rajhin Stole the Book that Knows
    [203415] = inf_archive, -- On Tracts Perilous
    [203414] = inf_archive, -- Uluscant's Manifesto
    [203413] = inf_archive, -- The Currency of Secrets
    [203412] = inf_archive, -- On Joining the Keepers of the Dead
    [203411] = inf_archive, -- A Report on the Dusksabers
    [203410] = inf_archive, -- Ranks and Titles of House Telvanni
    [203409] = inf_archive, -- Oath of the Keepers
    [203408] = inf_archive, -- Larydeilmo is Sane
    [203211] = inf_archive, -- Apocrypha Crescent
    [203210] = inf_archive, -- Apocrypha Spike, Curved
    [203209] = inf_archive, -- Apocrypha Spike, Tall
    [203208] = inf_archive, -- Apocrypha Pipe, Small
    [203207] = inf_archive, -- Apocrypha Pipe, Small Curved
    [203206] = inf_archive, -- Apocrypha Pipe, Medium
    [203204] = inf_archive, -- Apocrypha Pipe, Large Curved
  },

  [src.CHEST] = {
    [203407] = chests_wrothgar, -- Vosh Rakh
    [203406] = chests_wrothgar, -- Vorgrosh Rot-Tusk's Guide to Dirty Fighting
    [203405] = chests_wrothgar, -- Orc Clans and Symbology
    [203404] = chests_wrothgar, -- Birds of Wrothgar
    [203403] = chests_summerset, -- The Ubiquitous Sinking Isle
    [203402] = chests_summerset, -- The Truth of Minotaurs
    [203401] = chests_summerset, -- The Flight of Gryphons
    [203400] = chests_summerset, -- Artaeum Lost
    [203399] = chests_selsweyr, -- The Marriage of Moon and Tide
    [203398] = chests_selsweyr, -- The Favored Daughter of Fadomai
    [203397] = chests_selsweyr, -- Khunzar-ri and the Lost Alfiq
    [203396] = chests_selsweyr, -- Azurah's Crossing
    [203395] = chests_selsweyr, -- Trail and Tide
    [203394] = chests_selsweyr, -- The Angry Alfiq: A Collection
    [203393] = chests_selsweyr, -- On Those Who Know Baan Dar
    [203392] = chests_nelsweyr, -- Anequina and Pellitine: An Introduction
    [203391] = chests_hewsbane, -- The Red Curse, Volume 3
    [203390] = chests_hewsbane, -- The Red Curse, Volume 2
    [203389] = chests_hewsbane, -- The Red Curse, Volume 1
    [203388] = chests_goldcoast, -- The Wolf and the Dragon
    [203387] = chests_goldcoast, -- The Blade of Woe
    [203386] = chests_goldcoast, -- On Minotaurs
    [203385] = chests_goldcoast, -- Cathedral Hierarchy
    [203384] = chests_coldh, -- Journal of Tsona-Ei, Part Two
    [203383] = chests_coldh, -- Journal of Tsona-Ei, Part Three
    [203382] = chests_coldh, -- Journal of Tsona-Ei, Part One
    [203381] = chests_coldh, -- Journal of Tsona-Ei, Part Four
    [203380] = chests_cwc, -- Worshiping the Illogical
    [203379] = chests_cwc, -- The Blackfeather Court
    [203378] = chests_cwc, -- Engine of Expression
    [203377] = chests_cwc, -- A Brief History of Ald Sotha
  },

  [src.QUEST] = {
    [199117] = tribute, -- Chromatic Reservoir Tapestry, Large
    [199116] = tribute, -- Chromatic Reservoir Tapestry
    [199115] = tribute, -- Seeker Aspirant Tapestry, Large
    [199114] = tribute, -- Seeker Aspirant Tapestry
  },
}

-- 27 QOL Base Game Update
FurC.MiscItemSources[ver.BASED] = {}

-- 26 Necrom
FurC.MiscItemSources[ver.NECROM] = {
  [src.DUNGEON] = {
    [197921] = nymic, -- Peryite's Salvation
    [197920] = nymic, -- The Doom of the Hushed
    [197919] = nymic, -- The Legend of Fathoms Drift
    [197918] = nymic, -- Deal with a Daedric Prince
    [197917] = nymic, -- Ode to Vaermina
  },

  [src.CHEST] = {
    [197783] = chests_necrom, -- Pilgrimage Triptych Painting, Wood
    [197782] = chests_necrom, -- Alleyway Still Life Painting
    [197781] = chests_necrom, -- The City of Necrom Painting, Wood
    [197755] = chests_necrom, -- Shadow over Necrom Painting
    [197754] = chests_necrom, -- Offerings to the Dead Painting, Wood
    [197753] = chests_necrom, -- Telvanni Peninsula Painting, Wood
    [197752] = chests_necrom, -- Mycoturge's Retreat Painting, Wood
    [197751] = chests_necrom, -- Sunset Fleet Painting, Wood
    [197750] = chests_necrom, -- Telvanni Mushroom Spire Painting, Wood
    [197749] = chests_necrom, -- Necrom Still Life Painting, Wood
  },

  [src.QUEST] = {
    [197780] = { note = "Sharp-as-Night rapport" }, -- Letter from Sharp
    [197779] = { note = "Azandar's rapport" }, -- Letter from Azandar
    [193786] = tribute, -- Mercymother Elite Tribute Tapestry
    [193785] = tribute, -- Mercymother Elite Tribute Tapestry, Large
    [193784] = tribute, -- Hand of Almalexia Tribute Tapestry
    [193783] = tribute, -- Hand of Almalexia Tribute Tapestry, Large
  },
}

-- 25 Scribes of Fate
FurC.MiscItemSources[ver.SCRIBE] = {
  [src.DUNGEON] = {
    [194460] = book_hall, -- Apocrypha, Apocrypha
    [194459] = book_hall, -- Dream of a Thousand Dreamers
    [194458] = book_hall, -- Lord Hollowjack's Dream Realm
    [194456] = book_hall, -- Invocation of Hircine
    [194455] = book_hall, -- Havocrel: Strangers from Oblivion
    [194454] = book_hall, -- The Waters of Oblivion
    [194453] = book_hall, -- A Memory Book, Part 1
    [194452] = book_hall, -- A Memory Book, Part 2
    [194451] = book_hall, -- A Memory Book, Part 3
    [194450] = book_hall, -- Thwarting the Daedra: Dagon's Cult
    [194449] = book_hall, -- In Dreams We Awaken
    [194448] = book_hall, -- Glorious Upheaval
    [194447] = book_hall, -- Stonefire Ritual Tome
    [194446] = book_hall, -- Bisnensel: Our Ancient Roots
    [194445] = book_hall, -- Boethiah and Her Avatars
    [194444] = book_hall, -- Persistence of Daedric Veneration
    [194443] = book_hall, -- Daedra Dossier: The Titans
    [194442] = book_hall, -- Journal of Culanwe
    [194441] = book_hall, -- Graccus' Journal, Volume I
    [194440] = book_hall, -- Tome of Daedric Portals
    [194439] = book_hall, -- The Journal of Emperor Leovic
    [194423] = book_hall, -- Hermaeus Mora Banner, Long
    [194422] = book_hall, -- Hermaeus Mora Banner, Extra Long
    [194421] = book_hall, -- Nesting Boulder, Green
    [194420] = book_hall, -- Nesting Stones, Green
    [194419] = book_hall, -- Scrivener's Hall Vault Door
  },
}

-- 24 Firesong
FurC.MiscItemSources[ver.DRUID] = {
  [src.QUEST] = {
    [192404] = tribute, -- Forest Wraith Tribute Tapestry, Large
    [192403] = tribute, -- Forest Wraith Tribute Tapestry
    [192402] = tribute, -- The Chimera Tribute Tapestry, Large
    [192401] = tribute, -- The Chimera Tribute Tapestry
  },
}

-- 23 Lost Depths
FurC.MiscItemSources[ver.DEPTHS] = {
  [src.QUEST] = {
    [187807] = tribute_ranked, -- Tribute Trophy, Voidsteel
    [187806] = tribute_ranked, -- Tribute Trophy, Quicksilver
    [187805] = tribute_ranked, -- Tribute Trophy, Ebony
    [187804] = tribute_ranked, -- Tribute Trophy, Orichalcum
  },
}

-- 22 High Isle
FurC.MiscItemSources[ver.BRETON] = {
  [src.CHEST] = {
    [187877] = chests_high, -- Gates of Gonfalon Bay Painting, Wood
    [187876] = chests_high, -- Gonfalon Colossus Painting, Wood
    [187875] = chests_high, -- Tor Draioch Towers Painting, Wood
    [187874] = chests_high, -- Masted Behemoth Painting, Wood
    [187873] = chests_high, -- Abecean Bounty Painting, Wood
    [187872] = chests_high, -- Light's Warning Painting, Wood
    [187871] = chests_high, -- High Isle Seahome Painting, Metal
    [187870] = chests_high, -- Gifts of the Sun Painting, Metal
    [187869] = chests_high, -- Noble Still Life Painting, Metal
    [187868] = chests_high, -- Ascendant Silence Painting, Metal
  },

  [src.QUEST] = {
    [188285] = tribute, -- Serpentguard Rider Tribute Tapestry, Large
    [188284] = tribute, -- Serpentguard Rider Tribute Tapestry
    [188283] = tribute, -- Pyandonean War Fleet Tribute Tapestry, Large
    [188282] = tribute, -- Pyandonean War Fleet Tribute Tapestry
    [188281] = tribute, -- Prowling Shadow Tribute Tapestry, Large
    [188280] = tribute, -- Prowling Shadow Tribute Tapestry
    [188279] = tribute, -- Knight Commander Tribute Tapestry, Large
    [188278] = tribute, -- Knight Commander Tribute Tapestry
    [188277] = tribute, -- Hlaalu Councilor Tribute Tapestry, Large
    [188276] = tribute, -- Hlaalu Councilor Tribute Tapestry
    [188275] = tribute, -- Hagraven Matron Tribute Tapestry, Large
    [188274] = tribute, -- Hagraven Matron Tribute Tapestry
    [188273] = tribute, -- Blackfeather Knight Tribute Tapestry, Large
    [188272] = tribute, -- Blackfeather Knight Tribute Tapestry
    [188202] = { note = "Isobel rapport" }, -- Letter From Isobel
    [188201] = { note = "Ember rapport" }, -- Letter From Ember
    [187808] = tribute_ranked, -- Tribute Trophy, Rubedite
  },
}

-- 21 Ascending Tide
FurC.MiscItemSources[ver.TIDES] = {}

-- 20 Deadlands
FurC.MiscItemSources[ver.DEADL] = {
  [src.DROP] = {
    [166960] = { text = "From combining Stone Husk Fragments from the Labyrinthian in Western Skyrim" }, -- Target Stone Husk
    [163432] = { reward = 2669, location = zones.WSKYRIM }, -- Music Box, Merry Mead Maker ; Achievement
    [166027] = { location = zones.BLACKREACH_GMC, note = "chaurus mobs" }, -- Chaurus Egg, Dormant
  },

  [src.DUNGEON] = {
    [147644] = frostvault, -- Palisade, Crude
    [147642] = frostvault, -- Boar Totem, Balance
    [147643] = frostvault, -- Boar Totem, Solitary
  },

  [src.HARVEST] = {
    [145595] = { location = zones.MURKMIRE, note = { item = 145595 } }, -- Scuttlebloom
  },

  [src.CHEST] = {
    [178442] = chests_blackwood, -- Idylls of Gideon Painting, Wood
    [178443] = chests_blackwood, -- Path of Eternity Painting, Wood
    [178444] = chests_blackwood, -- A Study in Structure Painting, Wood
    [178445] = chests_blackwood, -- Leyawiin at Night Painting, Wood
    [178446] = chests_blackwood, -- Fire-Shaped Shadows Painting, Silver
    [178447] = chests_blackwood, -- Music in Repose Painting, Silver
    [178448] = chests_blackwood, -- Undying Light Painting, Silver
    [178449] = chests_blackwood, -- The Legacy of Kaladas Painting, Wood
    [178450] = chests_blackwood, -- Harvest's Gifts Painting, Wood
    [178451] = chests_blackwood, -- Reverence's Mandate Painting, Wood
  },

  [src.BAZAAR] = {
    [178694] = bazaar_1950, -- Target Ogrim
  },
}

-- 17 Markarth
FurC.MiscItemSources[ver.MARKAT] = {
  [src.DROP] = {
    [178502] = guild_disenfranchised, -- An Ode to the Disenfranchised
    [178501] = guild_nomads, -- The Nomads of Nirn
    [178500] = guild_museum, -- Museum Guild Letter
    [178499] = guild_goldleaf, -- Goldleaf Acquisitions, Manager's Notes
    [178497] = guild_aetherius, -- The Sonnet of Aetherius Art
    [178476] = guild_nomads, -- Guild Banner, Nomads of Nirn
    [178475] = guild_museum, -- Guild Banner, Museum
    [178474] = guild_goldleaf, -- Guild Banner, Goldleaf Acquisitions
    [178473] = guild_disenfranchised, -- Guild Banner, The Disenfranchised
    [178471] = guild_aetherius, -- Guild Banner, Aetherius Art
    [178472] = guild_bananas, -- Guild Banner, Dauntless Bananas
    [178498] = guild_bananas, -- A Tale of the Dauntless Bananas
  },
}

-- 15 Greymoor
FurC.MiscItemSources[ver.SKYRIM] = {
  [src.CHEST] = {
    [165829] = chests_nelsweyr, -- Before the Trade Gathering Painting, Wood
    [165830] = chests_elsweyr, -- Elsweyr Vista Painting, Wood
    [165831] = chests_nelsweyr, -- Catnap Painting, Gold
    [165832] = chests_elsweyr, -- Elsweyr Landscape Painting, Gold
    [165833] = chests_nelsweyr, -- Elsweyr Dome Architecture Painting, Gold
    [165835] = chests_nelsweyr, -- Painting of Khajiiti Arch, Gold
    [165836] = chests_skyrim, -- A Warm Welcome Awaits Painting, Wood
    [165828] = chests_elsweyr, -- Life in Repose Painting, Wood
    [165837] = chests_skyrim, -- Jarl of Morthal Painting, Wood
    [165838] = chests_skyrim, -- Painting of Nord Ship, Wood
    [165839] = chests_skyrim, -- Ursine Wandering Painting, Wood
    [165826] = chests_skyrim, -- Fields of Plenty Painting, Wood
    [165827] = chests_skyrim, -- Eternal Moment Painting, Wood
    [165840] = chests_skyrim, -- The Bridge of Dragon Painting, Wood
    [165842] = chests_skyrim, -- Dockside Painting, Silver
    [165845] = chests_skyrim, -- Painting of the Arch, Silver
    [165843] = chests_skyrim, -- River's Journey Painting, Silver
    [165841] = chests_skyrim, -- Silent Solitude Painting, Silver
    [165844] = chests_skyrim, -- The Light Within Painting, Silver
    [166440] = chests_blackr_grcaverns, -- Light as Art Painting, Wood
    [166441] = chests_blackr_grcaverns, -- Gargoyle Guardians Painting, Wood
    [166449] = chests_blackr_grcaverns, -- Scion's Throne Painting, Wood
    [166442] = chests_blackr_grcaverns, -- The Deception of Light Painting, Wood
    [166438] = chests_blackr_grcaverns, -- Red Mist Blooming Painting, Wood
    [166439] = chests_blackr_grcaverns, -- Depths of Darkness Painting, Brass
    [166443] = chests_blackr_grcaverns, -- Contrasts Painting, Brass
    [166444] = chests_blackr_grcaverns, -- Luminescence Painting, Brass
    [166445] = chests_blackr_grcaverns, -- The Keep Painting, Brass
    [166447] = chests_blackr_grcaverns, -- Boon Companion, Brass
    [166448] = chests_blackr_grcaverns, -- The Scion Strides Forth Painting, Brass
    [166446] = chests_blackr_grcaverns, -- Still Life in Death Painting, Wood
    [166437] = chests_blackr_grcaverns, -- Stillness Everlasting Painting, Wood
  },

  [src.FISHING] = {},
}

-- 11 Elsweyr
FurC.MiscItemSources[ver.KITTY] = {
  [src.DROP] = {
    [153563] = ev_elsweyr, -- Target Bone Goliath, Reanimated
  },

  [src.CHEST] = {
    [165834] = chests_elsweyr, -- A Simple Five-Claw Life Painting, Gold
  },
  [src.BAZAAR] = {
    [153814] = bazaar_2550, -- Dragon's Treasure Trove
  },
}

-- 10 Wrathstone
FurC.MiscItemSources[ver.WOTL] = {}

-- 9 Wolfhunter
FurC.MiscItemSources[ver.WEREWOLF] = {
  [src.DUNGEON] = {
    [141851] = dung_mhk_mos, -- Bear Skull, Fresh
    [141850] = dung_mhk_mos, -- Bear Skeleton, Picked Clean
    [141847] = dung_mhk_mos, -- Animal Bones, Gnawed
    [141848] = dung_mhk_mos, -- Animal Bones, Jumbled
    [141849] = dung_mhk_mos, -- Animal Bones, Fresh
    [147639] = dung_dom, -- Magna-Geode
    [147640] = dung_dom, -- Magna-Geode, Large
    [147641] = dung_dom, -- Garlas Alpinia, Tall
  },

  [src.QUEST] = {
    [141921] = daily_murk, -- Murkmire Bowl, Geometric Pattern
    [141923] = daily_murk, -- Murkmire Amphora, Seed Pattern
    [141922] = daily_murk, -- Murkmire Dish, Geometric Pattern
    [141924] = daily_murk, -- Murkmire Vase, Scale Pattern
    [141925] = daily_murk, -- Murkmire Hearth Shrine, Sithis Relief
    [141926] = daily_murk, -- Murkmire Hearth Shrine, Sithis Figure
    [141920] = daily_murk, -- Murkmire Brazier, Ceremonial
  },
}

-- 8 Murkmire
FurC.MiscItemSources[ver.SLAVES] = {
  [src.DROP] = {
    -- also stealable, see data/Justice.lua. Two sources, so two rows
    [145550] = { location = zones.MURKMIRE, note = { npcGroup = npcGroups.ENEMY_RND } }, -- Murkmire Hunting Lure, Grisly
  },
}

-- 7 Summerset Isles
FurC.MiscItemSources[ver.ALTMER] = {
  [src.QUEST] = {
    [139073] = { quest = 6129, location = zones.SUMMERSET, place = places.LILANDRIL }, -- Painting of Summerset Coast, Refined ; Quest: The Perils of Art
  },
}

-- 6 Dragon Bones
FurC.MiscItemSources[ver.DRAGONS] = {
  [src.DROP] = {
    [139060] = summerset_clamsngeysers, -- Giant Clam, Ancient
    [139062] = summerset_clamsngeysers, -- Pearl, Large
    [139063] = summerset_clamsngeysers, -- Pearl, Enormous
    [139061] = summerset_clamsngeysers, -- Giant Clam, Sealed
    [139059] = { text = "drops from Echatere, and probably a lot else" }, -- Ivory, Polished
  },

  [src.DUNGEON] = {
    [134909] = dung_fl_scp, -- Mushrooms, Puspocket Group
    [134910] = dung_fl_scp, -- Mushrooms, Puspocket Cluster
    [134911] = dung_fl_scp, -- Mushroom, Puspocket Sporecap
    [134912] = dung_fl_scp, -- Mushroom, Large Puspocket
    [134913] = dung_fl_scp, -- Mushroom, Tall Puspocket
    [134914] = dung_fl_scp, -- Mushrooms, Large Puspocket Cluster
  },

  [src.HARVEST] = {
    [139064] = { location = zones.SUMMERSET, note = "Clothing and Alchemy" }, -- Flowers, Hummingbird Mint
    [139067] = { location = zones.SUMMERSET }, -- Flower, Yellow Oleander
    [139068] = { location = zones.SUMMERSET, note = "Clothing" }, -- Plants, Springwheeze
    [139066] = { location = zones.SUMMERSET, note = "Alchemy" }, -- Plant, Redtop Grass
    [139065] = { note = "Clothing" }, -- Flowers, Lizard Tail
  },

  [src.CHEST] = {
    [139076] = chests_summerset, -- Painting of Ancient Road, Refined
    [139075] = chests_summerset, -- Painting of Sinkhole, Refined
    [139072] = elfpic, -- Painting of Monastery of Serene Harmony, Refined
    [139074] = elfpic, -- Painting of Aldmeri Ruins, Refined
    [139069] = elfpic, -- Painting of Gryphon Nest, Elegant
    [139070] = elfpic, -- Painting of College of the Sapiarchs, Refined
    [139071] = elfpic, -- Painting of High Elf Tower, Refined
  },
}

-- 5 Clockwork City
FurC.MiscItemSources[ver.CLOCKWORK] = {
  [src.DROP] = {
    [134407] = automaton_loot_cc, -- Factotum Torso, Obsolete
    [134404] = automaton_loot_cc, -- Factotum Knee, Obsolete
    [134408] = automaton_loot_cc, -- Factotum Elbow, Obsolete
    [134405] = automaton_loot_cc, -- Factotum Arm, Obsolete
    [134409] = automaton_loot_cc, -- Factotum Head, Obsolete
    [134406] = automaton_loot_cc, -- Factotum Body, Obsolete
  },

  [src.QUEST] = {
    [132348] = { quest = 6075, location = zones.CWC }, -- The Precursor ; Quest: The Oscillating Son
  },
}

-- 4 Horns of the Reach
FurC.MiscItemSources[ver.REACH] = {
  [src.DROP] = {
    [130067] = { note = { { npcClass = npcClasses.CLASS_DAEDRA }, SI_FURC_SRC_DOLMEN } }, -- Daedric Chain Segment
  },

  [src.HARVEST] = {
    [130284] = harvest_any, -- Coldharbour Glowstalk, Seedlings
    [131422] = harvest_any, -- Flower Patch, Glowstalks
    [130283] = harvest_any, -- Coldharbour Glowstalk, Sprout
    [130285] = harvest_any, -- Coldharbour Glowstalk, Young
    [131420] = harvest_any, -- Shrub, Glowing Thistle
    [130281] = harvest_any, -- Coldharbour Glowstalk, Towering
    [130282] = harvest_any, -- Coldharbour Glowstalk, Strong
    [130302] = harvest_wood, -- Shrub, Burnt Brush
    [130301] = harvest_wood, -- Saplings, Burnt Sparse
    [130300] = harvest_wood, -- Saplings, Burnt Tall
    [130299] = harvest_wood, -- Saplings, Burnt Cluster
    [130298] = harvest_wood, -- Branch, Curved Laurel
    [130297] = harvest_wood, -- Branch, Forked Laurel
    [130296] = harvest_wood, -- Branch, Sturdy Laurel
    [130295] = harvest_wood, -- Branch, Sturdy Burnt
    [130294] = harvest_wood, -- Branch, Forked Burnt
    [130293] = harvest_wood, -- Branch, Curved Burnt
    [130280] = harvest_wood, -- Sapling, Petrified Ashen
  },
}

-- 3 Morrowind
FurC.MiscItemSources[ver.MORROWIND] = {
  [src.DROP] = {
    --Public dungeon Forgotten Wastes / maybe rarest drop at all ingame
    [127149] = pdung_vv_fw, -- Morrowind Banner of the 6th House

    -- Dwemer parts
    [126660] = automaton_loot_vv, -- Dwarven Gear, Tiered
    [126659] = automaton_loot_vv, -- Dwarven Gear, Flat

    -- lootable in tombs
    [126754] = vvardenfell_tombsruins, -- Velothi Shroud, Seeker
    [126705] = vvardenfell_tombsruins, -- Velothi Shroud, Wisdom
    [126704] = vvardenfell_tombsruins, -- Velothi Shroud, Majesty
    [126706] = vvardenfell_tombsruins, -- Velothi Shroud, Knowledge
    [126701] = vvardenfell_tombsruins, -- Velothi Shroud, Nerevar
    [126764] = vvardenfell_tombsruins, -- Velothi Shroud, Prowess
    [126702] = vvardenfell_tombsruins, -- Velothi Shroud, Reverance
    [126700] = vvardenfell_tombsruins, -- Velothi Shroud, Honor
    [126703] = vvardenfell_tombsruins, -- Velothi Shroud, Mysteries
    [126752] = vvardenfell_tombsruins, -- Velothi Shroud, Discovery
    [126755] = vvardenfell_tombsruins, -- Velothi Shroud, Change
    [126756] = vvardenfell_tombsruins, -- Velothi Shroud, Mercy
    [126773] = vvardenfell_tombsruins, -- Velothi Caisson, Crypt
    [126753] = vvardenfell_tombsruins, -- Velothi Cerecloth, Austere
    [126758] = vvardenfell_tombsruins, -- Velothi Mat, Prayer
    [126757] = vvardenfell_tombsruins,
    [126593] = painting_vvardenfell, -- Velothi Tryptich, Volcano
    [126594] = painting_vvardenfell, -- Velothi Painting, Classic Volcano
    [126595] = painting_vvardenfell, -- Velothi Painting, Modest Volcano
    [126596] = painting_vvardenfell, -- Velothi Tapestry, Volcano
    [126605] = painting_vvardenfell, -- Velothi Tryptich, Waterfall
    [126606] = painting_vvardenfell, -- Velothi Tapestry, Waterfall
    [126608] = painting_vvardenfell, -- Velothi Painting, Classic Waterfall
    [126609] = painting_vvardenfell, -- Velothi Painting, Modest Waterfall
    [126599] = painting_vvardenfell, -- Velothi Tryptich, Geyser
    [126600] = painting_vvardenfell, -- Velothi Tapestry, Geyser
    [126602] = painting_vvardenfell, -- Velothi Painting, Classic Geyser
    [126603] = painting_vvardenfell, -- Velothi Painting, Modest Geyser
    [125597] = { location = zones.VVARDENFELL, note = "shroom beetles" }, -- Mushroom, Polyp Stinkhorn
  },

  [src.HARVEST] = {
    [125631] = plants_vvardenfell, -- Plants, Ash Frond
    [125544] = plants_vvardenfell, -- Fern, Strong Dusky
    [131420] = plants_vvardenfell, -- Plants, Ash Frond
    [125553] = plants_vvardenfell, -- Flowers, Netch Cabbage Stalks
    [125551] = plants_vvardenfell, -- Flowers, Netch Cabbage
    [125552] = plants_vvardenfell, -- Flowers, Netch Cabbage Patch
    [125543] = plants_vvardenfell, -- Fern, Ashen
    [125633] = plants_vvardenfell, -- Plants, Hanging Pitcher Pair
    [125680] = plants_vvardenfell, -- Vines, Ashen Moss
    [126830] = plants_vvardenfell, -- Mushrooms, Volcanic Cluster
    [125562] = plants_vvardenfell, -- Grass, Foxtail Cluster
    [125595] = plants_vvardenfell, -- Mushroom, Poison Pax Shelf
    [125596] = plants_vvardenfell, -- Mushroom, Poison Pax Stool
    [125600] = plants_vvardenfell, -- Mushroom, Spongecap Patch
    [125606] = plants_vvardenfell, -- Mushroom, Young Milkcap
    [125583] = plants_vvardenfell, -- Mushroom, Cave Bracket
    [125608] = plants_vvardenfell, -- Mushrooms, Buttercake Cluster
    [125609] = plants_vvardenfell, -- Mushrooms, Buttercake Stack
    [125613] = plants_vvardenfell, -- Mushrooms, Lavaburst Sprouts
    [125590] = plants_vvardenfell, -- Mushrooms, Lavaburst Cluster
    [125617] = plants_vvardenfell, -- Plant, Bitter Stalk
    [125618] = plants_vvardenfell, -- Plant, Golden Lichen
    [125619] = plants_vvardenfell, -- Plant, Hanging Pitcher
    [125620] = plants_vvardenfell, -- Plant, Hefty Elkhorn
    [125621] = plants_vvardenfell, -- Plant, Lava Brier
    [125622] = plants_vvardenfell, -- Plant, Lava Leaf
    [125630] = plants_vvardenfell, -- Plant, Young Elkhorn
    [125632] = plants_vvardenfell, -- Plants, Hanging Pitcher Cluster
    [125634] = plants_vvardenfell, -- Plants, Lava Pitcher Cluster
    [125635] = plants_vvardenfell, -- Plants, Lava Pitcher Shoots
    [125636] = plants_vvardenfell, -- Plants, Swamp Pitcher Cluster
    [125637] = plants_vvardenfell, -- Plants, Swamp Pitcher Shoots
    [125647] = plants_vvardenfell, -- Shrub, Bitter Brush
    [125648] = plants_vvardenfell, -- Shrub, Bitter Cluster
    [125649] = plants_vvardenfell, -- Shrub, Flowering Dusk
    [125650] = plants_vvardenfell, -- Shrub, Golden Lichen
    [125670] = plants_vvardenfell, -- Toadstool, Bloodtooth
    [125671] = plants_vvardenfell, -- Toadstool, Bloodtooth Cap
    [125672] = plants_vvardenfell, -- Toadstool, Bloodtooth Cluster
  },

  [src.CHEST] = {
    [126465] = painting_vvardenfell_chests, -- Telvanni Painting, Modest Volcanic
    [126466] = painting_vvardenfell_chests, -- Telvanni Painting, Modest Forest
    [126467] = painting_vvardenfell_chests, -- Telvanni Painting, Modest Valley
    [126468] = painting_vvardenfell_chests, -- Telvanni Painting, Classic Volcanic
    [126469] = painting_vvardenfell_chests, -- Telvanni Painting, Classic Forest
    [126470] = painting_vvardenfell_chests, -- Telvanni Painting, Classic Valley
  },

  [src.QUEST] = {
    [126119] = daily_ashlander, -- Crimson Shard of Moonshadow
    [126393] = daily_ashlander, -- Ashlander Knife, Cheese
    [126759] = { quest = 5864, location = zones.VVARDENFELL, place = places.VVARDENFELL_SURAN }, -- Sir Sock's Ball of Yarn ; Quest: 'Nothing to Sneeze At'
  },
}

-- 2 Homestead
FurC.MiscItemSources[ver.HOMESTEAD] = {
  [src.DROP] = {
    [121058] = db_sneaky, -- Candles of Silence
    [119936] = db_poison, -- Poisoned Blood
    [119938] = db_poison, -- Light and Shadow
    [119952] = db_equip, -- Sacrificial Heart
  },

  [src.CHEST] = {
    [118216] = chestsGeneral, -- Painting of Spring, Sturdy
    [118217] = chestsGeneral, -- Painting of Pasture, Sturdy
    [118218] = chestsGeneral, -- Painting of Creek, Sturdy
    [118219] = chestsGeneral, -- Painting of Lakes, Sturdy
    [118220] = chestsGeneral, -- Painting of Crags, Sturdy
    [118221] = chestsGeneral, -- Painting of Summer, Sturdy
    [118222] = chestsGeneral, -- Painting of Jungle, Sturdy
    [118223] = chestsGeneral, -- Painting of Palms, Sturdy
    [118265] = chestsGeneral, -- Painting of Winter, Bolted
    [118266] = chestsGeneral, -- Painting of Bridge, Bolted
    [118267] = chestsGeneral, -- Painting of Autumn, Bolted
    [118268] = chestsGeneral, -- Painting of Great Ruins, Bolted
  },
}
