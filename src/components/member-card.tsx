"use client";

import { useEffect, useRef, useState } from "react";

/* 회원 카드: 대회 명단의 이름을 누르면 아래에서 올라오는 요약 카드.
   이름(MemberChip)은 이벤트만 보내고, 화면에 하나 있는 MemberCardSheet가 받아서 연다. */
const EVT = "r2u:member-card";

type Card = {
  nick: string; name: string; admin: boolean; manager: boolean;
  points: number; tier: { label: string; color: string; key: string }; left: number; pct: number;
  joinedCount: number; upcoming: { name: string; date: string; course: string }[];
  pb: { course: string; time: string }[]; recent: { name: string; date: string; course: string; time: string }[];
  month: { km: number; goal: number; rate: number | null };
};

export function MemberChip({ nick, children }: { nick: string; children: React.ReactNode }) {
  return (
    <button type="button" className="mc-trigger" onClick={() => window.dispatchEvent(new CustomEvent(EVT, { detail: nick }))} aria-label={`${nick} 회원 카드 보기`}>
      {children}
    </button>
  );
}

const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;

export function MemberCardSheet() {
  const ref = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const open = async (e: Event) => {
      const nick = (e as CustomEvent<string>).detail;
      setCard(null); setErr("");
      ref.current?.showModal();
      try {
        const res = await fetch(`/api/member-card?nick=${encodeURIComponent(nick)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "불러오지 못했어요.");
        setCard(j);
      } catch (x) { setErr(x instanceof Error ? x.message : "불러오지 못했어요."); }
    };
    window.addEventListener(EVT, open);
    return () => window.removeEventListener(EVT, open);
  }, []);

  const c = card;
  const color = c ? (c.tier.key === "black" ? "#8a8a8a" : c.tier.color) : "";
  return (
    <dialog ref={ref} className="point-guide sheet member-card" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <span className="sheet-grip" aria-hidden />
      {!c && !err && <p className="text-sm text-muted py-8 text-center">불러오는 중…</p>}
      {err && <p className="text-sm text-[var(--bad)] py-8 text-center">{err}</p>}
      {c && (
        <div className="grid gap-3">
          <div className="mc-head" style={{ ["--tier" as string]: color }}>
            <span className="mc-avatar" aria-hidden>{c.nick.slice(0, 1)}</span>
            <div className="min-w-0 grid">
              <b className="text-lg truncate">{c.nick}<span className="text-muted font-normal">/{c.name}</span>{c.manager ? " ⚙️" : c.admin ? " 👑" : ""}</b>
              <span className="text-sm"><b style={{ color }}>{c.tier.label}</b> <span className="text-muted num">· {c.points.toLocaleString()}P</span></span>
            </div>
            <button type="button" className="btn btn-ghost px-2.5 py-1 ml-auto self-start" style={{ minHeight: 0 }} aria-label="닫기" onClick={() => ref.current?.close()}>✕</button>
          </div>
          <span className="level-bar" title={`다음 단계까지 ${c.left}P`}><span style={{ width: `${c.pct}%`, background: color }} /></span>

          <div className="stat-strip stat-compact">
            <div><span className="label">이번 달</span><b className="num">{c.month.km}<small>km</small></b></div>
            <div><span className="label">달성율</span><b className="num">{c.month.rate != null ? `${c.month.rate}%` : "–"}</b></div>
            <div><span className="label">참가 대회</span><b className="num">{c.joinedCount}<small>개</small></b></div>
          </div>

          {c.pb.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{c.pb.map((p) => <span key={p.course} className="chip count-badge">🏅 {p.course} {p.time}</span>)}</div>
          )}

          <div className="grid gap-1">
            <span className="label">참가 예정 대회</span>
            {c.upcoming.length === 0 ? <p className="text-sm text-muted">없어요.</p> : c.upcoming.map((r) => (
              <p key={r.name + r.date} className="flex items-center gap-2 text-sm min-w-0"><b className="num shrink-0">{md(r.date)}</b><span className="truncate">{r.name}</span>{r.course && <span className="chip shrink-0 ml-auto">{r.course}</span>}</p>
            ))}
          </div>

          {c.recent.length > 0 && (
            <div className="grid gap-1">
              <span className="label">최근 대회 기록</span>
              {c.recent.map((r) => (
                <p key={r.name + r.date} className="flex items-center gap-2 text-sm min-w-0"><b className="num shrink-0">{md(r.date)}</b><span className="truncate">{r.name}</span><span className="shrink-0 ml-auto text-muted">{r.course}</span><b className="num shrink-0">{r.time}</b></p>
              ))}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
