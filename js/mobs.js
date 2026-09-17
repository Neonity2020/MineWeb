import * as THREE from "three";
import { AIR, WATER, RAW_PORK, RAW_CHICKEN, IRON_INGOT, BOSS_TROPHY, isSolid } from "./blocks.js?v=20260916y";
import { WORLD_SIZE, HEIGHT } from "./world.js?v=20260916y";

const GRAVITY = 26;
const MAX_FALL = 60;
const EPS = 1e-3;

// 怪物 / 猎物定义
const TYPES = {
  zombie: {
    name: "僵尸",
    hostile: true,
    model: "humanoid",
    health: 20,
    speed: 1.7,
    damage: 3,
    attackRange: 1.15,
    attackCooldown: 1.0,
    detectRange: 22,
    halfWidth: 0.3,
    height: 1.8,
    hitRadius: 0.7,
    headY: 1.6,
    headR: 0.3,
    hop: false,
    jumpSpeed: 7.6,
    skin: "#5c9c48",
    eye: "#101c0e",
    shirt: "#3c5a86",
    pants: "#2c3550",
  },
  slime: {
    name: "史莱姆",
    hostile: true,
    model: "slime",
    health: 12,
    speed: 2.1,
    damage: 2,
    attackRange: 1.1,
    attackCooldown: 1.2,
    detectRange: 20,
    halfWidth: 0.4,
    height: 0.8,
    hitRadius: 0.6,
    headY: 0.6,
    headR: 0.3,
    hop: true,
    jumpSpeed: 6.4,
    skin: "#6fbf4a",
    eye: "#14240f",
  },
  elite: {
    name: "精英僵尸",
    hostile: true,
    model: "humanoid",
    health: 40,
    speed: 1.9,
    damage: 5,
    attackRange: 1.3,
    attackCooldown: 0.85,
    detectRange: 26,
    halfWidth: 0.38,
    height: 2.25,
    hitRadius: 0.9,
    headY: 2.0,
    headR: 0.36,
    hop: false,
    jumpSpeed: 8.2,
    scale: 1.25,
    skin: "#3f7a34",
    eye: "#ff5a2a",
    shirt: "#27405f",
    pants: "#1c2236",
  },
  boss: {
    name: "凋灵魔王",
    hostile: true,
    model: "humanoid",
    boss: true,
    health: 260,
    speed: 2.0,
    damage: 7,
    attackRange: 2.6,
    attackCooldown: 1.1,
    detectRange: 48,
    halfWidth: 0.75,
    height: 4.3,
    hitRadius: 1.7,
    headY: 3.85,
    headR: 0.6,
    hop: false,
    jumpSpeed: 9.5,
    scale: 2.4,
    skin: "#5a3470",
    eye: "#ff2f1e",
    shirt: "#2a1636",
    pants: "#180e22",
    drops: [
      { id: BOSS_TROPHY, min: 1, max: 1 },
      { id: IRON_INGOT, min: 8, max: 14 },
    ],
  },
  pig: {
    name: "猪",
    hostile: false,
    model: "animal",
    health: 10,
    speed: 1.4,
    damage: 0,
    detectRange: 0,
    fleeRange: 7,
    halfWidth: 0.45,
    height: 0.95,
    hitRadius: 0.75,
    hop: false,
    jumpSpeed: 6.6,
    body: "#df9aa1",
    head: "#df9aa1",
    leg: "#cf8a91",
    snout: "#c0767f",
    eye: "#2a1416",
    bodyW: 0.9,
    bodyH: 0.55,
    bodyD: 0.62,
    legH: 0.34,
    headSize: 0.46,
    drops: [{ id: RAW_PORK, min: 1, max: 2 }],
  },
  chicken: {
    name: "鸡",
    hostile: false,
    model: "animal",
    health: 4,
    speed: 1.6,
    damage: 0,
    detectRange: 0,
    fleeRange: 8,
    halfWidth: 0.28,
    height: 0.62,
    hitRadius: 0.5,
    hop: false,
    jumpSpeed: 6.2,
    body: "#ececec",
    head: "#ececec",
    leg: "#e0a83a",
    beak: "#e0a83a",
    comb: "#cc3b3b",
    eye: "#1a1a1a",
    bodyW: 0.5,
    bodyH: 0.42,
    bodyD: 0.5,
    legH: 0.26,
    headSize: 0.3,
    drops: [{ id: RAW_CHICKEN, min: 1, max: 1 }],
  },
};

