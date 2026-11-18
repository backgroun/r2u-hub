// 일회성: 빙고 인증 사진 전체를 정사각 타일로 한 장의 모자이크 이미지(event/모자이크.png)로 만든다. (읽기 전용)
// 실행: DATA_BACKEND=postgres npx tsx --conditions=react-server --env-file=.env.local scripts/export-event-mosaic.mts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { allPhotoList, getPhoto } from "@/lib/bingo-store";

const TILE = 240, COLS = 24;
const list = (await allPhotoList()).reverse(); // 오래된 인증부터
const rows = Math.ceil(list.length / COLS);
const tiles: sharp.OverlayOptions[] = [];
let ok = 0;
for (let i = 0; i < list.length; i++) {
  const img = await getPhoto(list[i].photo);
  if (!img?.data) continue;
  const buf = await sharp(Buffer.from(img.data, "base64")).rotate().resize(TILE, TILE, { fit: "cover", position: "attention" }).toBuffer();
  tiles.push({ input: buf, left: (i % COLS) * TILE, top: Math.floor(i / COLS) * TILE });
  ok++;
}
const out = await sharp({ create: { width: COLS * TILE, height: rows * TILE, channels: 3, background: "#f4f7f3" } }).composite(tiles).png({ compressionLevel: 9 }).toBuffer();
await mkdir("event", { recursive: true });
const file = path.resolve("event", "모자이크.png");
await writeFile(file, out);
console.log(`사진 ${ok}/${list.length}장 → ${COLS}×${rows}칸, ${COLS * TILE}×${rows * TILE}px → ${file}`);
process.exit(0);
