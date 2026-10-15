import Link from "next/link";
import { CrownIcon, GearIcon } from "@/components/crown";
import { redirect } from "next/navigation";
import { driverOf, currentUser, getMember, isStaffAccount, fmtRaceDate, getMonth, getRaceRecs, getRaces, kstToday, memberLabel, recRace, type RaceFull } from "@/lib/hub";
import { rankMonth, shiftYm, ymOf } from "@/lib/rank";
import { greeting } from "@/lib/greeting";
import { getOrders, listRounds } from "@/lib/db";
import { itemLabel, nickKey, orderTotal, qtyOf, roundStatus, won } from "@/lib/types";
import { braggRace, unbragRace, cancelNickChange, changePassword, deleteRaceRecord, requestNickChange, editMyName } from "@/app/actions";
import { getNickChangeRequest } from "@/lib/nickname";
import { liveBrags } from "@/lib/brag";
import RaceRecordForm from "@/components/race-record-form";
import RaceRecordChart from "@/components/race-record-chart";
import ActivitySummary from "@/components/activity-summary";
import { activityStats } from "@/lib/activity-stats";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import LogoutButton from "@/components/logout-button";
import PasswordInput from "@/components/password-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 페이지" };

/** 신청할 때 적은 코스를 기록 폼의 코스 이름으로 맞춘다 */
const courseOf = (c?: string) => {
  const t = (c ?? "").trim().toLowerCase();
  return t === "5k" ? "5K" : t === "10k" ? "10K" : t === "half" || t === "하프" ? "Half" : t === "full" || t === "풀" ? "Full" : "기타";
};

