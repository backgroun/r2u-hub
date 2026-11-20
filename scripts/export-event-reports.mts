// 일회성: 빙고 이벤트 참가자 전원의 ‘내 리포트’ 이미지를 event/<닉네임>/ 폴더에 PNG 로 저장한다. (읽기 전용: 운영 데이터는 바꾸지 않는다)
// 앱의 이미지(public/bingo/report.js drawPage)와 같은 레이아웃: 1080px 폭, 3열, 한 장에 12칸.
// 실행: npx tsx --conditions=react-server --env-file=.env.local scripts/export-event-reports.mts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getInfo, getMissions, getPhoto, reviewRecords } from "@/lib/bingo-store";

const OUT = path.resolve("event");
const W = 1080, P = 48, GAP = 20, COLS = 3, CW = Math.floor((W - P * 2 - GAP * (COLS - 1)) / COLS), TITLE = 52, PH = CW, PER_PAGE = 12;
const FONT = "Apple SD Gothic Neo, Noto Sans KR, sans-serif";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const long = (d: string) => `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");
/** 글자 폭을 대략 어림해서 칸 너비를 넘으면 …으로 줄인다 (한글·이모지 ≈ 1em, 영문·숫자 ≈ 0.55em) */
const fit = (text: string, px: number, maxW: number) => {
  const w = (t: string) => [...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? px : px * 0.58), 0);
  if (w(text) <= maxW) return text;
  let t = [...text];
  while (t.length > 1 && w(t.join("") + "…") > maxW) t.pop();
  return t.join("") + "…";
};

const info = await getInfo();
const missions = await getMissions();
const records = await reviewRecords(); // 최근 날짜 먼저
const byNick = new Map<string, typeof records>();
for (const r of records) byNick.set(r.n, [...(byNick.get(r.n) ?? []), r]);

const photoCache = new Map<string, Buffer | null>();
async function photoBuf(p: string): Promise<Buffer | null> {
  if (!p) return null;
  if (photoCache.has(p)) return photoCache.get(p)!;
  const img = await getPhoto(p);
  const buf = img?.data ? Buffer.from(img.data, "base64") : null;
  photoCache.set(p, buf);
  return buf;
}

const LINES = (() => {
  const l: number[][] = [];
  for (let r = 0; r < 5; r++) l.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) l.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  l.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return l;
})();

let totalFiles = 0;
for (const [nick, recs] of [...byNick.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const done = new Set(recs.map((r) => r.no - 1));
  const lines = LINES.filter((l) => l.every((i) => done.has(i))).length;
  const photos = recs.filter((r) => r.photo).length;
  const pages = Math.max(1, Math.ceil(recs.length / PER_PAGE));
  const dir = path.join(OUT, safe(nick));
  await mkdir(dir, { recursive: true });

  for (let p = 0; p < pages; p++) {
    const items = recs.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
    const head = p === 0 ? 250 : 130;
    const rows = Math.ceil(items.length / COLS);
    const H = head + rows * (TITLE + PH + GAP) + 90;
    const svg: string[] = [
      `<rect width="${W}" height="${H}" fill="#f4f7f3"/>`,
      `<rect width="${W}" height="${p === 0 ? 190 : 100}" fill="#2f6b3a"/>`,
    ];
    const t = (x: number, y: number, size: number, fill: string, text: string, opt = "") =>
      svg.push(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" dominant-baseline="central" ${opt}>${esc(text)}</text>`);
    if (p === 0) {
      t(P, 56, 34, "#fff", "R2U 5×5 미션 빙고", 'font-weight="bold"');
      t(P, 120, 60, "#fff", `${nick} 님의 리포트`, 'font-weight="bold"');
      t(P, 218, 28, "#2f6b3a", `${long(info.start)} ~ ${long(info.end)}`);
      t(W - P, 218, 28, "#5b6b5e", `인증 ${recs.length}칸 · 빙고 ${lines}줄 · 사진 ${photos}장`, 'text-anchor="end"');
    } else {
      t(P, 50, 38, "#fff", `${nick} 님의 리포트`, 'font-weight="bold"');
    }
    if (pages > 1) t(W - P, p === 0 ? 56 : 50, 26, "#e7f3e9", `${p + 1} / ${pages}`, 'text-anchor="end"');

    const composites: sharp.OverlayOptions[] = [];
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      const x = Math.round(P + (i % COLS) * (CW + GAP)), y = head + Math.floor(i / COLS) * (TITLE + PH + GAP);
      const m = missions[r.no - 1] ?? { e: "", t: `${r.no}번 미션` };
      svg.push(`<rect x="${x}" y="${y}" width="${CW}" height="${TITLE + PH}" fill="#fff"/>`);
      t(x + 10, y + TITLE / 2, 19, "#7a8a7d", r.d.slice(5).replace("-", "/"));
      t(x + 74, y + TITLE / 2, 21, "#1d2b20", fit(`${m.e} ${m.t}`, 21, CW - 84), 'font-weight="bold"');
      svg.push(`<rect x="${x}" y="${y + TITLE}" width="${CW}" height="${PH}" fill="#eef2ec"/>`);
      const buf = await photoBuf(r.photo);
      if (buf) {
        // 비율을 유지한 채 칸 안에 가운데 맞춤
        const fitted = await sharp(buf).rotate().resize(Math.round(CW), Math.round(PH), { fit: "inside" }).toBuffer({ resolveWithObject: true });
        composites.push({ input: fitted.data, left: x + Math.round((CW - fitted.info.width) / 2), top: y + TITLE + Math.round((PH - fitted.info.height) / 2) });
      } else {
        t(x + CW / 2, y + TITLE + PH / 2, 22, "#9aa79d", "사진 없음", 'text-anchor="middle"');
      }
    }
    t(W / 2, H - 40, 22, "#9aa79d", "R2U 러닝크루 · 5×5 미션 빙고", 'text-anchor="middle"');

    const base = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join("")}</svg>`)).png().toBuffer();
    // 사진은 글자 위에 깔리면 안 되므로 SVG(배경·글자) 위가 아니라, 배경 SVG 위에 얹는다 (사진 칸에는 글자가 없다)
    const out = await sharp(base).composite(composites).png().toBuffer();
    await writeFile(path.join(dir, `R2U-리포트-${safe(nick)}-${p + 1}.png`), out);
    totalFiles++;
  }
  console.log(`${nick}: 인증 ${recs.length}칸, 사진 ${photos}장 → ${pages}장`);
}
console.log(`완료: 참가자 ${byNick.size}명, 이미지 ${totalFiles}장 → ${OUT}`);
process.exit(0);
