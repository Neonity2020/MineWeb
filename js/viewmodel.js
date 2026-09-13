import * as THREE from "three";
import { BLOCKS, TILE_COUNT, TILE } from "./blocks.js";
import { buildAtlasCanvas } from "./textures.js";

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
  constructor(camera) {
    this.camera = camera;
    this.atlas = buildAtlasCanvas();
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    camera.add(this.group);

    // 手臂：上臂
    const armGeo = new THREE.BoxGeometry(0.14, 0.14, 0.45);
    const armMat = new THREE.MeshBasicMaterial({ color: 0xb58a63 });
    this.arm = new THREE.Mesh(armGeo, armMat);
    this.arm.position.set(0.30, -0.33, -0.45);
    this.arm.rotation.y = 0.25;
    this.arm.rotation.x = 0.05;
    this.arm.frustumCulled = false;
    this.group.add(this.arm);

    // 手：拳头
    const handGeo = new THREE.BoxGeometry(0.14, 0.14, 0.18);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xc08a5a });
    this.hand = new THREE.Mesh(handGeo, handMat);
    this.hand.position.set(0.35, -0.37, -0.72);
    this.hand.rotation.y = 0.25;
    this.hand.frustumCulled = false;
    this.group.add(this.hand);

    this.item = null;
    this.itemGeo = null;
    this.itemMat = null;
    this.shownId = null;
    this.lastSwitch = 0;
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
    let geo, mat;
    if (block.renderPass === "none") {
      // 工具：平面图标（tile 带透明）
      geo = new THREE.PlaneGeometry(0.55, 0.55);
      mat = new THREE.MeshBasicMaterial({
        map: texFromTile(this.atlas, tile),
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.item = new THREE.Mesh(geo, mat);
      this.item.position.set(0.34, -0.38, -0.9);
      this.item.rotation.y = -0.5;
      this.item.rotation.x = -0.15;
    } else {
      // 方块：盒体
      geo = tileBoxGeometry(0.36, tile);
      mat = new THREE.MeshBasicMaterial({
        map: texFromTile(this.atlas, tile),
        transparent: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
      });
      this.item = new THREE.Mesh(geo, mat);
      this.item.position.set(0.34, -0.36, -0.93);
      this.item.rotation.y = 0.35;
      this.item.rotation.x = -0.25;
    }
    this.item.frustumCulled = false;
    this.itemGeo = geo;
    this.itemMat = mat;
    this.group.add(this.item);
    this.lastSwitch = now;
  }

  update(time) {
    const bob = Math.sin(time * 5.5) * 0.018;
    this.arm.position.y = -0.33 + bob;
    this.hand.position.y = -0.37 + bob;
    if (this.item) {
      const since = time - this.lastSwitch;
      const popIn = since < 0.12 ? 0.6 + (since / 0.12) * 0.4 : 1;
      this.item.scale.setScalar(popIn);
      this.item.position.y = -0.36 + Math.sin(time * 1.4) * 0.01;
    }
  }
}
