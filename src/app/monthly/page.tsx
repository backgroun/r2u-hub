import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, getAdminNicks, getMembers, isStaffAccount, isStaffNick, getMonth, kstToday, WEEK, GOAL_EDIT_LIMIT } from "@/lib/hub";
import GoalPicker from "./goal-picker";
import { rankMonth, shiftYm, ymOf, type RankRow } from "@/lib/rank";
import { setDay } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Nick } from "@/components/crown";

export const dynamic = "force-dynamic";
export const metadata = { title: "월간 기록" };

const r1 = (n: number) => Math.round(n * 10) / 10;
/** 달력 칸 진하기: 0 / ~5 / ~10 / ~15 / 15km+ */
const heat = (km: number) => (km <= 0 ? 0 : km < 5 ? 1 : km < 10 ? 2 : km < 15 ? 3 : 4);

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ m?: string; sort?: string; who?: string; day?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const today = kstToday();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : ymOf(today);
  const sort = sp.sort === "km" ? "km" : "rate";
  const [month, admins, members] = await Promise.all([getMonth(ym), getAdminNicks(), getMembers()]);
  const managers = new Set(members.filter((member) => member.manager).map((member) => member.nick));
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const who = u.nick;
  const staff = isStaffAccount(u);

  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const isNow = ym === ymOf(today);
  const isPast = ym < ymOf(today);
  const todayDay = Number(today.slice(8));
  const daysLeft = isNow ? last - todayDay + 1 : isPast ? 0 : last;

  // 관리용 ‘운영진’ 계정 기록은 크루 합계·순위에서 뺀다
  const all = rankMonth(Object.fromEntries(Object.entries(month).filter(([n]) => !isStaffNick(n) || n === who)));
  const rows = all.filter((r) => (r.goal > 0 || r.km > 0) && !isStaffNick(r.nick));
  const me: RankRow = all.find((r) => r.nick === who) ?? { nick: who, goal: 0, km: 0, rate: null, kmRank: null, rateRank: null, days: {} };
  const crewKm = r1(rows.reduce((a, r) => a + r.km, 0));
  const achieved = rows.filter((r) => (r.rate ?? 0) >= 100).length;
  const topKm = [...rows].sort((a, b) => b.km - a.km)[0];

  const sorted = [...rows].sort((a, b) =>
    sort === "km" ? b.km - a.km || b.goal - a.goal
    : (b.rate ?? -1) - (a.rate ?? -1) || b.km - a.km);
  const ranked = sorted.filter((r) => r.km > 0);
  const waiting = sorted.filter((r) => r.km <= 0);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const pct = me.rate ?? 0;
  const remain = Math.max(0, r1(me.goal - me.km));
  const perDay = daysLeft > 0 && remain > 0 ? r1(remain / daysLeft) : 0;
  // 달력에서 고른 날 (기본: 이번 달이면 오늘)
  // 달력에서 고른 날 (기본: 이번 달이면 오늘). 오늘 이후 날짜는 고를 수 없다
  const maxDay = isPast ? last : isNow ? todayDay : 0;
  const editDay = Number(sp.day) >= 1 && Number(sp.day) <= maxDay ? Number(sp.day) : isNow ? todayDay : null;
  const q = (o: Record<string, string>) => `/monthly?${new URLSearchParams({ m: ym, sort, ...(who !== u.nick ? { who } : {}), ...o })}`;
  const mine = who === u.nick;

  return (
    <main className="hub-wrap" style={{ gap: 22 }}>
      {/* 월 이동 */}
      <header className="flex items-center justify-between gap-3">
        <Link href={q({ m: shiftYm(ym, -1) })} className="btn btn-ghost px-3" aria-label="이전 달">←</Link>
        <div className="text-center">
          <h1 className="hub-h1">{y}년 {m}월</h1>
        </div>
        <Link href={q({ m: shiftYm(ym, 1) })} className="btn btn-ghost px-3" aria-label="다음 달">→</Link>
      </header>

      {/* 크루 전체 목표·달성율, 한 명과 대결 */}
      <Link href={`/crew?m=${ym}`} className="vs-banner keep-motion" aria-label="크루 현황 보기, 한 명과 대결하기">
        <span className="vs-bgL" aria-hidden /><span className="vs-bgR" aria-hidden />
        <span className="vs-grit" aria-hidden />
        <span className="vs-bolt" aria-hidden />
        <span className="vs-burst" aria-hidden />
        <span className="vs-side vs-l" data-text="크루 현황"><b>크루 현황</b></span>
        <span className="vs-badge" aria-hidden><i>VS</i></span>
        <span className="vs-side vs-r" data-text="한판 붙자"><b>한판 붙자</b></span>
        <span className="vs-flash" aria-hidden />
      </Link>

      {/* 크루 요약 */}
      <section className="stat-strip">
        <div><span className="label">크루 합계</span><b className="num">{crewKm}<small>km</small></b></div>
        <div><span className="label">참여</span><b className="num">{ranked.length}<small>명</small></b></div>
        <div><span className="label">목표 달성</span><b className="num">{achieved}<small>명</small></b></div>
        <div><span className="label">거리 1위</span><b className="truncate">{topKm?.km ? `${topKm.nick}/${names[topKm.nick] || "없음"}` : "–"}</b></div>
      </section>

      {staff ? (
        <p className="panel p-4 text-sm text-muted">운영진 모드에서는 개인 기록을 입력하지 않아요. 크루원 기록은 운영진 → 게시물 → 월간 기록에서 고칠 수 있어요.</p>
      ) : (<>
      {/* 내 기록 */}
      <section className="panel p-4 grid gap-4">
        <div className="flex items-start gap-4">
          <div className="ring" style={{ ["--p" as string]: Math.min(100, pct) }} aria-label={`달성율 ${pct}%`}>
            <span className="num">{me.goal ? `${pct}%` : "–"}</span>
          </div>
          <div className="min-w-0 grid gap-1" style={{ flex: 1 }}>
            <p className="label">내 기록</p>
            <p className="num text-3xl font-bold leading-none">{me.km}<span className="text-base text-muted"> / {me.goal || "–"} km</span></p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {me.rateRank && <span className="chip chip-open">달성율 {me.rateRank}위</span>}
              {me.kmRank && <span className="chip chip-ship">거리 {me.kmRank}위</span>}
              {pct >= 100 && <span className="chip chip-confirmed">목표 달성 🎉</span>}
            </div>
          </div>
          <div className="goal-badge">
            <span className="label">이달의 목표</span>
            <b className="num">{me.goal ? `${me.goal}km` : "미정"}</b>
          </div>
        </div>

        {me.goal > 0 && pct < 100 && daysLeft > 0 && (
          <p className="text-sm">
            목표까지 <b className="num">{remain}km</b> 남았어요. 남은 {daysLeft}일 동안 <b className="num">하루 {perDay}km</b>씩 달리면 돼요.
          </p>
        )}

        <GoalPicker ym={ym} goal={me.goal} editsLeft={GOAL_EDIT_LIMIT - (month[who]?.goalEdits ?? 0)} limit={GOAL_EDIT_LIMIT} />
      </section>

      {/* 달력 */}
      <section className="grid gap-2">
        <div className="sec-head">
          <h2 className="label">{mine ? "내 달력" : `${who} 님 달력`}</h2>
          <span className="text-xs text-muted">날짜를 누르고 그날 달린 거리를 입력하세요</span>
        </div>
        <div className="cal cal-head" aria-hidden>{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="cal">
          {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: last }, (_, i) => {
            const d = i + 1;
            const km = Number(me.days[d]) || 0;
            const future = d > maxDay;
            if (future) return (
              <span key={d} className="heat future" aria-disabled="true"><span>{d}</span></span>
            );
            return (
              <Link key={d} href={q({ day: String(d) })} scroll={false}
                className={`heat h${heat(km)} ${isNow && d === todayDay ? "today" : ""} ${editDay === d ? "sel" : ""}`}>
                <span>{d}</span>{km ? <b className="num">{km}</b> : null}
              </Link>
            );
          })}
        </div>
        {editDay ? (
          <ActionForm key={editDay} action={setDay} className="day-edit" keep>
            <input type="hidden" name="ym" value={ym} />
            <input type="hidden" name="nick" value={who} />
            <input type="hidden" name="day" value={editDay} />
            <span className="day-edit-date">{m}/{editDay}({WEEK[new Date(y, m - 1, editDay).getDay()]}) 입력</span>
            <input name="km" type="number" inputMode="decimal" step="0.01" min={0} max={300} className="input day-edit-km"
              defaultValue={me.days[editDay] ?? ""} placeholder="km (0이면 삭제)" required aria-label={`${m}월 ${editDay}일 달린 거리 km`} />
            <Submit>{me.days[editDay] ? "수정" : "저장"}</Submit>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted">{maxDay === 0 ? "아직 오지 않은 달이라 기록할 수 없어요." : "기록할 날짜를 달력에서 눌러 주세요."}</p>
        )}
      </section>

      </>)}

      {/* 순위 */}
      <section className="grid gap-3">
        <div className="sec-head">
          <h2 className="label">크루 순위</h2>
          <nav className="tabs" aria-label="정렬">
            <Link href={q({ sort: "rate" })} aria-current={sort === "rate" ? "page" : undefined}>달성율</Link>
            <Link href={q({ sort: "km" })} aria-current={sort === "km" ? "page" : undefined}>거리</Link>
          </nav>
        </div>

        {ranked.length === 0 ? (
          <p className="text-sm text-muted">이 달에는 아직 기록이 없어요. 첫 기록을 남겨 보세요.</p>
        ) : (
          <>
            <div className="podium">
              {[podium[1], podium[0], podium[2]].map((r, i) => r && (
                <div key={r.nick} className={`pod p${[2, 1, 3][i]} ${r.nick === u.nick ? "me" : ""}`}>
                  <span className="pod-rank num">{[2, 1, 3][i]}</span>
                  <b className="truncate"><Nick n={r.nick} admins={admins} managers={managers} names={names} badgeAfter /></b>
                  <span className="num">{sort === "km" ? `${r.km}km` : `${r.rate ?? "–"}%`}</span>
                  <small className="num text-muted">{sort === "km" ? (r.goal ? `${r.rate}%` : "목표 없음") : `${r.km}/${r.goal}km`}</small>
                </div>
              ))}
            </div>
            <ol className="board" start={4}>
              {rest.map((r, i) => (
                <li key={r.nick} className={r.nick === u.nick ? "me" : ""}>
                  <span className="num b-rank">{i + 4}</span>
                  <span className="b-name truncate"><Nick n={r.nick} admins={admins} managers={managers} names={names} badgeAfter /></span>
                  <span className="b-bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, sort === "km" ? (r.km / (ranked[0]?.km || 1)) * 100 : (r.rate ?? 0) / 1.2)}%` }} className={(r.rate ?? 0) >= 100 ? "done" : ""} />
                    {sort === "rate" && <i style={{ left: `${100 / 1.2}%` }} />}
                  </span>
                  <span className="num b-val">{sort === "km" ? `${r.km}km` : `${r.rate ?? "–"}%`}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {waiting.length > 0 && (
          <p className="text-xs text-muted">목표만 정하고 아직 기록 없음: {waiting.map((r) => r.nick).join(", ")}</p>
        )}
      </section>

    </main>
  );
}
