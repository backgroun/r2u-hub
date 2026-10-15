import "server-only";
import { redis } from "@/lib/hub";
import { RUNNER_RULES } from "@/lib/runner-rules";

/* 스팟게임 수집 기록: 누가 어떤 용품을 잡았는지 (용품 번호 → 처음 잡은 시각).
   목적은 포인트가 아니라 "한 사람에게 같은 용품이 되도록 다시 안 나오게" 하는 것이다.
   용품 세트를 교체하면 RUNNER_RULES.set을 바꿔 모두 새로 시작한다. */
export const gearKey = (nick: string) => `r2u:gear:${RUNNER_RULES.set}:${nick}`;
export type GearCaught = Record<number, number>;
const toMap = (h: Record<string, unknown> | null | undefined): GearCaught => {
  const o: GearCaught = {};
  for (const [k, v] of Object.entries(h ?? {})) { const i = Number(k); if (Number.isInteger(i) && i >= 0) o[i] = Number(v) || 0; }
  return o;
};

export async function caughtGears(nick: string): Promise<GearCaught> {
  return toMap(await redis.hgetall<Record<string, unknown>>(gearKey(nick)));
}

/** 이 사람이 아직 못 잡은 용품 중에서 하나를 뽑는다. 전부 잡았으면 아무거나. */
export async function pickGear(nick: string, total: number): Promise<number> {
  const caught = await caughtGears(nick).catch(() => ({} as GearCaught));
  const all = Array.from({ length: total }, (_, i) => i);
  const unseen = all.filter((i) => !(i in caught));
  const pool = unseen.length ? unseen : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 잡은 용품을 기록한다 (처음 잡은 시각만 남긴다) */
export async function markGear(nick: string, i: number) {
  try { await redis.hsetnx(gearKey(nick), String(i), Date.now()); } catch { /* 수집 기록은 덤 */ }
}

/** 운영자용: 여러 사람의 수집 기록 */
export async function gearBoard(nicks: string[]): Promise<Record<string, GearCaught>> {
  const rows = await Promise.all(nicks.map((n) => redis.hgetall<Record<string, unknown>>(gearKey(n)).then(toMap).catch(() => ({} as GearCaught))));
  return Object.fromEntries(nicks.map((n, i) => [n, rows[i]]));
}

/* ── 쿠팡 파트너스 링크: 용품 번호(0부터) → 링크. 용품 세트(set)별로 따로 저장한다 ── */
const LINKS = () => `r2u:gearLinks:${RUNNER_RULES.set}`;
/** 받아 주는 주소: 쿠팡 파트너스가 발급하는 짧은 링크만 (https) */
export const COUPANG_HOSTS = ["link.coupang.com", "coupa.ng"];
export const isCoupangLink = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && COUPANG_HOSTS.includes(x.hostname); } catch { return false; } };

