"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { catchRunner } from "@/app/actions";
import { showToast } from "@/components/toaster";

/* 깜짝 러너: 아주 가끔 화면을 통통 뛰어 지나가는 캐릭터. 누르면 하루 한 번 포인트.
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
      setRun({ id: Date.now(), top: 52 + Math.random() * 26, dur: 8 + Math.random() * 2 });
    }, TEST ? 1200 : 3000 + Math.random() * 6000);
    return () => clearTimeout(t);
  }, [path]);

  if (!run) return null;
  return (
    <button
      key={run.id}
      type="button"
      className={`runner-buddy ${caught ? "is-caught" : ""}`}
      style={{ top: `${run.top}vh`, ["--rb-dur" as string]: `${run.dur}s` }}
      aria-label="깜짝 러너 잡기"
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setRun(null); }}
      onClick={async () => {
        if (caught) return;
        setCaught(true);
        store.set("runnerCaught", today());
        const r = await catchRunner();
        if (r?.msg) showToast(r.msg, r.ok ? "ok" : "err");
        setTimeout(() => setRun(null), 1100);
      }}
    >
      <RunnerArt />
      <span className="rb-bubble" aria-hidden>♥</span>
      <span className="rb-dust" aria-hidden><i /><i /><i /></span>
      {caught && <span className="rb-burst" aria-hidden><i>★</i><i>✦</i><i>★</i><i>✦</i><i>★</i><b>+P</b></span>}
    </button>
  );
}

/** R2U 로고 큐브 러너: 앞(왼쪽)면에 얼굴, 윗면 R, 옆면 U. 왼쪽을 보고 뛴다. */
export function RunnerArt({ size = 74 }: { size?: number }) {
  const line = { stroke: "#1c1c1e", strokeWidth: 2.2, strokeLinejoin: "round" as const };
  return (
    <span className="rb-hopper">
      <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden>
        {/* 머리띠 꼬리 (뒤쪽=오른쪽에서 펄럭) */}
        <g className="rb-tail">
          <path d="M61 26 Q70 20 78 22 Q71 27 63 30Z" fill="#ff7a2e" {...line} strokeWidth={1.6} />
          <path d="M61 29 Q70 31 75 37 Q67 36 61 32Z" fill="#ff9a52" {...line} strokeWidth={1.6} />
        </g>
        {/* 다리 + 운동화 */}
        <g className="rb-leg rb-leg-b">
          <path d="M48 54 L51 65" stroke="#1c1c1e" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M45 64 Q45 69.5 50 69.5 L56 69.5 Q58 67 55 64Z" fill="#ff7a2e" {...line} strokeWidth={1.6} />
        </g>
        <g className="rb-leg rb-leg-a">
          <path d="M31 56 L28 66" stroke="#1c1c1e" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M22 65 Q22 70.5 27 70.5 L33 70.5 Q35 68 32 65Z" fill="#ff7a2e" {...line} strokeWidth={1.6} />
        </g>
        {/* 뒷팔 */}
        <path className="rb-arm rb-arm-b" d="M60 38 Q66 41 67 47" stroke="#1c1c1e" strokeWidth="4.2" strokeLinecap="round" fill="none" />
        {/* 큐브: 윗면 · 앞면 · 옆면 */}
        <path d="M40 8 L62 19 L40 30 L18 19Z" fill="#ffffff" {...line} />
        <path d="M18 19 L40 30 L40 57 L18 46Z" fill="#f1f1f4" {...line} />
        <path d="M40 30 L62 19 L62 46 L40 57Z" fill="#c8c8d0" {...line} />
        {/* 윗면 R */}
        <text transform="matrix(1.1,-0.55,1.1,0.55,18,19)" x="7" y="15" fontSize="13" fontWeight="900" fill="#1c1c1e" fontFamily="Arial Black, Arial, sans-serif">R</text>
        {/* 옆면 U */}
        <text transform="matrix(1.1,-0.55,0,1,40,30)" x="5.5" y="21" fontSize="15" fontWeight="900" fill="#1c1c1e" fontFamily="Arial Black, Arial, sans-serif">U</text>
        {/* 머리띠 (앞면·옆면을 감싼다) */}
        <path d="M18 23 L40 34 L62 23 L62 27.5 L40 38.5 L18 27.5Z" fill="#ff7a2e" {...line} strokeWidth={1.6} />
        {/* 앞면 얼굴 (앞면 기울기에 맞춰 그린다) */}
        <g transform="matrix(1.1,0.55,0,1,18,19)">
          <g className="rb-eyes">
            <ellipse cx="6" cy="14.5" rx="2.6" ry="3.4" fill="#1c1c1e" />
            <ellipse cx="14" cy="14.5" rx="2.6" ry="3.4" fill="#1c1c1e" />
            <circle cx="5.2" cy="13.2" r="1.1" fill="#fff" /><circle cx="13.2" cy="13.2" r="1.1" fill="#fff" />
          </g>
          <ellipse cx="3" cy="19.5" rx="2.4" ry="1.4" fill="#ff5f7e" opacity=".6" />
          <ellipse cx="17" cy="19.5" rx="2.4" ry="1.4" fill="#ff5f7e" opacity=".6" />
          <path d="M8 19 Q10 23 12 19Z" fill="#7a2420" />
          <path d="M9 20.6 Q10 22 11 20.6 Q10 20.1 9 20.6Z" fill="#ff7a8a" />
        </g>
        {/* 앞팔 */}
        <path className="rb-arm rb-arm-a" d="M19 40 Q12 41 10 35" stroke="#1c1c1e" strokeWidth="4.2" strokeLinecap="round" fill="none" />
        {/* 땀방울 */}
        <path className="rb-sweat" d="M66 13 Q69 18 66 20 Q63 18 66 13Z" fill="#8fd3ff" stroke="#1c1c1e" strokeWidth="1" />
      </svg>
    </span>
  );
}