export default async function MyPage({ searchParams }: { searchParams: Promise<{ rec?: string }> }) {
  const recParam = (await searchParams).rec ?? "";
  const u = await currentUser();
  if (!u) redirect("/login?next=/me");
  if (isStaffAccount(u)) redirect("/admin");
  const today = kstToday();
  const ym = ymOf(today);
  // 월간 기록은 허브를 시작한 2026년 10월부터, 최근 6개월까지만
  const START_YM = "2026-10";
  const months = Array.from({ length: 6 }, (_, i) => shiftYm(ym, -i)).filter((m) => m >= START_YM);

  const [races, monthRecs, rounds, recs, nickRequest, member, brags] = await Promise.all([
    getRaces(),
    Promise.all(months.map((m) => getMonth(m))),
    listRounds(100),
    getRaceRecs(u.nick),
    getNickChangeRequest(u.nick),
    getMember(u.nick),
    liveBrags(),
  ]);
  const bragging = new Set(brags.filter((b) => b.nick === u.nick).map((b) => b.key));

  // 대회
  const joined = races.filter((r) => r.participants.some((p) => p.nick === u.nick));
  const cheering = races.filter((r) => r.cheers.includes(u.nick) && r.date >= today);
  const upcoming = joined.filter((r) => r.date >= today);

  // 내 대회 기록: 코스별 최고 기록(PB)과 기록 목록, 기록을 넣을 수 있는 지난 대회(크루 참가로 표시한 대회만)
  const raceById = new Map(races.map((r) => [r.id, r]));
  const recList = Object.entries(recs).map(([id, rec]) => ({ id, rec, race: recRace(id, rec, raceById) })).filter((x): x is { id: string; rec: typeof x.rec; race: { name: string; date: string } } => !!x.race).sort((a, b) => b.race.date.localeCompare(a.race.date));
  const activity = activityStats(races, u.nick, Object.keys(recs));
  const pb = new Map<string, { sec: number; time: string }>();
  for (const { rec } of recList) { if (!rec.sec) continue; const cur = pb.get(rec.course); if (!cur || rec.sec < cur.sec) pb.set(rec.course, { sec: rec.sec, time: rec.time }); }
  const pastAll = races.filter((r) => r.date <= today && r.participants.some((p) => p.nick === u.nick)).sort((a, b) => b.date.localeCompare(a.date));

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
        <h1 className="hub-h1 hub-greeting flex items-center gap-2.5">
          {member?.manager ? <GearIcon size={20} /> : u.admin ? <CrownIcon size={20} /> : null}
          <span className="min-w-0 truncate">{greeting(memberLabel(member ?? u))}</span>
        </h1>
        <p className="text-sm text-muted">내 대회, 월간 기록, 공구 내역을 모아 봤어요.</p>
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
          {upcoming.length === 0 && <p className="py-4 text-sm text-muted">크루 참가로 표시한 대회가 없어요.</p>}
          {upcoming.map((r) => <RaceRow key={r.id} r={r} nick={u.nick} />)}
        </div>
        {cheering.length > 0 && (
          <p className="text-sm text-muted">📣 응원 예정: {cheering.map((r) => `${fmtRaceDate(r.date).md} ${r.name}`).join(", ")}</p>
        )}
      </section>

      {/* 월간 기록 */}
      <section className="grid gap-2">
        <div className="sec-head"><h2 className="label">월간 기록</h2><span className="flex items-center gap-3">
          <Link href="/me/runs" className="btn text-xs !py-1 !px-2.5 inline-flex items-center gap-1.5" style={{ background: "transparent", color: "var(--ink)", border: "1.2px solid var(--ink)", boxShadow: "none" }}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.4" /></svg>
            가민 분석 보기
          </Link>
          <Link href="/monthly">기록하기 →</Link>
        </span></div>
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

      {/* 내 대회 기록 */}
      <section id="race-record" className="grid gap-2 scroll-mt-16">
        {/* 코스별 최고 기록 배지는 제목 줄 오른쪽에 (코스가 여러 개면 오른쪽 정렬로 줄바꿈) */}
        <div className="sec-head" style={{ alignItems: "flex-start", gap: 8 }}>
          <h2 className="label" style={{ paddingTop: 3 }}>내 대회 기록</h2>
          {pb.size > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {[...pb.entries()].map(([c, v]) => <span key={c} className="chip count-badge">🏅 {c} 최고 {v.time}</span>)}
            </div>
          )}
        </div>
        <RaceRecordChart records={recList.map(({ id, rec, race }) => ({ id, race: race.name, date: race.date, course: rec.course, sec: rec.sec, time: rec.time }))} />
        <details className="panel p-4" open={!!recParam && pastAll.some((r) => r.id === recParam)}>
          <summary className="font-bold">+ 대회 기록 추가</summary>
          <RaceRecordForm initialId={pastAll.some((r) => r.id === recParam) ? recParam : ""} races={pastAll.map((r) => ({ id: r.id, label: `${fmtRaceDate(r.date).md} ${r.name}`, course: courseOf(r.participants.find((p) => p.nick === u.nick)?.course) }))} today={today} />
        </details>
        <div className="row-list">
          {recList.length === 0 && <p className="py-4 text-sm text-muted">아직 남긴 대회 기록이 없어요. 위에서 추가해 보세요.</p>}
          {recList.map(({ id, rec, race }) => {
            const d = fmtRaceDate(race.date);
            return (
              <div key={id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-bold truncate">{race.name}</p>
                  <p className="text-xs text-muted">{d.y}.{d.md}{rec.sec ? ` · ${rec.course}` : ""}{rec.note ? ` · ${rec.note}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rec.sec ? <b className="num text-lg">{rec.time}</b> : <span className="chip chip-failed">{rec.course}</span>}
                  {!rec.sec ? null : bragging.has(`${u.nick}|${id}`)
                    ? <form action={unbragRace}><input type="hidden" name="key" value={`${u.nick}|${id}`} /><ConfirmButton className="btn btn-ghost text-xs py-1 px-2" message="홈에 올린 자랑을 내릴까요?">자랑 끄기</ConfirmButton></form>
                    : <ActionForm action={braggRace} keep><input type="hidden" name="id" value={id} /><Submit className="btn text-xs py-1 px-2">🎉 자랑하기</Submit></ActionForm>}
                  <form action={deleteRaceRecord}><input type="hidden" name="id" value={id} /><ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2" label="기록 삭제" message={"이 대회 기록을 삭제할까요?\n되돌릴 수 없어요."}>삭제</ConfirmButton></form>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ActivitySummary stats={activity} />

      {/* 공구 내역: 주문한 공구가 있을 때만 보인다 */}
      {myOrders.length > 0 && (
      <section className="grid gap-2">
        <div className="sec-head"><h2 className="label">공구 내역</h2><Link href="/groupbuy">공구 보기 →</Link></div>
        <div className="row-list">
          {myOrders.map(({ round, summary, o }) => {
            const open = roundStatus(round, summary.totalQty) === "open";
            return (
              <Link key={o.id} href={`/groupbuy/r/${round.id}`} className="row-link">
                <span className="min-w-0 grid gap-0.5">
                  <span className="font-bold truncate">{round.title}</span>
                  <span className="text-sm text-muted truncate">
                    {round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" · ")} · <span className="num">{qtyOf(o.lines)}개 {won(orderTotal(round.items, o.lines))}</span>
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
      )}

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

      {/* 계정: 비밀번호·닉네임·이름 변경을 한 박스에 */}
      <section className="grid gap-2">
      <h2 className="label">계정 설정</h2>
      <div className="panel account-group">
      <details>
        <summary className="font-bold">비밀번호 변경</summary>
        <ActionForm action={changePassword} className="grid gap-3 mt-3">
          <label className="field"><span className="label">지금 비밀번호</span><input name="cur" type="text" className="input pw-mask" required autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
          <div className="field"><span className="label">새 비밀번호 (4자 이상)</span>
            <div className="inline-edit"><PasswordInput name="pw" className="input pw-mask" required minLength={4} data-lpignore="true" /><Submit confirm="비밀번호를 바꿀까요?">변경</Submit></div>
          </div>
        </ActionForm>
      </details>
      <details id="nickname-change">
        <summary className="font-bold">닉네임 변경</summary>
        <div className="grid gap-3 mt-3">
          {nickRequest?.status === "pending" && <p className="text-sm">승인 대기: <b>{nickRequest.newNick}</b></p>}
          {nickRequest?.status === "rejected" && (
            <ActionForm action={cancelNickChange} className="flex items-center justify-between gap-2 text-sm text-[var(--bad)]">
              <span className="min-w-0">‘{nickRequest.newNick}’ 신청 거절{nickRequest.reason ? ` · ${nickRequest.reason}` : ""}</span>
              <Submit className="btn btn-ghost px-2">✓</Submit>
            </ActionForm>
          )}
          <ActionForm action={requestNickChange} className="inline-edit">
            <label className="field"><span className="label">새 닉네임 (2~5자)</span><input name="newNick" className="input" required minLength={2} maxLength={5} defaultValue={nickRequest?.status === "pending" ? nickRequest.newNick : u.nick} /></label>
            <div><Submit>{nickRequest?.status === "pending" ? "신청 내용 바꾸기" : "변경 신청"}</Submit></div>
          </ActionForm>
          {nickRequest?.status === "pending" && <ActionForm action={cancelNickChange} className="grid gap-2"><div><Submit className="btn btn-ghost btn-danger">신청 취소</Submit></div></ActionForm>}
        </div>
      </details>

      <details id="name-change">
        <summary className="font-bold">이름 변경</summary>
        <div className="grid gap-3 mt-3">
          <ActionForm action={editMyName} className="inline-edit" keep>
            <label className="field"><span className="label">새 이름 (1~4자)</span><input name="name" className="input" required maxLength={4} defaultValue={member?.name === "없음" ? "" : member?.name || ""} /></label>
            <div><Submit confirm="이름을 바꿀까요?">이름 저장</Submit></div>
          </ActionForm>
        </div>
      </details>
      </div>
      </section>
      <LogoutButton />
    </main>
  );
}

function RaceRow({ r, nick }: { r: RaceFull; nick: string }) {
  const d = fmtRaceDate(r.date);
  const course = r.participants.find((p) => p.nick === nick)?.course;
  const ride = r.afters.find((a) => a.kind === "carpool" && (driverOf(a) === nick || a.yes.includes(nick)));
  const party = r.afters.find((a) => (a.kind ?? "after") === "after" && a.yes.includes(nick));
  return (
    <Link href={`/races#${r.id}`} className="flex items-center gap-3 py-3">
      <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
      <span className="min-w-0 grid gap-0.5">
        <span className="font-bold truncate">{r.name}</span>
        <span className="text-sm text-muted truncate">{r.time ? `${r.time} 출발 · ` : ""}{r.place || "장소 미정"}</span>
        <span className="flex flex-wrap gap-1 mt-0.5">
          {course && <span className="chip chip-open">{course}</span>}
          {ride && <span className="chip chip-ship">{driverOf(ride) === nick ? "카풀 운전" : "카풀 탑승"}</span>}
          {party && <span className="chip chip-warn">뒷풀이 참석</span>}
        </span>
      </span>
    </Link>
  );
}
