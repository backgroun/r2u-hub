import Link from "next/link";
import { analyzeRuns, weekStart, type Group, type RunLike } from "@/lib/garmin/analysis";
import { fmtDur, fmtPace } from "@/lib/garmin/aggregate";
import { BarChart, Donut, HBars, InfoTip, LineChart } from "@/components/run-charts";
import RunGuide from "@/components/run-guide";
import type { Guide } from "@/lib/garmin/guide";
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

/** 구역 제목: 글자 + 가는 줄 */
function Sub({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
      <h3 className="label" style={{ whiteSpace: "nowrap" }}>{title}</h3>
      <i aria-hidden style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="panel p-3.5 grid gap-1" style={{ overflow: "visible" }}>
      <span className="text-xs text-muted">{label}</span>
      <b className="num" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{value}{unit && <small style={{ fontSize: 13, marginLeft: 3, color: "var(--muted)", fontWeight: 600 }}>{unit}</small>}</b>
    </div>
  );
}

type BestItem = { label: string; value: string; unit?: string; sub: string };
/** 베스트 기록: 색·아이콘 없이 한 장짜리 목록. 왼쪽 이름과 날짜, 오른쪽 큰 값 */
function BestList({ items }: { items: BestItem[] }) {
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      {items.map((b, i) => (
        <div key={b.label} className="flex items-center justify-between gap-3" style={{ padding: "14px 16px", borderTop: i ? "1px solid var(--line)" : "none" }}>
          <div style={{ minWidth: 0 }}>
            <p className="text-sm font-bold">{b.label}</p>
            <p className="text-xs text-muted truncate" style={{ marginTop: 2 }}>{b.sub}</p>
          </div>
          <b className="num" style={{ fontSize: 22, fontWeight: 800, whiteSpace: "nowrap" }}>{b.value}{b.unit && <small style={{ fontSize: 13, marginLeft: 3, color: "var(--muted)", fontWeight: 600 }}>{b.unit}</small>}</b>
        </div>
      ))}
    </div>
  );
}

/** 야외 vs 트레드밀: 거리 비율 막대 + 각각의 요약 */
function SurfaceCompare({ ou, tm }: { ou: Group; tm: Group }) {
  const total = ou.km + tm.km || 1;
  const ouPct = Math.round((ou.km / total) * 100);
  const col = (name: string, g: Group, color: string) => (
    <div className="grid gap-0.5" style={{ minWidth: 0 }}>
      <span className="flex items-center gap-1.5 text-sm font-bold"><i aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />{name}</span>
      {g.runs ? (
        <>
          <b className="num" style={{ fontSize: 22, fontWeight: 800 }}>{g.km}<small style={{ fontSize: 13, marginLeft: 3, color: "var(--muted)", fontWeight: 600 }}>km</small></b>
          <span className="num text-xs text-muted">{g.runs}회 · {fmtPace(g.avgPaceSec)}/km</span>
          <span className="num text-xs text-muted">{g.avgHr ? `심박 ${g.avgHr}` : ""}{g.avgHr && g.avgCadence ? " · " : ""}{g.avgCadence ? `케이던스 ${g.avgCadence}` : ""}</span>
        </>
      ) : <span className="text-xs text-muted">기록 없음</span>}
    </div>
  );
  return (
    <>
      <div aria-hidden style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}>
        <span style={{ width: `${ouPct}%`, background: "var(--lane)" }} />
        <span style={{ width: `${100 - ouPct}%`, background: "var(--bib)" }} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {col(`야외 ${ouPct}%`, ou, "var(--lane)")}
        {col(`트레드밀 ${100 - ouPct}%`, tm, "var(--bib)")}
      </div>
    </>
  );
}

