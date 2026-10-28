import "server-only";
import { redis, kstToday } from "@/lib/hub";
import { hubPeriod } from "@/lib/event";
import { DEFAULT_MISSIONS, type BingoMission } from "@/lib/bingo-missions";
import { EVENT_NICKS_KEY } from "@/lib/sheet";

/* ---------- 빙고 데이터 (허브 안에서 전부 처리) ----------
   예전에는 별도 서버(Supabase)에 이름·비밀번호·운영진 비밀 문장으로 묶여 있었다.
   이제 신원은 허브 로그인이고, 기록·미션·안내·사진 모두 허브 Redis 에 있다. */
export type BingoRow = { n: string; no: number; d: string };
export type BingoInfo = { title: string; items: string[]; start: string; end: string; maxPerDay: number };
export type { BingoMission };

export const DEFAULT_MAX_PER_DAY = 3;
const ROWS = "r2u:bingo:rows"; // 필드 `${nick}|${no}` → BingoRow
const MISSIONS = "r2u:bingo:missions"; // 필드 no → 운영진이 고친 {e,t,d}
const INFO = "r2u:bingo:info";
const photoKey = (path: string) => `r2u:bingo:photo:${path}`;
const PHOTOS = "r2u:bingo:photos"; // 필드 `${nick}|${no}` → 사진 경로
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const norm = (s: string) => s.trim().toLowerCase();
const rowId = (nick: string, no: number) => `${nick}|${no}`;

export async function getRoster(): Promise<string[]> {
  const raw = await redis.get<string[] | string>(EVENT_NICKS_KEY);
  return Array.isArray(raw) ? raw : typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
}
export async function setRoster(list: string[]) { await redis.set(EVENT_NICKS_KEY, JSON.stringify(list)); }

export async function allRows(): Promise<BingoRow[]> {
  const all = (await redis.hgetall<Record<string, unknown>>(ROWS)) ?? {};
  return Object.values(all).map((v) => parse<BingoRow>(v)).sort((a, b) => a.d.localeCompare(b.d) || a.no - b.no);
}

export async function getMissions(): Promise<BingoMission[]> {
  const over = (await redis.hgetall<Record<string, unknown>>(MISSIONS)) ?? {};
  return DEFAULT_MISSIONS.map((m) => {
    const o = over[String(m.no)] ? parse<Partial<BingoMission>>(over[String(m.no)]) : null;
    return o ? { no: m.no, e: o.e ?? m.e, t: o.t ?? m.t, d: o.d ?? m.d } : m;
  });
}
export async function saveMission(no: number, e: string, t: string, d: string) {
  await redis.hset(MISSIONS, { [String(no)]: JSON.stringify({ e, t, d }) });
}

export async function getInfo(): Promise<BingoInfo> {
  const raw = await redis.get<BingoInfo | string>(INFO);
  const saved = raw ? parse<Partial<BingoInfo>>(raw) : {};
  const period = await hubPeriod();
  return { title: saved.title ?? "", items: saved.items ?? [], start: period?.start ?? saved.start ?? "2026-11-01", end: period?.end ?? saved.end ?? "2026-11-30", maxPerDay: Number.isInteger(saved.maxPerDay) && saved.maxPerDay! >= 1 ? saved.maxPerDay! : DEFAULT_MAX_PER_DAY };
}
export async function saveInfo(info: BingoInfo) { await redis.set(INFO, JSON.stringify(info)); }

/** 클라이언트(빙고 화면)가 받는 전체 상태 */
export async function snapshot() {
  const [rows, names, missions, info] = await Promise.all([allRows(), getRoster(), getMissions(), getInfo()]);
  return { ok: true, rows: rows.map(({ n, no, d }) => ({ n, no, d })), names, fresh: [] as string[], info, missions };
}

