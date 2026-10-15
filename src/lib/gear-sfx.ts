"use client";
import type { Snd } from "@/components/gear-art";

/* 깜짝 러닝 용품 효과음 (파일 없이 WebAudio로 합성): 용품마다 다른 튕김 소리 · 폭죽 소리 · 놓쳤을 때 소리 */
let ctx: AudioContext | null = null;
const getCtx = () => {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    return ctx;
  } catch { return null; }
};
const ready = () => { const c = getCtx(); return c && c.state === "running" ? c : null; };
/** 소리는 사용자가 화면을 한 번 만진 뒤에야 날 수 있어서, 첫 터치 때 미리 깨워 둔다 */
export function unlockAudio() { const c = getCtx(); if (c && c.state === "suspended") void c.resume(); }

/** 음 하나: f0→f1로 미끄러지며 울린다. vib가 있으면 떨림(보잉) */
function tone(c: AudioContext, at: number, f0: number, f1: number, vol: number, len: number, type: OscillatorType = "sine", vib = 0) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + len);
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 26; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(at); l.stop(at + len + 0.03); }
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + len + 0.03);
}
/** 잡음: lowpass·highpass·bandpass로 질감을 만든다 (쉭, 펑, 타닥) */
function noise(c: AudioContext, at: number, vol: number, len: number, kind: BiquadFilterType, freq: number, q = 0.7) {
  const n = Math.floor(c.sampleRate * len), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = kind; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(at);
}
/** 금속·종 울림: 정수배가 아닌 배음이 섞여 ‘챙’ 하고 길게 울린다 */
function bell(c: AudioContext, at: number, f: number, vol: number, len = 0.6) {
  [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.16]].forEach(([r, a]) => tone(c, at, f * r, f * r * 0.995, vol * a, len / (r > 3 ? 2 : 1), "sine"));
}

/** 튕기는 소리: 세게 부딪힐수록(impact 0~1) 크다. 용품마다 소리 종류가 다르다 */
export function bounceSound(s: Snd, impact: number) {
  const c = ready(); if (!c || impact < 0.1) return;
  const t = c.currentTime, v = Math.min(1, impact) * (s.vol ?? 1), f = s.f;
  switch (s.k) {
    case "squeak": tone(c, t, f, f * 1.9, 0.2 * v, 0.09, "triangle"); tone(c, t + 0.01, f * 2, f * 3.4, 0.07 * v, 0.07, "sine"); break; // 끽
    case "beep": tone(c, t, f, f, 0.1 * v, 0.05, "square"); tone(c, t + 0.075, f * 1.26, f * 1.26, 0.1 * v, 0.06, "square"); break; // 삐빅
    case "boing": tone(c, t, f * 0.8, f * 0.7, 0.34 * v, 0.28, "sine", f * 0.35); tone(c, t, f * 1.6, f * 1.4, 0.1 * v, 0.2, "sine", f * 0.2); break; // 보잉
    case "bloop": tone(c, t, f * 0.6, f * 1.9, 0.34 * v, 0.11, "sine"); tone(c, t + 0.06, f * 1.2, f * 2.2, 0.12 * v, 0.07, "sine"); break; // 퐁당
    case "swish": noise(c, t, 0.45 * v, 0.2, "bandpass", f, 1.1); break; // 쉭
    case "poof": noise(c, t, 0.4 * v, 0.14, "lowpass", 520); tone(c, t, f, f * 0.6, 0.3 * v, 0.1, "sine"); break; // 푸욱
    case "clink": bell(c, t, f, 0.17 * v, 0.7); break; // 챙
    case "squish": tone(c, t, f * 1.5, f * 0.45, 0.3 * v, 0.14, "triangle"); noise(c, t, 0.12 * v, 0.1, "highpass", 3200); break; // 찌익
    case "wood": noise(c, t, 0.34 * v, 0.045, "bandpass", 1300, 7); tone(c, t, f, f * 0.55, 0.3 * v, 0.06, "sine"); break; // 딱
    case "marimba": tone(c, t, f, f, 0.34 * v, 0.28, "sine"); tone(c, t, f * 4, f * 4, 0.1 * v, 0.1, "sine"); break; // 통
  }
}

/** 종이 축포 "빵!": 짧고 굵은 터짐 + 색종이가 흩날리는 바스락 소리 */
export function popSound() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  noise(c, t, 0.5, 0.09, "highpass", 1400);
  tone(c, t, 190, 55, 0.55, 0.14, "sine");
  tone(c, t, 1500, 650, 0.14, 0.06, "triangle");
  noise(c, t + 0.12, 0.07, 0.5, "bandpass", 3200, 0.8); // 색종이 바스락
}
/** 잡았을 때 팡파르: 올라가는 종소리 */
export function catchSound() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  [784, 988, 1175, 1568].forEach((f, i) => bell(c, t + 0.05 + i * 0.09, f, 0.15, 0.5));
}
/** 못 잡고 사라질 때: 힘 빠지게 내려가는 아쉬운 소리 (뿌우웅) */
export function missSound() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  tone(c, t, 440, 330, 0.2, 0.2, "sawtooth");
  tone(c, t + 0.2, 330, 247, 0.2, 0.2, "sawtooth");
  tone(c, t + 0.4, 247, 110, 0.22, 0.55, "sawtooth", 6);
}
