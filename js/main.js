import * as THREE from "three";
import { World, WORLD_SIZE, CHUNKS_X, CHUNKS_Z, BOSS_ARENA } from "./world.js?v=20260915c";
import { Player } from "./player.js?v=20260915c";
import { BLOCKS, HOTBAR, AIR, WATER, BEDROCK, IRON_ORE, COBBLESTONE, CRAFTING_TABLE, FLINT_STEEL, CAMPFIRE, isTool, isPlaceable, isGun, isFood, isSolid } from "./blocks.js?v=20260915c";
import { drawTileTo } from "./textures.js?v=20260915c";
import { Inventory } from "./inventory.js?v=20260915c";
import { RECIPES } from "./recipes.js?v=20260915c";
import { ViewModel } from "./viewmodel.js?v=20260915c";
import { MobManager } from "./mobs.js?v=20260915c";
import { sfx } from "./audio.js?v=20260915c";
import { IntroCinematic } from "./intro.js?v=20260915c";

const BUILD = "20260915c";
console.log(`MineWeb build ${BUILD}`);

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const playBtn = document.getElementById("playBtn");
const introBtn = document.getElementById("introBtn");
const loading = document.getElementById("loading");
const loadingBar = document.getElementById("loadingBar");
const loadingPct = document.getElementById("loadingPct");
const coordsEl = document.getElementById("coords");
const fpsEl = document.getElementById("fps");
const modeEl = document.getElementById("mode");
const hotbarEl = document.getElementById("hotbar");
const underwaterEl = document.getElementById("underwater");
const craftingEl = document.getElementById("crafting");
const invGridEl = document.getElementById("invGrid");
const recipeListEl = document.getElementById("recipeList");
const craftCloseBtn = document.getElementById("craftClose");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const newGameBtn = document.getElementById("newGameBtn");
const saveInfoEl = document.getElementById("saveInfo");
const toastEl = document.getElementById("toast");
const heldNameEl = document.getElementById("heldName");
const minebarEl = document.getElementById("minebar");
const mineFillEl = document.getElementById("mineFill");
const healthEl = document.getElementById("health");
const hungerEl = document.getElementById("hunger");
const hurtEl = document.getElementById("hurt");
const headshotEl = document.getElementById("headshot");
const threatEl = document.getElementById("threat");
const commandEl = document.getElementById("command");
const commandInput = document.getElementById("commandInput");
const bossbarEl = document.getElementById("bossbar");
const bossNameEl = document.getElementById("bossName");
const bossFillEl = document.getElementById("bossFill");

const SAVE_KEY = "mineweb.save.v1";

const SKY = new THREE.Color(0x9fd0f5);

// ---------- 渲染器 / 场景 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 55, 130);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);
scene.add(camera);

// ---------- 世界 / 玩家 ----------
const world = new World(20240612);
const player = new Player(world, camera);
const viewmodel = new ViewModel(camera);
const mobs = new MobManager(world, scene);

// 方块高亮框
const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(highlightGeo),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
);
highlight.visible = false;
scene.add(highlight);

// 爆头头部高亮框
const headMarker = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xff3b2a, depthTest: false, transparent: true })
);
headMarker.visible = false;
headMarker.frustumCulled = false;
headMarker.renderOrder = 3;
scene.add(headMarker);
let headMarkerTimer = 0;
let headMarkerTarget = null;
const headMarkerPos = new THREE.Vector3();

// 铁矿嗅探器标记（穿墙可见）
const oreMarker = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xffd76a, depthTest: false, transparent: true })
);
oreMarker.visible = false;
oreMarker.frustumCulled = false;
oreMarker.renderOrder = 3;
scene.add(oreMarker);
let oreMarkerTimer = 0;

// 枪械弹道：池化多条，霰弹枪一次可射出多颗弹丸
const TRACER_POOL = 12;
const TRACER_LIFE = 0.06;
const tracers = [];
for (let i = 0; i < TRACER_POOL; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  tracers.push({ line, mat, timer: 0 });
}
let gunCooldown = 0;

// ---------- 物品栏 / 背包 ----------
let selected = 0;
let creative = false;
let craftingOpen = false;
let commandOpen = false;
let paused = true;
let booted = false;
let animating = false;
let started = false;
const inventory = new Inventory();
// 工具耐久： id -> 剩余耐久
const toolDurability = new Map();

// 挖掘状态
let miningHeld = false;
let mineKey = null;
let mineProgress = 0;
let digSoundTimer = 0;

function itemCanvas(tileIndex, w = 16, h = 16) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawTileTo(c, tileIndex);
  return c;
}

function buildHotbar() {
  HOTBAR.forEach((id, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";

    const c = itemCanvas(BLOCKS[id].textures[0]);
    c.style.position = "absolute";

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = i < 9 ? String(i + 1) : i === 9 ? "0" : "";

    const count = document.createElement("span");
    count.className = "count";

    const dur = document.createElement("div");
    dur.className = "dur";
    dur.appendChild(document.createElement("i"));

    slot.appendChild(c);
    slot.appendChild(num);
    slot.appendChild(count);
    slot.appendChild(dur);
    hotbarEl.appendChild(slot);
  });
  updateHotbar();
  layoutHud();
}

// 物品栏可能换行成多排，动态把生命/饥饿条和手持名称放到其上方
function layoutHud() {
  const barsBottom = 18 + hotbarEl.offsetHeight + 8;
  healthEl.style.bottom = `${barsBottom}px`;
  hungerEl.style.bottom = `${barsBottom}px`;
  heldNameEl.style.bottom = `${barsBottom + 26}px`;
}

