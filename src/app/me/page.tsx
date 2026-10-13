import Link from "next/link";
import { CrownIcon } from "@/components/crown";
import { redirect } from "next/navigation";
import { currentUser, isStaffAccount, fmtRaceDate, getMonth, getRaces, kstToday, type RaceFull } from "@/lib/hub";
import { rankMonth, shiftYm, ymOf } from "@/lib/rank";
import { getOrders, listRounds } from "@/lib/db";
import { nickKey, orderTotal, qtyOf, roundStatus, won } from "@/lib/types";
import { changePassword } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 페이지" };

export default async function MyPage() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/me");
  if (isStaffAccount(u)) redirect("/admin");
  const today = kstToday();
  const ym = ymOf(today);
  // 월간 기록은 허브를 시작한 2026년 10월부터, 최근 6개월까지만
  const START_YM = "2026-10";
  const months = Array.from({ length: 6 }, (_, i) => shiftYm(ym, -i)).filter((m) => m >= START_YM);

  const [races, monthRecs, rounds] = await Promise.all([
    getRaces(),
    Promise.all(months.map((m) => getMonth(m))),
    listRounds(100),
  ]);

  // 대회
  const joined = races.filter((r) => r.participants.some((p) => p.nick === u.nick));
  const cheering = races.filter((r) => r.cheers.includes(u.nick) && r.date >= today);
  const upcoming = joined.filter((r) => r.date >= today);
  const past = joined.filter((r) => r.date < today).reverse();

  // 월간 기록 (최근 6개월)
  const monthly = months.map((m, i) => {
    const rows = rankMonth(monthRecs[i]);
    const me = rows.find((r) => r.nick === u.nick);
    return { ym: m, km: me?.km ?? 0, goal: me?.goal ?? 0, rate: me?.rate ?? null, rateRank: me?.rateRank ?? null, days: me ? Object.keys(me.days).length : 0 };
  });
  const thisMonth = monthly[0];

  // 공구 내역: 내가 주문한 것 (로그인 닉네임 또는 주문 닉네임이 같은 것)
  const orderLists = await Promise.all(rounds.map((x) => getOrders(x.round.id)));
  // 내가 연 공구 (관리 화면으로 바로)
  const opened = rounds.filter((x) => (x.round as { openerNick?: string }).openerNick === u.nick || nickKey(x.round.opener) === nickKey(u.nick));
  const myOrders = rounds.flatMap((x, i) =>
    orderLists[i].filter((o) => o.owner === u.nick || nickKey(o.name) === nickKey(u.nick)).map((o) => ({ round: x.round, summary: x.summary, o })));

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <h1 className="hub-h1">{u.admin && <CrownIcon size={22} />}{u.nick} 님</h1>
        <p className="text-sm text-muted">내 대회, 월간 기록, 공구 내역을 모아 봤어요.</p>
        {u.admin && <div className="mt-1"><Link href="/admin" className="btn text-sm">운영진 화면 열기</Link></div>}
      </header>

      <section className="stat-strip">
        <div><span className="label">이번 달</span><b className="num">{thisMonth.km}<small>km</small></b></div>
        <div><span className="label">달성율</span><b className="num">{thisMonth.rate != null ? `${thisMonth.rate}%` : "–"}</b></div>
        <div><span className="label">참가 예정</span><b className="num">{upcoming.length}<small>개</small></b></div>
        <div><span className="label">공구</span><b className="num">{myOrders.length + opened.length}<small>건</small></b></div>
      </section>

      {/* 대회 */}
      <section className="grid gap-2">
        <div className="sec-head"><h2 className="label">참가 예정 대회</h2><Link href="/races?view=mine">대회에서 보기 →</Link></div>
        <div className="row-list">
          {upcoming.length === 0 && <p className="py-4 text-sm text-muted">참가 신청한 대회가 없어요.</p>}
          {upcoming.map((r) => <RaceRow key={r.id} r={r} nick={u.nick} />)}
        </div>
        {cheering.length > 0 && (
          <p className="text-sm text-muted">📣 응원 예정: {cheering.map((r) => `${fmtRaceDate(r.date).md} ${r.name}`).join(", ")}</p>
        )}
        {past.length > 0 && (
          <details className="panel p-4">
            <summary className="font-bold">지난 참가 대회 {past.length}개</summary>
            <div className="grid mt-2">
              {past.map((r) => {
                const d = fmtRaceDate(r.date);
                const c = r.participants.find((p) => p.nick === u.nick)?.course;
                return <div key={r.id} className="flex justify-between gap-2 py-1.5 text-sm"><span className="truncate">{d.y}.{d.md} {r.name}</span><span className="text-muted shrink-0">{c}</span></div>;
              })}
            </div>
          </details>
        )}
      </section>

      {/* 월간 기록 */}
      <section className="grid gap-2">
        <div className="sec-head"><h2 className="label">월간 기록</h2><Link href="/monthly">기록하기 →</Link></div>
        <ol className="board">
          {monthly.map((m) => (
            <li key={m.ym} style={{ gridTemplateColumns: "56px 1fr 92px" }}>
              <span className="b-name">{Number(m.ym.slice(5))}월</span>
              <span className="b-bar" aria-hidden><span className={(m.rate ?? 0) >= 100 ? "done" : ""} style={{ width: `${Math.min(100, m.rate ?? 0)}%` }} /></span>
              <span className="num b-val">{m.km}<span className="text-muted font-normal">/{m.goal || "–"}km</span></span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">이번 달 {thisMonth.days}일 기록{thisMonth.rateRank ? ` · 달성율 ${thisMonth.rateRank}위` : ""}</p>
      </section>

      {/* 공구 */}
      <section className="grid gap-2">
        <div className="sec-head"><h2 className="label">공구 내역</h2><Link href="/groupbuy">공구 보기 →</Link></div>
        <div className="row-list">
          {myOrders.length === 0 && <p className="py-4 text-sm text-muted">주문한 공구가 없어요.</p>}
          {myOrders.map(({ round, summary, o }) => {
            const open = roundStatus(round, summary.totalQty) === "open";
            return (
              <Link key={o.id} href={`/groupbuy/r/${round.id}`} className="row-link">
                <span className="min-w-0 grid gap-0.5">
                  <span className="font-bold truncate">{round.title}</span>
                  <span className="text-sm text-muted truncate">
                    {round.items.filter((it) => o.lines[it.id]).map((it) => `${it.name} ${o.lines[it.id]}`).join(" · ")} · <span className="num">{qtyOf(o.lines)}개 {won(orderTotal(round.items, o.lines))}</span>
                  </span>
                  <span className="flex flex-wrap gap-1 mt-0.5">
                    {open && <span className="chip chip-open">모집중</span>}
                    {o.paid ? <span className="chip chip-confirmed">입금완료</span> : <span className="chip chip-warn">입금대기</span>}
                    {o.delivered ? <span className="chip chip-ship">수령완료</span> : o.paid && <span className="chip chip-warn">수령대기</span>}
                  </span>
                </span>
                <span className="go" aria-hidden>→</span>
              </Link>
            );
          })}
        </div>
      </section>

      {opened.length > 0 && (
        <section className="grid gap-2">
          <h2 className="label">내가 연 공구</h2>
          <div className="row-list">
            {opened.map(({ round, summary }) => (
              <Link key={round.id} href={`/groupbuy/r/${round.id}/manage`} className="row-link">
                <span className="min-w-0 grid gap-0.5">
                  <span className="font-bold truncate">{round.title}</span>
                  <span className="text-sm text-muted">주문 {summary.participants}명 · {summary.totalQty}개 · 입금완료 {summary.paidCount}명</span>
                </span>
                <span className="btn text-xs">관리</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 계정 */}
      <details className="panel p-4">
        <summary className="font-bold">비밀번호 바꾸기</summary>
        <ActionForm action={changePassword} className="grid gap-3 mt-3">
          <label className="field"><span className="label">지금 비밀번호</span><input name="cur" type="text" className="input pw-mask" required autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
          <label className="field"><span className="label">새 비밀번호 (4자 이상)</span><input name="pw" type="text" className="input pw-mask" required minLength={4} autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
          <div><Submit>변경</Submit></div>
        </ActionForm>
      </details>
      <LogoutButton />
    </main>
  );
}

function RaceRow({ r, nick }: { r: RaceFull; nick: string }) {
  const d = fmtRaceDate(r.date);
  const course = r.participants.find((p) => p.nick === nick)?.course;
  const ride = r.afters.find((a) => a.kind === "carpool" && (a.by === nick || a.yes.includes(nick)));
  const party = r.afters.find((a) => (a.kind ?? "after") === "after" && a.yes.includes(nick));
  return (
    <Link href={`/races#${r.id}`} className="flex items-center gap-3 py-3">
      <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
      <span className="min-w-0 grid gap-0.5">
        <span className="font-bold truncate">{r.name}</span>
        <span className="text-sm text-muted truncate">{r.time ? `${r.time} 출발 · ` : ""}{r.place || "장소 미정"}</span>
        <span className="flex flex-wrap gap-1 mt-0.5">
          {course && <span className="chip chip-open">{course}</span>}
          {ride && <span className="chip chip-ship">{ride.by === nick ? "카풀 운전" : "카풀 탑승"}</span>}
          {party && <span className="chip chip-warn">뒷풀이 참석</span>}
        </span>
      </span>
    </Link>
  );
}