export async function gearLinks(): Promise<Record<number, string>> {
  const h = (await redis.hgetall<Record<string, unknown>>(LINKS()).catch(() => null)) ?? {};
  const o: Record<number, string> = {};
  for (const [k, v] of Object.entries(h)) { const i = Number(k); if (Number.isInteger(i) && typeof v === "string" && isCoupangLink(v)) o[i] = v; }
  return o;
}
export async function gearLinkOf(i: number): Promise<string | null> {
  if (!Number.isInteger(i) || i < 0) return null;
  const v = await redis.hget<string>(LINKS(), String(i)).catch(() => null);
  return typeof v === "string" && isCoupangLink(v) ? v : null;
}
/** 용품 하나의 링크를 바꾼다 (url이 null이면 그 용품의 링크를 지운다) */
export async function setGearLink(i: number, url: string | null) {
  if (url) await redis.hset(LINKS(), { [String(i)]: url });
  else await redis.hdel(LINKS(), String(i));
}
/** 전체를 통째로 바꾼다 (입력에 없는 용품은 링크가 지워진다) */
export async function replaceGearLinks(map: Record<number, string>) {
  const tx = redis.multi();
  tx.del(LINKS());
  if (Object.keys(map).length) tx.hset(LINKS(), Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v])));
  await tx.exec();
}
/** "번호 링크" 줄들을 읽는다. 번호는 화면 번호(1~total). 잘못된 줄이 있으면 어느 줄인지 알려 준다. */
export function parseGearLinks(text: string, total: number): { map: Record<number, string> } | { error: string } {
  const map: Record<number, string> = {};
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,3})\s*[.:)\-]?\s*(https?:\/\/\S+)$/);
    if (!m) return { error: `${n + 1}번째 줄을 읽지 못했어요. “번호 링크” 모양으로 적어 주세요. (예: 1 https://link.coupang.com/a/abc)` };
    const no = Number(m[1]);
    if (no < 1 || no > total) return { error: `${n + 1}번째 줄: 번호는 1~${total} 사이여야 해요.` };
    if (!isCoupangLink(m[2])) return { error: `${n + 1}번째 줄: 쿠팡 파트너스 링크(https://link.coupang.com/…)만 넣을 수 있어요.` };
    map[no - 1] = m[2];
  }
  return { map };
}

/** 오늘 이 계정에 스팟게임을 보여 줬다고 먼저 차지한다. 이미 보여 줬으면 false (못 잡았어도 그날은 다시 안 나온다). 동시에 열어도 한 번만 true. */
export async function claimShown(nick: string, today: string, g: number): Promise<boolean> {
  try {
    const key = `r2u:spotShown:${nick}`;
    const first = await redis.hsetnx(key, today, String(g));
    if (first) await redis.expire(key, 14 * 86400); // 오래된 날짜 기록은 저절로 사라진다
    return !!first;
  } catch { return true; } // 기록에 실패해도 게임은 막지 않는다
}

/* ── 제품 추천: 크루원이 용품 카드에서 보낸 링크. 한 용품에 한 사람은 하나만(다시 보내면 바뀐다). 단일 해시에 모아 한 번에 읽는다. ── */
const SUG = () => `r2u:gearSuggest:${RUNNER_RULES.set}`;
export type GearSuggestion = { nick: string; url: string; at: number; test?: boolean };
export async function addGearSuggestion(g: number, nick: string, url: string, test = false) {
  await redis.hset(SUG(), { [`${g}:${nick}`]: JSON.stringify({ url, at: Date.now(), ...(test ? { test: true } : {}) }) });
}
export async function removeGearSuggestion(g: number, nick: string) {
  await redis.hdel(SUG(), `${g}:${nick}`);
}
/** 용품 번호(0부터) → 추천 목록(오래된 순) */
export async function gearSuggestions(): Promise<Record<number, GearSuggestion[]>> {
  const h = (await redis.hgetall<Record<string, unknown>>(SUG()).catch(() => null)) ?? {};
  const o: Record<number, GearSuggestion[]> = {};
  for (const [k, v] of Object.entries(h)) {
    const i = k.indexOf(":"), g = Number(k.slice(0, i)), nick = k.slice(i + 1);
    try { const e = (typeof v === "string" ? JSON.parse(v) : v) as { url: string; at: number; test?: boolean }; if (Number.isInteger(g) && nick && typeof e.url === "string") (o[g] ??= []).push({ nick, url: e.url, at: Number(e.at) || 0, ...(e.test ? { test: true } : {}) }); } catch { /* 손상된 기록은 건너뜀 */ }
  }
  for (const k of Object.keys(o)) o[Number(k)].sort((a, b) => a.at - b.at);
  return o;
}

/* ── 쿠팡 클릭 집계: 어느 용품에서 [쿠팡에서 보기]를 눌렀는지. 한 해시에
   `용품:n`(총 클릭) · `용품:u:닉`(그 사람 클릭 수 → 몇 명) · `용품:d:날짜`(날짜별) · `용품:t`(최근 시각)을 모아 한 번에 읽는다. ── */
