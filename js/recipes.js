// 合成配方（数据驱动）
import {
  LOG,
  PLANK,
  STICK,
  COBBLESTONE,
  STONE,
  STONE_BRICKS,
  SAND,
  GLASS,
  CRAFTING_TABLE,
  WOOD_PICKAXE,
  WOOD_AXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
  STONE_PICKAXE,
  STONE_AXE,
  STONE_SHOVEL,
  STONE_SWORD,
  IRON_INGOT,
  IRON_PICKAXE,
  IRON_AXE,
  IRON_SHOVEL,
  IRON_SWORD,
  PISTOL,
  FLINT_STEEL,
} from "./blocks.js?v=20260913b";

// out: 产物 { id, n }；in: 材料 [{ id, n }]
// basic: true 表示无需工作台即可在背包直接合成（仅用于开局搭建工作台的基础配方）
export const RECIPES = [
  { out: { id: PLANK, n: 4 }, in: [{ id: LOG, n: 1 }], basic: true },
  { out: { id: STICK, n: 4 }, in: [{ id: PLANK, n: 2 }], basic: true },
  { out: { id: CRAFTING_TABLE, n: 1 }, in: [{ id: PLANK, n: 4 }], basic: true },
  { out: { id: STONE_BRICKS, n: 4 }, in: [{ id: COBBLESTONE, n: 4 }] },
  { out: { id: GLASS, n: 1 }, in: [{ id: SAND, n: 2 }] },
  { out: { id: COBBLESTONE, n: 1 }, in: [{ id: STONE, n: 1 }] },

  // 木制工具
  { out: { id: WOOD_PICKAXE, n: 1 }, in: [{ id: PLANK, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: WOOD_AXE, n: 1 }, in: [{ id: PLANK, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: WOOD_SHOVEL, n: 1 }, in: [{ id: PLANK, n: 1 }, { id: STICK, n: 2 }] },
  { out: { id: WOOD_SWORD, n: 1 }, in: [{ id: PLANK, n: 2 }, { id: STICK, n: 1 }] },

  // 石制工具
  { out: { id: STONE_PICKAXE, n: 1 }, in: [{ id: COBBLESTONE, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: STONE_AXE, n: 1 }, in: [{ id: COBBLESTONE, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: STONE_SHOVEL, n: 1 }, in: [{ id: COBBLESTONE, n: 1 }, { id: STICK, n: 2 }] },
  { out: { id: STONE_SWORD, n: 1 }, in: [{ id: COBBLESTONE, n: 2 }, { id: STICK, n: 1 }] },

  // 铁制工具
  { out: { id: IRON_PICKAXE, n: 1 }, in: [{ id: IRON_INGOT, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: IRON_AXE, n: 1 }, in: [{ id: IRON_INGOT, n: 3 }, { id: STICK, n: 2 }] },
  { out: { id: IRON_SHOVEL, n: 1 }, in: [{ id: IRON_INGOT, n: 1 }, { id: STICK, n: 2 }] },
  { out: { id: IRON_SWORD, n: 1 }, in: [{ id: IRON_INGOT, n: 2 }, { id: STICK, n: 1 }] },

  // 武器
  { out: { id: PISTOL, n: 1 }, in: [{ id: IRON_INGOT, n: 3 }, { id: STICK, n: 1 }, { id: GLASS, n: 1 }] },

  // 生火
  { out: { id: FLINT_STEEL, n: 1 }, in: [{ id: COBBLESTONE, n: 2 }, { id: STICK, n: 1 }] },
];
