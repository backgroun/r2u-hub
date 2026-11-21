// 챌린지 테스트용 더미 데이터 넣기·지우기 (운영진이 화면을 확인하려는 용도).
//
//   node scripts/seed-dummy-challenge.mjs --env <env파일>                 → 무엇을 넣을지 보여주기만 함 (아무것도 쓰지 않음)
//   node scripts/seed-dummy-challenge.mjs --env <env파일> --apply         → 더미 신청자·기록을 실제로 넣기
//   node scripts/seed-dummy-challenge.mjs --env <env파일> --delete        → 더미만 골라서 모두 지우기
//   옵션: --block <블록id> (챌린지 블록이 둘 이상일 때)
//
// 안전 장치
//  - 넣기는 "테스트 모드가 켜진 챌린지 블록"에만 한다(테스트 모드는 운영진에게만 보인다). 꺼져 있으면 아무것도 쓰지 않고 멈춘다.
//  - 더미 신청자는 우리 회원 닉네임을 빌려 쓰되 신청자 기록에 dummy:true 표시를 붙이고(예전 "더미NN" 닉네임도 인식), 기록 id는 "dummy-"로 시작한다.
//    지울 때는 그 표시가 붙은 것만 지운다(실제 참가자·기록은 건드리지 않는다).
//  - 번호표(배번)·행운 번호는 앱과 같은 방식(비어 있을 때만 차지)으로 겹치지 않게 확보한다.
import { Redis } from "@upstash/redis";
import { createPgRequester } from "../src/lib/kv/pg-requester.ts";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply"), DELETE = args.includes("--delete");
if (arg("--env")) process.loadEnvFile(arg("--env"));

// 앱(src/lib/kv/client.ts)과 같은 방식으로 저장소에 연결한다
let close = async () => {};
function connect() {
  if (process.env.DATA_BACKEND === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("DATA_BACKEND=postgres 인데 DATABASE_URL 이 없어요.");
    const rq = createPgRequester(process.env.DATABASE_URL, { max: 2 });
    close = () => rq.close();
    return { redis: new Redis(rq), backend: "postgres(Supabase)" };
  }
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("저장소 접속 정보가 없어요.");
  return { redis: new Redis({ url, token }), backend: "upstash" };
}
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const k = (id, part) => `r2u:chal:${id}:${part}`;
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString();

