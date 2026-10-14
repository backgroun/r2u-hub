import type { GarminRun } from "./csv";

/** 가민 러닝 기록 분석 (CSV에 있는 값만 사용: 구간별 기록·GPS·VO2max 등은 없다). 의심 기록은 호출하는 쪽에서 빼고 넣는다 */
export type RunLike = Omit<GarminRun, "raw">;

export const isTreadmill = (activityType: string) => /트레드밀|treadmill/i.test(activityType);
/** 이 거리 미만은 '최고 페이스 기록' 후보에서 뺀다 (짧게 끊어 달린 기록 방지) */
export const BEST_PACE_MIN_KM = 3;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const paceOf = (r: RunLike) => r.durationSec / r.distanceKm;
const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 시간 가중 평균: 그 값이 있는 러닝만 */
function wavg(list: RunLike[], pick: (r: RunLike) => number | null | undefined, d = 0) {
  let w = 0, s = 0;
  for (const r of list) { const v = pick(r); if (v != null) { w += r.durationSec; s += v * r.durationSec; } }
  return w ? Math.round((s / w) * 10 ** d) / 10 ** d : null;
}
const sum = (list: RunLike[], pick: (r: RunLike) => number | null | undefined) => {
  let any = false, t = 0;
  for (const r of list) { const v = pick(r); if (v != null) { any = true; t += v; } }
  return any ? t : null;
};

export type Group = { km: number; runs: number; avgPaceSec: number | null; avgHr: number | null; avgCadence: number | null };
function group(list: RunLike[]): Group {
  const km = list.reduce((a, r) => a + r.distanceKm, 0);
  const sec = list.reduce((a, r) => a + r.durationSec, 0);
  return { km: r2(km), runs: list.length, avgPaceSec: km ? Math.round(sec / km) : null, avgHr: wavg(list, (r) => r.avgHr), avgCadence: wavg(list, (r) => r.avgCadence) };
}

/** 월요일 시작 주의 첫날 YYYY-MM-DD */
export function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export type TrendPoint = { startedAt: string; date: string; treadmill: boolean; paceSec: number; km: number; avgHr: number | null; avgCadence: number | null; efficiency: number | null };
export type Highlight = { startedAt: string; title: string; date: string; value: number };

export type RunAnalysis = {
  total: Group & { days: number; durationSec: number; calories: number | null; steps: number | null; elevGainM: number | null; avgTE: number | null; firstDate: string; lastDate: string };
  monthly: ({ ym: string; days: number } & Group)[];
  weekly: { start: string; km: number; runs: number }[]; // 마지막 기록이 있는 주까지 12주 (쉰 주는 0)
  trend: TrendPoint[]; // 오래된 순
  distanceBands: { label: string; runs: number }[];
  teBands: { label: string; runs: number }[];
  surface: { outdoor: Group; treadmill: Group };
  timeOfDay: { label: string; runs: number; avgPaceSec: number | null }[];
  weekday: { label: string; runs: number }[];
  highlights: { longest: Highlight; fastest: Highlight | null; hardest: Highlight | null; climb: Highlight | null };
  /** 마지막 기록 주 포함 최근 4주 vs 그 앞 4주 */
  recent: { current: Group; previous: Group } | null;
};

