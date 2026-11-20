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
