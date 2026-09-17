import * as THREE from "three";
import { isSolid, WATER } from "./blocks.js?v=20260916y";

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 6.8;
const GRAVITY = 30;
const JUMP_SPEED = 8.8;
const TERMINAL_VELOCITY = 60;
const AIR_ACCEL = 14;
const EPS = 1e-3;

// 游泳
const SWIM_SPEED = 3.1;
const SWIM_ACCEL = 20;
const WATER_DRAG = 5;
const GRAVITY_WATER = 4;
const SINK_SPEED = 1.4;
const SWIM_UP_ACCEL = 20;
const SWIM_UP_SPEED = 3.6;
const SWIM_DOWN_ACCEL = 20;
const SWIM_DOWN_SPEED = 4.5;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.keys = new Set();
    this.sensitivity = 0.0022;
    this.maxHealth = 20;
    this.health = 20;
    this.hurtTimer = 0;
    this.regenTimer = 0;
    this.dead = false;
    this.spawnPoint = new THREE.Vector3(0, 40, 0);
    this.maxHunger = 20;
    this.hunger = 20;
    this.hungerTimer = 0;
    this.exhaustion = 0;
    this.starveTimer = 0;
    this.armorPoints = 0;
    this.armorFull = false;
  }

  spawn(x, z) {
    this.position.set(x + 0.5, this.world.surfaceHeight(x, z) + 0.2, z + 0.5);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI * 0.25;
    this.pitch = -0.15;
    this.spawnPoint.copy(this.position);
    this.health = this.maxHealth;
    this.dead = false;
    this.hurtTimer = 0;
    this.regenTimer = 0;
    this.hunger = this.maxHunger;
    this.hungerTimer = 0;
    this.exhaustion = 0;
    this.starveTimer = 0;
  }

  damage(n) {
    if (this.dead || n <= 0) return;
    // 护甲减伤：每点护甲 4%，上限 80%（穿齐凋零套装提升到 85%）
    if (this.armorPoints > 0) {
      const cap = this.armorFull ? 0.85 : 0.8;
      const reduce = Math.min(cap, this.armorPoints * 0.04);
      n = n * (1 - reduce);
    }
    this.health = Math.max(0, this.health - n);
    this.hurtTimer = 0.4;
    this.regenTimer = 0;
    this.addExhaustion(0.2);
    if (this.health <= 0) this.dead = true;
  }

  respawn() {
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.dead = false;
    this.hurtTimer = 0;
    this.regenTimer = 0;
    this.hunger = Math.max(this.hunger, this.maxHunger * 0.5);
    this.starveTimer = 0;
    this.onGround = false;
  }

  // 消耗度累积：每满 4 点扣 1 点饥饿
  addExhaustion(amount) {
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.hunger > 0) this.hunger -= 1;
    }
  }

  eat(restore) {
    this.hunger = Math.min(this.maxHunger, this.hunger + restore);
    this.regenTimer = 0;
  }

  handleMouseMove(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  getLookDirection() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  // 玩家碰撞箱是否浸入水中
  isInWater() {
    const p = this.position;
    const minX = Math.floor(p.x - HALF_WIDTH);
    const maxX = Math.floor(p.x + HALF_WIDTH);
    const minY = Math.floor(p.y + 0.1);
    const maxY = Math.floor(p.y + HEIGHT - 0.1);
    const minZ = Math.floor(p.z - HALF_WIDTH);
    const maxZ = Math.floor(p.z + HALF_WIDTH);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (this.world.getBlock(bx, by, bz) === WATER) return true;
        }
      }
    }
    return false;
  }

  // 眼睛是否在水下（用于水下滤镜）
  isEyeInWater() {
    const e = this.eyePosition;
    return this.world.getBlock(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)) === WATER;
  }

  update(dt) {
    const keys = this.keys;
    const forwardInput = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const strafeInput = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const space = keys.has("Space");
    const inWater = this.isInWater();
    this.inWater = inWater;

    let fwdX = 0;
    let fwdZ = 0;
    let rightX = 0;
    let rightZ = 0;
    if (forwardInput || strafeInput) {
      fwdX = -Math.sin(this.yaw);
      fwdZ = -Math.cos(this.yaw);
      rightX = Math.cos(this.yaw);
      rightZ = -Math.sin(this.yaw);
    }

    let wishX = fwdX * forwardInput + rightX * strafeInput;
    let wishZ = fwdZ * forwardInput + rightZ * strafeInput;
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) {
      wishX /= len;
      wishZ /= len;
    }

    // ---------- 水平移动 ----------
    if (inWater) {
      if (len > 0) {
        this.velocity.x += wishX * SWIM_ACCEL * dt;
        this.velocity.z += wishZ * SWIM_ACCEL * dt;
      } else {
        const damp = Math.max(0, 1 - WATER_DRAG * dt);
        this.velocity.x *= damp;
        this.velocity.z *= damp;
      }
      const hs = Math.hypot(this.velocity.x, this.velocity.z);
      if (hs > SWIM_SPEED) {
        this.velocity.x = (this.velocity.x / hs) * SWIM_SPEED;
        this.velocity.z = (this.velocity.z / hs) * SWIM_SPEED;
      }
    } else {
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      if (this.onGround) {
        this.velocity.x = wishX * speed;
        this.velocity.z = wishZ * speed;
      } else {
        this.velocity.x += wishX * AIR_ACCEL * dt;
        this.velocity.z += wishZ * AIR_ACCEL * dt;
        const hs = Math.hypot(this.velocity.x, this.velocity.z);
        if (hs > speed) {
          this.velocity.x = (this.velocity.x / hs) * speed;
          this.velocity.z = (this.velocity.z / hs) * speed;
        }
      }
    }

    // ---------- 竖直移动 / 游泳 ----------
    if (inWater) {
      const headBlock = this.world.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y + HEIGHT),
        Math.floor(this.position.z)
      );
      const headFree = headBlock !== WATER;
      if (space) {
        if (headFree) {
          // 头已出水：蹬水上岸/破水而出
          this.velocity.y = Math.max(this.velocity.y, JUMP_SPEED * 0.8);
        } else {
          this.velocity.y = Math.min(this.velocity.y + SWIM_UP_ACCEL * dt, SWIM_UP_SPEED);
        }
      } else if (sprinting) {
        // Shift 下潜
        this.velocity.y = Math.max(this.velocity.y - SWIM_DOWN_ACCEL * dt, -SWIM_DOWN_SPEED);
      } else {
        // 缓慢下沉
        this.velocity.y -= GRAVITY_WATER * dt;
        if (this.velocity.y < -SINK_SPEED) this.velocity.y = -SINK_SPEED;
      }
    } else {
      if (space && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.addExhaustion(0.2);
      }
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY;
    }

    this.onGround = false;
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    this.moveAxis("y", this.velocity.y * dt);

    this.eyeInWater = this.isEyeInWater();
    this.updateCamera();

    // ---------- 饥饿与生命 ----------
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (sprinting && this.onGround && len > 0) this.addExhaustion(dt * 0.8);

    // 自然消耗：约每 25 秒 1 点
    this.hungerTimer += dt;
    if (this.hungerTimer >= 25) {
      this.hungerTimer = 0;
      if (this.hunger > 0) this.hunger -= 1;
    }

    if (!this.dead) {
      if (this.hunger > 6) {
        // 有饱食度时缓慢回血
        if (this.hurtTimer <= 0 && this.health < this.maxHealth) {
          this.regenTimer += dt;
          if (this.regenTimer >= 4) {
            this.regenTimer = 0;
            this.health += 1;
            this.addExhaustion(3);
          }
        } else {
          this.regenTimer = 0;
        }
        this.starveTimer = 0;
      } else if (this.hunger <= 0) {
        // 饥饿归零开始掉血
        this.regenTimer = 0;
        this.starveTimer += dt;
        if (this.starveTimer >= 4) {
          this.starveTimer = 0;
          this.damage(1);
        }
      } else {
        this.regenTimer = 0;
        this.starveTimer = 0;
      }
    }
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    this.position[axis] += delta;

    const minX = Math.floor(this.position.x - HALF_WIDTH);
    const maxX = Math.floor(this.position.x + HALF_WIDTH);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + HEIGHT);
    const minZ = Math.floor(this.position.z - HALF_WIDTH);
    const maxZ = Math.floor(this.position.z + HALF_WIDTH);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (!isSolid(this.world.getBlock(bx, by, bz))) continue;

          if (axis === "x") {
            this.position.x = delta > 0 ? bx - HALF_WIDTH - EPS : bx + 1 + HALF_WIDTH + EPS;
            this.velocity.x = 0;
          } else if (axis === "z") {
            this.position.z = delta > 0 ? bz - HALF_WIDTH - EPS : bz + 1 + HALF_WIDTH + EPS;
            this.velocity.z = 0;
          } else {
            if (delta > 0) {
              this.position.y = by - HEIGHT - EPS;
              this.velocity.y = 0;
            } else {
              this.position.y = by + 1 + EPS;
              this.velocity.y = 0;
              this.onGround = true;
            }
          }
          return;
        }
      }
    }
  }

  updateCamera() {
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}