function updateHotbar() {
  [...hotbarEl.children].forEach((el, i) => {
    el.classList.toggle("active", i === selected);
    const id = HOTBAR[i];
    const countEl = el.querySelector(".count");
    const c = inventory.count(id);
    if (creative) {
      countEl.textContent = isTool(id) ? "" : "∞";
      el.classList.remove("empty");
    } else {
      countEl.textContent = c > 0 ? String(c) : "";
      el.classList.toggle("empty", c <= 0);
    }
    // 工具耐久条
    const dur = el.querySelector(".dur");
    if (isTool(id) && (creative || c > 0)) {
      const max = BLOCKS[id].use.durability;
      const left = toolDurability.has(id) ? toolDurability.get(id) : max;
      const pct = Math.max(0, Math.min(1, left / max));
      dur.style.display = "block";
      const fill = dur.querySelector("i");
      fill.style.width = `${pct * 100}%`;
      fill.style.background = pct > 0.5 ? "#4cd44c" : pct > 0.25 ? "#e8c33a" : "#e04a3a";
    } else {
      dur.style.display = "none";
    }
  });
  const held = HOTBAR[selected];
  const countable = isTool(held) || isGun(held) || isFood(held);
  const heldOwned = creative || !countable || inventory.count(held) > 0;
  heldNameEl.textContent = BLOCKS[held].name + (countable && !heldOwned ? "（未持有）" : "");
  // 生存模式下未持有的工具/枪械/食物不显示手持模型，只留手臂
  viewmodel.showItem(heldOwned ? held : AIR);
}

function updateMode() {
  modeEl.textContent = creative ? "模式：创造（无限方块）" : "模式：生存（挖矿获得 / 放置消耗）";
}

function selectSlot(i) {
  selected = (i + HOTBAR.length) % HOTBAR.length;
  updateHotbar();
  sfx.play("click");
}

// ---------- 合成 ----------
// 合成需要靠近工作台；仅少数基础配方（basic）可在背包直接制作
const CRAFT_TABLE_RANGE = 6;

function needsTable(recipe) {
  return !recipe.basic;
}

function nearCraftingTable() {
  const p = player.position;
  const r = CRAFT_TABLE_RANGE;
  const r2 = r * r;
  const x0 = Math.floor(p.x - r);
  const x1 = Math.floor(p.x + r);
  const y0 = Math.floor(p.y - 3);
  const y1 = Math.floor(p.y + 3);
  const z0 = Math.floor(p.z - r);
  const z1 = Math.floor(p.z + r);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (world.getBlock(x, y, z) !== CRAFTING_TABLE) continue;
        const dx = x + 0.5 - p.x;
        const dy = y + 0.5 - p.y;
        const dz = z + 0.5 - p.z;
        if (dx * dx + dy * dy + dz * dz <= r2) return true;
      }
    }
  }
  return false;
}

function canCraft(recipe) {
  return recipe.in.every((ing) => inventory.count(ing.id) >= ing.n);
}

function craft(recipe) {
  if (!canCraft(recipe)) return;
  if (needsTable(recipe) && !nearCraftingTable()) {
    sfx.play("click");
    toast("合成需要靠近工作台");
    return;
  }
  for (const ing of recipe.in) inventory.remove(ing.id, ing.n);
  inventory.add(recipe.out.id, recipe.out.n);
  sfx.play("craft");
  renderInventory();
  renderRecipes();
  updateHotbar();
}

function recipeCell(id, n) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.appendChild(itemCanvas(BLOCKS[id].textures[0], 32, 32));
  const label = document.createElement("span");
  label.className = "n";
  label.textContent = `×${n}`;
  cell.appendChild(label);
  return cell;
}

function renderRecipes() {
  recipeListEl.innerHTML = "";
  const nearTable = nearCraftingTable();

  const tip = document.createElement("div");
  tip.className = "craft-tip " + (nearTable ? "ok" : "warn");
  tip.textContent = nearTable
    ? "已连接工作台，可合成全部配方"
    : "未连接工作台：仅可制作木板 / 木棍 / 工作台，其余需靠近工作台";
  recipeListEl.appendChild(tip);

  for (const recipe of RECIPES) {
    const gate = needsTable(recipe) && !nearTable;
    const affordable = canCraft(recipe);
    const usable = affordable && !gate;
    const row = document.createElement("button");
    row.className = "recipe" + (usable ? "" : " disabled");

    const flow = document.createElement("div");
    flow.className = "flow";
    recipe.in.forEach((ing, i) => {
      if (i > 0) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        flow.appendChild(plus);
      }
      flow.appendChild(recipeCell(ing.id, ing.n));
    });
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "→";
    flow.appendChild(arrow);
    flow.appendChild(recipeCell(recipe.out.id, recipe.out.n));

    const name = document.createElement("span");
    name.className = "outname";
    name.textContent = BLOCKS[recipe.out.id].name;

    row.appendChild(flow);
    row.appendChild(name);
    if (gate) {
      const req = document.createElement("span");
      req.className = "req";
      req.textContent = "需工作台";
      row.appendChild(req);
    }
    if (usable) row.addEventListener("click", () => craft(recipe));
    recipeListEl.appendChild(row);
  }
}

function renderInventory() {
  invGridEl.innerHTML = "";
  const entries = inventory.entries();
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "inv-empty";
    empty.textContent = "背包是空的，先去挖点方块吧";
    invGridEl.appendChild(empty);
    return;
  }
  for (const [id, count] of entries) {
    const item = document.createElement("div");
    item.className = "inv-item";
    item.appendChild(itemCanvas(BLOCKS[id].textures[0]));

    const cnt = document.createElement("span");
    cnt.className = "count";
    cnt.textContent = count;

    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = BLOCKS[id].name;

    item.appendChild(cnt);
    item.appendChild(nm);
    invGridEl.appendChild(item);
  }
}

// requestPointerLock / exitPointerLock 在部分浏览器返回 Promise，需吞掉拒绝
function lockPointer() {
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function unlockPointer() {
  const p = document.exitPointerLock();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function openCrafting() {
  if (craftingOpen) return;
  craftingOpen = true;
  player.keys.clear();
  craftingEl.classList.remove("hidden");
  renderInventory();
  renderRecipes();
  if (document.pointerLockElement === canvas) unlockPointer();
}

function closeCrafting() {
  if (!craftingOpen) return;
  craftingOpen = false;
  craftingEl.classList.add("hidden");
  lockPointer();
}

function toggleCrafting() {
  if (craftingOpen) closeCrafting();
  else openCrafting();
}

craftCloseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeCrafting();
});
craftingEl.addEventListener("mousedown", (e) => {
  if (e.target === craftingEl) closeCrafting();
});