const CLK = () => `r2u:gearClick:${RUNNER_RULES.set}`;
export async function trackGearClick(g: number, nick: string, date: string) {
  try {
    const tx = redis.multi();
    tx.hincrby(CLK(), `${g}:n`, 1);
    tx.hincrby(CLK(), `${g}:u:${nick}`, 1);
    tx.hincrby(CLK(), `${g}:d:${date}`, 1);
    tx.hset(CLK(), { [`${g}:t`]: Date.now() });
    await tx.exec();
  } catch { /* 집계는 덤: 실패해도 링크 이동은 막지 않는다 */ }
}
export type GearClickStat = { n: number; users: number; last: number; days: Record<string, number> };
/** 용품 번호(0부터) → 클릭 집계 */
export async function gearClickStats(): Promise<Record<number, GearClickStat>> {
  const h = (await redis.hgetall<Record<string, unknown>>(CLK()).catch(() => null)) ?? {};
  const o: Record<number, GearClickStat> = {};
  for (const [k, v] of Object.entries(h)) {
    const [gs, kind, ...rest] = k.split(":"), g = Number(gs);
    if (!Number.isInteger(g)) continue;
    const st = (o[g] ??= { n: 0, users: 0, last: 0, days: {} }), num = Number(v) || 0;
    if (kind === "n") st.n = num; else if (kind === "u") st.users++; else if (kind === "t") st.last = num; else if (kind === "d") st.days[rest.join(":")] = num;
  }
  return o;
}
/** 같은 사람이 같은 용품을 몇 초 안에 연달아 누른 것은 한 번으로 센다 (true면 새로 세는 클릭) */
export async function clickGate(g: number, nick: string): Promise<boolean> {
  try { return !!(await redis.set(`r2u:gearClickGate:${nick}:${g}`, "1", { nx: true, ex: 3 })); } catch { return true; }
}

/* ── 쿠팡 링크 수정 기록: 누가 언제 어떻게 바꿨는지, 누구 추천인지. 용품마다 최근 20건. ── */
const META = () => `r2u:gearLinkMeta:${RUNNER_RULES.set}`;
export type LinkEdit = { at: number; editor: string; via: "직접" | "일괄" | "자동"; by?: string; url?: string; removed?: boolean };
export async function addLinkEdit(g: number, e: LinkEdit) {
  try {
    const raw = await redis.hget<unknown>(META(), String(g));
    const list: LinkEdit[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : (raw as LinkEdit[])) : [];
    await redis.hset(META(), { [String(g)]: JSON.stringify([e, ...list].slice(0, 20)) });
  } catch { /* 기록은 덤: 실패해도 링크 저장은 막지 않는다 */ }
}
export async function gearLinkEdits(): Promise<Record<number, LinkEdit[]>> {
  const h = (await redis.hgetall<Record<string, unknown>>(META()).catch(() => null)) ?? {};
  const o: Record<number, LinkEdit[]> = {};
  for (const [k, v] of Object.entries(h)) { const g = Number(k); try { if (Number.isInteger(g)) o[g] = typeof v === "string" ? JSON.parse(v) : (v as LinkEdit[]); } catch { /* 손상된 기록은 건너뜀 */ } }
  return o;
}
/** 가장 최근 수정 기록에서 "추천한 사람" 표시만 지운다 (다른 기록은 그대로) */
export async function clearLatestEditBy(g: number) {
  try {
    const raw = await redis.hget<unknown>(META(), String(g));
    const list: LinkEdit[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : (raw as LinkEdit[])) : [];
    if (!list[0]?.by) return;
    const { by: _by, ...rest } = list[0]; void _by;
    await redis.hset(META(), { [String(g)]: JSON.stringify([rest, ...list.slice(1)]) });
  } catch { /* 무시 */ }
}
