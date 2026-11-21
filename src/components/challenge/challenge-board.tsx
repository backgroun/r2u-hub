"use client";
import { useEffect, useState } from "react";

export type BoardRow = { nick: string; rank: number; value: string };
export type BoardTab = { key: string; label: string; rows: BoardRow[] };

const TOP_N = 5;
const ROLL_MS = 2600;

/** 부문별 순위판: 한 부문이 한 줄(제목 | 1~5위가 위로 넘어가는 칸). 줄을 누르면 1~5위가 펼쳐진다. */
export default function ChallengeBoard({ tabs, me }: { tabs: BoardTab[]; me: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [still, setStill] = useState(false); // 움직임 줄이기 설정이면 롤링하지 않는다
  useEffect(() => { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return (
    <section className="ch-card ch-board" aria-label="부문별 순위">
      <h2 className="ch-h">부문별 순위 <small>줄을 누르면 1~5위</small></h2>
      <ul className="ch-rolls">
        {tabs.map((t, i) => (
          <Roll key={t.key} tab={t} me={me} delay={i * 450} open={open === t.key} still={still} onToggle={() => setOpen(open === t.key ? null : t.key)} />
        ))}
      </ul>
    </section>
  );
}

function Roll({ tab, me, delay, open, still, onToggle }: { tab: BoardTab; me: string; delay: number; open: boolean; still: boolean; onToggle: () => void }) {
  const top = tab.rows.filter((r) => r.rank <= TOP_N);
  const myRow = tab.rows.find((r) => r.nick === me && r.rank > TOP_N); // 5위 밖이면 내 줄만 따로
  const list = [...top, ...(myRow ? [myRow] : [])];
  const [i, setI] = useState(0);
  const rolling = !open && !still && list.length > 1;
  useEffect(() => {
    if (!rolling) return;
    let tick: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { tick = setInterval(() => setI((n) => n + 1), ROLL_MS); }, delay); // 줄마다 시작을 어긋나게
    return () => { clearTimeout(start); if (tick) clearInterval(tick); };
  }, [rolling, delay]);
  const cur = list.length ? list[(open ? 0 : i) % list.length] : null;
  return (
    <li className="ch-roll" data-open={open ? "1" : undefined}>
      <button type="button" className="ch-roll-head" onClick={onToggle} aria-expanded={open} aria-label={`${tab.label} 순위 ${open ? "접기" : "펼치기"}`}>
        <span className="ch-roll-k">{tab.label}</span>
        <span className="ch-roll-v" aria-live="off">
          {!cur ? <span className="ch-roll-none">기록 없음</span> : open ? <span className="ch-roll-none">{list.length}명</span> : (
            <span key={`${tab.key}-${i % list.length}`} className="ch-roll-item" data-me={cur.nick === me ? "1" : undefined}>
              <span className="ch-roll-r" data-r={cur.rank <= 3 ? cur.rank : undefined}>{cur.rank}위</span>
              <span className="ch-roll-n">{cur.nick}{cur.nick === me ? " · 나" : ""}</span>
              <span className="ch-roll-x">{cur.value}</span>
            </span>
          )}
        </span>
      </button>
      {open && (
        <ol className="ch-roll-list">
          {list.map((r) => (
            <li key={r.nick} data-me={r.nick === me ? "1" : undefined}>
              <span className="ch-roll-r" data-r={r.rank <= 3 ? r.rank : undefined}>{r.rank}위</span>
              <span className="ch-roll-n">{r.nick}{r.nick === me ? " · 나" : ""}</span>
              <span className="ch-roll-x">{r.value}</span>
            </li>
          ))}
          {list.length === 0 && <li className="ch-roll-none">아직 기록이 없어요.</li>}
        </ol>
      )}
    </li>
  );
}
