import * as THREE from "three";
import { Noise, makeRng } from "./noise.js?v=20260916v";
import { createAtlasTexture } from "./textures.js?v=20260916v";
import {
  AIR,
  WATER,
  BEDROCK,
  GRASS,
  DIRT,
  STONE,
  SAND,
  LOG,
  LEAVES,
  IRON_ORE,
  COBBLESTONE,
  STONE_BRICKS,
  CAMPFIRE,
  BLOCKS,
  TILE_COUNT,
  isOpaque,
} from "./blocks.js?v=20260916v";

export const WORLD_SIZE = 256;
export const HEIGHT = 64;
export const CHUNK_SIZE = 32;
export const CHUNKS_X = WORLD_SIZE / CHUNK_SIZE;
export const CHUNKS_Z = WORLD_SIZE / CHUNK_SIZE;
const SEA_LEVEL = 24;

// BOSS 领域：位于地图北侧边缘的高台祭坛
export const BOSS_ARENA = {
  x: Math.floor(WORLD_SIZE / 2),
  z: 16,
  radius: 13,
  floorY: 30,
  triggerRadius: 15, // 玩家进入该半径即唤醒 BOSS
};

// faces 顺序与 BLOCKS.textures 对应: +X, -X, +Y, -Y, +Z, -Z
const FACES = [
  {
    // +X
    dir: [1, 0, 0],
    shade: 0.72,
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    // -X
    dir: [-1, 0, 0],
    shade: 0.72,
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    // +Y
    dir: [0, 1, 0],
    shade: 1.0,
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    // -Y
    dir: [0, -1, 0],
    shade: 0.5,
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    // +Z
    dir: [0, 0, 1],
    shade: 0.86,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
  {
    // -Z
    dir: [0, 0, -1],
    shade: 0.86,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
];

const AO_LEVELS = [0.52, 0.71, 0.86, 1.0];

export class World {
  constructor(seed = 20240612) {
    this.seed = seed;
    this.data = new Uint8Array(WORLD_SIZE * WORLD_SIZE * HEIGHT);
    this.columnTop = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    // 流体：低 7 位是水位 (1..8)，最高位表示水源
    this.waterLevel = new Uint8Array(WORLD_SIZE * WORLD_SIZE * HEIGHT);
    this.activeWater = [];
    this.activeHead = 0;
    this.activeSet = new Set();
    this.dirtyChunks = new Set();
    this.fluidReady = false;
    // 相对地形生成的改动： index -> (waterLevel << 8 | blockId)
    this.edits = new Map();
    this.noise = new Noise(seed);
    this.atlas = createAtlasTexture();
    this.chunks = new Array(CHUNKS_X * CHUNKS_Z).fill(null);

    this.solidMaterial = new THREE.MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      alphaTest: 0.5,
    });
    this.waterMaterial = new THREE.MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  idx(x, y, z) {
    return (x * WORLD_SIZE + z) * HEIGHT + y;
  }

  // 重置为某个种子下"未改动"的状态（区块网格对象保留，由 buildChunk 复用）
  reset(seed) {
    this.seed = seed;
    this.noise = new Noise(seed);
    this.data.fill(0);
    this.columnTop.fill(0);
    this.waterLevel.fill(0);
    this.activeWater = [];
    this.activeHead = 0;
    this.activeSet.clear();
    this.dirtyChunks.clear();
    this.edits.clear();
    this.fluidReady = false;
  }

  recordEdit(i) {
    this.edits.set(i, (this.waterLevel[i] << 8) | this.data[i]);
  }

  serializeEdits() {
    return [...this.edits.entries()];
  }

  applyEdits(list) {
    this.fluidReady = false;
    this.edits.clear();
    const cols = new Set();
    for (const [i, val] of list) {
      if (i < 0 || i >= this.data.length) continue;
      this.data[i] = val & 0xff;
      this.waterLevel[i] = (val >> 8) & 0xff;
      // 回填编辑表，保证读档后再次保存不会丢失改动
      this.edits.set(i, val);
      const y = i % HEIGHT;
      const t = (i - y) / HEIGHT;
      const z = t % WORLD_SIZE;
      const x = (t - z) / WORLD_SIZE;
      cols.add(x * WORLD_SIZE + z);
    }
    for (const c of cols) {
      const x = (c / WORLD_SIZE) | 0;
      const z = c % WORLD_SIZE;
      this.updateColumnTop(x, z);
    }
    this.fluidReady = true;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < HEIGHT;
  }

  getBlock(x, y, z) {
    if (y < 0) return BEDROCK;
    if (y >= HEIGHT) return AIR;
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return STONE;
    return this.data[this.idx(x, y, z)];
  }

  // 在以 (cx, cy, cz) 为球心、radius 为半径的范围内查找最近的 id 方块
  findNearestBlock(cx, cy, cz, id, radius = 64) {
    let best = null;
    let bestD2 = Infinity;
    const x0 = Math.max(0, cx - radius);
    const x1 = Math.min(WORLD_SIZE - 1, cx + radius);
    const y0 = Math.max(0, cy - radius);
    const y1 = Math.min(HEIGHT - 1, cy + radius);
    const z0 = Math.max(0, cz - radius);
    const z1 = Math.min(WORLD_SIZE - 1, cz + radius);
    const r2 = radius * radius;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dx2 = dx * dx;
      for (let z = z0; z <= z1; z++) {
        const dz = z - cz;
        const flat = dx2 + dz * dz;
        if (flat > r2) continue;
        for (let y = y0; y <= y1; y++) {
          if (this.data[this.idx(x, y, z)] !== id) continue;
          const dy = y - cy;
          const d2 = flat + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = { x, y, z, dist2: d2 };
          }
        }
      }
    }
    return best;
  }

  setBlock(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.idx(x, y, z);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    // 玩家/地形放置的水视为水源
    this.waterLevel[i] = id === WATER ? 8 | 0x80 : 0;
    const c = x * WORLD_SIZE + z;
    if (id !== AIR) {
      if (y > this.columnTop[c]) this.columnTop[c] = y;
    } else if (y === this.columnTop[c]) {
      this.updateColumnTop(x, z);
    }
    if (this.fluidReady) {
      this.recordEdit(i);
      this.enqueueAround(x, y, z);
    }
    return true;
  }

  updateColumnTop(x, z) {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (this.data[this.idx(x, y, z)] !== AIR) {
        this.columnTop[x * WORLD_SIZE + z] = y;
        return;
      }
    }
    this.columnTop[x * WORLD_SIZE + z] = 0;
  }

  // ---------- 流体模拟 ----------
  waterAt(x, y, z) {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < 0 || y >= HEIGHT) return 0;
    const i = this.idx(x, y, z);
    if (this.data[i] !== WATER) return 0;
    return this.waterLevel[i] & 0x7f;
  }

  enqueue(x, y, z) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.activeSet.has(i)) return;
    this.activeSet.add(i);
    this.activeWater.push(i);
  }

  enqueueAround(x, y, z) {
    this.enqueue(x, y, z);
    this.enqueue(x + 1, y, z);
    this.enqueue(x - 1, y, z);
    this.enqueue(x, y + 1, z);
    this.enqueue(x, y - 1, z);
    this.enqueue(x, y, z + 1);
    this.enqueue(x, y, z - 1);
  }

  markChunkDirty(x, z) {
    const cx = (x / CHUNK_SIZE) | 0;
    const cz = (z / CHUNK_SIZE) | 0;
    this.dirtyChunks.add(cx * CHUNKS_Z + cz);
    if (x % CHUNK_SIZE === 0 && cx > 0) this.dirtyChunks.add((cx - 1) * CHUNKS_Z + cz);
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1)
      this.dirtyChunks.add((cx + 1) * CHUNKS_Z + cz);
    if (z % CHUNK_SIZE === 0 && cz > 0) this.dirtyChunks.add(cx * CHUNKS_Z + (cz - 1));
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1)
      this.dirtyChunks.add(cx * CHUNKS_Z + (cz + 1));
  }

  // 直接写水位（不经过 setBlock，避免把流动水标成水源）
  setWaterCell(x, y, z, level, source) {
    const i = this.idx(x, y, z);
    const prev = this.data[i];
    if (level <= 0) {
      if (prev === WATER) {
        this.data[i] = AIR;
        this.waterLevel[i] = 0;
        this.updateColumnTop(x, z);
        this.markChunkDirty(x, z);
        if (this.fluidReady) this.recordEdit(i);
      }
      return;
    }
    this.data[i] = WATER;
    this.waterLevel[i] = (level > 8 ? 8 : level) | (source ? 0x80 : 0);
    const c = x * WORLD_SIZE + z;
    if (y > this.columnTop[c]) this.columnTop[c] = y;
    if (prev !== WATER) this.markChunkDirty(x, z);
    if (this.fluidReady) this.recordEdit(i);
  }

  // 计算某个格子的目标水位并落定
  settle(i) {
    const y = i % HEIGHT;
    const t = (i - y) / HEIGHT;
    const z = t % WORLD_SIZE;
    const x = (t - z) / WORLD_SIZE;

    const cur = this.data[i];
    if (cur !== AIR && cur !== WATER) return;

    const isSource = cur === WATER && (this.waterLevel[i] & 0x80) !== 0;
    let desired = 0;
    if (isSource) {
      desired = 8;
    } else if (this.waterAt(x, y + 1, z) > 0) {
      // 上方有水的下落水柱：保持满格
      desired = 8;
    } else {
      // 水平方向：相邻水位减 1
      let best = 0;
      const n1 = this.waterAt(x + 1, y, z);
      const n2 = this.waterAt(x - 1, y, z);
      const n3 = this.waterAt(x, y, z + 1);
      const n4 = this.waterAt(x, y, z - 1);
      if (n1 - 1 > best) best = n1 - 1;
      if (n2 - 1 > best) best = n2 - 1;
      if (n3 - 1 > best) best = n3 - 1;
      if (n4 - 1 > best) best = n4 - 1;
      desired = best;
    }

    const curLevel = cur === WATER ? this.waterLevel[i] & 0x7f : 0;
    const changed = cur !== AIR && desired <= 0 ? true : curLevel !== desired;
    if (!changed) return;

    this.setWaterCell(x, y, z, desired, isSource);

    // 只有真正发生变化才继续扩散，避免震荡
    this.enqueue(x + 1, y, z);
    this.enqueue(x - 1, y, z);
    this.enqueue(x, y, z + 1);
    this.enqueue(x, y, z - 1);
    this.enqueue(x, y - 1, z);
    this.enqueue(x, y + 1, z);
  }

  // 推进流体模拟，返回剩余待处理数量
  tickWater(maxOps = 4000) {
    const q = this.activeWater;
    let ops = 0;
    while (this.activeHead < q.length && ops < maxOps) {
      const i = q[this.activeHead++];
      this.activeSet.delete(i);
      this.settle(i);
      ops++;
    }
    if (this.activeHead > 4096 && this.activeHead * 2 > q.length) {
      q.splice(0, this.activeHead);
      this.activeHead = 0;
    }
    return q.length - this.activeHead;
  }

  flushDirtyChunks(maxChunks = 4) {
    if (this.dirtyChunks.size === 0) return 0;
    let n = 0;
    for (const key of this.dirtyChunks) {
      if (n >= maxChunks) break;
      const cx = (key / CHUNKS_Z) | 0;
      const cz = key % CHUNKS_Z;
      this.buildChunk(cx, cz);
      this.dirtyChunks.delete(key);
      n++;
    }
    return n;
  }

  // ---------- 地形 ----------
  generateTerrain() {
    const n = this.noise;
    const rng = makeRng(this.seed ^ 0x9e3779b9);

    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const hills = n.fbm(x * 0.0075, z * 0.0075, 4, 2, 0.5);
        const detail = n.fbm(x * 0.045 + 100, z * 0.045 - 100, 3, 2, 0.5);
        const mountain = Math.pow(Math.max(0, n.fbm(x * 0.003 - 50, z * 0.003 + 50, 2)), 2);

        let h = 26 + hills * 13 + detail * 3 + mountain * 22;
        h = Math.max(4, Math.min(HEIGHT - 6, Math.floor(h)));

        const beach = h <= SEA_LEVEL + 1;

        for (let y = 0; y <= h; y++) {
          let block;
          if (y === 0) block = BEDROCK;
          else if (y > h - 4) block = beach ? SAND : DIRT;
          else block = STONE;

          if (y === h) {
            if (h < SEA_LEVEL) block = SAND;
            else if (beach) block = SAND;
            else block = GRASS;
          }
          this.setBlock(x, y, z, block);
        }

        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          this.setBlock(x, y, z, WATER);
        }
      }
    }

    this.plantOre(rng);
    this.plantTrees(rng);
    this.buildBossArena();
    this.fluidReady = true;
  }

  // 地图边缘的 BOSS 祭坛：隆起的高台 + 环路矮墙（四向留门）+ 四角火盆
  buildBossArena() {
    const { x: cx, z: cz, radius, floorY } = BOSS_ARENA;
    const r2 = radius * radius;

    // 用石头把圆形区域垫高到 floorY，再铺地板、清空上方
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (!this.inBounds(x, 0, z)) continue;
        const r = Math.sqrt(d2);
        for (let y = 0; y < floorY; y++) this.setBlock(x, y, z, y === 0 ? BEDROCK : STONE);
        // 地板：外圈与中心用石砖，中间用圆石，形成同心图案
        const floor = r > radius - 2 || r < 4 ? STONE_BRICKS : COBBLESTONE;
        this.setBlock(x, floorY, z, floor);
        for (let y = floorY + 1; y < HEIGHT; y++) this.setBlock(x, y, z, AIR);
      }
    }

    // 环路矮墙，正东南西北四个方向留出入口
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const r = Math.hypot(dx, dz);
        if (r < radius - 1.5 || r > radius) continue;
        if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) continue; // 入口
        const x = cx + dx;
        const z = cz + dz;
        if (!this.inBounds(x, floorY + 1, z)) continue;
        for (let y = floorY + 1; y <= floorY + 3; y++) this.setBlock(x, y, z, STONE_BRICKS);
      }
    }

    // 四角石柱 + 火盆
    const p = radius - 4;
    for (const [dx, dz] of [
      [-p, -p],
      [p, -p],
      [-p, p],
      [p, p],
    ]) {
      const x = cx + dx;
      const z = cz + dz;
      for (let y = floorY + 1; y <= floorY + 4; y++) this.setBlock(x, y, z, STONE_BRICKS);
      this.setBlock(x, floorY + 5, z, CAMPFIRE);
    }
  }

  // 铁矿石：以矿脉形式分布在石块深处（y 越低越多）
  plantOre(rng) {
    const veins = 520;
    const maxY = 20;
    for (let i = 0; i < veins; i++) {
      const cx = 2 + Math.floor(rng() * (WORLD_SIZE - 4));
      const cz = 2 + Math.floor(rng() * (WORLD_SIZE - 4));
      const cy = 2 + Math.floor(rng() * (maxY - 2));
      const size = 4 + Math.floor(rng() * 5);
      for (let k = 0; k < size; k++) {
        const x = cx + Math.floor((rng() - 0.5) * 3);
        const y = cy + Math.floor((rng() - 0.5) * 3);
        const z = cz + Math.floor((rng() - 0.5) * 3);
        if (y < 1 || y > maxY) continue;
        if (!this.inBounds(x, y, z)) continue;
        if (this.getBlock(x, y, z) !== STONE) continue;
        this.setBlock(x, y, z, IRON_ORE);
      }
    }
  }

  plantTrees(rng) {
    const attempts = Math.floor(WORLD_SIZE * WORLD_SIZE * 0.012);
    for (let i = 0; i < attempts; i++) {
      const x = 3 + Math.floor(rng() * (WORLD_SIZE - 6));
      const z = 3 + Math.floor(rng() * (WORLD_SIZE - 6));
      let y = HEIGHT - 1;
      while (y > 0 && this.getBlock(x, y, z) === AIR) y--;
      if (this.getBlock(x, y, z) !== GRASS) continue;
      if (y < SEA_LEVEL + 1 || y > HEIGHT - 10) continue;

      const trunk = 4 + Math.floor(rng() * 3);
      const top = y + trunk;
      for (let ty = y + 1; ty <= top; ty++) this.setBlock(x, ty, z, LOG);

      // 树冠
      for (let ly = top - 2; ly <= top + 1; ly++) {
        const r = ly >= top ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && ly <= top) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
            const bx = x + dx;
            const bz = z + dz;
            if (this.getBlock(bx, ly, bz) === AIR) this.setBlock(bx, ly, bz, LEAVES);
          }
        }
      }
    }
  }

  // ---------- 网格 ----------
  shouldDrawFace(curId, neighId, curPass) {
    if (neighId === AIR) return true;
    if (curPass === "water") return false;
    const cur = BLOCKS[curId];
    const neigh = BLOCKS[neighId];
    if (cur.opaque) return !neigh.opaque;
    if (neighId === curId) return false;
    return !neigh.opaque;
  }

  vertexAO(side1, side2, corner) {
    if (side1 && side2) return 0;
    return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
  }

  buildChunkGeometry(cx, cz) {
    const solid = { pos: [], norm: [], uv: [], col: [], idx: [] };
    const water = { pos: [], norm: [], uv: [], col: [], idx: [] };
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = baseX + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const z = baseZ + lz;
        const top = this.columnTop[x * WORLD_SIZE + z];
        for (let y = 0; y <= top; y++) {
          const id = this.getBlock(x, y, z);
          if (id === AIR) continue;
          const block = BLOCKS[id];
          const pass = block.renderPass;
          const target = pass === "water" ? water : solid;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighId = this.getBlock(nx, ny, nz);
            if (!this.shouldDrawFace(id, neighId, pass)) continue;

            const tile = block.textures[f];
            // 面法线的两个切线轴
            const tangents = [0, 1, 2].filter((a) => face.dir[a] === 0);
            const vertexIndex = target.pos.length / 3;

            for (const corner of face.corners) {
              const p = corner.pos;
              target.pos.push(lx + p[0], y + p[1], lz + p[2]);
              target.norm.push(face.dir[0], face.dir[1], face.dir[2]);

              const u = (tile + corner.uv[0]) / TILE_COUNT;
              const v = corner.uv[1];
              target.uv.push(u, v);

              let brightness = face.shade;
              if (pass !== "water") {
                const t0 = tangents[0];
                const t1 = tangents[1];
                const s0 = p[t0] * 2 - 1;
                const s1 = p[t1] * 2 - 1;
                const b = [nx, ny, nz];
                const o0 = b.slice();
                o0[t0] += s0;
                const o1 = b.slice();
                o1[t1] += s1;
                const oc = b.slice();
                oc[t0] += s0;
                oc[t1] += s1;
                const ao = this.vertexAO(
                  isOpaque(this.getBlock(o0[0], o0[1], o0[2])),
                  isOpaque(this.getBlock(o1[0], o1[1], o1[2])),
                  isOpaque(this.getBlock(oc[0], oc[1], oc[2]))
                );
                brightness *= AO_LEVELS[ao];
              }
              target.col.push(brightness, brightness, brightness);
            }

            target.idx.push(
              vertexIndex,
              vertexIndex + 1,
              vertexIndex + 2,
              vertexIndex + 2,
              vertexIndex + 1,
              vertexIndex + 3
            );
          }
        }
      }
    }

    return { solid, water };
  }

  toGeometry(g) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(g.norm, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(g.col, 3));
    geom.setIndex(g.idx);
    geom.computeBoundingSphere();
    return geom;
  }

  buildChunk(cx, cz) {
    const key = cx * CHUNKS_Z + cz;
    const { solid, water } = this.buildChunkGeometry(cx, cz);
    const chunk = this.chunks[key] || { solidMesh: null, waterMesh: null };
    const origin = new THREE.Vector3(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

    if (solid.idx.length > 0) {
      const geom = this.toGeometry(solid);
      if (chunk.solidMesh) {
        chunk.solidMesh.geometry.dispose();
        chunk.solidMesh.geometry = geom;
      } else {
        chunk.solidMesh = new THREE.Mesh(geom, this.solidMaterial);
        chunk.solidMesh.position.copy(origin);
      }
    } else if (chunk.solidMesh) {
      chunk.solidMesh.geometry.dispose();
      chunk.solidMesh.geometry = new THREE.BufferGeometry();
    }

    if (water.idx.length > 0) {
      const geom = this.toGeometry(water);
      if (chunk.waterMesh) {
        chunk.waterMesh.geometry.dispose();
        chunk.waterMesh.geometry = geom;
      } else {
        chunk.waterMesh = new THREE.Mesh(geom, this.waterMaterial);
        chunk.waterMesh.position.copy(origin);
        chunk.waterMesh.renderOrder = 1;
      }
    } else if (chunk.waterMesh) {
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh.geometry = new THREE.BufferGeometry();
    }

    chunk.cx = cx;
    chunk.cz = cz;
    this.chunks[key] = chunk;
    return chunk;
  }

  addChunkToScene(scene, cx, cz) {
    const chunk = this.chunks[cx * CHUNKS_Z + cz];
    if (!chunk) return;
    if (chunk.solidMesh && !chunk.solidMesh.parent) scene.add(chunk.solidMesh);
    if (chunk.waterMesh && !chunk.waterMesh.parent) scene.add(chunk.waterMesh);
  }

  remeshAround(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const dirty = new Set();
    dirty.add(`${cx},${cz}`);
    if (x % CHUNK_SIZE === 0 && cx > 0) dirty.add(`${cx - 1},${cz}`);
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1 && cx < CHUNKS_X - 1) dirty.add(`${cx + 1},${cz}`);
    if (z % CHUNK_SIZE === 0 && cz > 0) dirty.add(`${cx},${cz - 1}`);
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1 && cz < CHUNKS_Z - 1) dirty.add(`${cx},${cz + 1}`);
    for (const d of dirty) {
      const [a, b] = d.split(",").map(Number);
      this.buildChunk(a, b);
    }
  }

  // 顶面高度（用于出生点）
  surfaceHeight(x, z) {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== AIR && b !== WATER) return y + 1;
    }
    return SEA_LEVEL + 1;
  }

  // ---------- 体素射线 ----------
  raycast(origin, dir, maxDist = 6) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX =
      stepX !== 0 ? (stepX > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x) : Infinity;
    let tMaxY =
      stepY !== 0 ? (stepY > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y) : Infinity;
    let tMaxZ =
      stepZ !== 0 ? (stepZ > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z) : Infinity;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;

    while (t <= maxDist) {
      const b = this.getBlock(x, y, z);
      if (b !== AIR && b !== WATER) return { x, y, z, nx, ny, nz, t };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }
}
