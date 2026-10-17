// Postgres 어댑터 점검: 실제 Redis 가 돌려줄 결과와 같은지 명령별로 확인한다.
// 실행: TEST_DATABASE_URL=postgres://postgres@localhost:5544/r2utest node --test tests/pg/adapter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { Redis } from "@upstash/redis";
import { createPgRequester, KV_TABLE } from "../../src/lib/kv/pg-requester.ts";

const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5544/r2utest";
const req = createPgRequester(url, { max: 4 });
const redis = new Redis(req);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test.before(async () => { await redis.get("warm"); });
test.beforeEach(async () => { await req.pool.query(`TRUNCATE ${KV_TABLE}`); });
test.after(async () => { await req.close(); });

test("문자열: set/get, 객체·숫자 왕복, 덮어쓰기, 없는 키", async () => {
  assert.equal(await redis.set("a", "hello"), "OK");
  assert.equal(await redis.get("a"), "hello");
  await redis.set("o", { x: 1, y: ["가", "나"] });
  assert.deepEqual(await redis.get("o"), { x: 1, y: ["가", "나"] });
  await redis.set("n", 5);
  assert.equal(await redis.get("n"), 5);
  await redis.set("a", "again");
  assert.equal(await redis.get("a"), "again");
  assert.equal(await redis.get("none"), null);
});

test("특수문자: 따옴표·역슬래시·퍼센트·밑줄·한글 키와 값", async () => {
  const tricky = ["it's", "a\\b", "100%", "x_y", "한글 값", "line1\nline2", "';DROP TABLE r2u_kv;--"];
  for (const v of tricky) {
    await redis.set(`k:${v}`, v);
    assert.equal(await redis.get(`k:${v}`), v, `값 ${v}`);
  }
  await redis.hset("h:한글", { "닉'네임": "값\\1", "50%": "x_y" });
  assert.deepEqual(await redis.hgetall("h:한글"), { "닉'네임": "값\\1", "50%": "x_y" });
  await assert.rejects(() => redis.set("nul", "a\u0000b"));
});

test("set NX / EX 와 만료", async () => {
  assert.equal(await redis.set("lock", "1", { nx: true, ex: 1 }), "OK");
  assert.equal(await redis.set("lock", "2", { nx: true, ex: 1 }), null);
  assert.equal(await redis.get("lock"), 1); // 숫자처럼 보이는 문자열은 클라이언트가 숫자로 되돌림(Upstash 와 동일)
  await sleep(1300);
  assert.equal(await redis.get("lock"), null);
  assert.equal(await redis.set("lock", "3", { nx: true, ex: 5 }), "OK");
  assert.equal(await redis.get("lock"), 3);
  const ttl = await redis.pttl("lock");
  assert.ok(ttl > 3000 && ttl <= 5000, `pttl ${ttl}`);
});

test("incr / expire / expireat / ttl 없음", async () => {
  assert.equal(await redis.incr("c"), 1);
  assert.equal(await redis.incr("c"), 2);
  assert.equal(await redis.expire("c", 1), 1);
  assert.equal(await redis.expire("nothing", 1), 0);
  await sleep(1300);
  assert.equal(await redis.get("c"), null);
  assert.equal(await redis.incr("c"), 1);
  await redis.set("p", "x");
  assert.equal(await redis.expireat("p", Math.floor(Date.now() / 1000) - 10), 1);
  assert.equal(await redis.get("p"), null);
  assert.equal(await redis.pttl("none"), -2);
  await redis.set("forever", "x");
  assert.equal(await redis.pttl("forever"), -1);
});

test("del / exists / mget / keys", async () => {
  await redis.set("m1", "a"); await redis.set("m2", { z: 1 }); await redis.hset("m3", { f: "v" });
  assert.equal(await redis.exists("m1", "m2", "m3", "nope"), 3);
  assert.deepEqual(await redis.mget("m1", "nope", "m2"), ["a", null, { z: 1 }]);
  assert.deepEqual((await redis.keys("m*")).sort(), ["m1", "m2", "m3"]);
  assert.deepEqual(await redis.keys("m?"), ["m1", "m2", "m3"]);
  assert.deepEqual(await redis.keys("r2u:month:*"), []);
  await redis.set("r2u:month:2026-10", "1"); await redis.set("r2u:monthly", "2");
  assert.deepEqual(await redis.keys("r2u:month:*"), ["r2u:month:2026-10"]);
  assert.equal(await redis.del("m1", "m3", "nope"), 2);
  assert.equal(await redis.exists("m1"), 0);
});

