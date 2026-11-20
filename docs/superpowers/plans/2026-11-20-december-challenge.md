# 12월 기록 챌린지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12/1~12/18 러닝 기록 챌린지(6개 부문)를 앱에서 신청·입금 확인·캡처 기록 입력·검수·순위·이의 제기·시상까지 운영한다.

**Architecture:** 판정 규칙(페이스, 부문별 인정 여부, 순위, 1인 1상, 기간 단계)은 **의존성 없는 순수 TypeScript 한 파일**(`src/lib/challenge/rules.ts`)에 두고 `node --test`로 검증한다. 저장은 기존 이벤트 블록과 같은 Redis 해시 방식(`r2u:chal:{blockId}:*`), 화면은 서버 컴포넌트 + 서버 액션이다. 신청 기간(11/24~)이 11월 빙고 기간과 겹치므로, 챌린지는 이벤트 탭 본문을 빼앗지 않고 **`/event/challenge` 전용 경로 + 이벤트 탭 배너**로 연결한다(12/1 이후 본문 블록이 챌린지이면 이벤트 탭에서 바로 보인다).

**Tech Stack:** Next.js 15 App Router(서버 액션, `bodySizeLimit` 4mb 이미 설정), React 19, Tailwind 4(+기존 `panel`/`btn`/`chip` 클래스), Upstash Redis 호환 클라이언트(`redis` from `@/lib/hub`), `node --test`(Node 24 타입 스트리핑). **새 의존성 없음.**

**Spec:** `docs/superpowers/specs/2026-11-20-december-challenge-design.md`

## Global Constraints

