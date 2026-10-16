import "server-only";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// 공구(gb:)와 같은 Upstash 저장소. 허브 데이터는 r2u: 접두어로 구분한다.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const K = {
  members: "r2u:members", // hash nick -> Member
  lastSeen: "r2u:lastSeen", // hash nick -> 마지막 접속 시각(ms)
  seenThrottle: (nick: string) => `r2u:seenThrottle:${nick}`,
  nickAliases: "r2u:nickAliases", // 시트에 남은 예전 닉네임 -> 현재 닉네임
  links: "r2u:links", // Link[]
  races: "r2u:races", // hash id -> Race
  raceP: (id: string) => `r2u:race:${id}:p`, // hash nick -> course
  cheer: (id: string) => `r2u:race:${id}:cheer`, // hash nick -> 신청 시각
  after: (id: string) => `r2u:race:${id}:after`, // hash afterId -> AfterParty
  afterPhoto: (afterId: string) => `r2u:afterPhoto:${afterId}`, // 단사 사진 1장 {type,data(base64)} · 대회 다음 날 자동 만료
  afterWhy: (afterId: string) => `r2u:afterWhy:${afterId}`, // 단사 불참 사유 hash nick -> 사유
  rsvp: (afterId: string) => `r2u:after:${afterId}`, // hash nick -> "yes" | "no"
  raceRec: (nick: string) => `r2u:racerec:${nick}`, // hash raceId -> RaceRec (내 대회 기록)
  vs: (ym: string) => `r2u:vs:${ym}`, // hash 내 닉네임 -> 이번 달 대결 상대 닉네임
  vsEnd: (ym: string) => `r2u:vsEnd:${ym}`, // hash 종료 요청자 -> 승인할 상대
  month: (ym: string) => `r2u:month:${ym}`, // hash nick -> MonthRec
  fails: (nick: string) => `r2u:fails:${nick}`,
};

/** name·date: 대회 목록에 없는 대회를 직접 적어 ‘개별 등록’한 기록 (id가 own-로 시작) */
export type RaceRec = { course: string; sec: number; time: string; note: string; at: number; name?: string; date?: string };
export const OWN_RACE_PREFIX = "own-";
/** 기록이 가리키는 대회 이름·날짜: 대회 목록에서 찾고, 없으면 개별 등록 정보 */
export const recRace = (id: string, rec: RaceRec, byId: Map<string, { name: string; date: string }>) =>
  byId.get(id) ?? (rec.name && rec.date ? { name: rec.name, date: rec.date } : undefined);
/** "1:45:30"·"45:30"을 초로. 형식이 맞지 않으면 null */
export function parseRaceTime(t: string): { sec: number; time: string } | null {
  const m = t.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0), mi = Number(m[2]), se = Number(m[3]);
  if (mi > 59 || se > 59 || (!h && !mi && !se)) return null;
  const sec = h * 3600 + mi * 60 + se;
  return { sec, time: `${h}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}` };
}
export async function getRaceRecs(nick: string): Promise<Record<string, RaceRec>> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.raceRec(nick))) ?? {};
  return Object.fromEntries(Object.entries(h).map(([id, v]) => [id, parse<RaceRec>(v)]));
}

