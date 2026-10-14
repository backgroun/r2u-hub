import Papa from "papaparse";

/** 가민 커넥트 → 활동 → CSV 내보내기 파일 해석 (브라우저에서 실행, 서버엔 요약만 보낸다). 명세: garmin-csv-import-spec.md */

/** 저장할 러닝 종류 (한글/영문 가민 설정) */
export const RUN_TYPES = ["러닝", "트레드밀 러닝", "트레일 러닝", "Running", "Treadmill Running", "Trail Running"];
/** 이보다 빠르면(초/km) 의심 기록: 저장은 하되 월간 합계·순위에서 뺀다 */
export const SUSPECT_PACE_SEC = 150;
export const MI_KM = 1.609344;

export type GarminRun = {
  activityType: string;
  startedAt: string; // "YYYY-MM-DD HH:MM:SS" 가민 현지 시각 (고유키)
  date: string; // startedAt 날짜 (시작 기준)
  title: string;
  distanceKm: number;
  durationSec: number;
  calories: number | null;
  avgHr: number | null; maxHr: number | null;
  aerobicTE: number | null;
  avgCadence: number | null; maxCadence: number | null;
  avgPaceSec: number | null; bestPaceSec: number | null; avgGapSec: number | null;
  elevGainM: number | null; elevLossM: number | null;
  avgStrideM: number | null;
  avgVerticalRatio: number | null; avgVerticalOscCm: number | null;
  avgGctMs: number | null;
  npW: number | null; avgPowerW: number | null; maxPowerW: number | null;
  steps: number | null; laps: number | null;
  minTempC: number | null; maxTempC: number | null;
  movingSec: number | null; elapsedSec: number | null;
  flagged: boolean;
  raw: Record<string, string>;
};

export type ParseResult = {
  runs: GarminRun[];
  excluded: { notRun: number; empty: number };
  totalRows: number;
  /** 엑셀로 다시 저장한 파일로 보일 때 (날짜에 초가 없음) */
  warning?: string;
};

export const NOT_GARMIN_MSG = "가민 활동 목록 CSV 파일이 아닙니다. 가민 커넥트 → 활동 → CSV 내보내기로 받은 파일을 그대로 올려주세요.";
export const EXCEL_WARNING = "엑셀로 저장한 파일 같아요. 원본 파일을 올려주세요.";

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace(/[,']/g, "");
  if (s === "" || s.startsWith("--")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** "01:24:13" · "00:00:22.9" · "6:27" → 초 */
const sec = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s.includes("--")) return null;
  const n = s.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number.isFinite(n) ? n : null;
};

const HEADERS = {
  activityType: ["활동 종류", "Activity Type"],
  startedAt: ["날짜", "Date"],
  title: ["제목", "Title"],
  distanceKm: ["거리", "Distance"],
  calories: ["칼로리", "Calories"],
  durationSec: ["시간", "Time"],
  avgHr: ["평균 심박", "Avg HR"],
  maxHr: ["최대심박", "Max HR"],
  aerobicTE: ["유산소 훈련 효과", "Aerobic TE"],
  avgCadence: ["평균 달리기 케이던스", "Avg Run Cadence"],
  maxCadence: ["최고 달리기 케이던스", "Max Run Cadence"],
  avgPaceSec: ["평균 페이스", "Avg Pace"],
  bestPaceSec: ["최대 페이스", "Best Pace"],
  elevGainM: ["총 상승", "Total Ascent"],
  elevLossM: ["총 하강", "Total Descent"],
  avgStrideM: ["평균 보폭", "Avg Stride Length"],
  avgVerticalRatio: ["평균 수직 비율", "Avg Vertical Ratio"],
  avgVerticalOscCm: ["평균 수직 진동", "Avg Vertical Oscillation"],
  avgGctMs: ["평균 지면 접촉 시간", "Avg Ground Contact Time"],
  avgGapSec: ["평균 GAP", "Avg GAP"],
  npW: ["Normalized Power® (NP®)"],
  avgPowerW: ["평균 파워", "Avg Power"],
  maxPowerW: ["최대 파워", "Max Power"],
  steps: ["걸음", "Steps"],
  laps: ["랩 수", "Number of Laps"],
  minTempC: ["최저 온도", "Min Temp"],
  maxTempC: ["최고 온도", "Max Temp"],
  movingSec: ["이동 시간", "Moving Time"],
  elapsedSec: ["경과 시간", "Elapsed Time"],
} as const;
type Field = keyof typeof HEADERS;
const SEC_FIELDS = new Set<Field>(["durationSec", "avgPaceSec", "bestPaceSec", "avgGapSec", "movingSec", "elapsedSec"]);
const STR_FIELDS = new Set<Field>(["activityType", "startedAt", "title"]);
const PACE_FIELDS: Field[] = ["avgPaceSec", "bestPaceSec", "avgGapSec"];

const looksGarmin = (t: string) => {
  const head = t.split("\n")[0];
  return /활동 종류|Activity Type/.test(head) && /날짜|Date/.test(head);
};

/** UTF-8로 읽고, 안 되면(엑셀이 CP949로 저장) EUC-KR로 다시 읽는다 */
export function decodeGarmin(buffer: ArrayBuffer | Uint8Array): string {
  const tryDecode = (enc: string) => new TextDecoder(enc).decode(buffer).replace(/^﻿/, "");
  let text = tryDecode("utf-8");
  if (!looksGarmin(text)) text = tryDecode("euc-kr");
  if (!looksGarmin(text)) throw new Error(NOT_GARMIN_MSG);
  return text;
}

export function parseGarminText(text: string, unit: "km" | "mi" = "km"): ParseResult {
  const { data, meta } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const fields = meta.fields ?? [];
  const col = Object.fromEntries(
    (Object.entries(HEADERS) as [Field, readonly string[]][]).map(([k, names]) => [k, names.find((n) => fields.includes(n))]),
  ) as Record<Field, string | undefined>;
  if (!col.activityType || !col.startedAt) throw new Error(NOT_GARMIN_MSG);

  const runs: GarminRun[] = [];
  const excluded = { notRun: 0, empty: 0 };
  let noSeconds = 0;
  for (const row of data) {
    const r: Record<string, unknown> = { raw: row };
    for (const [k, h] of Object.entries(col) as [Field, string | undefined][]) {
      const v = h ? row[h] : null;
      r[k] = STR_FIELDS.has(k) ? String(v ?? "").trim() : SEC_FIELDS.has(k) ? sec(v) : num(v);
    }
    const run = r as unknown as GarminRun;
    if (!RUN_TYPES.includes(run.activityType)) { excluded.notRun++; continue; }
    if (!(run.distanceKm > 0) || !(run.durationSec > 0)) { excluded.empty++; continue; }
    if (unit === "mi") {
      run.distanceKm = Math.round(run.distanceKm * MI_KM * 100) / 100;
      for (const k of PACE_FIELDS) if (run[k] != null) (run as Record<string, unknown>)[k] = Math.round((run[k] as number) / MI_KM);
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(run.startedAt)) noSeconds++;
    // CSV 평균 페이스 칸이 아니라 시간÷거리로 판정
    run.flagged = run.durationSec / run.distanceKm < SUSPECT_PACE_SEC;
    run.date = run.startedAt.slice(0, 10);
    runs.push(run);
  }
  return { runs, excluded, totalRows: data.length, ...(noSeconds ? { warning: EXCEL_WARNING } : {}) };
}

export async function parseGarminFile(file: Blob, unit: "km" | "mi" = "km"): Promise<ParseResult> {
  return parseGarminText(decodeGarmin(await file.arrayBuffer()), unit);
}
