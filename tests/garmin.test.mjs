// 가민 CSV 파싱·합산 테스트 (명세 §11). 실행: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeGarmin, parseGarminText, NOT_GARMIN_MSG } from "../src/lib/garmin/csv.ts";
import { aggregateByDay } from "../src/lib/garmin/aggregate.ts";

const buf = readFileSync(new URL("./fixtures/Activities.csv", import.meta.url));
const parsed = parseGarminText(decodeGarmin(buf));
const at = (s) => parsed.runs.find((r) => r.startedAt === s);
const r2 = (n) => Math.round(n * 100) / 100;

test("TC1 최초 업로드 집계", () => {
  assert.equal(parsed.totalRows, 20);
  assert.equal(parsed.runs.length, 15);
  assert.deepEqual(parsed.excluded, { notRun: 4, empty: 1 });
  assert.equal(parsed.runs.filter((r) => r.flagged).length, 0);
  const days = aggregateByDay(parsed.runs);
  assert.equal(days.length, 14);
  assert.equal(r2(parsed.runs.reduce((a, r) => a + r.distanceKm, 0)), 122.33);
  const byMonth = {};
  for (const r of parsed.runs) {
    const m = (byMonth[r.date.slice(0, 7)] ??= { runs: 0, days: new Set(), km: 0 });
    m.runs++; m.days.add(r.date); m.km += r.distanceKm;
  }
  const got = Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, [v.runs, v.days.size, r2(v.km)]]));
  assert.deepEqual(got, {
    "2026-03": [2, 2, 25.02], "2026-04": [4, 4, 30.16], "2026-05": [4, 3, 38.3], "2026-06": [4, 4, 25.34], "2026-09": [1, 1, 3.51],
  });
});

test("TC2 단건 파싱", () => {
  const r = at("2026-05-09 09:45:20");
  assert.deepEqual(
    [r.distanceKm, r.durationSec, r.avgPaceSec, r.bestPaceSec, r.avgGapSec, r.steps, r.laps, r.movingSec, r.elapsedSec, r.avgStrideM, r.avgGctMs, r.avgPowerW, r.npW],
    [13.07, 5053, 387, 273, 390, 15608, 14, 5036, 6349, 0.83, 243, 205, 206],
  );
  assert.equal(r.raw["바디 배터리 방전"], "'-24");
  const r6 = at("2026-06-06 06:13:28");
  assert.equal(r6.durationSec, 4150);
  assert.equal(r6.avgPaceSec, 407);
});

test("TC3 같은 날 2건 합산 (5/9)", () => {
  const d = aggregateByDay(parsed.runs).find((x) => x.date === "2026-05-09");
  assert.equal(d.runCount, 2);
  assert.equal(d.distanceKm, 21.25);
  assert.equal(d.durationSec, 8466);
  assert.equal(d.avgPaceSec, 398);
  assert.equal(d.avgHr, 158);
  assert.equal(d.maxHr, 181);
  assert.equal(d.aerobicTE, 5);
  assert.equal(d.avgCadence, 185);
  assert.equal(d.maxCadence, 198);
  assert.equal(d.calories, 1217);
  assert.equal(d.steps, 26224);
  assert.equal(d.elevGainM, 34);
  assert.equal(d.elevLossM, 41);
  assert.equal(d.avgPowerW, 200);
  assert.equal(d.avgStrideM, 0.81);
  assert.equal(d.avgGctMs, 245);
});

test("TC5-1 한 건만 있을 때 5/9", () => {
  const d = aggregateByDay(parsed.runs.filter((r) => r.startedAt !== "2026-05-09 14:36:51")).find((x) => x.date === "2026-05-09");
  assert.deepEqual([d.runCount, d.distanceKm, d.durationSec, d.avgPaceSec], [1, 13.07, 5053, 387]);
});

test("TC9 BOM·엑셀 저장 경고·엉뚱한 파일", () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf]);
  assert.equal(parseGarminText(decodeGarmin(bom)).runs.length, 15);
  assert.throws(() => decodeGarmin(Buffer.from("a,b,c\n1,2,3\n")), { message: NOT_GARMIN_MSG });
  const excel = new TextDecoder().decode(buf).replace("2026-05-09 09:45:20", "2026-05-09 9:45");
  assert.ok(parseGarminText(excel).warning);
});

test("TC10 의심 기록 (시간만 줄임)", () => {
  const t = new TextDecoder().decode(buf).replace('"5.01","300","00:35:27"', '"5.01","300","00:10:00"');
  const r = parseGarminText(t).runs.find((x) => x.startedAt === "2026-06-05 18:45:37");
  assert.equal(r.flagged, true);
});

test("mi 단위 변환", () => {
  const r = parseGarminText(new TextDecoder().decode(buf), "mi").runs.find((x) => x.startedAt === "2026-05-09 09:45:20");
  assert.equal(r.distanceKm, 21.03);
  assert.equal(r.avgPaceSec, 240);
});