export type Member = { nick: string; name?: string; role: "admin" | "member"; pw: string | null; manager?: boolean; managerPreviousRole?: "admin" | "member" };
export const memberLabel = (m: Pick<Member, "nick" | "name">) => `${m.nick}/${m.name?.trim() || "없음"}`;
export type Link = { id: string; title: string; url: string; desc: string; tag: string };
export type Race = {
  id: string; no?: number; name: string; date: string; place: string; note: string;
  address?: string; placeUrl?: string; // 카카오맵에서 선택한 대회 장소
  time?: string; // 출발 시각 HH:MM (새로 입력한 대회부터)
  regStart?: string; regEnd?: string; // 접수 시작·마감 YYYY-MM-DDTHH:MM (한국 시간)
  regUrl?: string; // 주최 측 접수 페이지 (크루 참가 표시와 별개)
  reg: string; // 예전 시트에서 옮긴 접수기간 글자 (접수 날짜를 고르면 비운다)
  src?: string; // 마라톤온라인 대회 번호 (대회 찾기로 추가한 경우)
  addedBy?: string; // 대회 찾기로 추가한 크루원
};
/** 대회 아래 함께하기 글: 단체사진(photo) · 카풀(carpool) · 뒷풀이(after, 예전 글은 kind 없음) */
export type AfterKind = "photo" | "carpool" | "after";
export type AfterParty = { id: string; kind?: AfterKind; place: string; address?: string; placeUrl?: string; time: string; memo: string; seats?: number; driver?: string; photo?: boolean; by: string; at: number }; // photo: 단사 사진 있음 · by: 올린 사람, driver: 카풀 운전자(없으면 올린 사람)
export const driverOf = (a: { driver?: string; by: string }) => a.driver || a.by;
export type AfterFull = AfterParty & { yes: string[]; no: string[]; why: Record<string, { t: string; at: number }> };
export type RaceFull = Race & { participants: { nick: string; course: string }[]; cheers: string[]; afters: AfterFull[] };
export type MonthRec = { goal: number; days: Record<string, number>; goalEdits?: number }; // goalEdits: 크루원이 목표를 바꾼 횟수 (월 2번까지)
export const GOAL_EDIT_LIMIT = 2;
export type User = { nick: string; admin: boolean; realAdmin?: boolean }; // admin: 지금 보는 모드 기준 · realAdmin: 실제 운영진인가(크루 보기 중에도 true)
/** 운영진 모드(관리용 ‘운영진’ 계정): 개인 기록·참가 입력을 하지 않는다 */
export const isStaffNick = (nick: string | null | undefined) => nick === "운영진" || nick === "관리자";
export const isStaffAccount = (u: { nick: string } | null) => isStaffNick(u?.nick);
/** "관리자" 여부: 관리자로 지정된 계정, 또는 공용 "관리자" 계정. 운영진 권한만 있는 계정은 해당하지 않는다. */
export async function isManagerUser(u: { nick: string; admin?: boolean } | null): Promise<boolean> {
  if (!u?.admin) return false;
  if (isStaffNick(u.nick)) return u.nick === "관리자";
  return !!(await getMember(u.nick))?.manager;
}

const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
export const newId = () => randomBytes(5).toString("base64url");

/* ---------- 회원 ---------- */
export async function getMembers(): Promise<Member[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.members)) ?? {};
  return Object.entries(h)
    .map(([nick, v]) => ({ ...parse<Omit<Member, "nick">>(v), nick }))
    .sort((a, b) => (a.role === b.role ? a.nick.localeCompare(b.nick, "ko") : a.role === "admin" ? -1 : 1));
}
export async function getLastSeen(): Promise<Record<string, number>> {
  const values = (await redis.hgetall<Record<string, number | string>>(K.lastSeen)) ?? {};
  return Object.fromEntries(Object.entries(values).map(([nick, value]) => [nick, Number(value)]));
}
async function markSeen(nick: string) {
  try {
    if (await redis.set(K.seenThrottle(nick), "1", { nx: true, ex: 300 }) === "OK") {
      await redis.hset(K.lastSeen, { [nick]: Date.now() });
      // 출석 포인트: 하루 한 번 (points.ts가 이 파일을 불러오므로 여기서는 나중에 불러온다)
      const { awardOnce, pts } = await import("@/lib/points");
      await awardOnce(nick, `day:${kstToday()}`, (await pts()).day, "출석");
    }
  } catch { /* 접속 기록 오류로 로그인을 막지 않는다 */ }
}
/** 운영진으로 지정된 크루원 닉네임 (왕관 표시용) */
export async function getAdminNicks(): Promise<Set<string>> {
  return new Set((await getMembers()).filter((m) => m.role === "admin" && !isStaffNick(m.nick)).map((m) => m.nick));
}

export async function getMember(nick: string): Promise<Member | null> {
  const v = await redis.hget(K.members, nick);
  return v ? { ...parse<Omit<Member, "nick">>(v), nick } : null;
}
export async function saveMember(m: Member) {
  const { nick, ...rest } = m;
  await redis.hset(K.members, { [nick]: JSON.stringify(rest) });
}

