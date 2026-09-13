// 方块定义与贴图图集布局

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLESTONE = 4;
export const SAND = 5;
export const LOG = 6;
export const LEAVES = 7;
export const PLANK = 8;
export const GLASS = 9;
export const WATER = 10;
export const BEDROCK = 11;
export const STICK = 12;
export const STONE_BRICKS = 13;
export const CRAFTING_TABLE = 14;
export const WOOD_PICKAXE = 15;
export const WOOD_AXE = 16;
export const WOOD_SHOVEL = 17;
export const WOOD_SWORD = 18;
export const STONE_PICKAXE = 19;
export const STONE_AXE = 20;
export const STONE_SHOVEL = 21;
export const STONE_SWORD = 22;
export const PISTOL = 23;
export const RAW_PORK = 24;
export const RAW_CHICKEN = 25;
export const FLINT_STEEL = 26;
export const CAMPFIRE = 27;
export const COOKED_PORK = 28;
export const COOKED_CHICKEN = 29;

// 贴图块在图集中的顺序
export const TILES = [
  "grass_top",
  "grass_side",
  "dirt",
  "stone",
  "cobblestone",
  "sand",
  "log_side",
  "log_top",
  "leaves",
  "plank",
  "glass",
  "water",
  "bedrock",
  "stick",
  "stone_bricks",
  "crafting_table_top",
  "crafting_table_side",
  "wood_pickaxe",
  "wood_axe",
  "wood_shovel",
  "wood_sword",
  "stone_pickaxe",
  "stone_axe",
  "stone_shovel",
  "stone_sword",
  "pistol",
  "raw_pork",
  "raw_chicken",
  "flint_steel",
  "campfire_top",
  "campfire_side",
  "cooked_pork",
  "cooked_chicken",
];

export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));
export const TILE_COUNT = TILES.length;

// renderPass: "solid" 不透明 | "cutout" 透明镂空(树叶/玻璃) | "water" 半透明水体 | "none" 不在世界中
// use: 工具属性 { type, speed, durability }
function def(id, name, textures, opts = {}) {
  return {
    id,
    name,
    solid: opts.solid !== false,
    opaque: opts.opaque !== false,
    renderPass: opts.renderPass || "solid",
    placeable: opts.placeable !== false,
    hardness: opts.hardness ?? 1,
    tool: opts.tool ?? null,
    requiresTool: opts.requiresTool ?? false,
    drop: opts.drop,
    use: opts.use ?? null,
    gun: opts.gun ?? null,
    food: opts.food ?? null,
    cookTo: opts.cookTo ?? null,
    textures,
  };
}

// faces 顺序: +X, -X, +Y, -Y, +Z, -Z
const all = (t) => [t, t, t, t, t, t];
const topSide = (top, side, bottom = side) => [side, side, top, bottom, side, side];

