import "server-only";
import { K, redis, kstToday } from "./hub";
import { SUSPECT_PACE_SEC, type GarminRun } from "./garmin/csv";
import { applyDay, dayOf, type GarminMonthRec, type MergeMode } from "./garmin/merge";
import { syncMonthPoints } from "./points";

/** 월간 기록을 쓴 뒤 그달 포인트를 맞춘다 */
const syncPoints = (nick: string, months: [string, string][]) =>
  Promise.all(months.map(([key, rec]) => syncMonthPoints(nick, key.slice(-7), JSON.parse(rec))));

/**
 * 가민 CSV로 올린 러닝 저장 (명세: garmin-csv-import-spec.md)
 * - 러닝 1건 = 1항목 (r2u:runs:{nick} 해시, 키 = 시작 시각). 하루 합계는 저장하지 않고 볼 때 계산한다.
 * - 월간 기록(MonthRec.days)에는 그날 가민 합계를 넣는다. 원래 손으로 넣은 값은 manualKm에 보관하고
 *   garmin[day] = "replace"(가민으로 대체, 기본) | "separate"(따로 뛴 기록 → 둘 다 합산)로 표시한다.
 */
export type RunSource = "garmin_csv"; // 추후 health_connect, healthkit
export type StoredRun = Omit<GarminRun, "raw"> & {
  source: RunSource;
  raw: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // 내가 지운 기록: 다시 올려도 되살리지 않는다
};
export type { GarminMonthRec, MergeMode };

/** 월간 기록에 반영하기 시작한 달 ("YYYY-MM"). 빈 값이면 예전 기록도 모두 반영한다 */
export const MONTHLY_SYNC_FROM: string = "";
/** 달이 끝나고 며칠까지 올린 기록만 월간 순위에 반영한다 (이후엔 순위 고정). null이면 지난 달도 계속 반영 */
export const RANK_GRACE_DAYS: number | null = null;
export const MAX_RUNS_PER_UPLOAD = 2000;

const runsKey = (nick: string) => `r2u:runs:${nick}`;
const CONSENT_KEY = "r2u:runsConsent"; // hash nick -> 동의 시각
const UPLOADED_KEY = "r2u:runsUploadedAt"; // hash nick -> 마지막으로 저장한 시각(ms)

const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- 동의 ---------- */
export async function hasRunsConsent(nick: string) {
  return !!(await redis.hget(CONSENT_KEY, nick));
}
export async function saveRunsConsent(nick: string) {
  await redis.hset(CONSENT_KEY, { [nick]: Date.now() });
}

