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
  // 인증을 많이 한 사람이 위로 (칸 수가 같으면 참가 신청한 순서 그대로)
  const members = roster.map((name) => ({ name, cnt: cnt.get(name.toLowerCase()) ?? 0 })).sort((a, b) => b.cnt - a.cnt);
  return { members, missions, info };
}

const LINES = (() => {
  const l: number[][] = [];
  for (let r = 0; r < 5; r++) l.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) l.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  l.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return l;
})();

/** 크루원 한 명의 리포트: 그 사람의 인증 기록(날짜순 최근 먼저, 사진·댓글 포함)과 빙고 줄 수 */
export async function bingoMemberReport(nick: string) {
  const [records, missions] = await Promise.all([reviewRecords(), getMissions()]);
  const mine = records.filter((r) => r.n.toLowerCase() === nick.toLowerCase());
  const done = new Set(mine.map((r) => r.no - 1));
  return { records: mine, missions, lines: LINES.filter((l) => l.every((i) => done.has(i))).length, photos: mine.filter((r) => r.photo).length, comments: mine.reduce((a, r) => a + r.comments.length, 0) };
}

/** 운영진 인증 확인 화면: 날짜별로 묶은 인증 기록(사진·댓글 포함) */
export async function bingoReview() {
  const [records, missions] = await Promise.all([reviewRecords(), getMissions()]);
  const days = new Map<string, typeof records>();
  for (const r of records) days.set(r.d, [...(days.get(r.d) ?? []), r]);
  return { days: [...days.entries()].map(([d, list]) => ({ d, list })), missions, total: records.length };
}