export async function myRecords(nick: string) {
  const [rows, photos] = await Promise.all([allRows(), redis.hgetall<Record<string, string>>(PHOTOS)]);
  return rows.filter((r) => norm(r.n) === norm(nick)).map((r) => ({ no: r.no, d: r.d, photo: photos?.[rowId(r.n, r.no)] ?? "" }));
}

/** 칸 인증: 날짜·하루 최대 개수를 확인하고 저장한다. 실패하면 이유를 돌려준다. */
export async function setRow(nick: string, no: number, date: string, photoPath: string): Promise<string | null> {
  if (!Number.isInteger(no) || no < 1 || no > 25) return "미션 번호가 올바르지 않아요.";
  const info = await getInfo();
  if (kstToday() < info.start) return `이벤트가 시작되면(${Number(info.start.slice(5, 7))}월 ${Number(info.start.slice(8))}일) 인증할 수 있어요.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < info.start || date > info.end) return "이벤트 기간 안의 날짜를 골라 주세요.";
  const rows = (await allRows()).filter((r) => norm(r.n) === norm(nick) && r.no !== no);
  if (rows.filter((r) => r.d === date).length >= info.maxPerDay) return `하루 최대 ${info.maxPerDay}개 미션까지만 인정돼요.`;
  await redis.hset(ROWS, { [rowId(nick, no)]: JSON.stringify({ n: nick, no, d: date }) });
  if (photoPath) await redis.hset(PHOTOS, { [rowId(nick, no)]: photoPath });
  return null;
}
export async function removeRow(nick: string, no: number): Promise<string | null> {
  const info = await getInfo();
  if (kstToday() < info.start) return `이벤트가 시작되면(${Number(info.start.slice(5, 7))}월 ${Number(info.start.slice(8))}일) 고칠 수 있어요.`;
  await redis.hdel(ROWS, rowId(nick, no));
  await redis.hdel(PHOTOS, rowId(nick, no));
  return null;
}

/* ---------- 운영진: 명단·기록 정리 ---------- */
export async function clearRecords(nick: string) {
  const rows = (await allRows()).filter((r) => norm(r.n) === norm(nick));
  if (!rows.length) return 0;
  const ids = rows.map((r) => rowId(r.n, r.no));
  await redis.hdel(ROWS, ...ids);
  await redis.hdel(PHOTOS, ...ids);
  return rows.length;
}
/** 칸 인증 기록·사진만 새 닉네임으로 옮긴다 (참가 명단은 호출하는 쪽에서 따로 바꾼다) */
export async function renameBingoRecords(oldNick: string, newNick: string) {
  const rows = (await allRows()).filter((r) => norm(r.n) === norm(oldNick));
  const photos = (await redis.hgetall<Record<string, string>>(PHOTOS)) ?? {};
  for (const r of rows) {
    await redis.hdel(ROWS, rowId(r.n, r.no));
    await redis.hset(ROWS, { [rowId(newNick, r.no)]: JSON.stringify({ ...r, n: newNick }) });
    const p = photos[rowId(r.n, r.no)];
    if (p) { await redis.hdel(PHOTOS, rowId(r.n, r.no)); await redis.hset(PHOTOS, { [rowId(newNick, r.no)]: p }); }
  }
}
/** 운영진이 이름을 바꿀 때: 기록과 명단을 함께 */
export async function renameMember(oldNick: string, newNick: string) {
  await renameBingoRecords(oldNick, newNick);
  const roster = await getRoster();
  await setRoster(roster.map((n) => (norm(n) === norm(oldNick) ? newNick : n)));
}

/* ---------- 인증 사진 (1MB 이하 JPEG, Redis 에 base64 로 보관) ---------- */
export async function savePhoto(path: string, bytes: Buffer) {
  await redis.set(photoKey(path), { type: "image/jpeg", data: bytes.toString("base64") });
}
export async function getPhoto(path: string): Promise<{ type: string; data: string } | null> {
  return await redis.get<{ type: string; data: string }>(photoKey(path));
}