- 인정 평균 페이스: 활동 1건 기준 **km당 8:00 이내(8:00 포함)**, 페이스는 `floor(시간초 ÷ 거리km)`로 계산(초 단위 이하 버림, 예: 8:00.8 → 8:00). 입력받지 않고 자동 계산. Zone 2 부문만 면제.
- 하루 = 활동 **시작 시각 기준 한국 날짜**. 모든 날짜는 `YYYY-MM-DD`/`YYYY-MM-DDTHH:mm` 문자열(한국 시각)로 저장·비교한다.
- 부문 6개(확정 순서 고정): 거리 → 최장시간 → 케이던스 → Zone 2 → 다양한 장소 → 5km. **1인 1상**, 앞 부문 수상자는 뒤 부문에서 제외하고 차순위가 올라온다. 완전 동점이면 공동으로 표시하고 운영진이 별도로 정한다.
- 케이던스: 10km 이상 활동 1건의 평균 케이던스 최고(합산 없음). Zone 2: 활동 1건 최장거리, Zone 2 체류 비율 **80% 이상**, 평균 심박 입력, 8분 규칙 면제. 장소: 활동 1건 **40분 이상**, 트레드밀 제외, 장소 입력 + 지도 캡처. 5km: 그날 인정 활동 거리 합 **5.00km 이상**인 날의 수(연속 아님). 거리는 0.01km 단위 정수(hundredths)로 더한다.
- **모든 활동은 활동 요약 캡처 1장 필수**(없으면 저장 불가). 케이던스·Zone 2(심박 구간)·장소(지도)는 값과 캡처가 **짝으로** 있어야 한다. 이미지는 브라우저에서 줄여 올리고 서버 상한 **450KB**/장, 형식 JPG·PNG·WebP.
- 회비 5,000원, **환불 없음**(신청 취소 포함). 신청할 때 규정 동의 체크 필수. 기록은 입금 전에도 올릴 수 있지만 **순위·수상에는 입금이 확인된 사람만** 포함한다.
- 일정 기본값: 신청 11/24~11/30, 기록 12/1~12/18, 업로드·수정 마감 12/20, 이의 제기 12/21~12/22, 확정·시상 12/23.
- 본인 기록 검수 금지(운영진 본인 기록은 다른 운영진이). 판정 변경은 처리자·시각·사유를 로그로 남긴다.
- 삭제·설정 변경 같은 민감한 동작은 기존 `ConfirmButton`(비밀번호 재입력) + 서버의 `isConfirmed(confirmToken)` 확인을 쓴다.
- 화면 문구는 한국어, 기존 앱 말투("~해요"). 새 CSS 파일 변경 없이 기존 클래스와 Tailwind 유틸리티만 쓴다.
- `src/lib/challenge/rules.ts`는 **다른 파일을 runtime import 하지 않고** enum/namespace를 쓰지 않는다(테스트가 `.ts`를 그대로 실행한다).
- **로컬 개발 서버는 운영 DB에 연결돼 있다.** 데이터를 쓰는 확인은 반드시 `npm run test-day`(메모리 가짜 Redis, http://localhost:3100)로 한다. 푸시와 배포(`vercel --prod`)는 사용자 확인 후에만 한다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 줄을 붙인다.

## File Structure

| 파일 | 역할 |
|---|---|
| Create `src/lib/challenge/rules.ts` | 타입·상수·순수 규칙(페이스, 기간 단계, 판정, 입력 검증, 순위, 시상) |
| Create `tests/challenge.test.mjs` | 규칙 엔진 테스트 |
| Create `src/lib/challenge/store.ts` | Redis 저장(신청자, 활동, 이미지, 장소 정리표, 이의 제기, 로그) |
| Modify `src/lib/event-blocks.ts` | 블록 종류 `challenge`, 설정 저장, `activeChallenge()`, 삭제 시 데이터 정리 |
| Create `src/app/api/challenge/[blockId]/[actId]/[kind]/route.ts` | 캡처 이미지 보기(본인·운영진만) |
| Create `src/components/challenge/photo-field.tsx` | 캡처 1장 고르기·줄이기(클라이언트) |
| Create `src/components/challenge/activity-form.tsx` | 기록 입력·수정 폼(클라이언트) |
| Create `src/app/challenge-actions.ts` | 서버 액션(참가자용 + 운영진용) |
| Create `src/components/challenge/challenge-view.tsx` | 참가자 화면(규정, 신청, 기록, 순위, 시상, 이의 제기) |
| Create `src/components/challenge/challenge-banner.tsx` | 이벤트 탭 배너 |
| Create `src/app/event/challenge/page.tsx` | 챌린지 전용 경로 |
| Modify `src/app/event/page.tsx` | 배너 삽입, 본문 블록이 챌린지이면 챌린지 화면 |
| Create `src/components/challenge/challenge-admin.tsx` | 운영진 화면(설정, 입금, 검수, 장소, 이의, 결과, 로그) |
| Modify `src/app/admin/page.tsx` | 블록 만들기 폼에 챌린지, 이벤트 탭에 운영진 화면 삽입 |
| Modify `src/app/actions.ts` | `createEventBlock`에 챌린지 종류 |
| Modify `docs/superpowers/specs/2026-11-20-december-challenge-design.md` | 구현 중 정해진 규칙 반영 |

---

### Task 1: 규칙 엔진 ① 상수·기간 단계·활동 판정

**Files:**
- Create: `src/lib/challenge/rules.ts`
- Create: `tests/challenge.test.mjs`

**Interfaces:**
- Produces (이후 모든 Task가 사용): `RULE`, `Surface`, `SURFACE_LABEL`, `CATEGORIES`, `Category`, `CATEGORY_LABEL`, `ImgKind`, `IMG_KINDS`, `IMG_LABEL`, `ActStatus`, `Activity`, `ChallengeMember`, `Appeal`, `LogEntry`, `ChallengeConfig`, `DEFAULT_CONFIG`, `validateConfig(c): string | null`, `addDaysYmd(ymd, n)`, `paceSecOf(km, sec)`, `fmtPace(sec)`, `fmtDur(sec)`, `fmtDate(ymd)`, `Phase`, `PHASE_LABEL`, `phaseOf(cfg, today): Phase`, `Judgement`, `judge(a, cfg): Judgement`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/challenge.test.mjs`를 새로 만든다.

```js
// 12월 기록 챌린지 규칙 엔진 테스트. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG as cfg, paceSecOf, fmtPace, fmtDur, phaseOf, judge, validateConfig, addDaysYmd,
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/challenge.test.mjs` (안 되면 `node --no-warnings --test tests/challenge.test.mjs`)
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (`src/lib/challenge/rules.ts`가 없음)

- [ ] **Step 3: 구현**

`src/lib/challenge/rules.ts`를 새로 만든다.

```ts
/* 12월 기록 챌린지 규칙 엔진 — 순수 함수만 둔다(서버·화면·테스트가 함께 쓴다).
   다른 파일을 불러오지 않는다(테스트가 이 파일을 바로 실행한다).
   규칙의 근거: docs/superpowers/specs/2026-11-20-december-challenge-design.md */

export const RULE = {
  maxPaceSec: 480, // 인정 평균 페이스: km당 8:00 이내 (초 단위 버림)
  suspectPaceSec: 150, // 이보다 빠르면 입력 오류로 본다 (가민 CSV 업로드와 같은 기준)
  cadenceMinKm: 10,
  placeMinSec: 40 * 60,
  fiveKmHundredths: 500, // 5.00km (거리는 0.01km 단위 정수로 더한다)
  zone2MinPct: 80,
  imageMaxBytes: 450 * 1024,
} as const;

export type Surface = "road" | "treadmill" | "track";
export const SURFACE_LABEL: Record<Surface, string> = { road: "로드", treadmill: "트레드밀", track: "트랙" };

/** 부문 6개. 배열 순서가 시상 확정 순서다. */
export const CATEGORIES = ["distance", "time", "cadence", "zone2", "place", "fiveK"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = { distance: "거리", time: "최장시간", cadence: "케이던스", zone2: "Zone 2", place: "다양한 장소", fiveK: "5km" };

export type ImgKind = "summary" | "cadence" | "zone" | "map";
export const IMG_KINDS: ImgKind[] = ["summary", "cadence", "zone", "map"];
export const IMG_LABEL: Record<ImgKind, string> = { summary: "활동 요약", cadence: "케이던스", zone: "심박 구간", map: "지도" };

export type ActStatus = "pending" | "ok" | "rejected";

export type Activity = {
  id: string;
  nick: string;
  startedAt: string; // "YYYY-MM-DDTHH:mm" (한국 시각)
  date: string; // startedAt의 날짜 (하루의 기준)
  distanceKm: number; // 소수 둘째 자리까지
  durationSec: number;
  surface: Surface;
  cadence: number | null; // 평균 케이던스(spm)
  avgHr: number | null;
  zone2Pct: number | null; // 캡처에 보이는 Zone 2 체류 비율(%)
  place: string | null; // 입력한 그대로
  imgs: Partial<Record<ImgKind, boolean>>; // 올려 둔 캡처 종류
  status: ActStatus;
  rejectReason?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ChallengeMember = { nick: string; appliedAt: number; agreedAt: number; paid: boolean; paidAt?: number; paidBy?: string };
export type Appeal = { id: string; nick: string; actId: string; reason: string; at: number; done: boolean; answer?: string; answeredBy?: string; answeredAt?: number };
export type LogEntry = { at: number; by: string; action: string; target: string; note?: string };

export type ChallengeConfig = {
  fee: number;
  bank: { bank: string; account: string; holder: string };
  signupStart: string; signupEnd: string; // 신청·입금 기간
  start: string; end: string; // 기록 인정 기간
  uploadEnd: string; // 업로드·수정 마감
  appealEnd: string; // 이의 제기 마감
  finalAt: string; // 최종 확정·시상 발표
  prizes: string[]; // 상품 예정 목록 (변경될 수 있음)
  spendNote: string; // 회비 사용 내역 공개 문구
};

export const DEFAULT_CONFIG: ChallengeConfig = {
  fee: 5000,
  bank: { bank: "", account: "", holder: "" },
  signupStart: "2026-11-24", signupEnd: "2026-11-30",
  start: "2026-12-01", end: "2026-12-18",
  uploadEnd: "2026-12-20", appealEnd: "2026-12-22", finalAt: "2026-12-23",
  prizes: ["넥워머", "카프슬리브", "오스무브 모자", "데카르트 장갑"],
  spendNote: "",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 설정이 말이 되는지 확인한다. 문제가 있으면 화면에 보여 줄 문구, 없으면 null */
export function validateConfig(c: ChallengeConfig): string | null {
  const days = [c.signupStart, c.signupEnd, c.start, c.end, c.uploadEnd, c.appealEnd, c.finalAt];
  if (!days.every((d) => YMD.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d)) return "날짜를 다시 골라 주세요.";
  if (!(c.signupStart <= c.signupEnd)) return "신청 시작일이 신청 마감일보다 늦어요.";
  if (!(c.signupEnd < c.start)) return "신청 마감은 기록 시작일보다 앞이어야 해요.";
  if (!(c.start <= c.end)) return "기록 시작일이 종료일보다 늦어요.";
  if (!(c.end < c.uploadEnd)) return "업로드 마감은 기록 종료일보다 뒤여야 해요.";
  if (!(c.uploadEnd < c.appealEnd)) return "이의 제기 마감은 업로드 마감보다 뒤여야 해요.";
  if (!(c.appealEnd < c.finalAt)) return "최종 확정일은 이의 제기 마감보다 뒤여야 해요.";
  if (!Number.isInteger(c.fee) || c.fee < 0) return "회비를 확인해 주세요.";
  return null;
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 평균 페이스(초/km). 초 단위 이하는 버린다 — 화면에 보이는 값과 판정이 항상 같다. */
export const paceSecOf = (distanceKm: number, durationSec: number): number => (distanceKm > 0 ? Math.floor(durationSec / distanceKm) : Infinity);
export const fmtPace = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
export const fmtDate = (ymd: string): string => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;

export type Phase = "soon" | "signup" | "ready" | "running" | "upload" | "appeal" | "closed";
export const PHASE_LABEL: Record<Phase, string> = {
  soon: "곧 열려요", signup: "신청 중", ready: "시작 전", running: "기록 중", upload: "기록 마감 · 업로드 기간", appeal: "순위 공개 · 이의 제기", closed: "종료",
};

/** 오늘(한국 날짜)이 어느 단계인가. 단계는 날짜의 마지막 날 23:59까지 이어진다. */
export function phaseOf(cfg: ChallengeConfig, today: string): Phase {
  if (today < cfg.signupStart) return "soon";
  if (today <= cfg.signupEnd) return "signup";
  if (today < cfg.start) return "ready";
  if (today <= cfg.end) return "running";
  if (today <= cfg.uploadEnd) return "upload";
  if (today <= cfg.appealEnd) return "appeal";
  return "closed";
}

export type Judgement = { paceSec: number; paceOk: boolean; counts: Record<Category, boolean>; notes: string[] };

const NONE: Record<Category, boolean> = { distance: false, time: false, cadence: false, zone2: false, place: false, fiveK: false };

/** 활동 1건이 어느 부문에 들어가는지, 안 들어가면 왜인지 판정한다. (캡처가 있는지는 입력 단계에서 이미 확인했다) */
export function judge(a: Activity, cfg: ChallengeConfig): Judgement {
  const paceSec = paceSecOf(a.distanceKm, a.durationSec);
  if (a.status === "rejected") return { paceSec, paceOk: false, counts: { ...NONE }, notes: [`반려됨${a.rejectReason ? `: ${a.rejectReason}` : ""}`] };
  if (a.date < cfg.start || a.date > cfg.end) return { paceSec, paceOk: false, counts: { ...NONE }, notes: [`이벤트 기간(${fmtDate(cfg.start)}~${fmtDate(cfg.end)}) 밖의 기록이에요.`] };
  const notes: string[] = [];
  const paceOk = paceSec <= RULE.maxPaceSec;
  if (!paceOk) notes.push(`평균 페이스 ${fmtPace(paceSec)}/km → 8:00보다 느려서 거리·시간·5km·케이던스·장소에서 제외돼요.`);
  const zone2 = a.zone2Pct != null && a.avgHr != null && a.zone2Pct >= RULE.zone2MinPct;
  if (a.zone2Pct != null && a.zone2Pct < RULE.zone2MinPct) notes.push(`Zone 2 비율 ${a.zone2Pct}% → ${RULE.zone2MinPct}% 미만이라 Zone 2 부문에서 제외돼요.`);
  const cadence = paceOk && a.cadence != null && a.distanceKm >= RULE.cadenceMinKm;
  if (paceOk && a.cadence != null && a.distanceKm < RULE.cadenceMinKm) notes.push(`${RULE.cadenceMinKm}km 미만이라 케이던스 부문에서 제외돼요.`);
  const place = paceOk && !!a.place && a.surface !== "treadmill" && a.durationSec >= RULE.placeMinSec;
  if (paceOk && a.place && a.durationSec < RULE.placeMinSec) notes.push("40분 미만이라 장소 부문에서 제외돼요.");
  return { paceSec, paceOk, counts: { distance: paceOk, time: paceOk, cadence, zone2, place, fiveK: paceOk }, notes };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --no-warnings --test tests/challenge.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/rules.ts tests/challenge.test.mjs
git commit -m "챌린지 규칙 엔진: 페이스·기간 단계·활동 판정"
```

---

### Task 2: 규칙 엔진 ② 기록 입력 검증

**Files:**
- Modify: `src/lib/challenge/rules.ts` (끝에 추가)
- Modify: `tests/challenge.test.mjs` (끝에 추가, import 줄 수정)

**Interfaces:**
- Consumes: Task 1의 `RULE`, `SURFACE_LABEL`, `ImgKind`, `Surface`, `ChallengeConfig`, `paceSecOf`, `fmtDate`
- Produces: `RawInput`, `ImgFlags`, `CleanInput`, `validateActivity(input: RawInput, img: ImgFlags, cfg: ChallengeConfig, today: string): { ok: true; value: CleanInput } | { ok: false; msg: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/challenge.test.mjs`의 import 블록에 `validateActivity`를 추가하고, 파일 끝에 아래를 덧붙인다.

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --no-warnings --test tests/challenge.test.mjs`
Expected: FAIL — `validateActivity is not a function` (새 테스트 7개 실패, 기존 7개는 통과)

- [ ] **Step 3: 구현**

`src/lib/challenge/rules.ts` 끝에 추가한다.

```ts
export type RawInput = {
  startedAt: string;
  distanceKm: number | null;
  durationSec: number | null;
  surface: string;
  cadence: number | null;
  avgHr: number | null;
  zone2Pct: number | null;
  place: string;
};
export type ImgFlags = Record<ImgKind, boolean>;
export type CleanInput = {
  startedAt: string; date: string; distanceKm: number; durationSec: number; surface: Surface;
  cadence: number | null; avgHr: number | null; zone2Pct: number | null; place: string | null;
};
type Checked = { ok: true; value: CleanInput } | { ok: false; msg: string };

const bad = (msg: string): Checked => ({ ok: false, msg });
const inRange = (n: number | null, lo: number, hi: number): n is number => n != null && Number.isFinite(n) && n >= lo && n <= hi;

/** 기록 입력을 확인한다. 통과하면 저장할 값(거리 둘째 자리 반올림, 장소 앞뒤 공백 제거)을 돌려준다. */
export function validateActivity(i: RawInput, img: ImgFlags, cfg: ChallengeConfig, today: string): Checked {
  const s = String(i.startedAt ?? "");
  const d = new Date(`${s}:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== s) return bad("시작 일시를 다시 골라 주세요.");
  const date = s.slice(0, 10);
  if (date < cfg.start || date > cfg.end) return bad(`${fmtDate(cfg.start)}~${fmtDate(cfg.end)} 기간의 활동만 올릴 수 있어요.`);
  if (date > today) return bad("오늘보다 미래의 활동은 올릴 수 없어요.");

  if (!inRange(i.distanceKm, 0.1, 200)) return bad("거리를 확인해 주세요. (0.1~200km)");
  const distanceKm = Math.round(i.distanceKm * 100) / 100;
  if (!inRange(i.durationSec, 60, 86400) || !Number.isInteger(i.durationSec)) return bad("시간을 확인해 주세요. (1분~24시간)");
  const durationSec = i.durationSec;
  if (paceSecOf(distanceKm, durationSec) < RULE.suspectPaceSec) return bad("평균 페이스가 너무 빨라요(2:30/km 미만). 거리와 시간을 다시 확인해 주세요.");
  if (typeof i.surface !== "string" || !Object.hasOwn(SURFACE_LABEL, i.surface)) return bad("로드·트레드밀·트랙 중에서 골라 주세요.");
  const surface = i.surface as Surface;

  if (!img.summary) return bad("활동 요약 캡처를 올려 주세요. (날짜·거리·시간이 보여야 해요)");

  const cad = i.cadence;
  if (cad != null && !inRange(cad, 60, 260)) return bad("케이던스를 확인해 주세요. (60~260)");
  if (cad != null && !img.cadence) return bad("케이던스 캡처를 올려 주세요.");
  if (cad == null && img.cadence) return bad("케이던스 값을 입력해 주세요.");

  const z = i.zone2Pct, hr = i.avgHr;
  if (z != null || hr != null || img.zone) {
    if (z == null) return bad("Zone 2 체류 비율(%)을 입력해 주세요.");
    if (hr == null) return bad("평균 심박을 입력해 주세요.");
    if (!img.zone) return bad("심박 구간 캡처를 올려 주세요. (존 번호와 비율이 보여야 해요)");
    if (!Number.isInteger(z) || z < 0 || z > 100) return bad("Zone 2 비율은 0~100 사이 정수로 입력해 주세요.");
    if (!inRange(hr, 60, 230)) return bad("평균 심박을 확인해 주세요. (60~230)");
  }

  const place = (i.place ?? "").trim();
  if (place || img.map) {
    if (!place) return bad("장소를 입력해 주세요. (예: 송파구 올림픽공원)");
    if (!img.map) return bad("지도(경로) 캡처를 올려 주세요.");
    if (surface === "treadmill") return bad("트레드밀은 다양한 장소 부문에 쓸 수 없어요. 장소와 지도 캡처를 비워 주세요.");
    if (place.length < 2 || place.length > 40) return bad("장소는 2~40자로 입력해 주세요.");
  }

  return { ok: true, value: { startedAt: s, date, distanceKm, durationSec, surface, cadence: cad ?? null, avgHr: z != null ? hr : null, zone2Pct: z ?? null, place: place || null } };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --no-warnings --test tests/challenge.test.mjs`
Expected: PASS (14 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/rules.ts tests/challenge.test.mjs
git commit -m "챌린지 규칙 엔진: 기록 입력 검증"
```

---

### Task 3: 규칙 엔진 ③ 부문별 순위와 1인 1상

**Files:**
- Modify: `src/lib/challenge/rules.ts` (끝에 추가)
- Modify: `tests/challenge.test.mjs` (끝에 추가, import 줄 수정)

**Interfaces:**
- Consumes: Task 1의 `judge`, `Activity`, `Category`, `CATEGORIES`, `ChallengeConfig`, `paceSecOf`
- Produces: `placeKey(raw)`, `placeGroupOf(raw, map?)`, `Entry`, `Board`, `buildBoard(acts, paidNicks, cfg, { verifiedOnly, places? }): Board`, `Award`, `awardWinners(board): Award[]`, `formatValue(c, v): string`

- [ ] **Step 1: 실패하는 테스트 작성**

import 블록에 `buildBoard, awardWinners, placeKey, formatValue`를 추가하고, 파일 끝에 덧붙인다.

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --no-warnings --test tests/challenge.test.mjs`
Expected: FAIL — `buildBoard is not a function`

- [ ] **Step 3: 구현**

`src/lib/challenge/rules.ts` 끝에 추가한다.

```ts
/** 장소 입력을 같은 장소끼리 비교하는 키: 공백·대소문자를 없앤다 */
export const placeKey = (raw: string): string => raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "");
/** 운영진이 정리표로 묶어 둔 장소면 묶음 이름의 키를, 아니면 입력 그대로의 키를 돌려준다 */
export const placeGroupOf = (raw: string, map: Record<string, string> = {}): string => {
  const k = placeKey(raw);
  return map[k] ? placeKey(map[k]) : k;
};

export type Entry = { nick: string; rank: number; value: number; paceSec: number; lastAt: string; actIds: string[] };
export type Board = Record<Category, Entry[]>;

type Cand = { value: number; evidence: Activity[] };

const tally = (ev: Activity[]) => {
  const hundredths = ev.reduce((s, a) => s + Math.round(a.distanceKm * 100), 0);
  const sec = ev.reduce((s, a) => s + a.durationSec, 0);
  return { paceSec: hundredths > 0 ? Math.floor(sec / (hundredths / 100)) : Infinity, lastAt: ev.reduce((m, a) => (a.startedAt > m ? a.startedAt : m), "") };
};

/** 한 사람의 활동에서 부문별 후보(값 + 근거가 되는 활동)를 계산한다 */
function candidates(list: Activity[], cfg: ChallengeConfig, places: Record<string, string>): Partial<Record<Category, Cand>> {
  const js = list.map((a) => [a, judge(a, cfg)] as const);
  const pick = (c: Category) => js.filter(([, j]) => j.counts[c]).map(([a]) => a);
  const out: Partial<Record<Category, Cand>> = {};

  const dist = pick("distance");
  if (dist.length) out.distance = { value: dist.reduce((s, a) => s + Math.round(a.distanceKm * 100), 0) / 100, evidence: dist };
  const time = pick("time");
  if (time.length) out.time = { value: time.reduce((s, a) => s + a.durationSec, 0), evidence: time };

  const cad = pick("cadence").sort((x, y) => (y.cadence as number) - (x.cadence as number) || paceSecOf(x.distanceKm, x.durationSec) - paceSecOf(y.distanceKm, y.durationSec));
  if (cad.length) out.cadence = { value: cad[0].cadence as number, evidence: [cad[0]] };

  const z2 = pick("zone2").sort((x, y) => y.distanceKm - x.distanceKm || paceSecOf(x.distanceKm, x.durationSec) - paceSecOf(y.distanceKm, y.durationSec));
  if (z2.length) out.zone2 = { value: z2[0].distanceKm, evidence: [z2[0]] };

  const groups = new Map<string, Activity>();
  for (const a of pick("place")) {
    const g = placeGroupOf(a.place as string, places);
    const cur = groups.get(g);
    if (!cur || a.startedAt < cur.startedAt) groups.set(g, a);
  }
  if (groups.size) out.place = { value: groups.size, evidence: [...groups.values()] };

  const days = new Map<string, Activity[]>();
  for (const a of pick("fiveK")) days.set(a.date, [...(days.get(a.date) ?? []), a]);
  const full = [...days.values()].filter((d) => d.reduce((s, a) => s + Math.round(a.distanceKm * 100), 0) >= RULE.fiveKmHundredths);
  if (full.length) out.fiveK = { value: full.length, evidence: full.flat() };
  return out;
}

/**
 * 부문별 순위표. paidNicks에 있는 사람만 센다.
 * verifiedOnly=true면 승인(ok)된 기록만, false면 검수 전(pending) 기록도 센다. 반려된 기록은 항상 뺀다.
 * 정렬: 값(큰 순) → 근거 활동의 평균 페이스(빠른 순) → 마지막 근거 활동 시작 시각(이른 순). 셋 다 같으면 공동 순위.
 */
export function buildBoard(acts: Activity[], paidNicks: string[], cfg: ChallengeConfig, opts: { verifiedOnly: boolean; places?: Record<string, string> }): Board {
  const paid = new Set(paidNicks);
  const by = new Map<string, Activity[]>();
  for (const a of acts) {
    if (!paid.has(a.nick)) continue;
    if (opts.verifiedOnly ? a.status !== "ok" : a.status === "rejected") continue;
    by.set(a.nick, [...(by.get(a.nick) ?? []), a]);
  }
  const board = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Entry[]])) as Board;
  for (const [nick, list] of by) {
    const cand = candidates(list, cfg, opts.places ?? {});
    for (const c of CATEGORIES) {
      const x = cand[c];
      if (x) board[c].push({ nick, rank: 0, value: x.value, ...tally(x.evidence), actIds: x.evidence.map((a) => a.id) });
    }
  }
  for (const c of CATEGORIES) {
    board[c].sort((p, q) => q.value - p.value || p.paceSec - q.paceSec || p.lastAt.localeCompare(q.lastAt) || p.nick.localeCompare(q.nick));
    board[c].forEach((e, i, arr) => { e.rank = i > 0 && same(e, arr[i - 1]) ? arr[i - 1].rank : i + 1; });
  }
  return board;
}

const same = (a: Entry, b: Entry) => a.value === b.value && a.paceSec === b.paceSec && a.lastAt === b.lastAt;

export type Award = { category: Category; winner: string | null; tie: string[] };

/** 시상: 부문을 확정 순서대로 보며, 이미 수상한 사람은 건너뛰고 차순위가 올라온다(1인 1상). 완전 동점이면 winner=null, tie=동점자. */
export function awardWinners(board: Board): Award[] {
  const won = new Set<string>();
  return CATEGORIES.map((category) => {
    const rest = board[category].filter((e) => !won.has(e.nick));
    if (!rest.length) return { category, winner: null, tie: [] };
    const top = rest.filter((e) => same(e, rest[0]));
    if (top.length > 1) return { category, winner: null, tie: top.map((e) => e.nick).sort() };
    won.add(top[0].nick);
    return { category, winner: top[0].nick, tie: [] };
  });
}

/** 순위표의 값을 화면에 보여 줄 글자로 */
export function formatValue(c: Category, v: number): string {
  if (c === "distance" || c === "zone2") return `${v.toFixed(2)}km`;
  if (c === "time") return fmtDur(v);
  if (c === "cadence") return `${v}spm`;
  if (c === "place") return `${v}곳`;
  return `${v}일`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --no-warnings --test tests/challenge.test.mjs`
Expected: PASS (22 tests). 이어서 전체 테스트 `npm test`도 통과해야 한다(기존 가민 테스트 포함).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/rules.ts tests/challenge.test.mjs
git commit -m "챌린지 규칙 엔진: 부문별 순위와 1인 1상 시상"
```

---

### Task 4: 저장소와 이벤트 블록 연결

**Files:**
- Create: `src/lib/challenge/store.ts`
- Modify: `src/lib/event-blocks.ts` (타입, `BLOCK_TYPES`, `activeChallenge`, `setChallengeConfig`, `deleteBlock`)

**Interfaces:**
- Consumes: Task 1~3의 타입(`Activity`, `Appeal`, `ChallengeMember`, `ChallengeConfig`, `LogEntry`, `ImgKind`, `IMG_KINDS`, `addDaysYmd`)
- Produces (store): `listMembers(blockId)`, `getMemberRec(blockId, nick)`, `saveMemberRec(blockId, m)`, `removeMemberRec(blockId, nick)`, `listActs(blockId)`, `getActRec(blockId, id)`, `saveActRec(blockId, a)`, `removeActRec(blockId, id)`, `putImage(blockId, actId, kind, img)`, `getImage(blockId, actId, kind)`, `delImage(blockId, actId, kind)`, `listPlaceMap(blockId)`, `setPlaceGroup(blockId, key, label|null)`, `listAppeals(blockId)`, `getAppeal(blockId, id)`, `saveAppeal(blockId, a)`, `addLog(blockId, entry)`, `listLog(blockId, limit?)`, `purgeChallenge(blockId)`
- Produces (event-blocks): `EventBlock.type` 에 `"challenge"`, `EventBlock.challenge?: ChallengeConfig`, `activeChallenge(today?): Promise<EventBlock | null>`, `setChallengeConfig(blockId, cfg)`

- [ ] **Step 1: 저장소 파일 작성**

`src/lib/challenge/store.ts`:

```ts
import "server-only";
import { redis } from "@/lib/hub";
import { IMG_KINDS, type Activity, type Appeal, type ChallengeMember, type ImgKind, type LogEntry } from "@/lib/challenge/rules";

/* 챌린지 저장소: 블록 하나당 r2u:chal:{blockId}:* 키들. 해시 하나에 항목을 JSON으로 넣는 기존 방식과 같다. */
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const k = (blockId: string, part: string) => `r2u:chal:${blockId}:${part}`;
const MEMBERS = "members", ACTS = "acts", PLACES = "places", APPEALS = "appeals", LOG = "log";

async function all<T>(key: string): Promise<T[]> {
  const h = await redis.hgetall<Record<string, unknown>>(key);
  return Object.values(h ?? {}).map((v) => parse<T>(v));
}

/* ---------- 신청자 ---------- */
export const listMembers = async (blockId: string) => (await all<ChallengeMember>(k(blockId, MEMBERS))).sort((a, b) => a.appliedAt - b.appliedAt);
export async function getMemberRec(blockId: string, nick: string) {
  const v = await redis.hget(k(blockId, MEMBERS), nick);
  return v ? parse<ChallengeMember>(v) : null;
}
export const saveMemberRec = (blockId: string, m: ChallengeMember) => redis.hset(k(blockId, MEMBERS), { [m.nick]: JSON.stringify(m) });
export const removeMemberRec = (blockId: string, nick: string) => redis.hdel(k(blockId, MEMBERS), nick);

/* ---------- 활동 ---------- */
export const listActs = async (blockId: string) => (await all<Activity>(k(blockId, ACTS))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export async function getActRec(blockId: string, id: string) {
  const v = await redis.hget(k(blockId, ACTS), id);
  return v ? parse<Activity>(v) : null;
}
export const saveActRec = (blockId: string, a: Activity) => redis.hset(k(blockId, ACTS), { [a.id]: JSON.stringify(a) });

/* ---------- 캡처 이미지 (공구 시안 이미지처럼 base64로 저장) ---------- */
type Img = { type: string; data: string };
const imgKey = (blockId: string, actId: string, kind: ImgKind) => k(blockId, `img:${actId}:${kind}`);
export const putImage = (blockId: string, actId: string, kind: ImgKind, img: Img) => redis.set(imgKey(blockId, actId, kind), img);
export const getImage = (blockId: string, actId: string, kind: ImgKind) => redis.get<Img>(imgKey(blockId, actId, kind));
export const delImage = (blockId: string, actId: string, kind: ImgKind) => redis.del(imgKey(blockId, actId, kind));
/** 활동과 그 캡처를 함께 지운다 */
export async function removeActRec(blockId: string, id: string) {
  await redis.hdel(k(blockId, ACTS), id);
  await redis.del(...IMG_KINDS.map((kind) => imgKey(blockId, id, kind)));
}

/* ---------- 장소 정리표: 입력 키(placeKey) → 묶음 이름 ---------- */
export async function listPlaceMap(blockId: string): Promise<Record<string, string>> {
  const h = await redis.hgetall<Record<string, string>>(k(blockId, PLACES));
  return h ?? {};
}
export async function setPlaceGroup(blockId: string, key: string, label: string | null) {
  if (label) await redis.hset(k(blockId, PLACES), { [key]: label });
  else await redis.hdel(k(blockId, PLACES), key);
}

/* ---------- 이의 제기 ---------- */
export const listAppeals = async (blockId: string) => (await all<Appeal>(k(blockId, APPEALS))).sort((a, b) => b.at - a.at);
export async function getAppeal(blockId: string, id: string) {
  const v = await redis.hget(k(blockId, APPEALS), id);
  return v ? parse<Appeal>(v) : null;
}
export const saveAppeal = (blockId: string, a: Appeal) => redis.hset(k(blockId, APPEALS), { [a.id]: JSON.stringify(a) });

/* ---------- 판정·처리 로그 (지우지 않는다) ---------- */
export async function addLog(blockId: string, e: Omit<LogEntry, "at">) {
  const at = Date.now();
  await redis.hset(k(blockId, LOG), { [`${at}-${Math.random().toString(36).slice(2, 6)}`]: JSON.stringify({ at, ...e }) });
}
export const listLog = async (blockId: string, limit = 50) => (await all<LogEntry>(k(blockId, LOG))).sort((a, b) => b.at - a.at).slice(0, limit);

/** 챌린지 블록을 지울 때 그 블록의 모든 데이터와 캡처를 지운다 */
export async function purgeChallenge(blockId: string) {
  const acts = await all<Activity>(k(blockId, ACTS));
  const tx = redis.multi();
  for (const a of acts) for (const kind of IMG_KINDS) tx.del(imgKey(blockId, a.id, kind));
  tx.del(k(blockId, MEMBERS), k(blockId, ACTS), k(blockId, PLACES), k(blockId, APPEALS), k(blockId, LOG));
  await tx.exec();
}
```

- [ ] **Step 2: 이벤트 블록 연결**

`src/lib/event-blocks.ts`를 수정한다.

(a) import 추가 — 파일 맨 위 import 줄 아래에:

```ts
import { addDaysYmd, type ChallengeConfig } from "@/lib/challenge/rules";
import { purgeChallenge } from "@/lib/challenge/store";
```

(b) 타입과 이름표 — 기존 `EventBlock`과 `BLOCK_TYPES`를 아래로 바꾼다.

```ts
export type EventBlock = {
  id: string;
  type: "bingo" | "poll" | "challenge";
  title: string;
  ym: string; // YYYY-MM (이 블록이 속한 달)
  at: number;
  by: string;
  poll?: { question: string; options: string[] };
  challenge?: ChallengeConfig;
};
export const BLOCK_TYPES = { bingo: "빙고", poll: "투표·설문", challenge: "기록 챌린지" } as const;
```

(c) `displayBlock` 아래에 추가:

```ts
/** 지금 신청·진행·결과를 보여 줄 챌린지 블록: 월별로 세팅된 챌린지 중 [신청 시작일, 확정일+30일] 안에 오늘이 든 것.
    신청 기간이 다른 달 이벤트(빙고)와 겹쳐도 챌린지가 가려지지 않도록 월과 무관하게 찾는다. */
export async function activeChallenge(today = kstToday()): Promise<EventBlock | null> {
  const [blocks, active] = await Promise.all([getBlocks(), getActive()]);
  const ids = new Set(Object.values(active));
  return blocks.find((b) => b.type === "challenge" && b.challenge && ids.has(b.id) && today >= b.challenge.signupStart && today <= addDaysYmd(b.challenge.finalAt, 30)) ?? null;
}

export async function setChallengeConfig(blockId: string, challenge: ChallengeConfig) {
  const blocks = await getBlocks();
  await saveBlocks(blocks.map((b) => (b.id === blockId ? { ...b, challenge } : b)));
}
```

(d) `deleteBlock`에서 챌린지 데이터도 지운다. 함수 첫 줄 `const blocks = await getBlocks();` 바로 뒤에 추가:

```ts
  if (blocks.find((b) => b.id === id)?.type === "challenge") await purgeChallenge(id);
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (admin 화면의 `BLOCK_TYPES[b.type]`는 타입이 넓어졌지만 그대로 통과해야 한다.)

Run: `npm run lint`
Expected: 새 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/challenge/store.ts src/lib/event-blocks.ts
git commit -m "챌린지 저장소와 이벤트 블록 연결 (activeChallenge)"
```

---

### Task 5: 캡처 이미지 보기 API와 캡처 고르기 컴포넌트

**Files:**
- Create: `src/app/api/challenge/[blockId]/[actId]/[kind]/route.ts`
- Create: `src/components/challenge/photo-field.tsx`

**Interfaces:**
- Consumes: `getActRec`, `getImage` (Task 4), `IMG_KINDS`, `ImgKind` (Task 1), `currentUser` from `@/lib/hub`
- Produces: `GET /api/challenge/{blockId}/{actId}/{kind}` (본인·운영진만, 없으면 404), 컴포넌트 `PhotoField({ name, label, hint?, have?, required? })` — 폼 안에서 `name` 이름의 파일 입력 1개를 채운다(줄여진 WebP/JPEG, ≤450KB)

- [ ] **Step 1: 이미지 API 작성**

`src/app/api/challenge/[blockId]/[actId]/[kind]/route.ts`:

```ts
import { currentUser } from "@/lib/hub";
import { getActRec, getImage } from "@/lib/challenge/store";
import { IMG_KINDS, type ImgKind } from "@/lib/challenge/rules";

// 캡처는 올린 본인과 운영진만 볼 수 있다. (다른 참가자에게는 보이지 않는다)
export async function GET(_req: Request, { params }: { params: Promise<{ blockId: string; actId: string; kind: string }> }) {
  const u = await currentUser();
  if (!u) return new Response(null, { status: 401 });
  const { blockId, actId, kind } = await params;
  if (!(IMG_KINDS as string[]).includes(kind)) return new Response(null, { status: 404 });
  const act = await getActRec(blockId, actId);
  if (!act || (act.nick !== u.nick && !u.admin)) return new Response(null, { status: 404 });
  const img = await getImage(blockId, actId, kind as ImgKind);
  if (!img) return new Response(null, { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=3600" }, // 주소에 ?v=수정시각을 붙여 바뀌면 새로 받는다
  });
}
```

- [ ] **Step 2: 캡처 고르기 컴포넌트 작성**

`src/components/challenge/photo-field.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

const MAX = 450 * 1024; // rules.ts 의 RULE.imageMaxBytes 와 같은 값

/** 캡처 1장 고르기: 브라우저에서 긴 변 1600px로 줄여 올린다(글씨가 읽히도록 사진 올리기보다 크게). 폼이 초기화되면 미리보기도 비운다. */
export default function PhotoField({ name, label, hint, have, required }: { name: string; label: string; hint?: string; have?: boolean; required?: boolean }) {
  const pick = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const form = out.current?.form;
    const clear = () => { setPreview(""); setMsg(""); if (pick.current) pick.current.value = ""; };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let mime = "image/webp", q = 0.85, blob: Blob | null = null;
      for (let i = 0; i < 6; i++) {
        blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, q));
        // 일부 브라우저(사파리)는 WebP로 못 줄이고 PNG를 돌려준다 → JPEG로 다시 시도
        if (blob && blob.type !== mime && mime === "image/webp") { mime = "image/jpeg"; i--; continue; }
        if (blob && blob.size <= MAX) break;
        q -= 0.12;
      }
      if (!blob || blob.size > MAX) throw new Error("big");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `${name}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type }));
      out.current!.files = dt.files;
      setPreview(URL.createObjectURL(blob));
      setMsg(`${Math.round(blob.size / 1024)}KB로 줄였어요`);
    } catch {
      if (out.current) out.current.value = "";
      setPreview(""); setMsg("사진을 읽지 못했어요. 다른 캡처로 해 주세요.");
    }
    setBusy(false);
  }

  return (
    <div className="field">
      <span className="label">{label}{required && <b className="text-[var(--bad)]"> *</b>}</span>
      <input ref={out} type="file" name={name} hidden />
      <input ref={pick} type="file" accept="image/*" className="input" onChange={onPick} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {preview && <img src={preview} alt={`${label} 미리보기`} className="mt-1 rounded-lg" style={{ maxHeight: 140, maxWidth: "100%" }} />}
      {busy && <span className="text-xs text-muted">줄이는 중…</span>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {have && !preview && <span className="text-xs text-muted">올려 둔 캡처가 있어요. 새로 고르면 바뀌어요.</span>}
    </div>
  );
}
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음 (기존 파일처럼 `<img>` 경고가 있다면 새 오류가 아닌 경고 수준이어야 한다).

