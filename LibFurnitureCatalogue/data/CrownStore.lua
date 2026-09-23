-- Data: CrownStore (bundles, packs, housing editor, scamboxes)
--
-- `LFC.API.GetSourceDetails` publishes these ids as a record, and the consumer renders the line from it
--
-- A row is one source, or a list of sources when the item has several
-- One field decides which kind of source it is:
--
--   itemPrice  what it costs in crowns
--   pack       ItemPacks (furnishing pack)
--   bundle     ItemBundles (Crown Store bundle that is not a container/crate)
--   crate      CrownCrateIds value, or `true` when the file does not record which crate
--   houses     collectible ids of the houses it comes furnished with
--   note       string id, for a house purchase that names no house
--   category   string id, when the row is not a crown-store offer at all (crafting, levelup reward)
--

FurC.CrownStore = FurC.CrownStore or {}

local LFC = LibFurnitureCatalogue
local bundles = LFC.Internal.Constants.ItemBundles
local crateIds = LFC.Internal.Constants.CrownCrateIds
local packs = LFC.Internal.Constants.ItemPacks
local src = LFC.Internal.Constants.ItemSources
local ver = LFC.Internal.Constants.Versioning

--[[ If the item has multiple sources (particularly if it is sold in
the housing editor as well as a house and/or furnishing pack or crown
crate), put it in the EDITOR table of the version of its first appearance
because this means it's available all the time. List all sources. If even one
of those sources isn't crowns, IT DOESN'T BELONG IN THIS FILE.]]
--

FurC.CrownStore[ver.THIEVES] = {
  [src.CROWN] = {
    [224739] = { crate = crateIds.ANU_PAD }, -- Aetherean Rupture, Liminal
    [224843] = { crate = crateIds.ANU_PAD }, -- Starsong Staircase, Spiral
    [224846] = { crate = crateIds.ANU_PAD }, -- Marble Platform, Anu Pattern Square
    [224845] = { crate = crateIds.ANU_PAD }, -- Sigil Trim, Padomay Pattern
    [224844] = { crate = crateIds.ANU_PAD }, -- Sigil Trim, Anu Pattern
    [224847] = { crate = crateIds.ANU_PAD }, -- Marble Platform, Padomay Pattern Square
    [224848] = { crate = crateIds.ANU_PAD }, -- Marble Pillar, Anu Pattern
    [224849] = { crate = crateIds.ANU_PAD }, -- Marble Pillar, Padomay Pattern
    [224853] = { pack = packs.DARIEN }, -- A Hero Strides Forth Painting, Gold
    [224852] = { pack = packs.DARIEN }, -- An Evening with Darien Painting, Gold
    [224851] = { pack = packs.DARIEN }, -- Statue, Meridia's Champion
    [225088] = { pack = packs.DARIEN }, -- Cheers to the Hero Painting, Gold
  },
}

FurC.CrownStore[ver.ZERO] = {
  [src.CROWN] = {
    [223743] = { itemPrice = 4000 }, -- Almalexia, Mother Morrowind
    [223735] = { itemPrice = 1200 }, -- Music Box, Duel of the Seablades
    [223744] = { pack = packs.TOYMAKER }, -- Toymaker's Diorama, Racing
    [223745] = { pack = packs.TOYMAKER }, -- Toymaker's Mobile, Animals
    [223746] = { pack = packs.TOYMAKER }, -- Mudcrab Moppet, Tan
    [223747] = { pack = packs.TOYMAKER }, -- Jerboa Moppet, Tan
    [223748] = { pack = packs.TOYMAKER }, -- Lion Cub Moppet, Tan
    [223749] = { pack = packs.TOYMAKER }, -- Guar Moppet, Tan
    [223750] = { pack = packs.TOYMAKER }, -- Vvardvark Moppet, Tan
    [223751] = { pack = packs.TOYMAKER }, -- Bantam Guar Moppet, Tan
    [223738] = { crate = crateIds.WAVE }, -- Warrior Wave Platform, Yathian Turquoise
    [223739] = { crate = crateIds.WAVE }, -- Warrior Wave Illustrated Tome
    [223736] = { crate = crateIds.WAVE }, -- Warrior Wave Door, Glinting Talon
    [223737] = { crate = crateIds.WAVE }, -- Warrior Wave Bed, Winged
    [223740] = { crate = crateIds.WAVE }, -- Warrior Wave Lamp, Small
    [223741] = { crate = crateIds.WAVE }, -- Warrior Wave Lamp, Medium
    [223742] = { crate = crateIds.WAVE }, -- Warrior Wave Lamp, Large
  },

  [src.EDITOR] = {},
}

FurC.CrownStore[ver.WORMS2] = {
  [src.CROWN] = {
    [223146] = { pack = packs.WRITHING }, -- Writhing Wall, Soulstream
    [223145] = { pack = packs.WRITHING }, -- Writhing Wall, Segment
    [223144] = { pack = packs.WRITHING }, -- Black Soul Gems, Giant Cluster
    [223142] = { pack = packs.WRITHING }, -- Black Soul Gems, Spiky Cluster
    [223143] = { pack = packs.WRITHING }, -- Black Soul Gems, Patch
    [223135] = { pack = packs.WRITHING }, -- Worm King's Throne, Base Replica
    [223136] = { pack = packs.WRITHING }, -- Writhing Fortress Pylon, Massive
    [223184] = { pack = packs.WRITHING }, -- Writhing Fortress Pylon, Massive Crystal
    [219876] = { pack = packs.WRITHING }, -- Target Maldrith
    [223182] = { pack = packs.WRITHING }, -- Black Soul Gems, Massive Spire
    [223183] = { pack = packs.WRITHING }, -- Replica Soul Flayer
    [223137] = { pack = packs.WRITHING }, -- Worm Cult Banner, Post
    [223138] = { pack = packs.WRITHING }, -- Worm Cult Banner, Hanging
    [223140] = { pack = packs.WRITHING }, -- Worm Cult Relic, Panel
    [223134] = { { pack = packs.WRITHING }, { houses = { 13881 } } }, -- Statue, Arch-Deacon of Worms
    [223126] = { pack = packs.WINTER }, -- Stormhaven Potted Plant, Poinsettia
    [223127] = { pack = packs.WINTER }, -- New Life Festive Fir, Giant
    [223128] = { pack = packs.WINTER }, -- New Life Dessert Banquet
    [223129] = { pack = packs.WINTER }, -- New Life Feast Banquet
    [223130] = { pack = packs.WINTER }, -- New Life Garland, Long
    [223132] = { pack = packs.WINTER }, -- Indrik Statue, Brass
    [223133] = { pack = packs.WINTER }, -- New Life Candle, Floating
    [219867] = { crate = crateIds.ORSINIUM }, -- Paper Lantern, Blue
    [219868] = { crate = crateIds.ORSINIUM }, -- Paper Lantern, Gold
    [219869] = { crate = crateIds.ORSINIUM }, -- Paper Lantern, Green
    [223123] = { crate = crateIds.ORSINIUM }, -- Paper Lantern, Purple
    [223124] = { crate = crateIds.ORSINIUM }, -- Paper Lantern, Red
    [219863] = { crate = crateIds.ORSINIUM }, -- Forgemaster's Throne
    [219864] = { crate = crateIds.ORSINIUM }, -- Bazaar Chandelier, Paper Lantern
    [219866] = { crate = crateIds.ORSINIUM }, -- Honorfeather Dove Flock
    [219865] = { crate = crateIds.ORSINIUM }, -- Sphere of Kynareth's Lightning
    [223732] = { houses = { 13881 } }, -- Target Worm Colossus
    [223942] = { houses = { 13882 } }, -- Druidspring Gazebo, Round
  },

  [src.EDITOR] = {
    [223178] = { { itemPrice = 2800 }, { houses = { 13881 } } }, -- Worm Cult Winch, Chain
    [223179] = { { itemPrice = 260 }, { houses = { 13881 } } }, -- Worm Cult Rack, Ballista
    [223180] = { { itemPrice = 380 }, { houses = { 13881 } } }, -- Worm Cult Ballista, Decommissioned
    [223181] = { { itemPrice = 240 }, { houses = { 13881 } } }, -- Worm Cult Armchair, Padded
  },
}

FurC.CrownStore[ver.SHADOWS] = {
  [src.CROWN] = {
    [217691] = { pack = packs.MOONPATH }, -- Moonlight Path Bridge, Long
    [217689] = { pack = packs.MOONPATH }, -- Moonlight Path Platform, Whorls
    [217690] = { pack = packs.MOONPATH }, -- Moonlight Path Bridge, Curved
    [217692] = { pack = packs.MOONPATH }, -- Moonlight Path Sparkles, Trail
    [217693] = { pack = packs.MOONPATH }, -- Moonlight Path Sparkles, Stationary
    [217694] = { pack = packs.SANGUINE }, -- Carnaval Fountain, Wine
    [217695] = { pack = packs.SANGUINE }, -- Carnaval Tent, Open
    [217696] = { pack = packs.SANGUINE }, -- Carnaval Wall, Square Cloth
    [217697] = { pack = packs.SANGUINE }, -- Carnaval Wall, Rectangular Cloth
    [217698] = { pack = packs.SANGUINE }, -- Carnaval Wall, Triangular Cloth
    [217699] = { pack = packs.SANGUINE }, -- Carnaval Pennants, String
    [217700] = { pack = packs.SANGUINE }, -- Carnaval Stall, Merchant
    [217701] = { pack = packs.SANGUINE }, -- Carnaval Confetti, Cascade
    [217702] = { pack = packs.SANGUINE }, -- Carnaval Confetti, Burst
    [217687] = { crate = crateIds.KINDRED }, -- Ceremonial Peryite Skeever Altar
    [217686] = { crate = crateIds.KINDRED }, -- Ceremonial Peryite Skeever Stake
    [217684] = { crate = crateIds.KINDRED }, -- Vaermina Dreamtrapper Pillar
    [217683] = { crate = crateIds.KINDRED }, -- Vaermina Nightmare Sconce
    [217685] = { crate = crateIds.KINDRED }, -- Mara's Blessed Garland
  },

  [src.EDITOR] = {},
}

FurC.CrownStore[ver.WORMS] = {
  [src.CROWN] = {
    [214332] = { crate = crateIds.AKA_ALDU }, -- Dragonclash Firepit
    [214333] = { crate = crateIds.AKA_ALDU }, -- Stone-Nest Spellmote
    [214331] = { crate = crateIds.AKA_ALDU }, -- World-Eater Effigy
    [214334] = { crate = crateIds.AKA_ALDU }, -- Illusory Dragon God Ornamentation
    [214335] = { pack = packs.THEATER }, -- Clockwork Spotlight Cycler
    [214336] = { pack = packs.THEATER }, -- Scrolling Theater Backdrop
    [214337] = { pack = packs.NEREID }, -- Statue, Nereid
    [214338] = { pack = packs.NEREID }, -- Waterfall, Everlasting
    [214339] = { pack = packs.NEREID }, -- Scenic Waterfall, Linear
    [214340] = { pack = packs.NEREID }, -- Scenic Waterfall, Branched
    [214341] = { pack = packs.NEREID }, -- Everlasting Splashes
    [214342] = { pack = packs.NEREID }, -- Geyser, Cone
    [214344] = { pack = packs.NEREID }, -- Basin, Grand
  },

  [src.EDITOR] = {
    [214454] = { { itemPrice = 20 }, { houses = { 13558 } } }, -- Solstice Shell, Fossilized Echinoid
    [214520] = { { itemPrice = 45 }, { houses = { 13560 } } }, -- Elkhorn Coral, Sturdy Branching
    [214518] = { { itemPrice = 20 }, { houses = { 13560 } } }, -- Coral Formation, Tiered Shelves
    [214521] = { { itemPrice = 20 }, { houses = { 13560 } } }, -- Elkhorn Coral, Cluster
    [214519] = { { itemPrice = 90 }, { houses = { 13560 } } }, -- Elkhorn Coral, Verdant Branching
    [214516] = { { itemPrice = 350 }, { houses = { 13560 } } }, -- Antler Coral, Glowing Branched Crimson
    [214515] = { { itemPrice = 350 }, { houses = { 13560 } } }, -- Antler Coral, Glowing Broad Crimson
    [118152] = { { itemPrice = 180 }, { houses = { 13560 } } }, -- Carpet Roll, Sunrise
    [118153] = { { itemPrice = 180 }, { houses = { 13560 } } }, -- Carpet Roll, Floral
    [118154] = { { itemPrice = 180 }, { houses = { 13560 } } }, -- Carpet Roll, Oasis
    [118155] = { { itemPrice = 180 }, { houses = { 13560 } } }, -- Carpet Roll, Desert
    [214514] = { itemPrice = 350 }, -- Antler Coral, Glowing Short Crimson
  },
}

FurC.CrownStore[ver.FALLBAN] = {
  [src.CROWN] = {
    [212419] = { crate = crateIds.CARNAVAL }, -- Carnaval Window, Stained Glass
    [212418] = { crate = crateIds.CARNAVAL }, -- Sanguine's Wall
    [212417] = { crate = crateIds.CARNAVAL }, -- Carnaval Stage
    [212416] = { crate = crateIds.CARNAVAL }, -- Lightning Wall
    [214250] = { pack = packs.COMBAT }, -- Dueling Mat
    [214254] = { pack = packs.COMBAT }, -- Battleground Powerup, Speed
    [214253] = { pack = packs.COMBAT }, -- Battleground Powerup, Ultimate
    [214252] = { pack = packs.COMBAT }, -- Battleground Powerup, Defense
    [214251] = { pack = packs.COMBAT }, -- Battleground Powerup, Damage
    [212423] = { pack = packs.LOOM }, -- Replica Mirrormoor Loom, Altar
    [212422] = { pack = packs.LOOM }, -- Replica Mirrormoor Loom, Backing
    [212421] = { pack = packs.LOOM }, -- Replica Mirrormoor Loom, Spindle
    [212213] = { houses = { 13078, 13759 } }, -- Colovian Gazebo
    [212214] = { houses = { 13078 } }, -- Skingrad Banner
    [212420] = { itemPrice = 1200 }, -- Music Box, Jester's Caprice
  },

  [src.EDITOR] = {},
}

FurC.CrownStore[ver.BASE44] = {
  [src.CROWN] = {
    [211302] = { crate = crateIds.MIRROR }, -- Mirrormoor Wall Sconce
    [211301] = { crate = crateIds.MIRROR }, -- Replica Fate-Thread Fracture
    [211300] = { crate = crateIds.MIRROR }, -- Target Tho'at Replicanum, Robust
    [211299] = { crate = crateIds.MIRROR }, -- Fargrave Miasma Censer
    [125561] = { houses = { 12732 } }, -- Mushrooms, Mucksponge Podlet
    [115271] = { houses = { 12732 } }, -- Breton Statue, Druid
    [115270] = { houses = { 12732 } }, -- Breton Statue, Guard
    [210890] = { houses = { 12732 } }, -- 10-Year Anniversary Banner, Large
    [210891] = { houses = { 12732 } }, -- 10-Year Anniversary Banner, Medium
    [210892] = { houses = { 12732 } }, -- 10-Year Anniversary Banner, Small
    [210893] = { houses = { 12732 } }, -- 10-Year Anniversary Rug, Round
    [210894] = { houses = { 12732 } }, -- 10-Year Anniversary Rug, Rectangular
    [210895] = { houses = { 12732 } }, -- 10-Year Anniversary Rug, Runner
    [210896] = { houses = { 12732 } }, -- 10-Year Anniversary Drape, Wall
    [211499] = { pack = packs.DWARVEN }, -- Target Dwarf-light the Destroyer, Robust
    [199113] = { itemPrice = 1100 }, -- Music Box, New Life Snow Symphony
    [211498] = { itemPrice = 1200 }, -- Music Box, Merry Mudcrab Melody
  },

  [src.EDITOR] = {
    [211502] = { { itemPrice = 410 }, { pack = packs.DWARVEN } }, -- Dwarven Furnace
    [211501] = { { itemPrice = 270 }, { pack = packs.DWARVEN } }, -- Dwarven Dais, Stone
    [211500] = { { itemPrice = 1200 }, { pack = packs.DWARVEN } }, -- Dwarven Archway
    [203880] = { { itemPrice = 200 }, { pack = packs.DWARVEN } }, -- Dwarven Red Lamp, Cylinder Cage
  },
}

FurC.CrownStore[ver.BASE43] = {
  [src.CROWN] = {
    [208125] = { crate = crateIds.DB }, -- Hollowsoul Arrangement
    [208124] = { crate = crateIds.DB }, -- Ardor's Cascade
    [208123] = { crate = crateIds.DB }, -- Bloodfont of Sithis
    [208122] = { crate = crateIds.DB }, -- Vision of the Bloodmoon
    [208358] = { houses = { 12655 } }, -- Handbook for New Homeowners
    [204792] = { houses = { 12656 } }, -- Table, Visions of the Five Companions
    [115052] = { houses = { 12656 } }, -- Imperial Simple Lamppost
    [208159] = { houses = { 12656 } }, -- Imperial Banner, Emperor's
    [208126] = { itemPrice = 3500 }, -- Statue, Mistress of Nightmares
    [203608] = { pack = packs.HAUNTED }, -- Spooky Fog, Glowing
    [203607] = { pack = packs.HAUNTED }, -- Haunted Chair
    [203606] = { pack = packs.HAUNTED }, -- Haunted Skull
    [203605] = { pack = packs.HAUNTED }, -- Haunted Broom
    [208127] = { pack = packs.HAUNTED }, -- Haunted Table
    [203604] = { pack = packs.HAUNTED }, -- Haunted Bookcase, Whispering
    [203603] = { pack = packs.HAUNTED }, -- Haunted Still Life Painting
    [203602] = { pack = packs.HAUNTED }, -- Haunted Door, Clattering
    [203601] = { pack = packs.HAUNTED }, -- Haunted Dresser, Floating
  },

  [src.EDITOR] = {
    [207974] = { { itemPrice = 90 }, { houses = { 12656 } } }, -- Tree, Large Green Beech
    [207978] = { { itemPrice = 90 }, { houses = { 12656 } } }, -- Tree, Large Yellow Beech
    [207979] = { { itemPrice = 90 }, { houses = { 12656 } } }, -- Tree, Small Yellow Beech Cluster
    [207975] = { { itemPrice = 60 }, { houses = { 12656 } } }, -- Tree, Small Green Beech
    [207977] = { { itemPrice = 60 }, { houses = { 12656 } } }, -- Tree, Small Red Beech
    [207976] = { { itemPrice = 430 }, { houses = { 12656 } } }, -- Tree, Large Red Beech
  },
}

FurC.CrownStore[ver.WEALD] = {
  [src.CROWN] = {
    [204422] = { itemPrice = 1100 }, -- Music Box, Ascension to the Ruby Throne
    [204407] = { itemPrice = 3000 }, -- Daedric Statue, Sanguine
    [204408] = { itemPrice = 6000 }, -- Target Serpent's Image, Trial
    [204409] = { crate = crateIds.DIAMOND }, -- Dark Anchor Gateway
    [204411] = { crate = crateIds.DIAMOND }, -- Coldharbour Sentinel
    [204412] = { crate = crateIds.DIAMOND }, -- Revelry Sparkles
    [204410] = { crate = crateIds.DIAMOND }, -- Five Companions Tome
  },

  [src.EDITOR] = {
    [205388] = { { itemPrice = 2400 }, { houses = { 12472 } } }, -- Colovian Windmill, Decorative
  },
}

FurC.CrownStore[ver.SCIONS] = {
  [src.CROWN] = {
    [203267] = { crate = crateIds.LAMP }, -- Order of the Lamp Pedestal
    [203266] = { crate = crateIds.LAMP }, -- Twinkling Lights, Blue
    [203265] = { crate = crateIds.LAMP }, -- Prismatic Cherry Tree
    [203264] = { crate = crateIds.LAMP }, -- Cursed Curio Aether
    [117914] = { houses = { 14078, 11456 } }, -- Redguard Canopy, Florid
    [117912] = { houses = { 14078, 11456 } }, -- Redguard Awning, Florid
    [204455] = { houses = { 11456 } }, -- Redguard Tent, Squared Blue
    [203899] = { houses = { 11456 } }, -- Redguard Tent, Rectangular Silk
    [203897] = { houses = { 11456 } }, -- Redguard Tent, Blue Lean-To
    [203896] = { houses = { 11456 } }, -- Bush, Cave Lichen Patch
    [203895] = { houses = { 11456 } }, -- Bush, Cave Lichen Cluster
    [203894] = { houses = { 11456 } }, -- Bush, Cave Lichen
    [203599] = { houses = { 11456 } }, -- Redguard Fountain, Lion
    [203598] = { houses = { 11456 } }, -- Flowers, Desert Blush
    [203597] = { houses = { 11456 } }, -- Shrubs, Speckled Forest Cluster
    [203596] = { houses = { 11456 } }, -- Ferns, Desert Cluster
    [117873] = { houses = { 11456 } }, -- Redguard Rugs, Rolled
    [117867] = { houses = { 11456 } }, -- Statue, Redguard's Respect
    [117862] = { houses = { 11456 } }, -- Redguard Cart, Merchant
    [190942] = { itemPrice = 1000 }, -- Music Box, Mad God's Garden
    [203270] = { pack = packs.JESTER }, -- Target King Boar, Robust
    [203269] = { pack = packs.JESTER }, -- Chamber Pot Throne
    [203268] = { pack = packs.JESTER }, -- Jester's Festival Stage
    [203165] = { pack = packs.JESTER }, -- Dazzler Dispenser
    [203271] = { pack = packs.JESTER }, -- Banner, Jester's Festival
  },

  [src.EDITOR] = {
    [204434] = { { itemPrice = 320, source = src.EDITOR }, { houses = { 14078, 12270 } } }, -- Breton Rowboat
    [204433] = { { itemPrice = 45 }, { houses = { 12270 } } }, -- Lily Pads, Flowering Patch
    [204432] = { { itemPrice = 20 }, { houses = { 12270 } } }, -- Lily Pads, Flowering Cluster
    [204431] = { { itemPrice = 60 }, { houses = { 12270 } } }, -- Tree, Young Gentle Weeping Willow
    [204430] = { { itemPrice = 100 }, { houses = { 12270 } } }, -- Tree, Tall Gentle Weeping Willow
    [204429] = { { itemPrice = 230 }, { houses = { 12270 } } }, -- Tree, Giant Gentle Weeping Willow
    [204428] = { { itemPrice = 40 }, { houses = { 12270 } } }, -- Stumps, Swampshadow Cluster
    [204427] = { { itemPrice = 40 }, { houses = { 12270 } } }, -- Tree, Young Swampshadow
    [204426] = { { itemPrice = 100 }, { houses = { 12270 } } }, -- Tree, Swampshadow
    [204425] = { { itemPrice = 230 }, { houses = { 12270 } } }, -- Tree, Giant Swampshadow
    [203274] = { { itemPrice = 10 }, { pack = packs.JESTER } }, -- Box of Tomatoes
    [203275] = { { itemPrice = 25 }, { pack = packs.JESTER } }, -- Fish, Silver Trout
    [203272] = { { itemPrice = 60 }, { pack = packs.JESTER } }, -- Rough Bench
    [203273] = { { itemPrice = 40 }, { pack = packs.JESTER } }, -- Rough Chair
    [203276] = { { itemPrice = 50 }, { pack = packs.JESTER } }, -- Rough Dresser
  },
}

