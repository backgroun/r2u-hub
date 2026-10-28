import Link from "next/link";
import { listRounds } from "@/lib/db";
import { fmtDeadline, isPastRound, roundStatus, type PublicSummary, type Round } from "@/lib/types";
import { Countdown, PayBadges, StatusChip } from "@/components/ui";
import MyRounds from "./my-rounds";
import Polls from "./polls";
import { getMembers } from "@/lib/hub";
import { knownMemberLabel } from "@/lib/member-label";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [rounds, members] = await Promise.all([listRounds(100), getMembers()]);
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const now = Date.now();
  const past = rounds.filter((x) => isPastRound(x.round.deadline, now));
  const current = rounds.filter((x) => !past.includes(x));
  return (
    <main className="wrap grid gap-6">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="hub-h1">R2U 크루 공구</h1>
        <Link href="/groupbuy/new" className="btn btn-primary text-sm shrink-0">+ 새 공구</Link>
      </header>

      <MyRounds />

      <Polls />

      <section className="grid gap-3">
        <h2 className="label">진행 중인 공구</h2>
        {current.length === 0 && (
          <div className="panel p-5 text-muted text-sm">
            아직 열린 공구가 없어요. 오른쪽 위 ‘+ 새 공구’로 첫 공구를 만들어 보세요.
          </div>
        )}
        {current.map((x) => <RoundCard key={x.round.id} {...x} names={names} />)}
      </section>

      {past.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 지난 공구 {past.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-80">
            {past.map((x) => <RoundCard key={x.round.id} {...x} names={names} />)}
          </div>
        </details>
      )}

    </main>
  );
}

function RoundCard({ round: r, summary: s, names }: { round: Round; summary: PublicSummary; names: Record<string, string> }) {
  const status = roundStatus(r, s.totalQty);
  return (
    <Link href={`/groupbuy/r/${r.id}`} className="panel p-3.5 grid gap-2 hover:border-[var(--lane)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.custom && <span className="chip chip-open">단체 제작 · {r.custom.kind}</span>}
          <StatusChip status={status} />
          {status === "open" && <Countdown deadline={r.deadline} />}
        </div>
        <span className="num text-muted text-sm">{r.minQty > 0 ? `${s.totalQty}/${r.minQty}개` : `${s.totalQty}개 · 수량 무관`}</span>
      </div>
      <h3 className="font-bold text-base leading-snug">{r.title}</h3>
      <p className="text-xs text-muted">{knownMemberLabel(r.opener, names)} · 마감 {fmtDeadline(r.deadline)}</p>
      {r.minQty > 0 && <div className={`track ${s.totalQty >= r.minQty ? "done" : ""}`} aria-hidden style={{ height: 6 }}><span style={{ width: `${Math.min(100, (s.totalQty / r.minQty) * 100)}%` }} /></div>}
      <PayBadges total={s.participants} paid={s.paidCount} delivered={status === "open" ? undefined : s.deliveredCount} />
    </Link>
  );
}
