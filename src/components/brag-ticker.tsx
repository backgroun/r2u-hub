"use client";

import { useEffect, useState } from "react";
import { unbragRace } from "@/app/actions";

export type BragLine = { key: string; who: string; race: string; record: string; ago: string; canOff?: boolean };

// 홈 자랑하기: 한 줄 자리에서 여러 명의 자랑을 차례로 돌려 보여준다.
export default function BragTicker({ items }: { items: BragLine[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [items.length]);
  if (items.length === 0) return null;
  const b = items[i % items.length];
  return (
    <section className="panel brag-card px-3.5 py-2.5 overflow-hidden" aria-live="polite">
      <p key={b.key} className="brag-line flex items-center gap-2 text-sm min-w-0">
        <span aria-hidden>🎉</span>
        <span className="truncate min-w-0"><b>{b.who}</b> {b.race} 완주</span>
        <b className="num shrink-0">{b.record}</b>
        <span className="text-xs text-muted shrink-0 ml-auto">
          {b.ago}
          {items.length > 1 && <span className="num"> · {(i % items.length) + 1}/{items.length}</span>}
        </span>
        {b.canOff && (
          <form action={unbragRace} className="shrink-0">
            <input type="hidden" name="key" value={b.key} />
            <button type="submit" className="text-muted px-1" aria-label="자랑 끄기" title="자랑 끄기"
              onClick={(e) => { if (!window.confirm("홈에 올린 자랑을 내릴까요?")) e.preventDefault(); }}>✕</button>
          </form>
        )}
      </p>
    </section>
  );
}
