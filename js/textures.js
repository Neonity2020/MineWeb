import * as THREE from "three";
import { TILES, TILE_COUNT } from "./blocks.js?v=20260916t";

const SIZE = 16;

function hash(x, y, s) {
  let n = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function shade(base, amt) {
  return [clamp(base[0] + amt), clamp(base[1] + amt), clamp(base[2] + amt)];
}

// 每种贴图的逐像素绘制函数: (x, y, rnd) -> [r,g,b,a]
const PAINTERS = {
  grass_top(x, y, rnd) {
    const n = rnd() * 34 - 17;
    return [...shade([106, 170, 64], n), 255];
  },
  grass_side(x, y, rnd) {
    if (y < 4) {
      const n = rnd() * 26 - 13;
      return [...shade([106, 170, 64], n), 255];
    }
    if (y === 4 && rnd() > 0.45) {
      const n = rnd() * 26 - 13;
      return [...shade([106, 170, 64], n), 255];
    }
    const n = rnd() * 30 - 15;
    return [...shade([120, 88, 52], n), 255];
  },
  dirt(x, y, rnd) {
    const n = rnd() * 34 - 17;
    return [...shade([120, 88, 52], n), 255];
  },
  stone(x, y, rnd) {
    const n = rnd() * 30 - 15;
    return [...shade([130, 130, 130], n), 255];
  },
  cobblestone(x, y, rnd) {
    const cell = (Math.floor(x / 5) + Math.floor(y / 5)) % 2;
    const edge = x % 5 === 0 || y % 5 === 0;
    const n = rnd() * 22 - 11;
    const base = edge ? [92, 92, 92] : cell ? [126, 126, 126] : [146, 146, 146];
    return [...shade(base, n), 255];
  },
  sand(x, y, rnd) {
    const n = rnd() * 24 - 12;
    return [...shade([227, 217, 163], n), 255];
  },
  log_side(x, y, rnd) {
    const stripe = x % 4 === 0 ? -26 : 0;
    const n = rnd() * 16 - 8;
    return [...shade([124, 92, 50], n + stripe), 255];
  },
  log_top(x, y, rnd) {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.floor(d) % 2 === 0 ? 12 : -12;
    const n = rnd() * 12 - 6;
    return [...shade([168, 130, 78], ring + n), 255];
  },
  leaves(x, y, rnd) {
    const r = rnd();
    if (r < 0.14) return [0, 0, 0, 0];
    const n = r * 60 - 30;
    return [...shade([62, 122, 46], n), 255];
  },
  plank(x, y, rnd) {
    const line = y % 5 === 0 ? -34 : ((Math.floor(y / 5) + Math.floor(x / 8)) % 2) * 8 - 4;
    const n = rnd() * 16 - 8;
    return [...shade([176, 132, 74], n + line), 255];
  },
  glass(x, y, rnd) {
    const border = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
    const inner = x === 1 || y === 1 || x === SIZE - 2 || y === SIZE - 2;
    if (border) return [214, 236, 245, 255];
    if (inner) return [188, 216, 230, 130];
    if (x + y === 5 || (x === 3 && y < 5) || (y === 3 && x < 5)) return [235, 248, 255, 90];
    return [0, 0, 0, 0];
  },
  water(x, y, rnd) {
    const wave = Math.sin((x + y) * 0.9) * 12;
    const n = rnd() * 14 - 7;
    return [...shade([58, 112, 208], wave + n), 255];
  },
  bedrock(x, y, rnd) {
    const n = rnd() * 70 - 35;
    return [...shade([72, 72, 76], n), 255];
  },
  stick(x, y, rnd) {
    // 透明背景上的对角木棍
    const on = x - y >= -1 && x - y <= 3 && x + y >= 5 && x + y <= 24;
    if (!on) return [0, 0, 0, 0];
    const n = rnd() * 24 - 12;
    return [...shade([150, 110, 62], n), 255];
  },
  stone_bricks(x, y, rnd) {
    const row = Math.floor(y / 4);
    const offset = row % 2 === 0 ? 0 : 4;
    const mortar = y % 4 === 0 || (x + offset) % 8 === 0;
    const n = rnd() * 20 - 10;
    const base = mortar ? [96, 96, 96] : [150, 150, 150];
    return [...shade(base, n), 255];
  },
  crafting_table_top(x, y, rnd) {
    const grid = x < 1 || y < 1 || x > 14 || y > 14 || (x + 1) % 5 === 0 || (y + 1) % 5 === 0;
    const n = rnd() * 14 - 7;
    const base = grid ? [96, 68, 36] : [176, 132, 74];
    return [...shade(base, n), 255];
  },
  crafting_table_side(x, y, rnd) {
    const n = rnd() * 16 - 8;
    // 木纹 + 工具暗纹
    let base = [176, 132, 74];
    if (y % 5 === 0) base = [140, 104, 58];
    if (x > 3 && x < 12 && y > 6 && y < 12) base = [120, 88, 48];
    return [...shade(base, n), 255];
  },
  pistol(x, y, rnd) {
    let part = null;
    // 套筒 / 枪管
    if (y >= 4 && y <= 6 && x >= 2 && x <= 13) part = "metal";
    // 枪口
    if (y >= 4 && y <= 5 && x === 14) part = "metal";
    // 前准星
    if (y === 3 && x >= 11 && x <= 12) part = "metal";
    // 套筒纹路
    if (y === 5 && x >= 4 && x <= 10 && x % 3 === 0) part = "groove";
    // 握把
    if (x >= 4 && x <= 7 && y >= 7 && y <= 13) part = "grip";
    // 扳机护圈
    if (x >= 8 && x <= 10 && y >= 8 && y <= 9) part = "metal";
    if (x === 9 && y === 7) part = "metal";
    if (!part) return [0, 0, 0, 0];
    const n = rnd() * 16 - 8;
    let base;
    if (part === "grip") base = [96, 68, 42];
    else if (part === "groove") base = [44, 46, 52];
    else base = [82, 85, 94];
    return [...shade(base, n), 255];
  },
  shotgun(x, y, rnd) {
    let part = null;
    // 上下两根并排枪管
    if (y >= 2 && y <= 3 && x >= 0 && x <= 12) part = "metal";
    if (y >= 5 && y <= 6 && x >= 0 && x <= 12) part = "metal";
    // 枪口
    if (y >= 2 && y <= 6 && x === 0) part = "groove";
    // 机匣
    if (x >= 10 && x <= 13 && y >= 2 && y <= 8) part = "metal";
    // 泵动护木（枪管下方）
    if (x >= 3 && x <= 8 && y >= 7 && y <= 8) part = "wood";
    // 护木纹路
    if (x >= 4 && x <= 7 && y === 8 && x % 2 === 0) part = "groove";
    // 扳机护圈
    if (x >= 9 && x <= 10 && y >= 9 && y <= 10) part = "metal";
    // 握把
    if (x >= 10 && x <= 12 && y >= 9 && y <= 12) part = "wood";
    // 枪托
    if (x >= 13 && x <= 15 && y >= 6 && y <= 10) part = "wood";
    if (!part) return [0, 0, 0, 0];
    const n = rnd() * 16 - 8;
    let base;
    if (part === "wood") base = [104, 70, 40];
    else if (part === "groove") base = [40, 42, 48];
    else base = [78, 82, 92];
    return [...shade(base, n), 255];
  },
  boss_trophy(x, y, rnd) {
    // 凋灵之心：紫红水晶质感的菱形宝石
    const dx = Math.abs(x - 7.5);
    const dy = Math.abs(y - 7.5);
    const diamond = dx * 0.85 + dy;
    if (diamond > 7.2) return [0, 0, 0, 0];
    const n = rnd() * 22 - 11;
    let base;
    if (diamond < 1.6) base = [255, 196, 236];
    else if (diamond < 4.2) base = [206, 62, 150];
    else base = [118, 26, 104];
    // 高光
    if (x + y === 9 && diamond < 5) base = [255, 236, 250];
    return [...shade(base, n), 255];
  },
  raw_pork(x, y, rnd) {
    if (x < 2 || x > 13 || y < 4 || y > 11) return [0, 0, 0, 0];
    const edge = x === 2 || x === 13 || y === 4 || y === 11;
    const n = rnd() * 20 - 10;
    if (!edge && (x + y) % 5 === 0) return [...shade([242, 202, 198], n), 255];
    return [...shade(edge ? [168, 92, 100] : [222, 138, 146], n), 255];
  },
  raw_chicken(x, y, rnd) {
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    const edge = x === 3 || x === 12 || y === 3 || y === 12;
    const n = rnd() * 20 - 10;
    if (!edge && x + y === 15) return [...shade([236, 210, 186], n), 255];
    return [...shade(edge ? [176, 138, 104] : [230, 196, 166], n), 255];
  },
  cooked_pork(x, y, rnd) {
    if (x < 2 || x > 13 || y < 4 || y > 11) return [0, 0, 0, 0];
    const edge = x === 2 || x === 13 || y === 4 || y === 11;
    const n = rnd() * 20 - 10;
    if (!edge && (x + y) % 5 === 0) return [...shade([150, 104, 66], n), 255];
    return [...shade(edge ? [104, 62, 34] : [146, 92, 50], n), 255];
  },
  cooked_chicken(x, y, rnd) {
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    const edge = x === 3 || x === 12 || y === 3 || y === 12;
    const n = rnd() * 20 - 10;
    if (!edge && x + y === 15) return [...shade([168, 122, 74], n), 255];
    return [...shade(edge ? [126, 84, 46] : [176, 128, 78], n), 255];
  },
  flint_steel(x, y, rnd) {
    const n = rnd() * 18 - 9;
    // 钢制打火镰（浅灰）呈 L 形
    if ((x >= 3 && x <= 11 && y >= 4 && y <= 6) || (x >= 3 && x <= 5 && y >= 6 && y <= 11)) {
      return [...shade([176, 180, 188], n), 255];
    }
    // 燧石（深灰）
    if (x >= 8 && x <= 12 && y >= 7 && y <= 11) {
      return [...shade([70, 74, 82], n), 255];
    }
    return [0, 0, 0, 0];
  },
  campfire_top(x, y, rnd) {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    const n = rnd() * 26 - 13;
    if (d < 2.2) return [...shade([255, 232, 150], n), 255];
    if (d < 4.0) return [...shade([246, 166, 60], n), 255];
    if (d < 6.0) return [...shade([206, 96, 34], n), 255];
    return [...shade([74, 46, 28], n), 255];
  },
  campfire_side(x, y, rnd) {
    const n = rnd() * 22 - 11;
    if (y < 3) return [...shade([232, 140, 52], n), 255];
    if (y < 5) return [...shade([180, 92, 34], n), 255];
    const stripe = x % 5 === 0 ? -30 : 0;
    return [...shade([112, 76, 42], n + stripe), 255];
  },
  iron_ore(x, y, rnd) {
    const spots = [
      [3, 4],
      [9, 3],
      [12, 6],
      [5, 9],
      [11, 10],
      [2, 11],
      [7, 6],
    ];
    let on = false;
    for (const [sx, sy] of spots) {
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) {
        on = true;
        break;
      }
    }
    const n = rnd() * 28 - 14;
    return [...shade(on ? [198, 150, 96] : [128, 128, 128], n), 255];
  },
  iron_ingot(x, y, rnd) {
    if (x < 3 || x > 12 || y < 6 || y > 10) return [0, 0, 0, 0];
    const top = y === 6;
    const edge = x === 3 || x === 12 || y === 10;
    const n = rnd() * 22 - 11;
    let base = top ? [226, 230, 238] : edge ? [150, 156, 166] : [196, 202, 212];
    if (!top && !edge && y === 7 && x < 8) base = [232, 236, 244];
    return [...shade(base, n), 255];
  },
};

