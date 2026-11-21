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
  // 일정은 모두 "YYYY-MM-DDTHH:mm" (한국 시각, 활동 시작 일시와 같은 형식)
  signupStart: string; signupEnd: string; // 신청·입금 기간
  start: string; end: string; // 기록 인정 기간 (활동 시작 시각 기준)
  finalAt: string; // 최종 확정·시상 발표
  prizes: string[]; // 상품 예정 목록 (변경될 수 있음)
  spendNote: string; // 회비 사용 내역 공개 문구
  rulesText?: string; // 운영진이 고친 규정 안내 글. 비어 있으면 defaultRulesText 를 쓴다
  // 운영진 전용 테스트 모드: 켜면 운영진에게만 보이고, testPhase가 있으면 날짜와 상관없이 그 단계로 본다
  testMode: boolean;
  testPhase: Phase | ""; // "" = 날짜대로
};

export const DEFAULT_CONFIG: ChallengeConfig = {
  fee: 5000,
  bank: { bank: "", account: "", holder: "" },
  signupStart: "2026-11-24T09:00", signupEnd: "2026-11-30T23:59",
  start: "2026-12-01T00:00", end: "2026-12-18T23:59",
  finalAt: "2026-12-18T23:59", // 업로드·최종 확정은 따로 두지 않고 기록 종료와 같게 둔다
  prizes: ["넥워머", "카프슬리브", "오스무브 모자", "데카르트 장갑"],
  spendNote: "",
  testMode: false, testPhase: "",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YMDHM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** "YYYY-MM-DDTHH:mm"가 실제 있는 일시인지 (2월 30일·25시 같은 값을 거른다) */
const isDateTime = (s: string): boolean => YMDHM.test(s) && !Number.isNaN(new Date(`${s}:00Z`).getTime()) && new Date(`${s}:00Z`).toISOString().slice(0, 16) === s;

/** 예전에 날짜만 저장된 설정을 읽을 때 시각을 붙인다: 시작 성격(신청 시작·기록 시작·최종 확정)은 00:00, 마감 성격은 23:59. 없는 회비 사용 내역은 빈 글로. */
export function normalizeConfig(c: ChallengeConfig): ChallengeConfig {
  const fix = (v: string, hm: string) => (typeof v === "string" && v.length === 10 && YMD.test(v) ? `${v}T${hm}` : v);
  return {
    ...c,
    signupStart: fix(c.signupStart, "00:00"), signupEnd: fix(c.signupEnd, "23:59"),
    start: fix(c.start, "00:00"), end: fix(c.end, "23:59"),
    finalAt: fix(c.finalAt, "00:00"),
    spendNote: c.spendNote ?? "",
    rulesText: c.rulesText ?? "",
    testMode: c.testMode === true, testPhase: ["appeal", "upload"].includes(c.testPhase as string) ? "closed" : c.testPhase ?? "", // 없어진 업로드·이의 제기 단계로 고정돼 있던 값은 종료로
  };
}

/** 설정이 말이 되는지 확인한다. 문제가 있으면 화면에 보여 줄 문구, 없으면 null */
export function validateConfig(c: ChallengeConfig): string | null {
  const times = [c.signupStart, c.signupEnd, c.start, c.end, c.finalAt];
  if (!times.every((t) => typeof t === "string" && isDateTime(t))) return "날짜와 시각을 다시 골라 주세요.";
  if (!(c.signupStart <= c.signupEnd)) return "신청 시작이 신청 마감보다 늦어요.";
  if (!(c.signupEnd < c.start)) return "신청 마감은 기록 시작보다 앞이어야 해요.";
  if (!(c.start <= c.end)) return "기록 시작이 종료보다 늦어요.";
  if (!(c.end <= c.finalAt)) return "최종 확정은 기록 종료보다 뒤여야 해요.";
  if (!Number.isInteger(c.fee) || c.fee < 0) return "회비를 확인해 주세요.";
  return null;
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 평균 페이스(초/km). 초 단위 이하는 버린다 — 화면에 보이는 값과 판정이 항상 같다. */
export const paceFromHundredths = (hundredths: number, durationSec: number): number => (hundredths > 0 ? Math.floor((durationSec * 100) / hundredths) : Infinity);
export const paceSecOf = (distanceKm: number, durationSec: number): number => paceFromHundredths(Math.round(distanceKm * 100), durationSec);
export const fmtPace = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
export const fmtDate = (ymd: string): string => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
/** "2026-11-24T09:00" → "11월 24일 09:00" */
export const fmtDateTime = (dt: string): string => `${fmtDate(dt)} ${dt.slice(11, 16)}`;
/** "2026-11-24T09:00" → "11/24 09:00" */
export const fmtMdTime = (dt: string): string => `${Number(dt.slice(5, 7))}/${Number(dt.slice(8, 10))} ${dt.slice(11, 16)}`;
/** 지금 한국 시각 "YYYY-MM-DDTHH:mm" (UTC+9) */
export const nowKst = (ms: number = Date.now()): string => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16);

export type Phase = "soon" | "signup" | "ready" | "running" | "closed";
export const PHASE_LABEL: Record<Phase, string> = {
  soon: "곧 열려요", signup: "신청 중", ready: "시작 전", running: "기록 중", closed: "종료",
};

/** 지금(한국 시각 "YYYY-MM-DDTHH:mm")이 어느 단계인가. 각 마감 시각 그 분까지는 앞 단계다. */
export function phaseOf(cfg: ChallengeConfig, now: string): Phase {
  if (now < cfg.signupStart) return "soon";
  if (now <= cfg.signupEnd) return "signup";
  if (now < cfg.start) return "ready";
  if (now <= cfg.end) return "running";
  return "closed";
}

/** 화면·동작이 따르는 단계: 테스트 모드에서 단계를 고정해 두었으면 그 단계, 아니면 날짜대로 */
export function currentPhase(cfg: ChallengeConfig, now: string): Phase {
  return cfg.testMode && cfg.testPhase ? cfg.testPhase : phaseOf(cfg, now);
}

/** 기록 기간을 판정·검증하는 곳에 넘기는 설정: 테스트 모드에서는 어느 날짜의 활동이든 인정되도록 기간을 넓힌다. 단계 판단·일정 표시에는 쓰지 않는다. */
export function effectiveCfg(cfg: ChallengeConfig): ChallengeConfig {
  return cfg.testMode ? { ...cfg, start: "2000-01-01T00:00", end: "2099-12-31T23:59" } : cfg;
}

/** 시상 결과를 보여 줄 때인가: 종료 단계이고, 확정 시각이 지났거나 테스트 모드일 때 */
export function canShowWinners(cfg: ChallengeConfig, now: string, phase: Phase): boolean {
  return phase === "closed" && (cfg.testMode || now >= cfg.finalAt);
}

export type Judgement = { paceSec: number; paceOk: boolean; counts: Record<Category, boolean>; notes: string[] };

const NONE: Record<Category, boolean> = { distance: false, time: false, cadence: false, zone2: false, place: false, fiveK: false };

/** 활동 1건이 어느 부문에 들어가는지, 안 들어가면 왜인지 판정한다. (캡처가 있는지는 입력 단계에서 이미 확인했다) */
export function judge(a: Activity, cfg: ChallengeConfig): Judgement {
  const paceSec = paceSecOf(a.distanceKm, a.durationSec);
  if (a.status === "rejected") return { paceSec, paceOk: false, counts: { ...NONE }, notes: [`반려됨${a.rejectReason ? `: ${a.rejectReason}` : ""}`] };
  if (a.startedAt < cfg.start || a.startedAt > cfg.end) return { paceSec, paceOk: false, counts: { ...NONE }, notes: [`이벤트 기간(${fmtDateTime(cfg.start)}~${fmtDateTime(cfg.end)}) 밖의 기록이에요.`] };
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
export function validateActivity(i: RawInput, img: ImgFlags, cfg: ChallengeConfig, now: string): Checked {
  const s = String(i.startedAt ?? "");
  const d = new Date(`${s}:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== s) return bad("시작 일시를 다시 골라 주세요.");
  const date = s.slice(0, 10);
  if (s < cfg.start || s > cfg.end) return bad(`${fmtDateTime(cfg.start)} ~ ${fmtDateTime(cfg.end)} 사이의 활동만 올릴 수 있어요.`);
  if (s > now) return bad("오늘보다 미래의 활동은 올릴 수 없어요.");

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

/** 장소 입력을 같은 장소끼리 비교하는 키: 공백·기호·대소문자를 없앤다. 한 사람이 같은 장소를 여러 번 올려도 한 곳으로만 센다 */
export const placeKey = (raw: string): string => raw.normalize("NFC").trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** 운영진이 정리표로 묶어 둔 장소면 묶음 이름의 키를, 아니면 입력 그대로의 키를 돌려준다 */
export const placeGroupOf = (raw: string, map: Record<string, string> = {}): string => {
  const k = placeKey(raw);
  return Object.hasOwn(map, k) && typeof map[k] === "string" && map[k] ? placeKey(map[k]) : k;
};

export type Entry = { nick: string; rank: number; value: number; paceSec: number; lastAt: string; actIds: string[] };
export type Board = Record<Category, Entry[]>;

type Cand = { value: number; evidence: Activity[] };

const tally = (ev: Activity[]) => {
  const hundredths = ev.reduce((s, a) => s + Math.round(a.distanceKm * 100), 0);
  const sec = ev.reduce((s, a) => s + a.durationSec, 0);
  return { paceSec: paceFromHundredths(hundredths, sec), lastAt: ev.reduce((m, a) => (a.startedAt > m ? a.startedAt : m), "") };
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

export type Award = { category: Category; winner: string | null; tie: string[]; provisional: boolean };

/** 시상: 부문을 확정 순서대로 보며, 이미 수상한 사람은 건너뛰고 차순위가 올라온다(1인 1상). 완전 동점이면 winner=null, tie=동점자. */
export function awardWinners(board: Board): Award[] {
  const won = new Set<string>();
  let tied = false; // 앞 부문에 동점이 있으면 뒤 부문 수상은 잠정
  return CATEGORIES.map((category) => {
    const provisional = tied;
    const rest = board[category].filter((e) => !won.has(e.nick));
    if (!rest.length) return { category, winner: null, tie: [], provisional };
    const top = rest.filter((e) => same(e, rest[0]));
    if (top.length > 1) { tied = true; return { category, winner: null, tie: top.map((e) => e.nick).sort(), provisional }; }
    won.add(top[0].nick);
    return { category, winner: top[0].nick, tie: [], provisional };
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

/* ---------- 규정 안내 글 ----------
   형식: "## 제목" 줄이 새 묶음, "1. " 로 시작하면 번호 목록, 나머지 줄은 점 목록("- " 는 있어도 없어도 됨). **굵게** 표시를 쓸 수 있다. */
export type RulesSection = { title: string; ordered: boolean; items: string[] };

/** 규정 글 안에서 쓰는 자리표시: 보여 줄 때 설정에서 정한 값으로 채워진다 */
export const RULES_TOKENS = ["{신청시작}", "{신청마감}", "{기록시작}", "{기록종료}", "{회비}", "{입금계좌}"] as const;

/** 자리표시를 설정 값으로 바꾼다. 입금 계좌가 비어 있으면 "곧 안내해요". */
export function fillRules(text: string, cfg: ChallengeConfig): string {
  const bank = cfg.bank.bank && cfg.bank.account ? `${cfg.bank.bank} ${cfg.bank.account}${cfg.bank.holder ? ` (${cfg.bank.holder})` : ""}` : "곧 안내해요";
  const map: Record<string, string> = {
    "{신청시작}": fmtMdTime(cfg.signupStart), "{신청마감}": fmtMdTime(cfg.signupEnd),
    "{기록시작}": fmtMdTime(cfg.start), "{기록종료}": fmtMdTime(cfg.end),
    "{회비}": `${cfg.fee.toLocaleString("ko-KR")}원`, "{입금계좌}": bank,
  };
  return text.replace(/\{[^{}]+\}/g, (t) => map[t] ?? t);
}

/** 기본 규정 글. 일자·회비·계좌는 자리표시로 두어 설정을 바꾸면 따라가고, 고치면 그 글이 고정된다. */
export function defaultRulesText(): string {
  return [
    "## 📅 기록",
    "기간은 {기록시작} ~ {기록종료}예요. 활동 **시작 시각** 기준이에요.",
    "모든 활동에는 **요약 캡처가 필수**예요. 편집한 캡처는 실격이고, 요청하면 원본을 내야 해요.",
    `평균 페이스 **km당 ${fmtPace(RULE.maxPaceSec)} 이내**만 인정해요. (Zone 2 부문은 예외)`,
    "로드·트레드밀·트랙 모두 가능해요.",
    "## 🏆 부문 (1인 1상, 아래 순서로 확정)",
    "1. **거리**: 인정 거리 합계가 가장 긴 사람",
    "2. **최장시간**: 인정 시간 합계가 가장 긴 사람",
    `3. **케이던스**: ${RULE.cadenceMinKm}km 이상 1건의 평균 케이던스가 가장 높은 사람`,
    `4. **Zone 2**: 비율 ${RULE.zone2MinPct}% 이상 1건의 거리가 가장 긴 사람`,
    `5. **다양한 장소**: ${RULE.placeMinSec / 60}분 이상 뛴 서로 다른 장소가 가장 많은 사람 (트레드밀 제외, 같은 장소는 한 번만 세요)`,
    `6. **5km**: 하루 합계 ${RULE.fiveKmHundredths / 100}km 이상인 날이 가장 많은 사람`,
    "## 🎁 수상",
    "동률이면 페이스가 빠른 사람, 그다음엔 먼저 달성한 사람이 이겨요. 완전히 같으면 공동으로 표시하고 운영진이 정해요.",
    "앞 부문 수상자는 뒤 부문에서 빠지고 차순위가 올라와요.",
    "순위와 상품은 양도할 수 없고, 상품은 확정 순서대로 골라요.",
    "## 💳 참가",
    "회비 {회비} (환불 없음). 입금이 확인된 분만 순위에 들어가요.",
    "입금 계좌: {입금계좌}",
    "일정: 신청 {신청시작} ~ {신청마감} · 기록 {기록시작} ~ {기록종료}",
  ].join("\n");
}

/** 규정 글 → 묶음 목록 (제목 없는 앞부분도 하나의 묶음으로 본다) */
export function parseRules(text: string): RulesSection[] {
  const out: RulesSection[] = [];
  let cur: RulesSection | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) { cur = { title: line.slice(3).trim(), ordered: false, items: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title: "", ordered: false, items: [] }; out.push(cur); }
    const num = /^\d+[.)]\s+(.*)$/.exec(line);
    if (num && cur.items.length === 0) cur.ordered = true;
    cur.items.push((num ? num[1] : line.replace(/^[-•]\s+/, "")).trim());
  }
  return out;
}

/** 달린 시간 입력 한 칸을 초로 바꾼다. "1:30"(시:분) · "1:30:15"(시:분:초) · "1시간 30분" · "90"(분만) 을 받고, 읽을 수 없으면 null. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const colon = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (colon) {
    const [h, m, sec] = [Number(colon[1]), Number(colon[2]), Number(colon[3] ?? 0)];
    return m < 60 && sec < 60 ? h * 3600 + m * 60 + sec : null;
  }
  const kr = /^(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?$/.exec(t);
  if (kr && (kr[1] || kr[2] || kr[3])) {
    const [h, m, sec] = [Number(kr[1] ?? 0), Number(kr[2] ?? 0), Number(kr[3] ?? 0)];
    return m < 60 && sec < 60 ? h * 3600 + m * 60 + sec : null;
  }
  return null;
}

/** 초 → 입력칸에 채울 "시:분"(초가 있으면 "시:분:초") */
export function durationInput(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}${s ? `:${String(s).padStart(2, "0")}` : ""}`;
}