/* ---------- 링크 ---------- */
// 처음(저장된 링크가 없을 때) 보여 줄 기본 바로가기
const DEFAULT_LINKS: Link[] = [
  { id: "band", title: "네이버 밴드", url: "https://www.band.us/band/94050740/post", desc: "R2U 공지와 크루 소식", tag: "커뮤니티" },
  { id: "sheet", title: "구글시트", url: "https://docs.google.com/spreadsheets/d/12RUB1jWl__CAzTg0msuo3o9sz0M-vdfq-di1dFpSRzM/edit", desc: "R2U 크루 시트", tag: "기록" },
];
export async function getLinks(): Promise<Link[]> {
  const saved = parse<Link[] | null>(await redis.get(K.links));
  if (!saved) return DEFAULT_LINKS;
  // 구글시트 링크를 한 번만 다시 넣는다 (이후 운영진이 지우면 그대로 둔다)
  if (!(await redis.get("r2u:links:sheetAdded"))) {
    if (!saved.some((l) => l.url.includes("docs.google.com/spreadsheets"))) saved.push(DEFAULT_LINKS[1]);
    await saveLinks(saved);
    await redis.set("r2u:links:sheetAdded", 1);
  }
  return saved;
}

/* ---------- 상단 메뉴 이름 (운영진이 바꿀 수 있다) ---------- */
export const MENU_DEFAULTS = { races: "대회", monthly: "월간기록", groupbuy: "공구", bingo: "이벤트" };
export type MenuKey = keyof typeof MENU_DEFAULTS;
export async function getMenu(): Promise<typeof MENU_DEFAULTS> {
  return { ...MENU_DEFAULTS, ...(parse<Partial<typeof MENU_DEFAULTS> | null>(await redis.get("r2u:menu")) ?? {}) };
}

/* ---------- 구글시트 탭 주소 (운영진이 저장) ---------- */
export const SHEET_DEFAULTS = {
  members: "https://docs.google.com/spreadsheets/d/12RUB1jWl__CAzTg0msuo3o9sz0M-vdfq-di1dFpSRzM/edit?gid=254083814",
  races: "https://docs.google.com/spreadsheets/d/12RUB1jWl__CAzTg0msuo3o9sz0M-vdfq-di1dFpSRzM/edit?gid=822661435",
  monthly: "https://docs.google.com/spreadsheets/d/12RUB1jWl__CAzTg0msuo3o9sz0M-vdfq-di1dFpSRzM/edit?gid=1217756043",
};
export type SheetKind = keyof typeof SHEET_DEFAULTS;
export async function getSheets(): Promise<typeof SHEET_DEFAULTS> {
  return { ...SHEET_DEFAULTS, ...(parse<Partial<typeof SHEET_DEFAULTS> | null>(await redis.get("r2u:sheets")) ?? {}) };
}
export async function saveLinks(links: Link[]) {
  await redis.set(K.links, JSON.stringify(links));
}

/* ---------- 대회 ---------- */
export async function getRaces(): Promise<RaceFull[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.races)) ?? {};
  const races = Object.values(h).map((v) => parse<Race>(v));
  races.sort((a, b) => a.date.localeCompare(b.date) || (a.no ?? 1e9) - (b.no ?? 1e9) || a.name.localeCompare(b.name, "ko"));
  if (!races.length) return [];
  // 대회마다 참가자·응원·뒷풀이를 한 번에 읽는다
  const p = redis.pipeline();
  races.forEach((r) => { p.hgetall(K.raceP(r.id)); p.hgetall(K.cheer(r.id)); p.hgetall(K.after(r.id)); });
  const res = (await p.exec()) as (Record<string, unknown> | null)[];
  const afters = races.map((_, i) =>
    Object.values(res[i * 3 + 2] ?? {}).map((v) => parse<AfterParty>(v)).sort((a, b) => a.at - b.at));
  const flat = afters.flat();
  const q = redis.pipeline();
  flat.forEach((a) => q.hgetall(K.rsvp(a.id)));
  const rsvps = flat.length ? ((await q.exec()) as (Record<string, unknown> | null)[]) : [];
  const byId = new Map(flat.map((a, i) => [a.id, rsvps[i] ?? {}]));
  const photos = flat.filter((a) => a.kind === "photo");
  const w = redis.pipeline();
  photos.forEach((a) => w.hgetall(K.afterWhy(a.id)));
  const whys = photos.length ? ((await w.exec()) as (Record<string, unknown> | null)[]) : [];
  const whyById = new Map(photos.map((a, i) => [a.id, Object.fromEntries(Object.entries(whys[i] ?? {}).map(([k, v]) => [k, parse<{ t: string; at: number }>(v)]))]));
  return races.map((r, i) => ({
    ...r,
    participants: Object.entries(res[i * 3] ?? {}).map(([nick, course]) => ({ nick, course: String(course ?? "") })),
    cheers: Object.keys(res[i * 3 + 1] ?? {}),
    afters: afters[i].map((a) => {
      const v = Object.entries(byId.get(a.id) ?? {});
      return { ...a, yes: v.filter(([, x]) => x === "yes").map(([n]) => n), no: v.filter(([, x]) => x === "no").map(([n]) => n), why: whyById.get(a.id) ?? {} };
    }),
  }));
}

