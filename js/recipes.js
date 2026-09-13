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
  PISTOL,
} from "./blocks.js";

// out: 产物 { id, n }；in: 材料 [{ id, n }]
export const RECIPES = [
  { out: { id: PLANK, n: 4 }, in: [{ id: LOG, n: 1 }] },
  { out: { id: STICK, n: 4 }, in: [{ id: PLANK, n: 2 }] },
  { out: { id: CRAFTING_TABLE, n: 1 }, in: [{ id: PLANK, n: 4 }] },
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

  // 武器
  { out: { id: PISTOL, n: 1 }, in: [{ id: COBBLESTONE, n: 3 }, { id: STICK, n: 1 }, { id: GLASS, n: 1 }] },
];