- [ ] **Step 4: 커밋**

```bash
git add "src/app/api/challenge" src/components/challenge/photo-field.tsx
git commit -m "챌린지 캡처 이미지 보기 API와 캡처 고르기 컴포넌트"
```

---

### Task 6: 참가자 서버 액션

**Files:**
- Create: `src/app/challenge-actions.ts`

**Interfaces:**
- Consumes: Task 1~4의 모든 규칙·저장소 함수, `activeChallenge`(Task 4), `currentUser`/`kstToday`/`newId` from `@/lib/hub`, `isConfirmed` from `@/lib/confirm-token`, `Result` from `@/app/actions`
- Produces: `joinChallengeAction(_, fd)`, `leaveChallengeAction(_, fd)`, `submitActivityAction(_, fd)`, `deleteActivityAction(fd)`, `fileAppealAction(_, fd)`. 폼 필드 이름: 공통 `id`(블록), 활동 `actId`(수정일 때), `startedAt`, `distanceKm`, `durH`/`durM`/`durS`, `surface`, `cadence`, `avgHr`, `zone2Pct`, `place`, 파일 `img_summary`/`img_cadence`/`img_zone`/`img_map`

- [ ] **Step 1: 액션 파일 작성**

`src/app/challenge-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, kstToday, newId } from "@/lib/hub";
import { isConfirmed } from "@/lib/confirm-token";
import { activeChallenge } from "@/lib/event-blocks";
import {
  addLog, delImage, getActRec, getMemberRec, listActs, listAppeals, putImage, removeActRec, removeMemberRec, saveActRec, saveAppeal, saveMemberRec,
} from "@/lib/challenge/store";
import { IMG_KINDS, RULE, phaseOf, validateActivity, type Activity, type ImgKind, type RawInput } from "@/lib/challenge/rules";
import type { Result } from "@/app/actions";

const ok = (msg?: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
/** 빈 칸이면 null, 숫자가 아니면 NaN */
const num = (fd: FormData, k: string): number | null => {
  const s = String(fd.get(k) ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

async function me() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
const refresh = () => { revalidatePath("/event"); revalidatePath("/event/challenge"); revalidatePath("/admin"); };

/** 지금 진행 중인 챌린지 블록(폼이 가리키는 것과 같아야 한다) */
async function liveBlock(fd: FormData) {
  const block = await activeChallenge();
  return block?.challenge && block.id === str(fd, "id", 20) ? { block, cfg: block.challenge } : null;
}

/* ---------- 참가 신청·취소 ---------- */
export async function joinChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "signup") return fail("신청 기간이 아니에요.");
  if (fd.get("agree") !== "on") return fail("규정과 ‘회비 환불 없음’에 동의해 주세요.");
  if (await getMemberRec(live.block.id, u.nick)) return fail("이미 신청했어요.");
  const now = Date.now();
  await saveMemberRec(live.block.id, { nick: u.nick, appliedAt: now, agreedAt: now, paid: false });
  await addLog(live.block.id, { by: u.nick, action: "join", target: u.nick });
  refresh();
  return ok(`신청했어요! 회비 ${live.cfg.fee.toLocaleString("ko-KR")}원을 입금하면 운영진이 확인한 뒤 참가가 확정돼요.`);
}

export async function leaveChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "signup") return fail("신청 기간이 끝나서 취소할 수 없어요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("신청 내역이 없어요.");
  await removeMemberRec(live.block.id, u.nick);
  await addLog(live.block.id, { by: u.nick, action: "leave", target: u.nick });
  refresh();
  return ok("신청을 취소했어요. 낸 회비는 돌려드리지 않아요.");
}

/* ---------- 기록 올리기·수정 ---------- */
const FILE_FIELD: Record<ImgKind, string> = { summary: "img_summary", cadence: "img_cadence", zone: "img_zone", map: "img_map" };
const IMG_TYPES = ["image/webp", "image/jpeg", "image/png"];

export async function submitActivityAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 기록을 받는 챌린지가 없어요.");
  const today = kstToday();
  const phase = phaseOf(live.cfg, today);
  if (phase !== "running" && phase !== "upload") return fail("지금은 기록을 올릴 수 있는 기간이 아니에요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("참가 신청한 사람만 기록을 올릴 수 있어요.");

  const actId = str(fd, "actId", 20);
  const existing = actId ? await getActRec(live.block.id, actId) : null;
  if (actId && (!existing || existing.nick !== u.nick)) return fail("수정할 기록을 찾을 수 없어요.");

  const files: Partial<Record<ImgKind, { type: string; data: string }>> = {};
  for (const kind of IMG_KINDS) {
    const f = fd.get(FILE_FIELD[kind]);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!IMG_TYPES.includes(f.type)) return fail("JPG, PNG, WebP 이미지만 올릴 수 있어요.");
    if (f.size > RULE.imageMaxBytes) return fail("캡처 용량이 너무 커요. 다시 골라 주세요.");
    files[kind] = { type: f.type, data: Buffer.from(await f.arrayBuffer()).toString("base64") };
  }

  const dur = [num(fd, "durH"), num(fd, "durM"), num(fd, "durS")].map((n) => n ?? 0);
  const raw: RawInput = {
    startedAt: str(fd, "startedAt", 16),
    distanceKm: num(fd, "distanceKm"),
    durationSec: dur.every((n) => Number.isFinite(n) && n >= 0) ? Math.round(dur[0] * 3600 + dur[1] * 60 + dur[2]) : null,
    surface: str(fd, "surface", 10),
    cadence: num(fd, "cadence"),
    avgHr: num(fd, "avgHr"),
    zone2Pct: num(fd, "zone2Pct"),
    place: str(fd, "place", 60),
  };
  // 수정할 때 선택 항목(케이던스·Zone 2·장소)을 비우고 새 캡처도 없으면 그 항목은 지운 것으로 본다
  const keep = (kind: ImgKind, hasValue: boolean) => !!files[kind] || (hasValue && !!existing?.imgs[kind]);
  const flags = {
    summary: !!files.summary || !!existing?.imgs.summary,
    cadence: keep("cadence", raw.cadence != null),
    zone: keep("zone", raw.zone2Pct != null || raw.avgHr != null),
    map: keep("map", raw.place !== ""),
  };
  const v = validateActivity(raw, flags, live.cfg, today);
  if (!v.ok) return fail(v.msg);

  const mine = (await listActs(live.block.id)).filter((a) => a.nick === u.nick);
  if (mine.some((a) => a.startedAt === v.value.startedAt && a.id !== actId)) return fail("같은 시작 시각의 기록을 이미 올렸어요.");

  const id = existing?.id ?? newId();
  const now = Date.now();
  const imgs: Activity["imgs"] = {};
  for (const kind of IMG_KINDS) if (flags[kind]) imgs[kind] = true;
  for (const kind of IMG_KINDS) if (files[kind]) await putImage(live.block.id, id, kind, files[kind]!);
  for (const kind of IMG_KINDS) if (existing?.imgs[kind] && !imgs[kind]) await delImage(live.block.id, id, kind);
  await saveActRec(live.block.id, { id, nick: u.nick, ...v.value, imgs, status: "pending", createdAt: existing?.createdAt ?? now, updatedAt: now });
  if (existing) await addLog(live.block.id, { by: u.nick, action: "edit", target: `${u.nick}/${id}` });
  refresh();
  return ok(existing ? "수정했어요. 운영진이 다시 확인해요." : "기록을 올렸어요! 운영진이 캡처를 확인해요.");
}

export async function deleteActivityAction(fd: FormData) {
  if (!(await isConfirmed(fd.get("confirmToken")))) return; // 비밀번호 확인 필요
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return;
  const phase = phaseOf(live.cfg, kstToday());
  if (phase !== "running" && phase !== "upload") return;
  const a = await getActRec(live.block.id, str(fd, "actId", 20));
  if (!a || a.nick !== u.nick) return;
  await removeActRec(live.block.id, a.id);
  await addLog(live.block.id, { by: u.nick, action: "delete", target: `${u.nick}/${a.id}` });
  refresh();
}

/* ---------- 이의 제기 ---------- */
export async function fileAppealAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 이의 제기를 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "appeal") return fail("이의 제기 기간이 아니에요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("참가자만 이의 제기를 할 수 있어요.");
  const a = await getActRec(live.block.id, str(fd, "actId", 20));
  if (!a || a.nick !== u.nick) return fail("이의 제기할 기록을 골라 주세요.");
  const reason = str(fd, "reason", 300);
  if (reason.length < 5) return fail("이의 사유를 5자 이상 적어 주세요.");
  if ((await listAppeals(live.block.id)).some((p) => p.actId === a.id && !p.done)) return fail("이 기록은 이미 이의 제기를 접수했어요.");
  const id = newId();
  await saveAppeal(live.block.id, { id, nick: u.nick, actId: a.id, reason, at: Date.now(), done: false });
  await addLog(live.block.id, { by: u.nick, action: "appeal", target: `${u.nick}/${a.id}`, note: reason });
  refresh();
  return ok("이의 제기를 접수했어요. 운영진이 확인하고 답해요.");
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/app/challenge-actions.ts
git commit -m "챌린지 참가자 서버 액션: 신청·취소·기록·삭제·이의 제기"
```

