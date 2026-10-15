import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, fmtRaceDate, getMember, getMonth, getRaceRecs, getRaces, isStaffNick, kstToday, memberLabel, recRace } from "@/lib/hub";
import { getOrders, listRounds } from "@/lib/db";
import { nickKey, orderTotal, qtyOf, won } from "@/lib/types";
import { rankMonth, shiftYm, ymOf } from "@/lib/rank";
import { CrownIcon, GearIcon } from "@/components/crown";
import ActivitySummary from "@/components/activity-summary";
import { activityStats } from "@/lib/activity-stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "크루원 현황" };

export default async function MemberProfile({ params }: { params: Promise<{ nick: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.admin) redirect("/");
  const { nick: rawNick } = await params;
  const nick = decodeURIComponent(rawNick);
  const member = await getMember(nick);
  if (!member || isStaffNick(nick)) notFound();

  const today = kstToday();
  const ym = ymOf(today);
  const months = Array.from({ length: 6 }, (_, i) => shiftYm(ym, -i)).filter((month) => month >= "2026-10");
  const [races, monthRecords, records, rounds] = await Promise.all([
    getRaces(), Promise.all(months.map((month) => getMonth(month))), getRaceRecs(nick), listRounds(100),
  ]);
  const orderLists = await Promise.all(rounds.map((round) => getOrders(round.round.id)));
  const orders = rounds.flatMap((round, i) => orderLists[i]
    .filter((order) => order.owner === nick || nickKey(order.name) === nickKey(nick))
    .map((order) => ({ round: round.round, order })));
  const opened = rounds.filter((round) =>
    (round.round as { openerNick?: string }).openerNick === nick || nickKey(round.round.opener) === nickKey(nick));
  const joined = races.filter((race) => race.participants.some((person) => person.nick === nick));
  const upcoming = joined.filter((race) => race.date >= today);
  const past = joined.filter((race) => race.date < today).reverse();
  const raceById = new Map(races.map((race) => [race.id, race]));
  const raceRecords = Object.entries(records).map(([id, record]) => ({ id, record, race: recRace(id, record, raceById) }))
    .filter((entry) => !!entry.race).sort((a, b) => b.race!.date.localeCompare(a.race!.date));
  const activity = activityStats(races, nick, Object.keys(records));
  const monthly = months.map((month, i) => ({ month, row: rankMonth(monthRecords[i]).find((row) => row.nick === nick) }));
  const thisMonth = monthly[0]?.row;

  return (
    <main className="hub-wrap grid gap-5">
      <header className="grid gap-2">
        <Link href="/admin?tab=members" className="text-sm text-muted">← 회원 목록</Link>
        <h1 className="hub-h1">{member.manager ? <GearIcon size={22} /> : member.role === "admin" ? <CrownIcon size={22} /> : null}{memberLabel(member)}</h1>
        <p className="text-sm text-muted">크루원 개인 현황 · 읽기 전용</p>
      </header>

      <section className="stat-strip">
        <div><span className="label">이번 달</span><b className="num">{thisMonth?.km ?? 0}<small>km</small></b></div>
        <div><span className="label">달성율</span><b className="num">{thisMonth?.rate != null ? `${thisMonth.rate}%` : "–"}</b></div>
        <div><span className="label">참가 예정</span><b className="num">{upcoming.length}<small>개</small></b></div>
        <div><span className="label">공구</span><b className="num">{orders.length + opened.length}<small>건</small></b></div>
      </section>

      <ActivitySummary stats={activity} />

      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">참가 예정 대회</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">참가 예정 대회가 없어요.</p>}
        {upcoming.map((race) => <p key={race.id} className="text-sm border-t border-[var(--line)] pt-2">{fmtRaceDate(race.date).y}.{fmtRaceDate(race.date).md} {race.name} · {race.participants.find((person) => person.nick === nick)?.course || "코스 미정"}</p>)}
      </section>

      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">지난 참가 대회 ({past.length})</h2>
        {past.length === 0 && <p className="text-sm text-muted">지난 참가 대회가 없어요.</p>}
        {past.map((race) => <p key={race.id} className="text-sm border-t border-[var(--line)] pt-2">{fmtRaceDate(race.date).y}.{fmtRaceDate(race.date).md} {race.name} · {race.participants.find((person) => person.nick === nick)?.course || "코스 미정"}</p>)}
      </section>

      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">대회 기록</h2>
        {raceRecords.length === 0 && <p className="text-sm text-muted">등록한 기록이 없어요.</p>}
        {raceRecords.map(({ id, record, race }) => <p key={id} className="text-sm border-t border-[var(--line)] pt-2">{race!.name} · {record.course} {record.time || "기록 없음"}{record.note ? ` · ${record.note}` : ""}</p>)}
      </section>

      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">월간 기록</h2>
        {monthly.map(({ month, row }) => <div key={month} className="flex justify-between gap-3 text-sm border-t border-[var(--line)] pt-2"><span>{month}</span><span>{row?.km ?? 0} / {row?.goal || "–"}km · {row?.rate != null ? `${row.rate}%` : "목표 미정"}</span></div>)}
      </section>

      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">공구 내역</h2>
        {orders.length === 0 && opened.length === 0 && <p className="text-sm text-muted">공구 내역이 없어요.</p>}
        {orders.map(({ round, order }) => <div key={`${round.id}:${order.id}`} className="text-sm border-t border-[var(--line)] pt-2"><b>{round.title}</b><p className="text-muted">주문 {qtyOf(order.lines)}개 · {won(orderTotal(round.items, order.lines))} · {order.paid ? "입금완료" : "입금대기"} · {order.delivered ? "수령완료" : "수령대기"}</p></div>)}
        {opened.map(({ round }) => <div key={`opened:${round.id}`} className="text-sm border-t border-[var(--line)] pt-2"><b>{round.title}</b><p className="text-muted">직접 연 공구</p></div>)}
      </section>
    </main>
  );
}