export function analyzeRuns(input: RunLike[]): RunAnalysis | null {
  const runs = [...input].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!runs.length) return null;
  const dayset = new Set(runs.map((r) => r.date));
  const lastDate = runs[runs.length - 1].date;
  const tes = runs.filter((r) => r.aerobicTE != null);

  const byMonth = new Map<string, RunLike[]>();
  for (const r of runs) byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r]);
  const monthly = [...byMonth.entries()].map(([ym, list]) => ({ ym, days: new Set(list.map((r) => r.date)).size, ...group(list) }));

  const lastWeek = weekStart(lastDate);
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(lastWeek, (i - 11) * 7), end = addDays(start, 6);
    const list = runs.filter((r) => r.date >= start && r.date <= end);
    return { start, km: r2(list.reduce((a, r) => a + r.distanceKm, 0)), runs: list.length };
  });
  const inWeeks = (from: number, to: number) => runs.filter((r) => r.date >= addDays(lastWeek, from * 7) && r.date <= addDays(lastWeek, to * 7 + 6));
  const cur = inWeeks(-3, 0), prev = inWeeks(-7, -4);

  const trend: TrendPoint[] = runs.map((r) => ({
    startedAt: r.startedAt, date: r.date, treadmill: isTreadmill(r.activityType), paceSec: Math.round(paceOf(r)), km: r.distanceKm,
    avgHr: r.avgHr, avgCadence: r.avgCadence,
    // 심박 1당 속도(m/분): 같은 심박에서 더 빨리 달릴수록 커진다 = 유산소 효율
    efficiency: r.avgHr ? r2((r.distanceKm * 1000) / (r.durationSec / 60) / r.avgHr) : null,
  }));

  const band = (defs: [string, (r: RunLike) => boolean][], list: RunLike[]) => defs.map(([label, f]) => ({ label, runs: list.filter(f).length }));
  const hourOf = (r: RunLike) => Number(r.startedAt.slice(11, 13));
  const tod: [string, (r: RunLike) => boolean][] = [
    ["아침 5–11시", (r) => hourOf(r) >= 5 && hourOf(r) < 11],
    ["낮 11–17시", (r) => hourOf(r) >= 11 && hourOf(r) < 17],
    ["저녁 17–21시", (r) => hourOf(r) >= 17 && hourOf(r) < 21],
    ["밤 21–5시", (r) => hourOf(r) >= 21 || hourOf(r) < 5],
  ];
  const hl = (r: RunLike | undefined, value: number): Highlight | null => (r ? { startedAt: r.startedAt, title: r.title || r.activityType, date: r.date, value } : null);
  const best = (list: RunLike[], score: (r: RunLike) => number | null, pickMax: boolean) => {
    let top: RunLike | undefined, topV = 0;
    for (const r of list) { const v = score(r); if (v == null) continue; if (!top || (pickMax ? v > topV : v < topV)) { top = r; topV = v; } }
    return top ? { r: top, v: topV } : null;
  };
  const longest = best(runs, (r) => r.distanceKm, true)!;
  const fastest = best(runs.filter((r) => r.distanceKm >= BEST_PACE_MIN_KM), paceOf, false);
  const hardest = best(runs, (r) => r.aerobicTE, true);
  const climb = best(runs, (r) => r.elevGainM, true);

  return {
    total: {
      ...group(runs), days: dayset.size, durationSec: Math.round(runs.reduce((a, r) => a + r.durationSec, 0)),
      calories: sum(runs, (r) => r.calories), steps: sum(runs, (r) => r.steps), elevGainM: sum(runs, (r) => r.elevGainM),
      avgTE: tes.length ? r1(tes.reduce((a, r) => a + r.aerobicTE!, 0) / tes.length) : null,
      firstDate: runs[0].date, lastDate,
    },
    monthly, weekly, trend,
    distanceBands: band([["5km 미만", (r) => r.distanceKm < 5], ["5–10km", (r) => r.distanceKm >= 5 && r.distanceKm < 10], ["10–15km", (r) => r.distanceKm >= 10 && r.distanceKm < 15], ["15km 이상", (r) => r.distanceKm >= 15]], runs),
    teBands: band([["1점대 (회복)", (r) => r.aerobicTE != null && r.aerobicTE < 2], ["2점대 (유지)", (r) => r.aerobicTE != null && r.aerobicTE >= 2 && r.aerobicTE < 3], ["3점대 (향상)", (r) => r.aerobicTE != null && r.aerobicTE >= 3 && r.aerobicTE < 4], ["4점대 (크게 향상)", (r) => r.aerobicTE != null && r.aerobicTE >= 4 && r.aerobicTE < 5], ["5점 (과부하)", (r) => r.aerobicTE != null && r.aerobicTE >= 5]], runs),
    surface: { outdoor: group(runs.filter((r) => !isTreadmill(r.activityType))), treadmill: group(runs.filter((r) => isTreadmill(r.activityType))) },
    timeOfDay: tod.map(([label, f]) => { const list = runs.filter(f); return { label, runs: list.length, avgPaceSec: group(list).avgPaceSec }; }),
    weekday: ["월", "화", "수", "목", "금", "토", "일"].map((label) => ({ label, runs: runs.filter((r) => KO_DOW[new Date(`${r.date}T00:00:00Z`).getUTCDay()] === label).length })),
    highlights: { longest: hl(longest.r, longest.v)!, fastest: fastest ? hl(fastest.r, fastest.v) : null, hardest: hardest ? hl(hardest.r, hardest.v) : null, climb: climb && climb.v > 0 ? hl(climb.r, climb.v) : null },
    recent: cur.length && prev.length ? { current: group(cur), previous: group(prev) } : null,
  };
}
