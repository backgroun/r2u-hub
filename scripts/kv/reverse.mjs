// 롤백용 역복사: Postgres(Supabase)의 현재 내용을 Upstash 에 그대로 되돌려 쓴다.
// Postgres 에 없는 Upstash 키는 지우고, 있는 키는 지운 뒤 다시 쓴다(수명 포함).
// 실행: node scripts/kv/reverse.mjs            → 무엇을 바꿀지 보여주기만 함 (아무것도 쓰지 않음)
//       node scripts/kv/reverse.mjs --yes      → 실제로 쓰기
import { loadEnv, sourceRaw, sourceRedis, targetRaw, dumpAll, sameEntry } from "./lib.mjs";

loadEnv();
const apply = process.argv.includes("--yes");
const tgt = targetRaw();
const src = sourceRaw();
const [pg, up] = await Promise.all([dumpAll(tgt), dumpAll(src)]);
const upMap = new Map(up.map((x) => [x.key, x]));
const pgKeys = new Set(pg.map((x) => x.key));
const toWrite = pg.filter((x) => sameEntry(upMap.get(x.key), x) !== null);
const toDelete = up.filter((x) => !pgKeys.has(x.key));
console.log(`Postgres ${pg.length}개 / Upstash ${up.length}개 → 쓸 키 ${toWrite.length}개, 지울 키 ${toDelete.length}개`);
for (const x of toWrite.slice(0, 15)) console.log(`  쓰기  ${x.key.replace(/[가-힣]/g, "·")} (${x.type})`);
for (const x of toDelete.slice(0, 15)) console.log(`  삭제  ${x.key.replace(/[가-힣]/g, "·")}`);
if (!apply) { console.log("\n(확인만 했어요. 실제로 되돌리려면 --yes 를 붙여 다시 실행하세요.)"); await tgt.close(); process.exit(0); }

const redis = sourceRedis();
const p = redis.pipeline();
for (const x of toDelete) p.del(x.key);
for (const x of toWrite) {
  p.del(x.key);
  if (x.type === "string") p.set(x.key, x.data);
  else if (x.type === "hash") p.hset(x.key, Object.fromEntries(x.data));
  else if (x.type === "zset") { const [f, ...r] = x.data; p.zadd(x.key, { score: Number(f[1]), member: f[0] }, ...r.map(([m, s]) => ({ score: Number(s), member: m }))); }
  else if (x.type === "list") p.rpush(x.key, ...x.data);
  if (x.expiresAtMs) p.pexpireat(x.key, x.expiresAtMs);
}
await p.exec();
const after = await dumpAll(sourceRaw());
const am = new Map(after.map((x) => [x.key, x]));
const bad = pg.filter((x) => sameEntry(am.get(x.key), x) !== null).length + after.filter((x) => !pgKeys.has(x.key)).length;
console.log(bad ? `✖ 되돌린 뒤에도 다른 키 ${bad}개` : "✔ 역복사 완료, Upstash 와 Postgres 가 같아요");
process.exitCode = bad ? 1 : 0;
await tgt.close();