FurC.CrownStore[ver.ENDLESS] = {
  [src.CROWN] = {
    [199112] = { crate = crateIds.ALLMAKER }, -- Chandelier, Kyne's Radiance
    [199111] = { crate = crateIds.ALLMAKER }, -- Fountain, Kyne's Radiance
    [199110] = { crate = crateIds.ALLMAKER }, -- Snowfall, Gentle
    [199109] = { crate = crateIds.ALLMAKER }, -- Boulder, Clear Ice
    [197823] = { crate = crateIds.ARMIGER }, -- Necrom Podium, Buoyant Armiger
    [197824] = { crate = crateIds.ARMIGER }, -- Harrowstorm Mists
    [197822] = { crate = crateIds.ARMIGER }, -- Redoran Sconce, Beetle
    [197821] = { crate = crateIds.ARMIGER }, -- Spellscar Bridge
    [197826] = { itemPrice = 1200 }, -- Music Box, Witchmother's Bubbling Brew
    [203166] = { itemPrice = 2800 }, -- Sai Sahan Statue
    [197825] = { itemPrice = 3000 }, -- Statue, The Thirty-Fourth Sermon
    [197833] = { pack = packs.NECROM }, -- Statue, Telvanni Spellwright
    [197834] = { pack = packs.NECROM }, -- Statue, Telvanni Magister
    [197832] = { pack = packs.NECROM }, -- Necrom Gazebo
    [199135] = { pack = packs.CURIO }, -- Apocrypha Pool, Inky
    [199134] = { pack = packs.CURIO }, -- Apocrypha Waterfall, Inky
    [199133] = { pack = packs.CURIO }, -- Target Daedra, Seeker
    [198672] = { pack = packs.DRUIDIC }, -- Vines, Verdant Ivy Runner
    [198669] = { pack = packs.DRUIDIC }, -- Breton Statue, Chimera
    [146047] = { { houses = { 9735 } }, { pack = packs.NEWLIFE2018 } }, -- From Old Life To New
    [145467] = { pack = packs.SWAMP }, -- The Way of Shadow
  },

  [src.EDITOR] = {
    [203178] = { { itemPrice = 140 }, { pack = packs.CURIO } }, -- Apocrypha Coral, Large Teal Tube
    [203177] = { { itemPrice = 140 }, { pack = packs.CURIO } }, -- Apocrypha Coral, Pink Tube
    [203176] = { { itemPrice = 770 }, { pack = packs.CURIO } }, -- Apocrypha Geyser, Ink
    [199136] = { { itemPrice = 130 }, { pack = packs.CURIO } }, -- Apocrypha Stalks, Scryeball Patch
    [203133] = { { itemPrice = 20 }, { pack = packs.CURIO } }, -- Apocrypha Coral, Spiky
    [198747] = { { itemPrice = 430 }, { pack = packs.DRUIDIC } }, -- Druidic Statue, Ancient Augur
    [198674] = { { itemPrice = 110 }, { pack = packs.DRUIDIC } }, -- Galen Dogwood, Tall
    [198671] = { { itemPrice = 780 }, { pack = packs.DRUIDIC } }, -- Druid King's Sentinel
    [198670] = { { itemPrice = 510 }, { pack = packs.DRUIDIC } }, -- Druidic Hut, Conical Stone
    [197839] = { { itemPrice = 370 }, { pack = packs.NECROM } }, -- Mushrooms, Ambershine Ring
    [197838] = { { itemPrice = 370 }, { pack = packs.NECROM } }, -- Mushrooms, Ambershine Patch
    [197837] = { { itemPrice = 70 }, { pack = packs.NECROM } }, -- Mushrooms, Tall Green Morel Cluster
    [197836] = { { itemPrice = 70 }, { pack = packs.NECROM } }, -- Mushroom, Tall Green Morel
    [197835] = { { itemPrice = 30 }, { pack = packs.NECROM } }, -- Mushrooms, Tall Chanterelle Cluster
    [198664] = { { itemPrice = 140 }, { pack = packs.DRUIDIC }, { houses = { 11655 } } }, -- Galen Dogwood, Small
    [198666] = { { itemPrice = 170 }, { pack = packs.DRUIDIC }, { houses = { 11655 } } }, -- Galen Dogwood, Twisted
    [198663] = { { itemPrice = 10 }, { pack = packs.DRUIDIC }, { houses = { 11655, 13759 } } }, -- Fern Plant, Low Lush
    [198662] = { { itemPrice = 10 }, { pack = packs.DRUIDIC }, { houses = { 11655, 13759 } } }, -- Flowers, Orange Daylily Cluster
    [197840] = { { itemPrice = 260 }, { pack = packs.NECROM }, { houses = { 11525 } } }, -- Necrom Brazier, Elegant Stone
    [203132] = { { itemPrice = 50 }, { houses = { 11687 } } }, -- Mushroom, Apocrypha Fossilized
    [203202] = { { itemPrice = 770 }, { houses = { 11687 } } }, -- Hermaeus Mora Banner, Large
    [198651] = { { itemPrice = 55 }, { houses = { 13882, 11655, 13758 } } }, -- Druidic Brazier, Standing
    [198667] = { { itemPrice = 170 }, { houses = { 11655 } } }, -- Galen Dogwood, Curved
    [198665] = { { itemPrice = 10 }, { houses = { 11655, 13759 } } }, -- Plant, Emerald Heart Begonia
    [198661] = { { itemPrice = 65 }, { houses = { 11655 } } }, -- Druidic Pot, Stout Clay
    [198660] = { { itemPrice = 20 }, { houses = { 11655 } } }, -- Druidic Pitcher, Clay
    [198659] = { { itemPrice = 80 }, { houses = { 11655 } } }, -- Druidic Kettle, Clay
    [198658] = { { itemPrice = 65 }, { houses = { 11655 } } }, -- Druidic Pot, Wide Clay
    [198657] = { { itemPrice = 10 }, { houses = { 11655 } } }, -- Druidic Plate, Clay
    [198656] = { { itemPrice = 15 }, { houses = { 11655 } } }, -- Druidic Plates, Clay Stack
    [198655] = { { itemPrice = 30 }, { houses = { 11655 } } }, -- Druidic Covered Dish, Stone
    [198654] = { { itemPrice = 5 }, { houses = { 11655 } } }, -- Druidic Plate, Stone
    [198653] = { { itemPrice = 5 }, { houses = { 11655 } } }, -- Druidic Goblet, Stone
    [198652] = { { itemPrice = 5 }, { houses = { 11655 } } }, -- Druidic Bowl, Stone
    [198650] = { { itemPrice = 55 }, { houses = { 11655 } } }, -- Druidic Brazier, Leaning
    [198649] = { { itemPrice = 10 }, { houses = { 11655 } } }, -- Druidic Smoking Rack, Fish
    [198648] = { { itemPrice = 10 }, { houses = { 11655 } } }, -- Druidic Rack, Hide Stretcher
    [198647] = { { itemPrice = 30 }, { houses = { 11655 } } }, -- Druidic Drying Rack, Tall
    [198646] = { { itemPrice = 30 }, { houses = { 11655 } } }, -- Druidic Drying Rack, Wide
  },
}

FurC.CrownStore[ver.BASED] = {
  [src.CROWN] = {},

  [src.EDITOR] = {
    [198561] = { { itemPrice = 25 }, { houses = { 11260 } } }, -- Vine, Wide Moonlit Ivy Drape
    [198560] = { { itemPrice = 25 }, { houses = { 11260 } } }, -- Vine, Large Moonlit Ivy Swath
    [198559] = { { itemPrice = 25 }, { houses = { 11260 } } }, -- Vine, Large Moonlit Ivy Drape
    [198558] = { { itemPrice = 25 }, { houses = { 11260 } } }, -- Vine, Medium Moonlit Ivy Swath
    [198557] = { { itemPrice = 25 }, { houses = { 11260 } } }, -- Vine, Small Moonlit Ivy Drape
    [198555] = { { itemPrice = 70 }, { houses = { 11260 } } }, -- Shrub, Moonlit Ivy
    [198109] = { { itemPrice = 40 }, { houses = { 11260 } } }, -- Trees, Dead Oak Sapling Duo
    [198108] = { { itemPrice = 40 }, { houses = { 11260 } } }, -- Tree, Twisted Dead Oak Sapling
    [198107] = { { itemPrice = 40 }, { houses = { 11260 } } }, -- Trees, Dead Oak Sapling Cluster
    [198106] = { { itemPrice = 40 }, { houses = { 11260 } } }, -- Tree, Dead Oak Sapling
    [198105] = { { itemPrice = 150 }, { houses = { 11260 } } }, -- Tree, Large Ancient Dead Oak
    [198104] = { { itemPrice = 150 }, { houses = { 11260 } } }, -- Tree, Old Dead Oak
    [198103] = { { itemPrice = 150 }, { houses = { 11260 } } }, -- Tree, Ancient Dead Oak
    [198005] = { { itemPrice = 45 }, { houses = { 11260 } } }, -- Hedge, Dense Low Angled Wall
    [198004] = { { itemPrice = 45 }, { houses = { 11260 } } }, -- Hedge, Dense Low Extensive Wall
    [198003] = { { itemPrice = 45 }, { houses = { 11260 } } }, -- Hedge, Dense Low Corner Wall
    [198002] = { { itemPrice = 45 }, { houses = { 11260 } } }, -- Hedge, Dense Low Long Wall
  },
}

FurC.CrownStore[ver.NECROM] = {
  [src.CROWN] = {
    [197624] = { itemPrice = 1200 }, -- Apocryphal Shifting Sculpture
    [197623] = { itemPrice = 3000 }, -- Statue, Hermaeus Mora
    [197622] = { crate = crateIds.FEATHER }, -- Constellation Projection Apparatus
    [197621] = { crate = crateIds.FEATHER }, -- Household Shrine, Meridian
    [197620] = { crate = crateIds.FEATHER }, -- Throne of the Lich
    [197619] = { crate = crateIds.FEATHER }, -- Meridian Mote
  },

  [src.EDITOR] = {
    [194538] = { { itemPrice = 110 }, { houses = { 11216, 14078 } } }, -- Cargo Netting, Large
    [194539] = { { itemPrice = 110 }, { houses = { 11216 } } }, -- Rough Hammock, Pole-Strung
    [194534] = { { itemPrice = 260 }, { houses = { 11216 } } }, -- Dock Bell, Mounted
    [194536] = { { itemPrice = 40 }, { houses = { 11216, 14078 } } }, -- Dock Buoys, Mounted
  },
}

FurC.CrownStore[ver.SCRIBE] = {
  [src.CROWN] = {
    [194399] = { itemPrice = 1000 }, -- Music Box, Unfathomable Knowledge
    [190941] = { itemPrice = 1000 }, -- Music Box, Direnni's Swan
    [193818] = { pack = packs.ASTULA }, -- Shad Astula Scholar, Right
    [193817] = { pack = packs.ASTULA }, -- Shad Astula Scholar, Left
    [193796] = { crate = crateIds.RAGE }, -- Orb of the Spirit Queen
    [193795] = { crate = crateIds.RAGE }, -- Rite of the Harrowforged
    [193794] = { crate = crateIds.RAGE }, -- Target Hagraven, Robust
    [193793] = { crate = crateIds.RAGE }, -- Reach Chandelier, Hagraven
  },

  [src.EDITOR] = {
    [194411] = { { itemPrice = 240 }, { houses = { 13882, 11172 } } }, -- Stonelore Tale Pillar, Rounded Stone
    [194410] = { { itemPrice = 240 }, { houses = { 13882, 11172 } } }, -- Stonelore Tale Pillar, Slanted Stone
    [194409] = { { itemPrice = 140 }, { houses = { 12472, 11172, 14077, 12270 } } }, -- Potted Tree, Systres Pine
    [194408] = { { itemPrice = 150 }, { houses = { 11216 } } }, -- Systres Brewing Still, Copper
    [194407] = { itemPrice = 40 }, -- Harbor Rope, Hanging
    [194406] = { { itemPrice = 110 }, { houses = { 11172, 11216, 14078 } } }, -- Harbor Rope, Coiled Buoy
    [194405] = { { itemPrice = 40 }, { houses = { 14078, 11216 } } }, -- Harbor Line, Coiled
    [194404] = { { itemPrice = 40 }, { houses = { 11172, 11216, 14078 } } }, -- Harbor Line, Loose
    [194403] = { { itemPrice = 110 }, { houses = { 11172, 11216, 14078 } } }, -- Harbor Netting, Buoy Cluster
    [194402] = { { itemPrice = 110 }, { houses = { 11172, 14078 } } }, -- Harbor Netting, Hanging Wall
    [194401] = { { itemPrice = 150 }, { houses = { 11172, 11655 } } }, -- Galen Dogwood, Medium Cluster
    [194400] = { { itemPrice = 170 }, { houses = { 11172, 11655 } } }, -- Galen Dogwood, Large
  },
}

FurC.CrownStore[ver.DRUID] = {
  [src.CROWN] = {
    [192406] = { pack = packs.MAORMER }, -- Maormer Ship's Prow, Serpentine
    [192405] = { pack = packs.MAORMER }, -- Maormer Tent, Raid Leader's
    [190945] = { itemPrice = 5000 }, -- Tree, Seasons of Y'ffre
    [190940] = { itemPrice = 1000 }, -- Music Box, Songbird's Paradise
    [190939] = { itemPrice = 1100 }, -- Music Box, Dawnbreaker's Forging
    [190951] = { crate = crateIds.STONELORE }, -- Target Spriggan, Robust
    [190950] = { crate = crateIds.STONELORE }, -- Rose Petal Cascade
    [190947] = { crate = crateIds.STONELORE }, -- Druidic Arch, Floral
    [190946] = { crate = crateIds.STONELORE }, -- Earthen Root Essence
  },

  [src.EDITOR] = {
    [192429] = { { itemPrice = 110 }, { pack = packs.MAORMER } }, -- Maormer Sconce, Serpentine
    [192427] = { { itemPrice = 70 }, { pack = packs.MAORMER } }, -- Maormer Lamp, Serpentine
    [192425] = { { itemPrice = 150 }, { pack = packs.MAORMER } }, -- Maormer Teapot, Serpentine
    [192423] = { { itemPrice = 340 }, { pack = packs.MAORMER } }, -- Maormer Runner, Amethyst Waves
    [192422] = { { itemPrice = 80 }, { pack = packs.MAORMER } }, -- Maormer Half-Rug
    [192420] = { { itemPrice = 180 }, { pack = packs.MAORMER } }, -- Maormer Rug, Serpentine
    [192418] = { { itemPrice = 10 }, { pack = packs.MAORMER } }, -- Maormer Mug, Serpentine
    [192414] = { { itemPrice = 160 }, { pack = packs.MAORMER } }, -- Maormer Armchair, Carved
    [192413] = { { itemPrice = 180 }, { pack = packs.MAORMER } }, -- Maormer Table, Carved
    [192412] = { { itemPrice = 340 }, { pack = packs.MAORMER } }, -- Maormer Curtain, Serpentine Cloth
    [192410] = { { itemPrice = 85 }, { pack = packs.MAORMER } }, -- Maormer Chair, Carved
    [192409] = { { itemPrice = 3000 }, { pack = packs.MAORMER } }, -- Maormer Cookfire
    [192408] = { { itemPrice = 70 }, { pack = packs.MAORMER } }, -- Maormer Trunk, Carved
    [192407] = { { itemPrice = 720 }, { pack = packs.MAORMER } }, -- Maormer Tent, Raider's
  },
}

FurC.CrownStore[ver.DEPTHS] = {
  [src.CROWN] = {
    [189465] = { itemPrice = 1200 }, -- Music Box, Gonfalon Galliard
    [189464] = { itemPrice = 1000 }, -- Music Box, Deeproot Dirge
    [189463] = { itemPrice = 3500 }, -- Statue, Bendu Olo
    [188344] = { crate = crateIds.WRAITH }, -- Y'ffre's Falling Leaves, Autumn
    [188343] = { crate = crateIds.WRAITH }, -- Moonlight Path Bridge
    [188342] = { crate = crateIds.WRAITH }, -- Bat Swarm, Domesticated
    [188341] = { crate = crateIds.WRAITH }, -- Red Diamond Stained Glass
  },

  [src.EDITOR] = {},
}

FurC.CrownStore[ver.BRETON] = {
  [src.CROWN] = {
    [187667] = { itemPrice = 1200 }, -- Music Box, High Isle Duel
    [187666] = { itemPrice = 1000 }, -- Music Box, Steadfast Armistice
    [187665] = { itemPrice = 3500 }, -- Statue, Kynareth's Blessings
    [187664] = { itemPrice = 6000 }, -- Target Deadlands Harvester, Trial
    [187663] = { crate = crateIds.DARK }, -- Blue Fang Shark, Mounted
    [187662] = { crate = crateIds.DARK }, -- House Dufort Chandelier
    [187661] = { crate = crateIds.DARK }, -- Mage's Flame
    [187660] = { crate = crateIds.DARK }, -- Mages Guild Stained Glass
  },

  [src.EDITOR] = {
    [187865] = { { itemPrice = 55 }, { houses = { 13882, 10511 } } }, -- Flowers, Butterweed Cluster
    [187861] = { { itemPrice = 110 }, { houses = { 10511 } } }, -- High Isle Hourglass, Compass Rose
    [187860] = { { itemPrice = 65 }, { houses = { 10511 } } }, -- High Isle Vase, Gilded
  },
}

FurC.CrownStore[ver.TIDES] = {
  [src.CROWN] = {
    [184175] = { itemPrice = 3500 }, -- Statue, Ancestor-King Auri-El
    [183894] = { pack = packs.AQUATIC }, -- Nedic Chest, Bubbling
    [183856] = { pack = packs.AQUATIC }, -- Target Mudcrab, Robust Coral
    [183201] = { itemPrice = 1000 }, -- Music Box: Bleak Beacon Shanty
    [183200] = { itemPrice = 1100 }, -- Music Box: Wonders of the Shoals
    [184127] = { crate = crateIds.SUNKEN }, -- Tranquility Pond, Botanical
    [184126] = { crate = crateIds.SUNKEN }, -- Waterfall Fountain, Round
    [184072] = { crate = crateIds.SUNKEN }, -- Aquarium, Large Abecean Coral
    [184071] = { crate = crateIds.SUNKEN }, -- Aquarium, Abecean Coral
  },

  [src.EDITOR] = {
    [184249] = { { itemPrice = 20 }, { houses = { 10223 } } }, -- Elkhorn Coral, Branching
    [184248] = { { itemPrice = 20 }, { houses = { 10223, 11172 } } }, -- Stones, Coral Cluster
    [184247] = { { itemPrice = 45 }, { houses = { 10223 } } }, -- Brittle-Vein Coral, Cluster
    [184250] = { { itemPrice = 240 }, { houses = { 10223 } } }, -- Nedic Banner, Ancient
    [184246] = { { itemPrice = 130 }, { houses = { 10223 } } }, -- Nedic Bench, Carved
    [184245] = { { itemPrice = 610 }, { houses = { 10223 } } }, -- Nedic Chandelier, Swords
    [184244] = { { itemPrice = 110 }, { houses = { 10223 } } }, -- Nedic Sconce, Torch
    [184243] = { { itemPrice = 640 }, { houses = { 10223 } } }, -- Nedic Brazier, Cold-Flame Pillar
    [184242] = { { itemPrice = 370 }, { houses = { 10223 } } }, -- Nedic Brazier, Cold-Flame
    [178477] = { { itemPrice = 170 }, { houses = { 10223 } } }, -- Nedic Bookcase, Filled
    [184205] = { { itemPrice = 120 }, { pack = packs.AQUATIC } }, -- Sand Drift, Oceanic
    [184112] = { { itemPrice = 170 }, { pack = packs.AQUATIC } }, -- Lilac Coral, Strong
    [184111] = { { itemPrice = 170 }, { pack = packs.AQUATIC } }, -- Lilac Anemone, Sprout
    [184110] = { { itemPrice = 170 }, { pack = packs.AQUATIC } }, -- Verdant Anemone, Strong
    [184109] = { { itemPrice = 90 }, { pack = packs.AQUATIC } }, -- Kelp Grouping, Robust
    [184108] = { { itemPrice = 90 }, { pack = packs.AQUATIC } }, -- Kelp Grouping, Thin
    [184107] = { { itemPrice = 20 }, { pack = packs.AQUATIC } }, -- Kelp Stalk, Tall
    [184106] = { { itemPrice = 20 }, { pack = packs.AQUATIC } }, -- Kelp Stalk, Plain
    [184105] = { { itemPrice = 45 }, { pack = packs.AQUATIC } }, -- Green Algae Coral Formation, Tree Capped
    [184104] = { { itemPrice = 45 }, { pack = packs.AQUATIC } }, -- Red Algae Coral Formation, Waving Hands
    [184103] = { { itemPrice = 45 }, { pack = packs.AQUATIC } }, -- Red Algae Coral Formation, Tree Antler
    [183893] = { { itemPrice = 1500 }, { pack = packs.AQUATIC } }, -- Bubbles of Aeration
    [183892] = { { itemPrice = 430 }, { pack = packs.AQUATIC } }, -- Minnow School
    [183891] = { { itemPrice = 430 }, { pack = packs.AQUATIC } }, -- Jellyfish Bloom, Heliotrope
  },
}