/** 분석 기간: 한 줄짜리 선택 묶음 + 접어 둔 ‘직접 기간 정하기’ */
function RangePicker({ range }: { range: Range }) {
  const custom = range.key === "custom";
  const field = { minHeight: 42, fontSize: 14, width: "100%", minWidth: 0 } as const;
  return (
    <div className="panel p-3 grid gap-2.5" style={{ overflow: "visible" }}>
      <nav aria-label="분석 기간" style={{ display: "grid", gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`, gap: 3, padding: 3, borderRadius: 12, background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}>
        {PRESETS.map((p) => {
          const on = range.key === p.key;
          return (
            <Link key={p.key} href={p.key === "all" ? "/me/runs" : `/me/runs?range=${p.key}`} scroll={false} aria-current={on ? "page" : undefined}
              style={{ textAlign: "center", padding: "8px 2px", borderRadius: 9, fontSize: 13, fontWeight: on ? 800 : 600, whiteSpace: "nowrap", background: on ? "var(--lane)" : "transparent", color: on ? "var(--card)" : "var(--ink)", boxShadow: on ? "0 1px 4px rgba(0,0,0,.25)" : "none" }}>
              {p.label}
            </Link>
          );
        })}
      </nav>
      <details open={custom} className="range-custom">
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: custom ? "var(--lane)" : "var(--muted)", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden className="range-chev" style={{ display: "inline-block", transition: "transform .15s", fontSize: 10 }}>▶</span>
          직접 기간 정하기{custom ? ` · ${range.label}` : ""}
        </summary>
        <form method="get" className="grid gap-2.5" style={{ marginTop: 10 }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="grid gap-1 text-xs text-muted" style={{ minWidth: 0 }}>시작일
              <input type="date" name="from" className="input" style={field} defaultValue={custom ? range.from ?? "" : ""} />
            </label>
            <label className="grid gap-1 text-xs text-muted" style={{ minWidth: 0 }}>종료일
              <input type="date" name="to" className="input" style={field} defaultValue={custom ? range.to ?? "" : ""} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" style={{ minHeight: 42, width: "100%" }}>이 기간으로 보기</button>
        </form>
      </details>
    </div>
  );
}

/** 가민 기록 분석: 의심 기록을 뺀 러닝 중 고른 기간의 것만 받는다 */
export default function RunAnalysis({ runs, range, hasRuns, variant = "page", guide }: { runs: RunLike[]; range: Range; hasRuns: boolean; variant?: "page" | "month"; guide?: Guide | null }) {
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
  type Row = { label: string; value: string; tone?: "good" | "bad" };
  const rows: Row[] = [];
  if (a.recent) {
    const { current: c, previous: p } = a.recent;
    const dk = c.km - p.km;
    rows.push({ label: "최근 4주 거리", value: `${c.km}km (${sign(dk, "km")})`, tone: dk > 0 ? "good" : dk < 0 ? "bad" : undefined });
    if (c.avgPaceSec && p.avgPaceSec) {
      const d = c.avgPaceSec - p.avgPaceSec;
      rows.push({ label: "최근 4주 평균 페이스", value: d === 0 ? `${fmtPace(c.avgPaceSec)}/km (그대로)` : `${fmtPace(c.avgPaceSec)}/km (${Math.abs(d)}초 ${d < 0 ? "빨라짐" : "느려짐"})`, tone: d < 0 ? "good" : d > 0 ? "bad" : undefined });
    }
  }
  const topDow = [...a.weekday].sort((x, y) => y.runs - x.runs)[0];
  if (topDow.runs > 0) rows.push({ label: "가장 많이 달린 요일", value: `${topDow.label}요일 · ${topDow.runs}회` });
  const topTod = [...a.timeOfDay].sort((x, y) => y.runs - x.runs)[0];
  if (topTod.runs > 0) rows.push({ label: "주로 달리는 시간대", value: `${topTod.label.split(" ")[0]} · ${topTod.runs}회` });

  const mini = (label: string, value: string, unit?: string) => (
    <div className="grid gap-0.5 text-center" style={{ minWidth: 0 }}>
      <span className="text-xs text-muted">{label}</span>
      <b className="num" style={{ fontSize: 19, fontWeight: 800 }}>{value}{unit && <small style={{ fontSize: 11, marginLeft: 2, color: "var(--muted)", fontWeight: 600 }}>{unit}</small>}</b>
    </div>
  );

  return (
    <section id="garmin-analysis" className="grid gap-3" style={{ scrollMarginTop: 72 }}>
      <div className="sec-head"><h2 className="label">{month ? "가민 분석" : "분석"}</h2><span className="text-xs text-muted">{range.label} · 의심 기록 제외</span></div>

      {!month && <RangePicker range={range} />}

      {/* 대표 지표 */}
      <div style={{ borderRadius: 20, padding: "18px 16px 14px", background: "linear-gradient(140deg, color-mix(in srgb, var(--lane) 32%, var(--card)) 0%, var(--card) 75%)", border: "1px solid color-mix(in srgb, var(--lane) 26%, var(--line))" }}>
        <p className="text-xs text-muted">총 거리</p>
        <p className="num" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.05, marginTop: 2 }}>{t.km}<span style={{ fontSize: 18, marginLeft: 5, color: "var(--muted)", fontWeight: 700 }}>km</span></p>
        <p className="num text-sm text-muted" style={{ marginTop: 4 }}>러닝 {t.runs}회 · {t.days}일 · 총 {fmtDur(t.durationSec)}</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)" }}>
          {mini("평균 페이스", fmtPace(t.avgPaceSec), "/km")}
          {mini("평균 심박", t.avgHr != null ? `${t.avgHr}` : "–")}
          {mini("평균 케이던스", t.avgCadence != null ? `${t.avgCadence}` : "–")}
        </div>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Tile label="평균 훈련효과" value={t.avgTE != null ? `${t.avgTE}` : "–"} />
        <Tile label="칼로리" value={won(t.calories)} unit="kcal" />
        <Tile label="걸음 수" value={won(t.steps)} />
        <Tile label="누적 상승" value={t.elevGainM != null ? `${t.elevGainM}` : "–"} unit="m" />
      </div>

      {rows.length > 0 && (
        <Chart title="한눈에 보기" info="최근 4주와 그 앞 4주를 비교하고, 어느 요일·시간대에 주로 달렸는지 요약해요. 초록은 좋아진 쪽, 빨강은 줄어든 쪽이에요.">
          <div className="grid">
            {rows.map((r, i) => (
              <div key={r.label} className="flex items-center justify-between gap-3 text-sm" style={{ padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span className="text-muted">{r.label}</span>
                <b className="num text-right" style={{ color: r.tone === "good" ? "var(--good)" : r.tone === "bad" ? "var(--bad)" : "var(--ink)" }}>{r.value}</b>
              </div>
            ))}
          </div>
        </Chart>
      )}

      {guide && <RunGuide guide={guide} />}

      <Sub title="베스트 기록" />
      <BestList items={[
        { label: "가장 길게 달린 날", value: `${h.longest.value}`, unit: "km", sub: `${md(h.longest.date)} · ${h.longest.title}` },
        ...(h.fastest ? [{ label: "가장 빠른 페이스 (3km 이상)", value: fmtPace(h.fastest.value), unit: "/km", sub: `${md(h.fastest.date)} · ${h.fastest.title}` }] : []),
        ...(h.hardest ? [{ label: "훈련효과 최고", value: `${h.hardest.value}`, sub: `${md(h.hardest.date)} · ${h.hardest.title}` }] : []),
        ...(h.climb ? [{ label: "가장 많이 오른 날", value: `${h.climb.value}`, unit: "m", sub: `${md(h.climb.date)} · ${h.climb.title}` }] : []),
      ]} />

      <Sub title="추이" />
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

      <Sub title="분포" />
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

      <Sub title="비교" />
      <Chart title="야외 · 트레드밀" info="야외 러닝과 트레드밀 러닝의 거리 비율과 평균 페이스·심박·케이던스를 비교해요. 트레드밀은 보통 같은 힘으로도 다르게 나와서 따로 보는 게 좋아요.">
        <SurfaceCompare ou={a.surface.outdoor} tm={a.surface.treadmill} />
      </Chart>
    </section>
  );
}