test("해시: hset 반환값, hget, hgetall(순서·역직렬화·빈 값), hkeys, hexists, hdel, hmget, hsetnx", async () => {
  assert.equal(await redis.hgetall("h"), null);
  assert.equal(await redis.hset("h", { b: "yes", a: JSON.stringify({ k: 1 }), c: 5 }), 3);
  assert.equal(await redis.hset("h", { a: "changed", d: "new" }), 1);
  const all = await redis.hgetall("h");
  assert.deepEqual(Object.keys(all), ["b", "a", "c", "d"]);
  assert.deepEqual(all, { b: "yes", a: "changed", c: 5, d: "new" });
  assert.deepEqual(await redis.hkeys("h"), ["b", "a", "c", "d"]);
  assert.equal(await redis.hget("h", "c"), 5);
  assert.equal(await redis.hget("h", "zzz"), null);
  assert.equal(await redis.hexists("h", "b"), 1);
  assert.equal(await redis.hexists("h", "zzz"), 0);
  assert.deepEqual(await redis.hmget("h", "d", "zzz", "b"), { d: "new", zzz: null, b: "yes" });
  assert.equal(await redis.hsetnx("h", "b", "no"), 0);
  assert.equal(await redis.hsetnx("h", "e", "ok"), 1);
  assert.equal(await redis.hdel("h", "a", "e", "none"), 2);
  assert.deepEqual(await redis.hkeys("h"), ["b", "c", "d"]);
  // 객체 값 저장(Upstash 가 JSON 으로 바꿔 저장하고 읽을 때 복원)
  await redis.hset("obj", { r1: { id: "r1", n: 1 }, r2: JSON.stringify({ id: "r2" }) });
  assert.deepEqual(await redis.hgetall("obj"), { r1: { id: "r1", n: 1 }, r2: { id: "r2" } });
});

test("hincrbyfloat / hincrby", async () => {
  assert.equal(await redis.hincrbyfloat("f", "x", 1.5), 1.5);
  assert.equal(await redis.hincrbyfloat("f", "x", 2.25), 3.75);
  assert.equal(await redis.hincrbyfloat("f", "x", 0.25), 4);
  assert.equal(await redis.hincrby("f", "n", 2), 2);
  assert.equal(await redis.hincrby("f", "n", -5), -3);
});

test("정렬 집합: zadd, zrange(순위·역순·점수 범위·withScores), zrem", async () => {
  assert.equal(await redis.zadd("z", { score: 3, member: "c" }, { score: 1, member: "a" }, { score: 2, member: "b" }), 3);
  assert.equal(await redis.zadd("z", { score: 5, member: "a" }), 0);
  assert.deepEqual(await redis.zrange("z", 0, -1), ["b", "c", "a"]);
  assert.deepEqual(await redis.zrange("z", 0, 1), ["b", "c"]);
  assert.deepEqual(await redis.zrange("z", 0, 1, { rev: true }), ["a", "c"]);
  assert.deepEqual(await redis.zrange("z", 2, "+inf", { byScore: true }), ["b", "c", "a"]);
  assert.deepEqual(await redis.zrange("z", 0, 3, { byScore: true }), ["b", "c"]);
  assert.deepEqual(await redis.zrange("z", 0, -1, { withScores: true }), ["b", 2, "c", 3, "a", 5]);
  assert.equal(await redis.zrem("z", "b", "nope"), 1);
  assert.deepEqual(await redis.zrange("z", 0, -1), ["c", "a"]);
  assert.deepEqual(await redis.zrange("empty", 0, -1), []);
});

test("리스트: lpush, lrange, ltrim", async () => {
  assert.equal(await redis.lpush("l", "a"), 1);
  assert.equal(await redis.lpush("l", "b", "c"), 3);
  assert.deepEqual(await redis.lrange("l", 0, -1), ["c", "b", "a"]);
  assert.deepEqual(await redis.lrange("l", 0, 0), ["c"]);
  await redis.ltrim("l", 0, 1);
  assert.deepEqual(await redis.lrange("l", 0, -1), ["c", "b"]);
  await redis.lpush("l", { id: 1 });
  assert.deepEqual(await redis.lrange("l", 0, 0), [{ id: 1 }]);
  for (let i = 0; i < 6; i++) await redis.lpush("log", `e${i}`);
  await redis.ltrim("log", 0, 3);
  assert.deepEqual(await redis.lrange("log", 0, -1), ["e5", "e4", "e3", "e2"]);
  assert.deepEqual(await redis.lrange("none", 0, 0), []);
});

