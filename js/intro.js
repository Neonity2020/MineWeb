import * as THREE from "three";
import { sfx } from "./audio.js?v=20260915c";

export class IntroCinematic {
  constructor({ camera, world, player, viewmodel, renderer, canvas, onFinish, toast }) {
    this.camera = camera;
    this.world = world;
    this.player = player;
    this.viewmodel = viewmodel;
    this.renderer = renderer;
    this.canvas = canvas;
    this.onFinish = onFinish;
    this.toast = toast || console.log;

    this.active = false;
    this.duration = 20.0; // 整个开场运镜时长 20 秒
    this.elapsed = 0;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];

    this.posCurve = null;
    this.targetCurve = null;

    // 缓存玩家原视角
    this.origPos = new THREE.Vector3();
    this.origLook = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    // DOM 元素引用
    this.overlayEl = document.getElementById("introOverlay");
    this.titleEl = document.getElementById("introTitle");
    this.subtitleEl = document.getElementById("introSubtitle");
    this.progressBar = document.getElementById("introProgress");
    this.recordBtn = document.getElementById("introRecordBtn");
    this.skipBtn = document.getElementById("introSkipBtn");

    this.bindEvents();
  }

  bindEvents() {
    if (this.skipBtn) {
      this.skipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.stop(true);
      });
    }

    if (this.recordBtn) {
      this.recordBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.isRecording) {
          this.stopRecording();
        } else {
          this.startRecording();
        }
      });
    }
  }

  buildCurves() {
    const spawnX = this.player.position.x || 128;
    const spawnY = this.player.position.y || 32;
    const spawnZ = this.player.position.z || 128;

    // 5 段关键点位置构建 CatmullRom 平滑三维飞行轨迹
    const posPoints = [
      // 0: 高空破晓俯瞰
      new THREE.Vector3(spawnX - 10, 68, spawnZ + 80),
      // 1: 斜切俯冲，飞掠林海与山坡
      new THREE.Vector3(spawnX - 55, 46, spawnZ + 25),
      // 2: 水面贴地掠行，展现水光与岸边
      new THREE.Vector3(spawnX - 20, 27, spawnZ - 30),
      // 3: 飞向北侧凋灵祭坛上空，神秘环视
      new THREE.Vector3(128, 42, 38),
      // 4: 盘旋返航，面向玩家营地斜上方
      new THREE.Vector3(spawnX + 6, spawnY + 9, spawnZ + 14),
      // 5: 平滑着陆降临于玩家身位
      new THREE.Vector3(spawnX, spawnY + this.player.height, spawnZ),
    ];

    // 对应的镜头焦点（lookAt）轨迹
    const targetPoints = [
      new THREE.Vector3(spawnX, 32, spawnZ),
      new THREE.Vector3(spawnX - 15, 28, spawnZ),
      new THREE.Vector3(spawnX + 15, 25, spawnZ - 50),
      new THREE.Vector3(128, 31, 16), // 凝视北方 BOSS 祭坛
      new THREE.Vector3(spawnX, spawnY + 1.2, spawnZ),
      new THREE.Vector3(spawnX, spawnY + 1.5, spawnZ - 10), // 面向正前
    ];

    this.posCurve = new THREE.CatmullRomCurve3(posPoints, false, "catmullrom", 0.35);
    this.targetCurve = new THREE.CatmullRomCurve3(targetPoints, false, "catmullrom", 0.35);
  }

  // 场景文字剧本阶段配置
  getSceneStage(progress) {
    if (progress < 0.22) {
      return {
        title: "MineWeb",
        subtitle: "一个跑在浏览器里的迷你「我的世界」",
      };
    } else if (progress < 0.46) {
      return {
        title: "无垠大地 · 自由探索",
        subtitle: "层峦叠嶂与浩瀚林海，每一块砖瓦皆可触碰",
      };
    } else if (progress < 0.70) {
      return {
        title: "采集铸造 · 点亮夜幕",
        subtitle: "伐木挖矿、合成工具、生火烹饪，在蛮荒中开辟生机",
      };
    } else if (progress < 0.88) {
      return {
        title: "深渊危机 · 凋灵祭坛",
        subtitle: "北境之巅的远古魔王等待唤醒，带上枪械迎接试炼！",
      };
    } else {
      return {
        title: "属于你的冒险，由此启程",
        subtitle: "出发吧，冒险家！",
      };
    }
  }

  start({ recordImmediately = false } = {}) {
    if (this.active) return;
    this.active = true;
    this.elapsed = 0;

    // 记录原位置
    this.origPos.copy(this.camera.position);

    // 构建飞行轨迹
    this.buildCurves();

    // 启动音频
    sfx.playIntroBGM();

    document.body.classList.add("intro-mode");
    if (this.viewmodel && this.viewmodel.group) {
      this.viewmodel.group.visible = false;
    }

    // 显示遮罩
    if (this.overlayEl) {
      this.overlayEl.classList.remove("hidden");
      this.overlayEl.classList.add("active");
    }

    if (recordImmediately) {
      this.startRecording();
    } else {
      this.updateRecordBtnState(false);
    }

    this.toast("🎬 正在播放开场运镜动画（按 ESC 或空格跳过）");
  }

  startRecording() {
    if (!this.canvas || !this.canvas.captureStream) {
      this.toast("当前浏览器不支持 Canvas 录屏");
      return;
    }

    try {
      this.recordedChunks = [];
      const stream = this.canvas.captureStream(60);
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      let selectedMime = "video/webm";
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 8000000, // 8 Mbps 高清
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecordedVideo(selectedMime);
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.updateRecordBtnState(true);
      this.toast("🔴 已启动高清录制，播放结束将自动下载视频");
    } catch (err) {
      console.error("启动录制失败:", err);
      this.toast("录制启动失败: " + err.message);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      this.updateRecordBtnState(false);
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn("停止录制异常:", e);
      }
    }
  }

  saveRecordedVideo(mimeType) {
    if (!this.recordedChunks.length) return;
    try {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `MineWeb-Opening-${dateStr}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 3000);
      this.toast("🎉 开场视频已成功导出并触发下载！");
    } catch (err) {
      console.error("保存视频异常:", err);
      this.toast("保存视频失败: " + err.message);
    }
  }

  updateRecordBtnState(isRecording) {
    if (!this.recordBtn) return;
    if (isRecording) {
      this.recordBtn.classList.add("recording");
      this.recordBtn.innerHTML = `<span class="rec-dot"></span> 正在录制视频 (导出中…)`;
    } else {
      this.recordBtn.classList.remove("recording");
      this.recordBtn.innerHTML = `🎥 录制并导出视频`;
    }
  }

  update(dt) {
    if (!this.active) return false;

    this.elapsed += dt;
    const progress = Math.min(1.0, this.elapsed / this.duration);

    // 缓动曲线：慢启动、平稳运镜、末端平滑降落
    const t = this.easeInOutCubic(progress);

    // 计算摄像机位置与焦点
    const currentPos = this.posCurve.getPoint(t);
    const targetPos = this.targetCurve.getPoint(t);

    this.camera.position.copy(currentPos);
    this.currentLookAt.copy(targetPos);
    this.camera.lookAt(this.currentLookAt);

    // 更新字幕文本
    const stage = this.getSceneStage(progress);
    if (this.titleEl && this.titleEl.textContent !== stage.title) {
      this.titleEl.textContent = stage.title;
      this.titleEl.classList.remove("fade-in");
      void this.titleEl.offsetWidth; // 触发 reflow 重启淡入动画
      this.titleEl.classList.add("fade-in");
    }
    if (this.subtitleEl && this.subtitleEl.textContent !== stage.subtitle) {
      this.subtitleEl.textContent = stage.subtitle;
      this.subtitleEl.classList.remove("fade-in");
      void this.subtitleEl.offsetWidth;
      this.subtitleEl.classList.add("fade-in");
    }

    // 更新进度条
    if (this.progressBar) {
      this.progressBar.style.width = `${progress * 100}%`;
    }

    // 运镜结束
    if (progress >= 1.0) {
      this.stop(false);
      return false;
    }

    return true;
  }

  easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  stop(skipped = false) {
    if (!this.active) return;
    this.active = false;

    // 停止录制并下载视频
    if (this.isRecording) {
      this.stopRecording();
    }

    // 隐藏遮罩
    if (this.overlayEl) {
      this.overlayEl.classList.remove("active");
      this.overlayEl.classList.add("hidden");
    }

    document.body.classList.remove("intro-mode");
    if (this.viewmodel && this.viewmodel.group) {
      this.viewmodel.group.visible = true;
    }

    if (this.onFinish) {
      this.onFinish({ skipped });
    }
  }

  isActive() {
    return this.active;
  }
}
