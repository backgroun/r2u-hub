// 일회성: 끝난 빙고 이벤트를 마무리한다.
//  1) 참가자별 성적(칸·줄·사진 수)을 ‘내 페이지’용 이벤트 기록(r2u:eventrec:<닉네임>)으로 남긴다.
//  2) 서버에 저장된 인증 사진(원본·작은 사진)과 인증-사진 연결을 모두 지운다. (인증 칸 기록과 운영진 댓글은 그대로)
// 기본은 미리보기만 한다. APPLY=1 이면 실제로 쓰고 지운다.
// 실행: DATA_BACKEND=postgres [APPLY=1] npx tsx --conditions=react-server --env-file=.env.local scripts/finish-bingo-event.mts
import { readdirSync } from "node:fs";
import { redis, K } from "@/lib/hub";
import { allRows, getInfo, getRoster, reviewRecords } from "@/lib/bingo-store";

const EVENT_ID = "bingo-2026-11";
const TITLE = "11월 빙고 이벤트";
const APPLY = process.env.APPLY === "1";

const LINES = (() => {
  const l: number[][] = [];
  for (let r = 0; r < 5; r++) l.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) l.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  l.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return l;
})();

const info = await getInfo();
const roster = await getRoster();
const rows = await allRows();
const recs = await reviewRecords();
const nicks = new Map<string, string>(); // 소문자 → 표시 닉네임 (참가 신청한 사람 + 인증 기록이 있는 사람)
for (const n of [...roster, ...rows.map((r) => r.n)]) if (!nicks.has(n.toLowerCase())) nicks.set(n.toLowerCase(), n);

const now = Date.now();
const snaps = [...nicks.values()].sort().map((nick) => {
  const mine = rows.filter((r) => r.n.toLowerCase() === nick.toLowerCase());
  const done = new Set(mine.map((r) => r.no - 1));
  const photos = recs.filter((r) => r.n.toLowerCase() === nick.toLowerCase() && r.photo).length;
  return { nick, rec: { title: TITLE, start: info.start, end: info.end, cells: done.size, lines: LINES.filter((l) => l.every((i) => done.has(i))).length, photos, at: now } };
});
console.log(`이벤트 ${info.start} ~ ${info.end}, 참가 ${snaps.length}명`);
for (const s of snaps) console.log(`  ${s.nick}: ${s.rec.cells}칸 · ${s.rec.lines}줄 · 사진 ${s.rec.photos}장`);

// 사진 파일: 서버에 남은 개수 (지우기 전에 로컬 event 폴더에 리포트가 있는지도 확인)
const photoKeys = await redis.keys("r2u:bingo:photo:*");
const local = (() => { try { return readdirSync("event").length; } catch { return 0; } })();
console.log(`서버 사진 파일 ${photoKeys.length}개 (원본+작은 사진), 로컬 event 폴더 항목 ${local}개`);

if (!APPLY) { console.log("미리보기만 했어요. 실제로 하려면 APPLY=1 로 다시 실행하세요."); process.exit(0); }
if (local === 0) { console.error("로컬 event 폴더가 비어 있어서 사진을 지우지 않아요."); process.exit(1); }

for (const s of snaps) await redis.hset(K.eventRec(s.nick), { [EVENT_ID]: JSON.stringify(s.rec) });
console.log(`이벤트 기록 ${snaps.length}명 저장`);
for (let i = 0; i < photoKeys.length; i += 100) await redis.del(...photoKeys.slice(i, i + 100));
await redis.del("r2u:bingo:photos"); // 인증 칸 → 사진 경로 연결
console.log(`사진 ${photoKeys.length}개 삭제, 인증-사진 연결 삭제`);
console.log("남은 사진 파일:", (await redis.keys("r2u:bingo:photo:*")).length);
process.exit(0);