// ---------- 命令模式 ----------
const COMPASS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
const ORE_SNIFF_RADIUS = 64;
const ORE_MARKER_SECONDS = 10;
const ORE_SNIFF_COST = 20; // 每次嗅探消耗的圆石数量

function compassDir(dx, dz) {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8];
}

// 扫描附近铁矿：报最近一块的距离/方位/坐标，并放一个穿墙标记
// 每次使用消耗 ORE_SNIFF_COST 个圆石（创造模式不消耗）
function sniffIron() {
  if (!creative) {
    if (inventory.count(COBBLESTONE) < ORE_SNIFF_COST) {
      sfx.play("click");
      toast(`铁矿嗅探器需要 ${ORE_SNIFF_COST} 个圆石（当前 ${inventory.count(COBBLESTONE)}）`);
      return;
    }
    inventory.remove(COBBLESTONE, ORE_SNIFF_COST);
    updateHotbar();
  }
  const px = Math.floor(player.position.x);
  const py = Math.floor(player.position.y);
  const pz = Math.floor(player.position.z);
  const hit = world.findNearestBlock(px, py, pz, IRON_ORE, ORE_SNIFF_RADIUS);
  if (!hit) {
    sfx.play("click");
    toast(`半径 ${ORE_SNIFF_RADIUS} 格内没有铁矿信号（铁矿只生成在 Y 2~20，往深处挖）`);
    return;
  }
  const dx = hit.x - px;
  const dy = hit.y - py;
  const dz = hit.z - pz;
  const dist = Math.round(Math.hypot(dx, dy, dz));
  const vert = dy > 1 ? "上方" : dy < -1 ? "下方" : "同层";
  oreMarker.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  oreMarker.visible = true;
  oreMarkerTimer = ORE_MARKER_SECONDS;
  oreMarker.material.opacity = 1;
  sfx.play("sniff");
  toast(`铁矿信号：${dist} 格 · ${compassDir(dx, dz)}方 · ${vert} · 坐标 (${hit.x}, ${hit.y}, ${hit.z})`);
}

const COMMANDS = {
  "一大波": () => {
    const n = mobs.spawnWave(player, 20);
    if (n > 0) toast(`一大波怪物来袭！（${n} 只）`);
    else toast("附近没有合适的位置生成怪物");
  },
  "铁矿嗅探器": () => sniffIron(),
  "BOSS方向": () => {
    const dx = BOSS_ARENA.x - player.position.x;
    const dz = BOSS_ARENA.z - player.position.z;
    const dist = Math.round(Math.hypot(dx, dz));
    toast(`BOSS 领域在 ${compassDir(dx, dz)}方约 ${dist} 格（地图北侧边缘的祭坛）`);
  },
  "重置BOSS": () => {
    if (mobs.boss) {
      mobs.remove(mobs.boss);
      mobs.boss = null;
    }
    mobs.bossDefeated = false;
    updateBossHud();
    sfx.play("click");
    toast("BOSS 已重置，前往祭坛可再次挑战");
  },
  "静音": () => {
    const m = sfx.toggleMute();
    toast(m ? "音效已关闭" : "音效已开启");
  },
};

function openCommand() {
  if (commandOpen || craftingOpen) return;
  commandOpen = true;
  player.keys.clear();
  commandInput.value = "";
  commandEl.classList.remove("hidden");
  if (document.pointerLockElement === canvas) unlockPointer();
  commandInput.focus();
}

function closeCommand() {
  if (!commandOpen) return;
  commandOpen = false;
  commandEl.classList.add("hidden");
  commandInput.blur();
  lockPointer();
}

function runCommand(text) {
  const cmd = text.trim();
  closeCommand();
  if (!cmd) return;
  const fn = COMMANDS[cmd];
  if (fn) fn();
  else toast(`未知命令：${cmd}`);
}

commandInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  // 输入法组字中的 Enter 不触发命令
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter") {
    e.preventDefault();
    runCommand(commandInput.value);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeCommand();
  }
});
commandEl.addEventListener("mousedown", (e) => {
  if (e.target === commandEl) closeCommand();
});

// ---------- 存档 ----------
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function updateSaveInfo() {
  const save = readSave();
  if (!save) {
    saveInfoEl.textContent = "暂无存档";
    loadBtn.disabled = true;
    return;
  }
  loadBtn.disabled = false;
  const when = save.savedAt ? new Date(save.savedAt).toLocaleString() : "未知时间";
  const edits = Array.isArray(save.edits) ? save.edits.length : 0;
  saveInfoEl.textContent = `存档：${when} · 改动 ${edits} 格`;
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1900);
}

// 3D 电影级开场运镜与视频导出控制器
const intro = new IntroCinematic({
  camera,
  world,
  player,
  viewmodel,
  renderer,
  canvas,
  toast,
  onFinish: ({ skipped }) => {
    overlay.classList.remove("hidden");
    if (!skipped) {
      toast("开场动画播放完毕，点击「开始游戏」踏上征程！");
    }
  },
});

function saveGame(silent = false) {
  if (!booted) return;
  const payload = {
    version: 1,
    seed: world.seed,
    savedAt: Date.now(),
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health,
      hunger: player.hunger,
    },
    creative,
    selected,
    playTime: mobs.playTime,
    bossDefeated: mobs.bossDefeated,
    inventory: inventory.entries(),
    edits: world.serializeEdits(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    updateSaveInfo();
    if (!silent) toast("进度已保存");
  } catch (e) {
    if (!silent) toast("保存失败：" + (e && e.message ? e.message : e));
  }
}

