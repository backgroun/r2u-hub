// 원본(Upstash)과 대상(Postgres)을 같은 방식으로 읽어 전부 같은지 비교한다. 다르면 종료 코드 1.
// 실행: DATABASE_URL=... node scripts/kv/verify.mjs [--sample]
import { loadEnv, sourceRaw, targetRaw, dumpAll, sameEntry } from "./lib.mjs";

loadEnv();
const src = sourceRaw();
const tgt = targetRaw();
const [a, b] = await Promise.all([dumpAll(src), dumpAll(tgt)]);
const ma = new Map(a.map((x) => [x.key, x])), mb = new Map(b.map((x) => [x.key, x]));
const bad = [];
for (const k of new Set([...ma.keys(), ...mb.keys()])) {
  const why = sameEntry(ma.get(k), mb.get(k));
  if (why) bad.push([k, why]);
}
const count = (m, t) => [...m.values()].filter((x) => x.type === t).length;
console.log(`원본 ${ma.size}개 / 대상 ${mb.size}개  (문자열 ${count(ma, "string")}/${count(mb, "string")}, 해시 ${count(ma, "hash")}/${count(mb, "hash")}, 정렬집합 ${count(ma, "zset")}/${count(mb, "zset")}, 리스트 ${count(ma, "list")}/${count(mb, "list")})`);
if (bad.length) {
  console.log(`✖ 다른 키 ${bad.length}개`);
  for (const [k, why] of bad.slice(0, 20)) console.log(`  - ${k.replace(/[가-힣]/g, "·")}: ${why}`);
  process.exitCode = 1;
} else console.log("✔ 모든 키가 같아요");
await tgt.close();
