import "server-only";
import { allRows, getInfo, getMissions, getRoster, reviewRecords, type BingoInfo, type BingoMission } from "@/lib/bingo-store";

/* ---------- 빙고 운영 설정 (허브 운영진 이벤트 탭) ----------
   명단 = 허브에서 참가 신청한 크루원. 기록·미션·안내 모두 허브 안에 있어서 별도 서버나 비밀 문장이 필요 없다. */
export type BingoMember = { name: string; cnt: number };
export type BingoView = { members: BingoMember[]; missions: BingoMission[]; info: BingoInfo };

export async function bingoView(): Promise<BingoView> {
  const [roster, rows, missions, info] = await Promise.all([getRoster(), allRows(), getMissions(), getInfo()]);
  const cnt = new Map<string, number>();
  for (const r of rows) cnt.set(r.n.toLowerCase(), (cnt.get(r.n.toLowerCase()) ?? 0) + 1);
  return { members: roster.map((name) => ({ name, cnt: cnt.get(name.toLowerCase()) ?? 0 })), missions, info };
}

/** 운영진 인증 확인 화면: 날짜별로 묶은 인증 기록(사진·댓글 포함) */
export async function bingoReview() {
  const [records, missions] = await Promise.all([reviewRecords(), getMissions()]);
  const days = new Map<string, typeof records>();
  for (const r of records) days.set(r.d, [...(days.get(r.d) ?? []), r]);
  return { days: [...days.entries()].map(([d, list]) => ({ d, list })), missions, total: records.length };
}