/* ---------- 월간 기록 ---------- */
/** 이번 달 내가 고른 대결 상대 (없으면 null) */
export async function getVs(ym: string, nick: string): Promise<string | null> {
  if (ym !== kstToday().slice(0, 7)) return null;
  const v = await redis.hget<string>(K.vs(ym), nick);
  return typeof v === "string" && v ? v : null;
}
/** 이번 달 모든 크루원의 대결 상대 (닉네임 -> 상대 닉네임) */
export async function getAllVs(ym: string): Promise<Record<string, string>> {
  if (ym !== kstToday().slice(0, 7)) return {};
  const h = (await redis.hgetall<Record<string, unknown>>(K.vs(ym))) ?? {};
  if (Object.keys(h).length) await redis.expireat(K.vs(ym), vsExpiry(ym));
  return pairVersus(Object.fromEntries(Object.entries(h).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, v as string])));
}
/** 다음 달 1일 00:00 KST (Redis 만료 시각, Unix 초) */
export function vsExpiry(ym: string) {
  return Math.floor(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0, 15) / 1000);
}
/** 예전 단방향 대결도 서로 짝이 맞는 1:1 쌍으로 해석한다. */
export function pairVersus(raw: Record<string, string>): Record<string, string> {
  const pairs: Record<string, string> = {};
  const entries = Object.entries(raw).filter(([a, b]) => a && b && a !== b && !isStaffNick(a) && !isStaffNick(b));
  for (const [a, b] of entries.filter(([a, b]) => raw[b] === a)) {
    if (!pairs[a] && !pairs[b]) { pairs[a] = b; pairs[b] = a; }
  }
  for (const [a, b] of entries.sort(([a], [b]) => a.localeCompare(b, "ko"))) {
    if (!pairs[a] && !pairs[b]) { pairs[a] = b; pairs[b] = a; }
  }
  return pairs;
}
export async function getMonth(ym: string): Promise<Record<string, MonthRec>> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.month(ym))) ?? {};
  // 잘못 입력된 옛 닉네임의 중복 월간 기록을 저장소에서도 제거한다.
  if (Object.hasOwn(h, "마루(정곤)")) {
    await redis.hdel(K.month(ym), "마루(정곤)");
    delete h["마루(정곤)"];
  }
  return Object.fromEntries(Object.entries(h).map(([n, v]) => [n, parse<MonthRec>(v)]));
}

/* ---------- 비밀번호 · 세션 ---------- */
export const SESSION_COOKIE = "r2u_s";
const MAX_AGE = 60 * 60 * 24 * 90; // 90일

export function hashPw(pw: string) {
  const salt = randomBytes(16).toString("base64url");
  return `${salt}:${scryptSync(pw, salt, 32).toString("base64url")}`;
}
export function checkPw(pw: string, stored: string | null) {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(scryptSync(pw, salt, 32).toString("base64url"));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
function sign(s: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(s).digest("base64url");
}
export async function startSession(nick: string) {
  await redis.hset(K.lastSeen, { [nick]: Date.now() });
  const { awardOnce, pts } = await import("@/lib/points");
  await awardOnce(nick, `day:${kstToday()}`, (await pts()).day, "출석");
  await redis.set(K.seenThrottle(nick), "1", { ex: 300 });
  (await cookies()).delete(PREVIEW_COOKIE); // 이전 사람의 이벤트 미리보기 허용이 남지 않게
  const body = `${Buffer.from(nick).toString("base64url")}.${Date.now()}`;
  (await cookies()).set(SESSION_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
/** 오픈 전 이벤트 미리보기 허용 쿠키 (운영진이 확인한 뒤에만 준다. 미들웨어가 서명을 확인한다) */
export const PREVIEW_COOKIE = "r2u_ev";
export async function allowEventPreview(nick: string) {
  const body = `${Buffer.from(nick).toString("base64url")}.${Date.now()}`;
  (await cookies()).set(PREVIEW_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600,
  });
}
/** 미리보기 쿠키가 우리가 준 것이고, 지금 로그인한 운영진 본인 것인지 확인 */
export async function hasEventPreview() {
  const [n, t, sig] = ((await cookies()).get(PREVIEW_COOKIE)?.value ?? "").split(".");
  if (!sig) return false;
  const a = Buffer.from(sign(`${n}.${t}`)), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const u = await currentUser();
  return !!u?.admin && Buffer.from(n, "base64url").toString() === u.nick;
}
export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(PREVIEW_COOKIE);
}

/** 로그인한 크루원의 실제 역할. 역할은 매번 DB에서 다시 읽어서, 운영진 해제·삭제가 즉시 반영된다. */
async function sessionUser(): Promise<User | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [n, t, sig] = raw.split(".");
  if (!sig || sign(`${n}.${t}`) !== sig) return null;
  const m = await getMember(Buffer.from(n, "base64url").toString());
  if (!m || !m.pw) return null;
  await markSeen(m.nick);
  return { nick: m.nick, admin: m.role === "admin" };
}