const HOSTILE_TYPES = ["zombie", "slime", "elite"];
const PREY_TYPES = ["pig", "chicken"];

// 阶梯式难度：达到 at（秒，实际游玩时间）后进入该阶段
export const STAGES = [
  { name: "和平", at: 0, types: [], cap: 0, interval: 0 },
  { name: "史莱姆", at: 120, types: ["slime"], cap: 3, interval: 12 },
  { name: "僵尸", at: 300, types: ["slime", "zombie"], cap: 6, interval: 8 },
  { name: "精英夜袭", at: 480, types: ["slime", "zombie", "elite"], cap: 10, interval: 5 },
];

export function stageIndexFor(t) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (t >= STAGES[i].at) idx = i;
  }
  return idx;
}

const _tmp = new THREE.Vector3();
const _ray = new THREE.Ray();
const _sphere = new THREE.Sphere();
const _center = new THREE.Vector3();
const _hit = new THREE.Vector3();

// 每种怪的脸部贴图只生成一次
const _faceCache = {};
function faceTexture(type) {
  if (_faceCache[type]) return _faceCache[type];
  const def = TYPES[type];
  const skin = def.skin || def.head || "#ffffff";
  const eye = def.eye || "#111111";
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, 13, 16, 3);
  ctx.fillStyle = eye;
  ctx.fillRect(3, 6, 3, 3);
  ctx.fillRect(10, 6, 3, 3);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(5, 12, 6, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  _faceCache[type] = tex;
  return tex;
}

export class Mob {
  constructor(world, type, position) {
    this.world = world;
    this.type = type;
    this.def = TYPES[type];
    this.name = this.def.name;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.onGround = false;
    this.chasing = false;
    this.health = this.def.health;
    this.dead = false;
    this.hurtTimer = 0;
    this.attackTimer = 0;
    this.hopTimer = 0;
    this.walkPhase = 0;
    this.wanderTimer = Math.random() * 3;
    this.wanderDir = null;
    this.hostile = !!this.def.hostile;
    this.hitRadius = this.def.hitRadius;
    this.height = this.def.height;
    this.halfWidth = this.def.halfWidth;
    this.headY = this.def.headY || 0;
    this.headR = this.def.headR || 0;
    this.isBoss = !!this.def.boss;
    this.enraged = false;
    this.speedMul = 1;
    this.damageMul = 1;
    this.summonTimer = 0;

    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.geometries = [];
    this.materials = [];
    this.limbs = {};
    this.bodyMesh = null;
    this._tinted = false;

    this.build();
    this.syncTransform();
  }

