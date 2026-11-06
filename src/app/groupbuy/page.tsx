import Link from "next/link";
import { listRounds, type MyOrderInfo } from "@/lib/db";
import { fmtDeadline, isPastRound, roundStatus, won, type PublicSummary, type Round } from "@/lib/types";
import { Countdown, PayBadges, StatusChip } from "@/components/ui";
import MyRounds from "./my-rounds";
import Polls from "./polls";
import { isPollOpen, listPolls } from "@/lib/groupbuy-poll";
import { currentUser, getMembers, isStaffNick } from "@/lib/hub";
import { knownMemberLabel } from "@/lib/member-label";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  const nick = u && !isStaffNick(u.nick) ? u.nick : undefined; // 관리용 ‘운영진’ 계정은 제외
  const [rounds, members, polls] = await Promise.all([listRounds(100, nick), getMembers(), listPolls().catch(() => [])]);
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const now = Date.now();
  const hasOpenPoll = polls.some((p) => isPollOpen(p, now)); // 진행 중인 투표가 있으면 투표를, 없으면 공구 목록을 위에 둔다
  const archived = rounds.filter((x) => x.round.archived); // 공구 오픈자가 보관함으로 옮긴 공구
  const live = rounds.filter((x) => !x.round.archived);
  const past = live.filter((x) => isPastRound(x.round.deadline, now));
  const current = live.filter((x) => !past.includes(x));
  const mine = live.filter((x) => x.mine); // 내가 주문한 공구를 맨 위에 모아 보여 준다
  const roundsBlock = (
    <>
      {mine.length > 0 && (
        <section className="grid gap-3" aria-label="내 주문">
          <h2 className="label">내 주문 {mine.length}건</h2>
          {mine.map((x) => <MineCard key={x.round.id} round={x.round} mine={x.mine!} />)}
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="label">진행 중인 공구</h2>
        {current.length === 0 && (
          <div className="panel p-5 text-muted text-sm">
            아직 열린 공구가 없어요. 오른쪽 위 ‘+ 새 공구’로 첫 공구를 만들어 보세요.
          </div>
        )}
        {current.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} names={names} />)}
      </section>

      {past.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 지난 공구 {past.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-80">
            {past.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} names={names} />)}
          </div>
        </details>
      )}

      {archived.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 보관한 공구 {archived.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-70">
            {archived.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} names={names} />)}
          </div>
        </details>
      )}
    </>
  );
  return (
    <main className="wrap grid gap-6">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="hub-h1">R2U 크루 공구</h1>
        <Link href="/groupbuy/new" className="btn btn-primary text-sm shrink-0">+ 새 공구</Link>
      </header>

      <MyRounds />

      {hasOpenPoll && <Polls />}

      {roundsBlock}

      {!hasOpenPoll && <Polls />}

    </main>
  );
}

/** 내 주문 상태 칩: 입금 전 / 입금완료 / 수령완료 */
function MineChip({ m }: { m: MyOrderInfo }) {
  return m.delivered ? <span className="chip chip-ship">수령완료</span> : m.paid ? <span className="chip chip-confirmed">입금완료</span> : <span className="chip chip-warn">입금 전</span>;
}

function MineCard({ round: r, mine: m }: { round: Round; mine: MyOrderInfo }) {
  return (
    <Link href={`/groupbuy/r/${r.id}`} className="panel p-3.5 flex items-center justify-between gap-3 hover:border-[var(--lane)]">
      <span className="min-w-0 grid leading-snug">
        <b className="truncate">{r.title}</b>
        <span className="text-xs text-muted num">{won(m.total)} · 마감 {fmtDeadline(r.deadline)}</span>
      </span>
      <MineChip m={m} />
    </Link>
  );
}

function RoundCard({ round: r, summary: s, mine, names }: { round: Round; summary: PublicSummary; mine: MyOrderInfo | null; names: Record<string, string> }) {
  const status = roundStatus(r, s.totalQty);
  return (
    <Link href={`/groupbuy/r/${r.id}`} className="panel p-3.5 grid gap-2 hover:border-[var(--lane)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mine && <span className="chip chip-confirmed">내 주문 ✓</span>}
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
