// 저장소 이전 도구가 같이 쓰는 함수: 날것의 값(자동 변환 없음)으로 모든 키를 읽는다.
import { Redis } from "@upstash/redis";
import { createPgRequester } from "../../src/lib/kv/pg-requester.ts";

export function loadEnv() {
  try { process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname); } catch { /* 없으면 현재 환경변수만 */ }
}

/** 원본(Upstash): 명령 하나를 날것 그대로 실행하는 함수 `cmd(["hgetall", key])` */
export function sourceRaw() {
  const redis = sourceRedis();
  return { cmd: (c) => redis.exec(c), close: async () => {} };
}

/** 원본(Upstash): 값을 있는 그대로 읽는다 */
export function sourceRedis() {
  const url = process.env.SOURCE_KV_REST_API_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.SOURCE_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("원본 접속 정보(KV_REST_API_URL / KV_REST_API_TOKEN)가 없어요.");
  return new Redis({ url, token, automaticDeserialization: false });
}

/** 대상(Postgres): 같은 Redis 인터페이스로 읽는다 */
export function targetRedis(url) {
  const u = url ?? process.env.DATABASE_URL;
  if (!u) throw new Error("대상 접속 주소(DATABASE_URL)가 없어요.");
  const rq = createPgRequester(u, { max: 4 });
  return { redis: new Redis(rq), close: () => rq.close(), pool: rq.pool };
}

/** 대상(Postgres): 요청기에 바로 명령을 보내 날것으로 읽는다 (어댑터 명령 해석 경로는 그대로 쓴다) */
export function targetRaw(url) {
  const t = targetRedis(url);
  return { cmd: async (c) => { const r = await new (class { request(x) { return t.redis.client.request(x); } })().request({ body: c }); if (r.error) throw new Error(r.error); return r.result; }, close: t.close, pool: t.pool };
}

export async function listKeys(raw) {
  let cur = "0"; const keys = [];
  do { const [n, ks] = await raw.cmd(["scan", cur, "count", "500"]); cur = String(n); keys.push(...ks.map(String)); } while (cur !== "0");
  return [...new Set(keys)].sort();
}

/** 한 키의 종류·남은 수명·내용을 날것 그대로 읽는다 (hgetall·zrange 는 평평한 배열로 온다) */
export async function dumpKey(raw, key) {
  const type = await raw.cmd(["type", key]);
  const pttl = Number(await raw.cmd(["pttl", key]));
  let data = null;
  if (type === "string") data = await raw.cmd(["get", key]);
  else if (type === "hash") { const f = (await raw.cmd(["hgetall", key])) ?? []; data = []; for (let i = 0; i < f.length; i += 2) data.push([String(f[i]), String(f[i + 1])]); }
  else if (type === "zset") { const z = (await raw.cmd(["zrange", key, "0", "-1", "withscores"])) ?? []; data = []; for (let i = 0; i < z.length; i += 2) data.push([String(z[i]), String(z[i + 1])]); }
  else if (type === "list") data = ((await raw.cmd(["lrange", key, "0", "-1"])) ?? []).map(String);
  else return null; // 사라진 키
  return { key, type, expiresAtMs: pttl > 0 ? Date.now() + pttl : null, data };
}

export async function dumpAll(raw, { concurrency = 8, onProgress } = {}) {
  const keys = await listKeys(raw);
  const out = new Array(keys.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < keys.length) {
      const i = next++;
      out[i] = await dumpKey(raw, keys[i]);
      onProgress?.(++done, keys.length);
    }
  }));
  return out.filter(Boolean);
}

/** 두 덤프 항목이 같은가 (해시·정렬집합은 순서 무시, 리스트는 순서 유지, 수명은 2초 오차) */
export function sameEntry(a, b) {
  if (!a || !b) return "한쪽에 없음";
  if (a.type !== b.type) return `종류 다름 ${a.type} / ${b.type}`;
  if ((a.expiresAtMs == null) !== (b.expiresAtMs == null)) return "만료 설정 다름";
  if (a.expiresAtMs != null && Math.abs(a.expiresAtMs - b.expiresAtMs) > 2500) return "만료 시각 다름";
  const norm = (x) => (a.type === "hash" || a.type === "zset" ? JSON.stringify([...x.data].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0))) : JSON.stringify(x.data));
  return norm(a) === norm(b) ? null : "내용 다름";
}
