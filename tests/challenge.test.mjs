// 12월 기록 챌린지 규칙 엔진 테스트. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG as cfg, paceSecOf, fmtPace, fmtDur, phaseOf, judge, validateConfig, addDaysYmd, validateActivity,
  buildBoard, awardWinners, placeKey, placeGroupOf, formatValue,
} from "../src/lib/challenge/rules.ts";

/** 테스트용 활동 (기본: 12/2 새벽 5km 25분 = 페이스 5:00) */
const act = (o = {}) => {
  const a = {
    id: `x${Math.random().toString(36).slice(2)}`, nick: "a", startedAt: "2026-12-02T06:00",
    distanceKm: 5, durationSec: 1500, surface: "road", cadence: null, avgHr: null, zone2Pct: null, place: null,
    imgs: { summary: true }, status: "pending", createdAt: 0, updatedAt: 0, ...o,
  };
  a.date = a.startedAt.slice(0, 10);
  return a;
};

test("페이스는 초 단위로 버림해서 8:00 경계를 가른다", () => {
  assert.equal(paceSecOf(5, 2400), 480);
  assert.equal(paceSecOf(5, 2404), 480); // 480.8 → 480 (표시도 8:00)
  assert.equal(paceSecOf(5, 2405), 481);
  assert.equal(paceSecOf(8.15, 3912), 480); // 부동소수 479.999… 방지: 정확히 8:00
  assert.equal(fmtPace(480), "8:00");
  assert.equal(fmtPace(481), "8:01");
  assert.equal(fmtPace(65), "1:05");
  assert.equal(fmtDur(3725), "1:02:05");
  assert.equal(fmtDur(125), "2:05");
  assert.ok(judge(act({ durationSec: 2404 }), cfg).paceOk);
  assert.ok(!judge(act({ durationSec: 2405 }), cfg).paceOk);
});

test("기간 단계", () => {
  const p = (d) => phaseOf(cfg, d);
  assert.equal(p("2026-11-23"), "soon");
  assert.equal(p("2026-11-24"), "signup");
  assert.equal(p("2026-11-30"), "signup");
  assert.equal(p("2026-12-01"), "running");
  assert.equal(p("2026-12-18"), "running");
  assert.equal(p("2026-12-19"), "upload");
  assert.equal(p("2026-12-20"), "upload");
  assert.equal(p("2026-12-21"), "appeal");
  assert.equal(p("2026-12-22"), "appeal");
  assert.equal(p("2026-12-23"), "closed");
});

test("날짜 더하기와 설정 검증", () => {
  assert.equal(addDaysYmd("2026-12-23", 30), "2027-01-22");
  assert.equal(validateConfig(cfg), null);
  assert.match(validateConfig({ ...cfg, signupEnd: "2026-12-01" }), /신청 마감/);
  assert.match(validateConfig({ ...cfg, uploadEnd: "2026-12-18" }), /업로드 마감/);
  assert.match(validateConfig({ ...cfg, finalAt: "2026-12-22" }), /확정/);
  assert.match(validateConfig({ ...cfg, start: "2026-13-01" }), /날짜/);
  assert.match(validateConfig({ ...cfg, fee: -1 }), /회비/);
});

test("판정: 8분보다 느리면 거리·시간·5km·케이던스·장소에서 제외하고 사유를 알려 준다", () => {
  const j = judge(act({ distanceKm: 6, durationSec: 4200 }), cfg); // 11:40
  assert.equal(j.paceSec, 700);
  assert.equal(j.counts.distance, false);
  assert.equal(j.counts.time, false);
  assert.equal(j.counts.fiveK, false);
  assert.ok(j.notes.some((n) => n.includes("11:40")));
});

test("판정: Zone 2는 8분 규칙을 면제하고 비율 80%부터 인정한다", () => {
  const slow = { distanceKm: 9, durationSec: 7200, avgHr: 130 };
  const j = judge(act({ ...slow, zone2Pct: 90 }), cfg);
  assert.equal(j.counts.zone2, true);
  assert.equal(j.counts.distance, false);
  assert.equal(judge(act({ ...slow, zone2Pct: 80 }), cfg).counts.zone2, true);
  const j79 = judge(act({ ...slow, zone2Pct: 79 }), cfg);
  assert.equal(j79.counts.zone2, false);
  assert.ok(j79.notes.some((n) => n.includes("79%")));
});

