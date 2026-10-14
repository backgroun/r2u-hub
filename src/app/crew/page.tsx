import Link from "next/link";
import { redirect } from "next/navigation";
import { K, currentUser, getAdminNicks, getAllVs, getMembers, getMonth, isStaffAccount, isStaffNick, kstToday, redis } from "@/lib/hub";
import { rankMonth, shiftYm, ymOf, type RankRow } from "@/lib/rank";
import { manageVersusEnd, setVersus } from "@/app/actions";
import MatchBoard from "@/components/match-board";
import { getVsRequests } from "@/lib/versus";
import { Nick } from "@/components/crown";
import { ActionForm, Submit } from "@/components/action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "크루 현황" };

const r1 = (n: number) => Math.round(n * 10) / 10;
const blank = (nick: string): RankRow => ({ nick, goal: 0, km: 0, rate: null, kmRank: null, rateRank: null, days: {} });

/** 하루 기록에서 뽑은 대결용 숫자 */
function stats(r: RankRow, today: string, ym: string) {
  const entries = Object.entries(r.days).map(([d, v]) => [Number(d), Number(v) || 0] as const).filter(([, v]) => v > 0);
  const best = entries.reduce((a, [, v]) => Math.max(a, v), 0);
  // 이번 달이면 오늘까지 최근 7일 거리
  const t = ym === ymOf(today) ? Number(today.slice(8)) : 31;
  const last7 = entries.filter(([d]) => d > t - 7 && d <= t).reduce((a, [, v]) => a + v, 0);
  return { runDays: entries.length, best: r1(best), last7: r1(last7) };
}

