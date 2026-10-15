import "server-only";
import { redis, isStaffNick, type MonthRec } from "@/lib/hub";

/* 레벨 포인트: 2026-10-15부터 활동할 때마다 쌓는다 (그 전 활동은 세지 않는다).
   같은 활동은 키 하나로 저장해서 몇 번을 눌러도 한 번만 쌓이고, 취소·삭제하면 0으로 되돌린다. */
export const POINTS_START = "2026-10-15";
export const PT = {
  day: 1, // 출석 (하루 첫 접속)
  race: 10, // 대회 크루 참가 표시
  recFinish: 20, recDnf: 5, // 대회 기록 (완주 / DNF)
  cheer: 5, // 대회 응원 신청
  after: 5, photo: 5, // 뒤풀이 참석, 단체사진 올리기
  drive: 10, ride: 3, // 카풀 운전 / 탑승
  goal: 30, // 월 목표 달성
  kmPer: 10, // 월간 기록: 그달 거리 10km마다 1P
  versus: 10, // 1:1 대결 참가
  bingo: 5, // 빙고 미션 완료
  gb: 3, // 공구 주문
} as const;
/** 포인트 기준 안내표 (내 정보의 ‘포인트 기준 보기’) */
export const POINT_GUIDE: { what: string; p: string; how: string }[] = [
  { what: "출석", p: `${PT.day}P`, how: "하루 첫 접속 때 한 번" },
  { what: "대회 크루 참가 표시", p: `${PT.race}P`, how: "대회마다 한 번 · 참가 취소하면 빠짐" },
  { what: "대회 기록 (완주)", p: `${PT.recFinish}P`, how: `기록마다 한 번 · DNF·DNS는 ${PT.recDnf}P · 기록 삭제하면 빠짐` },
  { what: "대회 응원 신청", p: `${PT.cheer}P`, how: "대회마다 한 번 · 응원 취소하면 빠짐" },
  { what: "뒤풀이 참석", p: `${PT.after}P`, how: "뒤풀이마다 ‘참석’ 표시 · 불참·취소하면 빠짐" },
  { what: "단체사진(단사) 올리기", p: `${PT.photo}P`, how: "올린 글마다 · 글 삭제하면 빠짐" },
  { what: "카풀 운전", p: `${PT.drive}P`, how: "카풀마다 운전자에게 · 글 삭제하면 빠짐" },
  { what: "카풀 탑승", p: `${PT.ride}P`, how: "카풀마다 ‘탑승’ 표시 · 취소하면 빠짐" },
  { what: "월간 기록", p: `${PT.kmPer}km당 1P`, how: `그달 달린 거리 합계 기준, 소수점까지 (예: 95km → ${95 / PT.kmPer}P) · 기록을 고치면 바뀐 만큼 반영` },
  { what: "월 목표 달성", p: `${PT.goal}P`, how: "그달 거리가 목표 이상이 되면 · 다시 모자라면 빠짐" },
  { what: "1:1 대결 참가", p: `${PT.versus}P`, how: "대결이 시작되면 두 사람 모두 · 운영진이 취소하면 빠짐" },
  { what: "빙고 미션 완료", p: `${PT.bingo}P`, how: "미션 칸마다 · 인증 취소하면 빠짐" },
  { what: "공구 주문", p: `${PT.gb}P`, how: "공구마다 한 번 · 주문 삭제하면 빠짐" },
];
/** 100P마다 레벨 1 (Lv.1 = 0P, Lv.2 = 100P, …) · 레벨 상한 없음 */
export const LEVEL_STEP = 100;

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
export async function awardOnce(nick: string, key: string, p: number, why: string) {
  if (!nick || isStaffNick(nick)) return;
  try {
    if (await redis.hsetnx(LOG(nick), key, JSON.stringify({ p, why, at: Date.now() } satisfies PointEntry))) await redis.hincrbyfloat(TOTAL, nick, p);
  } catch { /* 포인트는 덤 */ }
}

/** 월간 기록이 바뀌면 그달 km 포인트와 목표 달성 포인트를 다시 맞춘다 (시작일 이후 날짜만 센다) */
export async function syncMonthPoints(nick: string, ym: string, rec: MonthRec | null) {
  if (ym < POINTS_START.slice(0, 7)) return;
  const days = rec?.days ?? {};
  const km = Object.entries(days).reduce((a, [d, v]) => (`${ym}-${String(d).padStart(2, "0")}` >= POINTS_START ? a + (Number(v) || 0) : a), 0);
  const all = Object.values(days).reduce((a: number, v) => a + (Number(v) || 0), 0);
  const m = Number(ym.slice(5));
  await setPoints(nick, `km:${ym}`, km / PT.kmPer, `${m}월 달린 거리`);
  await setPoints(nick, `goal:${ym}`, rec && rec.goal > 0 && all >= rec.goal ? PT.goal : 0, `${m}월 목표 달성`);
}

export async function getPointTotals(): Promise<Record<string, number>> {
  const h = (await redis.hgetall<Record<string, number | string>>(TOTAL)) ?? {};
  return Object.fromEntries(Object.entries(h).map(([n, v]) => [n, r1(Number(v) || 0)]));
}

export function levelOf(points: number) {
  const p = Math.max(0, r1(points));
  const lv = Math.floor(p / LEVEL_STEP) + 1;
  const cur = (lv - 1) * LEVEL_STEP, next: number | null = lv * LEVEL_STEP;
  return { lv, points: p, cur, next, left: r1(next - p), pct: Math.round(((p - cur) / LEVEL_STEP) * 100) };
}

/** 닉네임 → 레벨 (닉네임 옆 배지용) */
export async function getLevels(): Promise<Record<string, number>> {
  const totals = await getPointTotals();
  return Object.fromEntries(Object.entries(totals).map(([n, p]) => [n, levelOf(p).lv]));
}

/** 내 포인트: 합계와 최근 내역 */
export async function getMyPoints(nick: string, limit = 8) {
  const [total, log] = await Promise.all([redis.hget<number | string>(TOTAL, nick), redis.hgetall<Record<string, unknown>>(LOG(nick))]);
  const items = Object.values(log ?? {}).map(parse).sort((a, b) => b.at - a.at).slice(0, limit);
  return { ...levelOf(Number(total) || 0), items };
}

/** 닉네임 변경 시 함께 옮길 키 (nickname.ts의 트랜잭션에서 쓴다) */
export const pointKeys = { log: LOG, total: TOTAL };
