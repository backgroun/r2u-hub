import { Redis } from "@upstash/redis";
// 11월 이벤트(빙고) 오픈일. 빙고 운영진 화면에서 바꾼 시작일을 그대로 따라간다. (서버·미들웨어 어디서든 쓸 수 있게 가볍게)
const DEFAULT_START = "2026-11-01";
const DEFAULT_END = "2026-11-30";
export const EVENT_PERIOD_KEY = "r2u:eventPeriod";

const kv = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 운영진이 허브에서 정한 이벤트 기간. 없으면 null (비밀 문장 없이 저장하는 값) */
export async function hubPeriod(): Promise<{ start: string; end: string } | null> {
  try {
    const raw = await kv.get<{ start?: unknown; end?: unknown } | string>(EVENT_PERIOD_KEY);
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && isDate(v.start) && isDate(v.end) ? { start: v.start, end: v.end } : null;
  } catch { return null; }
}

let cache: { at: number; start: string } | null = null;
/** 저장 직후 바로 새 날짜를 읽도록 기억해 둔 값을 비운다 */
export function resetEventCache() { cache = null; }

/** 오픈 시작일 YYYY-MM-DD. 1분 동안 기억하고, 서버가 안 읽히면 마지막 값(없으면 기본값). */
export async function eventStart(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.start;
  const own = await hubPeriod();
  if (own) { cache = { at: Date.now(), start: own.start }; return own.start; }
  cache = { at: Date.now(), start: DEFAULT_START };
  return DEFAULT_START;
}

/** 오늘(한국 날짜)이 오픈 시작일 이후인가 */
export async function eventOpen(): Promise<boolean> {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return today >= (await eventStart());
}

const HIDDEN_KEY = "r2u:eventHidden";
/** 운영진이 크루에게 이벤트를 숨겼는가 (읽기 실패하면 숨기지 않음) */
export async function eventHidden(): Promise<boolean> {
  try { const v = await kv.get<number | string | boolean>(HIDDEN_KEY); return v === 1 || v === "1" || v === true; } catch { return false; }
}
export async function setEventHidden(hide: boolean) {
  if (hide) await kv.set(HIDDEN_KEY, 1); else await kv.del(HIDDEN_KEY);
}
/** 크루원이 이벤트를 볼 수 있는가: 오픈일이 지났고, 운영진이 숨기지 않았을 때 */
export async function eventVisible(): Promise<boolean> {
  return (await eventOpen()) && !(await eventHidden());
}
