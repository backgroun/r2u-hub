import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, fmtRaceDate, getRaces, kstToday } from "@/lib/hub";
import { AREAS, listExternal, viewUrl, type ExtRace } from "@/lib/roadrun";
import { addExternalRace } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import ScrollToCurrent from "@/components/scroll-current";

export const dynamic = "force-dynamic";
export const metadata = { title: "대회 찾기" };

const NEAR = ["울산", "부산", "경남", "경북", "대구"];

export default async function FindRaces({ searchParams }: { searchParams: Promise<{ area?: string; q?: string; view?: string; m?: string; d?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const today = kstToday();
  const area = sp.area && sp.area in AREAS ? sp.area : "울산";
  const thisYear = Number(today.slice(0, 4));
  const q = (sp.q ?? "").trim();

  // 지난 대회는 빼고, 올해와 내년 일정을 이어서 보여 준다
  let list: ExtRace[] = [];
  let error = "";
  try {
    const [a, b] = await Promise.all([listExternal(area, thisYear), listExternal(area, thisYear + 1).catch(() => [] as ExtRace[])]);
    list = [...a, ...b];
  } catch (e) { error = e instanceof Error ? e.message : "불러오지 못했어요."; }
  const mine = await getRaces();
  const added = new Set(mine.flatMap((r) => [r.src ? `no:${r.src}` : "", `${r.name}|${r.date}`]));
  const matches = (r: ExtRace) => !q || r.name.includes(q) || r.place.includes(q);
  const cal = sp.view === "cal";
  const shown = list.filter((r) => r.date >= today && matches(r));
  const href = (o: Record<string, string>) => `/races/find?${new URLSearchParams({ area, ...(q ? { q } : {}), ...(cal ? { view: "cal" } : {}), ...o })}`;
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const isAdded = (r: ExtRace) => added.has(`no:${r.no}`) || added.has(`${r.name}|${r.date}`);

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/races" className="text-sm text-muted">← 대회 일정</Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="hub-h1">대회 찾기</h1>
          <Link href={`/races/new${q ? `?${new URLSearchParams({ name: q })}` : ""}`} className="btn btn-primary text-sm py-1.5 px-3 shrink-0">+ 직접 등록</Link>
        </div>
        <p className="text-sm text-muted">
          마라톤온라인 대회를 우리 일정에 바로 추가해요.
        </p>
      </header>

      <section className="grid gap-2.5">
        {/* 지역: 가까운 곳 먼저, 옆으로 밀어서 전체 지역 */}
        <ScrollToCurrent selector="#area-chips" />
        <nav id="area-chips" className="chip-scroll" aria-label="지역">
          {["전국", ...NEAR, ...Object.keys(AREAS).filter((a) => a !== "전국" && !NEAR.includes(a))].map((a) => (
            <Link key={a} href={href({ area: a })} aria-current={a === area ? "page" : undefined}>{a}</Link>
          ))}
        </nav>
        <form action="/races/find" className="search-row">
          <input type="hidden" name="area" value={area} />
          {cal && <input type="hidden" name="view" value="cal" />}
          <input name="q" defaultValue={q} className="input" placeholder="대회명·장소 검색" aria-label="대회명·장소 검색" />
          <button className="btn btn-primary">검색</button>
        </form>
      </section>

      <nav className="tabs" aria-label="보기 방식">
        <Link href={`/races/find?${new URLSearchParams({ area, ...(q ? { q } : {}) })}`} aria-current={!cal ? "page" : undefined}>목록</Link>
        <Link href={`/races/find?${new URLSearchParams({ area, ...(q ? { q } : {}), view: "cal" })}`} aria-current={cal ? "page" : undefined}>달력</Link>
      </nav>

      {error && <p className="panel p-4 text-sm text-[var(--bad)]">{error} 잠시 후 다시 열어 주세요.</p>}
      {!error && !cal && shown.length === 0 && (
        <div className="panel panel-alert p-5 grid gap-3 justify-items-center text-center">
          <p className="font-bold">검색 결과가 없습니다.</p>
          <p className="text-sm text-muted">{area === "전국" ? "전국에" : `${area}에`} {q ? `‘${q}’에 맞는 ` : ""}예정된 대회가 없어요. 직접 등록해 주세요.</p>
          <Link href={`/races/new${q ? `?${new URLSearchParams({ name: q })}` : ""}`} className="btn btn-primary">+ 직접 등록하기</Link>
        </div>
      )}

      {cal ? (
        !error && <FindCalendar races={list.filter(matches)} today={today} ym={ym} day={sp.d} href={href} isAdded={isAdded} />
      ) : (
        <div className="row-list">
          {shown.map((r) => <FindRow key={r.no} r={r} added={isAdded(r)} />)}
        </div>
      )}
      <p className="text-xs text-muted text-center">출처: <a href="http://www.roadrun.co.kr/schedule/list.php" target="_blank" rel="noopener noreferrer" className="underline">마라톤온라인 대회일정</a> · 6시간마다 새로 불러와요.</p>
    </main>
  );
}

function FindRow({ r, added }: { r: ExtRace; added: boolean }) {
  const d = fmtRaceDate(r.date);
  return (
    <div className="find-row">
      <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
      <div className="min-w-0 grid gap-1">
        <a href={viewUrl(r.no)} target="_blank" rel="noopener noreferrer" className="font-bold leading-snug hover:underline">{r.name} ↗</a>
        <span className="text-sm text-muted">{r.courses}</span>
        <span className="text-sm text-muted">{r.place}{r.host ? ` · ${r.host}` : ""}</span>
        <div className="flex justify-end mt-1">
          {added ? (
            <span className="chip chip-confirmed">우리 일정에 있음</span>
          ) : (
            <ActionForm action={addExternalRace} className="grid gap-1 justify-items-end" keep>
              <input type="hidden" name="no" value={r.no} />
              <Submit className="btn text-sm py-1 px-3">+ 우리 일정에 추가</Submit>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 달력 보기: 선택한 지역의 대회를 한 달 칸에 보여 주고, 날짜를 누르면 그날 대회가 아래에 열린다 */
function FindCalendar({ races, today, ym, day, href, isAdded }: { races: ExtRace[]; today: string; ym: string; day?: string; href: (o: Record<string, string>) => string; isAdded: (r: ExtRace) => boolean }) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();
  const shift = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const byDay = new Map<number, ExtRace[]>();
  races.filter((r) => r.date.startsWith(ym)).forEach((r) => { const d = Number(r.date.slice(8)); byDay.set(d, [...(byDay.get(d) ?? []), r]); });
  const isThis = today.startsWith(ym);
  const sel = Number(day) || 0;
  const picked = byDay.get(sel) ?? [];
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <Link href={href({ m: shift(-1), d: "" })} className="btn btn-ghost px-3" aria-label="이전 달">←</Link>
        <h2 className="font-bold text-lg">{y}년 {m}월 <span className="text-sm text-muted font-normal">대회 {[...byDay.values()].flat().length}개</span></h2>
        <Link href={href({ m: shift(1), d: "" })} className="btn btn-ghost px-3" aria-label="다음 달">→</Link>
      </div>
      <div className="rcal">
        {WEEK.map((w, i) => <span key={w} className={`rcal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: last }, (_, i) => {
          const d = i + 1;
          const rs = byDay.get(d) ?? [];
          const dow = (first + i) % 7;
          return (
            <Link key={d} href={href({ m: ym, d: String(d) })} scroll={false}
              className={`rcal-d ${rs.length ? "has" : ""} ${isThis && d === Number(today.slice(8)) ? "today" : ""} ${sel === d ? "sel" : ""}`}>
              <span className={`rcal-n ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}>{d}</span>
              {rs.slice(0, 2).map((r) => (
                <span key={r.no} className={`rcal-r ${isAdded(r) ? "mine" : ""}`}>{r.name.replace(/^(제?\d+회|20\d\d)\s*/, "")}</span>
              ))}
              {rs.length > 2 && <span className="rcal-more">+{rs.length - 2}</span>}
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-muted">진하게 칠한 대회는 이미 우리 일정에 있는 대회예요.</p>
      {sel > 0 && (
        <div className="grid gap-3">
          <h3 className="label">{m}월 {sel}일 대회</h3>
          {picked.length === 0 && <p className="text-sm text-muted">이날은 대회가 없어요.</p>}
          <div className="row-list">{picked.map((r) => <FindRow key={r.no} r={r} added={isAdded(r)} />)}</div>
        </div>
      )}
    </section>
  );
}