// 工具图标：斜向木柄 + 不同形状的头部
function toolPainter(head, kind) {
  return (x, y, rnd) => {
    let part = null;
    if (Math.abs(x + y - 16) <= 1 && x >= 4 && x <= 11) part = "handle";
    if (kind === "pickaxe") {
      if (y >= 1 && y <= 3 && x >= 3 && x <= 12) part = "head";
      if (x >= 10 && x <= 12 && y >= 3 && y <= 6) part = "head";
    } else if (kind === "axe") {
      if (x >= 9 && x <= 13 && y >= 2 && y <= 7) part = "head";
    } else if (kind === "shovel") {
      if (x >= 9 && x <= 12 && y >= 1 && y <= 5) part = "head";
    } else if (kind === "sword") {
      if (Math.abs(x + y - 18) <= 1 && x >= 7) part = "head";
      if (x >= 3 && x <= 7 && y >= 9 && y <= 11) part = "head";
    }
    if (!part) return [0, 0, 0, 0];
    const n = rnd() * 22 - 11;
    const base = part === "head" ? head : [150, 110, 62];
    return [...shade(base, n), 255];
  };
}

const WOOD_HEAD = [176, 132, 74];
const STONE_HEAD = [150, 150, 150];
const IRON_HEAD = [206, 212, 222];
PAINTERS.wood_pickaxe = toolPainter(WOOD_HEAD, "pickaxe");
PAINTERS.wood_axe = toolPainter(WOOD_HEAD, "axe");
PAINTERS.wood_shovel = toolPainter(WOOD_HEAD, "shovel");
PAINTERS.wood_sword = toolPainter(WOOD_HEAD, "sword");
PAINTERS.stone_pickaxe = toolPainter(STONE_HEAD, "pickaxe");
PAINTERS.stone_axe = toolPainter(STONE_HEAD, "axe");
PAINTERS.stone_shovel = toolPainter(STONE_HEAD, "shovel");
PAINTERS.stone_sword = toolPainter(STONE_HEAD, "sword");
PAINTERS.iron_pickaxe = toolPainter(IRON_HEAD, "pickaxe");
PAINTERS.iron_axe = toolPainter(IRON_HEAD, "axe");
PAINTERS.iron_shovel = toolPainter(IRON_HEAD, "shovel");
PAINTERS.iron_sword = toolPainter(IRON_HEAD, "sword");

export function buildAtlasCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_COUNT * SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;

  TILES.forEach((name, tileIndex) => {
    const paint = PAINTERS[name];
    const ox = tileIndex * SIZE;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // 使用位置+贴图索引作为种子，保证每次生成一致
        let r = hash(x, y, tileIndex + 1);
        const rnd = () => {
          r = hash((r * 65536) | 0, y + 1, tileIndex + 7);
          return r;
        };
        const [cr, cg, cb, ca] = paint(x, y, rnd);
        const i = (y * canvas.width + ox + x) * 4;
        data[i] = cr;
        data[i + 1] = cg;
        data[i + 2] = cb;
        data[i + 3] = ca;
      }
    }
  });

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function createAtlasTexture() {
  const tex = new THREE.CanvasTexture(buildAtlasCanvas());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// 供 UI 显示单个贴图
let cachedAtlas = null;
export function drawTileTo(canvas, tileIndex) {
  const ctx = canvas.getContext("2d");
  if (!cachedAtlas) cachedAtlas = buildAtlasCanvas();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cachedAtlas, tileIndex * SIZE, 0, SIZE, SIZE, 0, 0, canvas.width, canvas.height);
}