async function loadGame() {
  const save = readSave();
  if (!save) {
    toast("没有找到存档");
    return;
  }
  paused = true;
  overlay.classList.add("hidden");
  loading.classList.remove("hidden");

  await buildWorld(save.seed ?? world.seed, () => world.applyEdits(save.edits || []));

  if (save.player) {
    player.position.set(save.player.x, save.player.y, save.player.z);
    player.velocity.set(0, 0, 0);
    player.yaw = save.player.yaw || 0;
    player.pitch = save.player.pitch || 0;
    player.spawnPoint.copy(player.position);
    player.health = typeof save.player.health === "number" ? save.player.health : player.maxHealth;
    player.hunger = typeof save.player.hunger === "number" ? save.player.hunger : player.maxHunger;
    player.dead = false;
    player.hurtTimer = 0;
    player.regenTimer = 0;
  }
  inventory.counts = new Map(save.inventory || []);
  creative = !!save.creative;
  selected = save.selected || 0;
  updateMode();
  updateHotbar();
  player.update(0);
  mobs.clear();
  mobs.loadProgress(save.playTime || 0);
  mobs.bossDefeated = !!save.bossDefeated;
  lastHealth = player.health;
  renderHealth();
  renderHunger();
  updateThreatHud();
  updateBossHud();

  setProgress(100, "读取完成");
  await frame();
  loading.classList.add("hidden");
  paused = false;
  booted = true;
  started = true;
  last = performance.now();
  toast("已读取存档");
  if (!animating) {
    animating = true;
    animate();
  }
  lockPointer();
}

// 开始新游戏：随机新种子重建世界，清空进度
async function startNewGame() {
  if (!window.confirm("开始新游戏？当前进度与存档将被清除。")) return;

  paused = true;
  overlay.classList.add("hidden");
  loading.classList.remove("hidden");

  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* ignore */
  }

  const seed = (Math.random() * 0x7fffffff) | 0;
  await buildWorld(seed);

  inventory.clear();
  toolDurability.clear();
  creative = false;
  selected = 0;
  player.spawn(Math.floor(WORLD_SIZE / 2), Math.floor(WORLD_SIZE / 2));
  player.update(0);
  mobs.clear();
  mobs.loadProgress(0);
  mobs.bossDefeated = false;
  updateMode();
  updateHotbar();
  updateSaveInfo();
  lastHealth = player.health;
  renderHealth();
  renderHunger();
  updateThreatHud();
  updateBossHud();

  setProgress(100, "新世界就绪");
  await frame();
  loading.classList.add("hidden");
  paused = false;
  booted = true;
  started = true;
  last = performance.now();
  if (!animating) {
    animating = true;
    animate();
  }
  lockPointer();
  toast("已开始新游戏");
}

// ---------- 输入 ----------
canvas.addEventListener("click", () => {
  if (intro && intro.isActive()) return;
  if (document.pointerLockElement !== canvas) lockPointer();
});

playBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  lockPointer();
});

if (introBtn) {
  introBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.classList.add("hidden");
    intro.start();
  });
}

overlay.addEventListener("click", () => {
  if (intro && intro.isActive()) return;
  lockPointer();
});

saveBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  saveGame();
});

loadBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  loadGame();
});

newGameBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startNewGame();
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    player.keys.clear();
    miningHeld = false;
    mineKey = null;
    mineProgress = 0;
    updateMineBar();
  }
  if (locked) started = true;
  // 开始过游戏后，菜单里的按钮改为「回到游戏」
  playBtn.textContent = started ? "回到游戏" : "开始游戏";
  // 未锁定鼠标（菜单 / 合成面板 / 命令模式）时暂停世界，锁定后恢复
  paused = !locked;
  // 打开合成面板/命令模式或播放开场动画时释放鼠标，此时不要弹出开始菜单
  overlay.classList.toggle("hidden", locked || craftingOpen || commandOpen || (intro && intro.isActive()));
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) {
    player.handleMouseMove(e.movementX || 0, e.movementY || 0);
  }
});

document.addEventListener("keydown", (e) => {
  if (intro && intro.isActive()) {
    if (e.code === "Escape" || e.code === "Space") {
      e.preventDefault();
      intro.stop(true);
      return;
    }
  }
  if (commandOpen) return;
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
    e.preventDefault();
    saveGame();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyO") {
    e.preventDefault();
    loadGame();
    return;
  }
  if (e.code === "KeyE") {
    e.preventDefault();
    toggleCrafting();
    return;
  }
  if (e.code === "KeyC") {
    e.preventDefault();
    creative = !creative;
    updateMode();
    updateHotbar();
    return;
  }
  if (e.code === "Escape" && craftingOpen) {
    closeCrafting();
    return;
  }
  if (craftingOpen) return;

  if (e.code === "Slash" && document.pointerLockElement === canvas) {
    e.preventDefault();
    openCommand();
    return;
  }

  if (e.code === "Space") e.preventDefault();
  if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    const index = n === 0 ? 9 : n - 1;
    if (index >= 0 && index < HOTBAR.length) selectSlot(index);
  }
  player.keys.add(e.code);
});

document.addEventListener("keyup", (e) => {
  player.keys.delete(e.code);
});

let wheelAccum = 0;
let lastWheelTime = 0;

// 滚动灵敏度：越小越慢。1 = 一格刻度换一格；0.5 = 两格刻度才换一格
const SCROLL_SENSITIVITY = 0.5;
// 高频连续滚动（触控板/高分辨率滚轮）每多少像素当量算一"刻度"
const SCROLL_DENSE_STEP = 120;

