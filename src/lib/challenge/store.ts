import "server-only";
import { redis } from "@/lib/hub";
import { IMG_KINDS, type Activity, type Appeal, type ChallengeMember, type ImgKind, type LogEntry } from "@/lib/challenge/rules";

/* 챌린지 저장소: 블록 하나당 r2u:chal:{blockId}:* 키들. 해시 하나에 항목을 JSON으로 넣는 기존 방식과 같다. */
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const k = (blockId: string, part: string) => `r2u:chal:${blockId}:${part}`;
const MEMBERS = "members", ACTS = "acts", PLACES = "places", APPEALS = "appeals", LOG = "log";

async function all<T>(key: string): Promise<T[]> {
  const h = await redis.hgetall<Record<string, unknown>>(key);
  return Object.values(h ?? {}).map((v) => parse<T>(v));
}

/* ---------- 신청자 ---------- */
export const listMembers = async (blockId: string) => (await all<ChallengeMember>(k(blockId, MEMBERS))).sort((a, b) => a.appliedAt - b.appliedAt);
export async function getMemberRec(blockId: string, nick: string) {
  const v = await redis.hget(k(blockId, MEMBERS), nick);
  return v ? parse<ChallengeMember>(v) : null;
}
export const saveMemberRec = (blockId: string, m: ChallengeMember) => redis.hset(k(blockId, MEMBERS), { [m.nick]: JSON.stringify(m) });
export const removeMemberRec = (blockId: string, nick: string) => redis.hdel(k(blockId, MEMBERS), nick);

/* ---------- 활동 ---------- */
export const listActs = async (blockId: string) => (await all<Activity>(k(blockId, ACTS))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export async function getActRec(blockId: string, id: string) {
  const v = await redis.hget(k(blockId, ACTS), id);
  return v ? parse<Activity>(v) : null;
}
export const saveActRec = (blockId: string, a: Activity) => redis.hset(k(blockId, ACTS), { [a.id]: JSON.stringify(a) });

/* ---------- 캡처 이미지 (공구 시안 이미지처럼 base64로 저장) ---------- */
type Img = { type: string; data: string };
const imgKey = (blockId: string, actId: string, kind: ImgKind) => k(blockId, `img:${actId}:${kind}`);
export const putImage = (blockId: string, actId: string, kind: ImgKind, img: Img) => redis.set(imgKey(blockId, actId, kind), img);
export const getImage = (blockId: string, actId: string, kind: ImgKind) => redis.get<Img>(imgKey(blockId, actId, kind));
export const delImage = (blockId: string, actId: string, kind: ImgKind) => redis.del(imgKey(blockId, actId, kind));
/** 활동과 그 캡처를 함께 지운다 */
export async function removeActRec(blockId: string, id: string) {
  await redis.hdel(k(blockId, ACTS), id);
  await redis.del(...IMG_KINDS.map((kind) => imgKey(blockId, id, kind)));
}

/* ---------- 장소 정리표: 입력 키(placeKey) → 묶음 이름 ---------- */
export async function listPlaceMap(blockId: string): Promise<Record<string, string>> {
  const h = await redis.hgetall<Record<string, string>>(k(blockId, PLACES));
  return h ?? {};
}
export async function setPlaceGroup(blockId: string, key: string, label: string | null) {
  if (label) await redis.hset(k(blockId, PLACES), { [key]: label });
  else await redis.hdel(k(blockId, PLACES), key);
}

/* ---------- 이의 제기 ---------- */
export const listAppeals = async (blockId: string) => (await all<Appeal>(k(blockId, APPEALS))).sort((a, b) => b.at - a.at);
export async function getAppeal(blockId: string, id: string) {
  const v = await redis.hget(k(blockId, APPEALS), id);
  return v ? parse<Appeal>(v) : null;
}
export const saveAppeal = (blockId: string, a: Appeal) => redis.hset(k(blockId, APPEALS), { [a.id]: JSON.stringify(a) });

/* ---------- 판정·처리 로그 (지우지 않는다) ---------- */
export async function addLog(blockId: string, e: Omit<LogEntry, "at">) {
  const at = Date.now();
  await redis.hset(k(blockId, LOG), { [`${at}-${Math.random().toString(36).slice(2, 6)}`]: JSON.stringify({ at, ...e }) });
}
export const listLog = async (blockId: string, limit = 50) => (await all<LogEntry>(k(blockId, LOG))).sort((a, b) => b.at - a.at).slice(0, limit);

/** 챌린지 블록을 지울 때 그 블록의 모든 데이터와 캡처를 지운다 */
export async function purgeChallenge(blockId: string) {
  const acts = await all<Activity>(k(blockId, ACTS));
  const tx = redis.multi();
  for (const a of acts) for (const kind of IMG_KINDS) tx.del(imgKey(blockId, a.id, kind));
  tx.del(k(blockId, MEMBERS), k(blockId, ACTS), k(blockId, PLACES), k(blockId, APPEALS), k(blockId, LOG));
  await tx.exec();
}