test("판정: 케이던스는 10km 이상, 장소는 40분 이상·트레드밀 제외", () => {
  assert.equal(judge(act({ distanceKm: 9.99, durationSec: 3000, cadence: 180 }), cfg).counts.cadence, false);
  assert.equal(judge(act({ distanceKm: 10, durationSec: 3000, cadence: 180 }), cfg).counts.cadence, true);
  assert.equal(judge(act({ distanceKm: 8, durationSec: 2399, place: "탄천" }), cfg).counts.place, false);
  assert.equal(judge(act({ distanceKm: 8, durationSec: 2400, place: "탄천" }), cfg).counts.place, true);
  assert.equal(judge(act({ distanceKm: 8, durationSec: 2400, place: "탄천", surface: "treadmill" }), cfg).counts.place, false);
  assert.equal(judge(act({ distanceKm: 8, durationSec: 2400, place: "탄천", surface: "track" }), cfg).counts.place, true);
});

test("판정: 기간 밖과 반려된 기록은 아무 부문에도 들어가지 않는다", () => {
  for (const startedAt of ["2026-11-30T23:00", "2026-12-19T06:00"]) {
    const j = judge(act({ startedAt }), cfg);
    assert.ok(Object.values(j.counts).every((v) => v === false));
  }
  const r = judge(act({ status: "rejected", rejectReason: "캡처가 안 보여요" }), cfg);
  assert.ok(Object.values(r.counts).every((v) => v === false));
  assert.ok(r.notes[0].startsWith("반려됨: 캡처가 안 보여요"));
});

// ---- 입력 검증 ----
const raw = (o = {}) => ({ startedAt: "2026-12-02T06:00", distanceKm: 5, durationSec: 1500, surface: "road", cadence: null, avgHr: null, zone2Pct: null, place: "", ...o });
const imgs = (o = {}) => ({ summary: true, cadence: false, zone: false, map: false, ...o });
const check = (r, i, today = "2026-12-10") => validateActivity(r, i, cfg, today);

test("입력: 정상 기록은 통과하고 거리는 소수 둘째 자리로 맞춘다", () => {
  const r = check(raw({ distanceKm: 5.004 }), imgs());
  assert.equal(r.ok, true);
  assert.equal(r.value.distanceKm, 5);
  assert.equal(r.value.date, "2026-12-02");
  assert.equal(r.value.place, null);
});

test("입력: 활동 요약 캡처가 없으면 저장할 수 없다", () => {
  const r = check(raw(), imgs({ summary: false }));
  assert.equal(r.ok, false);
  assert.match(r.msg, /요약 캡처/);
});

test("입력: 기간 밖·미래·잘못된 일시를 막는다", () => {
  assert.match(check(raw({ startedAt: "2026-11-30T23:59" }), imgs()).msg, /기간/);
  assert.match(check(raw({ startedAt: "2026-12-19T06:00" }), imgs(), "2026-12-19").msg, /기간/);
  assert.match(check(raw({ startedAt: "2026-12-11T06:00" }), imgs(), "2026-12-10").msg, /미래/);
  assert.match(check(raw({ startedAt: "2026-02-30T06:00" }), imgs()).msg, /일시/);
  assert.match(check(raw({ startedAt: "" }), imgs()).msg, /일시/);
});

test("입력: 말이 안 되는 거리·시간·페이스를 막는다", () => {
  assert.match(check(raw({ distanceKm: 0 }), imgs()).msg, /거리/);
  assert.match(check(raw({ distanceKm: null }), imgs()).msg, /거리/);
  assert.match(check(raw({ durationSec: 30 }), imgs()).msg, /시간/);
  assert.match(check(raw({ durationSec: 600 }), imgs()).msg, /너무 빨라/); // 2:00/km
  assert.match(check(raw({ surface: "toString" }), imgs()).msg, /로드/);
});

test("입력: 케이던스는 값과 캡처가 짝이어야 한다", () => {
  assert.match(check(raw({ cadence: 180 }), imgs()).msg, /케이던스 캡처/);
  assert.match(check(raw(), imgs({ cadence: true })).msg, /케이던스 값/);
  assert.equal(check(raw({ cadence: 180 }), imgs({ cadence: true })).ok, true);
  assert.match(check(raw({ cadence: 300 }), imgs({ cadence: true })).msg, /케이던스/);
});

