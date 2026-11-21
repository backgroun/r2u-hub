"use client";
import { useId, useState } from "react";

export type BoardRow = { nick: string; rank: number; value: string };
export type BoardTab = { key: string; label: string; rows: BoardRow[] };

const TOP_N = 5;

/** 부문별 순위판: 부문을 탭으로 넘겨 보고, 1위를 크게, 내 줄은 색으로 짚는다. */
export default function ChallengeBoard({ tabs, me }: { tabs: BoardTab[]; me: string }) {
  const [active, setActive] = useState(() => tabs.find((t) => t.rows.length > 0)?.key ?? tabs[0]?.key);
  const id = useId();
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!cur) return null;
  const top = cur.rows.filter((r) => r.rank <= TOP_N); // 1~5위(공동 순위 포함)
  const myRow = cur.rows.find((r) => r.nick === me && r.rank > TOP_N); // 5위 밖이면 내 줄만 따로 보여 준다
  return (
    <section className="ch-card" aria-label="부문별 순위">
      <h2 className="ch-h">{cur.label} 상위 {TOP_N}위 <small>{cur.rows.length}명 참가</small></h2>
      <ul className="ch-leaders" aria-label="부문별 1위">
        {tabs.map((t) => {
          const top = t.rows.filter((r) => r.rank === 1);
          return (
            <li key={t.key}>
              <button type="button" className="ch-lead" data-on={t.key === cur.key ? "1" : undefined} onClick={() => setActive(t.key)} aria-label={`${t.label} 순위 보기`}>
                <span className="ch-lead-k">{t.label}</span>
                {top.length === 0 ? <span className="ch-lead-n ch-lead-none">—</span> : (
                  <>
                    <span className="ch-lead-n">{top[0].nick}{top.length > 1 ? ` 외 ${top.length - 1}` : ""}</span>
                    <span className="ch-lead-v">{top[0].value}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ch-tabs" role="tablist" aria-label="부문">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`${id}-${t.key}`} aria-selected={t.key === cur.key} aria-controls={`${id}-panel`} className="ch-tab" onClick={() => setActive(t.key)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${cur.key}`}>
        {cur.rows.length === 0 ? <p className="ch-empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요.</p> : (
          <ol className="ch-list">
            {[...top, ...(myRow ? [myRow] : [])].map((r) => (
              <li key={r.nick} className="ch-row" data-r={r.rank <= 3 ? r.rank : undefined} data-me={r.nick === me ? "1" : undefined}>
                <span className="ch-rank">{r.rank}</span><span className="ch-who">{r.nick}{r.nick === me ? " · 나" : ""}</span><span className="ch-val">{r.value}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