document.addEventListener("wheel", (e) => {
  if (document.pointerLockElement !== canvas) return;
  e.preventDefault();

  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 32; // 行
  else if (e.deltaMode === 2) delta *= 300; // 页
  if (delta === 0) return;

  const now = performance.now();
  const gap = now - lastWheelTime;
  lastWheelTime = now;

  // 统一换算成"刻度数"：离散滚轮 = 1 刻度；高频连续 = 像素/阈值
  const units = gap > 45 ? Math.sign(delta) : delta / SCROLL_DENSE_STEP;
  wheelAccum += units * SCROLL_SENSITIVITY;

  // 每个事件最多切一格，避免一次大 delta 跳多格
  if (wheelAccum >= 1) {
    selectSlot(selected + 1);
    wheelAccum = 0;
  } else if (wheelAccum <= -1) {
    selectSlot(selected - 1);
    wheelAccum = 0;
  }
}, { passive: false });

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    // 手持枪械：射击
    if (isGun(HOTBAR[selected])) {
      fireGun();
      return;
    }
    // 优先攻击准星内的怪物
    if (tryAttack()) return;
    // 创造模式立即破坏；生存模式按住左键逐步挖掘
    if (creative) breakBlock();
    else {
      miningHeld = true;
      mineKey = null;
      mineProgress = 0;
    }
  } else if (e.button === 2) {
    if (tryUseItem()) return;
    if (tryEat()) return;
    placeBlock();
  }
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    miningHeld = false;
    mineKey = null;
    mineProgress = 0;
    updateMineBar();
  }
});

function updateMineBar() {
  const active = miningHeld && mineProgress > 0 && !creative;
  minebarEl.classList.toggle("active", active);
  mineFillEl.style.width = `${Math.min(1, mineProgress) * 100}%`;
}

// 脚步声：按移动速度与地面材质定节奏
let stepTimer = 0;
function updateFootsteps(dt) {
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  const sprinting = player.keys.has("ShiftLeft") || player.keys.has("ShiftRight");
  if (player.onGround && !player.inWater && speed > 1.2) {
    stepTimer -= dt;
    if (stepTimer <= 0) {
      const p = player.position;
      const ground = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
      sfx.play("step", { material: blockMaterial(ground) });
      stepTimer = sprinting ? 0.26 : 0.38;
    }
  } else {
    stepTimer = Math.min(stepTimer, 0.1);
  }
}

const HEART_COUNT = 10;

function renderHealth() {
  if (healthEl.childElementCount !== HEART_COUNT) {
    healthEl.innerHTML = "";
    for (let i = 0; i < HEART_COUNT; i++) {
      const s = document.createElement("span");
      s.className = "heart";
      s.textContent = "\u2665";
      healthEl.appendChild(s);
    }
  }
  for (let i = 0; i < HEART_COUNT; i++) {
    const v = player.health - i * 2;
    const el = healthEl.children[i];
    el.classList.toggle("full", v >= 2);
    el.classList.toggle("half", v === 1);
  }
}

function renderHunger() {
  if (hungerEl.childElementCount !== HEART_COUNT) {
    hungerEl.innerHTML = "";
    for (let i = 0; i < HEART_COUNT; i++) {
      const s = document.createElement("span");
      s.className = "food";
      hungerEl.appendChild(s);
    }
  }
  for (let i = 0; i < HEART_COUNT; i++) {
    const v = player.hunger - i * 2;
    const el = hungerEl.children[i];
    el.classList.toggle("full", v >= 2);
    el.classList.toggle("half", v === 1);
  }
}

let hurtFlashTimer = null;
function flashHurt() {
  hurtEl.classList.add("show");
  clearTimeout(hurtFlashTimer);
  hurtFlashTimer = setTimeout(() => hurtEl.classList.remove("show"), 130);
}