FurC.CrownStore[ver.DEADL] = {
  [src.CROWN] = {
    [181636] = { itemPrice = 1000 }, -- Music Box, Fargrave Daydreams
    [181637] = { itemPrice = 1200 }, -- Music Box, Time's Architect
    [182280] = { crate = crateIds.CELESTIAL }, -- Fargrave Relic Case
    [182207] = { crate = crateIds.CELESTIAL }, -- Celestial Vortex
    [181643] = { crate = crateIds.CELESTIAL }, -- Warrior's Flame
    [181487] = { crate = crateIds.HARLEQUIN }, -- Grim Harlequin Chandelier
    [181438] = { crate = crateIds.HARLEQUIN }, -- Mad God's Monarch Flock
    [178800] = { crate = crateIds.HARLEQUIN }, -- Amethyst Candlefly Gathering
    [171947] = { crate = crateIds.IRON_ATRO }, -- Deadlands Chandelier, Bladed
    [171946] = { crate = crateIds.IRON_ATRO }, -- Deadlands Cage, Bladed
    [171945] = { crate = crateIds.IRON_ATRO }, -- Deadlands Sconce, Horned
    [171546] = { crate = crateIds.AYLEID }, -- Ayleid Relief, Blessed Life-Tree
    [171545] = { crate = crateIds.AYLEID }, -- Ayleid Gate, Large
    [171544] = { crate = crateIds.AYLEID }, -- Comet, Aetherial
    [156644] = { crate = crateIds.FROST_ATRO }, -- Books, Towering Pile
  },

  [src.EDITOR] = {
    [182915] = { { itemPrice = 260 }, { houses = { 10051, 13060 } } }, -- Fargrave Container Plants, Long
    [182916] = { { itemPrice = 260 }, { houses = { 10051, 13060 } } }, -- Fargrave Container Plant, Large Square
    [182917] = { { itemPrice = 260 }, { houses = { 10051, 13060 } } }, -- Fargrave Container Plants, Large Round
    [182914] = { { itemPrice = 140 }, { houses = { 10051 } } }, -- Fargrave Container Plants
    [182913] = { { itemPrice = 140 }, { houses = { 10051, 13060 } } }, -- Fargrave Container Plants, Small
    [182281] = { { itemPrice = 2300 }, { houses = { 10051 } } }, -- Fargrave Fountain
    [182921] = { { itemPrice = 490 }, { houses = { 10051 } } }, -- Fargrave Canopy, Large
    [182918] = { { itemPrice = 160 }, { houses = { 10051 } } }, -- Boulder, Weathered Fargrave
    [182919] = { { itemPrice = 160 }, { houses = { 10051 } } }, -- Rocks, Fargrave Cluster
    [182935] = { { itemPrice = 140 }, { houses = { 10052 } } }, -- Stump, Charred Deadlands
    [182934] = { { itemPrice = 140 }, { houses = { 10052 } } }, -- Log, Charred Deadlands
    [182933] = { { itemPrice = 260 }, { houses = { 10052 } } }, -- Tree, Charred Large Deadlands
    [182922] = { { itemPrice = 40 }, { houses = { 10052 } } }, -- Vines, Thornpinch
    [182925] = { { itemPrice = 160 }, { houses = { 10052 } } }, -- Rocks, Deadlands Cluster
    [182292] = { { itemPrice = 260 }, { pack = packs.AMBITIONS } }, -- Deadlands Base, Tower
    [182291] = { { itemPrice = 1500 }, { pack = packs.AMBITIONS } }, -- Deadlands Window, Fireglass
    [182290] = { { itemPrice = 140 }, { pack = packs.AMBITIONS } }, -- Deadlands Grate, Large
    [182289] = { { itemPrice = 140 }, { pack = packs.AMBITIONS } }, -- Deadlands Wall, Etched
    [182295] = { { itemPrice = 510 }, { pack = packs.AMBITIONS } }, -- Deadlands Firepit, Large
    [182294] = { { itemPrice = 770 }, { pack = packs.AMBITIONS } }, -- Deadlands Platform, Tower
    [182293] = { { itemPrice = 260 }, { pack = packs.AMBITIONS } }, -- Deadlands Stairway, Tower
    [182912] = { { itemPrice = 270 }, { pack = packs.AMBITIONS } }, -- Deadlands Pillar, Tall
    [182285] = { { itemPrice = 160 }, { pack = packs.FARGRAVE } }, -- Book Wall, Levitating
    [182286] = { { itemPrice = 860 }, { pack = packs.FARGRAVE } }, -- Fargrave Terrarium, Snakevine
    [182288] = { { itemPrice = 820 }, { pack = packs.FARGRAVE } }, -- Fargrave Terrarium, Massive Gas Blossom
    [182284] = { { itemPrice = 20 }, { pack = packs.FARGRAVE } }, -- Fargrave Bread Loaves, Round
    [182283] = { { itemPrice = 870 }, { pack = packs.FARGRAVE } }, -- Fargrave Terrarium, Lantern Flower
    [182282] = { { itemPrice = 560 }, { pack = packs.FARGRAVE } }, -- Fargrave Water Globules, Levitating
    [182258] = { { itemPrice = 540 }, { pack = packs.FARGRAVE } }, -- Fargrave Terrarium, Claws
    [182230] = { { itemPrice = 140 }, { pack = packs.FARGRAVE }, { houses = { 13882 } } }, -- Mushrooms, Glowing Shelf
  },
}

FurC.CrownStore[ver.WAKE] = {
  [src.CROWN] = {
    [178522] = { itemPrice = 800 }, -- Music Box, Silver Rose
    [178521] = { itemPrice = 1000 }, -- Music Box, Invitation to Chaos
    [181485] = { pack = packs.MERMAID }, -- Statue, Mermaid of Anvil
    [181483] = { pack = packs.WINDOWS }, -- Stained Glass of Akatosh
    [181484] = { pack = packs.WINDOWS }, -- Stained Glass of Julianos
    [181482] = { pack = packs.WINDOWS }, -- Stained Glass of Arkay
    [181481] = { pack = packs.WINDOWS }, -- Stained Glass of Dibella
    [181480] = { pack = packs.WINDOWS }, -- Stained Glass of Stendarr
    [181479] = { pack = packs.WINDOWS }, -- Stained Glass of Mara
    [181478] = { pack = packs.WINDOWS }, -- Stained Glass of Kynareth
  },

  [src.EDITOR] = {
    [181532] = { { itemPrice = 3600 }, { houses = { 9735 } }, { pack = packs.MERMAID } }, -- Leyawiin Fountain, Round Grand
    [181602] = { itemPrice = 30 }, -- Bush, Low Greenleaf Cluster
    [181604] = { { itemPrice = 30 }, { houses = { 13882 } } }, -- Bush, Snow Lillies
    [181600] = { { itemPrice = 20 }, { houses = { 9735 } } }, -- Rock, Gabbro Boulder
    [181606] = { { itemPrice = 50 }, { houses = { 9735 } } }, -- Rock, Gabbro Boulder Cluster
    [181605] = { { itemPrice = 5 }, { houses = { 12270, 9735 } } }, -- Rock, Gabbro Set
    [181601] = { { itemPrice = 50 }, { houses = { 9735 } } }, -- Rock, Wide Gabbro Slab
    [181603] = { itemPrice = 70 }, -- Plant, White Flowered Lily Pads
    [181607] = { { itemPrice = 90 }, { houses = {} } }, -- Tree, Elder Blackwood Beech
    [181608] = { { itemPrice = 20 }, { houses = {} } }, -- Tree, Blackwood Beech
    [181609] = { { itemPrice = 20 }, { houses = {} } }, -- Tree, Blackwood Beech Cluster
    [181610] = { { itemPrice = 25 }, { houses = { 13882, 9735 } } }, -- Vines, Snow Lillies Swath
    [181611] = { { itemPrice = 10 }, { houses = { 13882, 9735 } } }, -- Vines, Snow Lillies Climber
    [182932] = { { itemPrice = 260 }, { houses = { 10052 } } }, -- Tree, Charred Large Twisted Deadlands
    [182931] = { { itemPrice = 140 }, { houses = { 10052 } } }, -- Tree, Charred Deadlands
    [182930] = { { itemPrice = 110 }, { houses = { 10052 } } }, -- Plant, Pixas
    [182929] = { { itemPrice = 110 }, { houses = { 10052 } } }, -- Plant, Hynvik
    [181547] = { { itemPrice = 1000 }, { pack = packs.MERMAID } }, -- Leyawiin Fountain, Corner
    [181486] = { { itemPrice = 2700 }, { pack = packs.MERMAID }, { houses = { 9735 } } }, -- Leyawiin Fountain, Round
    [181599] = { { itemPrice = 1100 }, { pack = packs.MERMAID }, { houses = { 9735 } } }, -- Leyawiin Fountain, Tall
    [181435] = { { itemPrice = 1500 }, { pack = packs.MERMAID } }, -- Steam of Repose
  },
}

FurC.CrownStore[ver.BLACKW] = {
  [src.CROWN] = {
    [175135] = { itemPrice = 3500 }, -- Statue, Prince of Ambition
    [171943] = { itemPrice = 1000 }, -- Music Box, The Liberation of Leyawiin
    [171944] = { itemPrice = 1000 }, -- Music Box, The Mirefrog's Hymn
    [175698] = { pack = packs.ZENI }, -- Zenithar, God of Work and Commerce
    [175699] = { { pack = packs.ZENI }, { pack = packs.WINDOWS } }, -- Stained Glass of Zenithar
  },

  [src.EDITOR] = {
    [175695] = { { itemPrice = 510 }, { pack = packs.ZENI } }, -- Leyawiin Shrine of the Eight
    [175696] = { { itemPrice = 410 }, { pack = packs.ZENI }, { houses = { 9735, 9412 } } }, -- Leyawiin Tapestry, Divines Horizontal
    [175697] = { { itemPrice = 410 }, { pack = packs.ZENI }, { houses = { 9412 } } }, -- Leyawiin Tapestry, Divines Vertical
  },
}

FurC.CrownStore[ver.FLAMES] = {
  [src.CROWN] = {
    [171875] = { itemPrice = 6000 }, -- Target Harrowing Reaper, Trial
    [171857] = { itemPrice = 3000 }, -- Aetherial Well
    [171543] = { itemPrice = 1000 }, -- Music Box, Feast of All Flames
    [171542] = { itemPrice = 800 }, -- Music Box, Farewell to Nenalata
  },

  [src.EDITOR] = {
    [171932] = { { itemPrice = 160 }, { houses = { 9013 } } }, -- Daedric Sconce, Torch
    [171933] = { { itemPrice = 80 }, { houses = { 9013 } } }, -- Daedric Candles, Tall Stand
    [171934] = { { itemPrice = 360 }, { houses = { 9013 } } }, -- Daedric Brazier, Plinth
    [171834] = { { itemPrice = 40 }, { houses = { 9013 } } }, -- Tree, Charred Vvardenfell Pine
    [171835] = { { itemPrice = 40 }, { houses = { 9013 } } }, -- Tree, Charred Leaning Vvardenfell Pine
    [171836] = { { itemPrice = 40 }, { houses = { 9013 } } }, -- Tree, Charred Slim Vvardenfell Pine
    [171940] = { { itemPrice = 280 }, { houses = { 9013 } } }, -- Statue of Sheogorath, Shivering Isles Sovereign
    [171817] = { { itemPrice = 730 }, { houses = { 9014 } } }, -- Ayleid Chandelier, Caged
    [171819] = { { itemPrice = 310 }, { houses = { 9014 } } }, -- Tree, Towering Cork Oak
  },
}

FurC.CrownStore[ver.MARKAT] = {
  [src.CROWN] = {
    [167935] = { crate = crateIds.POTENTATE }, -- Dwarven Work Lamp, Powered Floor
    [167934] = { crate = crateIds.POTENTATE }, -- Dwarven Orrery, Scholastic
    [167933] = { crate = crateIds.POTENTATE }, -- Dwarven Beam Emitter, Medium
    [171397] = { pack = packs.ALCHEMIST }, -- Stone Garden Tank, Vacant
    [171398] = { pack = packs.ALCHEMIST }, -- Stone Garden Vat, Alchemized Bristleback
    [171399] = { pack = packs.ALCHEMIST }, -- Stone Garden Vat, Alchemized Chaurus
    [171400] = { pack = packs.ALCHEMIST }, -- Stone Garden Vat, Alchemized Durzog
    [171401] = { pack = packs.ALCHEMIST }, -- Stone Garden Vat, Vacant
    [171402] = { pack = packs.ALCHEMIST }, -- Stone Garden Circulator, Rootbound
    [171403] = { pack = packs.ALCHEMIST }, -- Stone Garden Casket, Alchemized Bloodknight
    [169117] = { pack = packs.ALCHEMIST }, -- Target Bloodknight
    [167428] = { itemPrice = 1000 }, -- Music Box, Mother Morrowind's Sacred Lullaby
    [167429] = { itemPrice = 1000 }, -- Music Box, Never Fall, Never Die
  },

  [src.EDITOR] = {
    [171382] = { { itemPrice = 180 }, { houses = { 8697 } } }, -- Reachmen Pergola, Ivy Overhang
  },
}

FurC.CrownStore[ver.STONET] = {
  [src.CROWN] = {
    [167007] = { itemPrice = 1000 }, -- Music Box, Subterranean Sonata
    [167006] = { itemPrice = 1000 }, -- Music Box, Hymn of Five-Hundred Axes
    [167295] = { houses = { 13882, 8323 } }, -- Tree, Great Snowy White Pine
    [167302] = { houses = { 8652, 8323 } }, -- Solitude Brazier, Metal
    [119685] = { crate = crateIds.WILD_HUNT }, -- Tapestry of Hircine
    [119684] = { crate = crateIds.WILD_HUNT }, -- Statue of Hircine
  },

  [src.EDITOR] = {
    [167294] = { { itemPrice = 20 }, { houses = {} } }, -- Boulder, Jagged Stone
    [167299] = { { itemPrice = 920 }, { houses = { 8697, 14609, 8323 } } }, -- Dwarven Chandelier, Polished Braced
    [167301] = { { itemPrice = 560 }, { houses = { 8697, 14609, 8323 } } }, -- Dwarven Lamppost, Polished Powered
    [167300] = { { itemPrice = 160 }, { houses = { 8697, 14609, 8323 } } }, -- Dwarven Lantern, Polished Wall
    [167298] = { { itemPrice = 310 }, { houses = { 8697, 14609, 8323 } } }, -- Dwarven Sconce, Polished Barred
    [167289] = { { itemPrice = 20 }, { houses = {} } }, -- Tree, Lowland White Pine
    [167290] = { { itemPrice = 20 }, { houses = {} } }, -- Tree, Great Lowland White Pine
    [167291] = { { itemPrice = 150 }, { houses = {} } }, -- Tree, Towering Royal Pine
    [167306] = { { itemPrice = 70 }, { houses = {} } }, -- Tree, Towering Snowy White Pine
    [167292] = { { itemPrice = 5 }, { houses = {} } }, -- Rocks, Large Jagged Set
    [167293] = { { itemPrice = 30 }, { houses = {} } }, -- Shrub, Long Amber Bayberry
    [167297] = { { itemPrice = 30 }, { houses = {} } }, -- Trees, Young Snowy White Pine Cluster
    [167296] = { { itemPrice = 20 }, { houses = {} } }, -- Tree, Giant Snowy White Pine
  },
}

FurC.CrownStore[ver.SKYRIM] = {
  [src.CROWN] = {
    [165991] = { itemPrice = 3500 }, -- Statue, Vampiric Sovereign
    [147747] = { itemPrice = 2500 }, -- Cadwell's Astounding Portal
    [163428] = { itemPrice = 800 }, -- Music Box, The Shadows Stir
    [163429] = { itemPrice = 1000 }, -- Music Box, Enigmas of the Elder Way
    [167332] = { crate = crateIds.SOVNGARDE }, -- The Mage's Staff Painting, Gold
    [167231] = { crate = crateIds.SOVNGARDE }, -- Celestial Nimbus
    [167230] = { crate = crateIds.SOVNGARDE }, -- Alkosh's Hourglass, Replica
    [166030] = { crate = crateIds.NIGHTFALL }, -- Greymoor Tapestry, Harrowstorm
    [166029] = { crate = crateIds.NIGHTFALL }, -- Vampiric Fountain, Bat Swarm
    [165568] = { crate = crateIds.NIGHTFALL }, -- Ancient Nord Gate
    [156669] = { crate = crateIds.FROST_ATRO }, -- Target Frost Atronach
    [153650] = { crate = crateIds.NEWMOON }, -- Crystal Sconce, Green,
    [153631] = { crate = crateIds.NEWMOON }, -- Emerald Candlefly Gathering
    [165578] = { pack = packs.VAMPIRE }, -- Basin of Loss
    [165569] = { pack = packs.VAMPIRE }, -- Soul-Sworn Thrall
  },

  [src.EDITOR] = {
    [166044] = { { itemPrice = 90 }, { bundle = bundles.STABLE } }, -- Watering Trough, Full
    [166452] = { { itemPrice = 440 }, { houses = { 8011 } } }, -- Vampiric Column, Ancient
  },
}

FurC.CrownStore[ver.HARROW] = {
  [src.CROWN] = {
    [159596] = { itemPrice = 800 }, -- Music Box, The Mad Harlequin's Reverie
    [159439] = { itemPrice = 3500 }, -- Statue, Pride of Alkosh Hero
    [159598] = { itemPrice = 800 }, -- Music Box, Dreams of Yokuda
    [159438] = { crate = crateIds.GLOOMSPORE }, -- Fungus, Gloomspore Ghost
    [159437] = { crate = crateIds.GLOOMSPORE }, -- Painting of Blackreach, Rough
    [159436] = { crate = crateIds.GLOOMSPORE }, -- Dwarven Miniature Sun, Portable
  },

  [src.EDITOR] = {
    [159462] = { itemPrice = 170 }, -- Redguard Fence, Wooden
    [159459] = { { itemPrice = 310 }, { houses = { 7600 } } }, -- Trees, Paired Wrothgar Pine
    [159458] = { { itemPrice = 310 }, { houses = { 7600 } } }, -- Tree, Broad Wrothgar Pine
    [159456] = { { itemPrice = 410 }, { houses = { 7600 } } }, -- Orsinium Well, Open
    [159460] = { { itemPrice = 310 }, { houses = { 7600 } } }, -- Tree, Slim Wrothgar Pine
    [118277] = { { itemPrice = 140 }, { houses = {} } }, -- Ram Horns, Mounted
    [159496] = { { itemPrice = 240 }, { houses = { 7600 } } }, -- Tree, Ancient Bristlecone
    [159457] = { { itemPrice = 170 }, { houses = { 7601 } } }, -- Tree, Dagger Bark
    [159461] = { { itemPrice = 30 }, { houses = { 7601 } } }, -- Shrubs, Desert Scrub
  },
}

