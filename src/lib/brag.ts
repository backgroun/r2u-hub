import { redis } from "@/lib/hub";

/* 대회 기록 자랑하기: 기록을 남긴 크루원이 ‘자랑하기’를 누르면 홈에 공지처럼 3시간 동안 보인다 */
export const BRAG_KEY = "r2u:brags"; // hash `${nick}|${raceId}` -> Brag
export const BRAG_MS = 3 * 3600e3;
export type Brag = { nick: string; race: string; course: string; time: string; at: number };

export type LiveBrag = Brag & { key: string };

export async function liveBrags(): Promise<LiveBrag[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(BRAG_KEY)) ?? {};
  const now = Date.now();
  const live: LiveBrag[] = [], stale: string[] = [];
  for (const [k, v] of Object.entries(h)) {
    const b = (typeof v === "string" ? JSON.parse(v) : v) as Brag;
    if (b?.at && now - b.at < BRAG_MS) live.push({ ...b, key: k }); else stale.push(k);
  }
  if (stale.length) await redis.hdel(BRAG_KEY, ...stale);
  return live.sort((a, b) => b.at - a.at).slice(0, 5);
}