// 爆头反馈：屏幕文字 + 头部高亮框
let headshotHideTimer = null;
function showHeadshot(mob) {
  headshotEl.classList.remove("show");
  void headshotEl.offsetWidth; // 重启动画
  headshotEl.classList.add("show");
  clearTimeout(headshotHideTimer);
  headshotHideTimer = setTimeout(() => headshotEl.classList.remove("show"), 700);

  if (mob) {
    headMarkerTarget = mob;
    headMarkerPos.set(mob.position.x, mob.position.y + mob.headY, mob.position.z);
    headMarker.scale.setScalar(Math.max(0.4, mob.headR * 2));
    headMarkerTimer = 0.22;
  }
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function updateThreatHud() {
  const stage = mobs.currentStage;
  const next = mobs.nextStage;
  if (!next) {
    threatEl.textContent = `威胁：${stage.name}（最高）`;
    return;
  }
  threatEl.textContent = `威胁：${stage.name} · 下一阶段 ${formatClock(next.at - mobs.playTime)}`;
}

// BOSS 血条
function updateBossHud() {
  const boss = mobs.boss;
  if (!boss || boss.dead) {
    bossbarEl.classList.add("hidden");
    return;
  }
  bossbarEl.classList.remove("hidden");
  bossbarEl.classList.toggle("enraged", !!boss.enraged);
  bossNameEl.textContent = boss.enraged ? `${boss.name} · 狂暴` : boss.name;
  const pct = Math.max(0, Math.min(1, boss.health / boss.def.health));
  bossFillEl.style.width = `${pct * 100}%`;
}

// BOSS 战事件
mobs.setArena(BOSS_ARENA);
mobs.onBossSpawn = () => {
  sfx.play("ominous");
  toast(`你踏入了 BOSS 领域，${mobs.boss.name} 苏醒了！`);
};
mobs.onBossEnrage = (boss) => {
  sfx.play("boss_enrage");
  toast(`${boss.name} 狂暴了！`);
};
mobs.onBossReset = () => {
  toast("你逃离了领域，BOSS 回到祭坛并恢复了力量");
  updateBossHud();
};
mobs.onBossDefeated = (boss) => {
  sfx.play("boss_defeat");
  toast(`击败了 ${boss.name}！`);
};

// 阶段推进时提示玩家
mobs.onStageChange = (stage, idx) => {
  if (idx > 0) {
    sfx.play("ominous");
    toast(`怪物变得更强了：${stage.name}`);
  }
};

// 怪物/猎物死亡：结算掉落
mobs.onDeath = (mob) => {
  const drops = mob.def.drops;
  if (!drops) return;
  const gained = [];
  for (const d of drops) {
    const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    if (n <= 0) continue;
    inventory.add(d.id, n);
    gained.push(`${BLOCKS[d.id].name} ×${n}`);
  }
  if (gained.length) {
    updateHotbar();
    sfx.play("pop");
    toast(`获得 ${gained.join("、")}`);
  }
};

// ---------- 交互 ----------
function intersectsPlayer(bx, by, bz) {
  const p = player.position;
  const half = 0.3;
  const height = 1.8;
  return (
    bx < p.x + half &&
    bx + 1 > p.x - half &&
    by < p.y + height &&
    by + 1 > p.y &&
    bz < p.z + half &&
    bz + 1 > p.z - half
  );
}

// 破坏方块并返回原 id（不处理掉落与耐久）
function breakAt(x, y, z) {
  const id = world.getBlock(x, y, z);
  if (id === BEDROCK || id === AIR) return null;
  world.setBlock(x, y, z, AIR);
  world.remeshAround(x, y, z);
  return id;
}

// 当前手持工具（非工具或生存模式已用尽则返回 null）
function heldTool() {
  const id = HOTBAR[selected];
  if (!isTool(id)) return null;
  if (!creative && inventory.count(id) <= 0) return null;
  return { id, ...BLOCKS[id].use };
}

// 当前手持枪械（未持有或非枪械则返回 null）
function heldGun() {
  const id = HOTBAR[selected];
  if (!isGun(id)) return null;
  if (!creative && inventory.count(id) <= 0) return null;
  return BLOCKS[id].gun;
}

// 挖掘速度：匹配方块偏好工具且达到等级时用工具速度，否则徒手
function miningSpeedFor(blockId) {
  const t = heldTool();
  const req = BLOCKS[blockId].requiredTier || 0;
  if (t && t.type === BLOCKS[blockId].tool && t.tier >= req) return t.speed;
  return 1;
}

// 工具能否使方块掉落（需要工具且等级足够的方块必须用对类型）
function toolYields(blockId) {
  if (!BLOCKS[blockId].requiresTool) return true;
  const t = heldTool();
  const req = BLOCKS[blockId].requiredTier || 0;
  return !!t && t.type === BLOCKS[blockId].tool && t.tier >= req;
}

// 能否挖掘：方块设有等级门槛（如铁矿石需石镐）且工具不达标则凿不动
function canMine(blockId) {
  const b = BLOCKS[blockId];
  const req = b.requiredTier || 0;
  if (req <= 0) return true;
  const t = heldTool();
  return !!t && t.type === b.tool && t.tier >= req;
}

// 达到等级所需的工具名（用于提示）
const TIER_TOOL_NAME = { 1: "木镐", 2: "石镐" };
function neededToolName(blockId) {
  return TIER_TOOL_NAME[BLOCKS[blockId].requiredTier || 1] || "镐";
}

// 消耗一次工具耐久，归零则损坏消失
function consumeDurability() {
  const t = heldTool();
  if (!t) return;
  const max = t.durability;
  let left = toolDurability.has(t.id) ? toolDurability.get(t.id) : max;
  left -= 1;
  if (left <= 0) {
    inventory.remove(t.id, 1);
    const remaining = inventory.count(t.id);
    if (remaining > 0) toolDurability.set(t.id, max);
    else toolDurability.delete(t.id);
    toast(`${BLOCKS[t.id].name} 已损坏`);
    updateHotbar();
  } else {
    toolDurability.set(t.id, left);
    updateHotbar();
  }
}

// 根据方块偏好工具归类音效材质
function blockMaterial(id) {
  const tool = BLOCKS[id] && BLOCKS[id].tool;
  if (tool === "axe") return "wood";
  if (tool === "shovel") return "dirt";
  if (tool === "pickaxe") return "stone";
  return "grass";
}

// 完成一次挖掘：判定掉落 + 耐久
function finishMine(x, y, z) {
  const id = breakAt(x, y, z);
  if (id === null) return;
  player.addExhaustion(0.4);
  sfx.play("break", { material: blockMaterial(id) });
  let gained = false;
  if (toolYields(id)) {
    const drop = BLOCKS[id].drop === undefined ? id : BLOCKS[id].drop;
    if (drop !== null) {
      inventory.add(drop, 1);
      updateHotbar();
      gained = true;
    }
  }
  if (gained) sfx.play("pop");
  if (!creative) consumeDurability();
}

// 创造 / 测试用：立即破坏并掉落入背包
function breakBlock() {
  const hit = world.raycast(player.eyePosition, player.getLookDirection(), 6);
  if (!hit) return null;
  const id = breakAt(hit.x, hit.y, hit.z);
  if (id === null) return null;
  sfx.play("break", { material: blockMaterial(id) });
  if (!creative && toolYields(id)) {
    const drop = BLOCKS[id].drop === undefined ? id : BLOCKS[id].drop;
    if (drop !== null) {
      inventory.add(drop, 1);
      updateHotbar();
      sfx.play("pop");
    }
  }
  return id;
}

function placeBlock() {
  const hit = world.raycast(player.eyePosition, player.getLookDirection(), 6);
  if (!hit) return;

  // 右键工作台：打开合成界面
  if (world.getBlock(hit.x, hit.y, hit.z) === CRAFTING_TABLE) {
    openCrafting();
    return;
  }

  const blockId = HOTBAR[selected];
  if (!isPlaceable(blockId)) return; // 手持工具/木棍时不能放置

  const x = hit.x + hit.nx;
  const y = hit.y + hit.ny;
  const z = hit.z + hit.nz;
  if (!world.inBounds(x, y, z)) return;
  const current = world.getBlock(x, y, z);
  if (current !== AIR && current !== WATER) return;
  if (intersectsPlayer(x, y, z)) return;

  if (!creative && inventory.count(blockId) <= 0) return;
  world.setBlock(x, y, z, blockId);
  world.remeshAround(x, y, z);
  sfx.play("place", { material: blockMaterial(blockId) });
  if (!creative) {
    inventory.remove(blockId, 1);
    updateHotbar();
  }
}

const ATTACK_REACH = 3.5;

// 右键进食
function tryEat() {
  const id = HOTBAR[selected];
  if (!isFood(id)) return false;
  if (!creative && inventory.count(id) <= 0) return false;
  if (player.hunger >= player.maxHunger) {
    toast("现在并不饿");
    return true;
  }
  if (!creative) {
    inventory.remove(id, 1);
    updateHotbar();
  }
  player.eat(BLOCKS[id].food.hunger);
  sfx.play("eat");
  renderHunger();
  return true;
}

// 右键使用道具：打火石生火 / 生肉在火堆上烤熟
function tryUseItem() {
  const hit = world.raycast(player.eyePosition, player.getLookDirection(), 6);
  if (!hit) return false;
  const held = HOTBAR[selected];
  const target = world.getBlock(hit.x, hit.y, hit.z);

  // 烤肉：手持生肉右键火堆
  const cookTo = BLOCKS[held] && BLOCKS[held].cookTo;
  if (cookTo && target === CAMPFIRE) {
    if (!creative && inventory.count(held) <= 0) return true;
    if (!creative) {
      inventory.remove(held, 1);
      inventory.add(cookTo, 1);
      updateHotbar();
    }
    toast(`烤好了：${BLOCKS[cookTo].name}`);
    sfx.play("pop");
    return true;
  }

  // 生火：手持打火石右键实心方块，在上方点起火堆
  if (held === FLINT_STEEL && target !== CAMPFIRE) {
    if (!creative && inventory.count(FLINT_STEEL) <= 0) return false;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (!world.inBounds(x, y, z)) return true;
    if (!isSolid(target)) return true;
    if (world.getBlock(x, y, z) !== AIR) return true;
    if (intersectsPlayer(x, y, z)) return true;
    world.setBlock(x, y, z, CAMPFIRE);
    world.remeshAround(x, y, z);
    sfx.play("place", { material: "stone" });
    toast("生起了火堆");
    return true;
  }

  return false;
}

// 挥击准星内的怪物；命中返回 true（此时不挖掘方块）
function tryAttack() {
  const origin = player.eyePosition;
  const dir = player.getLookDirection();
  const mobHit = mobs.raycast(origin, dir, ATTACK_REACH);
  if (!mobHit) return false;

  // 被方块挡住则打不到
  const blockHit = world.raycast(origin, dir, ATTACK_REACH);
  if (blockHit && blockHit.t < mobHit.distance) return false;

  player.addExhaustion(0.3);
  const dead = mobHit.mob.hurt(creative ? 1000 : meleeDamage());
  sfx.play(dead ? "mob_death" : "mob_hurt");
  sfx.play("hit");
  if (dead) mobs.kill(mobHit.mob);
  return true;
}

// 近战伤害：持剑时按等级递增，否则徒手
const SWORD_DAMAGE = { 1: 4, 2: 5, 3: 7 };
function meleeDamage() {
  const t = heldTool();
  if (t && t.type === "sword") return SWORD_DAMAGE[t.tier] || 4;
  return 4;
}

function showTracer(index, from, to, headshot = false) {
  const tr = tracers[index % TRACER_POOL];
  const attr = tr.line.geometry.getAttribute("position");
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  tr.mat.color.set(headshot ? 0xff5a3a : 0xffe08a);
  tr.line.visible = true;
  tr.timer = TRACER_LIFE;
}

// 在视线方向附近取一个带随机散射的方向（用于霰弹枪多弹丸）
function spreadDirection(baseDir, spread) {
  if (!spread) return baseDir.clone();
  return baseDir
    .clone()
    .add(
      new THREE.Vector3(
        (Math.random() * 2 - 1) * spread,
        (Math.random() * 2 - 1) * spread,
        (Math.random() * 2 - 1) * spread
      )
    )
    .normalize();
}

function fireGun() {
  const gun = heldGun();
  if (!gun) return false;
  if (gunCooldown > 0) return true;
  gunCooldown = gun.cooldown;

  const origin = player.eyePosition;
  const baseDir = player.getLookDirection();
  const pellets = gun.pellets || 1;
  const spread = gun.spread || 0;
  let headshotMob = null;

  for (let i = 0; i < pellets; i++) {
    const dir = spreadDirection(baseDir, spread);
    const blockHit = world.raycast(origin, dir, gun.range);
    const mobHit = mobs.raycast(origin, dir, gun.range);

    let end = origin.clone().addScaledVector(dir, gun.range);
    let headshot = false;
    if (mobHit && (!blockHit || mobHit.distance < blockHit.t)) {
      end = origin.clone().addScaledVector(dir, mobHit.distance);
      headshot = mobHit.headshot;
      if (headshot) headshotMob = mobHit.mob;
      const dmg = headshot ? gun.damage * 2 : gun.damage;
      if (mobHit.mob.hurt(creative ? 1000 : dmg)) mobs.kill(mobHit.mob);
    } else if (blockHit) {
      end = origin.clone().addScaledVector(dir, blockHit.t);
    }
    showTracer(i, origin, end, headshot);
  }

  player.addExhaustion(0.1);
  sfx.play(gun.sound || "gun");
  if (headshotMob) {
    showHeadshot(headshotMob);
    sfx.play("headshot");
  }
  viewmodel.kick(gun.kick ?? 0.16);
  return true;
}

// ---------- 自适应 ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  layoutHud();
});
window.addEventListener("load", layoutHud);

