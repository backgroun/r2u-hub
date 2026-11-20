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
export const paceFromHundredths = (hundredths: number, durationSec: number): number => (hundredths > 0 ? Math.floor((durationSec * 100) / hundredths) : Infinity);
export const paceSecOf = (distanceKm: number, durationSec: number): number => paceFromHundredths(Math.round(distanceKm * 100), durationSec);
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

/** 장소 입력을 같은 장소끼리 비교하는 키: 공백·대소문자를 없앤다 */
export const placeKey = (raw: string): string => raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "");
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
