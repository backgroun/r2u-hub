// 로컬 "대회 당일 테스트 모드": 운영 DB 대신 메모리 가짜 Redis(Upstash REST 호환)를 띄우고,
// 오늘 열리는 대회·내일 대회(단사 사진+장소)·크루원을 채워 넣은 뒤 next dev 를 실행한다.
// 실행: npm run test-day  →  http://localhost:3100  (운영진 / 크루원 비밀번호는 아래 PW)
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";

const PORT = 4567, WEB = 3100, PW = "test1234", TOKEN = "test-token";
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

/* ---------- 메모리 Redis ---------- */
const db = new Map(); // key -> { t: "s"|"h"|"z"|"l", v, exp? }
const alive = (k) => { const e = db.get(k); if (e?.exp && e.exp <= Date.now()) { db.delete(k); return null; } return e ?? null; };
const get = (k, t) => { const e = alive(k); return e && e.t === t ? e.v : null; };
const mk = (k, t, init) => { let e = alive(k); if (!e) { e = { t, v: init() }; db.set(k, e); } return e.v; };
const str = (v) => (typeof v === "string" ? v : String(v));
const glob = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");

function run([cmd, ...a]) {
  switch (cmd.toLowerCase()) {
    case "get": return get(a[0], "s") ?? null;
    case "set": {
      const nx = a.slice(2).some((x) => str(x).toUpperCase() === "NX");
      if (nx && alive(a[0])) return null;
      const i = a.findIndex((x, j) => j >= 2 && str(x).toUpperCase() === "EX");
      db.set(a[0], { t: "s", v: a[1], exp: i > 0 ? Date.now() + Number(a[i + 1]) * 1000 : undefined });
      return "OK";
    }
    case "mget": return a.map((k) => get(k, "s") ?? null);
    case "del": return a.filter((k) => db.delete(k)).length;
    case "exists": return a.filter((k) => alive(k)).length;
    case "incr": { const n = Number(get(a[0], "s") ?? 0) + 1; const e = alive(a[0]); db.set(a[0], { t: "s", v: String(n), exp: e?.exp }); return n; }
    case "expire": { const e = alive(a[0]); if (!e) return 0; e.exp = Date.now() + Number(a[1]) * 1000; return 1; }
    case "expireat": { const e = alive(a[0]); if (!e) return 0; e.exp = Number(a[1]) * 1000; return 1; }
    case "keys": { const r = glob(a[0]); return [...db.keys()].filter((k) => alive(k) && r.test(k)); }
    case "hset": { const h = mk(a[0], "h", () => ({})); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!(a[i] in h)) n++; h[a[i]] = a[i + 1]; } return n; }
    case "hsetnx": { const h = mk(a[0], "h", () => ({})); if (a[1] in h) return 0; h[a[1]] = a[2]; return 1; }
    case "hget": return get(a[0], "h")?.[a[1]] ?? null;
    case "hmget": return a.slice(1).map((f) => get(a[0], "h")?.[f] ?? null);
    case "hdel": { const h = get(a[0], "h"); if (!h) return 0; let n = 0; for (const f of a.slice(1)) if (delete h[f]) n++; if (!Object.keys(h).length) db.delete(a[0]); return n; }
    case "hexists": return get(a[0], "h") && a[1] in get(a[0], "h") ? 1 : 0;
    case "hkeys": return Object.keys(get(a[0], "h") ?? {});
    case "hgetall": { const h = get(a[0], "h") ?? {}; return Object.entries(h).flatMap(([k, v]) => [k, v]); }
    case "hincrbyfloat": { const h = mk(a[0], "h", () => ({})); h[a[1]] = String(Number(h[a[1]] ?? 0) + Number(a[2])); return h[a[1]]; }
    case "zadd": { const z = mk(a[0], "z", () => new Map()); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!z.has(a[i + 1])) n++; z.set(a[i + 1], Number(a[i])); } return n; }
    case "zrem": { const z = get(a[0], "z"); return z ? a.slice(1).filter((m) => z.delete(m)).length : 0; }
    case "zrange": {
      const z = [...(get(a[0], "z") ?? new Map())].sort((x, y) => x[1] - y[1]);
      const opts = a.slice(3).map((x) => str(x).toUpperCase());
      let list = opts.includes("BYSCORE") ? z.filter(([, s]) => s >= (a[1] === "-inf" ? -Infinity : Number(a[1])) && s <= (str(a[2]).includes("inf") ? Infinity : Number(a[2]))) : z;
      if (opts.includes("REV")) list = [...list].reverse();
      if (!opts.includes("BYSCORE")) { const n = list.length; const s = Number(a[1]) < 0 ? n + Number(a[1]) : Number(a[1]); const e = Number(a[2]) < 0 ? n + Number(a[2]) : Number(a[2]); list = list.slice(s, e + 1); }
      return list.map(([m]) => m);
    }
    case "lpush": { const l = mk(a[0], "l", () => []); l.unshift(...a.slice(1)); return l.length; }
    case "ltrim": { const l = get(a[0], "l"); if (l) l.splice(Number(a[2]) + 1); return "OK"; }
    case "lrange": { const l = get(a[0], "l") ?? []; return l.slice(Number(a[1]), Number(a[2]) < 0 ? undefined : Number(a[2]) + 1); }
    default: throw new Error(`mock redis: 지원 안 하는 명령 ${cmd}`);
  }
}
const b64 = (v) => (typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(b64) : v);
const exec = (c, enc) => { try { const r = run(c); return { result: enc ? b64(r) : r }; } catch (e) { return { error: String(e.message) }; } };

