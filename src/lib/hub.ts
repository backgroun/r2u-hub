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
  links: "r2u:links", // Link[]
  races: "r2u:races", // hash id -> Race
  raceP: (id: string) => `r2u:race:${id}:p`, // hash nick -> course
  cheer: (id: string) => `r2u:race:${id}:cheer`, // hash nick -> 신청 시각
  after: (id: string) => `r2u:race:${id}:after`, // hash afterId -> AfterParty
  rsvp: (afterId: string) => `r2u:after:${afterId}`, // hash nick -> "yes" | "no"
  month: (ym: string) => `r2u:month:${ym}`, // hash nick -> MonthRec
  fails: (nick: string) => `r2u:fails:${nick}`,
};

export type Member = { nick: string; role: "admin" | "member"; pw: string | null };
export type Link = { id: string; title: string; url: string; desc: string; tag: string };
export type Race = {
  id: string; no?: number; name: string; date: string; place: string; note: string;
  time?: string; // 출발 시각 HH:MM (새로 입력한 대회부터)
  regStart?: string; regEnd?: string; // 접수 시작·마감 YYYY-MM-DDTHH:MM (한국 시간)
  reg: string; // 예전 시트에서 옮긴 접수기간 글자 (접수 날짜를 고르면 비운다)
  src?: string; // 마라톤온라인 대회 번호 (대회 찾기로 추가한 경우)
  addedBy?: string; // 대회 찾기로 추가한 크루원
};
/** 대회 아래 함께하기 글: 단체사진(photo) · 카풀(carpool) · 뒷풀이(after, 예전 글은 kind 없음) */
export type AfterKind = "photo" | "carpool" | "after";
export type AfterParty = { id: string; kind?: AfterKind; place: string; time: string; memo: string; seats?: number; by: string; at: number };
export type AfterFull = AfterParty & { yes: string[]; no: string[] };
export type RaceFull = Race & { participants: { nick: string; course: string }[]; cheers: string[]; afters: AfterFull[] };
export type MonthRec = { goal: number; days: Record<string, number>; goalEdits?: number }; // goalEdits: 크루원이 목표를 바꾼 횟수 (월 2번까지)
export const GOAL_EDIT_LIMIT = 2;
export type User = { nick: string; admin: boolean };
/** 운영진 모드(관리용 ‘운영진’ 계정): 개인 기록·참가 입력을 하지 않는다 */
export const isStaffAccount = (u: { nick: string } | null) => u?.nick === "운영진";

const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
export const newId = () => randomBytes(5).toString("base64url");

/* ---------- 회원 ---------- */
export async function getMembers(): Promise<Member[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.members)) ?? {};
  return Object.entries(h)
    .map(([nick, v]) => ({ ...parse<Omit<Member, "nick">>(v), nick }))
    .sort((a, b) => (a.role === b.role ? a.nick.localeCompare(b.nick, "ko") : a.role === "admin" ? -1 : 1));
}
/** 운영진으로 지정된 크루원 닉네임 (왕관 표시용) */
export async function getAdminNicks(): Promise<Set<string>> {
  return new Set((await getMembers()).filter((m) => m.role === "admin" && m.nick !== "운영진").map((m) => m.nick));
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
export const MENU_DEFAULTS = { races: "대회", monthly: "월간기록", groupbuy: "공구", bingo: "11월 이벤트" };
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
  return races.map((r, i) => ({
    ...r,
    participants: Object.entries(res[i * 3] ?? {}).map(([nick, course]) => ({ nick, course: String(course ?? "") })),
    cheers: Object.keys(res[i * 3 + 1] ?? {}),
    afters: afters[i].map((a) => {
      const v = Object.entries(byId.get(a.id) ?? {});
      return { ...a, yes: v.filter(([, x]) => x === "yes").map(([n]) => n), no: v.filter(([, x]) => x === "no").map(([n]) => n) };
    }),
  }));
}

/* ---------- 월간 기록 ---------- */
export async function getMonth(ym: string): Promise<Record<string, MonthRec>> {
  const h = (await redis.hgetall<Record<string, unknown>>(K.month(ym))) ?? {};
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
export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** 로그인한 크루원. 역할은 매번 DB에서 다시 읽어서, 운영진 해제·삭제가 즉시 반영된다. */
export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [n, t, sig] = raw.split(".");
  if (!sig || sign(`${n}.${t}`) !== sig) return null;
  const m = await getMember(Buffer.from(n, "base64url").toString());
  if (!m || !m.pw) return null;
  return { nick: m.nick, admin: m.role === "admin" };
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