FurC.CrownStore[ver.DRAGON2] = {
  [src.CROWN] = {
    [156554] = { itemPrice = 800 }, -- Music Box, A Frost Melt Melody
    [156645] = { itemPrice = 4000 }, -- Statue, Kaalgrontiid's Ascent
    [156553] = { itemPrice = 800 }, -- Music Box, That Breezy Night in Bruma
    [156775] = { pack = packs.HEART }, -- Bed, Petal-Strewn Double
    [156767] = { pack = packs.HEART }, -- Sweetroll Platter
  },

  [src.EDITOR] = {
    [156764] = { { itemPrice = 85 }, { pack = packs.HEART } }, -- Bouquet, Small Dibella's
    [156776] = { { itemPrice = 85 }, { pack = packs.HEART } }, -- Bouquet, Large Dibella's
    [156777] = { { itemPrice = 85 }, { pack = packs.HEART } }, -- Bouquet, Medium Dibella's
    [156765] = { { itemPrice = 290 }, { pack = packs.HEART } }, -- Chair, Love-Blessed
    [156766] = { { itemPrice = 180 }, { pack = packs.HEART } }, -- Petals, Blanket
    [156768] = { { itemPrice = 100 }, { pack = packs.HEART } }, -- Love's Flame Candlestick
    [156769] = { { itemPrice = 500 }, { pack = packs.HEART } }, -- Kitten Moppet, Heart's Promise
    [156770] = { { itemPrice = 500 }, { pack = packs.HEART } }, -- Kitten Moppet, Love-Blessed
    [156771] = { { itemPrice = 410 }, { pack = packs.HEART } }, -- Table, Love-Blessed
    [156772] = { { itemPrice = 340 }, { pack = packs.HEART } }, -- Petals, Large Blanket
    [156773] = { { itemPrice = 180 }, { pack = packs.HEART } }, -- Rug, Love-Blessed
    [156774] = { { itemPrice = 180 }, { pack = packs.HEART } }, -- Tapestry, Love-Blessed
    [156778] = { { itemPrice = 85 }, { pack = packs.HEART } }, -- Flower, Dibella's Promise
  },
}

FurC.CrownStore[ver.SCALES] = {
  [src.CROWN] = {
    [152257] = { bundle = bundles.EBONY }, -- Banner of Mephala
    [152259] = { bundle = bundles.RAZOR }, -- Banner of Mehrunes Dagon
    [147746] = { itemPrice = 1400 }, -- Bust: Abnur Tharn
    [153634] = { itemPrice = 800 }, -- Music Box, Diamond Melody
    [153633] = { itemPrice = 800 }, -- Music Box, The Ghosts of Frostfall
    [153630] = { crate = crateIds.NEWMOON }, -- Shadow Tendril Patch
  },

  [src.EDITOR] = {
    [153675] = { { itemPrice = 200 }, { houses = { 6752 } } }, -- Daedric Altar, Four Alcoves
    [153676] = { { itemPrice = 270 }, { houses = { 6752 } } }, -- Daedric Sarcophagus, Stone
    [153660] = { { itemPrice = 560 }, { pack = packs.KHAJIIT } }, -- Elsweyr Cart, Moons-Blessed
    [153669] = { { itemPrice = 300 }, { pack = packs.KHAJIIT } }, -- Elsweyr Well, Simple Arched
    [153658] = { { itemPrice = 70 }, { pack = packs.KHAJIIT } }, -- Moon-Sugar, Row
    [153659] = { { itemPrice = 30 }, { pack = packs.KHAJIIT } }, -- Moon-Sugar, Cluster
    [153667] = { { itemPrice = 170 }, { pack = packs.KHAJIIT } }, -- Moon-Sugar, Harvested Large
    [153668] = { { itemPrice = 90 }, { pack = packs.KHAJIIT } }, -- Moon-Sugar, Harvested Small
    [153632] = { { itemPrice = 1500 }, { pack = packs.KHAJIIT } }, -- Sapphire Candlefly Gathering
    [153661] = { { itemPrice = 40 }, { pack = packs.KHAJIIT }, { bundle = bundles.STABLE } }, -- Straw Pile
    [153662] = { { itemPrice = 40 }, { pack = packs.KHAJIIT }, { houses = { 13882 } } }, -- Tool, Plow
    [153663] = { { itemPrice = 40 }, { pack = packs.KHAJIIT } }, -- Tool, Sickle
    [153664] = { { itemPrice = 40 }, { pack = packs.KHAJIIT }, { bundle = bundles.STABLE } }, -- Tool, Pitchfork
    [153665] = { { itemPrice = 40 }, { pack = packs.KHAJIIT } }, -- Tool, Hoe
    [153666] = { { itemPrice = 40 }, { pack = packs.KHAJIIT }, { houses = { 6752 } } }, -- Tool, Two-Person Crosscut Saw
  },
}

FurC.CrownStore[ver.KITTY] = {
  [src.CROWN] = {
    [151909] = { itemPrice = 800 }, -- Music Box, A Clash of Fang and Flame
    [151910] = { itemPrice = 800 }, -- Music Box, Dancing Among the Flowers Fine
    [147926] = { itemPrice = 6000 }, -- Target Iron Atronach, Trial
    [151838] = { pack = packs.OASIS }, -- Elsweyr Fountain, Moons-Blessed
    [151835] = { pack = packs.OASIS }, -- Cathay-Raht Statue, Warrior
    [151836] = { pack = packs.OASIS }, -- Tojay Statue, Dancer
    [151837] = { pack = packs.OASIS }, -- Ohmes-Raht Statue, Trickster
    [151906] = { pack = packs.MOONBISHOP }, -- Robust Target Dro-m'Athra
    [151829] = { pack = packs.MOONBISHOP }, -- Suthay Statue, Nimble Bishop
    [150775] = { bundle = bundles.JYGGALAG }, -- Banner of Jyggalag
    [152145] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Tapestry, War       CRAFTABLE
    [152149] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Brazier, Pillar     CRAFTABLE
    [152148] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Tapestry, Hunt      CRAFTABLE
    [152146] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Chandelier, Spiked  CRAFTABLE
    [152141] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Brazier, Bordered   CRAFTABLE
    [152144] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Mirror, Peaked      CRAFTABLE
    [152143] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Sconce, Scrolled    CRAFTABLE
    [152142] = { { houses = {} }, { category = SI_FURC_SRC_CRAFTING } }, -- Orcish Sconce, Bordered    CRAFTABLE
    [151612] = { crate = crateIds.BAANDARI }, -- Pile of Dubious Riches
    [151611] = { crate = crateIds.BAANDARI }, -- The Mane, Moons-Blessed
    [151589] = { crate = crateIds.BAANDARI }, -- Baandari Lunar Compass
  },

  [src.EDITOR] = {
    [151901] = { { itemPrice = 20 }, { pack = packs.KHAJIIT } }, -- Elsweyr Bowl, Moon-Sugar
    [151840] = { { itemPrice = 70 }, { pack = packs.OASIS } }, -- Plant, Desert Fan
    [151841] = { { itemPrice = 70 }, { pack = packs.OASIS } }, -- Plant, Tall Desert Fan
    [151842] = { { itemPrice = 20 }, { pack = packs.OASIS }, { houses = { 12456 } } }, -- Plant, Cask Palm
    [151843] = { { itemPrice = 45 }, { pack = packs.OASIS } }, -- Cactus, Flowering Cluster
    [151844] = { { itemPrice = 30 }, { pack = packs.OASIS } }, -- Cactus, Bilberry
    [151845] = { { itemPrice = 95 }, { pack = packs.OASIS }, { houses = {} } }, -- Elsweyr Potted Cactus, Flowering
    [151846] = {
      { itemPrice = 35 },
      { pack = packs.OASIS },
      { pack = packs.MERMAID },
      { houses = {} },
    }, -- Elsweyr Potted Plant, Cask Palm
    [151847] = { { itemPrice = 20 }, { pack = packs.OASIS } }, -- Plant, Flowering Desert Aloe
    [151848] = { { itemPrice = 15 }, { pack = packs.OASIS } }, -- Trees, Sunset Palm Cluster
    [151849] = { { itemPrice = 45 }, { pack = packs.OASIS } }, -- Cactus, Lily Flower
    [151850] = { { itemPrice = 20 }, { pack = packs.OASIS } }, -- Tree, Anequina Bonsai
    [151834] = { { itemPrice = 90 }, { pack = packs.OASIS }, { houses = { 6399 } } }, -- Tree, Desert Acacia Shade
    [151830] = { { itemPrice = 190 }, { pack = packs.MOONBISHOP }, { houses = {} } }, -- Elsweyr Divider, Elegant Wooden
    [151832] = { { itemPrice = 100 }, { pack = packs.MOONBISHOP } }, -- Elsweyr Ceremonial Lantern, Jone
    [151833] = { { itemPrice = 100 }, { pack = packs.MOONBISHOP } }, -- Elsweyr Ceremonial Lantern, Jode
    [151831] = { { itemPrice = 290 }, { pack = packs.MOONBISHOP }, { houses = { 10051 } } }, -- Elsweyr Sugar Pipe, Ceremonial
    [151867] = { { itemPrice = 340 }, { houses = { 7226 } } }, -- Hakoshae Lanterns, Festival
    [151868] = { { itemPrice = 180 }, { houses = { 7218, 7226 } } }, -- Hakoshae Banners, Festival
    [151869] = { itemPrice = 300 }, -- Elsweyr Wagon, Covered
    [151870] = { itemPrice = 560 }, -- Elsweyr Wagon, Pedlar
    [151871] = { itemPrice = 300 }, -- Elsweyr Dais, Temple
    [151874] = { { itemPrice = 300 }, { houses = { 6399 } } }, -- Elsweyr Shrine, Ancient Stone
    [151875] = { itemPrice = 560 }, -- Elsweyr Bridge, Ancient Stone
    [151876] = { itemPrice = 590 }, -- Elsweyr Tent, Caravan
    [151877] = { itemPrice = 590 }, -- Elsweyr Canopy, Bazaar
    [151878] = { itemPrice = 450 }, -- Elsweyr Canopy, Peaked  (no longer in housing editor)
    [151883] = { itemPrice = 240 }, -- Tree, Towering Iroko
    [151905] = { { itemPrice = 10 }, { houses = { 6399, 12456 } } }, -- Rock, Wide Flat Slate
    [151911] = { { itemPrice = 5 }, { houses = { 6399, 12456 } } }, -- Rock, Flat Slate
    [151912] = { { itemPrice = 10 }, { houses = { 6399, 12456 } } }, -- Stepping Stones, Slate
    [151914] = { { itemPrice = 25 }, { houses = { 6399 } } }, -- Tree, Desert Acacia Tall
    [151884] = { { itemPrice = 310 }, { houses = { 12456 } } }, -- Tree, Giant Ficus
    [151885] = { { itemPrice = 310 }, { houses = { 12456 } } }, -- Tree, Massive Ficus
    [151872] = { itemPrice = 110 }, -- Boulder, Towering Lunar Spire
    [151873] = { itemPrice = 50 }, -- Boulder, Lunar Crag
    [151879] = { { itemPrice = 560 }, { houses = { 6399 } } }, -- Cactus, Lunar Tendrils
    [151880] = { { itemPrice = 640 }, { houses = { 6399 } } }, -- Cactus, Lunar Branching
    [151881] = { { itemPrice = 640 }, { houses = { 6399 } } }, -- Cactus, Lunar Branching Tall
    [151882] = { { itemPrice = 140 }, { houses = { 6399 } } }, -- Cactus, Banded Lunar Violet Trio
    [151904] = { { itemPrice = 370 }, { houses = { 6399 } } }, -- Glowgrass, Patch
    [151913] = { { itemPrice = 5 }, { houses = { 6399 } } }, -- Rock, Slate
  },
}

FurC.CrownStore[ver.WOTL] = {
  [src.CROWN] = {
    [147600] = { crate = crateIds.DRAGONSCALE }, -- Tapestry of Namira
    [147599] = { crate = crateIds.DRAGONSCALE }, -- Banner of Namira
    [147591] = { crate = crateIds.DRAGONSCALE }, -- Namira, Mistress of Decay
    [147646] = { itemPrice = 3000 }, -- Meridia, Lady of Infinite Energies
    [147507] = { itemPrice = 800 }, -- Music Box, Hinterlands
    [147505] = { itemPrice = 800 }, -- Music Box, Y'ffre in Every Leaf
    [147506] = { itemPrice = 800 }, -- Music Box, Sands of the Alik'r
    [147636] = { bundle = bundles.FIRSTBLADE }, -- Banner of Hermaeus Mora
    [147590] = { pack = packs.FORGE }, -- Dwarven Bust, Forge-Lord
    [147574] = { pack = packs.FORGE }, -- Dwarven Frieze, Wrathstone
    [147575] = { pack = packs.FORGE }, -- Dwarven Frieze, Power in Twain
    [147576] = { pack = packs.FORGE }, -- Dwarven Frieze, Colossal Power
    [151824] = { pack = packs.MOONBISHOP }, -- Lunar Tapestry, The Open Path
    [151825] = { pack = packs.MOONBISHOP }, -- Lunar Tapestry, The Gathering
    [151826] = { pack = packs.MOONBISHOP }, -- Lunar Tapestry, The Dance
    [151827] = { pack = packs.MOONBISHOP }, -- Lunar Tapestry, The Gate
    [151828] = { pack = packs.MOONBISHOP }, -- Lunar Tapestry, The Demon
  },

  [src.EDITOR] = {
    [147585] = { { itemPrice = 40 }, { pack = packs.FORGE }, { houses = { 6139 } } }, -- Dwarven Gear, Large Spokes
    [147586] = { { itemPrice = 50 }, { pack = packs.FORGE } }, -- Dwarven Hub, Sentry Wheel
    [147587] = { { itemPrice = 40 }, { pack = packs.FORGE } }, -- Dwarven Gear, Large Open
    [147588] = { { itemPrice = 220 }, { pack = packs.FORGE } }, -- Dwarven Conduit, Rounded
    [147589] = { { itemPrice = 150 }, { pack = packs.FORGE } }, -- Dwarven Brazier, Open
    [147664] = { { itemPrice = 270 }, { pack = packs.FORGE } }, -- Dwarven Dais, Conduit
    [147577] = { { itemPrice = 920 }, { pack = packs.FORGE } }, -- Dwarven Platform, Fan
    [147578] = { { itemPrice = 1400 }, { pack = packs.FORGE } }, -- Dwarven Throne, Conduit
    [147579] = { { itemPrice = 240 }, { pack = packs.FORGE }, { houses = { 6139 } } }, -- Dwarven Gearwork, Perpetual
    [147580] = { { itemPrice = 310 }, { pack = packs.FORGE }, { houses = { 6139 } } }, -- Dwarven Lamps, Heavy
    [147581] = { { itemPrice = 350 }, { pack = packs.FORGE }, { houses = { 6139 } } }, -- Dwarven Table, Heavy Workbench
    [147582] = { { itemPrice = 50 }, { pack = packs.FORGE } }, -- Dwarven Part, Sentry Head
    [147583] = { { itemPrice = 220 }, { pack = packs.FORGE }, { houses = { 6139 } } }, -- Dwarven Valve, Sealed
    [147584] = { { itemPrice = 160 }, { pack = packs.FORGE } }, -- Dwarven Rack, Spider Legs
    [147572] = { itemPrice = 120 }, -- Barricade, Bladed Fence
    [147573] = { itemPrice = 120 }, -- Barricade, Bladed Hurdle
  },
}

FurC.CrownStore[ver.WEREWOLF] = {
  [src.CROWN] = {
    [141835] = { houses = { 5461 } }, -- Tree, Whorled Fig
    [141856] = { crate = crateIds.HOLLOWJACK }, -- Decorative Hollowjack Daedra-Skull
    [141855] = { crate = crateIds.HOLLOWJACK }, -- Decorative Hollowjack Wraith-Lantern
    [141854] = { crate = crateIds.HOLLOWJACK }, -- Decorative Hollowjack Flame-Skull
    [141870] = { pack = packs.HOLLOWJACK }, -- Raven-Perch Cemetery Wreath
    [141875] = { pack = packs.HOLLOWJACK }, -- Witches Festival Scarecrow
    [141778] = { pack = packs.HOLLOWJACK }, -- Target Wraith-of-Crows
  },

  [src.EDITOR] = {
    [141832] = { { itemPrice = 70 }, { houses = { 5461 } } }, -- Tree, Robust Fig
    [141833] = { { itemPrice = 150 }, { houses = { 5461 } } }, -- Tree, Ancient Fig
    [141834] = { { itemPrice = 170 }, { houses = { 5461 } } }, -- Tree, Towering Fig
    [141845] = { { itemPrice = 370 }, { houses = { 5461 } } }, -- Mushrooms, Climbing Ambershine
    [141846] = { { itemPrice = 370 }, { houses = { 5461 } } }, -- Mushrooms, Ambershine Cluster
    [141844] = { { itemPrice = 70 }, { houses = { 5461 } } }, -- Plants, Amber Spadeleaf Cluster
    [141841] = { { itemPrice = 40 }, { houses = { 5461 } } }, -- Tree Ferns, Cluster
    [141842] = { { itemPrice = 10 }, { houses = { 5461 } } }, -- Tree Ferns, Juvenile Cluster
    [141836] = { { itemPrice = 170 }, { houses = { 5461 } } }, -- Monolith, Lord Hircine Ritual
    [141843] = { { itemPrice = 30 }, { houses = { 5461 } } }, -- Plants, Yellow Frond Cluster
    [140297] = { { itemPrice = 1700 }, { pack = packs.NOBLEPARLOUR } }, -- Replica Throne of Alinor
    [141976] = { { itemPrice = 60 }, { pack = packs.HOLLOWJACK } }, -- Pumpkin Patch, Display
    [141965] = { { itemPrice = 240 }, { pack = packs.HOLLOWJACK } }, -- Hollowjack Lantern, Soaring Dragon
    [141966] = { { itemPrice = 240 }, { pack = packs.HOLLOWJACK } }, -- Hollowjack Lantern, Toothy Grin
    [141967] = { { itemPrice = 240 }, { pack = packs.HOLLOWJACK } }, -- Hollowjack Lantern, Ouroboros
    [142005] = { { itemPrice = 180 }, { pack = packs.HOLLOWJACK } }, -- Specimen Jar, Monstrous Remains
    [120876] = { { itemPrice = 150 }, { pack = packs.HOLLOWJACK } }, -- Gravestone, Imp Engraving
    [120875] = { { itemPrice = 150 }, { pack = packs.HOLLOWJACK } }, -- Gravestone, Clover Engraving
    [142003] = { { itemPrice = 180 }, { pack = packs.HOLLOWJACK }, { houses = { 11687 } } }, -- Specimen Jar, Eyes
    [141869] = { { itemPrice = 150 }, { houses = { 5462 } } }, -- Alinor Potted Plant, Cypress
    [141853] = { { itemPrice = 2500 }, { houses = { 5461 } } }, -- Statue of Hircine's Bitter Mercy
    [139364] = { itemPrice = 1500 }, -- Sea Sload Neural Tree, Active
    [139363] = { itemPrice = 340 }, -- Sea Sload Astral Nodule, Large
    [139362] = { itemPrice = 340 }, -- Sea Sload Astral Nodule, Small
  },
}

