"use client";
import { Children, useCallback, useRef, useState } from "react";

const GAP = 10; // globals.css 의 .ch-slider gap 과 같은 값

/** 가로로 넘겨 보는 목록: 한 번에 한 장씩 밀어서(스와이프·좌우 키·버튼) 본다. */
export default function RecordSlider({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const step = () => { const first = ref.current?.firstElementChild as HTMLElement | null; return first ? first.offsetWidth + GAP : 0; };
  const onScroll = useCallback(() => {
    const s = step(); const el = ref.current;
    if (!el || !s) return;
    setIdx(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / s))));
  }, [items.length]);
  const go = (to: number) => { const el = ref.current; if (el) el.scrollTo({ left: Math.max(0, Math.min(items.length - 1, to)) * step(), behavior: "smooth" }); };
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2" role="region" aria-roledescription="슬라이드" aria-label="올라온 기록">
      <div className="flex items-center justify-between gap-2">
        <span className="num text-sm text-muted">{idx + 1} / {items.length}</span>
        <div className="flex gap-1.5">
          <button type="button" className="btn text-sm px-3 py-1" onClick={() => go(idx - 1)} disabled={idx <= 0} aria-label="이전 기록">‹</button>
          <button type="button" className="btn text-sm px-3 py-1" onClick={() => go(idx + 1)} disabled={idx >= items.length - 1} aria-label="다음 기록">›</button>
        </div>
      </div>
      <div ref={ref} className="ch-slider" tabIndex={0} onScroll={onScroll} onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); } }}>
        {items.map((it, i) => <div key={i} className="ch-slide" aria-label={`${i + 1}번째`}>{it}</div>)}
      </div>
    </div>
  );
}
