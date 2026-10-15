import "server-only";
import { cache } from "react";
import { redis, isStaffNick, type MonthRec } from "@/lib/hub";

/* 레벨 포인트: 2026-10-15부터 활동할 때마다 쌓는다 (그 전 활동은 세지 않는다).
   같은 활동은 키 하나로 저장해서 몇 번을 눌러도 한 번만 쌓이고, 취소·삭제하면 0으로 되돌린다. */
export const POINTS_START = "2026-10-15";
/** 기본 포인트 기준 (운영진 화면에서 바꾸면 r2u:ptConfig에 저장된 값을 쓴다) */
export const DEFAULT_PT = {
  day: 1, // 출석 (하루 첫 접속)
  race: 5, // 대회 크루 참가 표시 (아직 열리지 않은 대회만)
  recFinish: 10, recDnf: 3, // 대회 기록 (완주 / DNF)
  cheer: 5, // 대회 응원 신청
  after: 5, photo: 5, // 뒤풀이 참석, 단체사진 올리기
  drive: 10, ride: 3, // 카풀 운전 / 탑승
  goal: 30, // 월 목표 달성
  kmPer: 10, // 월간 기록: 그달 거리 kmPer km마다 1P
  versus: 10, // 1:1 대결 참가
  bingo: 5, // 빙고 미션 완료
  gb: 3, // 공구 주문
  runner: 5, // 가끔 나타나는 러너 캐릭터 잡기 (하루 한 번)
};
export type PointRules = typeof DEFAULT_PT;
export const DEFAULT_STEP = 100; // 한 단계(색 안의 단계)에 필요한 포인트
/** 운영진 화면에 보여 줄 항목 이름 */
export const PT_LABELS: Record<keyof PointRules, string> = {
  day: "출석", race: "대회 참가 표시", recFinish: "대회 기록 (완주)", recDnf: "대회 기록 (DNF·DNS)", cheer: "대회 응원",
  after: "뒤풀이 참석", photo: "단사 올리기", drive: "카풀 운전", ride: "카풀 탑승", goal: "월 목표 달성",
  kmPer: "월간 기록 (몇 km마다 1P)", versus: "1:1 대결 참가", bingo: "빙고 미션", gb: "공구 주문", runner: "깜짝 러너",
};
const CONFIG = "r2u:ptConfig"; // { pt, step }

/** 지금 쓰는 포인트 기준 (저장된 값이 없거나 빠진 항목은 기본값) */
export const getPointConfig = cache(async (): Promise<{ pt: PointRules; step: number }> => {
  try {
    const c = await redis.get<{ pt?: Partial<PointRules>; step?: number } | string>(CONFIG);
    const v = (typeof c === "string" ? JSON.parse(c) : c) ?? {};
    return { pt: { ...DEFAULT_PT, ...(v.pt ?? {}) }, step: Number(v.step) > 0 ? Number(v.step) : DEFAULT_STEP };
  } catch { return { pt: DEFAULT_PT, step: DEFAULT_STEP }; }
});
export const pts = async () => (await getPointConfig()).pt;
export async function savePointConfig(pt: PointRules, step: number) {
  await redis.set(CONFIG, JSON.stringify({ pt, step }));
}

/** 포인트 기준 안내표 (내 정보의 ‘포인트 기준 보기’) */
export function pointGuide(PT: PointRules): { what: string; p: string; how: string }[] {
  return [
    { what: "출석", p: `${PT.day}P`, how: "하루 첫 접속 때 한 번" },
    { what: "대회 크루 참가 표시", p: `${PT.race}P`, how: "앞으로 열릴 대회만 · 대회마다 한 번 · 참가 취소하면 빠짐" },
    { what: "대회 기록 (완주)", p: `${PT.recFinish}P`, how: `${Number(POINTS_START.slice(5, 7))}월 ${Number(POINTS_START.slice(8))}일 이후 열린 대회 기록만 · DNF·DNS는 ${PT.recDnf}P · 기록 삭제하면 빠짐` },
    { what: "대회 응원 신청", p: `${PT.cheer}P`, how: "대회마다 한 번 · 응원 취소하면 빠짐" },
    { what: "뒤풀이 참석", p: `${PT.after}P`, how: "뒤풀이마다 ‘참석’ 표시 · 불참·취소하면 빠짐" },
    { what: "단체사진(단사) 올리기", p: `${PT.photo}P`, how: "올린 글마다 · 글 삭제하면 빠짐" },
    { what: "카풀 운전", p: `${PT.drive}P`, how: "카풀마다 운전자에게 · 글 삭제하면 빠짐" },
    { what: "카풀 탑승", p: `${PT.ride}P`, how: "카풀마다 ‘탑승’ 표시 · 취소하면 빠짐" },
    { what: "월간 기록", p: `${PT.kmPer}km당 1P`, how: `그달 달린 거리 합계 기준, 소수점까지 (예: 95km → ${r1(95 / PT.kmPer)}P) · 기록을 고치면 바뀐 만큼 반영` },
    { what: "월 목표 달성", p: `${PT.goal}P`, how: "그달 거리가 목표 이상이 되면 · 다시 모자라면 빠짐" },
    { what: "1:1 대결 참가", p: `${PT.versus}P`, how: "대결이 시작되면 두 사람 모두 · 운영진이 취소하면 빠짐" },
    { what: "빙고 미션 완료", p: `${PT.bingo}P`, how: "미션 칸마다 · 인증 취소하면 빠짐" },
    { what: "공구 주문", p: `${PT.gb}P`, how: "공구마다 한 번 · 주문 삭제하면 빠짐" },
    { what: "깜짝 러너 잡기 🏃", p: `${PT.runner}P`, how: "앱에 아주 가끔 뛰어가는 러너를 누르면 · 하루 한 번" },
  ];
}