test("입력: Zone 2는 비율·평균 심박·캡처가 모두 있어야 한다", () => {
  assert.match(check(raw({ zone2Pct: 85 }), imgs({ zone: true })).msg, /평균 심박/);
  assert.match(check(raw({ zone2Pct: 85, avgHr: 140 }), imgs()).msg, /심박 구간 캡처/);
  assert.match(check(raw({ avgHr: 140 }), imgs({ zone: true })).msg, /비율/);
  assert.match(check(raw({ zone2Pct: 101, avgHr: 140 }), imgs({ zone: true })).msg, /0~100/);
  const ok = check(raw({ zone2Pct: 85, avgHr: 140 }), imgs({ zone: true }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.zone2Pct, 85);
});

test("입력: 장소는 지도 캡처가 짝이어야 하고 트레드밀은 쓸 수 없다", () => {
  assert.match(check(raw({ place: "송파구 올림픽공원" }), imgs()).msg, /지도/);
  assert.match(check(raw(), imgs({ map: true })).msg, /장소를 입력/);
  assert.match(check(raw({ place: "탄천", surface: "treadmill" }), imgs({ map: true })).msg, /트레드밀/);
  assert.match(check(raw({ place: "가" }), imgs({ map: true })).msg, /2~40자/);
  const ok = check(raw({ place: "  송파구 올림픽공원  " }), imgs({ map: true }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.place, "송파구 올림픽공원");
});

// ---- 순위·시상 ----
const mk = (id, nick, startedAt, distanceKm, durationSec, extra = {}) => act({ id, nick, startedAt, distanceKm, durationSec, ...extra });
const DATA = [
  mk("a1", "a", "2026-12-02T06:00", 10.5, 3150, { cadence: 182, place: "한강 반포" }),
  mk("a2", "a", "2026-12-03T06:00", 5, 1500),
  mk("a3", "a", "2026-12-04T06:00", 6, 4200), // 11:40 → 제외
  mk("b1", "b", "2026-12-02T06:00", 3, 900),
  mk("b2", "b", "2026-12-02T19:00", 2.5, 750), // 같은 날 합산 5.5km
  mk("b3", "b", "2026-12-05T06:00", 15, 6000, { cadence: 176, zone2Pct: 85, avgHr: 140, place: "탄천" }),
  mk("c1", "c", "2026-12-03T06:00", 4, 1200),
  mk("c2", "c", "2026-12-04T06:00", 9, 7200, { zone2Pct: 90, avgHr: 130 }), // 느리지만 Zone 2
  mk("z", "z", "2026-12-02T06:00", 50, 15000), // 입금 확인 안 된 사람
];
const PAID = ["a", "b", "c"];
const names = (list) => list.map((e) => e.nick);

test("순위: 부문별 값과 순서 (입금 확인된 사람만, 검수 전 기록 포함)", () => {
  const b = buildBoard(DATA, PAID, cfg, { verifiedOnly: false });
  assert.deepEqual(names(b.distance), ["b", "a", "c"]);
  assert.deepEqual(b.distance.map((e) => e.value), [20.5, 15.5, 4]);
  assert.deepEqual(names(b.time), ["b", "a", "c"]);
  assert.deepEqual(b.time.map((e) => e.value), [7650, 4650, 1200]);
  assert.deepEqual(names(b.cadence), ["a", "b"]);
  assert.deepEqual(b.cadence.map((e) => e.value), [182, 176]);
  assert.deepEqual(names(b.zone2), ["b", "c"]);
  assert.deepEqual(b.zone2.map((e) => e.value), [15, 9]);
  assert.deepEqual(names(b.place), ["a", "b"]); // 둘 다 1곳 → 증거 활동의 평균 페이스가 빠른 a
  assert.deepEqual(b.place.map((e) => e.value), [1, 1]);
  assert.deepEqual(names(b.fiveK), ["a", "b"]); // 둘 다 2일 → 페이스 300 vs 373
  assert.deepEqual(b.fiveK.map((e) => e.value), [2, 2]);
  assert.deepEqual(b.fiveK.map((e) => e.rank), [1, 2]);
});

test("순위: 검수 완료 기준이면 승인된 기록만 센다", () => {
  assert.deepEqual(buildBoard(DATA, PAID, cfg, { verifiedOnly: true }).distance, []);
  const some = DATA.map((x) => (x.id === "a1" ? { ...x, status: "ok" } : x));
  const b = buildBoard(some, PAID, cfg, { verifiedOnly: true });
  assert.deepEqual(names(b.distance), ["a"]);
  assert.equal(b.distance[0].value, 10.5);
});

test("순위: 반려된 기록은 빠진다", () => {
  const rej = DATA.map((x) => (x.id === "b3" ? { ...x, status: "rejected", rejectReason: "x" } : x));
  const b = buildBoard(rej, PAID, cfg, { verifiedOnly: false });
  assert.equal(b.distance.find((e) => e.nick === "b").value, 5.5);
  assert.deepEqual(names(b.zone2), ["c"]);
});

test("시상: 1인 1상, 앞 부문 수상자는 뒤 부문에서 빠진다", () => {
  const awards = awardWinners(buildBoard(DATA, PAID, cfg, { verifiedOnly: false }));
  assert.deepEqual(awards.map((x) => x.category), ["distance", "time", "cadence", "zone2", "place", "fiveK"]);
  assert.deepEqual(awards.map((x) => x.winner), ["b", "a", null, "c", null, null]);
});

test("시상: 완전 동점이면 우승자를 정하지 않고 동점자를 알려 준다", () => {
  const tie = [mk("p1", "p", "2026-12-02T06:00", 5, 1500), mk("q1", "q", "2026-12-02T06:00", 5, 1500)];
  const board = buildBoard(tie, ["p", "q"], cfg, { verifiedOnly: false });
  assert.deepEqual(board.distance.map((e) => e.rank), [1, 1]);
  const [first] = awardWinners(board);
  assert.equal(first.winner, null);
  assert.deepEqual(first.tie, ["p", "q"]);
});

test("시상: 앞 부문에 동점이 있으면 뒤 부문 수상은 잠정이다", () => {
  const d = [
    mk("p1", "p", "2026-12-02T06:00", 10, 3000, { cadence: 180 }),
    mk("q1", "q", "2026-12-02T06:00", 10, 3000),
  ];
  const awards = awardWinners(buildBoard(d, ["p", "q"], cfg, { verifiedOnly: false }));
  assert.equal(awards[0].provisional, false);
  assert.deepEqual(awards[0].tie, ["p", "q"]);
  assert.equal(awards[1].provisional, true);
  assert.equal(awards[2].winner, "p");
  assert.equal(awards[2].provisional, true);
  const clean = awardWinners(buildBoard(DATA, PAID, cfg, { verifiedOnly: false }));
  assert.equal(clean[0].provisional, false);
});

test("순위: 동점 뒤 순위는 건너뛴다 (1,1,3)", () => {
  const d = [
    mk("p1", "p", "2026-12-02T06:00", 5, 1500),
    mk("q1", "q", "2026-12-02T06:00", 5, 1500),
    mk("r1", "r", "2026-12-02T06:00", 3, 900),
  ];
  assert.deepEqual(buildBoard(d, ["p", "q", "r"], cfg, { verifiedOnly: false }).distance.map((e) => e.rank), [1, 1, 3]);
});

test("장소: constructor·__proto__ 같은 입력도 평범한 장소로 센다", () => {
  const places = { [placeKey("뚝섬")]: "한강 반포" };
  for (const w of ["constructor", "__proto__", "toString"]) {
    assert.equal(placeGroupOf(w, places), placeKey(w));
    assert.equal(placeGroupOf(w), placeKey(w));
  }
  const d = [
    mk("x1", "x", "2026-12-02T06:00", 8, 2400, { place: "constructor" }),
    mk("x2", "x", "2026-12-03T06:00", 8, 2400, { place: "__proto__" }),
    mk("x3", "x", "2026-12-04T06:00", 8, 2400, { place: "한강 반포" }),
  ];
  assert.equal(buildBoard(d, ["x"], cfg, { verifiedOnly: false, places }).place[0].value, 3);
});

test("장소: 공백·대소문자는 같은 장소, 운영진 정리표로 묶을 수 있다", () => {
  assert.equal(placeKey("  한강 반포 "), placeKey("한강반포"));
  const d = [
    mk("d1", "d", "2026-12-02T06:00", 8, 2400, { place: "한강 반포" }),
    mk("d2", "d", "2026-12-03T06:00", 8, 2400, { place: "한강반포" }),
    mk("d3", "d", "2026-12-04T06:00", 8, 2400, { place: "뚝섬" }),
  ];
  assert.equal(buildBoard(d, ["d"], cfg, { verifiedOnly: false }).place[0].value, 2);
  const grouped = buildBoard(d, ["d"], cfg, { verifiedOnly: false, places: { [placeKey("뚝섬")]: "한강 반포" } });
  assert.equal(grouped.place[0].value, 1);
});

test("5km: 5.00km는 포함, 느린 활동은 날 합계에서 빠진다", () => {
  const d = [
    mk("e1", "e", "2026-12-02T06:00", 5, 1500), // 정확히 5.00km → 1일
    mk("e2", "e", "2026-12-03T06:00", 2.5, 750),
    mk("e3", "e", "2026-12-03T18:00", 2.49, 747), // 합 4.99km → 아님
    mk("e4", "e", "2026-12-04T06:00", 3, 900),
    mk("e5", "e", "2026-12-04T18:00", 2, 3000), // 25:00/km 느림 → 합 3km → 아님
  ];
  assert.equal(buildBoard(d, ["e"], cfg, { verifiedOnly: false }).fiveK[0].value, 1);
});

test("표시: 값 형식", () => {
  assert.equal(formatValue("distance", 20.5), "20.50km");
  assert.equal(formatValue("time", 7650), "2:07:30");
  assert.equal(formatValue("cadence", 182), "182spm");
  assert.equal(formatValue("place", 3), "3곳");
  assert.equal(formatValue("fiveK", 4), "4일");
});
