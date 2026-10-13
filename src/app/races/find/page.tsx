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

export default async function FindRaces({ searchParams }: { searchParams: Promise<{ area?: string; q?: string }> }) {
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
  const shown = list.filter((r) => r.date >= today && (!q || r.name.includes(q) || r.place.includes(q)));
  const href = (o: Record<string, string>) => `/races/find?${new URLSearchParams({ area, ...(q ? { q } : {}), ...o })}`;

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/races" className="text-sm text-muted">← 대회 일정</Link>
        <h1 className="hub-h1">대회 찾기</h1>
        <p className="text-sm text-muted">
          마라톤온라인 대회를 우리 일정에 바로 추가해요.
        </p>
      </header>

      <section className="grid gap-2.5">
        {/* 지역: 가까운 곳 먼저, 옆으로 밀어서 전체 지역 */}
        <ScrollToCurrent selector="#area-chips" />
        <nav id="area-chips" className="chip-scroll" aria-label="지역">
          {[...NEAR, ...Object.keys(AREAS).filter((a) => !NEAR.includes(a))].map((a) => (
            <Link key={a} href={href({ area: a })} aria-current={a === area ? "page" : undefined}>{a}</Link>
          ))}
        </nav>
        <form action="/races/find" className="search-row">
          <input type="hidden" name="area" value={area} />
          <input name="q" defaultValue={q} className="input" placeholder="대회명·장소 검색" aria-label="대회명·장소 검색" />
          <button className="btn btn-primary">검색</button>
        </form>
      </section>

      {error && <p className="panel p-4 text-sm text-[var(--bad)]">{error} 잠시 후 다시 열어 주세요.</p>}
      {!error && shown.length === 0 && <p className="text-sm text-muted">{area}에 예정된 대회가 없어요.</p>}

      <div className="row-list">
        {shown.map((r) => {
          const d = fmtRaceDate(r.date);
          const isAdded = added.has(`no:${r.no}`) || added.has(`${r.name}|${r.date}`);
          return (
            <div key={r.no} className="find-row">
              <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
              <div className="min-w-0 grid gap-1">
                <a href={viewUrl(r.no)} target="_blank" rel="noopener noreferrer" className="font-bold leading-snug hover:underline">{r.name} ↗</a>
                <span className="text-sm text-muted">{r.courses}</span>
                <span className="text-sm text-muted">{r.place}{r.host ? ` · ${r.host}` : ""}</span>
                <div className="flex justify-end mt-1">
                  {isAdded ? (
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
        })}
      </div>
      <p className="text-xs text-muted">출처: <a href="http://www.roadrun.co.kr/schedule/list.php" target="_blank" rel="noopener noreferrer" className="underline">마라톤온라인 대회일정</a> · 6시간마다 새로 불러와요.</p>
    </main>
  );
}
