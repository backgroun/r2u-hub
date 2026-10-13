"use client";
import { useEffect } from "react";

/** 버튼·탭·칩을 누를 때 경쾌한 소리 + (지원하는 폰은) 짧은 진동 */
export default function ClickSound() {
  useEffect(() => {
    let ctx: AudioContext | null = null;

    /** 짧은 음 하나: 위로 살짝 미끄러지는 ‘뽁’ 소리 */
    function note(c: AudioContext, at: number, from: number, to: number, vol: number, len: number) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + len * 0.6);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + len + 0.02);
    }

    /** 경쾌한 소리: 주 버튼은 ‘띠링’(두 음이 올라감), 나머지는 통통 튀는 ‘뽁’ */
    function click(primary: boolean) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx ??= new AC();
        if (ctx.state === "suspended") void ctx.resume();
        const t = ctx.currentTime;
        if (primary) {
          note(ctx, t, 880, 990, 0.22, 0.09);          // 라
          note(ctx, t + 0.07, 1320, 1480, 0.2, 0.14);  // 미 (한 음 위로 경쾌하게)
        } else {
          note(ctx, t, 620, 1180, 0.18, 0.07);         // 위로 튀는 뽁
        }
      } catch { /* 소리가 막힌 환경 */ }
      try { navigator.vibrate?.(primary ? 12 : 6); } catch { /* 진동 미지원 */ }
    }

    function onDown(e: PointerEvent) {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button, a.btn, .btn, .tabs a, .tabbar a, .chip-scroll a, .cchip, .goal-chip, .nick-chip");
      if (!el || (el as HTMLButtonElement).disabled) return;
      click(el.classList.contains("btn-primary"));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.matches("button, a.btn") && !(el as HTMLButtonElement).disabled) click(el.classList.contains("btn-primary"));
    }
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      void ctx?.close();
    };
  }, []);
  return null;
}
