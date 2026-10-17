// 백업 JSON 을 Postgres 에 넣는다. 기존 내용은 --truncate 를 줘야만 지운다.
// 실행: DATABASE_URL=... node scripts/kv/import.mjs backups/파일.json --truncate
import { readFileSync } from "node:fs";
import { loadEnv, targetRedis } from "./lib.mjs";
import { KV_TABLE, SCHEMA_SQL } from "../../src/lib/kv/pg-requester.ts";

loadEnv();
const file = process.argv[2];
if (!file) { console.error("백업 파일 경로를 알려 주세요."); process.exit(1); }
const truncate = process.argv.includes("--truncate");
const { keys, meta } = JSON.parse(readFileSync(file, "utf8"));
const { pool, close } = targetRedis();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(SCHEMA_SQL);
  const existing = Number((await client.query(`SELECT count(*)::int AS n FROM ${KV_TABLE}`)).rows[0].n);
  if (existing && !truncate) throw new Error(`대상에 이미 ${existing}줄이 있어요. 덮어쓰려면 --truncate 를 붙여 주세요.`);
  if (truncate) await client.query(`TRUNCATE ${KV_TABLE}`);
  const TYPE = { string: "s", hash: "h", zset: "z", list: "l" };
  let rows = [];
  const flush = async () => {
    if (!rows.length) return;
    const params = []; const vals = rows.map((r, i) => { params.push(...r); const b = i * 6; return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::double precision,$${b + 6}::timestamptz)`; });
    await client.query(`INSERT INTO ${KV_TABLE}(key,type,field,value,score,expires_at) VALUES ${vals.join(",")}`, params);
    rows = [];
  };
  let n = 0;
  for (const k of keys) {
    const t = TYPE[k.type]; const exp = k.expiresAtMs ? new Date(k.expiresAtMs).toISOString() : null;
    if (k.type === "string") rows.push([k.key, t, "", k.data, null, exp]);
    else if (k.type === "hash") for (const [f, v] of k.data) rows.push([k.key, t, f, v, null, exp]);
    else if (k.type === "zset") for (const [m, s] of k.data) rows.push([k.key, t, m, "", Number(s), exp]);
    else if (k.type === "list") k.data.forEach((v, i) => rows.push([k.key, t, String(i), v, i, exp]));
    n++;
    if (rows.length >= 500) await flush();
  }
  await flush();
  await client.query("COMMIT");
  console.log(`가져오기 완료: 키 ${n}개 (백업 메타 ${meta?.count}개)`);
} catch (e) { await client.query("ROLLBACK"); console.error("실패(되돌림):", e.message); process.exitCode = 1; }
finally { client.release(); await close(); }