FurC.CrownStore[ver.SLAVES] = {
  [src.CROWN] = {
    [145446] = { pack = packs.SWAMP }, -- Sithis, the Hungering Dark
    [146069] = { pack = packs.SWAMP }, -- Target Voriplasm
    [145493] = { crate = crateIds.XANMEER }, -- Lantern Mantis
    [145492] = { crate = crateIds.XANMEER }, -- Gas Blossom
    [145491] = { crate = crateIds.XANMEER }, -- Static Pitcher
  },

  [src.EDITOR] = {
    [142235] = { itemPrice = 800 }, -- Music Box, Flickering Shadows
    [145466] = { itemPrice = 40 }, -- Plant, Wilted Hist Bulb
    [145465] = { itemPrice = 30 }, -- Plant Cluster, Wilted Hist Bulb
    [145464] = { itemPrice = 30 }, -- Plant, Red Sister Ti
    [145463] = { itemPrice = 35 }, -- Plant Cluster, Red Sister Ti
    [145462] = { itemPrice = 40 }, -- Plant, Cardinal Flower
    [145460] = { itemPrice = 30 }, -- Plant, Canna Leaves
    [145459] = { itemPrice = 90 }, -- Murkmire Kiln, Ancient Stone
    [145448] = { { itemPrice = 1000 }, { pack = packs.SWAMP }, { houses = { 5757 } } }, -- Murkmire Throne, Engraved
    [145444] = { itemPrice = 130 }, -- Murkmire Totem, Hist Guardian
    [145429] = { itemPrice = 65 }, -- Plant Cluster, Bounteous Cardinal Flower
    [145411] = { itemPrice = 410 }, -- Plant, Luminous Lantern Flower
    [145322] = { itemPrice = 800 }, -- Music Box, Blood and Glory
    [145457] = { itemPrice = 70 }, -- Tree, Banyan
    [145458] = { itemPrice = 220 }, -- Tree, Huge Ancient Banyan
    [146062] = { { itemPrice = 270 }, { pack = packs.NEWLIFE2018 } }, -- Winter Ouroboros Wreath
    [146061] = { { itemPrice = 270 }, { pack = packs.NEWLIFE2018 } }, -- New Life Triptych Banner
    [146060] = { { itemPrice = 95 }, { pack = packs.NEWLIFE2018 } }, -- New Life Ladle
    [146059] = { { itemPrice = 360 }, { pack = packs.NEWLIFE2018 } }, -- New Life Snowmortal, Khajiit
    [146058] = { { itemPrice = 360 }, { pack = packs.NEWLIFE2018 } }, -- New Life Snowmortal, Argonian
    [146057] = { { itemPrice = 360 }, { pack = packs.NEWLIFE2018 } }, -- New Life Snowmortal, Human
    [146056] = { { itemPrice = 130 }, { pack = packs.NEWLIFE2018 } }, -- New Life Cookies and Ale
    [146055] = { { itemPrice = 65 }, { pack = packs.NEWLIFE2018 }, { pack = packs.WINTER } }, -- New Life Garland Wreath
    [146054] = { { itemPrice = 60 }, { pack = packs.NEWLIFE2018 }, { pack = packs.WINTER } }, -- New Life Garland
    [146053] = { { itemPrice = 480 }, { pack = packs.NEWLIFE2018 } }, -- Guar Ice Sculpture
    [146052] = { { itemPrice = 480 }, { pack = packs.NEWLIFE2018 } }, -- Vvardvark Ice Sculpture
    [146051] = { { itemPrice = 480 }, { pack = packs.NEWLIFE2018 } }, -- Mudcrab Ice Sculpture
    [146050] = { { itemPrice = 2700 }, { pack = packs.NEWLIFE2018 } }, -- Winter Festival Hearthfire
    [146049] = { { itemPrice = 750 }, { pack = packs.NEWLIFE2018 } }, -- Winter Festival Hearth
    [146048] = { { itemPrice = 1200 }, { pack = packs.NEWLIFE2018 } }, -- New Life Festive Fir
    [145556] = { { itemPrice = 60 }, { houses = { 5756 } } }, -- Tree, Tall Snowy Fir
    [145555] = { { itemPrice = 40 }, { houses = { 5756 } } }, -- Tree, Snowy Fir
    [145554] = { { itemPrice = 210 }, { houses = { 5756 } } }, -- Tree, Towering Snowy Fir
    [145454] = { { itemPrice = 30 }, { pack = packs.SWAMP }, { houses = { 13882 } } }, -- Plant, Marsh Aloe Pod
    [145453] = { { itemPrice = 30 }, { pack = packs.SWAMP } }, -- Plant, Marsh Aloe
    [145456] = { { itemPrice = 260 }, { pack = packs.SWAMP } }, -- Plant, Hist Bulb
    [145455] = { { itemPrice = 290 }, { pack = packs.SWAMP } }, -- Plant, Dendritic Hist Bulb
    [145452] = { { itemPrice = 170 }, { pack = packs.SWAMP } }, -- Shrine, Sithis Looming Anointed
    [145451] = { { itemPrice = 140 }, { pack = packs.SWAMP } }, -- Shrine, Sithis Figure Anointed
    [145449] = { { itemPrice = 450 }, { pack = packs.SWAMP } }, -- Stele, Hist Guardians
    [145450] = { { itemPrice = 450 }, { pack = packs.SWAMP } }, -- Stele, Hist Cultivation
    [146073] = { { itemPrice = 70 }, { pack = packs.DEEPMIRE } }, -- Plant Cluster, Marsh Nigella
    [145461] = { itemPrice = 30 }, -- Plant Cluster, Cardinal Flower
    [145447] = { { itemPrice = 260 }, { pack = packs.SWAMP }, { houses = { 5757 } } }, -- Murkmire Dais, Engraved
    [145445] = { pack = packs.DEEPMIRE }, -- The Sharper Tongue: A Jel Primer
    [145443] = { { itemPrice = 270 }, { pack = packs.DEEPMIRE }, { houses = { 5757 } } }, -- Murkmire Shrine, Sithis Looming
    [145442] = { { itemPrice = 140 }, { pack = packs.DEEPMIRE } }, -- Grave-Stake, Large Twinned
    [145441] = { { itemPrice = 140 }, { pack = packs.DEEPMIRE } }, -- Grave-Stake, Large Serpent
    [145440] = { { itemPrice = 140 }, { pack = packs.DEEPMIRE } }, -- Grave-Stake, Large Skull
    [145439] = { { itemPrice = 140 }, { pack = packs.DEEPMIRE } }, -- Grave-Stake, Large Fearsome
    [145438] = { { itemPrice = 140 }, { pack = packs.DEEPMIRE } }, -- Grav-Stake, Large Glyphed
    [145437] = { { itemPrice = 240 }, { pack = packs.DEEPMIRE } }, -- Reed Felucca, Double Hulled
    [145436] = { pack = packs.DEEPMIRE }, -- Canopied Felucca, Double Hulled
    [145435] = { { itemPrice = 110 }, { pack = packs.DEEPMIRE } }, -- Plant, Marsh Mani Flower
    [145434] = { { itemPrice = 110 }, { pack = packs.DEEPMIRE } }, -- Plant, Large Inert Lantern Flower
    [145433] = { { itemPrice = 60 }, { pack = packs.DEEPMIRE }, { houses = { 5757 } } }, -- Plant, Rafflesia
    [145432] = { { itemPrice = 70 }, { pack = packs.DEEPMIRE } }, -- Plant, Canna Lily
    [145431] = { { itemPrice = 35 }, { pack = packs.DEEPMIRE } }, -- Plant, Marsh Nigella
    [145430] = { { itemPrice = 55 }, { pack = packs.DEEPMIRE } }, -- Plant, Star Blossom
    [145428] = { { itemPrice = 65 }, { pack = packs.DEEPMIRE }, { houses = { 11172 } } }, -- Murkmire Lantern Post, Covered
    [145427] = { pack = packs.DEEPMIRE }, -- Serpent Skull, Colossal
    [145426] = { { itemPrice = 410 }, { pack = packs.DEEPMIRE } }, -- Murkmire Felucca, Canopied
  },
}

FurC.CrownStore[ver.ALTMER] = {
  [src.CROWN] = {},

  [src.EDITOR] = {
    [139483] = { { itemPrice = 90 }, { houses = { 5169 } } }, -- Alinor Column, Tumbled Timeworn
    [139482] = { { itemPrice = 200 }, { houses = { 5169, 5462 } } }, -- Alinor Column, Huge Timeworn
    [139481] = { { itemPrice = 200 }, { houses = { 5169 } } }, -- Alinor Column, Jagged Timeworn
    [139368] = { { itemPrice = 100 }, { pack = packs.NOBLEBATH }, { pack = packs.JESTER }, { houses = { 13558 } } }, -- Alinor Bathing Robes, Decorative
    [139366] = { { itemPrice = 2000 }, { pack = packs.NOBLEPARLOUR } }, -- Alinor Fountain, Regal
    [139352] = { { itemPrice = 1000 }, { houses = { 5169 } } }, -- Alinor Tomb, Ornate
    [139351] = { itemPrice = 200 }, -- Alinor Monument, Marble
    [139350] = { { itemPrice = 940 }, { houses = { 13882, 12655, 13560 } } }, -- Alinor Pergola, Purple Wisteria Overhang
    [139349] = { { itemPrice = 940 }, { houses = { 5168, 12655 } } }, -- Alinor Pergola, Blue Wisteria Peaked
    [139348] = { { itemPrice = 940 }, { houses = { 5462, 5168 } } }, -- Alinor Pergola, Purple Wisteria
  },
}