---

### Task 7: 참가자 화면과 이벤트 탭 연결

**Files:**
- Create: `src/components/challenge/activity-form.tsx`
- Create: `src/components/challenge/challenge-view.tsx`
- Create: `src/components/challenge/challenge-banner.tsx`
- Create: `src/app/event/challenge/page.tsx`
- Modify: `src/app/event/page.tsx`

**Interfaces:**
- Consumes: Task 1~6의 규칙·저장소·액션, `PhotoField`(Task 5), `ActionForm`/`ConfirmButton`/`Submit`(`@/components/action-form`), `EventBlock`
- Produces: `ChallengeView({ block, nick, staff })`(서버 컴포넌트), `ChallengeBanner()`(서버 컴포넌트), `ActivityForm({ blockId, start, end, today, initial? })`(클라이언트), 경로 `/event/challenge`

- [ ] **Step 1: 기록 입력 폼 작성**

`src/components/challenge/activity-form.tsx`:

```tsx
"use client";
import { ActionForm, Submit } from "@/components/action-form";
import PhotoField from "@/components/challenge/photo-field";
import { submitActivityAction } from "@/app/challenge-actions";
import { SURFACE_LABEL, type Activity, type Surface } from "@/lib/challenge/rules";

const SECTION = "rounded-lg border border-[var(--line)] p-3";

/** 기록 올리기·수정 폼. 활동 요약 캡처는 필수, 케이던스·Zone 2·장소는 해당할 때만 값과 캡처를 함께 채운다. */
export default function ActivityForm({ blockId, start, end, today, initial }: { blockId: string; start: string; end: string; today: string; initial?: Activity }) {
  const max = today < end ? today : end;
  const dur = initial?.durationSec ?? 0;
  return (
    <ActionForm action={submitActivityAction} keep={!!initial} className="grid gap-3">
      <input type="hidden" name="id" value={blockId} />
      {initial && <input type="hidden" name="actId" value={initial.id} />}
      <label className="field"><span className="label">시작 일시 (한국 시간)</span>
        <input name="startedAt" type="datetime-local" className="input" required min={`${start}T00:00`} max={`${max}T23:59`} defaultValue={initial?.startedAt ?? `${max}T06:00`} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span className="label">거리 (km)</span>
          <input name="distanceKm" inputMode="decimal" className="input" required placeholder="예: 10.05" defaultValue={initial?.distanceKm ?? ""} /></label>
        <label className="field"><span className="label">종류</span>
          <select name="surface" className="input" defaultValue={initial?.surface ?? "road"}>
            {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => <option key={s} value={s}>{SURFACE_LABEL[s]}</option>)}
          </select></label>
      </div>
      <div className="field"><span className="label">시간</span>
        <div className="grid grid-cols-3 gap-2">
          <input name="durH" type="number" min={0} max={23} inputMode="numeric" className="input" placeholder="시" defaultValue={dur ? Math.floor(dur / 3600) : ""} aria-label="시" />
          <input name="durM" type="number" min={0} max={59} inputMode="numeric" className="input" placeholder="분" defaultValue={dur ? Math.floor((dur % 3600) / 60) : ""} aria-label="분" />
          <input name="durS" type="number" min={0} max={59} inputMode="numeric" className="input" placeholder="초" defaultValue={dur ? dur % 60 : ""} aria-label="초" />
        </div>
        <span className="text-xs text-muted">평균 페이스는 거리와 시간으로 자동 계산돼요.</span>
      </div>
      <PhotoField name="img_summary" label="활동 요약 캡처" required hint="날짜·거리·시간이 보이는 화면이에요. 편집한 캡처는 실격이에요." have={!!initial?.imgs.summary} />

      <details className={SECTION} open={initial?.cadence != null}>
        <summary className="font-bold cursor-pointer text-sm">케이던스 부문 (10km 이상 활동)</summary>
        <div className="grid gap-2 pt-2">
          <label className="field"><span className="label">평균 케이던스 (spm)</span>
            <input name="cadence" inputMode="numeric" className="input" placeholder="예: 178" defaultValue={initial?.cadence ?? ""} /></label>
          <PhotoField name="img_cadence" label="케이던스가 보이는 캡처" have={!!initial?.imgs.cadence} />
        </div>
      </details>

      <details className={SECTION} open={initial?.zone2Pct != null}>
        <summary className="font-bold cursor-pointer text-sm">Zone 2 부문 (80% 이상)</summary>
        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="field"><span className="label">Zone 2 체류 비율 (%)</span>
              <input name="zone2Pct" inputMode="numeric" className="input" placeholder="예: 85" defaultValue={initial?.zone2Pct ?? ""} /></label>
            <label className="field"><span className="label">평균 심박</span>
              <input name="avgHr" inputMode="numeric" className="input" placeholder="예: 140" defaultValue={initial?.avgHr ?? ""} /></label>
          </div>
          <PhotoField name="img_zone" label="심박 구간 캡처" hint="존 번호와 비율이 보여야 해요. 본인 기기의 5존 기준이에요." have={!!initial?.imgs.zone} />
        </div>
      </details>

      <details className={SECTION} open={!!initial?.place}>
        <summary className="font-bold cursor-pointer text-sm">다양한 장소 부문 (40분 이상 · 트레드밀 제외)</summary>
        <div className="grid gap-2 pt-2">
          <label className="field"><span className="label">장소 (구 + 공원·코스명)</span>
            <input name="place" className="input" maxLength={40} placeholder="예: 송파구 올림픽공원" defaultValue={initial?.place ?? ""} /></label>
          <PhotoField name="img_map" label="지도(경로) 캡처" hint="출발 지점이 보이는 지도 화면이에요." have={!!initial?.imgs.map} />
        </div>
      </details>

      <div><Submit pendingText="올리는 중…">{initial ? "수정 저장" : "기록 올리기"}</Submit></div>
    </ActionForm>
  );
}
```

