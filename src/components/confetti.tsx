"use client";

import { useEffect, useRef } from "react";
import { popSound } from "@/lib/gear-sfx";

/* 종이 축포: 화면 아래 양쪽 모서리에서 "빵!" 하고 색종이가 한 번 쏘아 올라가 가운데로 퍼진 뒤 팔랑이며 내려온다.
   일부러 간결하게: 색종이만, 한 번만, 약 2.5초. 누를 수 없는 전체 화면 덮개, 끝나면 onDone. */
const COLORS = ["#ff6a33", "#CEFF1A", "#ffd60a", "#5aa6ff", "#ff5f7e", "#ffffff"];
type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; flip: number; vf: number; c: string; life: number; sway: number };

export default function Confetti({ onDone }: { onDone: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr; g.scale(dpr, dpr);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const sp = Math.min(1, H / 700 + 0.35);
    const pieces: Piece[] = [];
    for (const k of [{ x: W * 0.05, a: -62 }, { x: W * 0.95, a: -118 }]) { // 왼쪽 아래는 오른쪽 위로, 오른쪽 아래는 왼쪽 위로
      for (let i = 0; i < 28; i++) {
        const ang = ((k.a + rnd(-15, 15)) * Math.PI) / 180, v = rnd(800, 1500) * sp;
        pieces.push({ x: k.x, y: H + 6, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, w: rnd(7, 11), h: rnd(5, 8), rot: rnd(0, 6.3), vr: rnd(-6, 6), flip: rnd(0, 6.3), vf: rnd(6, 12), c: COLORS[Math.floor(Math.random() * COLORS.length)], life: rnd(2.0, 2.7), sway: rnd(0, 6.3) });
      }
    }
    popSound();
    const start = performance.now();
    let last = start, raf = 0, finished = false;
    const frame = (now: number) => {
      const t = (now - start) / 1000, dt = Math.min(0.034, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of pieces) {
        if (t > p.life) continue;
        alive++;
        const drag = Math.exp(-3.2 * dt);
        p.vx *= drag; p.vy = p.vy * drag + 480 * dt; // 공기 저항이 커서 확 퍼진 뒤 팔랑팔랑 내려온다
        p.x += p.vx * dt + Math.sin(t * 3.2 + p.sway) * 24 * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt; p.flip += p.vf * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.flip));
        g.globalAlpha = Math.min(1, (p.life - t) / 0.6);
        g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (!finished && (alive === 0 || t > 4)) { finished = true; onDone(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={cv} className="confetti" aria-hidden />;
}