export default async function CrewPage({ searchParams }: { searchParams: Promise<{ m?: string; sort?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const today = kstToday();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : ymOf(today);
  const currentMonth = ym === ymOf(today);
  const sort = sp.sort === "km" ? "km" : sp.sort === "goal" ? "goal" : "rate";
  const staff = isStaffAccount(u);
  const [month, members, admins, allVs, vsReqs] = await Promise.all([getMonth(ym), getMembers(), getAdminNicks(), getAllVs(ym), getVsRequests(ym)]);
  const managers = new Set(members.filter((member) => member.manager).map((member) => member.nick));
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const label = (nick: string) => `${nick}/${names[nick] || "없음"}`;
  const vsNick = staff ? null : (allVs[u.nick] ?? null);
  const [outgoingEnd, incomingEnd] = vsNick ? await Promise.all([
    redis.hget<string>(K.vsEnd(ym), u.nick),
    redis.hget<string>(K.vsEnd(ym), vsNick),
  ]) : [null, null];
  const endRequest = incomingEnd === u.nick ? "incoming" : outgoingEnd === vsNick ? "outgoing" : null;

  // 모든 크루원(관리용 ‘운영진’ 계정 제외). 기록이 없는 사람은 ‘미정’으로 보인다.
  const ranked = new Map(rankMonth(month).map((r) => [r.nick, r]));
  const rows = members.filter((m) => !isStaffNick(m.nick)).map((m) => ranked.get(m.nick) ?? blank(m.nick));
  const sorted = [...rows].sort((a, b) =>
    sort === "km" ? b.km - a.km || b.goal - a.goal
    : sort === "goal" ? b.goal - a.goal || b.km - a.km
    : (b.rate ?? -1) - (a.rate ?? -1) || b.km - a.km || a.nick.localeCompare(b.nick, "ko"));
  const [y, m] = ym.split("-").map(Number);
  const q = (o: Record<string, string>) => `/crew?${new URLSearchParams({ m: ym, sort, ...o })}`;
  const withGoal = rows.filter((r) => r.goal > 0).length;
  const achieved = rows.filter((r) => (r.rate ?? 0) >= 100).length;
  const me = ranked.get(u.nick) ?? blank(u.nick);
  const opp = vsNick ? (ranked.get(vsNick) ?? blank(vsNick)) : null;

  return (
    <main className="hub-wrap" style={{ gap: 20 }}>
      <Link href={`/monthly?m=${ym}`} className="text-sm text-muted">← 월간 기록</Link>
      <header className="flex items-center justify-between gap-3">
        <Link href={q({ m: shiftYm(ym, -1) })} className="btn btn-ghost px-3" aria-label="이전 달">←</Link>
        <div className="text-center">
          <h1 className="hub-h1">{y}년 {m}월 크루 현황</h1>
          <p className="text-xs text-muted">목표 {withGoal}명 설정 · 목표 달성 {achieved}명 · 전체 {rows.length}명</p>
        </div>
        <Link href={q({ m: shiftYm(ym, 1) })} className="btn btn-ghost px-3" aria-label="다음 달">→</Link>
      </header>

      {!staff && <MatchBoard ym={ym} viewer={u.nick} />}

      {!staff && opp && <Versus me={me} opp={opp} today={today} ym={ym} admins={admins} managers={managers} names={names} endRequest={endRequest} />}

      <section className="grid gap-2">
        <div className="sec-head">
          <h2 className="label">전체 크루원 목표 · 달성율</h2>
          <nav className="flex gap-1.5 text-xs" aria-label="정렬">
            {[["rate", "달성율순"], ["km", "거리순"], ["goal", "목표순"]].map(([k, t]) => (
              <Link key={k} href={q({ sort: k })} className={`sort-chip ${sort === k ? "on" : ""}`}>{t}</Link>
            ))}
          </nav>
        </div>
        <ol className="crew-list">
          {sorted.map((r, i) => {
            const rate = r.rate ?? 0;
            const isMe = r.nick === u.nick, isOpp = r.nick === vsNick;
            return (
              <li key={r.nick} className={`${isMe ? "me" : ""} ${isOpp ? "opp" : ""}`}>
                <span className="crew-rank num">{i + 1}</span>
                <div className="min-w-0 grid gap-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate"><Nick n={r.nick} admins={admins} managers={managers} names={names} badgeAfter /></b>
                    {isMe && <span className="chip chip-open">나</span>}
                    {isOpp && <span className="chip chip-failed">⚔️ 내 상대</span>}
                    {allVs[r.nick] && !isMe && (allVs[r.nick] === u.nick ? <span className="chip chip-warn">⚔️ 나와 대결</span> : <span className="chip vs-chip">⚔️ vs {label(allVs[r.nick])}</span>)}
                    {isMe && vsNick && <span className="chip vs-chip">⚔️ vs {label(vsNick)}</span>}
                  </div>
                  <div className="b-bar" aria-hidden><span className={rate >= 100 ? "done" : ""} style={{ width: `${Math.min(100, rate)}%` }} /></div>
                  <span className="text-xs text-muted num">
                    {r.goal > 0 ? <>목표 {r.goal}km · 달린 거리 {r.km}km</> : <>목표 미정 · 달린 거리 {r.km}km</>}
                  </span>
                </div>
                <b className="num crew-rate" style={{ color: rate >= 100 ? "var(--good)" : undefined }}>{r.rate != null ? `${r.rate}%` : "–"}</b>
                {!staff && currentMonth && !isMe && !vsNick && !allVs[r.nick] && (
                  vsReqs[u.nick] === r.nick ? <span className="chip chip-warn">신청 중</span>
                  : vsReqs[r.nick] === u.nick ? <span className="chip chip-open">신청 받음 ↑</span>
                  : vsReqs[u.nick] ? null
                  : (
                    <ActionForm action={setVersus} keep>
                      <input type="hidden" name="ym" value={ym} /><input type="hidden" name="opp" value={r.nick} />
                      <Submit className="btn text-xs py-1 px-2">⚔️ 대결 신청</Submit>
                    </ActionForm>
                  )
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted">달성율 = 이번 달 달린 거리 ÷ 내가 정한 목표. 목표를 정하지 않은 크루원은 달성율이 “–”로 나와요. ⚔️ 대결은 신청한 뒤 상대가 받아줘야 시작되고, 다음 달 1일 0시에 자동으로 종료돼요.</p>
      </section>
    </main>
  );
}

function Versus({ me, opp, today, ym, admins, managers, names, endRequest }: { me: RankRow; opp: RankRow; today: string; ym: string; admins: Set<string>; managers: Set<string>; names: Record<string, string>; endRequest: "incoming" | "outgoing" | null }) {
  const a = stats(me, today, ym), b = stats(opp, today, ym);
  const gap = r1(me.km - opp.km);
  const lead = gap > 0 ? "me" : gap < 0 ? "opp" : "tie";
  const rows: { label: string; a: string; b: string; win: "a" | "b" | "" }[] = [
    { label: "달린 거리", a: `${me.km}km`, b: `${opp.km}km`, win: me.km > opp.km ? "a" : me.km < opp.km ? "b" : "" },
    { label: "달성율", a: me.rate != null ? `${me.rate}%` : "–", b: opp.rate != null ? `${opp.rate}%` : "–", win: (me.rate ?? -1) > (opp.rate ?? -1) ? "a" : (me.rate ?? -1) < (opp.rate ?? -1) ? "b" : "" },
    { label: "이달의 목표", a: me.goal ? `${me.goal}km` : "미정", b: opp.goal ? `${opp.goal}km` : "미정", win: "" },
    { label: "달린 날", a: `${a.runDays}일`, b: `${b.runDays}일`, win: a.runDays > b.runDays ? "a" : a.runDays < b.runDays ? "b" : "" },
    { label: "하루 최고", a: `${a.best}km`, b: `${b.best}km`, win: a.best > b.best ? "a" : a.best < b.best ? "b" : "" },
    { label: "최근 7일", a: `${a.last7}km`, b: `${b.last7}km`, win: a.last7 > b.last7 ? "a" : a.last7 < b.last7 ? "b" : "" },
  ];
  const total = Math.max(0.1, me.km + opp.km);
  return (
    <section className="panel panel-alert p-4 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">⚔️ 이번 달 대결</h2>
        {!endRequest && <ActionForm action={manageVersusEnd}><input type="hidden" name="ym" value={ym} /><input type="hidden" name="act" value="request" /><Submit className="btn btn-ghost text-xs py-1 px-2">대결 끝내기</Submit></ActionForm>}
      </div>
      {endRequest === "outgoing" && <div className="flex items-center justify-between gap-2 text-sm"><p>상대방의 대결 종료 승인을 기다리고 있어요.</p><ActionForm action={manageVersusEnd}><input type="hidden" name="ym" value={ym} /><input type="hidden" name="act" value="cancel" /><Submit className="btn btn-ghost text-xs py-1 px-2">요청 취소</Submit></ActionForm></div>}
      {endRequest === "incoming" && <div className="vs-end-request">
        <p><b>{opp.nick}</b>님이 대결 종료 요청! 이분과</p>
        <ActionForm action={manageVersusEnd}><input type="hidden" name="ym" value={ym} /><input type="hidden" name="act" value="approve" /><Submit className="btn btn-primary">종료승인</Submit></ActionForm>
        <ActionForm action={manageVersusEnd}><input type="hidden" name="ym" value={ym} /><input type="hidden" name="act" value="reject" /><Submit className="btn btn-ghost">거절</Submit></ActionForm>
      </div>}
      <div className="vs-head">
        <b className={`truncate ${lead === "me" ? "win" : ""}`}><Nick n={me.nick} admins={admins} managers={managers} names={names} /></b>
        <span className="vs-x">VS</span>
        <b className={`truncate text-right ${lead === "opp" ? "win" : ""}`}><Nick n={opp.nick} admins={admins} managers={managers} names={names} /></b>
      </div>
      <div className="vs-bar" aria-hidden><span style={{ width: `${(me.km / total) * 100}%` }} /></div>
      <p className="text-center text-sm font-bold">
        {lead === "tie" ? "지금은 동점이에요! 🔥" : lead === "me" ? `${opp.nick}/${names[opp.nick] || "없음"} 님보다 ${Math.abs(gap)}km 앞서 있어요 💪` : `${opp.nick}/${names[opp.nick] || "없음"} 님이 ${Math.abs(gap)}km 앞서 있어요. 따라잡아요! 🏃`}
      </p>
      <div className="vs-table">
        {rows.map((r) => (
          <div key={r.label} className="vs-row">
            <b className={`num ${r.win === "a" ? "win" : ""}`}>{r.a}</b>
            <span>{r.label}</span>
            <b className={`num text-right ${r.win === "b" ? "win" : ""}`}>{r.b}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
