import * as THREE from "three";
import { AIR, WATER, isSolid } from "./blocks.js";
import { WORLD_SIZE, HEIGHT } from "./world.js";

const GRAVITY = 26;
const MAX_FALL = 60;
const EPS = 1e-3;

// 怪物定义
const TYPES = {
  zombie: {
    name: "僵尸",
    health: 20,
    speed: 1.7,
    damage: 3,
    attackRange: 1.15,
    attackCooldown: 1.0,
    detectRange: 22,
    halfWidth: 0.3,
    height: 1.8,
    hitRadius: 0.7,
    hop: false,
    jumpSpeed: 7.6,
    skin: "#5c9c48",
    eye: "#101c0e",
    shirt: "#3c5a86",
    pants: "#2c3550",
  },
  slime: {
    name: "史莱姆",
    health: 12,
    speed: 2.1,
    damage: 2,
    attackRange: 1.1,
    attackCooldown: 1.2,
    detectRange: 20,
    halfWidth: 0.4,
    height: 0.8,
    hitRadius: 0.6,
    hop: true,
    jumpSpeed: 6.4,
    skin: "#6fbf4a",
    eye: "#14240f",
  },
};

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
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = def.skin;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, 13, 16, 3);
  ctx.fillStyle = def.eye;
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
    this.hitRadius = this.def.hitRadius;
    this.height = this.def.height;
    this.halfWidth = this.def.halfWidth;

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
    if (this.type === "slime") this.buildSlime();
    else this.buildZombie();
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

  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtTimer = 0.25;
    this.velocity.y = Math.max(this.velocity.y, 3);
    if (this.health <= 0) this.dead = true;
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
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hopTimer = Math.max(0, this.hopTimer - dt);

    const dp = _tmp.subVectors(player.position, this.position);
    const distXZ = Math.hypot(dp.x, dp.z);
    const chasing = distXZ < def.detectRange && !player.dead;
    this.chasing = chasing;

    let moving = false;
    if (chasing && distXZ > 0.001) {
      const nx = dp.x / distXZ;
      const nz = dp.z / distXZ;
      this.yaw = Math.atan2(nx, nz);
      if (def.hop) {
        if (this.onGround && this.hopTimer <= 0) {
          this.velocity.y = def.jumpSpeed;
          this.velocity.x = nx * def.speed;
          this.velocity.z = nz * def.speed;
          this.hopTimer = 0.9;
          this.onGround = false;
        } else if (this.onGround) {
          const damp = Math.max(0, 1 - 10 * dt);
          this.velocity.x *= damp;
          this.velocity.z *= damp;
        }
        moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.1;
      } else {
        this.velocity.x = nx * def.speed;
        this.velocity.z = nz * def.speed;
        moving = true;
      }
    } else {
      const damp = Math.max(0, 1 - 8 * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
      moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.15;
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

    this.walkPhase += (moving ? def.speed : 0) * dt * 5;
    this.animate(dt, moving);
    this.syncTransform();

    // 接触玩家造成伤害
    if (chasing && this.attackTimer <= 0 && !player.dead) {
      const vertOverlap =
        player.position.y < this.position.y + this.height &&
        player.position.y + 1.8 > this.position.y;
      if (distXZ < def.attackRange && vertOverlap) {
        this.attackTimer = def.attackCooldown;
        player.damage(def.damage);
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
    this.spawnTimer = 4;
    this.maxMobs = 12;
    this.enabled = true;
  }

  clear() {
    while (this.mobs.length > 0) this.remove(this.mobs[0]);
  }

  remove(mob) {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
    this.scene.remove(mob.group);
    mob.dispose();
  }

  spawn(player) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 14;
      const x = Math.floor(player.position.x + Math.cos(ang) * dist);
      const z = Math.floor(player.position.z + Math.sin(ang) * dist);
      if (x < 4 || z < 4 || x >= WORLD_SIZE - 4 || z >= WORLD_SIZE - 4) continue;
      const y = this.world.surfaceHeight(x, z);
      if (y < 2 || y >= HEIGHT - 3) continue;
      if (!isSolid(this.world.getBlock(x, y - 1, z))) continue;
      if (this.world.getBlock(x, y, z) !== AIR) continue;
      if (this.world.getBlock(x, y + 1, z) !== AIR) continue;

      const type = Math.random() < 0.62 ? "zombie" : "slime";
      const mob = new Mob(this.world, type, new THREE.Vector3(x + 0.5, y, z + 0.5));
      this.mobs.push(mob);
      this.scene.add(mob.group);
      return mob;
    }
    return null;
  }

  update(dt, player) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3 + Math.random() * 3;
      if (this.enabled && this.mobs.length < this.maxMobs) this.spawn(player);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.update(dt, player);
      if (mob.dead) {
        this.remove(mob);
        continue;
      }
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
    return best ? { mob: best, distance: bestT } : null;
  }
}