test("파이프라인: 순서·결과 변환, 큰 묶음이 빠르다, 멀티 실행은 한 덩어리", async () => {
  const p = redis.pipeline();
  p.hset("p:h", { a: 1 }); p.get("p:nothing"); p.hgetall("p:h"); p.incr("p:n"); p.zadd("p:z", { score: 1, member: "m" });
  const out = await p.exec();
  assert.deepEqual(out, [1, null, { a: 1 }, 1, 1]);
  const big = redis.pipeline();
  for (let i = 0; i < 400; i++) big.hset(`big:${i}`, { f: `v${i}` });
  for (let i = 0; i < 400; i++) big.hgetall(`big:${i}`);
  const t0 = Date.now();
  const r = await big.exec();
  assert.equal(r.length, 800);
  assert.deepEqual(r[400 + 7], { f: "v7" });
  assert.ok(Date.now() - t0 < 3000, `큰 묶음 ${Date.now() - t0}ms`);
  // multi: 중간에 오류가 나면 전부 되돌려진다
  await redis.set("txt", "abc");
  const tx = redis.multi();
  tx.set("tx:before", "1"); tx.incr("txt");
  await assert.rejects(() => tx.exec());
  assert.equal(await redis.get("tx:before"), null);
  const ok = redis.multi(); ok.set("tx:a", "1"); ok.set("tx:b", "2");
  assert.deepEqual(await ok.exec(), ["OK", "OK"]);
});

test("동시에 incr 50번 → 정확히 50", async () => {
  await Promise.all(Array.from({ length: 50 }, () => redis.incr("race")));
  assert.equal(await redis.get("race"), 50);
});

test("type / scan / dbsize (이전 도구용)", async () => {
  await redis.set("s", "x"); await redis.hset("h", { a: "1" }); await redis.zadd("z", { score: 1, member: "m" }); await redis.lpush("l", "v");
  assert.equal(await redis.type("s"), "string"); assert.equal(await redis.type("h"), "hash");
  assert.equal(await redis.type("z"), "zset"); assert.equal(await redis.type("l"), "list"); assert.equal(await redis.type("none"), "none");
  assert.equal(await redis.dbsize(), 4);
  const seen = []; let cur = "0";
  do { const [n, ks] = await redis.scan(cur, { count: 2 }); cur = String(n); seen.push(...ks); } while (cur !== "0");
  assert.deepEqual(seen.sort(), ["h", "l", "s", "z"]);
});

test("다른 종류의 키로 덮어쓰기(레디스처럼 set 은 종류와 상관없이 덮어씀)", async () => {
  await redis.hset("w", { a: "1", b: "2" });
  await redis.set("w", "now string");
  assert.equal(await redis.get("w"), "now string");
  assert.equal(await redis.hget("w", "a"), null);
});

test("같은 순간의 단일 명령은 한 번에 묶여 보내진다 / 한 명령이 실패해도 나머지는 정상", async () => {
  await redis.set("bt:str", "x");
  let statements = 0;
  const orig = req.pool.query.bind(req.pool);
  req.pool.query = (text, ...rest) => { statements++; return orig(text, ...rest); };
  const [a, b, c] = await Promise.all([redis.get("bt:str"), redis.incr("bt:n"), redis.hset("bt:h", { f: "v" })]);
  assert.deepEqual([a, b, c], ["x", 1, 1]);
  assert.equal(statements, 1, `왕복 ${statements}번`);
  // incr 는 문자열("x")에는 오류 → 같이 묶여도 get 은 정상 결과
  const res = await Promise.allSettled([redis.get("bt:str"), redis.incr("bt:str"), redis.get("bt:n")]);
  assert.equal(res[0].status, "fulfilled"); assert.equal(res[0].value, "x");
  assert.equal(res[1].status, "rejected");
  assert.equal(res[2].status, "fulfilled"); assert.equal(res[2].value, 1);
  req.pool.query = orig;
});