  mat(color, transparent = false) {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent,
      opacity: transparent ? 0.85 : 1,
    });
    this.materials.push(m);
    return m;
  }

  addBox(w, h, d, mat, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.geometries.push(geo);
    return mesh;
  }

  // 以顶部为轴心的肢体，方便摆动
  makeLimb(w, h, d, mat, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -h / 2, 0);
    mesh.frustumCulled = false;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(mesh);
    this.group.add(pivot);
    this.geometries.push(geo);
    return pivot;
  }

  build() {
    if (this.def.model === "slime") this.buildSlime();
    else if (this.def.model === "animal") this.buildAnimal();
    else this.buildZombie();
    if (this.def.scale) this.group.scale.setScalar(this.def.scale);
    this.baseColors = this.materials.map((m) => m.color.clone());
  }

  buildZombie() {
    const d = this.def;
    const skinMat = this.mat(d.skin);
    const shirtMat = this.mat(d.shirt);
    const pantsMat = this.mat(d.pants);
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(this.type) });
    this.materials.push(faceMat);

    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const head = new THREE.Mesh(headGeo, [
      skinMat,
      skinMat,
      skinMat,
      skinMat,
      faceMat,
      skinMat,
    ]);
    head.position.set(0, 1.6, 0);
    head.frustumCulled = false;
    this.group.add(head);
    this.geometries.push(headGeo);

    this.addBox(0.5, 0.7, 0.26, shirtMat, 0, 1.0, 0);
    this.limbs.armL = this.makeLimb(0.22, 0.68, 0.22, skinMat, -0.36, 1.3, 0);
    this.limbs.armR = this.makeLimb(0.22, 0.68, 0.22, skinMat, 0.36, 1.3, 0);
    // 僵尸经典：双臂前伸
    this.limbs.armL.rotation.x = -1.35;
    this.limbs.armR.rotation.x = -1.35;
    this.limbs.legL = this.makeLimb(0.22, 0.65, 0.22, pantsMat, -0.13, 0.65, 0);
    this.limbs.legR = this.makeLimb(0.22, 0.65, 0.22, pantsMat, 0.13, 0.65, 0);
  }

  buildSlime() {
    const d = this.def;
    const plain = this.mat(d.skin, true);
    const faceMat = new THREE.MeshBasicMaterial({
      map: faceTexture(this.type),
      transparent: true,
      opacity: 0.9,
    });
    this.materials.push(faceMat);
    const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const mesh = new THREE.Mesh(geo, [
      plain,
      plain,
      plain,
      plain,
      faceMat,
      plain,
    ]);
    mesh.position.set(0, 0.4, 0);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.geometries.push(geo);
    this.bodyMesh = mesh;
  }

  // 四足猎物：身体 + 头 + 四条腿（可带猪鼻/鸡喙等特征）
  buildAnimal() {
    const d = this.def;
    const legH = d.legH;
    const bodyH = d.bodyH;
    const bodyD = d.bodyD;
    const bodyMat = this.mat(d.body);
    const headMat = this.mat(d.head);
    const legMat = this.mat(d.leg);
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(this.type) });
    this.materials.push(faceMat);

    // 身体
    const bodyY = legH + bodyH / 2;
    this.addBox(d.bodyW, bodyH, bodyD, bodyMat, 0, bodyY, 0);

    // 头（朝 +Z）
    const headSize = d.headSize;
    const headY = legH + bodyH * 0.72;
    const headZ = bodyD / 2 + headSize / 2 - 0.04;
    const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
    const head = new THREE.Mesh(headGeo, [
      headMat,
      headMat,
      headMat,
      headMat,
      faceMat,
      headMat,
    ]);
    head.position.set(0, headY, headZ);
    head.frustumCulled = false;
    this.group.add(head);
    this.geometries.push(headGeo);
    this.headMesh = head;

    // 特征
    if (d.snout) {
      const snoutMat = this.mat(d.snout);
      this.addBox(
        headSize * 0.5,
        headSize * 0.34,
        headSize * 0.22,
        snoutMat,
        0,
        headY - headSize * 0.1,
        headZ + headSize / 2
      );
    }
    if (d.beak) {
      const beakMat = this.mat(d.beak);
      this.addBox(
        headSize * 0.34,
        headSize * 0.26,
        headSize * 0.42,
        beakMat,
        0,
        headY - headSize * 0.15,
        headZ + headSize / 2
      );
    }
    if (d.comb) {
      const combMat = this.mat(d.comb);
      this.addBox(
        headSize * 0.16,
        headSize * 0.3,
        headSize * 0.5,
        combMat,
        0,
        headY + headSize * 0.6,
        headZ - headSize * 0.2
      );
    }

    // 四条腿
    const legW = Math.min(0.18, d.bodyW * 0.24);
    const legX = d.bodyW / 2 - legW / 2 - 0.02;
    const legZ = bodyD / 2 - legW / 2 - 0.02;
    this.limbs.legFL = this.makeLimb(legW, legH, legW, legMat, -legX, legH, legZ);
    this.limbs.legFR = this.makeLimb(legW, legH, legW, legMat, legX, legH, legZ);
    this.limbs.legBL = this.makeLimb(legW, legH, legW, legMat, -legX, legH, -legZ);
    this.limbs.legBR = this.makeLimb(legW, legH, legW, legMat, legX, legH, -legZ);
  }

  hurt(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.hurtTimer = 0.25;
    if (this.hostile) this.velocity.y = Math.max(this.velocity.y, 3);
    if (this.health <= 0) this.dead = true;
    return this.dead;
  }

  moveAxis(axis, delta) {
    if (delta === 0) return false;
    this.position[axis] += delta;

    const half = this.halfWidth;
    const minX = Math.floor(this.position.x - half);
    const maxX = Math.floor(this.position.x + half);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + this.height);
    const minZ = Math.floor(this.position.z - half);
    const maxZ = Math.floor(this.position.z + half);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!isSolid(this.world.getBlock(bx, by, bz))) continue;
          if (axis === "x") {
            this.position.x = delta > 0 ? bx - half - EPS : bx + 1 + half + EPS;
            this.velocity.x = 0;
          } else if (axis === "z") {
            this.position.z = delta > 0 ? bz - half - EPS : bz + 1 + half + EPS;
            this.velocity.z = 0;
          } else if (delta > 0) {
            this.position.y = by - this.height - EPS;
            this.velocity.y = 0;
          } else {
            this.position.y = by + 1 + EPS;
            this.velocity.y = 0;
            this.onGround = true;
          }
          return true;
        }
      }
    }
    return false;
  }

  update(dt, player) {
    if (this.dead) return;
    const def = this.def;
    const speed = def.speed * this.speedMul;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hopTimer = Math.max(0, this.hopTimer - dt);

    const dp = _tmp.subVectors(player.position, this.position);
    const distXZ = Math.hypot(dp.x, dp.z);

    let moving = false;
    if (this.hostile) {
      const chasing = distXZ < def.detectRange && !player.dead;
      this.chasing = chasing;
      if (chasing && distXZ > 0.001) {
        const nx = dp.x / distXZ;
        const nz = dp.z / distXZ;
        this.yaw = Math.atan2(nx, nz);
        if (def.hop) {
          if (this.onGround && this.hopTimer <= 0) {
            this.velocity.y = def.jumpSpeed;
            this.velocity.x = nx * speed;
            this.velocity.z = nz * speed;
            this.hopTimer = 0.9;
            this.onGround = false;
          } else if (this.onGround) {
            const damp = Math.max(0, 1 - 10 * dt);
            this.velocity.x *= damp;
            this.velocity.z *= damp;
          }
          moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.1;
        } else {
          this.velocity.x = nx * speed;
          this.velocity.z = nz * speed;
          moving = true;
        }
      } else {
        const damp = Math.max(0, 1 - 8 * dt);
        this.velocity.x *= damp;
        this.velocity.z *= damp;
        moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.15;
      }
    } else {
      // 猎物：受伤或玩家靠得太近就逃跑，否则随机游荡
      this.chasing = false;
      const fleeing = (this.hurtTimer > 0 || distXZ < def.fleeRange) && distXZ > 0.001;
      if (fleeing) {
        const nx = -dp.x / distXZ;
        const nz = -dp.z / distXZ;
        this.yaw = Math.atan2(nx, nz);
        this.velocity.x = nx * def.speed;
        this.velocity.z = nz * def.speed;
        moving = true;
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 4;
          this.wanderDir = Math.random() < 0.45 ? null : Math.random() * Math.PI * 2;
        }
        if (this.wanderDir !== null) {
          const nx = Math.sin(this.wanderDir);
          const nz = Math.cos(this.wanderDir);
          this.yaw = Math.atan2(nx, nz);
          const sp = speed * 0.45;
          this.velocity.x = nx * sp;
          this.velocity.z = nz * sp;
          moving = true;
        } else {
          const damp = Math.max(0, 1 - 8 * dt);
          this.velocity.x *= damp;
          this.velocity.z *= damp;
          moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.1;
        }
      }
    }

    // 水中有浮力，避免沉底
    const inWater =
      this.world.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y + 0.2),
        Math.floor(this.position.z)
      ) === WATER;
    if (inWater) {
      this.velocity.y = Math.min(this.velocity.y + 22 * dt, 1.5);
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;
    }

    this.onGround = false;
    const hitX = this.moveAxis("x", this.velocity.x * dt);
    const hitZ = this.moveAxis("z", this.velocity.z * dt);
    this.moveAxis("y", this.velocity.y * dt);
    if (!def.hop && this.onGround && (hitX || hitZ)) this.velocity.y = def.jumpSpeed;

    this.walkPhase += (moving ? speed : 0) * dt * 5;
    this.animate(dt, moving);
    this.syncTransform();

    // 接触玩家造成伤害
    if (this.chasing && this.attackTimer <= 0 && !player.dead) {
      const vertOverlap =
        player.position.y < this.position.y + this.height &&
        player.position.y + 1.8 > this.position.y;
      if (distXZ < def.attackRange && vertOverlap) {
        this.attackTimer = def.attackCooldown;
        player.damage(def.damage * this.damageMul);
        const kl = distXZ || 1;
        player.velocity.x += (dp.x / kl) * 3.5;
        player.velocity.z += (dp.z / kl) * 3.5;
        player.velocity.y = Math.max(player.velocity.y, 3.2);
      }
    }
  }

  animate(dt, moving) {
    if (this._tinted !== this.hurtTimer > 0) {
      this._tinted = this.hurtTimer > 0;
      for (let i = 0; i < this.materials.length; i++) {
        if (this._tinted) this.materials[i].color.setRGB(1, 0.35, 0.35);
        else this.materials[i].color.copy(this.baseColors[i]);
      }
    }

    if (this.def.hop) {
      if (this.bodyMesh) {
        const targetY = this.onGround ? 0.82 : 1.06;
        const targetXZ = this.onGround ? 1.08 : 0.97;
        const t = Math.min(1, dt * 12);
        this.bodyMesh.scale.y += (targetY - this.bodyMesh.scale.y) * t;
        this.bodyMesh.scale.x += (targetXZ - this.bodyMesh.scale.x) * t;
        this.bodyMesh.scale.z += (targetXZ - this.bodyMesh.scale.z) * t;
      }
      return;
    }

    const s = moving ? Math.sin(this.walkPhase) : 0;
    if (this.limbs.legL) this.limbs.legL.rotation.x = s * 0.55;
    if (this.limbs.legR) this.limbs.legR.rotation.x = -s * 0.55;
    // 四足动物：对角步态
    if (this.limbs.legFL) {
      this.limbs.legFL.rotation.x = s * 0.5;
      this.limbs.legBR.rotation.x = s * 0.5;
      this.limbs.legFR.rotation.x = -s * 0.5;
      this.limbs.legBL.rotation.x = -s * 0.5;
    }
  }

  syncTransform() {
    this.group.position.set(this.position.x, this.position.y, this.position.z);
    this.group.rotation.y = this.yaw;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries = [];
    this.materials = [];
  }
}

