import Link from "next/link";
import { listRounds, type MyOrderInfo } from "@/lib/db";
import { fmtDeadline, isPastRound, nickKey, roundStatus, won, type PublicSummary, type Round } from "@/lib/types";
import { Countdown, PayBadges, StatusChip } from "@/components/ui";
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
  // 관리 버튼: 내가 연 공구(또는 운영진)에만 카드 안에 보인다
  const canManage = (r: Round) => !!u && (u.admin || (!!nick && ((r as { openerNick?: string }).openerNick === nick || nickKey(r.opener) === nickKey(nick))));
  const roundsBlock = (
    <>
      <section className="grid gap-3">
        <h2 className="label">진행 중인 공구</h2>
        {current.length === 0 && (
          <div className="panel p-5 text-muted text-sm">
            아직 열린 공구가 없어요. 오른쪽 위 ‘+ 새 공구’로 첫 공구를 만들어 보세요.
          </div>
        )}
        {current.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} canManage={canManage(x.round)} names={names} />)}
      </section>

      {past.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 지난 공구 {past.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-80">
            {past.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} canManage={canManage(x.round)} names={names} />)}
          </div>
        </details>
      )}

      {archived.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 보관한 공구 {archived.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-70">
            {archived.map((x) => <RoundCard key={x.round.id} round={x.round} summary={x.summary} mine={x.mine} canManage={canManage(x.round)} names={names} />)}
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

/** 공구 카드: 위쪽은 공구 요약(누르면 주문 화면), 아래쪽 한 줄에 내 주문 상태와 관리 버튼을 함께 둔다 */
function RoundCard({ round: r, summary: s, mine, canManage, names }: { round: Round; summary: PublicSummary; mine: MyOrderInfo | null; canManage: boolean; names: Record<string, string> }) {
  const status = roundStatus(r, s.totalQty);
  return (
    <div className="panel p-3.5 grid gap-2.5">
      <Link href={`/groupbuy/r/${r.id}`} className="grid gap-2">
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
      {(mine || canManage) && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-2.5">
          {mine ? (
            <Link href={`/groupbuy/r/${r.id}`} className="flex items-center gap-2 min-w-0" aria-label="내 주문 보기">
              <span className="text-xs text-muted shrink-0">내 주문</span>
              <b className="num text-sm">{won(mine.total)}</b>
              <MineChip m={mine} />
            </Link>
          ) : <span />}
          {canManage && <Link href={`/groupbuy/r/${r.id}/manage`} className="btn text-sm shrink-0">관리</Link>}
        </div>
      )}
    </div>
  );
}
