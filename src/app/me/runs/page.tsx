import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isStaffAccount, kstToday } from "@/lib/hub";
import { getRuns, hasRunsConsent, MONTHLY_SYNC_FROM, RANK_GRACE_DAYS } from "@/lib/runs";
import { aggregateByDay, fmtDur, fmtPace } from "@/lib/garmin/aggregate";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { agreeRunsConsent, removeAllRuns, removeRun } from "./actions";
import GarminUpload from "./garmin-upload";
import RunAnalysis from "./run-analysis";
import { inRange, resolveRange, type RangeParams } from "@/lib/garmin/range";

export const dynamic = "force-dynamic";
export const metadata = { title: "가민 기록" };

const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function RunsPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const u = await currentUser();
  if (!u) redirect("/login?next=/me/runs");
  if (isStaffAccount(u)) redirect("/admin");
  const [consent, runs] = await Promise.all([hasRunsConsent(u.nick), getRuns(u.nick)]);

  const counted = runs.filter((r) => !r.flagged);
  const range = resolveRange(await searchParams, kstToday());
  const days = aggregateByDay(counted);
  const flagged = runs.filter((r) => r.flagged);
  const runsByDate = new Map<string, typeof runs>();
  for (const r of runs) runsByDate.set(r.date, [...(runsByDate.get(r.date) ?? []), r]);

  // 월별 합계 (의심 기록 제외)
  const months = new Map<string, { km: number; sec: number; days: number; runs: number }>();
  for (const d of days) {
    const m = months.get(d.date.slice(0, 7)) ?? { km: 0, sec: 0, days: 0, runs: 0 };
    m.km += d.distanceKm ?? 0; m.sec += d.durationSec ?? 0; m.days += 1; m.runs += d.runCount;
    months.set(d.date.slice(0, 7), m);
  }

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <div className="flex items-center gap-2"><Link href="/me" className="text-sm text-muted">← 내 페이지</Link></div>
        <h1 className="hub-h1">가민 기록 <span className="chip" style={{ verticalAlign: "middle" }}>Garmin</span></h1>
        <p className="text-sm text-muted">가민 커넥트에서 내려받은 활동 CSV를 그대로 올리면 러닝만 골라 하루 단위로 합산하고, 월간 기록에도 반영해요.</p>
      </header>

      {!consent ? (
        <section className="panel p-4 grid gap-3">
          <h2 className="font-bold">건강정보 수집·이용 동의</h2>
          <ul className="text-sm grid gap-1" style={{ listStyle: "disc", paddingInlineStart: 18 }}>
            <li>수집 항목: 러닝 날짜·시각, 거리, 시간, 페이스, 심박, 케이던스, 훈련 효과, 파워, 걸음 수, 온도 등 가민 CSV에 있는 활동 값 (GPS 경로는 받지 않아요)</li>
            <li>이용 목적: 내 러닝 기록 정리, 크루 월간 기록(거리)·순위 반영</li>
            <li>공개 범위: 크루원에게는 월간 기록의 하루 거리만 보이고, 심박 등 상세 값은 나만 볼 수 있어요</li>
            <li>보관: 직접 지울 때까지. 아래 ‘가민 기록 전체 삭제’로 언제든 모두 지울 수 있어요</li>
            <li>심박 등은 개인정보보호법상 민감정보예요. 동의하지 않아도 월간 기록은 손으로 입력할 수 있어요</li>
          </ul>
          <ActionForm action={agreeRunsConsent} className="grid gap-2" keep>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" name="agree" value="1" required /> 위 내용을 확인했고 건강정보 수집·이용에 동의해요</label>
            <div><Submit>동의하고 시작하기</Submit></div>
          </ActionForm>
        </section>
      ) : (
        <GarminUpload />
      )}

      <details className="panel p-4">
        <summary className="font-bold">CSV 받는 방법</summary>
        <ol className="text-sm grid gap-1 mt-3" style={{ listStyle: "decimal", paddingInlineStart: 18 }}>
          <li><b>PC</b>에서 connect.garmin.com 로그인 → 왼쪽 메뉴 <b>활동 목록 → 모든 활동</b> (모바일에서는 안 돼요)</li>
          <li>원하는 기간까지 <b>아래로 스크롤</b> (화면에 보이는 만큼만 내보내질 수 있어요)</li>
          <li>오른쪽 위 <b>CSV 내보내기</b> 클릭 → <code>Activities.csv</code> 저장</li>
          <li><b>파일을 엑셀로 열어서 저장하지 마세요</b> (날짜 형식·인코딩이 바뀔 수 있어요). 그대로 올리면 돼요</li>
          <li>여기서 <b>가민 CSV 올리기</b> → 미리보기 확인 → 저장</li>
          <li>한 달에 한 번, 또는 월말 마감 전에 올려 주세요. 예전 기록이 겹쳐도 새 기록만 추가돼요</li>
        </ol>
        <p className="text-xs text-muted mt-2">월간 기록 반영: {MONTHLY_SYNC_FROM ? `${MONTHLY_SYNC_FROM.replace("-", "년 ")}월 이후 기록부터` : "예전 기록까지 모두"}{RANK_GRACE_DAYS != null ? `, 달이 끝나고 ${RANK_GRACE_DAYS}일 안에 올린 것까지` : ""} 월간 기록·순위에 들어가요. 하루 합계에서 페이스는 총 시간 ÷ 총 거리로 계산해요.</p>
      </details>

      <RunAnalysis runs={counted.filter((r) => inRange(r.date, range))} range={range} hasRuns={counted.length > 0} />

      {months.size > 0 && (
        <section className="grid gap-2">
          <div className="sec-head"><h2 className="label">월별 합계</h2><Link href="/monthly">월간 기록 →</Link></div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {[...months.entries()].map(([ym, m]) => (
              <div key={ym} className="panel p-3 grid gap-0.5">
                <span className="label">{ym.slice(0, 4)}년 {Number(ym.slice(5))}월</span>
                <b className="num text-xl">{r2(m.km)}<small className="text-muted text-sm">km</small></b>
                <span className="text-xs text-muted num">{m.days}일 · {m.runs}회 · {fmtPace(m.km ? m.sec / m.km : null)}/km</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {runs.length > 0 && (
        <section className="grid gap-2">
          <div className="sec-head"><h2 className="label">날짜별 기록</h2><span className="text-xs text-muted">{counted.length}회 · {days.length}일</span></div>
          <div className="grid gap-1.5">
            {[...new Set(runs.map((r) => r.date))].map((date) => {
              const d = days.find((x) => x.date === date);
              const list = runsByDate.get(date) ?? [];
              return (
                <details key={date} className="panel px-3 py-2">
                  <summary className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                    <b className="num" style={{ minWidth: 74 }}>{date.slice(2).replaceAll("-", ".")}</b>
                    <span className="num">{d ? `${d.distanceKm}km` : "–"}</span>
                    <span className="num text-muted">{d ? `${fmtDur(d.durationSec)} · ${fmtPace(d.avgPaceSec)}/km` : "의심 기록만"}</span>
                    {d && d.runCount > 1 && <span className="chip">{d.runCount}회</span>}
                    {d?.avgHr && <span className="num text-muted ml-auto">♥{d.avgHr}</span>}
                  </summary>
                  <div className="grid gap-2 mt-2">
                    {list.map((r) => (
                      <div key={r.startedAt} className="text-sm grid gap-0.5" style={{ borderTop: "1px solid var(--line, #8883)", paddingTop: 6 }}>
                        <div className="flex items-center gap-2">
                          <b className="truncate">{r.title || r.activityType}</b>
                          <span className="text-xs text-muted num">{r.startedAt.slice(11, 16)} · {r.activityType}</span>
                          {r.flagged && <span className="chip" title="2:30/km보다 빨라요. 월간 순위에서 빠져요">의심</span>}
                        </div>
                        <p className="num text-muted text-xs">
                          {r.distanceKm}km · {fmtDur(r.durationSec)} · {fmtPace(r.avgPaceSec ?? r.durationSec / r.distanceKm)}/km
                          {r.avgHr != null && ` · 심박 ${r.avgHr}/${r.maxHr ?? "–"}`}
                          {r.avgCadence != null && ` · 케이던스 ${r.avgCadence}`}
                          {r.aerobicTE != null && ` · 훈련효과 ${r.aerobicTE}`}
                          {r.elevGainM != null && ` · 상승 ${r.elevGainM}m`}
                          {r.avgPowerW != null && ` · 파워 ${r.avgPowerW}W`}
                        </p>
                        <ActionForm action={removeRun} className="flex justify-end">
                          <input type="hidden" name="startedAt" value={r.startedAt} />
                          <ConfirmButton>이 기록 지우기</ConfirmButton>
                        </ActionForm>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          {flagged.length > 0 && <p className="text-xs text-muted">의심 기록 {flagged.length}건은 합계·순위에서 빠져 있어요.</p>}
        </section>
      )}

      {(consent || runs.length > 0) && (
        <ActionForm action={removeAllRuns} className="flex justify-end">
          <ConfirmButton>가민 기록 전체 삭제</ConfirmButton>
        </ActionForm>
      )}
    </main>
  );
}
