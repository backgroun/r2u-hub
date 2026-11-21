"use client";
import { useEffect, useState } from "react";

export type BoardRow = { nick: string; rank: number; value: string; pct: number };
export type BoardTab = { key: string; label: string; rows: BoardRow[] };

const TOP_N = 5;
const ROLL_MS = 2400;

const listOf = (tab: BoardTab, me: string) => {
  const top = tab.rows.filter((r) => r.rank <= TOP_N);
  const myRow = tab.rows.find((r) => r.nick === me && r.rank > TOP_N); // 5위 밖이면 내 줄도 한 번 보여 준다
  return [...top, ...(myRow ? [myRow] : [])];
};

/** 부문별 순위판: 한 줄에 3칸씩. 각 칸은 누르지 않아도 1위부터 5위까지 저절로 넘어가며 보여 준다. */
export default function ChallengeBoard({ tabs, me }: { tabs: BoardTab[]; me: string }) {
  const [still, setStill] = useState(false); // 움직임 줄이기 설정이면 롤링 대신 1위만 보인다
  useEffect(() => { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return (
    <section className="ch-card ch-board" aria-label="부문별 순위">
      <h2 className="ch-h"><span className="ch-live">실시간 순위</span> <small>1위부터 5위까지 자동으로 넘어가요</small></h2>
      <ul className="ch-cells">
        {tabs.map((t, i) => <Cell key={t.key} tab={t} me={me} delay={i * 400} still={still} />)}
      </ul>
    </section>
  );
}

function Cell({ tab, me, delay, still }: { tab: BoardTab; me: string; delay: number; still: boolean }) {
  const list = listOf(tab, me);
  const [i, setI] = useState(0);
  const rolling = !still && list.length > 1;
  useEffect(() => {
    if (!rolling) return;
    let tick: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { tick = setInterval(() => setI((n) => n + 1), ROLL_MS); }, delay); // 칸마다 시작을 어긋나게
    return () => { clearTimeout(start); if (tick) clearInterval(tick); };
  }, [rolling, delay]);
  const at = list.length ? i % list.length : 0;
  const cur = list[at];
  return (
    <li className="ch-cell" data-me={cur?.nick === me ? "1" : undefined}>
      <span className="ch-cell-k">{tab.label}</span>
      <span className="ch-cell-v">
        {!cur ? <span className="ch-roll-none">기록 없음</span> : (
          <span key={`${tab.key}-${at}`} className="ch-cell-item" data-me={cur.nick === me ? "1" : undefined}>
            <span className="ch-cell-top"><span className="ch-bib" data-r={cur.rank <= 3 ? cur.rank : undefined}>{cur.rank}</span><span className="ch-cell-n">{cur.nick}</span></span>
            <span className="ch-cell-x">{cur.value}</span>
          </span>
        )}
      </span>
      {list.length > 1 && (
        <span className="ch-cell-dots" aria-hidden>{list.map((_, k) => <i key={k} data-on={k === at ? "1" : undefined} />)}</span>
      )}
    </li>
  );
}
