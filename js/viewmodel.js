import * as THREE from "three";
import { BLOCKS, TILE_COUNT, TILE } from "./blocks.js?v=20260916y";
import { buildAtlasCanvas } from "./textures.js?v=20260916y";

function texFromTile(atlas, tile, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, tile * 16, 0, 16, 16, 0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// 盒子几何：所有面 UV 都指向指定 tile
function tileBoxGeometry(size, tile) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const u0 = tile / TILE_COUNT;
  const v0 = 1 - 1 / TILE_COUNT;
  const u1 = (tile + 1) / TILE_COUNT;
  const v1 = 1;
  const attr = geo.getAttribute("uv");
  for (let k = 0; k < attr.count; k++) {
    attr.setXY(k, u0 + attr.getX(k) * (u1 - u0), v0 + attr.getY(k) * (v1 - v0));
  }
  attr.needsUpdate = true;
  return geo;
}

export class ViewModel {
  constructor() {
    this.atlas = buildAtlasCanvas();
    this.group = new THREE.Group();
    this.group.frustumCulled = false;

    // 手臂：上臂（从屏幕右下角伸入）
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 0.34);
    const armMat = new THREE.MeshBasicMaterial({ color: 0xb58a63 });
    this.arm = new THREE.Mesh(armGeo, armMat);
    this.arm.position.set(0.44, -0.30, -0.44);
    this.arm.rotation.y = 0.35;
    this.arm.rotation.x = 0.2;
    this.arm.frustumCulled = false;
    this.group.add(this.arm);

    // 手：拳头
    const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.15);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xc08a5a });
    this.hand = new THREE.Mesh(handGeo, handMat);
    this.hand.position.set(0.44, -0.19, -0.70);
    this.hand.rotation.y = 0.3;
    this.hand.frustumCulled = false;
    this.group.add(this.hand);

    this.item = null;
    this.itemGeo = null;
    this.itemMat = null;
    this.shownId = null;
    this.lastSwitch = 0;
    this.recoil = 0;
    this.swing = 0;
    this.itemIsTool = false;
    this._lastTime = 0;
  }

  // 开火后坐力
  kick(amount = 0.16) {
    this.recoil = Math.max(this.recoil, amount);
  }

  showItem(id, now = performance.now() / 1000) {
    if (id === this.shownId) return;
    this.shownId = id;

    // 释放旧的
    if (this.item) {
      this.group.remove(this.item);
      this.itemGeo.dispose();
      if (this.itemMat.map) this.itemMat.map.dispose();
      this.itemMat.dispose();
      this.item = null;
      this.itemGeo = null;
      this.itemMat = null;
    }

    const block = BLOCKS[id];
    if (!block || id === 0) return;

    const tile = block.textures[0];
    const isTool = block.renderPass === "none";
    this.itemIsTool = isTool;
    let geo, mat;
    if (isTool) {
      // 工具 / 物品：平面图标（tile 带透明）
      geo = new THREE.PlaneGeometry(0.46, 0.46);
      mat = new THREE.MeshBasicMaterial({
        map: texFromTile(this.atlas, tile),
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.item = new THREE.Mesh(geo, mat);
      this.itemBaseY = -0.13;
      this.itemBaseZ = -0.82;
      this.itemBaseRX = -0.15;
      this.item.position.set(0.40, this.itemBaseY, this.itemBaseZ);
      this.item.rotation.y = -0.5;
      this.item.rotation.x = this.itemBaseRX;
    } else {
      // 方块：盒体
      geo = tileBoxGeometry(0.30, tile);
      mat = new THREE.MeshBasicMaterial({
        map: texFromTile(this.atlas, tile),
        transparent: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
      });
      this.item = new THREE.Mesh(geo, mat);
      this.itemBaseY = -0.18;
      this.itemBaseZ = -0.86;
      this.itemBaseRX = -0.25;
      this.item.position.set(0.40, this.itemBaseY, this.itemBaseZ);
      this.item.rotation.y = 0.35;
      this.item.rotation.x = this.itemBaseRX;
    }
    this.item.frustumCulled = false;
    this.itemGeo = geo;
    this.itemMat = mat;
    this.group.add(this.item);
    this.lastSwitch = now;
  }

  update(time, mining = false) {
    const dt = Math.min(0.05, Math.max(0, time - this._lastTime));
    this._lastTime = time;
    this.recoil = Math.max(0, this.recoil - dt * 1.6);

    // 挥动：挖掘时循环挥动；松开后完成当前这一次收招
    if (mining) {
      this.swing += dt * 3.4;
      if (this.swing >= 2) this.swing -= 2;
      if (this.swing <= 0) this.swing = 0.0001;
    } else if (this.swing > 0) {
      this.swing += dt * 6;
      if (this.swing >= 2) this.swing = 0;
    }
    let s = this.swing % 2;
    if (s > 1) s = 2 - s;
    const pose = this.swing > 0 ? Math.sin(s * Math.PI) : 0;

    const bob = Math.sin(time * 5.5) * 0.018;
    this.arm.position.y = -0.30 + bob;
    this.hand.position.y = -0.19 + bob;
    this.arm.rotation.x = 0.2 - 0.5 * pose;

    if (this.item) {
      const since = time - this.lastSwitch;
      const popIn = since < 0.12 ? 0.6 + (since / 0.12) * 0.4 : 1;
      this.item.scale.setScalar(popIn);
      this.item.position.y = this.itemBaseY + Math.sin(time * 1.4) * 0.01 - 0.06 * pose;
      this.item.position.z = this.itemBaseZ + 0.10 * pose;
      this.item.rotation.x = this.itemBaseRX - 1.15 * pose;
    }

    // 后坐力：整组向后上抬
    this.group.position.z = this.recoil * 0.5;
    this.group.rotation.x = this.recoil * 1.1;
  }
}
