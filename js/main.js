import * as THREE from "three";
import { World, WORLD_SIZE, CHUNKS_X, CHUNKS_Z } from "./world.js";
import { Player } from "./player.js";
import { BLOCKS, HOTBAR, AIR, WATER, BEDROCK, CRAFTING_TABLE, isTool, isPlaceable } from "./blocks.js";
import { drawTileTo } from "./textures.js";
import { Inventory } from "./inventory.js";
import { RECIPES } from "./recipes.js";
import { ViewModel } from "./viewmodel.js";
import { MobManager } from "./mobs.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const playBtn = document.getElementById("playBtn");
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
const saveInfoEl = document.getElementById("saveInfo");
const toastEl = document.getElementById("toast");
const heldNameEl = document.getElementById("heldName");
const minebarEl = document.getElementById("minebar");
const mineFillEl = document.getElementById("mineFill");
const healthEl = document.getElementById("health");
const hurtEl = document.getElementById("hurt");

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

// ---------- 物品栏 / 背包 ----------
let selected = 0;
let creative = false;
let craftingOpen = false;
let paused = true;
let booted = false;
let animating = false;
const inventory = new Inventory();
// 工具耐久： id -> 剩余耐久
const toolDurability = new Map();

// 挖掘状态
let miningHeld = false;
let mineKey = null;
let mineProgress = 0;

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
  heldNameEl.textContent = BLOCKS[held].name;
  // 生存模式下未持有的工具不显示手持模型，只留手臂
  const heldOwned = creative || !isTool(held) || inventory.count(held) > 0;
  viewmodel.showItem(heldOwned ? held : AIR);
}

function updateMode() {
  modeEl.textContent = creative ? "模式：创造（无限方块）" : "模式：生存（挖矿获得 / 放置消耗）";
}

function selectSlot(i) {
  selected = (i + HOTBAR.length) % HOTBAR.length;
  updateHotbar();
}

// ---------- 合成 ----------
function canCraft(recipe) {
  return recipe.in.every((ing) => inventory.count(ing.id) >= ing.n);
}

function craft(recipe) {
  if (!canCraft(recipe)) return;
  for (const ing of recipe.in) inventory.remove(ing.id, ing.n);
  inventory.add(recipe.out.id, recipe.out.n);
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
  for (const recipe of RECIPES) {
    const affordable = canCraft(recipe);
    const row = document.createElement("button");
    row.className = "recipe" + (affordable ? "" : " disabled");

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
    if (affordable) row.addEventListener("click", () => craft(recipe));
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
    },
    creative,
    selected,
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
  lastHealth = player.health;
  renderHealth();

  setProgress(100, "读取完成");
  await frame();
  loading.classList.add("hidden");
  paused = false;
  booted = true;
  last = performance.now();
  toast("已读取存档");
  if (!animating) {
    animating = true;
    animate();
  }
  lockPointer();
}

// ---------- 输入 ----------
canvas.addEventListener("click", () => {
  if (document.pointerLockElement !== canvas) lockPointer();
});

playBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  lockPointer();
});

overlay.addEventListener("click", () => {
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

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    player.keys.clear();
    miningHeld = false;
    mineKey = null;
    mineProgress = 0;
    updateMineBar();
  }
  // 未锁定鼠标（菜单 / 合成面板）时暂停世界，锁定后恢复
  paused = !locked;
  // 打开合成面板时释放鼠标，此时不要弹出开始菜单
  overlay.classList.toggle("hidden", locked || craftingOpen);
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) {
    player.handleMouseMove(e.movementX || 0, e.movementY || 0);
  }
});

document.addEventListener("keydown", (e) => {
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

let hurtFlashTimer = null;
function flashHurt() {
  hurtEl.classList.add("show");
  clearTimeout(hurtFlashTimer);
  hurtFlashTimer = setTimeout(() => hurtEl.classList.remove("show"), 130);
}

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

// 挖掘速度：匹配方块偏好工具时用工具速度，否则徒手
function miningSpeedFor(blockId) {
  const t = heldTool();
  if (t && t.type === BLOCKS[blockId].tool) return t.speed;
  return 1;
}

// 工具能否使方块掉落（需要工具的方块必须用对类型）
function toolYields(blockId) {
  if (!BLOCKS[blockId].requiresTool) return true;
  const t = heldTool();
  return !!t && t.type === BLOCKS[blockId].tool;
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

// 完成一次挖掘：判定掉落 + 耐久
function finishMine(x, y, z) {
  const id = breakAt(x, y, z);
  if (id === null) return;
  if (toolYields(id)) {
    const drop = BLOCKS[id].drop === undefined ? id : BLOCKS[id].drop;
    if (drop !== null) {
      inventory.add(drop, 1);
      updateHotbar();
    }
  }
  if (!creative) consumeDurability();
}

// 创造 / 测试用：立即破坏并掉落入背包
function breakBlock() {
  const hit = world.raycast(player.eyePosition, player.getLookDirection(), 6);
  if (!hit) return null;
  const id = breakAt(hit.x, hit.y, hit.z);
  if (id === null) return null;
  if (!creative && toolYields(id)) {
    const drop = BLOCKS[id].drop === undefined ? id : BLOCKS[id].drop;
    if (drop !== null) {
      inventory.add(drop, 1);
      updateHotbar();
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
  if (!creative) {
    inventory.remove(blockId, 1);
    updateHotbar();
  }
}

const ATTACK_REACH = 3.5;

// 挥击准星内的怪物；命中返回 true（此时不挖掘方块）
function tryAttack() {
  const origin = player.eyePosition;
  const dir = player.getLookDirection();
  const mobHit = mobs.raycast(origin, dir, ATTACK_REACH);
  if (!mobHit) return false;

  // 被方块挡住则打不到
  const blockHit = world.raycast(origin, dir, ATTACK_REACH);
  if (blockHit) {
    const bc = new THREE.Vector3(blockHit.x + 0.5, blockHit.y + 0.5, blockHit.z + 0.5);
    if (origin.distanceTo(bc) < mobHit.distance) return false;
  }

  mobHit.mob.hurt(creative ? 1000 : 4);
  if (mobHit.mob.dead) mobs.remove(mobHit.mob);
  return true;
}

// ---------- 自适应 ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  if (!craftingOpen) {
    player.update(dt);
    mobs.update(dt, player);
  }
  viewmodel.update(time);

  // 受伤 / 死亡反馈
  if (player.health < lastHealth) flashHurt();
  lastHealth = player.health;
  renderHealth();
  if (player.dead) {
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
      }
      if (id !== BEDROCK) {
        const speed = miningSpeedFor(id);
        const hardness = Math.max(0.05, BLOCKS[id].hardness);
        mineProgress += (dt * speed) / hardness;
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
  coordsEl.textContent = `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}`;
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
  lastHealth = player.health;
  renderHealth();

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
