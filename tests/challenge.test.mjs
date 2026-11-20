// 12월 기록 챌린지 규칙 엔진 테스트. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG as cfg, paceSecOf, fmtPace, fmtDur, phaseOf, judge, validateConfig, addDaysYmd, validateActivity,
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
