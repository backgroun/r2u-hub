// 원본(Upstash) 전체를 날것 그대로 JSON 파일로 내려받는다. (읽기만 한다)
// 실행: node scripts/kv/backup.mjs [출력파일]   → 기본 backups/r2u-날짜-시각.json
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv, sourceRaw, dumpAll } from "./lib.mjs";

loadEnv();
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const out = process.argv[2] ?? `backups/r2u-${stamp}.json`;
const raw = sourceRaw();
const t0 = Date.now();
const keys = await dumpAll(raw, { onProgress: (d, n) => { if (d % 50 === 0 || d === n) process.stdout.write(`\r읽는 중 ${d}/${n}`); } });
console.log("");
const byType = {};
for (const k of keys) byType[k.type] = (byType[k.type] ?? 0) + 1;
mkdirSync(out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".", { recursive: true });
writeFileSync(out, JSON.stringify({ meta: { takenAt: new Date().toISOString(), source: "upstash", count: keys.length, byType }, keys }));
console.log(`백업 완료: ${out} · 키 ${keys.length}개 ${JSON.stringify(byType)} · ${Date.now() - t0}ms`);
