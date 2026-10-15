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

/* ---------- 승리 정산: 대결이 시작되면 기록을 남기고(대결 쌍은 월말에 사라진다), 그달 거리가 더 많은 사람에게 승리 포인트 ---------- */
export const vsHistKey = (ym: string) => `r2u:vsHist:${ym}`; // hash pairKey -> VsHist
export type VsHist = { a: string; b: string; at: number; settled?: { winner: string | null; ka: number; kb: number; at: number } };
const parseHist = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as VsHist;

export async function recordVsPair(ym: string, a: string, b: string) {
  const k = pairKey(a, b);
  if (!(await redis.hexists(vsHistKey(ym), k))) await redis.hset(vsHistKey(ym), { [k]: JSON.stringify({ a, b, at: Date.now() } satisfies VsHist) });
}
export async function removeVsPair(ym: string, a: string, b: string) {
  await redis.hdel(vsHistKey(ym), pairKey(a, b));
  const { setPoints } = await import("@/lib/points");
  await Promise.all([setPoints(a, `vswin:${ym}:${pairKey(a, b)}`, 0, ""), setPoints(b, `vswin:${ym}:${pairKey(a, b)}`, 0, "")]);
}
export async function getVsHistory(ym: string): Promise<VsHist[]> {
  return Object.values((await redis.hgetall<Record<string, unknown>>(vsHistKey(ym))) ?? {}).map(parseHist);
}

/** 한 대결을 정산한다: 그달 거리가 더 많은 사람 승리(같으면 무승부). 다시 정산하면 결과를 새로 맞춘다. */
export async function settleVsPair(ym: string, a: string, b: string) {
  const [{ getMonth }, { rankMonth }, { pts, setPoints }] = await Promise.all([import("@/lib/hub"), import("@/lib/rank"), import("@/lib/points")]);
  const rows = rankMonth(await getMonth(ym));
  const ka = rows.find((r) => r.nick === a)?.km ?? 0, kb = rows.find((r) => r.nick === b)?.km ?? 0;
  const winner = ka > kb ? a : kb > ka ? b : null;
  const k = pairKey(a, b), win = (await pts()).versusWin;
  await setPoints(a, `vswin:${ym}:${k}`, winner === a ? win : 0, "1:1 대결 승리");
  await setPoints(b, `vswin:${ym}:${k}`, winner === b ? win : 0, "1:1 대결 승리");
  const prev = parseHist((await redis.hget(vsHistKey(ym), k)) ?? JSON.stringify({ a, b, at: Date.now() }));
  await redis.hset(vsHistKey(ym), { [k]: JSON.stringify({ ...prev, settled: { winner, ka, kb, at: Date.now() } } satisfies VsHist) });
  return { winner, ka, kb };
}

/** 월말 자동 정산: 지난달 대결 중 아직 정산 안 된 것을 한 번에 (정산 방식이 ‘운영진 직접’이면 하지 않는다) */
export async function autoSettleVersus(today: string) {
  try {
    const { getPointConfig } = await import("@/lib/points");
    if ((await getPointConfig()).vsSettle === "manual") return;
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
    const ym = d.toISOString().slice(0, 7);
    if (await redis.set(`r2u:vsSettled:${ym}`, "1", { nx: true }) !== "OK") return;
    for (const h of await getVsHistory(ym)) if (!h.settled) await settleVsPair(ym, h.a, h.b);
  } catch { /* 정산 실패로 화면을 막지 않는다 */ }
}