test("TC7 손으로 넣은 기록과 병합", async () => {
  const { applyDay } = await import("../src/lib/garmin/merge.ts");
  const base = { goal: 100, days: { "9": 21, "7": 5 } };
  const rep = applyDay(base, "2026-05-09", 21.25);
  assert.equal(rep.days["9"], 21.25); // 42.25 아님
  assert.equal(rep.garmin["9"], "replace");
  assert.equal(rep.manualKm["9"], 21);
  assert.equal(rep.days["7"], 5); // 가민 없는 날은 그대로
  const sep = applyDay(base, "2026-05-09", 21.25, "separate");
  assert.equal(sep.days["9"], 42.25);
  // 같은 날 러닝이 나중에 추가돼도 다시 계산 (TC5)
  assert.equal(applyDay(rep, "2026-05-09", 30).days["9"], 30);
  assert.equal(applyDay(sep, "2026-05-09", 30).days["9"], 51);
  // 가민 기록을 모두 지우면 손으로 넣은 값으로 되돌림
  const back = applyDay(rep, "2026-05-09", 0);
  assert.equal(back.days["9"], 21);
  assert.equal(back.garmin["9"], undefined);
  // 손 기록 없는 날
  const fresh = applyDay(base, "2026-05-05", 14.01);
  assert.equal(fresh.days["5"], 14.01);
  assert.equal(applyDay(fresh, "2026-05-05", 0).days["5"], undefined);
});

test("TC9 CP949(엑셀 저장) 파일", () => {
  const cp = readFileSync(new URL("./fixtures/Activities-cp949.csv", import.meta.url));
  const p = parseGarminText(decodeGarmin(cp));
  assert.equal(p.runs.length, 15);
  assert.equal(p.runs.find((r) => r.startedAt === "2026-05-09 09:45:20").title, "동두천 핫피자런");
  assert.equal(p.warning, undefined);
  const xl = readFileSync(new URL("./fixtures/Activities-excel.csv", import.meta.url));
  assert.ok(parseGarminText(decodeGarmin(xl)).warning); // 날짜에 초가 없으면 원본을 올리라고 안내
});

test("분석 요약", async () => {
  const { analyzeRuns, weekStart } = await import("../src/lib/garmin/analysis.ts");
  const a = analyzeRuns(parsed.runs);
  assert.equal(a.total.runs, 15);
  assert.equal(a.total.days, 14);
  assert.equal(a.total.km, 122.33);
  assert.equal(a.total.firstDate, "2026-03-26");
  assert.equal(a.total.lastDate, "2026-09-09");
  assert.equal(a.highlights.longest.value, 15.01);
  assert.equal(a.highlights.hardest.value, 5);
  assert.deepEqual(a.monthly.map((m) => [m.ym, m.runs, m.days, m.km]), [
    ["2026-03", 2, 2, 25.02], ["2026-04", 4, 4, 30.16], ["2026-05", 4, 3, 38.3], ["2026-06", 4, 4, 25.34], ["2026-09", 1, 1, 3.51],
  ]);
  assert.deepEqual([a.surface.treadmill.runs, a.surface.treadmill.km, a.surface.outdoor.runs, a.surface.outdoor.km], [5, 21.77, 10, 100.56]);
  assert.equal(a.distanceBands.reduce((s, b) => s + b.runs, 0), 15);
  assert.equal(a.teBands.reduce((s, b) => s + b.runs, 0), 15);
  assert.equal(a.timeOfDay.reduce((s, b) => s + b.runs, 0), 15);
  assert.equal(a.weekday.reduce((s, b) => s + b.runs, 0), 15);
  assert.equal(a.weekly.length, 12);
  assert.equal(a.weekly[11].km, 3.51); // 마지막 기록이 있는 주
  assert.equal(a.trend.length, 15);
  assert.equal(a.total.avgPaceSec, Math.round((parsed.runs.reduce((s, r) => s + r.durationSec, 0)) / 122.33));
  assert.equal(weekStart("2026-09-09"), "2026-09-07"); // 수요일 → 월요일
  assert.equal(weekStart("2026-09-13"), "2026-09-07"); // 일요일도 같은 주
  assert.equal(analyzeRuns([]), null);
});

test("분석 기간", async () => {
  const { resolveRange, inRange } = await import("../src/lib/garmin/range.ts");
  const today = "2026-10-15";
  assert.equal(resolveRange({}, today).key, "all");
  assert.equal(resolveRange({ range: "zzz" }, today).key, "all");
  const r30 = resolveRange({ range: "30" }, today);
  assert.deepEqual([r30.from, r30.to], ["2026-09-16", "2026-10-15"]); // 오늘 포함 30일
  assert.equal(resolveRange({ range: "year" }, today).from, "2026-01-01");
  const c = resolveRange({ from: "2026-05-01", to: "2026-03-01" }, today);
  assert.deepEqual([c.key, c.from, c.to], ["custom", "2026-03-01", "2026-05-01"]); // 거꾸로 입력해도 바로잡음
  assert.equal(resolveRange({ from: "2026-02-31" }, today).key, "all"); // 없는 날짜는 무시
  assert.equal(resolveRange({ from: "2026-06-01" }, today).to, null);
  const may = resolveRange({ from: "2026-05-01", to: "2026-05-31" }, today);
  assert.equal(parsed.runs.filter((r) => inRange(r.date, may)).length, 4);
  assert.equal(parsed.runs.filter((r) => inRange(r.date, resolveRange({}, today))).length, 15);
});
