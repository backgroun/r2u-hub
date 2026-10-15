"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { catchRunner } from "@/app/actions";
import { showToast } from "@/components/toaster";

/* 깜짝 러너: 아주 가끔 화면 아래를 뛰어 지나가는 캐릭터. 누르면 하루 한 번 포인트.
   운영에서는 화면을 열 때 4% 확률로, 그날 아직 안 잡았을 때만 나온다. 로컬(개발)에서는 테스트로 매번 나온다. */
const CHANCE = 0.04;
const TEST = process.env.NODE_ENV === "development";
const HIDE_ON = ["/login", "/join"];
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 괜찮다 */ } },
};

export default function RunnerBuddy() {
  const path = usePathname();
  const [run, setRun] = useState<{ id: number; top: number; dur: number } | null>(null);
  const [caught, setCaught] = useState(false);

  useEffect(() => {
    if (HIDE_ON.some((p) => path.startsWith(p))) return;
    if (!TEST && (store.get("runnerCaught") === today() || Math.random() > CHANCE)) return;
    // 화면을 연 뒤 조금 있다가 나온다
    const t = setTimeout(() => {
      setCaught(false);
      setRun({ id: Date.now(), top: 55 + Math.random() * 25, dur: 6 + Math.random() * 3 });
    }, TEST ? 1200 : 3000 + Math.random() * 6000);
    return () => clearTimeout(t);
  }, [path]);

  if (!run) return null;
  return (
    <button
      key={run.id}
      type="button"
      className={`runner-buddy ${caught ? "is-caught" : ""}`}
      style={{ top: `${run.top}vh`, animationDuration: `${run.dur}s` }}
      aria-label="깜짝 러너 잡기"
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setRun(null); }}
      onClick={async () => {
        if (caught) return;
        setCaught(true);
        store.set("runnerCaught", today());
        const r = await catchRunner();
        if (r?.msg) showToast(r.msg, r.ok ? "ok" : "err");
        setTimeout(() => setRun(null), 900);
      }}
    >
      <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
        {/* 몸 */}
        <g className="rb-body">
          <ellipse cx="32" cy="58" rx="14" ry="3" fill="rgba(0,0,0,.35)" />
          <g className="rb-leg rb-leg-a"><path d="M27 44 L22 54" stroke="#ff7a3d" strokeWidth="4.5" strokeLinecap="round" /><ellipse cx="21" cy="55" rx="4.5" ry="2.6" fill="#fff" /></g>
          <g className="rb-leg rb-leg-b"><path d="M37 44 L42 54" stroke="#ff7a3d" strokeWidth="4.5" strokeLinecap="round" /><ellipse cx="43" cy="55" rx="4.5" ry="2.6" fill="#fff" /></g>
          <circle cx="32" cy="30" r="17" fill="#ff8a3d" />
          <path d="M16 24 Q32 15 48 24 L48 28 Q32 20 16 28Z" fill="#2f8bff" />
          <path d="M16 26 L8 22 M16 27 L9 30" stroke="#2f8bff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="26" cy="31" r="2.6" fill="#1c1c1e" /><circle cx="38" cy="31" r="2.6" fill="#1c1c1e" />
          <circle cx="26.8" cy="30.2" r=".9" fill="#fff" /><circle cx="38.8" cy="30.2" r=".9" fill="#fff" />
          <ellipse cx="22" cy="36" rx="3" ry="1.8" fill="#ff5f6d" opacity=".6" /><ellipse cx="42" cy="36" rx="3" ry="1.8" fill="#ff5f6d" opacity=".6" />
          <path d="M28.5 37 Q32 40 35.5 37" stroke="#1c1c1e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path className="rb-arm" d="M17 36 L11 41" stroke="#ff7a3d" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>
      {caught && <span className="rb-pop">+P</span>}
    </button>
  );
}