const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const enc = req.headers["upstash-encoding"] === "base64";
    const cmds = JSON.parse(body || "[]");
    const out = req.url.startsWith("/pipeline") || req.url.startsWith("/multi-exec") ? cmds.map((c) => exec(c, enc)) : exec(cmds, enc);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out));
  });
});
srv.on("error", (e) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`[test-day] 이미 실행 중이에요 (포트 ${PORT}). http://localhost:${WEB}/login 으로 들어가거나, 끄려면: pkill -f test-day.mjs; pkill -f "next dev -p ${WEB}"`);
  process.exit(1);
});
srv.listen(PORT, () => console.log(`[test-day] 가짜 Redis :${PORT}`));

/* ---------- 시드 ---------- */
const hashPw = (pw) => { const salt = randomBytes(16).toString("base64url"); return `${salt}:${scryptSync(pw, salt, 32).toString("base64url")}`; };
const H = (key, obj) => Object.entries(obj).forEach(([f, v]) => run(["hset", key, f, typeof v === "string" ? v : JSON.stringify(v)]));
const crew = ["달리기왕", "번개", "꾸준이", "바람돌이", "새벽러너", "한강러너"];
H("r2u:members", Object.fromEntries([{ nick: "운영진", role: "admin" }, ...crew.map((nick, i) => ({ nick, name: ["김하나", "이둘", "박셋", "최넷", "정다섯", "한여섯"][i], role: (nick === "번개" || nick === "새벽러너") ? "admin" : "member" }))].map((m) => [m.nick, { ...m, pw: hashPw(PW) }])));
const photo = JSON.stringify({ type: "image/png", data: readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url)).toString("base64") });
const races = [
  { id: "today1", name: "[테스트] 오늘 열리는 대회", date: kst(0), place: "경주 예술의전당", address: "경북 경주시 알천북로 1", note: "풀,하프,10km · gyeongjumarathon.com/home", regUrl: "https://example.com/reg", time: "08:00" },
  { id: "tomorrow1", name: "[테스트] 내일 열리는 대회", date: kst(1), place: "울산 태화강", note: "", time: "08:30" },
];
H("r2u:races", Object.fromEntries(races.map((r) => [r.id, r])));
for (const r of races) { H(`r2u:race:${r.id}:p`, Object.fromEntries(crew.slice(0, 5).map((n, i) => [n, ["5K", "10K", "Half"][i % 3]]))); H(`r2u:race:${r.id}:cheer`, { 한강러너: Date.now() }); }
const at = Date.now();
H("r2u:race:today1:after", {
  photo001: { id: "photo001", kind: "photo", place: "주차:예술의전당 / 실내체육관 앞", time: "07:30", memo: "깃발 앞에 모여요", photo: true, by: "달리기왕", at },
  after001: { id: "after001", kind: "after", place: "마늘보쌈 울산점", address: "울산 북구 명촌8길 19", placeUrl: "https://place.map.kakao.com/123456789", time: "12:30", memo: "", by: "번개", at: at + 1 },
  carpool001: { id: "carpool001", kind: "carpool", place: "삼산 롯데백화점 앞", time: "05:30", memo: "", seats: 3, by: "꾸준이", at: at + 2 },
});
H("r2u:race:tomorrow1:after", {
  photo002: { id: "photo002", kind: "photo", place: "출발선 왼쪽 R2U 깃발", time: "07:50", memo: "", photo: true, by: "번개", at },
  carpool002: { id: "carpool002", kind: "carpool", place: "조달림집", time: "05:10", memo: "", seats: 5, by: "달리기왕", at: at + 2 },
  after002: { id: "after002", kind: "after", place: "삼산 고깃집", time: "12:00", memo: "", by: "달리기왕", at: at + 1 },
});
run(["hset", "r2u:race:today1:checkers", "새벽러너", String(Date.now())]); // 출석 체크 위임받은 크루원
run(["set", "r2u:afterPhoto:photo001", photo]); run(["set", "r2u:afterPhoto:photo002", photo]);
run(["hset", "r2u:afterCame:photo001", "달리기왕", "1"]); // 단사 출석: 달리기왕은 이미 체크
run(["hset", "r2u:after:carpool002", "꾸준이", "yes"]); run(["hset", "r2u:after:carpool002", "번개", "yes"]);
run(["hset", "r2u:after:after001", "번개", "yes"]); run(["hset", "r2u:after:after001", "바람돌이", "yes"]); run(["hset", "r2u:after:after001", "꾸준이", "yes"]); // 뒷풀이 참석 신청자
console.log(`[test-day] 시드 완료 · 오늘=${kst(0)} 대회(단사·뒷풀이·카풀), 내일=${kst(1)} 대회(단사 사진+장소)`);

/* ---------- next dev ---------- */
const env = { ...process.env, KV_REST_API_URL: `http://localhost:${PORT}`, KV_REST_API_TOKEN: TOKEN, UPSTASH_REDIS_REST_URL: `http://localhost:${PORT}`, UPSTASH_REDIS_REST_TOKEN: TOKEN, SESSION_SECRET: "test-day-secret", NODE_ENV: "development", NEXT_DIST_DIR: ".next-test" };
const child = spawn("npx", ["next", "dev", "-p", String(WEB)], { env, stdio: "inherit" });
console.log(`[test-day] http://localhost:${WEB}/login  ·  운영진 또는 ${crew.join("/")}  ·  비밀번호 ${PW}`);
child.on("exit", (c) => process.exit(c ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
