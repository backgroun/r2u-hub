import type { GarminRun } from "./csv";

/** 같은 날 러닝을 하루 기록 1건으로 합친다. 페이스는 평균 내지 않고 총시간÷총거리로 다시 계산한다 (명세 §5) */
export type DayRun = Pick<GarminRun, "date" | "title" | "startedAt" | "distanceKm" | "durationSec"> & Partial<GarminRun>;
type NumKey = { [K in keyof GarminRun]: GarminRun[K] extends number | null ? K : never }[keyof GarminRun];

export type DaySummary = {
  date: string;
  runCount: number;
  titles: string[];
  distanceKm: number | null;
  durationSec: number | null;
  avgPaceSec: number | null;
  bestPaceSec: number | null;
  movingSec: number | null; elapsedSec: number | null;
  calories: number | null; steps: number | null; laps: number | null;
  elevGainM: number | null; elevLossM: number | null;
  avgHr: number | null; maxHr: number | null;
  aerobicTE: number | null;
  avgCadence: number | null; maxCadence: number | null;
  avgStrideM: number | null;
  avgVerticalRatio: number | null; avgVerticalOscCm: number | null;
  avgGctMs: number | null;
  avgPowerW: number | null; maxPowerW: number | null; npW: number | null;
  avgGapSec: number | null;
};

const round = (v: number | null, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const vals = (list: DayRun[], k: NumKey) => list.map((r) => r[k] as number | null | undefined).filter((v): v is number => v != null);
const sum = (list: DayRun[], k: NumKey) => { const a = vals(list, k); return a.length ? a.reduce((x, y) => x + y, 0) : null; };
const max = (list: DayRun[], k: NumKey) => { const a = vals(list, k); return a.length ? Math.max(...a) : null; };
const min = (list: DayRun[], k: NumKey) => { const a = vals(list, k); return a.length ? Math.min(...a) : null; };
/** 시간 가중 평균: 그 값이 있는 러닝만 분자·분모에 넣는다 (트레드밀은 GAP 없음 등) */
const wavg = (list: DayRun[], k: NumKey, d = 0) => {
  const v = list.filter((r) => r[k] != null && r.durationSec > 0);
  const w = v.reduce((s, r) => s + r.durationSec, 0);
  return w ? round(v.reduce((s, r) => s + (r[k] as number) * r.durationSec, 0) / w, d) : null;
};

export function summarizeDay(date: string, list: DayRun[]): DaySummary {
  const distanceKm = round(sum(list, "distanceKm"), 2);
  const durationSec = round(sum(list, "durationSec"), 1);
  return {
    date, runCount: list.length, titles: list.map((r) => r.title),
    distanceKm, durationSec,
    avgPaceSec: distanceKm && durationSec ? Math.round(durationSec / distanceKm) : null,
    bestPaceSec: min(list, "bestPaceSec"),
    movingSec: sum(list, "movingSec"), elapsedSec: sum(list, "elapsedSec"),
    calories: sum(list, "calories"), steps: sum(list, "steps"), laps: sum(list, "laps"),
    elevGainM: sum(list, "elevGainM"), elevLossM: sum(list, "elevLossM"),
    avgHr: wavg(list, "avgHr"), maxHr: max(list, "maxHr"),
    aerobicTE: max(list, "aerobicTE"),
    avgCadence: wavg(list, "avgCadence"), maxCadence: max(list, "maxCadence"),
    avgStrideM: wavg(list, "avgStrideM", 2),
    avgVerticalRatio: wavg(list, "avgVerticalRatio", 1),
    avgVerticalOscCm: wavg(list, "avgVerticalOscCm", 1),
    avgGctMs: wavg(list, "avgGctMs"),
    avgPowerW: wavg(list, "avgPowerW"), maxPowerW: max(list, "maxPowerW"), npW: wavg(list, "npW"),
    avgGapSec: wavg(list, "avgGapSec"),
  };
}

/** 날짜 최신순 하루 합계 목록 */
export function aggregateByDay(runs: DayRun[]): DaySummary[] {
  const byDay: Record<string, DayRun[]> = {};
  for (const r of runs) (byDay[r.date] ??= []).push(r);
  return Object.entries(byDay)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => summarizeDay(date, list.sort((a, b) => a.startedAt.localeCompare(b.startedAt))));
}

/** 초 → "6:38" (페이스) */
export const fmtPace = (s: number | null | undefined) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
/** 초 → "2:21:06" / "35:27" */
export const fmtDur = (s: number | null | undefined) => {
  if (s == null) return "–";
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