/** 마지막으로 가민 CSV를 저장한 시각 (ms). 없으면 null */
export async function getLastUpload(nick: string): Promise<number | null> {
  const v = await redis.hget<number | string>(UPLOADED_KEY, nick);
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** 한국 시간 "2026.10.15 14:30" */
export function fmtUploadTime(ms: number) {
  const k = new Date(ms + 9 * 3600e3).toISOString();
  return `${k.slice(0, 4)}.${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

/* ---------- 조회 ---------- */
export async function getRuns(nick: string, { withDeleted = false } = {}): Promise<StoredRun[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(runsKey(nick))) ?? {};
  return Object.values(h).map((v) => parse<StoredRun>(v))
    .filter((r) => withDeleted || !r.deletedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** 이 날짜를 월간 기록에 반영할 수 있나 (허브 시작 이후 + 마감 유예 안) */
export function monthlySyncable(date: string, today = kstToday()) {
  const ym = date.slice(0, 7);
  if (ym < MONTHLY_SYNC_FROM || date > today) return false;
  if (RANK_GRACE_DAYS == null) return true;
  const [y, m] = ym.split("-").map(Number);
  const close = new Date(Date.UTC(y, m, RANK_GRACE_DAYS)).toISOString().slice(0, 10); // 다음 달 N일
  return today <= close;
}

/* ---------- 서버 검증 (브라우저 계산값을 그대로 믿지 않는다) ---------- */
const NUM_FIELDS = [
  "calories", "avgHr", "maxHr", "aerobicTE", "avgCadence", "maxCadence", "avgPaceSec", "bestPaceSec", "avgGapSec",
  "elevGainM", "elevLossM", "avgStrideM", "avgVerticalRatio", "avgVerticalOscCm", "avgGctMs", "npW", "avgPowerW", "maxPowerW",
  "steps", "laps", "minTempC", "maxTempC", "movingSec", "elapsedSec",
] as const;
const START_RE = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export type IncomingRun = Omit<StoredRun, "source" | "createdAt" | "updatedAt" | "deletedAt">;

export function validateRuns(body: unknown): { runs: IncomingRun[] } | { error: string } {
  const list = (body as { runs?: unknown })?.runs;
  if (!Array.isArray(list) || list.length === 0) return { error: "올릴 러닝 기록이 없어요." };
  if (list.length > MAX_RUNS_PER_UPLOAD) return { error: `한 번에 ${MAX_RUNS_PER_UPLOAD}건까지 올릴 수 있어요. 기간을 나눠서 올려 주세요.` };
  const seen = new Set<string>();
  const runs: IncomingRun[] = [];
  for (const x of list as Record<string, unknown>[]) {
    const startedAt = String(x?.startedAt ?? "");
    if (!START_RE.test(startedAt)) return { error: `날짜 형식이 맞지 않아요 (${startedAt.slice(0, 30)}). 엑셀로 저장하지 않은 원본 파일을 올려 주세요.` };
    if (seen.has(startedAt)) continue;
    seen.add(startedAt);
    const distanceKm = Number(x.distanceKm), durationSec = Number(x.durationSec);
    if (!(distanceKm > 0 && distanceKm <= 300)) return { error: `${startedAt} 거리가 0~300km 범위를 벗어났어요.` };
    if (!(durationSec > 0 && durationSec <= 86400)) return { error: `${startedAt} 시간이 0~24시간 범위를 벗어났어요.` };
    const run: Record<string, unknown> = {
      activityType: String(x.activityType ?? "").slice(0, 40),
      startedAt, date: startedAt.slice(0, 10),
      title: String(x.title ?? "").slice(0, 100),
      distanceKm: r2(distanceKm), durationSec: Math.round(durationSec * 10) / 10,
    };
    for (const k of NUM_FIELDS) {
      const v = x[k];
      const n = v == null || v === "" ? null : Number(v);
      run[k] = n != null && Number.isFinite(n) && Math.abs(n) < 1e7 ? n : null;
    }
    for (const k of ["avgHr", "maxHr"] as const) if (run[k] != null && ((run[k] as number) < 30 || (run[k] as number) > 250)) run[k] = null;
    run.flagged = durationSec / distanceKm < SUSPECT_PACE_SEC;
    // 원본 행: 문자열 값만, 너무 길면 버린다
    const raw: Record<string, string> = {};
    if (x.raw && typeof x.raw === "object") {
      for (const [k, v] of Object.entries(x.raw as Record<string, unknown>).slice(0, 60)) raw[String(k).slice(0, 60)] = String(v ?? "").slice(0, 120);
    }
    run.raw = raw;
    runs.push(run as IncomingRun);
  }
  return { runs };
}

/* ---------- 업로드 ---------- */
export type RunStatus = "new" | "updated" | "unchanged" | "deleted";
export type ManualConflict = { date: string; manualKm: number; garminKm: number; garminRuns: number };
export type ImportResult = {
  summary: Record<RunStatus, number>;
  flagged: number;
  byDate: { date: string; status: RunStatus[] }[];
  manualConflicts: ManualConflict[];
  /** 월간 기록에 반영되지 않는 날 수 (허브 시작 전 / 마감 지난 달) */
  notSynced: number;
  /** 저장하면 월간 기록 값이 바뀌는 날 수 (이미 올린 기록이라도 아직 월간 기록에 없으면 포함) */
  monthDays: number;
};

const sameRun = (a: StoredRun, b: IncomingRun) => {
  const strip = (r: Partial<StoredRun>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source, createdAt, updatedAt, deletedAt, ...rest } = r;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k as keyof typeof rest]]));
  };
  return strip(a) === strip(b);
};

const garminKmOn = (runs: StoredRun[], date: string) =>
  r2(runs.filter((r) => r.date === date && !r.deletedAt && !r.flagged).reduce((a, r) => a + r.distanceKm, 0));

async function getMonthRec(ym: string, nick: string): Promise<GarminMonthRec> {
  const v = await redis.hget(K.month(ym), nick);
  return v ? parse<GarminMonthRec>(v) : { goal: 0, days: {} };
}

/** 바뀐 날짜들을 월간 기록에 반영할 쓰기 목록 */
async function monthWrites(nick: string, dates: string[], all: StoredRun[], decisions: Record<string, MergeMode> = {}) {
  const byYm = new Map<string, string[]>();
  for (const date of new Set(dates)) if (monthlySyncable(date)) byYm.set(date.slice(0, 7), [...(byYm.get(date.slice(0, 7)) ?? []), date]);
  const out: [string, string][] = [];
  let changedDays = 0;
  for (const [ym, list] of byYm) {
    let rec = await getMonthRec(ym, nick);
    const before = JSON.stringify(rec);
    for (const date of list) {
      const prev = rec.days?.[dayOf(date)];
      rec = applyDay(rec, date, garminKmOn(all, date), decisions[date]);
      if (rec.days?.[dayOf(date)] !== prev) changedDays++;
    }
    if (JSON.stringify(rec) !== before) out.push([K.month(ym), JSON.stringify(rec)]);
  }
  return Object.assign(out, { changedDays });
}

export async function importRuns(nick: string, incoming: IncomingRun[], opts: { dryRun: boolean; conflictDecisions?: Record<string, MergeMode> }): Promise<ImportResult> {
  const existing = new Map((await getRuns(nick, { withDeleted: true })).map((r) => [r.startedAt, r]));
  const now = Date.now();
  const summary: Record<RunStatus, number> = { new: 0, updated: 0, unchanged: 0, deleted: 0 };
  const byDate = new Map<string, RunStatus[]>();
  const writes: Record<string, string> = {};
  const after = new Map(existing);
  for (const run of incoming) {
    const old = existing.get(run.startedAt);
    const status: RunStatus = !old ? "new" : old.deletedAt ? "deleted" : sameRun(old, run) ? "unchanged" : "updated";
    summary[status]++;
    byDate.set(run.date, [...(byDate.get(run.date) ?? []), status]);
    if (status === "new" || status === "updated") {
      const stored: StoredRun = { ...run, source: "garmin_csv", createdAt: old?.createdAt ?? now, updatedAt: now };
      writes[run.startedAt] = JSON.stringify(stored);
      after.set(run.startedAt, stored);
    }
  }
  const all = [...after.values()];

  // 손으로 넣은 기록과 겹치는 날 (아직 가민과 합쳐지지 않은 날만)
  const dates = [...byDate.keys()].sort();
  const manualConflicts: ManualConflict[] = [];
  const recs = new Map<string, GarminMonthRec>();
  for (const date of dates) {
    if (!monthlySyncable(date)) continue;
    const ym = date.slice(0, 7);
    if (!recs.has(ym)) recs.set(ym, await getMonthRec(ym, nick));
    const rec = recs.get(ym)!;
    const d = dayOf(date);
    const manual = Number(rec.days?.[d]) || 0;
    const garminKm = garminKmOn(all, date);
    if (manual > 0 && !rec.garmin?.[d] && garminKm > 0) {
      manualConflicts.push({ date, manualKm: manual, garminKm, garminRuns: all.filter((r) => r.date === date && !r.deletedAt && !r.flagged).length });
    }
  }

  const decisions: Record<string, MergeMode> = {};
  for (const [date, v] of Object.entries(opts.conflictDecisions ?? {})) if (v === "separate" || v === "replace") decisions[date] = v;
  const months = await monthWrites(nick, dates, all, decisions);
  if (!opts.dryRun) {
    const tx = redis.multi();
    if (Object.keys(writes).length) tx.hset(runsKey(nick), writes);
    for (const [key, rec] of months) tx.hset(key, { [nick]: rec });
    tx.hset(UPLOADED_KEY, { [nick]: now }); // 새 기록이 없어도 ‘올린 시각’은 남긴다
    await tx.exec();
    await syncPoints(nick, months);
  }

  return {
    summary,
    flagged: incoming.filter((r) => r.flagged).length,
    byDate: dates.reverse().map((date) => ({ date, status: byDate.get(date)! })),
    manualConflicts,
    notSynced: dates.filter((d) => !monthlySyncable(d)).length,
    monthDays: months.changedDays,
  };
}

/* ---------- 삭제 ---------- */
/** 한 건 지우기 (기록은 남기고 표시만: 다음 업로드에 되살아나지 않게) */
export async function deleteRun(nick: string, startedAt: string) {
  const v = await redis.hget(runsKey(nick), startedAt);
  if (!v) return false;
  const run = { ...parse<StoredRun>(v), deletedAt: Date.now() };
  const all = (await getRuns(nick, { withDeleted: true })).map((r) => (r.startedAt === startedAt ? run : r));
  const months = await monthWrites(nick, [run.date], all);
  const tx = redis.multi();
  tx.hset(runsKey(nick), { [startedAt]: JSON.stringify(run) });
  for (const [key, rec] of months) tx.hset(key, { [nick]: rec });
  await tx.exec();
  await syncPoints(nick, months);
  return true;
}

/** 가민 기록 전체 삭제 (개인정보 삭제: 원본까지 지우고 월간 기록은 손으로 넣은 값으로 되돌린다) */
export async function deleteAllRuns(nick: string) {
  const all = await getRuns(nick, { withDeleted: true });
  const months = await monthWrites(nick, all.map((r) => r.date), []);
  const tx = redis.multi();
  tx.del(runsKey(nick));
  tx.hdel(CONSENT_KEY, nick);
  tx.hdel(UPLOADED_KEY, nick);
  for (const [key, rec] of months) tx.hset(key, { [nick]: rec });
  await tx.exec();
  await syncPoints(nick, months);
  return all.length;
}

/** 월간 기록 화면에서 손으로 고친 날: 가민 합산 표시를 풀고 손으로 넣은 값으로 둔다 */
export function detachGarminDay(rec: GarminMonthRec, day: number | string): GarminMonthRec {
  const d = String(day);
  if (!rec.garmin?.[d]) return rec;
  const garmin = { ...rec.garmin }, manualKm = { ...(rec.manualKm ?? {}) };
  delete garmin[d]; delete manualKm[d];
  return { ...rec, garmin, manualKm };
}