export class MobManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.mobs = [];
    this.playTime = 0;
    this.stageIndex = 0;
    this.spawnTimer = 0;
    this.preyTimer = 4;
    this.maxPrey = 6;
    this.onStageChange = null;
    this.onDeath = null;
    this.enabled = true;
    // BOSS 战
    this.arena = null;
    this.boss = null;
    this.bossDefeated = false;
    this.onBossSpawn = null;
    this.onBossEnrage = null;
    this.onBossDefeated = null;
    this.onBossReset = null;
  }

  // 由主循环注入 BOSS 领域坐标（来自 world.js 的 BOSS_ARENA）
  setArena(arena) {
    this.arena = arena;
  }

  get currentStage() {
    return STAGES[this.stageIndex];
  }

  get nextStage() {
    return this.stageIndex + 1 < STAGES.length ? STAGES[this.stageIndex + 1] : null;
  }

  countHostile() {
    let n = 0;
    for (const m of this.mobs) if (m.hostile && !m.isBoss) n++;
    return n;
  }

  countPrey() {
    let n = 0;
    for (const m of this.mobs) if (!m.hostile) n++;
    return n;
  }

  // 读档：不触发阶段播报
  loadProgress(playTime) {
    this.playTime = Math.max(0, playTime || 0);
    this.stageIndex = stageIndexFor(this.playTime);
    this.spawnTimer = 2;
  }

  clear() {
    this.boss = null;
    while (this.mobs.length > 0) this.remove(this.mobs[0]);
  }

  remove(mob) {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
    this.scene.remove(mob.group);
    mob.dispose();
  }

  // 击杀：结算掉落后再移除
  kill(mob) {
    if (this.mobs.indexOf(mob) < 0) return;
    if (this.onDeath) this.onDeath(mob);
    this.remove(mob);
  }

  // 尝试在玩家周围 [minDist, maxDist] 的环形地带生成指定类型之一
  _spawnAt(around, minDist, maxDist, types) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      const x = Math.floor(around.position.x + Math.cos(ang) * dist);
      const z = Math.floor(around.position.z + Math.sin(ang) * dist);
      if (x < 4 || z < 4 || x >= WORLD_SIZE - 4 || z >= WORLD_SIZE - 4) continue;
      const y = this.world.surfaceHeight(x, z);
      if (y < 2 || y >= HEIGHT - 3) continue;
      if (!isSolid(this.world.getBlock(x, y - 1, z))) continue;
      if (this.world.getBlock(x, y, z) !== AIR) continue;
      if (this.world.getBlock(x, y + 1, z) !== AIR) continue;

      const type = types[Math.floor(Math.random() * types.length)];
      const mob = new Mob(this.world, type, new THREE.Vector3(x + 0.5, y, z + 0.5));
      this.mobs.push(mob);
      this.scene.add(mob.group);
      return mob;
    }
    return null;
  }

  spawn(player) {
    const stage = this.currentStage;
    if (!stage.types.length) return null;
    return this._spawnAt(player, 14, 28, stage.types);
  }

  spawnPrey(player) {
    return this._spawnAt(player, 16, 34, PREY_TYPES);
  }

  // BOSS：在祭坛中央生成（由玩家进入领域触发）
  spawnBoss(x, y, z) {
    const mob = new Mob(this.world, "boss", new THREE.Vector3(x, y, z));
    mob.summonTimer = 9;
    this.boss = mob;
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }

  // BOSS 战状态机：进入领域唤醒、离场脱战、半血狂暴、周期召唤爪牙
  updateBoss(dt, player) {
    const a = this.arena;
    if (!a || this.bossDefeated) return;

    const dx = player.position.x - a.x;
    const dz = player.position.z - a.z;
    const dist2 = dx * dx + dz * dz;
    const boss = this.boss;

    if (!boss) {
      const tr = a.triggerRadius;
      if (!player.dead && dist2 <= tr * tr) {
        const spawned = this.spawnBoss(a.x + 0.5, a.floorY + 1, a.z + 0.5);
        if (this.onBossSpawn) this.onBossSpawn(spawned);
      }
      return;
    }

    // 脱战：玩家远离领域则 BOSS 回巢（重置为满血）
    const leave = a.triggerRadius + 20;
    if (dist2 > leave * leave) {
      this.remove(boss);
      this.boss = null;
      if (this.onBossReset) this.onBossReset();
      return;
    }

    // 半血狂暴：提速增伤
    if (!boss.enraged && boss.health <= boss.def.health * 0.5) {
      boss.enraged = true;
      boss.speedMul = 1.35;
      boss.damageMul = 1.5;
      if (this.onBossEnrage) this.onBossEnrage(boss);
    }

    // 周期召唤爪牙
    boss.summonTimer -= dt;
    if (boss.summonTimer <= 0) {
      boss.summonTimer = boss.enraged ? 8 : 12;
      const types = this.stageIndex >= 3 ? ["zombie", "elite", "slime"] : ["zombie", "slime"];
      const n = boss.enraged ? 4 : 3;
      for (let i = 0; i < n; i++) this._spawnAt({ position: boss.position }, 4, 11, types);
    }
  }

  // /命令用：无视阶段与上限，直接拉一大波怪（距离更远，留出反应时间）
  spawnWave(player, count = 20) {
    const types = this.currentStage.types.length ? this.currentStage.types : HOSTILE_TYPES;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (this._spawnAt(player, 24, 38, types)) n++;
    }
    return n;
  }

  update(dt, player) {
    this.playTime += dt;

    const idx = stageIndexFor(this.playTime);
    if (idx !== this.stageIndex) {
      this.stageIndex = idx;
      this.spawnTimer = 2;
      if (this.onStageChange) this.onStageChange(STAGES[idx], idx);
    }

    const stage = STAGES[this.stageIndex];
    if (this.enabled && stage.interval > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = stage.interval;
        if (this.countHostile() < stage.cap) this.spawn(player);
      }
    }

    // 猎物独立刷新，不受威胁阶段影响
    if (this.enabled) {
      this.preyTimer -= dt;
      if (this.preyTimer <= 0) {
        this.preyTimer = 8 + Math.random() * 6;
        if (this.countPrey() < this.maxPrey) this.spawnPrey(player);
      }
    }

    // BOSS 领域：唤醒 / 脱战 / 狂暴 / 召唤
    this.updateBoss(dt, player);

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.update(dt, player);
      if (mob.dead) {
        const isBoss = mob === this.boss;
        if (isBoss) {
          this.boss = null;
          this.bossDefeated = true;
        }
        this.kill(mob);
        if (isBoss && this.onBossDefeated) this.onBossDefeated(mob);
        continue;
      }
      if (mob === this.boss) continue; // BOSS 固守祭坛，不随距离消失
      const dx = mob.position.x - player.position.x;
      const dz = mob.position.z - player.position.z;
      if (dx * dx + dz * dz > 72 * 72) this.remove(mob);
    }
  }

  // 从视线方向选出最近被击中的怪物（需与方块遮挡配合判断）
  raycast(origin, dir, maxDist) {
    _ray.set(origin, dir);
    let best = null;
    let bestT = maxDist;
    for (const mob of this.mobs) {
      _center.set(
        mob.position.x,
        mob.position.y + mob.height * 0.5,
        mob.position.z
      );
      _sphere.center.copy(_center);
      _sphere.radius = mob.hitRadius;
      const p = _ray.intersectSphere(_sphere, _hit);
      if (!p) continue;
      const t = origin.distanceTo(p);
      if (t <= bestT) {
        bestT = t;
        best = mob;
      }
    }
    if (!best) return null;

    // 爆头判定：射线是否穿过头部判定球
    let headshot = false;
    if (best.headR > 0) {
      _center.set(best.position.x, best.position.y + best.headY, best.position.z);
      _sphere.center.copy(_center);
      _sphere.radius = best.headR;
      headshot = _ray.intersectSphere(_sphere, _hit) !== null;
    }
    return { mob: best, distance: bestT, headshot };
  }
}