- [ ] **Step 2: 참가자 화면 작성**

`src/components/challenge/challenge-view.tsx`:

```tsx
import { kstToday } from "@/lib/hub";
import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import ActivityForm from "@/components/challenge/activity-form";
import { deleteActivityAction, fileAppealAction, joinChallengeAction, leaveChallengeAction } from "@/app/challenge-actions";
import { listActs, listAppeals, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, RULE, SURFACE_LABEL, awardWinners, buildBoard, fmtDate, fmtDur, fmtPace, formatValue, judge, phaseOf,
  type Activity, type Appeal, type Board, type ChallengeConfig, type ChallengeMember, type Phase,
} from "@/lib/challenge/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 참가자용 챌린지 화면: 규정 → 신청 → 내 기록 → 순위 → 시상 → 이의 제기 */
export default async function ChallengeView({ block, nick, staff }: { block: EventBlock; nick: string; staff: boolean }) {
  const cfg = block.challenge as ChallengeConfig;
  const today = kstToday();
  const phase = phaseOf(cfg, today);
  const [members, acts, places, appeals] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), listAppeals(block.id)]);
  const mine = members.find((m) => m.nick === nick);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const live = phase === "running" || phase === "upload";
  const board = buildBoard(acts, paidNicks, cfg, { verifiedOnly: !live, places });
  const myActs = acts.filter((a) => a.nick === nick);
  const awards = today >= cfg.finalAt ? awardWinners(buildBoard(acts, paidNicks, cfg, { verifiedOnly: true, places })) : null;
  const showBoard = phase === "running" || phase === "upload" || phase === "appeal" || phase === "closed";

  return (
    <div className="grid gap-4">
      <section className="panel p-4 grid gap-1">
        <p className="text-xs text-muted">{block.title}</p>
        <h1 className="text-lg font-bold">{fmtDate(cfg.start)} ~ {fmtDate(cfg.end)} 기록 챌린지</h1>
        <p className="text-sm"><span className="chip chip-open">{PHASE_LABEL[phase]}</span></p>
        {staff && <a href="/admin?tab=bingo" className="text-xs text-muted underline">운영진 관리 화면으로</a>}
      </section>

      {mine && !mine.paid && (
        <p className="panel p-3 text-sm">⏳ <b>입금 확인 전이에요.</b> 기록은 올릴 수 있지만, 순위와 수상에는 입금이 확인된 뒤부터 들어가요.</p>
      )}

      <SignupPanel blockId={block.id} cfg={cfg} phase={phase} mine={mine} />

      {mine && (phase === "running" || phase === "upload") && (
        <section className="panel p-4 grid gap-3">
          <h2 className="font-bold">기록 올리기</h2>
          <p className="text-xs text-muted">{fmtDate(cfg.uploadEnd)}까지 올리고 고칠 수 있어요. 올린 캡처는 나와 운영진만 볼 수 있어요.</p>
          <ActivityForm blockId={block.id} start={cfg.start} end={cfg.end} today={today} />
        </section>
      )}

      {mine && myActs.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-bold px-1">내 기록 {myActs.length}건</h2>
          {myActs.map((a) => <MyAct key={a.id} a={a} cfg={cfg} blockId={block.id} today={today} canEdit={live} />)}
        </section>
      )}

      {mine && phase === "appeal" && <AppealPanel blockId={block.id} acts={myActs} appeals={appeals.filter((p) => p.nick === nick)} />}

      {awards && (
        <section className="panel p-4 grid gap-2">
          <h2 className="font-bold">🏆 시상</h2>
          <ul className="grid gap-1 text-sm">
            {awards.map((x) => (
              <li key={x.category} className="flex gap-2"><span className="w-24 text-muted">{CATEGORY_LABEL[x.category]}</span>
                <b>{x.winner ?? (x.tie.length ? `동점 (${x.tie.join(", ")}) — 운영진이 정해요` : "해당자 없음")}</b></li>
            ))}
          </ul>
          <p className="text-xs text-muted">1인 1상이에요. 상품은 위 순서대로 수상자가 고르고, 순위와 상품은 양도할 수 없어요.</p>
        </section>
      )}

      {showBoard && <BoardPanel board={board} acts={acts} me={nick} verifiedOnly={!live} />}

      <FeePanel cfg={cfg} paid={paidNicks.length} />
      <RulesPanel cfg={cfg} open={phase === "soon" || phase === "signup"} />
    </div>
  );
}

function SignupPanel({ blockId, cfg, phase, mine }: { blockId: string; cfg: ChallengeConfig; phase: Phase; mine?: ChallengeMember }) {
  const bank = cfg.bank.bank && cfg.bank.account ? `${cfg.bank.bank} ${cfg.bank.account} (${cfg.bank.holder})` : "입금 계좌는 곧 안내해요";
  if (phase === "signup" && !mine) {
    return (
      <section className="panel p-4 grid gap-3">
        <h2 className="font-bold">참가 신청 <span className="text-xs text-muted font-normal">{fmtDate(cfg.signupEnd)} 23:59까지</span></h2>
        <p className="text-sm">회비 <b>{won(cfg.fee)}</b> · {bank}</p>
        <p className="text-sm text-[var(--bad)]">회비는 신청을 취소하거나 중간에 그만두어도 환불되지 않아요.</p>
        <ActionForm action={joinChallengeAction} keep alertError className="grid gap-3">
          <input type="hidden" name="id" value={blockId} />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" className="mt-1" /> 아래 규정을 모두 읽었고, 회비 환불이 없다는 점에 동의해요.</label>
          <div><Submit pendingText="신청 중…">참가 신청하기</Submit></div>
        </ActionForm>
      </section>
    );
  }
  if (phase === "signup" && mine) {
    return (
      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">✅ 신청 완료 {mine.paid ? <span className="chip chip-confirmed">입금 확인됨</span> : <span className="chip chip-warn">입금 확인 전</span>}</h2>
        {!mine.paid && <p className="text-sm">회비 <b>{won(cfg.fee)}</b>을 입금해 주세요 · {bank}</p>}
        <ActionForm action={leaveChallengeAction} keep alertError className="flex">
          <input type="hidden" name="id" value={blockId} />
          <Submit className="btn btn-ghost btn-danger text-sm" confirm="신청을 취소할까요? 낸 회비는 돌려받을 수 없어요.">신청 취소 (환불 없음)</Submit>
        </ActionForm>
      </section>
    );
  }
  if (phase === "soon") return <section className="panel p-4 text-sm">{fmtDate(cfg.signupStart)}부터 신청을 받아요.</section>;
  if (!mine) return <section className="panel p-4 text-sm">신청 기간이 끝나서 이번 챌린지에는 참가할 수 없어요. 순위는 구경할 수 있어요.</section>;
  return null;
}

function MyAct({ a, cfg, blockId, today, canEdit }: { a: Activity; cfg: ChallengeConfig; blockId: string; today: string; canEdit: boolean }) {
  const j = judge(a, cfg);
  const chip = a.status === "ok" ? <span className="chip chip-confirmed">인정</span> : a.status === "rejected" ? <span className="chip chip-failed">반려</span> : <span className="chip chip-warn">검수 전</span>;
  return (
    <div className="panel p-3 grid gap-2">
      <div className="flex items-center gap-2">
        <b className="num">{a.startedAt.replace("T", " ")}</b>{chip}
        <span className="ml-auto text-xs text-muted">{SURFACE_LABEL[a.surface]}</span>
      </div>
      <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}%` : ""}{a.place ? ` · ${a.place}` : ""}</p>
      {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
      <div className="flex gap-2 flex-wrap">
        {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => (
          <a key={k} href={`/api/challenge/${blockId}/${a.id}/${k}?v=${a.updatedAt}`} target="_blank" rel="noreferrer" className="text-xs underline">{IMG_LABEL[k]} 캡처</a>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2 items-start">
          <details className="grow"><summary className="btn btn-ghost text-sm cursor-pointer inline-flex">수정</summary>
            <div className="pt-3"><ActivityForm blockId={blockId} start={cfg.start} end={cfg.end} today={today} initial={a} /></div></details>
          <form action={deleteActivityAction}>
            <input type="hidden" name="id" value={blockId} /><input type="hidden" name="actId" value={a.id} />
            <ConfirmButton message={"이 기록을 삭제할까요?\n되돌릴 수 없어요."}>삭제</ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

function BoardPanel({ board, acts, me, verifiedOnly }: { board: Board; acts: Activity[]; me: string; verifiedOnly: boolean }) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="font-bold">부문별 순위 <span className="text-xs text-muted font-normal">{verifiedOnly ? "검수 완료 기록 기준" : "잠정 · 검수 전 기록 포함"}</span></h2>
      {CATEGORIES.map((c) => (
        <div key={c} className="grid gap-1">
          <h3 className="text-sm font-bold">{CATEGORY_LABEL[c]}</h3>
          {board[c].length === 0 ? <p className="text-sm text-muted">아직 기록이 없어요.</p> : (
            <ol className="grid gap-1 text-sm">
              {board[c].map((e) => (
                <li key={e.nick} className={`flex items-center gap-2 ${e.nick === me ? "font-bold" : ""}`}>
                  <span className="num w-6 text-muted">{e.rank}</span><span className="truncate">{e.nick}</span>
                  <span className="ml-auto num">{formatValue(c, e.value)}</span>
                  {e.actIds.some((id) => byId.get(id)?.status === "pending") && <span className="chip chip-warn">검수 전</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

function AppealPanel({ blockId, acts, appeals }: { blockId: string; acts: Activity[]; appeals: Appeal[] }) {
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="font-bold">이의 제기</h2>
      {acts.length === 0 ? <p className="text-sm text-muted">이의 제기할 기록이 없어요.</p> : (
        <ActionForm action={fileAppealAction} className="grid gap-2">
          <input type="hidden" name="id" value={blockId} />
          <label className="field"><span className="label">기록</span>
            <select name="actId" className="input">{acts.map((a) => <option key={a.id} value={a.id}>{a.startedAt.replace("T", " ")} · {a.distanceKm.toFixed(2)}km</option>)}</select></label>
          <label className="field"><span className="label">사유</span><textarea name="reason" className="input" rows={3} maxLength={300} required /></label>
          <div><Submit>이의 제기하기</Submit></div>
        </ActionForm>
      )}
      {appeals.map((p) => (
        <div key={p.id} className="text-sm border-t border-[var(--line)] pt-2">
          <p>{p.reason}</p>
          <p className="text-xs text-muted">{p.done ? `답변: ${p.answer}` : "운영진이 확인 중이에요."}</p>
        </div>
      ))}
    </section>
  );
}

function FeePanel({ cfg, paid }: { cfg: ChallengeConfig; paid: number }) {
  return (
    <section className="panel p-4 grid gap-1 text-sm">
      <h2 className="font-bold">회비와 상품</h2>
      <p>모인 회비 <b>{won(cfg.fee * paid)}</b> ({paid}명 입금 확인)</p>
      <p>상품(예정, 변경될 수 있어요): {cfg.prizes.join(" · ") || "곧 안내해요"}</p>
      {cfg.spendNote && <p className="whitespace-pre-line text-muted">{cfg.spendNote}</p>}
    </section>
  );
}

function RulesPanel({ cfg, open }: { cfg: ChallengeConfig; open: boolean }) {
  const li = "list-disc ml-5";
  return (
    <details className="panel p-4" open={open}>
      <summary className="font-bold cursor-pointer">규정 전문</summary>
      <div className="grid gap-3 pt-3 text-sm">
        <ul className="grid gap-1">
          <li className={li}>기간: {fmtDate(cfg.start)} ~ {fmtDate(cfg.end)}. 하루는 활동 <b>시작 시각 기준 한국 날짜</b>예요.</li>
          <li className={li}>모든 활동에는 <b>활동 요약 캡처가 필수</b>예요. 편집한 캡처는 실격이고, 운영진이 요청하면 원본을 내야 해요.</li>
          <li className={li}>인정 활동은 <b>평균 페이스가 km당 8:00 이내(8:00 포함, 더 빠른 것)</b>예요. 페이스는 거리와 시간으로 자동 계산하고 초 아래는 버려요. 느린 활동은 거리·시간·5km·케이던스·장소에서 통째로 빠져요(Zone 2만 예외). 로드·트레드밀·트랙 모두 가능해요.</li>
        </ul>
        <div className="grid gap-1">
          <b>부문 (1인 1상, 아래 순서로 확정)</b>
          <ol className="grid gap-1 list-decimal ml-5">
            <li>거리: 인정 활동 거리 합계가 가장 긴 사람</li>
            <li>최장시간: 인정 활동 시간(기록 시간) 합계가 가장 긴 사람</li>
            <li>케이던스: 10km 이상 활동 1건의 평균 케이던스가 가장 높은 사람(합산 없음, 케이던스 캡처 필수)</li>
            <li>Zone 2: Zone 2 체류 비율 {RULE.zone2MinPct}% 이상인 활동 1건의 거리가 가장 긴 사람(합산 없음, 8분 규칙 면제, 평균 심박과 심박 구간 캡처 필수)</li>
            <li>다양한 장소: 40분 이상 활동의 서로 다른 장소 수가 가장 많은 사람(트레드밀 제외, 장소 입력과 지도 캡처 필수). 같은 장소 판단은 운영진이 하고, 묶은 결과(장소 정리표)는 공개해요.</li>
            <li>5km: 하루 인정 활동 거리 합이 5.00km 이상인 날이 가장 많은 사람(연속 아님, 하루에 나눠 뛰어도 합산)</li>
          </ol>
        </div>
        <ul className="grid gap-1">
          <li className={li}>동률이면 근거 활동의 평균 페이스가 빠른 사람, 그래도 같으면 마지막 인정 기록의 시작 시각이 빠른 사람이 이겨요. 완전히 같으면 공동으로 표시하고 운영진이 정해요.</li>
          <li className={li}>한 사람이 여러 부문 1등이면 앞 부문 하나만 받고, 뒤 부문은 차순위가 올라와요. 상품은 확정 순서대로 수상자가 골라요. 순위와 상품은 양도할 수 없어요.</li>
          <li className={li}>회비 {won(cfg.fee)}은 환불되지 않아요. 순위와 수상에는 입금이 확인된 참가자만 들어가요.</li>
          <li className={li}>일정: 신청 {fmtDate(cfg.signupStart)}~{fmtDate(cfg.signupEnd)} · 기록 올리기·수정 {fmtDate(cfg.uploadEnd)}까지 · 이의 제기 {fmtDate(cfg.appealEnd)}까지 · 최종 확정 {fmtDate(cfg.finalAt)}</li>
          <li className={li}>운영진도 참가할 수 있고, 운영진 본인의 기록은 다른 운영진이 검수해요. 모든 판정 변경은 사유와 함께 기록으로 남아요.</li>
          <li className={li}>규정은 신청 마감 전에 확정하고, 신청하면 동의한 것으로 봐요. 이후에는 오타 외에 바꾸지 않아요.</li>
        </ul>
      </div>
    </details>
  );
}
```

- [ ] **Step 3: 배너와 전용 경로 작성**

`src/components/challenge/challenge-banner.tsx`:

```tsx
import Link from "next/link";
import { kstToday } from "@/lib/hub";
import { activeChallenge, displayBlock } from "@/lib/event-blocks";
import { fmtDate, phaseOf } from "@/lib/challenge/rules";

/** 이벤트 탭 위에 붙는 챌린지 안내 띠. 이벤트 탭 본문이 이미 챌린지이면 보이지 않는다. */
export default async function ChallengeBanner() {
  const [chal, shown] = await Promise.all([activeChallenge(), displayBlock()]);
  if (!chal?.challenge || shown?.id === chal.id) return null;
  const cfg = chal.challenge;
  const phase = phaseOf(cfg, kstToday());
  const text = phase === "signup" ? `${chal.title} · ${fmtDate(cfg.signupEnd)}까지 신청 받아요` : phase === "running" || phase === "upload" ? `${chal.title} · 기록 올리기` : `${chal.title} · 순위·결과 보기`;
  return (
    <Link href="/event/challenge" className="flex items-center justify-between gap-2 px-4 py-2 text-sm font-bold" style={{ background: "#c9a965", color: "#17120a" }}>
      <span className="truncate">🏃 {text}</span><span aria-hidden>›</span>
    </Link>
  );
}
```

`src/app/event/challenge/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/hub";
import { eventHidden } from "@/lib/event";
import { activeChallenge } from "@/lib/event-blocks";
import ChallengeView from "@/components/challenge/challenge-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "기록 챌린지" };

export default async function ChallengePage() {
  const u = await currentUser();
  if (!u) redirect("/login");
  const block = await activeChallenge();
  // 운영진이 이벤트를 숨겨 둔 동안에는 크루원이 직접 주소로 들어와도 이벤트 탭의 안내 화면으로 보낸다
  if (!block || (!u.admin && (await eventHidden()))) redirect("/event");
  return <main className="hub-wrap"><ChallengeView block={block} nick={u.nick} staff={u.admin} /></main>;
}
```

- [ ] **Step 4: 이벤트 탭 연결**

`src/app/event/page.tsx`를 수정한다.

(a) import 추가:

```tsx
import ChallengeBanner from "@/components/challenge/challenge-banner";
import ChallengeView from "@/components/challenge/challenge-view";
```

(b) `EventPage`에서 숨김 안내 반환과 `!block` 반환에 배너를 붙이고, 챌린지 블록 분기를 추가한다. `if (hidden && !u?.admin) return ...` 줄부터 `if (block.type === "poll") return ...` 줄까지(사이의 `// 운영진은 위에 작은 바가 붙는다` 주석과 `const bar = ...` 줄 포함)를 아래 내용 전체로 바꾼다.

```tsx
  if (hidden && !u?.admin) return <><ChallengeBanner /><Message emoji="🎁" title="이벤트 기대해주세요" sub="새로운 이벤트가 곧 열려요." soon /></>;
  // 운영진은 위에 작은 바가 붙는다: 블록 바꾸기 · 참가 신청 · 이벤트 설정으로 가기
  const bar = u?.admin ? await AdminBar({ block, nick: u.nick, hidden }) : null;
  if (!block) return <>{bar}<ChallengeBanner /><Message emoji="🎁" title="이벤트 기대해주세요" sub="새로운 이벤트가 곧 열려요." soon /></>;
  // 12월 기록 챌린지가 이벤트 탭 본문으로 세팅돼 있으면 챌린지 화면을 그대로 보여 준다
  if (block.type === "challenge") {
    if (!u) redirect("/login");
    return <>{bar}<main className="hub-wrap"><ChallengeView block={block} nick={u.nick} staff={u.admin} /></main></>;
  }
  if (block.type === "poll") return <>{bar}<ChallengeBanner /><Poll block={block} nick={u?.nick} /></>;
```

(c) 빙고 화면(`Shell`)에도 배너를 붙인다. `Shell` 반환의 `{bar}` 바로 아래에 한 줄 추가:

```tsx
      {bar}
      <ChallengeBanner />
      {children}
```

- [ ] **Step 5: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/components/challenge src/app/event
git commit -m "챌린지 참가자 화면: 규정·신청·기록·순위·시상·이의 제기, 이벤트 탭 배너"
```

---

### Task 8: 운영진 액션·화면과 블록 만들기

**Files:**
- Modify: `src/app/challenge-actions.ts` (운영진 액션 추가, import 수정)
- Create: `src/components/challenge/challenge-admin.tsx`
- Modify: `src/app/actions.ts` (`createEventBlock`)
- Modify: `src/app/admin/page.tsx` (블록 만들기 폼, 이벤트 탭 삽입)

**Interfaces:**
- Consumes: Task 1~7 전체, `setChallengeConfig`, `getBlocks`(event-blocks), `validateConfig`, `placeKey`
- Produces: `setPaidAction(fd)`, `reviewActivityAction(_, fd)`, `setPlaceGroupAction(_, fd)`, `resolveAppealAction(_, fd)`, `saveChallengeConfigAction(_, fd)`, 컴포넌트 `ChallengeAdmin({ block })`

- [ ] **Step 1: 운영진 액션 추가**

`src/app/challenge-actions.ts`의 import 블록을 아래로 바꾼다.

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, kstToday, newId } from "@/lib/hub";
import { isConfirmed, CONFIRM_REQUIRED } from "@/lib/confirm-token";
import { activeChallenge, getBlocks, setChallengeConfig } from "@/lib/event-blocks";
import {
  addLog, delImage, getActRec, getAppeal, getMemberRec, listActs, listAppeals, putImage, removeActRec, removeMemberRec, saveActRec, saveAppeal, saveMemberRec, setPlaceGroup,
} from "@/lib/challenge/store";
import { IMG_KINDS, RULE, phaseOf, placeKey, validateActivity, validateConfig, type ActStatus, type Activity, type ChallengeConfig, type ImgKind, type RawInput } from "@/lib/challenge/rules";
import type { Result } from "@/app/actions";
```

파일 끝에 추가한다.

```ts
/* ====================== 운영진 ====================== */
async function staff() {
  const u = await me();
  if (!u.admin) throw new Error("운영진만 할 수 있어요.");
  return u;
}
async function challengeBlock(id: string) {
  const b = (await getBlocks()).find((x) => x.id === id && x.type === "challenge" && x.challenge);
  if (!b) throw new Error("챌린지를 찾을 수 없어요.");
  return b;
}

/** 입금 확인·취소 */
export async function setPaidAction(fd: FormData) {
  const u = await staff();
  const blockId = str(fd, "id", 20), nick = str(fd, "nick", 30);
  const m = await getMemberRec(blockId, nick);
  if (!m) return;
  const paid = fd.get("paid") === "1";
  await saveMemberRec(blockId, { ...m, paid, ...(paid ? { paidAt: Date.now(), paidBy: u.nick } : { paidAt: undefined, paidBy: undefined }) });
  await addLog(blockId, { by: u.nick, action: paid ? "paid" : "unpaid", target: nick });
  refresh();
}

/** 기록 승인·반려. 본인 기록은 다른 운영진이 검수한다. */
export async function reviewActivityAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "id", 20), decision = str(fd, "decision", 10), reason = str(fd, "reason", 200);
  const a = await getActRec(blockId, str(fd, "actId", 20));
  if (!a) return fail("기록을 찾을 수 없어요.");
  if (a.nick === u.nick) return fail("본인 기록은 다른 운영진이 검수해요.");
  if (decision !== "ok" && decision !== "rejected") return fail("승인 또는 반려를 골라 주세요.");
  if (decision === "rejected" && reason.length < 2) return fail("반려 사유를 적어 주세요.");
  await saveActRec(blockId, { ...a, status: decision as ActStatus, rejectReason: decision === "rejected" ? reason : undefined, reviewedBy: u.nick, reviewedAt: Date.now() });
  await addLog(blockId, { by: u.nick, action: decision === "ok" ? "approve" : "reject", target: `${a.nick}/${a.id}`, note: reason || undefined });
  refresh();
  return ok(decision === "ok" ? "승인했어요." : "반려했어요. 참가자 화면에 사유가 보여요.");
}

/** 장소 정리표: 입력된 장소를 묶음 이름으로 묶는다(비우면 묶음 해제) */
export async function setPlaceGroupAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "id", 20), raw = str(fd, "raw", 60), label = str(fd, "label", 40);
  if (!raw) return fail("장소를 찾을 수 없어요.");
  await setPlaceGroup(blockId, placeKey(raw), label || null);
  await addLog(blockId, { by: u.nick, action: "place-group", target: raw, note: label || "묶음 해제" });
  refresh();
  return ok(label ? `‘${raw}’를 ‘${label}’ 장소로 묶었어요.` : "묶음을 풀었어요.");
}

export async function resolveAppealAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "id", 20), answer = str(fd, "answer", 300);
  const p = await getAppeal(blockId, str(fd, "appealId", 20));
  if (!p) return fail("이의 제기를 찾을 수 없어요.");
  if (answer.length < 2) return fail("답변을 적어 주세요.");
  await saveAppeal(blockId, { ...p, done: true, answer, answeredBy: u.nick, answeredAt: Date.now() });
  await addLog(blockId, { by: u.nick, action: "appeal-answer", target: `${p.nick}/${p.actId}`, note: answer });
  refresh();
  return ok("답변했어요.");
}

/** 챌린지 설정 저장(기간·회비·계좌·상품). 규정이 바뀌는 일이라 비밀번호 확인이 필요하고 로그를 남긴다. */
export async function saveChallengeConfigAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  if (!(await isConfirmed(fd.get("confirmToken")))) return fail(CONFIRM_REQUIRED);
  const b = await challengeBlock(str(fd, "id", 20));
  const cfg: ChallengeConfig = {
    fee: Number(str(fd, "fee", 8)),
    bank: { bank: str(fd, "bank", 20), account: str(fd, "account", 30), holder: str(fd, "holder", 20) },
    signupStart: str(fd, "signupStart", 10), signupEnd: str(fd, "signupEnd", 10),
    start: str(fd, "start", 10), end: str(fd, "end", 10),
    uploadEnd: str(fd, "uploadEnd", 10), appealEnd: str(fd, "appealEnd", 10), finalAt: str(fd, "finalAt", 10),
    prizes: String(fd.get("prizes") ?? "").split("\n").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
    spendNote: str(fd, "spendNote", 500),
  };
  const bad = validateConfig(cfg);
  if (bad) return fail(bad);
  await setChallengeConfig(b.id, cfg);
  await addLog(b.id, { by: u.nick, action: "config", target: b.title });
  revalidatePath("/", "layout");
  return ok("챌린지 설정을 저장했어요.");
}
```

- [ ] **Step 2: 블록 만들기에 챌린지 종류 추가**

`src/app/actions.ts`의 `createEventBlock`을 수정한다.

(a) import 줄(`@/lib/event-blocks` 줄) 아래에 추가:

```ts
import { DEFAULT_CONFIG } from "@/lib/challenge/rules";
```

(b) 함수 안의 `const type = ...` 줄과 `await createBlock(...)` 줄을 아래로 바꾼다.

```ts
  const t = str(fd, "type", 10);
  const type = t === "poll" ? "poll" : t === "challenge" ? "challenge" : "bingo";
```

```ts
  const challenge = type === "challenge"
    ? { ...DEFAULT_CONFIG, bank: { bank: str(fd, "bank", 20), account: str(fd, "account", 30), holder: str(fd, "holder", 20) },
        prizes: String(fd.get("prizes") ?? "").split("\n").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12) }
    : undefined;
  await createBlock({ type, title, ym, by: u.nick, ...(poll ? { poll } : {}), ...(challenge ? { challenge } : {}) });
```

(c) 성공 문구 아래 `return ok(...)` 앞에 챌린지 안내를 덧붙이지 않아도 된다. (기존 문구 유지)

- [ ] **Step 3: 운영진 화면 작성**

`src/components/challenge/challenge-admin.tsx`:

```tsx
import { currentUser, kstToday } from "@/lib/hub";
import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { resolveAppealAction, reviewActivityAction, saveChallengeConfigAction, setPaidAction, setPlaceGroupAction } from "@/app/challenge-actions";
import { listActs, listAppeals, listLog, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, SURFACE_LABEL, awardWinners, buildBoard, fmtDur, fmtPace, judge, phaseOf, placeKey,
  type Activity, type ChallengeConfig,
} from "@/lib/challenge/rules";

const when = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
const rankOf = (a: Activity, top: Set<string>) => (a.status === "pending" ? (top.has(a.id) ? 0 : 1) : a.status === "ok" ? 2 : 3);

/** 운영진용 챌린지 관리: 설정 → 입금 → 검수 → 장소 정리표 → 이의 제기 → 결과 미리보기 → 로그 */
export default async function ChallengeAdmin({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  const me = (await currentUser())?.nick ?? "";
  const phase = phaseOf(cfg, kstToday());
  const [members, acts, places, appeals, log] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), listAppeals(block.id), listLog(block.id)]);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const liveBoard = buildBoard(acts, paidNicks, cfg, { verifiedOnly: false, places });
  // 각 부문 상위 3위 후보의 근거 활동은 캡처를 전수 확인한다
  const top = new Set<string>();
  for (const c of CATEGORIES) for (const e of liveBoard[c].filter((x) => x.rank <= 3)) e.actIds.forEach((id) => top.add(id));
  const dup = new Map<string, number>();
  for (const a of acts) { const key = `${a.startedAt}|${a.distanceKm}|${a.durationSec}`; dup.set(key, (dup.get(key) ?? 0) + 1); }
  const queue = [...acts].sort((a, b) => rankOf(a, top) - rankOf(b, top) || b.startedAt.localeCompare(a.startedAt));
  const pending = acts.filter((a) => a.status === "pending").length;
  const placeList = new Map<string, { label: string; n: number }>();
  for (const a of acts) if (a.place) { const k = placeKey(a.place); placeList.set(k, { label: placeList.get(k)?.label ?? a.place, n: (placeList.get(k)?.n ?? 0) + 1 }); }
  const awards = awardWinners(buildBoard(acts, paidNicks, cfg, { verifiedOnly: true, places }));
  const openAppeals = appeals.filter((p) => !p.done);

  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-1">
        <h2 className="font-bold">{block.title} <span className="chip chip-open">{PHASE_LABEL[phase]}</span></h2>
        <p className="text-sm text-muted">신청 {members.length}명 · 입금 확인 {paidNicks.length}명 · 기록 {acts.length}건(검수 전 {pending}건) · 이의 제기 {openAppeals.length}건 대기</p>
      </div>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">설정 (기간·회비·계좌·상품)</summary>
        <ActionForm action={saveChallengeConfigAction} keep className="grid gap-2 pt-3">
          <input type="hidden" name="id" value={block.id} />
          <p className="text-xs text-muted">규정은 신청 마감 전에 확정하세요. 신청이 시작된 뒤 바꾸면 분쟁이 생길 수 있어서 비밀번호 확인 후 저장되고, 기록으로 남아요.</p>
          <div className="grid grid-cols-2 gap-2">
            {([["signupStart", "신청 시작"], ["signupEnd", "신청 마감"], ["start", "기록 시작"], ["end", "기록 종료"], ["uploadEnd", "업로드 마감"], ["appealEnd", "이의 제기 마감"], ["finalAt", "최종 확정"]] as const).map(([k, l]) => (
              <label key={k} className="field"><span className="label">{l}</span><input name={k} type="date" className="input" defaultValue={cfg[k]} required /></label>
            ))}
            <label className="field"><span className="label">회비(원)</span><input name="fee" type="number" min={0} className="input" defaultValue={cfg.fee} required /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="field"><span className="label">은행</span><input name="bank" className="input" defaultValue={cfg.bank.bank} /></label>
            <label className="field"><span className="label">계좌번호</span><input name="account" className="input" defaultValue={cfg.bank.account} /></label>
            <label className="field"><span className="label">예금주</span><input name="holder" className="input" defaultValue={cfg.bank.holder} /></label>
          </div>
          <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={5} defaultValue={cfg.prizes.join("\n")} /></label>
          <label className="field"><span className="label">회비 사용 내역 (참가자에게 공개)</span><textarea name="spendNote" className="input" rows={3} maxLength={500} defaultValue={cfg.spendNote} /></label>
          <div><ConfirmButton className="btn btn-primary" message={"챌린지 설정을 저장할까요?\n기간·회비·상품이 참가자 화면에 바로 반영돼요."}>저장</ConfirmButton></div>
        </ActionForm>
      </details>

      <details className="panel p-4" open={paidNicks.length < members.length}>
        <summary className="font-bold cursor-pointer">참가자·입금 ({paidNicks.length}/{members.length})</summary>
        <div className="grid gap-2 pt-3">
          {members.length === 0 && <p className="text-sm text-muted">아직 신청한 사람이 없어요.</p>}
          {members.map((m) => (
            <form key={m.nick} action={setPaidAction} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={block.id} /><input type="hidden" name="nick" value={m.nick} />
              <b className="truncate">{m.nick}</b><span className="text-xs text-muted">{when(m.appliedAt)} 신청 · 동의 {when(m.agreedAt)}</span>
              <input type="hidden" name="paid" value={m.paid ? "0" : "1"} />
              <button className={`btn text-xs py-1 px-2.5 ml-auto ${m.paid ? "" : "btn-primary"}`}>{m.paid ? "입금 확인됨 (취소)" : "입금 확인"}</button>
            </form>
          ))}
        </div>
      </details>

      <details className="panel p-4" open>
        <summary className="font-bold cursor-pointer">기록 검수 ({pending}건 대기 / 전체 {acts.length}건)</summary>
        <p className="text-sm text-muted pt-2">각 부문 상위 3위 후보의 근거 기록은 ‘상위 후보’로 먼저 보여요. 캡처를 열어 날짜·거리·시간이 입력과 같은지 확인하세요. 본인 기록은 검수할 수 없어요.</p>
        <div className="grid gap-3 pt-3">
          {queue.map((a) => {
            const j = judge(a, cfg);
            const same = dup.get(`${a.startedAt}|${a.distanceKm}|${a.durationSec}`) ?? 0;
            return (
              <div key={a.id} className="grid gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <b>{a.nick}</b><span className="num text-sm">{a.startedAt.replace("T", " ")}</span>
                  {top.has(a.id) && <span className="chip chip-hot">상위 후보</span>}
                  {same > 1 && <span className="chip chip-failed">같은 기록 {same}건</span>}
                  <span className={`chip ml-auto ${a.status === "ok" ? "chip-confirmed" : a.status === "rejected" ? "chip-failed" : "chip-warn"}`}>{a.status === "ok" ? "인정" : a.status === "rejected" ? "반려" : "검수 전"}</span>
                </div>
                <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km · {SURFACE_LABEL[a.surface]}{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}% · 심박 ${a.avgHr}` : ""}{a.place ? ` · ${a.place}` : ""}</p>
                {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
                {a.status === "rejected" && a.rejectReason && <p className="text-xs text-muted">반려 사유: {a.rejectReason}</p>}
                <div className="flex gap-2 flex-wrap">
                  {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => (
                    <a key={k} href={`/api/challenge/${block.id}/${a.id}/${k}?v=${a.updatedAt}`} target="_blank" rel="noreferrer" className="text-xs underline">{IMG_LABEL[k]} 캡처 열기</a>
                  ))}
                </div>
                {a.nick !== me && (
                  <ActionForm action={reviewActivityAction} keep hideInline className="flex gap-2 items-center flex-wrap">
                    <input type="hidden" name="id" value={block.id} /><input type="hidden" name="actId" value={a.id} />
                    <input name="reason" className="input grow" placeholder="반려 사유 (반려할 때만)" maxLength={200} />
                    <button name="decision" value="ok" className="btn btn-primary text-sm py-1 px-3">승인</button>
                    <button name="decision" value="rejected" className="btn btn-ghost btn-danger text-sm py-1 px-3">반려</button>
                  </ActionForm>
                )}
              </div>
            );
          })}
          {queue.length === 0 && <p className="text-sm text-muted">아직 올라온 기록이 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">장소 정리표 ({placeList.size}곳)</summary>
        <p className="text-sm text-muted pt-2">같은 장소로 볼 입력을 한 이름으로 묶으세요. 기준: 지도 캡처상 출발 지점이 3km 이상 떨어져 있으면 다른 장소예요. 묶음 이름을 비우면 묶음이 풀려요.</p>
        <div className="grid gap-2 pt-3">
          {[...placeList.entries()].map(([k, v]) => (
            <ActionForm key={k} action={setPlaceGroupAction} keep hideInline className="flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={block.id} /><input type="hidden" name="raw" value={v.label} />
              <span className="truncate">{v.label} <span className="text-muted">({v.n}건)</span></span>
              <input name="label" className="input ml-auto" style={{ maxWidth: 160 }} placeholder="묶음 이름" maxLength={40} defaultValue={places[k] ?? ""} />
              <Submit className="btn text-xs py-1 px-2.5" pendingText="…">저장</Submit>
            </ActionForm>
          ))}
          {placeList.size === 0 && <p className="text-sm text-muted">입력된 장소가 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4" open={openAppeals.length > 0}>
        <summary className="font-bold cursor-pointer">이의 제기 ({openAppeals.length}건 대기 / 전체 {appeals.length}건)</summary>
        <div className="grid gap-3 pt-3">
          {appeals.map((p) => (
            <div key={p.id} className="grid gap-1 border-t border-[var(--line)] pt-2 first:border-0 first:pt-0 text-sm">
              <p><b>{p.nick}</b> <span className="text-xs text-muted">{when(p.at)} · 기록 {p.actId}</span></p>
              <p>{p.reason}</p>
              {p.done ? <p className="text-xs text-muted">답변({p.answeredBy}): {p.answer}</p> : (
                <ActionForm action={resolveAppealAction} keep hideInline className="flex gap-2">
                  <input type="hidden" name="id" value={block.id} /><input type="hidden" name="appealId" value={p.id} />
                  <input name="answer" className="input grow" placeholder="답변" maxLength={300} required />
                  <Submit className="btn btn-primary text-sm py-1 px-3" pendingText="…">답변</Submit>
                </ActionForm>
              )}
            </div>
          ))}
          {appeals.length === 0 && <p className="text-sm text-muted">접수된 이의 제기가 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">결과 미리보기 (검수 완료 기준 · 1인 1상)</summary>
        <ul className="grid gap-1 pt-3 text-sm">
          {awards.map((x) => (
            <li key={x.category} className="flex gap-2"><span className="w-24 text-muted">{CATEGORY_LABEL[x.category]}</span>
              <b>{x.winner ?? (x.tie.length ? `동점 (${x.tie.join(", ")}) — 운영진이 정해 주세요` : "해당자 없음")}</b></li>
          ))}
        </ul>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">처리 기록 (최근 50건)</summary>
        <ul className="grid gap-1 pt-3 text-xs text-muted">
          {log.map((l, i) => <li key={i}>{when(l.at)} · {l.by} · {l.action} · {l.target}{l.note ? ` · ${l.note}` : ""}</li>)}
          {log.length === 0 && <li>아직 기록이 없어요.</li>}
        </ul>
      </details>
    </section>
  );
}
```

- [ ] **Step 4: 관리 화면에 삽입**

`src/app/admin/page.tsx`를 수정한다.

(a) import 추가(다른 `@/components` import 옆):

```tsx
import ChallengeAdmin from "@/components/challenge/challenge-admin";
```

(b) `Events()` 안, `{/* 인증 확인: ...` 주석 블록 **바로 위**에 추가:

```tsx
      {blocks.filter((b) => b.type === "challenge" && b.challenge).map((b) => <ChallengeAdmin key={b.id} block={b} />)}

```

(c) 블록 만들기 폼의 종류 선택과 입력칸을 바꾼다. 기존 `<select name="type" ...>` 줄을 아래로 바꾸고, 선택지 `<label>` 아래(`<div><Submit>블록 만들기</Submit></div>` 위)에 챌린지용 입력칸을 추가한다.

```tsx
              <select name="type" className="input" defaultValue="bingo"><option value="bingo">빙고</option><option value="poll">투표·설문</option><option value="challenge">기록 챌린지</option></select></label>
```

```tsx
          <div className="grid grid-cols-3 gap-2">
            <label className="field"><span className="label">은행 (챌린지일 때)</span><input name="bank" className="input" maxLength={20} /></label>
            <label className="field"><span className="label">계좌번호</span><input name="account" className="input" maxLength={30} /></label>
            <label className="field"><span className="label">예금주</span><input name="holder" className="input" maxLength={20} /></label>
          </div>
          <label className="field"><span className="label">상품 예정 (챌린지일 때, 한 줄에 하나)</span><textarea name="prizes" className="input" rows={4} defaultValue={"넥워머\n카프슬리브\n오스무브 모자\n데카르트 장갑"} /></label>
```

(d) 블록 목록의 설명 줄(`{BLOCK_TYPES[b.type]}{b.poll ? ...}`)은 그대로 둔다. 삭제 버튼은 이미 `removeEventBlock`(Task 4에서 챌린지 데이터도 지움)을 쓴다.

- [ ] **Step 5: 타입·린트·전체 테스트**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 모두 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/app/challenge-actions.ts src/components/challenge/challenge-admin.tsx src/app/actions.ts src/app/admin/page.tsx
git commit -m "챌린지 운영진 화면: 설정·입금·검수·장소 정리표·이의 제기·결과 미리보기"
```

---

### Task 9: 기획서 반영과 처음부터 끝까지 확인

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-december-challenge-design.md`

**Interfaces:**
- Consumes: Task 1~8 전체
- Produces: 구현과 일치하는 기획서, 확인 결과 보고

- [ ] **Step 1: 기획서에 구현 중 정해진 규칙 반영**

(a) `docs/superpowers/specs/2026-11-20-december-challenge-design.md`의 문장
`평균 페이스는 입력하지 않고 거리÷시간으로 계산한다.`
을 아래로 바꾼다.
`평균 페이스는 입력하지 않고 거리÷시간으로 계산하며, 초 아래는 버린다(예: 8:00.8은 8:00).`

(b) 문장 `- **동률:** ...` 줄 끝에 이어 붙인다.
` 세 기준이 모두 같으면 공동 순위로 표시하고 운영진이 별도로 정한다.`

(c) §4 신청과 회비의 첫 줄 `- 신청하고 회비 5,000원 입금이 확인된 사람만 참가한다.` 아래에 한 줄 추가한다.
`- 입금 확인 전에도 기록은 올릴 수 있지만, 순위와 수상에는 입금이 확인된 사람만 포함한다. 신청 취소는 신청 기간 안에만 가능하고 환불은 없다.`

(d) §8의 첫 항목 `- 이벤트 블록(...)에 "챌린지" 종류를 추가한다. ...` 줄 전체를 아래로 바꾼다.
`- 이벤트 블록(\`src/lib/event-blocks.ts\`)에 "챌린지" 종류를 추가한다. 신청 기간(11/24~)이 11월 빙고 기간과 겹쳐 본문 블록이 가려지므로, 챌린지는 \`/event/challenge\` 전용 경로로 열고 이벤트 탭 위에 배너로 연결한다. 12/1 이후 본문 블록이 챌린지이면 이벤트 탭에서 바로 보인다.`

(e) §6 참가자 화면 4번 `부문별 순위` 줄 끝에 이어 붙인다.
` 기록 기간 중에는 검수 전 기록을 포함한 잠정 순위, 12/21부터는 검수 완료 기록 기준 순위를 보여 준다.`

- [ ] **Step 2: 전체 자동 확인**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 통과(빌드 포함). 실패하면 원인을 고치고 다시 실행한다.

- [ ] **Step 3: 로컬 가짜 DB로 실제 화면 확인**

운영 DB를 건드리지 않도록 **반드시** 이 명령을 쓴다(백그라운드 실행).

Run: `npm run test-day`
Expected: 로그에 `http://localhost:3100/login` 과 비밀번호 `test1234`가 나온다. 운영진 계정 `운영진`, 크루원 계정은 로그에 나온 닉네임들(`번개`, `새벽러너`는 운영진 권한).

브라우저로 `http://localhost:3100`에서 아래를 순서대로 확인하고 각 단계의 화면을 캡처해 둔다.

1. `운영진`으로 로그인 → `/admin?tab=bingo` → "+ 이벤트 블록 만들기": 종류 `기록 챌린지`, 월 `2026-12`, 이름 `[테스트] 12월 챌린지`, 은행/계좌/예금주 임의 입력 → 만들기. **기대:** 블록 목록 12월에 표시. "본문에 세팅" 클릭.
2. 같은 화면에 챌린지 관리 영역이 보이고, "설정"에서 오늘(`2026-11-20`) 기준으로 날짜를 바꿔 저장(비밀번호 `test1234` 입력): 신청 시작 `2026-11-18`, 신청 마감 `2026-11-25`, 기록 시작 `2026-11-26`, 기록 종료 `2026-12-05`, 업로드 마감 `2026-12-07`, 이의 제기 `2026-12-09`, 확정 `2026-12-10`. 잘못된 순서(예: 신청 마감을 기록 시작보다 뒤로)로 저장하면 오류 문구가 나와야 한다.
3. 크루원(예: `꾸준이`)으로 로그인 → `/event`: **기대:** 상단에 금색 배너 "신청 받아요" → 클릭 → `/event/challenge`. 규정 전문이 펼쳐져 있고, 체크박스 없이 신청하면 경고, 체크 후 신청하면 "신청했어요" 안내와 "입금 확인 전" 표시. "신청 취소 (환불 없음)" 버튼이 보인다.
4. 운영진 화면 "참가자·입금"에서 `꾸준이` 입금 확인 → 크루원 화면에서 "입금 확인됨".
5. 설정에서 `기록 시작`을 `2026-11-15`, `기록 종료`를 `2026-11-25`로 바꿔(신청 마감도 `2026-11-14` 등으로 앞당겨 순서를 맞춤) "기록 중" 단계를 만든다. 크루원 화면에서 **기록 올리기** 확인:
   - 요약 캡처 없이 저장 → "활동 요약 캡처를 올려 주세요"
   - 캡처(아무 큰 스크린샷)를 고르면 "NNNKB로 줄였어요" 표시와 미리보기
   - 5km / 25분 / 요약 캡처 → 저장 성공, "내 기록"에 `평균 5:00/km`, 상태 `검수 전`
   - 5km / 45분(페이스 9:00) → 저장은 되고 내 기록에 "8:00보다 느려서 … 제외" 문구
   - 케이던스 값만 넣고 캡처 없이 저장 → "케이던스 캡처를 올려 주세요"
   - 트레드밀 + 장소 입력 → "트레드밀은 … 쓸 수 없어요"
   - 기록 수정(제목 "수정" 펼침 → 거리 변경 후 저장)과 삭제(비밀번호 확인) 동작
6. 순위: 입금 확인된 `꾸준이`의 기록이 "부문별 순위"에 `검수 전` 표시와 함께 나온다. 입금 확인 안 된 다른 계정의 기록은 순위에 나오지 않는다.
7. 운영진 "기록 검수": `꾸준이` 기록이 `상위 후보`로 보이고 캡처 열기가 된다. 승인 → 크루원 화면 `인정`. 다른 기록은 사유 없이 반려 시 "반려 사유를 적어 주세요", 사유를 적으면 크루원 화면에 `반려`와 사유. `번개`(운영진 권한 계정)로 `번개` 본인 기록이 있다면 검수 버튼이 없어야 한다.
8. 장소 정리표: 장소를 입력한 기록 2건(`한강 반포`, `한강반포`)이 같은 장소로 세어지는지, 정리표에서 다른 이름을 묶으면 개수가 줄어드는지 확인.
9. 단계를 `이의 제기`로 바꿔(`기록 종료` `2026-11-19`, `업로드 마감` `2026-11-19`처럼 과거로, `이의 제기 마감` 내일) 크루원이 이의 제기를 접수하고 운영진이 답하면 크루원 화면에 답변이 보인다. 이 단계에서는 순위가 "검수 완료 기록 기준"으로 바뀐다.
10. `확정`을 과거로 바꾸면 "🏆 시상"이 나타나고 1인 1상 결과가 운영진 "결과 미리보기"와 같다.
11. 이벤트 탭 본문에 챌린지가 세팅된 경우를 확인한다: 먼저 위의 12월 챌린지 블록을 "내리기"하고, 월 `2026-11`로 챌린지 블록을 하나 더 만들어 "본문에 세팅"한다(같은 달 빙고는 자동으로 내려간다). `/event` 본문이 챌린지 화면이어야 하고 배너가 중복으로 보이면 안 된다. 확인 뒤 이 테스트 블록은 삭제한다(삭제하면 데이터도 함께 지워진다).
12. 빙고 화면(`/event`에서 빙고 세팅 상태)에서 배너가 보여도 아래 빙고판이 잘리지 않는지 확인. 잘리면 `src/app/globals.css`의 `.event-shell > .event-frame` 높이 계산에서 배너 높이(약 36px)를 추가로 뺀다.
13. 크루원 화면 폭 375px(모바일)에서 기록 폼, 순위, 규정이 가로 스크롤 없이 읽히는지 확인.

확인에서 나온 문제는 해당 Task의 파일에서 고치고, 고칠 때마다 `npm test && npx tsc --noEmit && npm run lint`를 다시 실행한다.

- [ ] **Step 4: 가짜 DB 서버 종료와 마무리 커밋**

`npm run test-day` 프로세스를 종료한다(이 서버는 메모리 DB라 데이터는 사라진다). 운영 DB에는 아무 것도 쓰지 않았음을 확인한다(`git status`로 코드 변경만 있는지).

```bash
git add -A
git commit -m "챌린지 기획서에 구현 규칙 반영, 화면 확인 중 발견한 수정"
```

(Step 3에서 고친 것이 없으면 기획서 변경만 커밋된다.)

- [ ] **Step 5: 사용자에게 보고하고 확인 받기**

보고할 것: 자동 확인 결과(테스트 개수, 타입, 린트, 빌드), 위 13개 확인 항목별 통과 여부와 캡처, 남은 위험.
알려야 할 위험:
1. **캡처 이미지는 Redis(또는 Postgres) 값으로 저장된다.** 장당 최대 450KB, 활동 1건당 최대 4장이라 참가자가 많으면 용량이 빠르게 늘 수 있다. 확정 후 챌린지 블록을 삭제하면 모두 지워진다.
2. 푸시와 `vercel --prod` 배포는 사용자 확인 후에만 한다. 배포 전에 운영진이 `/admin?tab=bingo`에서 블록을 만들고(월 `2026-12`) 설정(계좌, 일정, 상품 6개)을 채운 뒤 "본문에 세팅"을 눌러야 11/24에 신청이 열린다.
3. 신청 기간 전(11/24 이전)에는 배너와 경로가 보이지 않는다(운영진 관리 화면은 항상 보인다).