FurC.CrownStore[ver.DRAGONS] = {
  [src.CROWN] = {
    [134855] = { crate = crateIds.SCALECALLER }, -- Banner of Peryite
    [134854] = { crate = crateIds.SCALECALLER }, -- Tapestry of Peryite
    [134853] = { crate = crateIds.SCALECALLER }, -- Peryite, The Taskmaster
    [134686] = { itemPrice = 2000 }, -- Sithis, The Dread Father
    [134879] = { pack = packs.HUBTREASURE }, -- Hubalajad's Reflection
    [134880] = { pack = packs.HUBTREASURE }, -- Ra Gada Reliquary, Miniature Palace
    [134881] = { pack = packs.HUBTREASURE }, -- In Defense of Prince Hubalajad
    [134823] = { pack = packs.HUBTREASURE }, -- Target Mournful Aegis
    [134890] = { pack = packs.DIBELLA }, -- Dibella, Lady of Love
    [134961] = { pack = packs.DIBELLA }, -- Dibella's Mysteries and Revelations
    [134870] = { pack = packs.TYRANTS }, -- Ancient Nord Chest, Dragon Crest
    [134871] = { { pack = packs.TYRANTS }, { houses = { 8652 } } }, -- Ancient Nord Urn, Dragon Crest
    [134873] = { { pack = packs.TYRANTS }, { houses = { 8652 } } }, -- Ancient Nord Bookcase, Wide
    [134874] = { pack = packs.TYRANTS }, -- Ancient Nord Bookcase, Narrow
    [134875] = { pack = packs.TYRANTS }, -- Ancient Nord Funerary Jar, Linked Rings
    [134876] = { pack = packs.TYRANTS }, -- Ancient Nord Funerary Jar, Crimson Sash
    [134877] = { { pack = packs.TYRANTS }, { houses = { 8652 } } }, -- Ancient Nord Funerary Jar, Dragon Figure
    [134878] = { pack = packs.TYRANTS }, -- Ancient Nord Funerary Jar, Dragon Crest
    [134872] = { { pack = packs.TYRANTS }, { houses = { 8652 } } }, -- Ancient Nord Brazier, Dragon Crest
    [134863] = { { pack = packs.TYRANTS }, { houses = { 8652 } } }, -- Ancient Nord Sconce, Dragon Crest
    [134862] = { pack = packs.TYRANTS }, -- Ancient Nord Runestone, Memorial
    [134856] = { pack = packs.TYRANTS }, -- Dragon Skeleton, Mid-Flight
    [134857] = { pack = packs.TYRANTS }, -- Dragon Priest Frieze: Triumph
    [134858] = { pack = packs.TYRANTS }, -- Dragon Priest Frieze: Exodus
    [134859] = { pack = packs.TYRANTS }, -- Dragon Priest Frieze: Restoration
    [134860] = { pack = packs.TYRANTS }, -- Dragon Priest Frieze: Ascension
    [134861] = { pack = packs.TYRANTS }, -- The History of Zaan The Scalecaller
    [134864] = { pack = packs.TYRANTS }, -- Dragon Cranium, Ancient
    [134865] = { pack = packs.TYRANTS }, -- Unidentified Bones, Gargantuan
    [134866] = { pack = packs.TYRANTS }, -- Lamia Cranium, Ancient
    [134867] = { pack = packs.TYRANTS }, -- Argonian Skull, Complete
    [134868] = { pack = packs.TYRANTS }, -- Khajiit Skull, Complete
    [134869] = { pack = packs.TYRANTS }, -- Orc Skull, Complete
    [140220] = { pack = packs.MEPHALA }, -- Rumors of the Spiral Skein
    [139163] = { pack = packs.MEPHALA }, -- Mephala, The Webspinner (statue)
    [139139] = { { crate = crateIds.PSIJIC }, { houses = { 11260 } } }, -- Nocturnal, Mistress of Shadows
    [139138] = { crate = crateIds.PSIJIC }, -- Banner, Nocturnal
    [139137] = { crate = crateIds.PSIJIC }, -- Tapestry, Nocturnal
  },

  [src.EDITOR] = {
    [134970] = { { itemPrice = 100 }, { houses = { 4794 } } }, -- Mushrooms, Glowing Sprawl
    [134947] = { { itemPrice = 100 }, { houses = { 4794 } } }, -- Mushrooms, Glowing Field
    [134948] = { { itemPrice = 400 }, { houses = { 4794 } } }, -- Mushrooms, Glowing Cluster
    [134972] = { { itemPrice = 400 }, { houses = { 4794 } } }, -- Brotherhood Brazier, Wrought Iron
    [134882] = { { itemPrice = 90 }, { pack = packs.HUBTREASURE }, { houses = { 14586 } } }, -- Gold Drakes, Pristine
    [134883] = { { itemPrice = 360 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Funerary Statue, Stone Cat
    [134884] = { { itemPrice = 360 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Funerary Statue, Gilded Cat
    [134885] = { { itemPrice = 360 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Funerary Statue, Gilded Ibis
    [134886] = { { itemPrice = 360 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Funerary Statue, Gilded Servant
    [134887] = { { itemPrice = 2000 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Guardian Statue, Lion Ibis
    [134888] = { { itemPrice = 2000 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Guardian Statue, Winged Bull
    [134889] = { { itemPrice = 2000 }, { pack = packs.HUBTREASURE } }, -- Ra Gada Guardian Statue, Riding Camel
    [134971] = { { itemPrice = 100 }, { pack = packs.HEART }, { houses = { 4794 } } }, -- Candles, Votive Group
    [134848] = { { itemPrice = 1500 }, { pack = packs.DIBELLA }, { pack = packs.OASIS } }, -- Blue Butterfly Flock
    [134899] = { { itemPrice = 45 }, { pack = packs.DIBELLA } }, -- Flower Spray, Crimson Daisies
    [134901] = { { itemPrice = 45 }, { pack = packs.DIBELLA }, { houses = { 13882 } } }, -- Flower Spray, Starlight Daisies
    [134896] = { { itemPrice = 45 }, { pack = packs.DIBELLA } }, -- Flower, Lover's Lily
    [134898] = { { itemPrice = 45 }, { pack = packs.DIBELLA } }, -- Flowers, Midnight Sage
    [134900] = { { itemPrice = 20 }, { pack = packs.DIBELLA } }, -- Flowers, Red Poppy
    [134902] = { { itemPrice = 20 }, { pack = packs.DIBELLA } }, -- Flowers, Violet Bellflower
    [134903] = { { itemPrice = 45 }, { pack = packs.DIBELLA } }, -- Flowers, Midnight Glory
    [134849] = { { itemPrice = 1500 }, { pack = packs.DIBELLA }, { pack = packs.OASIS } }, -- Monarch Butterfly Flock
    [134891] = { { itemPrice = 2500 }, { pack = packs.DIBELLA } }, -- Pergola, Festive Flowers
    [134895] = { { itemPrice = 1800 }, { pack = packs.DIBELLA } }, -- Redguard Fountain, Mosaic
    [134904] = { { itemPrice = 260 }, { pack = packs.DIBELLA } }, -- Seal of Dibella
    [134905] = { { itemPrice = 260 }, { pack = packs.DIBELLA } }, -- Ritual Stone, Dibella
    [134906] = { { itemPrice = 240 }, { pack = packs.DIBELLA }, { houses = { 13060 } } }, -- Ritual Brazier, Gilded
    [134892] = { { itemPrice = 85 }, { pack = packs.DIBELLA } }, -- Tree, Pale Gold
    [134893] = { { itemPrice = 85 }, { pack = packs.DIBELLA }, { houses = { 14587 } } }, -- Tree, Argent Blue
    [134894] = { { itemPrice = 20 }, { pack = packs.DIBELLA } }, -- Wildflowers, Yellow and Orange
    [134897] = { { itemPrice = 45 }, { pack = packs.DIBELLA }, { houses = { 13882 } } }, -- Vine Curtain, Festive Flowers
    [134921] = { { itemPrice = 520 }, { houses = {} }, { pack = packs.FARGRAVE } }, -- Redguard Lamppost, Stone
    [134922] = { { itemPrice = 250 }, { houses = { 4795 } } }, -- Redguard Pillar, Tiered
    [134923] = { { itemPrice = 2000 }, { houses = { 4795 } } }, -- Redguard Trellis, Peaked
    [134924] = { itemPrice = 380 }, -- Redguard Fence, Brass Capped
    [134925] = { { itemPrice = 2200 }, { houses = { 4795 } } }, -- Redguard Fountain, Pillar
    [134926] = { { itemPrice = 1200 }, { houses = { 4795 } } }, -- Redguard Awning, Wall
    [134927] = { { itemPrice = 1200 }, { houses = { 4795, 7601 } } }, -- Wedding Pergola, Double
    [134928] = { { itemPrice = 1200 }, { houses = { 4795 } } }, -- Wedding Pergola, Triple
    [134929] = { { itemPrice = 45 }, { houses = { 4795 } } }, -- Trees, Savanna Cluster
    [134930] = { { itemPrice = 30 }, { houses = { 4795 } } }, -- Bushes, Swordgrass Cluster
    [134931] = { { itemPrice = 50 }, { houses = { 4795 } } }, -- Boulder, Weathered Desert
    [134932] = { { itemPrice = 50 }, { houses = { 4795 } } }, -- Boulder, Tiered Desert
    [134933] = { { itemPrice = 90 }, { houses = { 6752, 4794 } } }, -- Cranium, Jawless
    [134934] = { { itemPrice = 10 }, { houses = { 4794 } } }, -- Rocks, Basalt Chunks
    [134936] = { { itemPrice = 110 }, { houses = { 4794 } } }, -- Cave Deposit, Tall Stalagmite Cluster
    [134938] = { { itemPrice = 110 }, { houses = { 4794 } } }, -- Cave Deposit, Stalagmite Group
    [134945] = { { itemPrice = 200 }, { houses = { 4794 } } }, -- Cave Deposit, Extended Spire
    [134973] = { { itemPrice = 200 }, { houses = { 4794 } } }, -- Cave Deposit, Stalactite Cone Cluster
    [134939] = { { itemPrice = 110 }, { houses = { 4794 } } }, -- Cave Deposit, Stalactite Cone
    [134941] = { { itemPrice = 110 }, { houses = { 4794 } } }, -- Cave Deposit, Spire
    [134943] = { { itemPrice = 1000 }, { houses = { 4794 } } }, -- Brotherhood Banner, Long
    [134944] = { itemPrice = 340 }, -- Brotherhood Column, Tall Ornate
    [134946] = { itemPrice = 340 }, -- Brotherhood Column, Ornate
    [134951] = { { itemPrice = 30 }, { houses = { 4794 } } }, -- Mushrooms, Assorted Cluster
    [134952] = { { itemPrice = 30 }, { houses = { 4794 } } }, -- Mushrooms, Sporous Browncap
    [134953] = { { itemPrice = 340 }, { houses = { 4794 } } }, -- Brotherhood Carpet, Large Worn
    [126774] = { itemPrice = 510 }, -- Dres Tapestry, House
    [126775] = { itemPrice = 510 }, -- Hlaalu Tapestry, House
    [126777] = { itemPrice = 510 }, -- Redoran Tapestry, House
    [126778] = { itemPrice = 510 }, -- Telvanni Tapestry, House
    [134974] = { { itemPrice = 340 }, { houses = { 4794 } } }, -- Brotherhood Carpet, Worn
    [134950] = { { itemPrice = 30 }, { houses = { 4794 } } }, -- Mushrooms, Flapjack Stack
    [139389] = { { itemPrice = 200 }, { pack = packs.MEPHALA } }, -- Crystal, Crimson Cluster
    [139367] = { { itemPrice = 1000 }, { pack = packs.NOBLEBATH } }, -- Regal Sauna Pool, Two Person
    [139650] = { { itemPrice = 30 }, { houses = { 5169, 13882 } } }, -- Bushes, Ivy Cluster
    [139480] = { { itemPrice = 30 }, { houses = { 5169, 13882 } } }, -- Plants, Redtop Grass Tuft
    [139376] = { { itemPrice = 260 }, { pack = packs.NOBLEPARLOUR }, { houses = { 5169, 5168 } } }, -- Alinor Banner, Hanging
    [139365] = { itemPrice = 370 }, -- Psijic Lighting Globe, Framed
    [139361] = { itemPrice = 270 }, -- Mind Trap Kelp, Young
    [139360] = { itemPrice = 510 }, -- Mind Trap Kelp, Cluster
    [139359] = { itemPrice = 340 }, -- Mind Trap Coral Formation, Trees Capped
    [139358] = { itemPrice = 340 }, -- Mind Trap Coral Formation, Tree Capped
    [139357] = { itemPrice = 340 }, -- Mind Trap Coral Formation, Tree Antler
    [139356] = { itemPrice = 340 }, -- Mind Trap Coral Formation, Waving Hands
    [139355] = { itemPrice = 340 }, -- Mind Trap Coral Formation, Heart
    [139354] = { itemPrice = 340 }, -- Mind Trap Coral Spire, Bulbous
    [139353] = { itemPrice = 340 }, -- Mind Trap Coral Spire, Branched
    [139347] = { itemPrice = 45 }, -- Flowers, Yellow Oleander Cluster
    [139346] = { { itemPrice = 45 }, { houses = { 13882 } } }, -- Flowers, Lizard Tail Patch
    [139345] = { { itemPrice = 45 }, { houses = { 13882 } } }, -- Flowers, Lizard Tail Cluster
    [139344] = { itemPrice = 45 }, -- Flowers, Hummingbird Mint Cluster
    [139343] = { { itemPrice = 45 }, { houses = { 13882 } } }, -- Tree, Cloud White
    [139342] = { { itemPrice = 45 }, { houses = {} } }, -- Tree, Vibrant Pink
    [139341] = { itemPrice = 310 }, -- Tree, Towering Poplar
    [139340] = { itemPrice = 310 }, -- Tree, Ancient Summerset Spruce
    [139339] = { { itemPrice = 25 }, { houses = { 5462, 9014 } } }, -- Vines, Sun-Bronzed Ivy Climber
    [139338] = { { itemPrice = 25 }, { houses = {} } }, -- Vines, Sun-Bronzed Ivy Swath
    [139337] = { { itemPrice = 580 }, { houses = { 5462, 13882 } } }, -- Tree, Ancient Blooming Ginkgo
    [139336] = { itemPrice = 90 }, -- Trees, Shade Interwoven
    [139335] = { itemPrice = 310 }, -- Tree, Shade Ancient
    [139334] = { { itemPrice = 20 }, { houses = { 11172 } } }, -- Coral Formation, Tree Capped (green)
    [139333] = { { itemPrice = 45 }, { houses = { 11172, 5169 } } }, -- Coral Formation, Trees Capped
    [139332] = { { itemPrice = 45 }, { pack = packs.AQUATIC }, { houses = { 11172, 5169 } } }, -- Coral Formation, Tree Shelf
    [139331] = { { itemPrice = 45 }, { houses = { 11172, 5169, 10223 } } }, -- Coral Formation, Tree Antler
    [139330] = { { itemPrice = 45 }, { houses = { 11172, 10223 } } }, -- Coral Formation, Waving Hands
    [139329] = { { itemPrice = 45 }, { houses = { 11172 } } }, -- Coral Formation, Heart
    [139328] = { { itemPrice = 45 }, { houses = { 11172, 5169, 10223 } } }, -- Coral Spire, Branched
    [139327] = { { itemPrice = 45 }, { houses = { 11172, 5169 } } }, -- Coral Spire, Sturdy
    [139161] = { { itemPrice = 1500 }, { pack = packs.MEPHALA }, { houses = { 6752 } } }, -- Daedric Table, Grand Necropolis
    [139160] = { { itemPrice = 200 }, { pack = packs.MEPHALA } }, -- Daedric Armchair, Severe
    [139159] = { { itemPrice = 920 }, { pack = packs.MEPHALA }, { houses = { 6752, 10052 } } }, -- Daedric Chandelier, Gruesome
    [139158] = { { itemPrice = 150 }, { pack = packs.MEPHALA }, { houses = { 6752 } } }, -- Daedric Candelabra, Tall
    [139156] = { { itemPrice = 360 }, { pack = packs.MEPHALA } }, -- Cocoon, Skeleton
    [139155] = { { itemPrice = 80 }, { pack = packs.MEPHALA } }, -- Cocoon, Food Storage
    [139154] = { { itemPrice = 40 }, { pack = packs.MEPHALA } }, -- Cocoons, Dormant Cluster
    [139153] = { { itemPrice = 40 }, { pack = packs.MEPHALA } }, -- Cocoon, Dormant
    [139152] = { { itemPrice = 360 }, { pack = packs.MEPHALA } }, -- Cocoon, Enormous Empty
    [139151] = { { itemPrice = 140 }, { pack = packs.MEPHALA } }, -- Mushrooms, Shadowpalm Cluster
    [139150] = { { itemPrice = 70 }, { pack = packs.MEPHALA } }, -- Mushrooms, Midnight Cluster
    [139149] = { { itemPrice = 30 }, { pack = packs.MEPHALA } }, -- Plant, Scarlet Fleshfrond
    [139148] = { { itemPrice = 70 }, { pack = packs.MEPHALA } }, -- Mushroom, Nettlecap
    [139147] = { { itemPrice = 30 }, { pack = packs.MEPHALA } }, -- Plants, Scarlet Sawleaf
    [139146] = { { itemPrice = 490 }, { pack = packs.MEPHALA } }, -- Crystals, Midnight Bloom
    [139145] = { { itemPrice = 430 }, { pack = packs.MEPHALA } }, -- Crystals, Midnight Tower
    [139144] = { { itemPrice = 400 }, { pack = packs.MEPHALA } }, -- Crystals, Midnight Spire
    [139143] = { { itemPrice = 310 }, { pack = packs.MEPHALA } }, -- Crystals, Midnight Cluster
    [139142] = { { itemPrice = 380 }, { pack = packs.MEPHALA } }, -- Crystals, Crimson Spikes
    [139141] = { { itemPrice = 310 }, { pack = packs.MEPHALA } }, -- Crystals, Crimson Bed
    [139140] = { { itemPrice = 340 }, { pack = packs.MEPHALA } }, -- Crystals, Crimson Spray
    [139157] = { { itemPrice = 90 }, { pack = packs.MEPHALA }, { pack = packs.HOLLOWJACK } }, -- Webs, Thick Sheet
    [141939] = { { itemPrice = 180 }, { pack = packs.HOLLOWJACK } }, -- Grave, Grasping
  },
}

FurC.CrownStore[ver.CLOCKWORK] = {
  [src.CROWN] = {
    [134473] = { crate = crateIds.FIRE_ATRO }, -- Tapestry, Malacath
    [134475] = { crate = crateIds.FIRE_ATRO }, -- Statue of Malacath, Orc-Father
    [134474] = { crate = crateIds.FIRE_ATRO }, -- Banner, Malacath
    [134258] = { pack = packs.MALACATH }, -- Prayer to the Furious One
    [134259] = { pack = packs.MALACATH }, -- Malacath, God of Oaths and Curses
    [134260] = { pack = packs.MALACATH }, -- Orcish Bas-Relief, Axe
    [134261] = { pack = packs.MALACATH }, -- Orcish Bas-Relief, Sword
    [134262] = { pack = packs.MALACATH }, -- Orcish Bas-Relief, Spear
    [134251] = { pack = packs.COLDHARBOUR }, -- Coldharbour Bookcase, Filled
    [134252] = { pack = packs.COLDHARBOUR }, -- Coldharbour Bookcase, Black Laboratory
    [134253] = { pack = packs.COLDHARBOUR }, -- Coldharbour Bookcase, Filled Wide
    [134256] = { pack = packs.COLDHARBOUR }, -- Coldharbour Bookcase, Filled Pillar
    [134254] = { pack = packs.COLDHARBOUR }, -- Seal of Molag Bal
    [134255] = { pack = packs.COLDHARBOUR }, -- Transliminal Rupture
    [134257] = { pack = packs.COLDHARBOUR }, -- Daedra Dossier: Cold-Flame Atronach
    [134249] = { pack = packs.SOTHA }, -- Sotha Sil, The Clockwork God
    [134248] = { pack = packs.SOTHA }, -- Grand Mnemograph
    [134246] = { pack = packs.SOTHA }, -- The Law of Gears
  },

  [src.EDITOR] = {
    [134278] = { itemPrice = 3500 }, -- Clockwork Alchemy Station
    [134279] = { itemPrice = 3500 }, -- Clockwork Blacksmithing Station
    [134282] = { itemPrice = 3500 }, -- Clockwork Woodworking Station
    [134281] = { itemPrice = 3500 }, -- Clockwork Clothing Station
    [134277] = { itemPrice = 3000 }, -- Clockwork Provisioning Station
    [134276] = { itemPrice = 4500 }, -- Clockwork Dye Station
    [134280] = { itemPrice = 3500 }, -- Clockwork Enchanting Station
    [134270] = { { itemPrice = 85 }, { pack = packs.MALACATH } }, -- Cave Deposit, Large Double-Sided
    [134271] = { { itemPrice = 85 }, { pack = packs.MALACATH } }, -- Cave Deposit, Tall Stalagmite
    [134272] = { { itemPrice = 10 }, { pack = packs.MALACATH } }, -- Cave Deposit, Stalagmite Cluster
    [134268] = { { itemPrice = 570 }, { pack = packs.MALACATH }, { houses = { 1445 } } }, -- Orcish Brazier, Column
    [134269] = { { itemPrice = 220 }, { pack = packs.MALACATH }, { houses = { 1445 } } }, -- Orcish Dais, Raised
    [116518] = { { itemPrice = 270 }, { pack = packs.MALACATH } }, -- Orcish Drop Hammer, Repeating
    [134267] = { { itemPrice = 380 }, { pack = packs.MALACATH }, { houses = { 1445, 10223 } } }, -- Orcish Table, Grand Furs
    [134263] = { { itemPrice = 410 }, { pack = packs.MALACATH }, { houses = { 1445 } } }, -- Orcish Throne, Ancient
    [134264] = { { itemPrice = 190 }, { pack = packs.COLDHARBOUR } }, -- Daedric Brazier, Cold-Flame
    [134273] = { { itemPrice = 200 }, { pack = packs.COLDHARBOUR }, { houses = { 13881 } } }, -- Daedric Plinth, Sacrificial
    [134274] = { { itemPrice = 200 }, { pack = packs.COLDHARBOUR }, { houses = { 13881 } } }, -- Coldharbour Crate, Black Soul Gem
    [134275] = { { itemPrice = 200 }, { pack = packs.COLDHARBOUR }, { houses = { 13881 } } }, -- Coldharbour Bin, Black Soul Gem
    [134330] = { itemPrice = 490 }, -- Clockwork Control Panel, Double
    [134337] = { itemPrice = 1800 }, -- Clockwork Somnolostation, Octet
    [134579] = { { itemPrice = 5 }, { houses = { 1445 } } }, -- Rubble Pile, Worked Stone
    [130082] = { { itemPrice = 640 }, { pack = packs.MOLAG } }, -- Soul-Shriven, Robed
    [134326] = { { itemPrice = 260 }, { pack = packs.SOTHA }, { houses = { 1446 } } }, -- Clockwork Pump, Horizontal
    [134250] = { { itemPrice = 750 }, { pack = packs.SOTHA }, { houses = { 1446 } } }, -- Fabrication Sphere, Inactive
    [134247] = { { itemPrice = 190 }, { pack = packs.SOTHA }, { houses = { 1446 } } }, -- Soul Gem Module, Experimental
    [134266] = { { itemPrice = 35 }, { pack = packs.COLDHARBOUR }, { houses = { 10052, 6752 } } }, -- Daedric Books, Stacked
    [134265] = { { itemPrice = 80 }, { pack = packs.COLDHARBOUR }, { houses = { 10052, 6752 } } }, -- Daedric Books, Piled
    [134373] = { { itemPrice = 410 }, { pack = packs.SOTHA } }, -- Clockwork Wall Machinery, Rectangular
    [134374] = { itemPrice = 410 }, -- Clockwork Wall Machinery, Circular
    [134382] = { itemPrice = 870 }, -- Fabricant Tree, Beryl Cypress
    [134383] = { itemPrice = 870 }, -- Fabricant Tree, Towering Maple
    [134385] = { itemPrice = 870 }, -- Fabricant Tree, Brass Swamp
    [134387] = { itemPrice = 870 }, -- Fabricant Tree, Tall Cobalt Spruce
    [134388] = { itemPrice = 870 }, -- Fabricant Tree, Cobalt Oak
    [134384] = { itemPrice = 870 }, -- Fabricant Tree, Decorative Electrum
    [134386] = { itemPrice = 260 }, -- Fabricant Tree, Forked Cherry Blossom
    [134389] = { itemPrice = 140 }, -- Fabricant Tree, Decorative Brass
    [134390] = { itemPrice = 140 }, -- Clockwork Junk Heap, Large
    [134391] = { { itemPrice = 510 }, { houses = { 1446 } } }, -- Clockwork Sequence Spool, Column
    [134392] = { itemPrice = 260 }, -- Clockwork Recharging Column, Octet
    [134393] = { { itemPrice = 270 }, { pack = packs.SOTHA }, { houses = { 1446 } } }, -- Clockwork Workbench, Spacious
    [134394] = { itemPrice = 460 }, -- Clockwork Illuminator, Capsule Chandelier
    [134395] = { itemPrice = 150 }, -- Clockwork Illuminator, Wall Capsule
    [134396] = { itemPrice = 410 }, -- Clockwork Wall Machinery, Tall
    [134397] = { { itemPrice = 410 }, { pack = packs.SOTHA } }, -- Clockwork Wall Machinery, Ovoid
    [134398] = { itemPrice = 1300 }, -- Clockwork Gazebo, Copper and Basalt
    [134578] = { { itemPrice = 110 }, { houses = { 1445 } } }, -- Ice Floe, Thick
    [134577] = { { itemPrice = 50 }, { houses = { 1445 } } }, -- Ice Floe, Thin
    [134576] = { { itemPrice = 190 }, { houses = { 1445 } } }, -- Orcish Brazier, Snowswept Column
    [134575] = { { itemPrice = 50 }, { houses = { 1445 } } }, -- Boulder, Snowswept Crag
    [134574] = { { itemPrice = 50 }, { houses = { 1445 } } }, -- Boulder, Snowswept Peak
    [134573] = { { itemPrice = 5 }, { houses = { 1445 } } }, -- Stone, Snowswept Shard
    [134572] = { { itemPrice = 5 }, { houses = { 1445 } } }, -- Stones, Snowswept Cluster
    [134571] = { { itemPrice = 120 }, { houses = { 1445 } } }, -- Snow Pile, Large
    [134570] = { { itemPrice = 110 }, { pack = packs.NEWLIFE2018 }, { houses = { 1445 } } }, -- Snow Pile
    [134569] = { { itemPrice = 40 }, { houses = { 1445 } } }, -- Trees, Snowswept Pair
    [134568] = { { itemPrice = 40 }, { houses = { 1445 } } }, -- Tree, Snowswept Evergreen
    [134567] = { { itemPrice = 10 }, { houses = { 1445, 5756 } } }, -- Bush Cluster, Snowswept
    [134566] = { { itemPrice = 30 }, { houses = { 1445, 5756 } } }, -- Shrub Cluster, Snowswept
    [134565] = { { itemPrice = 130 }, { houses = { 1446 } } }, -- Fabrication Tank, Reinforced
    [134381] = { itemPrice = 110 }, -- Rocks, Sintered Outcropping
    [134380] = { itemPrice = 110 }, -- Rocks, Sintered Arch
    [134379] = { itemPrice = 50 }, -- Boulder, Large Metallic Shard
  },
}

FurC.CrownStore[ver.REACH] = {
  [src.CROWN] = {
    [132204] = { houses = { 1309 } }, -- Imperial Statue, Truth
    [132200] = { houses = { 1309 } }, -- Imperial Well, Akatosh
    [132202] = { houses = { 1309 } }, -- Rock, Anvil Limestone
    [132203] = { houses = { 1309 } }, -- Stone, Anvil Limestone
    [132201] = { houses = { 1309, 13758 } }, -- Tree, Kvatch Nut
    [130228] = { pack = packs.COVEN }, -- The Witches of Hag Fen
    [130215] = { pack = packs.COVEN }, -- Witches' Cauldron, Provisioning
    [131424] = { pack = packs.COVEN }, -- Fogs of the Hag Fen
    [130081] = { pack = packs.MOLAG }, -- Soul-Shriven, Armored
    [130083] = { pack = packs.MOLAG }, -- Daedric Block, Seat
    [130084] = { pack = packs.MOLAG }, -- Daedric Tapestry, Molag Bal
    [130085] = { pack = packs.MOLAG }, -- Daedric Banner, Molag Bal
    [130086] = { pack = packs.MOLAG }, -- Daedric Pennant, Molag Bal
    [130093] = { pack = packs.MOLAG }, -- Coldharbour Compact
    [130087] = { pack = packs.MOLAG }, -- Daedric Shards, Coldharbour
    [130091] = { pack = packs.MOLAG }, -- Statue of Molag Bal, God of Schemes
    [130088] = { pack = packs.MOLAG }, -- Daedric Fragment, Coldharbour
    [130092] = { pack = packs.MOLAG }, -- Seal of Molag Bal, Grand
    [130212] = { pack = packs.AYLEID }, -- Daedra Worship: The Ayleids
    [130192] = { crate = crateIds.REAPER }, -- Statue of Sheogorath, the Madgod
    [130190] = { crate = crateIds.REAPER }, -- Banner of Sheogorath
    [130189] = { crate = crateIds.REAPER }, -- Tapestry of Sheogorath
  },

  [src.EDITOR] = {
    [118287] = { { itemPrice = 85 }, { houses = { 8697, 1445, 5461 } } }, -- Carcass, Brown Hare
    [118282] = { { itemPrice = 85 }, { houses = { 5461 } } }, -- Carcass, Fresh Goose
    [130211] = { { itemPrice = 50 }, { pack = packs.AYLEID } }, -- Books, Ordered Row
    [130210] = { { itemPrice = 50 }, { pack = packs.AYLEID } }, -- Books, Scattered Row
    [130226] = { { itemPrice = 85 }, { pack = packs.COVEN }, { houses = { 5461, 8697 } } }, -- Carcass, Hanging Deer
    [130220] = { { itemPrice = 3300 }, { pack = packs.COVEN } }, -- Hagraven Altar
    [130222] = { { itemPrice = 260 }, { pack = packs.COVEN } }, -- Hagraven Totem, Skull
    [131423] = { { itemPrice = 750 }, { pack = packs.COVEN } }, -- Mists of the Hag Fen
    [130221] = { { itemPrice = 430 }, { pack = packs.COVEN } }, -- Reachmen Cage, Sturdy
    [130216] = { { itemPrice = 510 }, { pack = packs.COVEN } }, -- Witches' Basin, Scrying
    [130219] = { { itemPrice = 240 }, { pack = packs.COVEN } }, -- Witches' Brazier, Beast Skull
    [130223] = { { itemPrice = 340 }, { pack = packs.COVEN } }, -- Reachmen Rug, Mottled Skin
    [130224] = { { itemPrice = 180 }, { pack = packs.COVEN }, { houses = { 1310, 1311 } } }, -- Reachmen Rug, Smooth Skin
    [130225] = { { itemPrice = 340 }, { pack = packs.COVEN }, { houses = { 10052, 6752 } } }, -- Skulls, Heap
    [130227] = { { itemPrice = 850 }, { pack = packs.COVEN } }, -- Witches' Tent, Lean-To
    [130229] = { { itemPrice = 290 }, { pack = packs.COVEN } }, -- Tree, Wretched Cypress
    [130230] = { { itemPrice = 90 }, { pack = packs.COVEN } }, -- Stump, Wretched Cypress
    [130247] = { { itemPrice = 290 }, { pack = packs.COVEN } }, -- Tree, Fetid Cypress
    [130070] = { { itemPrice = 2000 }, { pack = packs.MOLAG }, { houses = { 13881 } } }, -- Daedric Spout, Arched
    [130071] = { { itemPrice = 300 }, { pack = packs.MOLAG } }, -- Daedric Torch, Coldharbour
    [130075] = { { itemPrice = 380 }, { pack = packs.MOLAG } }, -- Daedric Altar, Molag Bal
    [130078] = { { itemPrice = 380 }, { pack = packs.MOLAG }, { houses = { 13881 } } }, -- Soul Gem, Single
    [130079] = { { itemPrice = 380 }, { pack = packs.MOLAG } }, -- Soul Gems, Pile
    [130094] = { { itemPrice = 140 }, { pack = packs.MOLAG }, { houses = { 10052 } } }, -- Daedric Chains, Hanging
    [130095] = { { itemPrice = 640 }, { pack = packs.MOLAG } }, -- Daedric Torture Device, Chained
    [130069] = { { itemPrice = 2000 }, { pack = packs.MOLAG } }, -- Daedric Spout, Block
    [130080] = { { pack = packs.MOLAG }, { houses = { 13881 } } }, -- Soul Gems, Scattered
    [130089] = { { itemPrice = 360 }, { pack = packs.MOLAG } }, -- Daedric Brazier, Molag Bal
    [130090] = { { itemPrice = 310 }, { pack = packs.MOLAG } }, -- Daedric Sconce, Molag Bal
    [132165] = { itemPrice = 750 }, -- Hlaalu Bath Tub, Empty Basin
    [130207] = { { itemPrice = 270 }, { pack = packs.AYLEID } }, -- Ayleid Plinth, Engraved
    [130206] = { { itemPrice = 370 }, { pack = packs.AYLEID } }, -- Ayleid Apparatus, Welkynd
    [130205] = { { itemPrice = 680 }, { pack = packs.AYLEID } }, -- Ayleid Statue, Pious Priest
    [130204] = { { itemPrice = 410 }, { pack = packs.AYLEID }, { houses = { 13560 } } }, -- Welkynd Stones, Glowing
    [130202] = { { itemPrice = 170 }, { pack = packs.AYLEID } }, -- Ayleid Grate, Tall
    [130201] = { { itemPrice = 170 }, { pack = packs.AYLEID } }, -- Ayleid Grate, Small
    [130199] = { { itemPrice = 170 }, { pack = packs.AYLEID }, { houses = { 9014 } } }, -- Ayleid Bookshelf, Short Bare
    [130197] = { { itemPrice = 170 }, { pack = packs.AYLEID }, { houses = { 9014 } } }, -- Ayleid Bookcase, Tall Filled
    [131427] = { itemPrice = 1700 }, -- Orcish Tent, General's
    [131426] = { itemPrice = 680 }, -- Orcish Tent, Officer's
    [131425] = { itemPrice = 360 }, -- Orcish Tent, Soldier's
    [130329] = { itemPrice = 240 }, -- Primal Brazier, Rock Slab
  },
}

FurC.CrownStore[ver.MORROWIND] = {
  [src.CROWN] = {
    [126132] = { crate = crateIds.UNKNOWN }, -- Resplendent Sweetroll
    [125654] = { crate = crateIds.DWEMER }, -- Tapestry, Clavicus Vile
    [125480] = { crate = crateIds.DWEMER }, -- Banner, Clavicus Vile
    [126138] = { bundle = bundles.DWEMER }, -- A Guide to Dwemer Mega-Structures
    [125516] = { bundle = bundles.DWEMER }, -- Dwarven Gear Assembly, Grinding
    [126140] = { pack = packs.VIVEC }, -- Vivec's Grand Bed
    [126141] = { pack = packs.VIVEC }, -- Vivec's Grand Throne
    [126142] = { pack = packs.VIVEC }, -- Vivec's Divination Pool
    [126143] = { pack = packs.VIVEC }, -- Statue, Vivec's Triumph
    [126144] = { pack = packs.VIVEC }, -- Seal of Vivec
    [126145] = { pack = packs.VIVEC }, -- Sigil of Vivec
    [126146] = { pack = packs.VIVEC }, -- Banner, Vivec
    [126149] = { pack = packs.VIVEC }, -- Tapestry, Vivec
    [126150] = { pack = packs.VIVEC }, -- Tribunal Tablet of Sotha Sil
    [126152] = { pack = packs.VIVEC }, -- The Cliff-Strider Song
    [125532] = { pack = packs.PIPES }, -- Dwarven Pipeline, Fan
    [125537] = { pack = packs.PIPES }, -- Dwarven Piston Cylinder
    [125580] = { houses = { 1244 } }, -- Hlaalu Well, Covered Sillar Stone
    [125579] = { houses = { 1243 } }, -- Hlaalu Well, Braced Sillar Stone
    [125577] = { houses = { 1243 } }, -- Hlaalu Wall Post, Sillar Stone
    [125573] = { houses = { 1243, 1244 } }, -- Hlaalu Streetlamp, Paper
    [125568] = { houses = { 1243 } }, -- Hlaalu Sidewalk, Sillar Stone
    [125567] = { { houses = { 1244 } }, { bundle = bundles.STABLE } }, -- Hlaalu Shed, Open
    [125566] = { houses = { 1243 } }, -- Hlaalu Shed, Enclosed
    [125565] = { houses = { 1244 } }, -- Hlaalu Lantern, Hanging Paper
    [126114] = { pack = packs.AZURA }, -- Statue of Azura, Queen of Dawn and Dusk
    [126115] = { pack = packs.AZURA }, -- Statue of Azura's Moon
    [126116] = { pack = packs.AZURA }, -- Statue of Azura's Sun
    [126118] = { pack = packs.AZURA }, -- Banner of Azura
    [125489] = { pack = packs.AZURA }, -- Daedric Brazier, Flaming
    [126039] = { crate = crateIds.DWEMER }, -- Statue of masked Clavicus Vile with Barbas
  },

  [src.EDITOR] = {
    [130213] = { { itemPrice = 430 }, { pack = packs.AYLEID }, { houses = { 13560 } } }, -- Ayleid Cage, Hanging
    [125581] = { { itemPrice = 25 }, { houses = { 1245 } } }, -- Mushroom, Buttercake
    [126128] = { { pack = packs.AZURA }, { houses = { 6752 } } }, -- The Five Points of the Star
    [94157] = { itemPrice = 410 }, -- Imperial Medallion, Crest
    [125681] = { itemPrice = 50 }, -- Vines, Volcanic Roses
    [120733] = { { itemPrice = 70 }, { houses = { 1099 } } }, -- Tree, Gnarled Forest
    [125547] = { itemPrice = 85 }, -- Flower, Healthy Purple Bat Bloom
    [126464] = { { itemPrice = 610 }, { houses = { 1245 } } }, -- Telvanni Painting, Oversized Valley
    [126463] = { { itemPrice = 610 }, { houses = { 1245 } } }, -- Telvanni Painting, Oversized Forest
    [126462] = { { itemPrice = 610 }, { houses = { 1245 } } }, -- Telvanni Painting, Oversized Volcanic
    [126038] = { itemPrice = 5000 }, -- Target Centurion, Robust Lambent
    [126037] = { itemPrice = 4000 }, -- Target Centurion, Lambent
    [126034] = { itemPrice = 4000 }, -- The Lord
    [125461] = { itemPrice = 4000 }, -- The Lover
    [125460] = { itemPrice = 4000 }, -- The Mage
    [125459] = { itemPrice = 4000 }, -- The Ritual
    [125458] = { itemPrice = 4000 }, -- The Serpent
    [125457] = { itemPrice = 4000 }, -- The Shadow
    [125456] = { itemPrice = 4000 }, -- The Steed
    [125455] = { itemPrice = 4000 }, -- The Thief
    [125454] = { itemPrice = 4000 }, -- The Tower
    [125453] = { itemPrice = 4000 }, -- The Warrior
    [125452] = { itemPrice = 4000 }, -- The Lady
    [125451] = { itemPrice = 4000 }, -- The Apprentice
    [119556] = { itemPrice = 4000 }, -- The Atronach
    [126686] = { itemPrice = 400 }, -- Dwarven Chest, Relic
    [126607] = { { itemPrice = 410 }, { houses = { 1244, 1243 } } }, -- Velothi Painting, Oversized Waterfall
    [126604] = { itemPrice = 410 }, -- Velothi Panels, Geyser
    [126601] = { { itemPrice = 410 }, { houses = { 1243 } } }, -- Velothi Painting, Oversized Geyser
    [126598] = { itemPrice = 410 }, -- Velothi Panels, Waterfall
    [126597] = { itemPrice = 410 }, -- Velothi Painting, Oversized Volcano
    [126592] = { itemPrice = 410 }, -- Velothi Panels, Volcano
    [126479] = { { itemPrice = 310 }, { houses = { 1245 } } }, -- Telvanni Sconce, Organic Amber
    [126478] = { { itemPrice = 560 }, { houses = { 1245 } } }, -- Telvanni Arched Light, Organic Amber
    [126477] = { { itemPrice = 560 }, { houses = { 1245 } } }, -- Telvanni Streetlight, Organic Amber
    [126476] = { { itemPrice = 200 }, { houses = { 1245 } } }, -- Telvanni Lamp, Organic Amber
    [126475] = { { itemPrice = 260 }, { houses = { 1245 } } }, -- Telvanni Lantern, Organic Amber
    [125628] = { itemPrice = 70 }, -- Plant, Rosetted Sundew
    [125610] = { { itemPrice = 25 }, { houses = { 11223, 11525 } } }, -- Mushrooms, Cave Bracket Cluster
    [125607] = { { itemPrice = 10 }, { houses = { 11223, 12732, 11525 } } }, -- Mushroom, Young Netch Shield
    [125605] = { itemPrice = 10 }, -- Mushroom, Young Erupted Stinkcap
    [125603] = { itemPrice = 50 }, -- Mushroom, Stinkhorn Spore
    [125555] = { itemPrice = 85 }, -- Flowers, Sullen Purple Bat Blooms
    [125554] = { itemPrice = 85 }, -- Flowers, Opposing Purple Bat Blooms
    [125550] = { { itemPrice = 85 }, { houses = { 12732, 11223, 1245 } } }, -- Flowers, Lava Blooms
    [125549] = { itemPrice = 85 }, -- Flowers, Double Purple Bat Blooms
    [125548] = { itemPrice = 85 }, -- Flower, Towering Purple Bat Bloom
    [125545] = { { itemPrice = 30 }, { houses = { 11525, 11223 } } }, -- Fern, Young Dusky
    [125484] = { { itemPrice = 30 }, { houses = { 11525, 11223, 1243 } } }, -- Bush, Lush Laurel
    [125482] = { itemPrice = 50 }, -- Boulder, Volcanic Crag
    [120465] = { { itemPrice = 5 }, { houses = { 14078, 1095 } } }, -- Stone, Tapered Rough
  },
}

FurC.CrownStore[ver.HOMESTEAD] = {
  [src.CROWN] = {
    [118663] = { houses = { 1078, 1079 } }, -- Dark Elf Bed of Coals
    [126117] = { pack = packs.AZURA }, -- Tapestry of Azura
    [121004] = { houses = { 1309 } }, -- Hedge, Solid Arc
    [117887] = { houses = { 10051 } }, -- Redguard Tuffet, Sands
    [94181] = { houses = { 6752 } }, -- Imperial Throne of the Bay
    [121007] = { pack = packs.TREES }, -- Tree, Strong Maple
    [121008] = { pack = packs.TREES }, -- Tree, Autumn Maple
    [121013] = { pack = packs.TREES }, -- Saplings, Fragile Autumn Birch
    [121016] = { pack = packs.TREES }, -- Bush, Red Berry
    [121022] = { pack = packs.TREES }, -- Bush, Green Forest
    [117908] = { houses = { 1100 } }, -- Redguard Candlestick, Twisted
    [117843] = { houses = { 1094 } }, -- Redguard Bed, Wide Lattice
    [117902] = { houses = { 14077 } }, -- Redguard Pot, Gilded
    [118128] = { houses = { 1445 } }, -- Pelt, Hanging
    [119576] = { houses = { 4795 } }, -- Palm Tree Cluster
    [117906] = { pack = packs.CRAGKNICKS }, -- Redguard Urn, Gilded
  },

  [src.EDITOR] = {
    [118148] = { { itemPrice = 80 }, { houses = {} } }, -- Firelogs, Ashen
    [118146] = { { itemPrice = 80 }, { houses = {} } }, -- Firelogs, Flaming
    [118147] = { { itemPrice = 80 }, { houses = {} } }, -- Firelogs, Charred
    [118350] = { { itemPrice = 25 }, { houses = {} } }, -- Box of Tangerines
    [118352] = { { itemPrice = 25 }, { houses = {} } }, -- Box of Oranges
    [118482] = { { itemPrice = 25 }, { houses = {} } }, -- Book Stack, Tall
    [118353] = { { itemPrice = 25 }, { houses = { 1095 } } }, -- Box of Grapes
    [118354] = { { itemPrice = 25 }, { note = SI_FURC_SRC_MISCHOUSE }, { houses = { 14078, 11456, 5462 } } }, -- Box of Fruit
    [118175] = { itemPrice = 170 }, -- Shutters, Hinged Lattice
    [118174] = { itemPrice = 170 }, -- Shutters, Blue Lattice
    [118173] = { itemPrice = 170 }, -- Shutters, Blue Hinged
    [118172] = { itemPrice = 170 }, -- Shutters, Blue Slatted
    [118171] = { itemPrice = 170 }, -- Shutters, Blue Hatch
    [118170] = { itemPrice = 170 }, -- Shutters, Blue Double
    [118169] = { itemPrice = 170 }, -- Shutters, Blue Single
    [94100] = {
      { itemPrice = 50 },
      { pack = packs.CRAGPARLOUR },
      { category = SI_FURC_SRC_LVLUP },
      { houses = {} },
    }, -- Imperial BookCase, Swirled
    [117901] = { { itemPrice = 140 }, { pack = packs.HUBTREASURE }, { houses = { 7601, 10051 } } }, -- Redguard Amphora, Gilded
    [117894] = {
      { itemPrice = 240 },
      { pack = packs.CRAGBED },
      { pack = packs.HUBTREASURE },
      { houses = {} },
    }, -- Redguard Divider, Gilded
    [117904] = { { itemPrice = 190 }, { pack = packs.CRAGBED }, { pack = packs.HUBTREASURE } }, -- Redguard Trunk, Garish
    [121053] = { { itemPrice = 170 }, { pack = packs.CRAGKNICKS }, { pack = packs.HUBTREASURE } }, -- Jar, Gilded Canopic
    [121046] = { { itemPrice = 30 }, { pack = packs.CRAGKNICKS }, { houses = {} } }, -- Cheeses of Tamriel
    [118490] = { { itemPrice = 55 }, { pack = packs.CRAGKNICKS }, { houses = {} } }, -- Scroll, Rolled
    [94163] = { { itemPrice = 290 }, { pack = packs.DIBELLA }, { houses = {} } }, -- Imperial Bench, Scrollwork
    [119587] = { { itemPrice = 10 }, { houses = { 1066 } } }, -- Auridon Coneplants, Cluster
    [118347] = { itemPrice = 20 }, -- Bread, Various Loaves
    [118344] = { { itemPrice = 20 }, { houses = { 7601 } } }, -- Breads, Assortment
    [118162] = { { itemPrice = 340 }, { houses = { 13060, 11456 } } }, -- Carpet of the Desert Flame, Faded
    [118167] = { { itemPrice = 340 }, { houses = { 13060, 11456 } } }, -- Carpet of the Desert Flame, Faded
    [118166] = { { itemPrice = 340 }, { houses = { 13060 } } }, -- Carpet of the Desert, Faded
    [118161] = { itemPrice = 340 }, -- Carpet of the Mirage, Faded
    [118159] = { { itemPrice = 340 }, { houses = { 14078, 11456 } } }, -- Carpet of the Oasis, Faded
    [118158] = { { itemPrice = 340 }, { houses = { 14078, 11456 } } }, -- Carpet of the Sun, Faded Summer
    [118043] = { itemPrice = 25 }, -- Common Torch, Holder
    [118261] = { itemPrice = 25 }, -- Cushion, Faded Yellow
    [118260] = { itemPrice = 25 }, -- Cushion, Faded Blue
    [118259] = { { itemPrice = 25 }, { houses = { 10051 } } }, -- Cushion, Faded Red
    [94091] = { { itemPrice = 95 }, { houses = { 1309, 4794 } } }, -- Imperial Carpet, Arkay
    [94092] = { { itemPrice = 95 }, { houses = { 1309, 1086 } } }, -- Imperial Carpet, Kyne
    [94093] = { itemPrice = 95 }, -- Imperial Carpet, Stendarr
    [94094] = { { itemPrice = 140 }, { houses = { 1086 } } }, -- Imperial Banner, Arkay
    [94095] = { itemPrice = 140 }, -- Imperial Banner, Kyne
    [94096] = { { itemPrice = 140 }, { houses = { 1085 } } }, -- Imperial Banner, Stendarr
    [94097] = { { itemPrice = 95 }, { houses = { 1086, 5756 } } }, -- Imperial Bed, Bunk
    [94099] = { { itemPrice = 60 }, { houses = { 9014, 6140 } } }, -- Imperial Dresser, Short
    [94101] = { { itemPrice = 45 }, { houses = {} } }, -- Imperial Chair, Slatted
    [94102] = { { itemPrice = 120 }, { houses = {} } }, -- Imperial Rack, Cask
    [94103] = { { itemPrice = 60 }, { houses = {} } }, -- Imperial Dresser, Open
    [94104] = { { itemPrice = 40 }, { houses = {} } }, -- Imperial Stool, Sturdy
    [94105] = { { itemPrice = 95 }, { houses = { 4794, 6140 } } }, -- Imperial Table, Family
    [94106] = { { itemPrice = 95 }, { houses = { 5756 } } }, -- Imperial Desk, Sturdy
    [94107] = { { itemPrice = 50 }, { houses = {} } }, -- Imperial Table, Common
    [94108] = { { itemPrice = 50 }, { houses = {} } }, -- Imperial Shelf, Wall
    [94109] = { { itemPrice = 50 }, { houses = {} } }, -- Imperial Lantern, Wall
    [94110] = { { itemPrice = 110 }, { houses = {} } }, -- Imperial Lightpost, Stone
    [94111] = { { itemPrice = 95 }, { houses = { 5756 } } }, -- Imperial Well, Grated
    [94112] = { itemPrice = 70 }, -- Imperial Pedestal, Stone
    [94113] = { itemPrice = 70 }, -- Imperial Basin, Stone
    [94114] = { itemPrice = 430 }, -- Imperial Statue, Monolith
    [94115] = { itemPrice = 430 }, -- Imperial Statue, Obelisk
    [115083] = { { itemPrice = 220 }, { houses = { 1309, 4794, 12656 } } }, -- Imperial Rug, Arkay
    [94118] = { itemPrice = 220 }, -- Imperial Rug, Kynareth
    [94119] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Rug, Stars
    [94120] = { itemPrice = 220 }, -- Imperial Rug, Stendarr
    [94129] = { itemPrice = 220 }, -- Imperial Tapestry, Arkay
    [94130] = { itemPrice = 220 }, -- Imperial Tapestry, Kynareth
    [94131] = { itemPrice = 220 }, -- Imperial Tapestry, Stendarr
    [94132] = { { itemPrice = 150 }, { houses = { 6140 } } }, -- Imperial Brazier, Firepot
    [94133] = { { itemPrice = 150 }, { houses = {} } }, -- Imperial Bed, Four-Poster
    [94134] = { itemPrice = 220 }, -- Imperial Bed, Double
    [94135] = { { itemPrice = 160 }, { houses = {} } }, -- Imperial Pew, Windowed
    [94136] = { { itemPrice = 160 }, { houses = {} } }, -- Imperial Bench, Fitted
    [94137] = { { itemPrice = 110 }, { houses = {} } }, -- Imperial Bookcase, Scrollwork
    [94138] = { { itemPrice = 100 }, { houses = { 6140, 1085 } } }, -- Imperial Chair, Rocking
    [94139] = { { itemPrice = 100 }, { houses = {} } }, -- Imperial Chair, Windowed
    [94140] = { { itemPrice = 85 }, { houses = {} } }, -- Imperial Chest, Sturdy
    [94141] = { { itemPrice = 120 }, { houses = {} } }, -- Imperial Hutch, Scrollwork
    [94142] = { { itemPrice = 120 }, { houses = { 5756, 1309 } } }, -- Imperial Cupboard, Scrollwork
    [94143] = { { itemPrice = 180 }, { houses = {} } }, -- Imperial Chest of Drawers
    [94144] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Counter, Long Cabinet
    [94145] = { { itemPrice = 110 }, { houses = {} } }, -- Imperial Shelf, Barrel
    [94146] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Desk, Swirled
    [94147] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Table, Dining
    [94148] = { { itemPrice = 220 }, { houses = { 9014 } } }, -- Imperial Trestle, Sturdy
    [94149] = { { itemPrice = 85 }, { houses = {} } }, -- Imperial Table, Game
    [94150] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Table, Kitchen
    [94151] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Lightpost, Pair
    [94152] = { itemPrice = 240 }, -- Imperial Lightpost, Single
    [94153] = { itemPrice = 220 }, -- Imperial Well, Arched
    [94154] = { itemPrice = 160 }, -- Imperial Basin, Heavy
    [94155] = { itemPrice = 1000 }, -- Imperial Tent, Commander's
    [94156] = { itemPrice = 290 }, -- Imperial Brazier, Caged
    [94158] = { itemPrice = 410 }, -- Imperial Tapestry, Stars
    [94159] = { itemPrice = 450 }, -- Imperial Streetlight, Imperial City
    [94161] = { { itemPrice = 310 }, { houses = { 1084, 1086 } } }, -- Imperial Pedestal, Chiseled
    [94162] = { { itemPrice = 290 }, { houses = {} } }, -- Imperial Pew, Scrollwork
    [94164] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Sideboard, Scrollwork
    [94165] = { { itemPrice = 200 }, { houses = {} } }, -- Imperial Chair, Scrollwork
    [94166] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Armchair, Scrollwork
    [94167] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Cabinet, Scrollwork
    [94168] = { { itemPrice = 220 }, { houses = {} } }, -- Imperial Curio, Scrollwork
    [94169] = { { itemPrice = 160 }, { houses = { 1309 } } }, -- Imperial Coffer, Scrollwork
    [94170] = { { itemPrice = 270 }, { houses = {} } }, -- Imperial Dresser, Scrollwork
    [94171] = { { itemPrice = 240 }, { houses = {} } }, -- Imperial Counter, Corner
    [94172] = { { itemPrice = 490 }, { houses = {} } }, -- Imperial Bar, Cabinet
    [94173] = { { itemPrice = 200 }, { houses = {} } }, -- Imperial Mirror, Standing
    [94174] = { { itemPrice = 120 }, { houses = {} } }, -- Imperial Nightstand, Scrollwork
    [94175] = { { itemPrice = 200 }, { houses = {} } }, -- Imperial Divider, Folding
    [94176] = { { itemPrice = 200 }, { houses = {} } }, -- Imperial Divider, Curved
    [94177] = { { itemPrice = 170 }, { houses = {} } }, -- Imperial Stool, Padded
    [94178] = { { itemPrice = 410 }, { houses = { 6140 } } }, -- Imperial Desk, Scrollwork
    [94179] = { { itemPrice = 410 }, { houses = {} } }, -- Imperial Table, Formal
    [94180] = { { itemPrice = 410 }, { houses = { 6140, 1086 } } }, -- Imperial Trestle, Scrollwork
    [94182] = { { itemPrice = 160 }, { houses = {} } }, -- Imperial Footlocker, Scrollwork
    [94183] = { { itemPrice = 350 }, { houses = {} } }, -- Imperial Wardrobe, Scrollwork
    [94184] = { { itemPrice = 240 }, { houses = {} } }, -- Imperial Wine Rack, Scrollwork
    [94185] = { itemPrice = 450 }, -- Imperial Lightpost, Full
    [94187] = { itemPrice = 410 }, -- Imperial Well, Covered
    [94188] = { itemPrice = 410 }, -- Imperial Carpet, Gilded Dibella
    [94189] = { { itemPrice = 410 }, { houses = { 1309, 12656 } } }, -- Imperial Carpet, Verdant Dibella
    [94190] = { itemPrice = 410 }, -- Imperial Rug, Dibella
    [94191] = { itemPrice = 410 }, -- Imperial Tapestry, Dibella
    [94192] = { { itemPrice = 610 }, { houses = { 1309 } } }, -- Imperial Banner, Dibella
    [94193] = { itemPrice = 410 }, -- Imperial Pillar, Straight
    [94194] = { itemPrice = 410 }, -- Imperial Pillar, Chipped
    [94195] = { { itemPrice = 410 }, { houses = {} } }, -- Imperial Bed, Canopy
    [94196] = { { itemPrice = 410 }, { houses = { 1309 } } }, -- Imperial Cradle, Scrollwork
    [94197] = { itemPrice = 610 }, -- Imperial Shrine of the Bay
    [94198] = { itemPrice = 610 }, -- Imperial Altar of the Bay
    [94200] = { itemPrice = 1000 }, -- Imperial Fountain of the Bay
    [94201] = { { itemPrice = 820 }, { houses = { 12732 } } }, -- Imperial Statue, Knight
    [94202] = { { itemPrice = 820 }, { houses = { 12732 } } }, -- Imperial Statue, Emperor
    [94203] = { { itemPrice = 820 }, { houses = { 12732 } } }, -- Imperial Statue, Warrior
    [118160] = { itemPrice = 340 }, -- Mat of Meditation, Faded
    [118164] = { itemPrice = 340 }, -- Mat of the Sunset, Faded
    [118163] = { itemPrice = 340 }, -- Mat of the Oasis, Faded
    [118165] = { itemPrice = 340 }, -- Mat of the Sunrise, Faded
    [115421] = { { itemPrice = 110 }, { houses = { 5461 } } }, -- Nord Sconce, Torch
    [118244] = { { itemPrice = 340 }, { houses = {} } }, -- Orc Rug, Echatere Skin
    [118131] = { { itemPrice = 180 }, { houses = {} } }, -- Pelt, Bear
    [118107] = { { itemPrice = 40 }, { pack = packs.NOBLEKIT }, { houses = { 1081 } } }, -- Pie, Display
    [120603] = { { itemPrice = 20 }, { houses = { 1074 } } }, -- Boulder, Flat Mossy
    [120604] = { { itemPrice = 20 }, { houses = { 1074 } } }, -- Rock, Slanted Mossy
    [120605] = { { itemPrice = 20 }, { houses = { 1074 } } }, -- Rocks, Deep Mossy
    [120606] = { { itemPrice = 20 }, { houses = { 1074 } } }, -- Stones, Mossy Cluster
    [120612] = { { itemPrice = 10 }, { houses = { 1074 } } }, -- Plant, Tall Mammoth Ear
    [120613] = { { itemPrice = 10 }, { houses = { 1074 } } }, -- Plant, Towering Mammoth Ear
    [120614] = { { itemPrice = 10 }, { houses = { 1074, 13759 } } }, -- Plant Cluster, Jungle Leaf
    [121036] = { { itemPrice = 30 }, { houses = { 13758 } } }, -- Shrub, Sparse Violet
    [121035] = { { itemPrice = 30 }, { houses = { 12655, 12732 } } }, -- Plant, Paired Verdant Hosta
    [121034] = { { itemPrice = 10 }, { houses = { 14586 } } }, -- Shrub, Delicate Forest
    [121032] = { { itemPrice = 25 }, { houses = { 13758 } } }, -- Saplings, Young Laurel
    [121031] = { { itemPrice = 45 }, { houses = { 1309 } } }, -- Topiary, Paired Cypress
    [121030] = { itemPrice = 45 }, -- Topiary, Young Cypress
    [121029] = { { itemPrice = 45 }, { houses = { 1309, 5462 } } }, -- Topiary, Strong Cypress
    [120709] = { { itemPrice = 70 }, { houses = { 1097 } } }, -- Tree, Sturdy Young Birch
    [121026] = { { itemPrice = 45 }, { houses = { 1309, 13078 } } }, -- Hedge, Dense High Wall
    [121025] = { { itemPrice = 70 }, { houses = {} } }, -- Trees, Sprawling Juniper Cluster
    [121024] = { { itemPrice = 70 }, { houses = { 11456 } } }, -- Trees, Paired Leaning Juniper
    [121021] = { { itemPrice = 10 }, { pack = packs.TREES } }, -- Plants, Dry Underbrush
    [121020] = { { itemPrice = 10 }, { pack = packs.TREES }, { houses = { 1097, 1310 } } }, -- Plants, Sparse Underbrush
    [121018] = { { itemPrice = 10 }, { pack = packs.TREES } }, -- Plant, Forest Sprig
    [121014] = { { itemPrice = 20 }, { pack = packs.TREES }, { houses = { 14586 } } }, -- Topiary, Sparse
    [121012] = { { itemPrice = 10 }, { pack = packs.TREES } }, -- Trees, Fragile Autumn Birch
    [121009] = { { itemPrice = 70 }, { pack = packs.TREES } }, -- Tree, Young Healthy Birch
    [120726] = { { itemPrice = 20 }, { houses = { 1099, 12732 } } }, -- Rock, Jagged Algae Coated
    [120727] = { { itemPrice = 5 }, { houses = { 1099 } } }, -- Stone, Angled Mossy
    [120728] = { { itemPrice = 5 }, { houses = { 1099 } } }, -- Rock, Jagged Lichen
    [121006] = { { itemPrice = 45 }, { houses = { 9735 } } }, -- Flower Patch, Violets
    [120730] = { { itemPrice = 45 }, { houses = { 1099, 12732 } } }, -- Topiary, Lush Evergreen
    [120731] = { { itemPrice = 25 }, { houses = { 1099 } } }, -- Tree, Mossy Summer
    [120732] = { { itemPrice = 70 }, { houses = { 1099 } } }, -- Tree, Mossy Forest
    [120734] = { { itemPrice = 25 }, { houses = { 1099 } } }, -- Saplings, Squat Desert
    [120735] = { { itemPrice = 25 }, { houses = {} } }, -- Saplings, Young Desert
    [120736] = { { itemPrice = 290 }, { houses = { 1099 } } }, -- Tree, Gentle Weeping Willow
    [120737] = { { itemPrice = 150 }, { houses = { 1099 } } }, -- Tree, Weeping Willow
    [120738] = { { itemPrice = 70 }, { houses = { 1099 } } }, -- Tree, Towering Willow
    [120743] = { { itemPrice = 70 }, { houses = { 1099 } } }, -- Tree, Strong Cypress
    [120996] = { { itemPrice = 120 }, { houses = { 1094 } } }, -- Banner, Tattered Red
    [120745] = { { itemPrice = 60 }, { houses = {} } }, -- Tree, Water Palm
    [120483] = { { itemPrice = 30 }, { houses = { 1095, 14078 } } }, -- Cactus, Lemon Bulbs
    [120748] = { { itemPrice = 70 }, { houses = { 1099 } } }, -- Tree, Leaning Swamp
    [120749] = { { itemPrice = 10 }, { houses = { 1099 } } }, -- Grass, Tall Bamboo Shoots
    [120750] = { { itemPrice = 10 }, { houses = { 1099 } } }, -- Grass, Drying Bamboo Shoots
    [120751] = { { itemPrice = 10 }, { houses = { 1099 } } }, -- Grass, Twin Bamboo Shoots
    [120752] = { { itemPrice = 10 }, { houses = { 1099 } } }, -- Grass, Young Bamboo Shoots
    [120471] = { { itemPrice = 25 }, { houses = { 14078, 1095 } } }, -- Tree, Wilted Palm
    [120756] = { { itemPrice = 10 }, { houses = { 12732, 1099 } } }, -- Plant, Palm Fronds
    [120463] = { { itemPrice = 20 }, { houses = { 14078, 1095 } } }, -- Boulder, Weathered Flat
    [120456] = { { itemPrice = 5 }, { houses = { 1093 } } }, -- Stone, Smooth Desert
    [120760] = { { itemPrice = 50 }, { houses = { 1099, 12270 } } }, -- Flower, Red Honeysuckle
    [125546] = { { itemPrice = 85 }, { houses = { 1245 } } }, -- Flower Patch, Lava Blooms
    [120765] = { { itemPrice = 15 }, { pack = packs.JESTER }, { houses = {} } }, -- Breton Cup, Empty
    [120766] = { { itemPrice = 15 }, { houses = { 1097 } } }, -- Breton Cup, Full
    [118491] = { { itemPrice = 55 }, { houses = {} } }, -- Scroll, Bound
    [118145] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of a Desert, Refined
    [118144] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of a Forest, Refined
    [118142] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of Swamp, Refined
    [118140] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of a Waterfall, Refined
    [118138] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of Mountains, Refined
    [121400] = { itemPrice = 2000 }, -- Target Skeleton, Robust Argonian
    [121399] = { itemPrice = 2000 }, -- Target Skeleton, Robust Khajiit
    [121056] = { { itemPrice = 25 }, { houses = {} } }, -- Book Stack, Decorative
    [121054] = { itemPrice = 30 }, -- Breton Mug, Empty
    [121052] = { { itemPrice = 100 }, { houses = { 1095 } } }, -- Vase, Gilded Offering
    [121047] = { { itemPrice = 25 }, { houses = {} } }, -- Book Row, Long
    [121045] = { { itemPrice = 25 }, { houses = {} } }, -- Book Row, Decorative
    [121044] = { { itemPrice = 30 }, { houses = { 14587, 12732, 12655 } } }, -- Plant, Healthy White Hosta
    [121043] = { { itemPrice = 30 }, { houses = { 4795, 12732, 12655 } } }, -- Plant, Summer Hosta
    [121042] = { { itemPrice = 10 }, { houses = { 12655 } } }, -- Plant, Young Summer Hosta
    [121041] = { { itemPrice = 10 }, { houses = { 12655 } } }, -- Plant, Young Verdant Hosta
    [121040] = { { itemPrice = 30 }, { houses = { 14587, 12655 } } }, -- Plant, Verdant Hosta
    [121039] = { { itemPrice = 30 }, { houses = { 5168, 12655 } } }, -- Plant, Blooming White Hosta
    [121038] = { { itemPrice = 30 }, { houses = { 14587, 12655 } } }, -- Plant, Paired White Hosta
    [121037] = { itemPrice = 30 }, -- Shrub, Sparse Pink
    [121033] = { { itemPrice = 25 }, { houses = { 13758, 1309 } } }, -- Sapling, Sparse Laurel
    [121027] = { { itemPrice = 45 }, { houses = { 1309 } } }, -- Hedge, Dense Low Arc
    [121019] = { { itemPrice = 10 }, { pack = packs.TREES }, { houses = { 1310, 14586 } } }, -- Plants, Dense Underbrush
    [121017] = { { itemPrice = 10 }, { pack = packs.TREES } }, -- Bush, Dense Forest
    [121002] = { { itemPrice = 45 }, { pack = packs.TREES } }, -- Flowers, Violet Prairie
    [121001] = { { itemPrice = 45 }, { pack = packs.TREES } }, -- Flowers, Golden Prairie
    [120491] = { { itemPrice = 30 }, { houses = { 14078, 1095 } } }, -- Fern, Hearty Autumn
    [120486] = { { itemPrice = 30 }, { houses = { 14078, 1095, 1093 } } }, -- Cactus, Stocky Columnar
    [120484] = { { itemPrice = 30 }, { houses = { 14078, 1095 } } }, -- Cactus, Golden Barrel
    [120482] = { { itemPrice = 30 }, { houses = { 14078, 1095, 1093 } } }, -- Cactus, Golden Bulbs
    [120481] = { { itemPrice = 150 }, { houses = {} } }, -- Tree, Ancient Juniper
    [120475] = { { itemPrice = 70 }, { houses = {} } }, -- Trees, Paired Wax Palms
    [120473] = { itemPrice = 60 }, -- Sapling, Thin Palm
    [120472] = { { itemPrice = 25 }, { houses = { 14078, 1095, 14077 } } }, -- Tree, Young Palm
    [120470] = { { itemPrice = 25 }, { houses = { 14078, 1095 } } }, -- Tree, Leaning Palm
    [120466] = { { itemPrice = 5 }, { houses = { 14078, 1095 } } }, -- Pebble, Stacked Desert
    [120464] = { { itemPrice = 20 }, { houses = {} } }, -- Rocks, Stacked Cracked
    [120427] = { itemPrice = 1500 }, -- Target Skeleton, Argonian
    [120426] = { itemPrice = 1500 }, -- Target Skeleton, Khajiit
    [120420] = { { itemPrice = 140 }, { houses = { 1088, 14586, 7601 } } }, -- Plaque, Bolted Deer Antlers
    [120416] = { { itemPrice = 40 }, { houses = {} } }, -- Common Cloak on a Hook
    [120415] = { { itemPrice = 30 }, { houses = { 1097, 1076 } } }, -- Breton Tankard, Full
    [120414] = { { itemPrice = 30 }, { houses = { 1097 } } }, -- Breton Tankard, Empty
    [120413] = { { itemPrice = 30 }, { houses = { 1098 } } }, -- Breton Pitcher, Clay
    [120412] = { { itemPrice = 50 }, { houses = { 1077 } } }, -- Noble's Chalice
    [120409] = { itemPrice = 100 }, -- Argonian Rack, Woven
    [120408] = { { itemPrice = 25 }, { houses = { 1071 } } }, -- Argonian Fish in a Basket
    [120607] = { { itemPrice = 50 }, { houses = { 1074 } } }, -- Sapling, Lanky Ash
    [118351] = { { itemPrice = 25 }, { houses = {} } }, -- Box of Peaches
    [118278] = { { itemPrice = 140 }, { pack = packs.CRAGPARLOUR }, { houses = { 7600 } } }, -- Plaque, Bordered Deer Antlers
    [118126] = { itemPrice = 95 }, -- Plaque, Standard
    [118121] = { itemPrice = 10 }, -- Knife, Carving
    [118120] = { { itemPrice = 120 }, { houses = { 12731 } } }, -- Minecart, Push
    [118119] = { { itemPrice = 120 }, { houses = { 12731 } } }, -- Minecart, Empty
    [118118] = { { itemPrice = 100 }, { houses = { 6752 } } }, -- Candles, Lasting
    [118098] = { { itemPrice = 10 }, { houses = {} } }, -- Common Bowl, Serving
    [118096] = { { itemPrice = 10 }, { houses = {} } }, -- Bread, Plain
    [118071] = { itemPrice = 120 }, -- Simple Red Banner
    [118070] = { itemPrice = 120 }, -- Simple Purple Banner
    [118069] = { itemPrice = 120 }, -- Simple Gray Banner
    [118068] = { itemPrice = 120 }, -- Simple Brown Banner
    [118066] = { itemPrice = 15 }, -- Steak Dinner
    [118065] = { { itemPrice = 45 }, { houses = {} } }, -- Common Cargo Crate, Dry
    [118064] = { { itemPrice = 45 }, { houses = {} } }, -- Common Barrel, Dry
    [118062] = { { itemPrice = 15 }, { houses = {} } }, -- Chicken Meal, Display
    [118061] = { { itemPrice = 15 }, { houses = {} } }, -- Chicken Dinner, Display
    [118060] = { { itemPrice = 20 }, { houses = {} } }, -- Sack of Grain
    [118059] = { { itemPrice = 20 }, { houses = {} } }, -- Sack of Millet
    [118058] = { { itemPrice = 20 }, { houses = {} } }, -- Sack of Rice
    [118057] = { { itemPrice = 20 }, { houses = {} } }, -- Sack of Beans
    [118056] = { itemPrice = 15 }, -- Common Stewpot, Hanging
    [118055] = { { itemPrice = 80 }, { houses = {} } }, -- Common Firepit, Piled
    [118054] = { { itemPrice = 80 }, { houses = {} } }, -- Common Firepit, Outdoor
    [118000] = { { itemPrice = 10 }, { houses = { 1067, 1099 } } }, -- Garlic String, Display
    [117952] = { { itemPrice = 35 }, { houses = { 1310, 1074 } } }, -- Rough Torch, Wall
    [117881] = { { itemPrice = 70 }, { houses = { 14078, 7601 } } }, -- Redguard Pillow, Lattice Sands
    [117882] = { { itemPrice = 70 }, { pack = packs.CRAGBED }, { houses = { 14078 } } }, -- Redguard Pillow, Florid Sands
    [117885] = { { itemPrice = 70 }, { pack = packs.CRAGBED } }, -- Redguard Pillow Roll, Sands
    [117886] = { { itemPrice = 70 }, { houses = { 7601 } } }, -- Redguard Throw Pillow, Sands
    [117899] = { { itemPrice = 190 }, { houses = { 14078, 14077 } } }, -- Redguard Chest, Crested
    [117941] = { { itemPrice = 15 }, { houses = {} } }, -- Rough Broom, Practical
    [117897] = { { itemPrice = 480 }, { pack = packs.CRAGPARLOUR }, { houses = {} } }, -- Redguard Mat, Sun
    [117893] = { { itemPrice = 190 }, { pack = packs.CRAGBED }, { houses = { 4795 } } }, -- Redguard Footlocker, Bolted
    [117896] = { { itemPrice = 290 }, { pack = packs.CRAGKNICKS }, { houses = { 1095, 7601 } } }, -- Redguard Wine Rack, Bolted
    [119970] = { { itemPrice = 1400 }, { pack = packs.CRAGKITCHEN } }, -- Redguard Round Table
    [117891] = { { itemPrice = 250 }, { pack = packs.CRAGKITCHEN }, { houses = {} } }, -- Redguard Armchair, Lattice
    [117892] = { { itemPrice = 230 }, { pack = packs.CRAGBED }, { houses = {} } }, -- Redguard Chair, Lattice
    [118264] = { { itemPrice = 65 }, { houses = { 11456 } } }, -- Tuffet, Faded Yellow
    [118252] = { itemPrice = 25 }, -- Pillow, Faded Yellow Floral
    [118248] = { itemPrice = 25 }, -- Pillow, Faded Yellow
    [118258] = { itemPrice = 25 }, -- Pillow Roll, Faded Yellow
    [118263] = { itemPrice = 65 }, -- Tuffet, Faded Blue
    [118262] = { { itemPrice = 65 }, { houses = { 11456 } } }, -- Tuffet, Faded Red
    [118127] = { { itemPrice = 95 }, { houses = { 1098 } } }, -- Plaque, Small
    [118257] = { itemPrice = 25 }, -- Pillow Roll, Faded Blue
    [118256] = { itemPrice = 25 }, -- Pillow Roll, Faded Red
    [118255] = { itemPrice = 25 }, -- Pillow, Faded Blue Floral
    [118254] = { itemPrice = 25 }, -- Pillow, Faded Purple Floral
    [118253] = { itemPrice = 25 }, -- Pillow, Faded Red Floral
    [118251] = { { itemPrice = 25 }, { houses = { 7601 } } }, -- Pillow, Faded Blue
    [118250] = { itemPrice = 25 }, -- Pillow, Faded Purple
    [118249] = { itemPrice = 25 }, -- Pillow, Faded Red
    [115395] = { itemPrice = 40 }, -- Nord Drinking Horn, Display
    [121010] = { { pack = packs.TREES }, { houses = { 1087, 1097, 1089 } } }, -- Tree, Young Green Birch
    [121015] = { { pack = packs.TREES }, { houses = { 14586 } } }, -- Shrub, Sparse Green
    [121023] = { { pack = packs.TREES }, { houses = { 1309 } } }, -- Tree, Strong Olive
    [116420] = { itemPrice = 1200 }, -- Orcish Throne, Pedestal
    [117843] = { houses = { 1094 } }, -- Redguard Bed, Wide Lattice
    [117902] = { houses = { 14077 } }, -- Redguard Pot, Gilded
    [117903] = { { itemPrice = 140 }, { pack = packs.CRAGPARLOUR } }, -- Redguard Vessel, Gilded
    [118117] = { itemPrice = 340 }, -- Table, Carved
    [118156] = { itemPrice = 340 }, -- Runner of the Oasis, Faded
    [118157] = { { itemPrice = 340 }, { houses = { 13060, 11456 } } }, -- Runner of the Sun, Faded
    [118075] = { itemPrice = 270 }, -- Banner, War
    [118076] = { itemPrice = 270 }, -- Banner, Forge
    [118077] = { { itemPrice = 270 }, { houses = { 1445 } } }, -- Banner, Forceful
    [118078] = { itemPrice = 270 }, -- Banner, Mighty
    [118079] = { { itemPrice = 270 }, { houses = { 1445 } } }, -- Banner, Crafting
    [118125] = { itemPrice = 95 }, -- Plaque, Large
    [118137] = { itemPrice = 70 }, -- Podium, Engraved
    [118111] = { itemPrice = 50 }, -- Steak, Display
    [118112] = { { itemPrice = 25 }, { houses = {} } }, -- Teapot, Common
    [117925] = { { itemPrice = 30 }, { houses = { 1310, 5169 } } }, -- Rough Cot, Military
    [117962] = { { itemPrice = 30 }, { houses = { 1311 } } }, -- Rough Bedroll, Rolled
    [117927] = { { itemPrice = 15 }, { houses = {} } }, -- Rough Barrel, Sturdy
    [117932] = { { itemPrice = 15 }, { houses = {} } }, -- Rough Tray, Sturdy
    [117933] = { { itemPrice = 15 }, { houses = {} } }, -- Rough Bin, Sturdy
    [117934] = { { itemPrice = 15 }, { houses = {} } }, -- Rough Carton, Sturdy
    [117935] = { { itemPrice = 10 }, { houses = {} } }, -- Rough Pouch, Burlap
    [117938] = { { itemPrice = 10 }, { houses = {} } }, -- Rough Sack, Burlap
    [117936] = { { itemPrice = 10 }, { houses = {} } }, -- Rough Pouch, Coarse Cloth
    [117948] = { { itemPrice = 10 }, { houses = {} } }, -- Rough Candle, Tealight
    [117949] = { { itemPrice = 10 }, { houses = {} } }, -- Rough Candle, Pillar
    [120997] = { { itemPrice = 120 }, { houses = { 1094 } } }, -- Banner, Tattered Blue
    [117944] = { itemPrice = 5 }, -- Rough Fork, Common
    [117946] = { itemPrice = 5 }, -- Rough Knife, Butter
    [117947] = { { itemPrice = 5 }, { houses = { 1078 } } }, -- Rough Spoon, Common
    [117951] = { { itemPrice = 35 }, { houses = {} } }, -- Rough Torch, Basic
    [121049] = { { pack = packs.CRAGKNICKS }, { houses = {} } }, -- Parcels, Wrapped
    [120417] = { { pack = packs.CRAGKNICKS }, { houses = {} } }, -- Redguard Barrel, Corded
    [115698] = { itemPrice = 1100 }, -- Khajiit Statue, Guardian
    [94098] = { { itemPrice = 95 }, { category = SI_FURC_SRC_LVLUP }, { houses = {} } }, -- Imperial Bed, Single
    [87709] = { { itemPrice = 65 }, { category = SI_FURC_SRC_LVLUP } }, -- Imperial Brazier, Spiked
    [118143] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of Tree, Refined
    [118141] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of Cottage, Refined
    [118139] = { { itemPrice = 410 }, { houses = {} } }, -- Painting of Valley, Refined
  },
}