const { redis, backend } = connect();
try {
  const blocks = parse(await redis.get("r2u:eventBlocks")) ?? [];
  const active = parse(await redis.get("r2u:eventActive")) ?? {};
  const chals = blocks.filter((b) => b.type === "challenge" && b.challenge);
  console.log(`저장소: ${backend} · 챌린지 블록 ${chals.length}개`);
  for (const b of chals) console.log(`  - ${b.title} [${b.id}] 테스트모드=${b.challenge.testMode ? "켜짐" : "꺼짐"} 단계=${b.challenge.testPhase || "날짜대로"} 본문세팅=${Object.values(active).includes(b.id) ? "예" : "아니오"}`);
  const block = arg("--block") ? chals.find((b) => b.id === arg("--block")) : chals.length === 1 ? chals[0] : null;
  if (!block) { console.log(chals.length ? "\n챌린지 블록이 여러 개예요. --block <id> 로 골라 주세요." : "\n챌린지 블록이 없어요."); process.exitCode = 2; throw new Error("stop"); }
  const id = block.id;
  console.log(`\n대상: ${block.title} [${id}]`);

  const members = Object.fromEntries(Object.entries((await redis.hgetall(k(id, "members"))) ?? {}).map(([n, v]) => [n, parse(v)]));
  const acts = Object.fromEntries(Object.entries((await redis.hgetall(k(id, "acts"))) ?? {}).map(([n, v]) => [n, parse(v)]));
  const isDummyMember = (n) => n.startsWith("더미") || members[n]?.dummy === true;
  const dummyNicks = Object.keys(members).filter(isDummyMember);
  const dummyActs = Object.values(acts).filter((a) => String(a.id).startsWith("dummy-"));
  console.log(`지금 데이터: 신청자 ${Object.keys(members).length}명(더미 ${dummyNicks.length}) · 기록 ${Object.keys(acts).length}건(더미 ${dummyActs.length})`);

  // ---------------- 더미 지우기 ----------------
  if (DELETE) {
    const tickets = (await redis.hgetall(k(id, "tickets"))) ?? {}, bibs = (await redis.hgetall(k(id, "bibs"))) ?? {};
    const actIds = new Set(dummyActs.map((a) => a.id));
    for (const a of dummyActs) {
      await redis.hdel(k(id, "acts"), a.id);
      for (const kind of ["summary", "cadence", "zone", "map"]) await redis.del(k(id, `img:${a.id}:${kind}`));
    }
    for (const n of dummyNicks) await redis.hdel(k(id, "members"), n);
    for (const [num, owner] of Object.entries(tickets)) if (actIds.has(String(owner))) await redis.hdel(k(id, "tickets"), num);
    for (const [num, owner] of Object.entries(bibs)) if (dummyNicks.includes(String(owner))) await redis.hdel(k(id, "bibs"), num);
    // 추첨·시상 결과에 더미가 들어 있으면 그 결과도 비운다(실제 결과일 수 있으니 더미 이름이 든 경우에만)
    for (const part of ["raffle", "awards"]) { const v = await redis.get(k(id, part)); if (v && JSON.stringify(v).includes("더미")) await redis.del(k(id, part)); }
    console.log(`\n✔ 더미 신청자 ${dummyNicks.length}명 · 기록 ${dummyActs.length}건을 지웠어요. (실제 데이터는 그대로)`);
    throw new Error("done");
  }

  // ---------------- 더미 만들기 ----------------
  if (!block.challenge.testMode) { console.log("\n✖ 이 챌린지는 테스트 모드가 꺼져 있어요. 더미를 넣으면 크루원에게도 보일 수 있어서 멈춥니다.\n  관리 화면에서 ‘테스트 켜기’를 누른 뒤 다시 실행해 주세요."); process.exitCode = 2; throw new Error("stop"); }
  if (dummyNicks.length || dummyActs.length) { console.log("\n✖ 이미 더미가 들어 있어요. 먼저 --delete 로 지운 뒤 다시 넣어 주세요."); process.exitCode = 2; throw new Error("stop"); }

  let seed = 20261122;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const PLACES = ["송파구 올림픽공원", "서초구 한강 반포", "성남 탄천", "성동구 서울숲", "용산구 남산 순환로", "강남구 양재천", "영등포구 여의도공원", "종로구 경복궁 둘레길"];
  const DISTS = [3.2, 4.1, 5.0, 5.4, 6.1, 7.5, 8.0, 10.2, 10.8, 12.0, 15.0, 21.1];

  const svg = (title, lines) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f4f1ea"/><rect width="640" height="56" fill="#ff6a33"/><text x="24" y="37" font-family="sans-serif" font-size="22" font-weight="800" fill="#fff">${title}</text>${lines.map((l, i) => `<text x="24" y="${120 + i * 56}" font-family="sans-serif" font-size="${i === 0 ? 40 : 26}" font-weight="${i === 0 ? 800 : 600}" fill="#15212c">${l}</text>`).join("")}<text x="24" y="376" font-family="sans-serif" font-size="16" fill="#8a8f96">테스트용 더미 캡처 (실제 기록이 아니에요)</text></svg>`).toString("base64");
  const claim = async (key, lo, size, owner) => { for (let i = 0; i < 500; i++) { const n = lo + Math.floor(rnd() * size); if ((await redis.hsetnx(key, String(n), owner)) === 1) return n; } throw new Error("번호를 확보하지 못했어요."); };

  // 우리 회원 닉네임에서 고른다: 운영진 계정과 이미 신청한 사람은 빼고, 시드로 섞어서 앞에서부터 쓴다
  const crew = Object.entries((await redis.hgetall("r2u:members")) ?? {}).map(([nick, v]) => ({ nick, ...parse(v) }));
  const pool = crew.filter((m) => m.role !== "admin" && !String(m.nick).startsWith("더미") && !String(m.nick).includes("/") && !members[m.nick]).map((m) => m.nick); // 슬래시가 든 닉네임은 중복·비정상 항목이라 뺀다
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const nicks = pool.slice(0, 12);
  if (nicks.length < 12) console.log(`  (쓸 수 있는 회원 닉네임이 ${nicks.length}개뿐이라 그만큼만 넣어요)`);
  const plan = { members: [], acts: [] };
  const now = Date.now();
  for (let i = 1; i <= nicks.length; i++) {
    const nick = nicks[i - 1];
    const appliedAt = now - int(2, 60) * 3600e3;
    const m = { nick, appliedAt, agreedAt: appliedAt, paid: i <= 8, dummy: true };
    if (i <= 8) { m.paidAt = appliedAt + 3600e3; m.paidBy = "더미"; } else if (i <= 10) m.paidClaimedAt = appliedAt + 7200e3;
    plan.members.push(m);
    const used = new Set(); const n = int(2, 6);
    for (let r = 0; r < n; r++) {
      const dayBack = int(0, 13); let hh = int(5, 20), mm = int(0, 59), startedAt;
      for (;;) { startedAt = `${kst(now - dayBack * 86400e3).slice(0, 10)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; if (!used.has(startedAt)) break; mm = (mm + 7) % 60; }
      used.add(startedAt);
      const distanceKm = pick(DISTS), paceSec = int(300, 540), durationSec = Math.min(86400, Math.round(distanceKm * paceSec));
      const surface = rnd() < 0.15 ? "treadmill" : "road";
      const cadence = distanceKm >= 10 && rnd() < 0.6 ? int(166, 192) : null;
      const zone = rnd() < 0.3, zone2Pct = zone ? int(72, 95) : null, avgHr = zone ? int(125, 150) : null;
      const place = surface !== "treadmill" && durationSec >= 2400 && rnd() < 0.45 ? pick(PLACES) : null;
      plan.acts.push({ nick, startedAt, date: startedAt.slice(0, 10), distanceKm, durationSec, surface, cadence, avgHr, zone2Pct, place });
    }
  }
  console.log(`\n넣을 더미: 신청자 ${plan.members.length}명(입금 확인 8 · 입금 알림 2 · 미입금 ${plan.members.length - 10}) · 기록 ${plan.acts.length}건`);
  console.log(`  닉네임: ${nicks.join(", ")}`);
  console.log(`  5km 이상 ${plan.acts.filter((a) => a.distanceKm >= 5).length}건 · 8:00보다 느린 기록 ${plan.acts.filter((a) => a.durationSec / a.distanceKm > 480).length}건 · 케이던스 ${plan.acts.filter((a) => a.cadence).length}건 · Zone 2 ${plan.acts.filter((a) => a.zone2Pct).length}건 · 장소 ${plan.acts.filter((a) => a.place).length}건 · 트레드밀 ${plan.acts.filter((a) => a.surface === "treadmill").length}건`);
  if (!APPLY) { console.log("\n(확인만 했어요. 실제로 넣으려면 --apply 를 붙여 다시 실행하세요.)"); throw new Error("done"); }

  for (const m of plan.members) { m.bib = await claim(k(id, "bibs"), 10000, 90000, m.nick); await redis.hset(k(id, "members"), { [m.nick]: JSON.stringify(m) }); }
  let n = 0;
  for (const a of plan.acts) {
    const actId = `dummy-${String(++n).padStart(3, "0")}`, ts = Date.parse(`${a.startedAt}:00+09:00`);
    const imgs = { summary: true, ...(a.cadence ? { cadence: true } : {}), ...(a.zone2Pct ? { zone: true } : {}), ...(a.place ? { map: true } : {}) };
    const pace = `${Math.floor(a.durationSec / a.distanceKm / 60)}:${String(Math.floor(a.durationSec / a.distanceKm) % 60).padStart(2, "0")}/km`;
    const dur = `${Math.floor(a.durationSec / 3600)}:${String(Math.floor((a.durationSec % 3600) / 60)).padStart(2, "0")}:${String(a.durationSec % 60).padStart(2, "0")}`;
    const ticket = await claim(k(id, "tickets"), 1000, 9000, actId);
    const rec = { id: actId, nick: a.nick, startedAt: a.startedAt, date: a.date, distanceKm: a.distanceKm, durationSec: a.durationSec, surface: a.surface, cadence: a.cadence, avgHr: a.avgHr, zone2Pct: a.zone2Pct, place: a.place, imgs, status: "ok", reviewedBy: "자동", reviewedAt: ts, createdAt: ts, updatedAt: ts, ticket };
    await redis.hset(k(id, "acts"), { [actId]: JSON.stringify(rec) });
    const put = (kind, t, l) => redis.set(k(id, `img:${actId}:${kind}`), { type: "image/svg+xml", data: svg(t, l) });
    await put("summary", `${a.nick} · 활동 요약`, [`${a.distanceKm.toFixed(2)} km`, `시간 ${dur}`, `평균 페이스 ${pace}`]);
    if (imgs.cadence) await put("cadence", `${a.nick} · 케이던스`, [`${a.cadence} spm`, "평균 케이던스"]);
    if (imgs.zone) await put("zone", `${a.nick} · 심박 구간`, [`Zone 2 ${a.zone2Pct}%`, `평균 심박 ${a.avgHr}`]);
    if (imgs.map) await put("map", `${a.nick} · 지도`, [a.place, "출발 지점 지도"]);
  }
  console.log(`\n✔ 넣었어요: 신청자 ${plan.members.length}명 · 기록 ${plan.acts.length}건 (+번호표·행운 번호·캡처 이미지)`);
  console.log("  지우려면: node scripts/seed-dummy-challenge.mjs --env <env파일> --delete");
} catch (e) {
  if (e.message !== "stop" && e.message !== "done") { console.error("오류:", e.message); process.exitCode = 1; }
} finally { await close(); }
