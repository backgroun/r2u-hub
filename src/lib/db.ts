import "server-only";
import { redis } from "./kv/client";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { makeTitle, type Order, type PublicOrder, type PublicSummary, type Round, type StoredOrder, type StoredRound } from "./types";

const K = {
  round: (id: string) => `gb:round:${id}`,
  rounds: "gb:rounds",
  orders: (id: string) => `gb:orders:${id}`,
  bib: (id: string) => `gb:bib:${id}`,
  fails: (id: string) => `gb:fails:${id}`,
};

export const newId = (bytes = 6) => randomBytes(bytes).toString("base64url");

export function keyMatches(a: string | null | undefined, b: string) {
  if (!a) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("base64url");
  return `${salt}:${scryptSync(pw, salt, 32).toString("base64url")}`;
}

export function checkPassword(pw: string, stored: string) {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  return keyMatches(scryptSync(pw, salt, 32).toString("base64url"), hash);
}

/** 비밀번호 틀린 횟수 (10분에 10번까지) */
export async function loginBlocked(id: string) {
  return ((await redis.get<number>(K.fails(id))) ?? 0) >= 10;
}

export async function recordLoginFail(id: string) {
  const n = await redis.incr(K.fails(id));
  if (n === 1) await redis.expire(K.fails(id), 600);
}

export function publicRound(r: StoredRound): Round {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminKey, pwHash, ...rest } = r;
  delete (rest as { minPeople?: number }).minPeople;
  return rest;
}

export function publicOrder(o: StoredOrder): Order {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pwHash, ...rest } = o;
  return { ...rest, depositor: rest.depositor ?? rest.name, paid: !!rest.paid, delivered: !!rest.delivered };
}

export const listOrder = (o: StoredOrder): PublicOrder => ({ id: o.id, bib: o.bib, name: o.name, lines: o.lines, paid: !!o.paid, delivered: !!o.delivered });

/** 예전 형식(minPeople, 비밀번호 없음)도 읽을 수 있게 */
function normalize(r: StoredRound | null): StoredRound | null {
  if (!r) return null;
  const legacy = r as StoredRound & { minPeople?: number };
  return {
    ...r,
    title: makeTitle(r.opener, r.items),
    minQty: r.minQty ?? legacy.minPeople ?? 0,
    pickup: r.pickup ?? { place: "" },
    pwHash: r.pwHash ?? "",
  };
}

export async function getRound(id: string) {
  return normalize(await redis.get<StoredRound>(K.round(id)));
}

export async function saveRound(r: StoredRound) {
  await redis.set(K.round(r.id), r);
  await redis.zadd(K.rounds, { score: r.createdAt, member: r.id });
}

export async function deleteRound(id: string) {
  await redis.del(K.round(id), K.orders(id), K.bib(id), K.fails(id));
  await redis.zrem(K.rounds, id);
}

/** 운영진 모드: STAFF_PASSWORD 로그인 또는 허브 운영진 세션(/api/staff/session). 토큰은 비밀 값에서 파생 */
export const staffEnabled = () => !!(process.env.STAFF_PASSWORD || process.env.SESSION_SECRET);

export function staffToken() {
  return createHmac("sha256", process.env.STAFF_PASSWORD || process.env.SESSION_SECRET || "").update("crew-gb-staff").digest("base64url");
}

export function isStaff(token: string | null | undefined) {
  return staffEnabled() && keyMatches(token, staffToken());
}

export async function listAllRounds(limit = 300) {
  const ids = await redis.zrange<string[]>(K.rounds, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rounds = await redis.mget<(StoredRound | null)[]>(...ids.map(K.round));
  const out: { round: Round; adminKey: string; summary: PublicSummary }[] = [];
  for (const raw of rounds) {
    const r = normalize(raw);
    if (!r) continue;
    out.push({ round: publicRound(r), adminKey: r.adminKey, summary: summarize(r, await getOrders(r.id)) });
  }
  return out;
}

export async function listRounds(limit = 30) {
  const ids = await redis.zrange<string[]>(K.rounds, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rounds = await redis.mget<(StoredRound | null)[]>(...ids.map(K.round));
  const out: { round: Round; summary: PublicSummary }[] = [];
  for (const raw of rounds) {
    const r = normalize(raw);
    if (!r) continue;
    out.push({ round: publicRound(r), summary: summarize(r, await getOrders(r.id)) });
  }
  return out;
}

export async function getOrders(roundId: string): Promise<StoredOrder[]> {
  const h = await redis.hgetall<Record<string, StoredOrder>>(K.orders(roundId));
  return Object.values(h ?? {}).sort((a, b) => a.bib - b.bib);
}

export async function getOrder(roundId: string, orderId: string) {
  return (await redis.hget<StoredOrder>(K.orders(roundId), orderId)) ?? null;
}

export async function nextBib(roundId: string) {
  return redis.incr(K.bib(roundId));
}

export async function saveOrder(roundId: string, o: StoredOrder) {
  await redis.hset(K.orders(roundId), { [o.id]: o });
}

export async function deleteOrder(roundId: string, orderId: string) {
  await redis.hdel(K.orders(roundId), orderId);
}

export function summarize(r: Round, orders: Order[]): PublicSummary {
  const itemTotals: Record<string, number> = {};
  for (const it of r.items) itemTotals[it.id] = 0;
  for (const o of orders) for (const [k, q] of Object.entries(o.lines)) itemTotals[k] = (itemTotals[k] ?? 0) + q;
  const totalQty = Object.values(itemTotals).reduce((a, b) => a + b, 0);
  const paidCount = orders.filter((o) => o.paid).length;
  const deliveredCount = orders.filter((o) => o.delivered).length;
  return { participants: orders.length, totalQty, paidCount, deliveredCount, itemTotals };
}