/** 실제 운영진인지 확인할 때(보기 모드 전환 등). 크루 보기 중에도 운영진으로 나온다. */
export const currentRealUser = sessionUser;

export const VIEW_COOKIE = "r2u_view"; // "crew" 이면 운영진이 일반 크루원 화면으로 보는 중

/** 로그인한 크루원. 운영진이 ‘크루 보기’를 켜 두면 admin 이 false 로 나와서 화면·권한 모두 일반 크루원과 같아진다. */
export async function currentUser(): Promise<User | null> {
  const u = await sessionUser();
  if (!u) return null;
  if (u.admin) {
    const crew = (await cookies()).get(VIEW_COOKIE)?.value === "crew";
    return { ...u, admin: !crew, realAdmin: true };
  }
  return u;
}

export async function loginBlocked(nick: string) {
  return ((await redis.get<number>(K.fails(nick))) ?? 0) >= 10;
}
export async function recordFail(nick: string) {
  const n = await redis.incr(K.fails(nick));
  if (n === 1) await redis.expire(K.fails(nick), 600);
}

/* ---------- 날짜 ---------- */
export function kstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** 지금 한국 시각 YYYY-MM-DDTHH:MM */
export function kstNow() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
}
/** "2026-10-01T10:00" → "10.01 10:00" */
export function fmtDt(dt: string) {
  const [d, t] = dt.split("T");
  return `${Number(d.slice(5, 7))}.${d.slice(8, 10)}${t ? ` ${t}` : ""}`;
}
/** "2026-10-12T10:30" → "10/12(월) 10시 30분" (24시간제, 정각이면 "10시"). 0시는 외부 대회에서 날짜만 있을 때 채운 값이라 날짜만 보인다 */
export function fmtDtKo(dt: string) {
  const [d, t] = dt.split("T");
  const [h, m] = (t ?? "").split(":").map(Number);
  const wd = WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()];
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${wd})${t && (h || m) ? ` ${h}시${m ? ` ${m}분` : ""}` : ""}`;
}
/** 접수기간 표시 글자와 상태(접수예정·접수중·접수마감) */
export function regInfo(r: Race, now = kstNow()): { text: string; status?: "soon" | "open" | "closed" } {
  if (!r.regStart && !r.regEnd) return { text: r.reg };
  const text = `${r.regStart ? fmtDt(r.regStart) : ""} ~ ${r.regEnd ? fmtDt(r.regEnd) : ""}`.trim();
  const status = r.regEnd && now > r.regEnd ? "closed" : r.regStart && now < r.regStart ? "soon" : "open";
  return { text, status };
}
export function fmtRaceDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return { md: `${m}.${String(day).padStart(2, "0")}`, w, y };
}

/* ---------- 빙고 비밀번호 보관 (본인 자동 입장용, 암호화) ---------- */
const bingoKey = () => createHash("sha256").update(`${process.env.SESSION_SECRET}:bingo-pw`).digest();
export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", bingoKey(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function unseal(box: string): string | null {
  try {
    const [iv, tag, enc] = box.split(".").map((x) => Buffer.from(x, "base64url"));
    const d = createDecipheriv("aes-256-gcm", bingoKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}