// ---------- 主循环 ----------
let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let waterTimer = 0;
let lastHealth = player.maxHealth;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  const time = now / 1000;

  // 枪械冷却与弹道淡出
  if (gunCooldown > 0) gunCooldown = Math.max(0, gunCooldown - dt);
  for (const tr of tracers) {
    if (tr.timer > 0) {
      tr.timer -= dt;
      if (tr.timer <= 0) tr.line.visible = false;
    }
  }
  if (headMarkerTimer > 0) {
    headMarkerTimer -= dt;
    if (headMarkerTarget && headMarkerTarget.group.parent) {
      headMarkerPos.set(
        headMarkerTarget.position.x,
        headMarkerTarget.position.y + headMarkerTarget.headY,
        headMarkerTarget.position.z
      );
    }
    headMarker.position.copy(headMarkerPos);
    headMarker.visible = headMarkerTimer > 0;
  } else if (headMarker.visible) {
    headMarker.visible = false;
  }

  if (oreMarkerTimer > 0) {
    oreMarkerTimer = Math.max(0, oreMarkerTimer - dt);
    oreMarker.visible = oreMarkerTimer > 0;
    oreMarker.material.opacity = 0.55 + 0.45 * Math.sin(time * 8);
  }

  if (intro && intro.isActive()) {
    intro.update(dt);
    renderer.render(scene, camera);
    return;
  }

  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  if (!craftingOpen) {
    player.update(dt);
    mobs.update(dt, player);
    updateFootsteps(dt);
  }
  viewmodel.update(time);

  // 受伤 / 死亡反馈
  if (player.health < lastHealth) {
    flashHurt();
    sfx.play("hurt");
  }
  lastHealth = player.health;
  renderHealth();
  renderHunger();
  updateThreatHud();
  updateBossHud();
  if (player.dead) {
    sfx.play("death");
    player.respawn();
    mobs.clear();
    lastHealth = player.health;
    toast("你被怪物击败了，已在出生点复活");
  }

  underwaterEl.classList.toggle("active", player.eyeInWater);

  // 推进流体模拟：固定步长，限制每步工作量
  waterTimer += dt;
  if (waterTimer >= 0.1) {
    waterTimer = 0;
    world.tickWater(4000);
    world.flushDirtyChunks(4);
  } else if (world.dirtyChunks.size > 0) {
    world.flushDirtyChunks(1);
  }

  const hit = world.raycast(player.eyePosition, player.getLookDirection(), 6);
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  // 生存模式：按住左键逐步挖掘
  if (!creative && miningHeld && document.pointerLockElement === canvas) {
    if (hit) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (key !== mineKey) {
        mineKey = key;
        mineProgress = 0;
        digSoundTimer = 0;
        if (id !== BEDROCK && !canMine(id)) {
          const t = heldTool();
          const need = neededToolName(id);
          if (!t) toast(`需要${need}（当前未持有，请先合成）`);
          else toast(`需要${need}，当前手持${BLOCKS[t.id].name}`);
          console.log(
            `[挖矿] 无法开采 ${BLOCKS[id].name}(id=${id}) 槽位=${selected} ` +
              `选中=${BLOCKS[HOTBAR[selected]].name} 持有=${inventory.count(HOTBAR[selected])} 工具=${JSON.stringify(t)}`
          );
        }
      }
      if (id !== BEDROCK && canMine(id)) {
        const speed = miningSpeedFor(id);
        const hardness = Math.max(0.05, BLOCKS[id].hardness);
        mineProgress += (dt * speed) / hardness;
        digSoundTimer -= dt;
        if (digSoundTimer <= 0) {
          sfx.play("dig", { material: blockMaterial(id) });
          digSoundTimer = 0.22;
        }
        if (mineProgress >= 1) {
          finishMine(hit.x, hit.y, hit.z);
          mineProgress = 0;
          mineKey = null;
        }
      }
    } else {
      mineKey = null;
      mineProgress = 0;
    }
  }
  updateMineBar();

  renderer.render(scene, camera);

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }
  const p = player.position;
  coordsEl.textContent = `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)} · build ${BUILD}`;
}