export const BLOCKS = {
  [AIR]: def(AIR, "空气", null, { solid: false, opaque: false, renderPass: "none" }),
  [GRASS]: def(GRASS, "草方块", topSide(TILE.grass_top, TILE.grass_side, TILE.dirt), {
    hardness: 0.6,
    tool: "shovel",
    drop: DIRT,
  }),
  [DIRT]: def(DIRT, "泥土", all(TILE.dirt), { hardness: 0.5, tool: "shovel" }),
  [STONE]: def(STONE, "石头", all(TILE.stone), {
    hardness: 1.5,
    tool: "pickaxe",
    requiresTool: true,
    drop: COBBLESTONE,
  }),
  [COBBLESTONE]: def(COBBLESTONE, "圆石", all(TILE.cobblestone), {
    hardness: 2.0,
    tool: "pickaxe",
    requiresTool: true,
  }),
  [SAND]: def(SAND, "沙子", all(TILE.sand), { hardness: 0.5, tool: "shovel" }),
  [LOG]: def(LOG, "原木", topSide(TILE.log_top, TILE.log_side, TILE.log_top), {
    hardness: 2.0,
    tool: "axe",
  }),
  [LEAVES]: def(LEAVES, "树叶", all(TILE.leaves), {
    hardness: 0.2,
    opaque: false,
    renderPass: "cutout",
    drop: null,
  }),
  [PLANK]: def(PLANK, "木板", all(TILE.plank), { hardness: 2.0, tool: "axe" }),
  [GLASS]: def(GLASS, "玻璃", all(TILE.glass), {
    hardness: 0.3,
    opaque: false,
    renderPass: "cutout",
  }),
  [WATER]: def(WATER, "水", all(TILE.water), {
    solid: false,
    opaque: false,
    renderPass: "water",
  }),
  [BEDROCK]: def(BEDROCK, "基岩", all(TILE.bedrock)),
  [STICK]: def(STICK, "木棍", all(TILE.stick), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
  }),
  [STONE_BRICKS]: def(STONE_BRICKS, "石砖", all(TILE.stone_bricks), {
    hardness: 2.0,
    tool: "pickaxe",
    requiresTool: true,
  }),
  [CRAFTING_TABLE]: def(
    CRAFTING_TABLE,
    "工作台",
    topSide(TILE.crafting_table_top, TILE.crafting_table_side, TILE.plank),
    { hardness: 2.5, tool: "axe" }
  ),
  [WOOD_PICKAXE]: toolDef(WOOD_PICKAXE, "木镐", TILE.wood_pickaxe, "pickaxe", 3, 60),
  [WOOD_AXE]: toolDef(WOOD_AXE, "木斧", TILE.wood_axe, "axe", 3, 60),
  [WOOD_SHOVEL]: toolDef(WOOD_SHOVEL, "木锹", TILE.wood_shovel, "shovel", 3, 60),
  [WOOD_SWORD]: toolDef(WOOD_SWORD, "木剑", TILE.wood_sword, "sword", 3, 60),
  [STONE_PICKAXE]: toolDef(STONE_PICKAXE, "石镐", TILE.stone_pickaxe, "pickaxe", 5, 132),
  [STONE_AXE]: toolDef(STONE_AXE, "石斧", TILE.stone_axe, "axe", 5, 132),
  [STONE_SHOVEL]: toolDef(STONE_SHOVEL, "石锹", TILE.stone_shovel, "shovel", 5, 132),
  [STONE_SWORD]: toolDef(STONE_SWORD, "石剑", TILE.stone_sword, "sword", 5, 132),
  [PISTOL]: def(PISTOL, "手枪", all(TILE.pistol), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    gun: { damage: 7, cooldown: 0.35, range: 40 },
  }),
  [RAW_PORK]: def(RAW_PORK, "生猪排", all(TILE.raw_pork), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    food: { hunger: 6 },
    cookTo: COOKED_PORK,
  }),
  [RAW_CHICKEN]: def(RAW_CHICKEN, "生鸡肉", all(TILE.raw_chicken), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    food: { hunger: 4 },
    cookTo: COOKED_CHICKEN,
  }),
  [FLINT_STEEL]: def(FLINT_STEEL, "打火石", all(TILE.flint_steel), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
  }),
  [COOKED_PORK]: def(COOKED_PORK, "熟猪排", all(TILE.cooked_pork), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    food: { hunger: 10 },
  }),
  [COOKED_CHICKEN]: def(COOKED_CHICKEN, "熟鸡肉", all(TILE.cooked_chicken), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    food: { hunger: 8 },
  }),
  [CAMPFIRE]: def(
    CAMPFIRE,
    "火堆",
    topSide(TILE.campfire_top, TILE.campfire_side, TILE.log_top),
    { hardness: 0.5, tool: "axe", drop: null }
  ),
};

function toolDef(id, name, tile, type, speed, durability) {
  return def(id, name, all(tile), {
    solid: false,
    opaque: false,
    renderPass: "none",
    placeable: false,
    use: { type, speed, durability },
  });
}

export function isOpaque(id) {
  return id !== AIR && BLOCKS[id].opaque;
}

export function isSolid(id) {
  return id !== AIR && BLOCKS[id].solid;
}

export function isPlaceable(id) {
  return id !== AIR && BLOCKS[id].placeable;
}

export function isTool(id) {
  return id !== AIR && !!BLOCKS[id].use;
}

export function isGun(id) {
  return id !== AIR && !!BLOCKS[id].gun;
}

export function isFood(id) {
  return id !== AIR && !!BLOCKS[id].food;
}

// 物品栏：工具在前，方块在后
export const HOTBAR = [
  WOOD_PICKAXE,
  WOOD_AXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
  STONE_PICKAXE,
  STONE_AXE,
  STONE_SHOVEL,
  STONE_SWORD,
  PISTOL,
  FLINT_STEEL,
  RAW_PORK,
  RAW_CHICKEN,
  COOKED_PORK,
  COOKED_CHICKEN,
  GRASS,
  DIRT,
  STONE,
  COBBLESTONE,
  LOG,
  PLANK,
  LEAVES,
  SAND,
  GLASS,
  WATER,
  STONE_BRICKS,
  CRAFTING_TABLE,
];

// 所有可合成/持有的物品（用于背包显示）
export const ALL_ITEMS = [...HOTBAR, STICK];