const LOG = (nick: string) => `r2u:pt:${nick}`; // hash 활동키 -> PointEntry
const TOTAL = "r2u:ptTotal"; // hash nick -> 누적 포인트
export type PointEntry = { p: number; why: string; at: number };

const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as PointEntry;
/** 포인트는 소수 첫째 자리까지 (월간 km 9.5P 등) */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** 한 활동의 포인트를 p로 맞춘다 (0이면 지운다). 포인트 오류로 원래 동작을 막지 않는다. */
export async function setPoints(nick: string | null | undefined, key: string, p: number, why: string) {
  if (!nick || isStaffNick(nick)) return;
  const next = Math.max(0, r1(p));
  try {
    const cur = await redis.hget<unknown>(LOG(nick), key);
    const prev = cur ? parse(cur).p : 0;
    if (prev === next) return;
    if (next > 0) await redis.hset(LOG(nick), { [key]: JSON.stringify({ p: next, why, at: Date.now() } satisfies PointEntry) });
    else await redis.hdel(LOG(nick), key);
    await redis.hincrbyfloat(TOTAL, nick, r1(next - prev));
  } catch { /* 포인트는 덤: 실패해도 넘어간다 */ }
}

/** 출석처럼 한 번만 주는 포인트 (이미 받았으면 그대로) */
export async function awardOnce(nick: string, key: string, p: number, why: string): Promise<boolean> {
  if (!nick || isStaffNick(nick)) return false;
  try {
    if (await redis.hsetnx(LOG(nick), key, JSON.stringify({ p, why, at: Date.now() } satisfies PointEntry))) { await redis.hincrbyfloat(TOTAL, nick, p); return true; }
  } catch { /* 포인트는 덤 */ }
  return false;
}

/** 월간 기록이 바뀌면 그달 km 포인트와 목표 달성 포인트를 다시 맞춘다 (시작일 이후 날짜만 센다) */
export async function syncMonthPoints(nick: string, ym: string, rec: MonthRec | null) {
  if (ym < POINTS_START.slice(0, 7)) return;
  const days = rec?.days ?? {};
  const km = Object.entries(days).reduce((a, [d, v]) => (`${ym}-${String(d).padStart(2, "0")}` >= POINTS_START ? a + (Number(v) || 0) : a), 0);
  const all = Object.values(days).reduce((a: number, v) => a + (Number(v) || 0), 0);
  const m = Number(ym.slice(5));
  const PT = await pts();
  await setPoints(nick, `km:${ym}`, km / PT.kmPer, `${m}월 달린 거리`);
  await setPoints(nick, `goal:${ym}`, rec && rec.goal > 0 && all >= rec.goal ? PT.goal : 0, `${m}월 목표 달성`);
}

export async function getPointTotals(): Promise<Record<string, number>> {
  const h = (await redis.hgetall<Record<string, number | string>>(TOTAL)) ?? {};
  return Object.fromEntries(Object.entries(h).map(([n, v]) => [n, r1(Number(v) || 0)]));
}

export function levelOf(points: number, step = DEFAULT_STEP) {
  const p = Math.max(0, r1(points));
  const lv = Math.floor(p / step) + 1;
  const cur = (lv - 1) * step, next = lv * step;
  return { lv, points: p, cur, next, left: r1(next - p), pct: Math.round(((p - cur) / step) * 100) };
}

/** 닉네임 → 레벨 (닉네임 옆 배지용) */
export async function getLevels(): Promise<Record<string, number>> {
  const [totals, { step }] = await Promise.all([getPointTotals(), getPointConfig()]);
  return Object.fromEntries(Object.entries(totals).map(([n, p]) => [n, levelOf(p, step).lv]));
}

/** 내 포인트: 합계와 최근 내역 */
export async function getMyPoints(nick: string, limit = 8) {
  const [total, log] = await Promise.all([redis.hget<number | string>(TOTAL, nick), redis.hgetall<Record<string, unknown>>(LOG(nick))]);
  const items = Object.values(log ?? {}).map(parse).sort((a, b) => b.at - a.at).slice(0, limit);
  const { step } = await getPointConfig();
  return { ...levelOf(Number(total) || 0, step), items };
}

/** 닉네임 변경 시 함께 옮길 키 (nickname.ts의 트랜잭션에서 쓴다) */
export const pointKeys = { log: LOG, total: TOTAL };

/** 운영진 포인트 조정: 보너스(+)나 차감(-)을 사유와 함께 내역에 남긴다 */
export async function adjustPoints(nick: string, delta: number, why: string) {
  const d = r1(delta);
  if (!nick || isStaffNick(nick) || !d) return;
  await redis.hset(LOG(nick), { [`adj:${Date.now().toString(36)}`]: JSON.stringify({ p: d, why, at: Date.now() } satisfies PointEntry) });
  await redis.hincrbyfloat(TOTAL, nick, d);
}
