import Link from "next/link";
import { listRounds } from "@/lib/db";
import { fmtDeadline, isPastRound, roundStatus, type PublicSummary, type Round } from "@/lib/types";
import { Countdown, PayBadges, StatusChip } from "@/components/ui";
import MyRounds from "./my-rounds";

export const dynamic = "force-dynamic";

export default async function Home() {
  const rounds = await listRounds(100);
  const now = Date.now();
  const past = rounds.filter((x) => isPastRound(x.round.deadline, now));
  const current = rounds.filter((x) => !past.includes(x));
  return (
    <main className="wrap grid gap-6">
      <header className="grid gap-2 pt-4">
        <h1 className="font-display text-2xl leading-tight">R2U 크루 공구</h1>
      </header>

      <Link href="/groupbuy/new" className="btn btn-primary text-base py-3.5">+ 새 공구 열기</Link>

      <MyRounds />

      <section className="grid gap-3">
        <h2 className="label">진행 중인 공구</h2>
        {current.length === 0 && (
          <div className="panel p-5 text-muted text-sm">
            아직 열린 공구가 없어요. 위의 ‘새 공구 열기’로 첫 공구를 만들어 보세요.
          </div>
        )}
        {current.map((x) => <RoundCard key={x.round.id} {...x} />)}
      </section>

      {past.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 지난 공구 {past.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-80">
            {past.map((x) => <RoundCard key={x.round.id} {...x} />)}
          </div>
        </details>
      )}

    </main>
  );
}

function RoundCard({ round: r, summary: s }: { round: Round; summary: PublicSummary }) {
  const status = roundStatus(r, s.totalQty);
  return (
    <Link href={`/groupbuy/r/${r.id}`} className="panel p-4 grid gap-1.5 hover:border-[var(--lane)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={status} />
          {status === "open" && <Countdown deadline={r.deadline} />}
        </div>
        <span className="num text-muted text-sm">{r.minQty > 0 ? `${s.totalQty}/${r.minQty}개` : `${s.totalQty}개 · 수량 무관`}</span>
      </div>
      <h3 className="font-bold text-lg leading-snug">{r.title}</h3>
      <p className="text-sm text-muted">공구 오픈자 {r.opener} · 마감 {fmtDeadline(r.deadline)}</p>
      <PayBadges total={s.participants} paid={s.paidCount} delivered={status === "open" ? undefined : s.deliveredCount} />
    </Link>
  );
}