// ---------- 启动 ----------
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

if (new URLSearchParams(location.search).has("debug")) {
  window.__mineweb = {
    world,
    player,
    camera,
    scene,
    breakBlock,
    placeBlock,
    finishMine,
    miningSpeedFor,
    toolYields,
    canMine,
    heldTool,
    toolDurability,
    selectSlot,
    HOTBAR,
    miningState: () => ({
      miningHeld,
      mineProgress,
      mineKey,
      creative,
      locked: document.pointerLockElement === canvas,
      selected,
    }),
    inventory,
    craft,
    RECIPES,
    viewmodel,
    openCrafting,
    closeCrafting,
    saveGame,
    loadGame,
    readSave,
    mobs,
    BOSS_ARENA,
    intro,
    setCreative: (v) => {
      creative = v;
      updateMode();
      updateHotbar();
    },
  };
}

function setProgress(pct, text) {
  loadingBar.style.width = `${pct}%`;
  loadingPct.textContent = `${Math.round(pct)}%`;
  if (text) loading.querySelector(".loading-title").textContent = text;
}

async function buildWorld(seed, onGenerated) {
  setProgress(4, "生成地形…");
  await frame();
  world.reset(seed);
  world.generateTerrain();
  if (onGenerated) onGenerated();

  setProgress(20, "构建区块…");
  await frame();

  const total = CHUNKS_X * CHUNKS_Z;
  for (let i = 0; i < total; i++) {
    const cx = Math.floor(i / CHUNKS_Z);
    const cz = i % CHUNKS_Z;
    world.buildChunk(cx, cz);
    world.addChunkToScene(scene, cx, cz);
    setProgress(20 + ((i + 1) / total) * 78, "构建区块…");
    if (i % 2 === 1) await frame();
  }
}

async function boot() {
  buildHotbar();
  updateMode();
  updateSaveInfo();

  await buildWorld(world.seed);

  setProgress(100, "准备就绪");
  await frame();

  player.spawn(Math.floor(WORLD_SIZE / 2), Math.floor(WORLD_SIZE / 2));
  player.update(0);
  mobs.clear();
  mobs.loadProgress(0);
  mobs.bossDefeated = false;
  lastHealth = player.health;
  renderHealth();
  renderHunger();
  updateThreatHud();
  updateBossHud();

  loading.classList.add("hidden");
  booted = true;
  animating = true;
  last = performance.now();
  animate();
}

// 每 60 秒自动保存一次；关闭页面时也保存
setInterval(() => {
  if (booted && !craftingOpen && !paused) saveGame(true);
}, 60000);
window.addEventListener("pagehide", () => {
  if (booted) saveGame(true);
});

boot();
