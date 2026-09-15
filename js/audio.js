// 纯 Web Audio 合成音效：不依赖任何外部音频文件
// 用法： import { sfx } from "./audio.js";  sfx.play("break", { material: "stone" })

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (e) {
    ctx = null;
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  return ctx;
}

function getNoise() {
  if (noiseBuf) return noiseBuf;
  const c = ensureCtx();
  if (!c) return null;
  const len = Math.floor(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

// 指数包络（attack-hold-release），峰值与释放都保持为正
function applyEnv(gainNode, t0, attack, hold, release, peak) {
  const g = gainNode.gain;
  const a = Math.max(0.001, attack);
  const r = Math.max(0.01, release);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
  g.setValueAtTime(Math.max(0.0001, peak), t0 + a + Math.max(0, hold));
  g.exponentialRampToValueAtTime(0.0001, t0 + a + Math.max(0, hold) + r);
}

function connectPan(node, pan) {
  const c = ensureCtx();
  if (!c || !pan) return node;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p);
  return p;
}

// 单个振荡器音
function tone(opts) {
  const c = ensureCtx();
  if (!c || muted) return;
  const {
    type = "sine",
    f0 = 440,
    f1,
    dur = 0.15,
    gain = 0.3,
    delay = 0,
    attack = 0.004,
    hold = 0,
    pan = 0,
  } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = c.createGain();
  applyEnv(g, t0, attack, hold, dur - attack - hold, gain);
  connectPan(osc, pan).connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// 过滤噪声音
function noise(opts) {
  const c = ensureCtx();
  if (!c || muted) return;
  const buf = getNoise();
  if (!buf) return;
  const {
    dur = 0.1,
    gain = 0.3,
    type = "bandpass",
    freq = 1000,
    freqEnd,
    q = 0.8,
    delay = 0,
    attack = 0.002,
    hold = 0,
    pan = 0,
  } = opts;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(Math.max(40, freq), t0);
  if (freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
  filt.Q.value = q;
  const g = c.createGain();
  applyEnv(g, t0, attack, hold, dur - attack - hold, gain);
  src.connect(filt);
  connectPan(filt, pan).connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const DIG = {
  stone: { freq: 1600, type: "bandpass", gain: 0.22 },
  wood: { freq: 700, type: "bandpass", gain: 0.22 },
  dirt: { freq: 420, type: "lowpass", gain: 0.2 },
  grass: { freq: 2400, type: "bandpass", gain: 0.15 },
};

const BREAK = {
  stone: [180, 90],
  wood: [230, 110],
  dirt: [120, 70],
  grass: [300, 150],
};

const PLACE = { stone: 180, wood: 150, dirt: 110, grass: 130 };
const STEP = { stone: 900, wood: 500, dirt: 300, grass: 1800 };

const SOUNDS = {
  // 挖掘中：短促的凿击声
  dig(o = {}) {
    const s = DIG[o.material] || DIG.stone;
    const f = s.freq * (0.9 + Math.random() * 0.2);
    noise({ dur: 0.07, gain: s.gain, type: s.type, freq: f, freqEnd: f * 0.6, q: 0.8 });
  },
  // 方块破坏
  break(o = {}) {
    const [hi, lo] = BREAK[o.material] || BREAK.stone;
    noise({ dur: 0.18, gain: 0.3, type: "lowpass", freq: hi * 3, freqEnd: hi, q: 0.7 });
    tone({ type: "triangle", f0: hi, f1: lo, dur: 0.16, gain: 0.2 });
  },
  // 放置方块：闷响
  place(o = {}) {
    const f = PLACE[o.material] || PLACE.stone;
    tone({ type: "square", f0: f, f1: f * 0.6, dur: 0.09, gain: 0.18 });
    noise({ dur: 0.06, gain: 0.12, type: "lowpass", freq: 800, freqEnd: 400 });
  },
  // 脚步声
  step(o = {}) {
    const f = STEP[o.material] || STEP.grass;
    noise({ dur: 0.05, gain: 0.09, freq: f, freqEnd: f * 0.5, q: 0.7 });
  },
  // 玩家受伤
  hurt() {
    tone({ type: "sawtooth", f0: 320, f1: 120, dur: 0.22, gain: 0.28 });
    tone({ type: "square", f0: 160, f1: 70, dur: 0.2, gain: 0.14, delay: 0.01 });
  },
  // 玩家死亡
  death() {
    tone({ type: "sawtooth", f0: 300, f1: 60, dur: 0.7, gain: 0.3 });
    tone({ type: "square", f0: 150, f1: 40, dur: 0.8, gain: 0.18, delay: 0.05 });
  },
  // 进食：三口咀嚼
  eat() {
    for (let i = 0; i < 3; i++) {
      noise({ dur: 0.07, gain: 0.18, type: "lowpass", freq: 500, freqEnd: 300, delay: i * 0.16 });
    }
  },
  // 拾取/获得物品
  pop() {
    tone({ type: "sine", f0: 620, f1: 990, dur: 0.09, gain: 0.16 });
  },
  // 近战命中
  hit() {
    noise({ dur: 0.08, gain: 0.22, freq: 1200, q: 0.8 });
    tone({ type: "square", f0: 180, f1: 90, dur: 0.1, gain: 0.16 });
  },
  // 怪物受伤
  mob_hurt() {
    tone({ type: "square", f0: 420, f1: 220, dur: 0.12, gain: 0.2 });
  },
  // 怪物死亡
  mob_death() {
    tone({ type: "square", f0: 360, f1: 80, dur: 0.4, gain: 0.22 });
    tone({ type: "sawtooth", f0: 200, f1: 60, dur: 0.45, gain: 0.13, delay: 0.03 });
  },
  // 枪声
  gun() {
    noise({ dur: 0.14, gain: 0.45, type: "lowpass", freq: 3200, freqEnd: 200, q: 0.7 });
    tone({ type: "square", f0: 200, f1: 50, dur: 0.12, gain: 0.22 });
  },
  // 霰弹枪声：更低沉、更响、拖尾更长
  shotgun() {
    noise({ dur: 0.24, gain: 0.55, type: "lowpass", freq: 2400, freqEnd: 120, q: 0.6 });
    tone({ type: "square", f0: 150, f1: 40, dur: 0.22, gain: 0.28 });
    tone({ type: "sawtooth", f0: 90, f1: 30, dur: 0.3, gain: 0.14, delay: 0.02 });
  },
  // 爆头提示音
  headshot() {
    tone({ type: "sine", f0: 1200, f1: 1900, dur: 0.14, gain: 0.2 });
    tone({ type: "sine", f0: 1800, f1: 2400, dur: 0.12, gain: 0.1, delay: 0.05 });
  },
  // 合成成功
  craft() {
    tone({ type: "triangle", f0: 523, dur: 0.1, gain: 0.18 });
    tone({ type: "triangle", f0: 784, dur: 0.14, gain: 0.18, delay: 0.09 });
  },
  // UI 点击
  click() {
    tone({ type: "square", f0: 900, f1: 700, dur: 0.04, gain: 0.08 });
  },
  // 铁矿嗅探器：声呐 ping
  sniff() {
    tone({ type: "sine", f0: 880, f1: 1320, dur: 0.18, gain: 0.18 });
    tone({ type: "sine", f0: 660, f1: 990, dur: 0.4, gain: 0.09, delay: 0.18 });
  },
  // 威胁阶段推进：低沉不祥音
  ominous() {
    tone({ type: "sawtooth", f0: 110, f1: 82, dur: 1.2, gain: 0.16 });
    tone({ type: "sine", f0: 55, f1: 41, dur: 1.4, gain: 0.14, delay: 0.05 });
  },
  // BOSS 半血狂暴：咆哮
  boss_enrage() {
    tone({ type: "sawtooth", f0: 180, f1: 60, dur: 0.9, gain: 0.3 });
    noise({ dur: 0.5, gain: 0.28, type: "lowpass", freq: 900, freqEnd: 160, q: 0.6 });
    tone({ type: "square", f0: 90, f1: 45, dur: 0.7, gain: 0.16, delay: 0.05 });
  },
  // BOSS 被击败：胜利号角
  boss_defeat() {
    tone({ type: "triangle", f0: 392, dur: 0.18, gain: 0.24 });
    tone({ type: "triangle", f0: 523, dur: 0.18, gain: 0.24, delay: 0.16 });
    tone({ type: "triangle", f0: 659, dur: 0.22, gain: 0.24, delay: 0.32 });
    tone({ type: "triangle", f0: 784, dur: 0.5, gain: 0.26, delay: 0.5 });
    tone({ type: "sine", f0: 55, f1: 40, dur: 1.0, gain: 0.12 });
  },
};

export const sfx = {
  play(name, opts) {
    const c = ensureCtx();
    if (!c || muted) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    const fn = SOUNDS[name];
    if (fn) fn(opts || {});
  },
  setVolume(v) {
    ensureCtx();
    if (master) master.gain.value = Math.max(0, Math.min(1, v));
  },
  get volume() {
    return master ? master.gain.value : 0;
  },
  get muted() {
    return muted;
  },
  toggleMute() {
    muted = !muted;
    return muted;
  },
};

// 浏览器自动播放策略：首次用户手势时解锁 AudioContext
function unlock() {
  const c = ensureCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });
