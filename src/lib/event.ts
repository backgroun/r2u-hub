// 11월 이벤트(빙고) 오픈일. 빙고 운영진 화면에서 바꾼 시작일을 그대로 따라간다. (서버·미들웨어 어디서든 쓸 수 있게 가볍게)
export const BINGO_SUPABASE_URL = "https://ofzhbmjejnydonnixlcr.supabase.co";
export const BINGO_SUPABASE_KEY = "sb_publishable_-FMPADitf4W5uYN7eLy3_w_EOR9caky"; // 공개돼도 안전한 publishable 키 (public/bingo/config.js 와 같은 값)
const DEFAULT_START = "2026-11-01";

/** 빙고 서버(Supabase) 함수 호출. 실패하면 null. */
export async function bingoRpc<T = Record<string, unknown>>(fn: string, body: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(`${BINGO_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: BINGO_SUPABASE_KEY },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

let cache: { at: number; start: string } | null = null;
/** 오픈 시작일 YYYY-MM-DD. 1분 동안 기억하고, 서버가 안 읽히면 마지막 값(없으면 기본값). */
export async function eventStart(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.start;
  const j = await bingoRpc<{ info?: { start?: unknown } }>("get_snapshot");
  const s = j?.info?.start;
  const start = typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (cache?.start ?? DEFAULT_START);
  cache = { at: Date.now(), start };
  return start;
}

/** 오늘(한국 날짜)이 오픈 시작일 이후인가 */
export async function eventOpen(): Promise<boolean> {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return today >= (await eventStart());
}
