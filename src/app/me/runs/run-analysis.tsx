import Link from "next/link";
import { analyzeRuns, weekStart, type Group, type RunLike } from "@/lib/garmin/analysis";
import { fmtDur, fmtPace } from "@/lib/garmin/aggregate";
import { BarChart, Donut, HBars, InfoTip, LineChart } from "@/components/run-charts";
import { PRESETS, type Range } from "@/lib/garmin/range";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const won = (n: number | null) => (n == null ? "–" : n.toLocaleString("ko-KR"));
const sign = (n: number, unit: string, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10 ** d) / 10 ** d)}${unit}`;

/** info: 제목 옆 (i) 도움말 풍선에 들어갈 설명 */
function Chart({ title, sub, info, children }: { title: string; sub?: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-3.5 grid gap-2.5" style={{ overflow: "visible" }}>
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <span aria-hidden style={{ width: 4, height: 15, borderRadius: 2, background: "linear-gradient(var(--lane), var(--bib))" }} />
          {title}
          {info && <InfoTip text={info} />}
        </h3>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function SurfaceCard({ name, g }: { name: string; g: Group }) {
  return (
    <div className="panel p-3 grid gap-0.5 text-sm">
      <b>{name}</b>
      {g.runs ? (
        <>
          <span className="num">{g.km}km · {g.runs}회</span>
          <span className="num text-muted text-xs">{fmtPace(g.avgPaceSec)}/km{g.avgHr ? ` · 심박 ${g.avgHr}` : ""}{g.avgCadence ? ` · 케이던스 ${g.avgCadence}` : ""}</span>
        </>
      ) : <span className="text-muted text-xs">기록 없음</span>}
    </div>
  );
}

/** 가민 기록 분석: 의심 기록을 뺀 러닝만 받는다 */
function RangePicker({ range }: { range: Range }) {
  return (
    <div className="panel p-3 grid gap-2">
      <nav className="tabs" aria-label="분석 기간" style={{ flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <Link key={p.key} href={p.key === "all" ? "/me/runs" : `/me/runs?range=${p.key}`} scroll={false} aria-current={range.key === p.key ? "page" : undefined}>{p.label}</Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">직접 정하기</span>
        <input type="date" name="from" className="input" style={{ width: "auto", minHeight: 34 }} defaultValue={range.key === "custom" ? range.from ?? "" : ""} aria-label="시작일" />
        <span>~</span>
        <input type="date" name="to" className="input" style={{ width: "auto", minHeight: 34 }} defaultValue={range.key === "custom" ? range.to ?? "" : ""} aria-label="종료일" />
        <button type="submit" className="btn btn-primary" style={{ minHeight: 34 }}>적용</button>
      </form>
    </div>
  );
}

/** 가민 기록 분석: 의심 기록을 뺀 러닝 중 고른 기간의 것만 받는다 */
export default function RunAnalysis({ runs, range, hasRuns, variant = "page" }: { runs: RunLike[]; range: Range; hasRuns: boolean; variant?: "page" | "month" }) {
  const month = variant === "month"; // 월간기록 화면: 그 달만 보여 주므로 기간 선택·월별 막대는 뺀다
  if (!hasRuns) return null;
  const a = analyzeRuns(runs);
  if (!a) return (
    <section className="grid gap-3">
      <div className="sec-head"><h2 className="label">분석</h2><span className="text-xs text-muted">{range.label}</span></div>
      {!month && <RangePicker range={range} />}
      <p className="panel p-4 text-sm text-muted">이 기간에는 러닝 기록이 없어요. 다른 기간을 골라 보세요.</p>
    </section>
  );
  const { total: t, highlights: h } = a;
  const withHr = a.trend.filter((p) => p.avgHr != null);
  const withCad = a.trend.filter((p) => p.avgCadence != null);
  const withEff = a.trend.filter((p) => p.efficiency != null);
  const insights: string[] = [];
  if (a.recent) {
    const { current: c, previous: p } = a.recent;
    insights.push(`최근 4주 ${c.km}km (${c.runs}회) — 그 앞 4주(${p.km}km, ${p.runs}회)보다 ${sign(c.km - p.km, "km")}`);
    if (c.avgPaceSec && p.avgPaceSec) {
      const d = c.avgPaceSec - p.avgPaceSec;
      insights.push(d === 0 ? "평균 페이스는 그대로예요" : `평균 페이스 ${fmtPace(c.avgPaceSec)}/km — ${Math.abs(d)}초 ${d < 0 ? "빨라졌어요" : "느려졌어요"}`);
    }
  }
  const topDow = [...a.weekday].sort((x, y) => y.runs - x.runs)[0];
  if (topDow.runs > 0) insights.push(`${topDow.label}요일에 가장 많이 달렸어요 (${topDow.runs}회)`);
  const topTod = [...a.timeOfDay].sort((x, y) => y.runs - x.runs)[0];
  if (topTod.runs > 0) insights.push(`${topTod.label.split(" ")[0]}에 달리는 편이에요 (${topTod.runs}회)`);
  const tm = a.surface.treadmill, ou = a.surface.outdoor;
  if (tm.avgPaceSec && ou.avgPaceSec) insights.push(`트레드밀 평균 ${fmtPace(tm.avgPaceSec)}/km, 야외 ${fmtPace(ou.avgPaceSec)}/km`);

  return (
    <section id="garmin-analysis" className="grid gap-3" style={{ scrollMarginTop: 72 }}>
      <div className="sec-head"><h2 className="label">{month ? "가민 분석" : "분석"}</h2><span className="text-xs text-muted">{range.label} · 러닝 {t.runs}회 (의심 기록 제외)</span></div>

      {!month && <RangePicker range={range} />}

      <div className="stat-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
        <div><span className="label">총 거리</span><b className="num">{t.km}<small>km</small></b></div>
        <div><span className="label">러닝</span><b className="num">{t.runs}<small>회 · {t.days}일</small></b></div>
        <div><span className="label">총 시간</span><b className="num">{fmtDur(t.durationSec)}</b></div>
        <div><span className="label">평균 페이스</span><b className="num">{fmtPace(t.avgPaceSec)}<small>/km</small></b></div>
        <div><span className="label">평균 심박</span><b className="num">{t.avgHr ?? "–"}</b></div>
        <div><span className="label">평균 케이던스</span><b className="num">{t.avgCadence ?? "–"}</b></div>
        <div><span className="label">평균 훈련효과</span><b className="num">{t.avgTE ?? "–"}</b></div>
        <div><span className="label">칼로리</span><b className="num">{won(t.calories)}</b></div>
        <div><span className="label">걸음 수</span><b className="num">{won(t.steps)}</b></div>
        <div><span className="label">누적 상승</span><b className="num">{t.elevGainM ?? "–"}<small>m</small></b></div>
      </div>

      {insights.length > 0 && (
        <ul className="panel p-3 grid gap-1 text-sm" style={{ listStyle: "disc", paddingInlineStart: 28 }}>
          {insights.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="panel p-3 grid gap-0.5 text-sm"><span className="label">가장 길게</span><b className="num">{h.longest.value}km</b><span className="text-xs text-muted truncate">{md(h.longest.date)} {h.longest.title}</span></div>
        {h.fastest && <div className="panel p-3 grid gap-0.5 text-sm"><span className="label">가장 빠르게 (3km↑)</span><b className="num">{fmtPace(h.fastest.value)}/km</b><span className="text-xs text-muted truncate">{md(h.fastest.date)} {h.fastest.title}</span></div>}
        {h.hardest && <div className="panel p-3 grid gap-0.5 text-sm"><span className="label">훈련효과 최고</span><b className="num">{h.hardest.value}</b><span className="text-xs text-muted truncate">{md(h.hardest.date)} {h.hardest.title}</span></div>}
        {h.climb && <div className="panel p-3 grid gap-0.5 text-sm"><span className="label">가장 많이 오르기</span><b className="num">{h.climb.value}m</b><span className="text-xs text-muted truncate">{md(h.climb.date)} {h.climb.title}</span></div>}
      </div>

      {!month && (
      <Chart title="월별 거리" sub="막대에 올리면 러닝 횟수·페이스가 보여요" info="달마다 달린 총 거리(km)예요. 가장 많이 달린 달이 주황색 막대로 강조돼요.">
          <BarChart label="월별 거리" fmt="km1"
            bars={a.monthly.map((m) => ({ label: `${Number(m.ym.slice(5))}월`, value: m.km, tip: `${m.ym} ${m.km}km · ${m.runs}회 · ${m.days}일 · ${fmtPace(m.avgPaceSec)}/km` }))} />
        </Chart>
      )}

      <Chart title={month ? "주간 거리" : "주간 거리 (최근 12주)"} sub="월요일 시작 · 쉰 주는 0" info="월요일부터 일요일까지 한 주 동안 달린 거리(km)예요. 쉰 주는 0으로 보여요. 주마다 꾸준히 달렸는지 한눈에 볼 수 있어요.">
        <BarChart label="주간 거리" fmt="km1"
          bars={(month && range.from ? a.weekly.filter((w) => w.start >= weekStart(range.from!)) : a.weekly).map((w) => ({ label: md(w.start), value: w.km, tip: `${md(w.start)}~ 주 ${w.km}km · ${w.runs}회` }))} />
      </Chart>

      <Chart title="페이스 변화" sub="위쪽이 빨라요 · 속이 빈 점은 트레드밀" info="1km를 달리는 데 걸린 평균 시간이에요. 숫자가 작을수록 빠르고, 그래프에서는 위쪽이 빠른 쪽이에요. 점선은 전체 평균이에요. 달리다 걷거나 쉬면 느리게 나올 수 있어요.">
        <LineChart label="페이스 변화" invert fmt="pace"
          points={a.trend.map((p) => ({ date: p.date, at: p.startedAt, y: p.paceSec, hollow: p.treadmill, tip: `${md(p.date)} ${p.km}km · ${fmtPace(p.paceSec)}/km${p.treadmill ? " (트레드밀)" : ""}` }))} />
      </Chart>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Chart title="평균 심박" sub="낮을수록 편하게 달린 거예요" info="한 번 달리는 동안의 평균 심장박동수(bpm)예요. 같은 속도로 달렸는데 심박이 낮아졌다면 몸이 더 편하게 달리고 있다는 신호예요.">
          <LineChart label="평균 심박" fmt="int"
            points={withHr.map((p) => ({ date: p.date, at: p.startedAt, y: p.avgHr!, hollow: p.treadmill, tip: `${md(p.date)} 심박 ${p.avgHr} · ${fmtPace(p.paceSec)}/km` }))} />
        </Chart>
        <Chart title="케이던스" sub="1분 걸음 수" info="1분 동안 내딛는 걸음 수(spm)예요. 러닝은 보통 160~190 사이인 경우가 많고, 같은 속도에서 걸음 수가 늘면 보폭이 줄고 리듬이 빨라진 거예요.">
          <LineChart label="케이던스" fmt="int"
            points={withCad.map((p) => ({ date: p.date, at: p.startedAt, y: p.avgCadence!, hollow: p.treadmill, tip: `${md(p.date)} 케이던스 ${p.avgCadence}` }))} />
        </Chart>
      </div>

      <Chart title="유산소 효율" sub="높을수록 같은 힘으로 더 빨리 달려요" info="같은 심박으로 얼마나 빨리 달렸는지 보는 값이에요. (분당 속도 m ÷ 평균 심박)으로 계산해서, 높아질수록 같은 힘으로 더 빨리 달린다는 뜻이에요. 가민 공식 수치가 아니라 이 앱에서 계산한 값이에요.">
        <LineChart label="유산소 효율" fmt="dec2"
          points={withEff.map((p) => ({ date: p.date, at: p.startedAt, y: p.efficiency!, hollow: p.treadmill, tip: `${md(p.date)} 효율 ${p.efficiency} (심박 ${p.avgHr}, ${fmtPace(p.paceSec)}/km)` }))} />
      </Chart>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Chart title="거리대별 횟수" info="한 번에 달린 거리별로 러닝이 몇 번이었는지 보여 줘요. 가장 많은 구간이 주황색이에요.">
          <HBars rows={a.distanceBands.map((b) => ({ label: b.label, value: b.runs }))} />
        </Chart>
        <Chart title="훈련효과 분포" sub="가민 유산소 훈련효과" info="가민이 매기는 '유산소 훈련 효과'(0~5점)를 구간별로 나눈 거예요. 1점대는 회복, 2점대는 현재 체력 유지, 3점대는 체력 향상, 4점대는 크게 향상, 5점은 몸에 부담이 큰 과부하 수준이에요.">
          <Donut slices={a.teBands.map((b) => ({ label: b.label, value: b.runs }))} centerTop={a.total.avgTE != null ? `${a.total.avgTE}` : "–"} centerBottom="평균 훈련효과" />
        </Chart>
        <Chart title="시간대별" info="러닝을 시작한 시각 기준이에요. 옆의 숫자는 그 시간대에 달린 기록의 평균 페이스예요.">
          <HBars rows={a.timeOfDay.map((b) => ({ label: b.label, value: b.runs, note: b.avgPaceSec ? `${fmtPace(b.avgPaceSec)}/km` : undefined }))} />
        </Chart>
        <Chart title="요일별" info="어느 요일에 러닝을 많이 했는지 보여 줘요. 가장 많이 달린 요일이 주황색 막대예요.">
          <BarChart label="요일별 러닝 횟수" fmt="int" bars={a.weekday.map((b) => ({ label: b.label, value: b.runs, tip: `${b.label}요일 ${b.runs}회` }))} />
        </Chart>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <SurfaceCard name="야외 러닝" g={a.surface.outdoor} />
        <SurfaceCard name="트레드밀" g={a.surface.treadmill} />
      </div>
    </section>
  );
}
