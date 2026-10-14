import { redis, vsExpiry } from "@/lib/hub";

/* 1:1 대결 신청(받아줘야 매치)·응원 투표. 대결 쌍 자체는 hub.ts 의 K.vs / getAllVs 가 맡는다. */
export const vsReqKey = (ym: string) => `r2u:vsReq:${ym}`; // hash 신청자 -> 받는 사람
export const pairKey = (a: string, b: string) => [a, b].sort((x, y) => x.localeCompare(y, "ko")).join("|");
export const vsVoteKey = (ym: string, a: string, b: string) => `r2u:vsVote:${ym}:${pairKey(a, b)}`; // hash 투표자 -> 응원하는 사람

/** 아직 받아주지 않은 대결 신청 (신청자 닉네임 -> 받는 사람 닉네임) */
export async function getVsRequests(ym: string): Promise<Record<string, string>> {
  const h = (await redis.hgetall<Record<string, unknown>>(vsReqKey(ym))) ?? {};
  return Object.fromEntries(Object.entries(h).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, v as string]));
}
export async function saveVsRequest(ym: string, from: string, to: string) {
  await redis.hset(vsReqKey(ym), { [from]: to });
  await redis.expireat(vsReqKey(ym), vsExpiry(ym));
}

export type VsTally = { a: number; b: number; mine: string | null };
/** 한 쌍의 응원 투표 집계 */
export async function getVsTally(ym: string, a: string, b: string, viewer?: string | null): Promise<VsTally> {
  const h = (await redis.hgetall<Record<string, unknown>>(vsVoteKey(ym, a, b))) ?? {};
  let ca = 0, cb = 0;
  for (const v of Object.values(h)) { if (v === a) ca++; else if (v === b) cb++; }
  const mine = viewer && typeof h[viewer] === "string" ? (h[viewer] as string) : null;
  return { a: ca, b: cb, mine: mine === a || mine === b ? mine : null };
}
