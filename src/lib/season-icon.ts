// 시즌별 앱 아이콘. 원본은 icon/ 폴더, 크기별로 줄인 파일은 public/icons/<시즌>-<크기>.png
// 날짜(한국 시간)로 시즌을 고른다. 위에 있는 규칙이 먼저 적용된다.
// 강제로 고정하고 싶으면 환경변수 ICON_SEASON=christmas 처럼 지정 (basic 포함)
export const SEASONS = ["basic", "newyear", "spring", "summer", "fall", "halloween", "thanksgiving", "christmas", "winter"] as const;
export type Season = (typeof SEASONS)[number];

// [시작 월-일, 끝 월-일(포함), 시즌]
const RULES: [string, string, Season][] = [
  ["12-15", "12-26", "christmas"],
  ["12-27", "01-07", "newyear"],
  ["10-20", "11-01", "halloween"],
  ["03-01", "05-31", "spring"],
  ["06-01", "08-31", "summer"],
  ["09-01", "11-30", "fall"],
  ["12-01", "02-29", "winter"],
];

// 해마다 반복되지 않고 그 해에만 적용되는 구간 [시작 YYYY-MM-DD, 끝(포함), 시즌]. 반복 규칙보다 먼저 적용된다.
// 추수감사절 아이콘은 2027년 추석에만 쓴다.
const DATED: [string, string, Season][] = [
  ["2027-09-13", "2027-09-19", "thanksgiving"],
];

export const forcedSeason = (): Season | null => {
  const forced = process.env.ICON_SEASON as Season | undefined;
  return forced && SEASONS.includes(forced) ? forced : null;
};

/** 환경변수 고정과 상관없이, 날짜 규칙만으로 정해지는 시즌 */
export function seasonByDate(now: Date): Season {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const md = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  const ymd = kst.toISOString().slice(0, 10);
  for (const [from, to, season] of DATED) if (ymd >= from && ymd <= to) return season;
  for (const [from, to, season] of RULES) {
    const hit = from <= to ? md >= from && md <= to : md >= from || md <= to; // 연말~연초에 걸치는 구간
    if (hit) return season;
  }
  return "basic";
}

export function currentSeason(now: Date = new Date()): Season {
  return forcedSeason() ?? seasonByDate(now);
}

/** 오늘(한국 날짜)부터 days일 동안 아이콘이 바뀌는 구간 목록 */
export function iconSchedule(todayKst: string, days = 366): { season: Season; from: string; to: string }[] {
  const out: { season: Season; from: string; to: string }[] = [];
  const base = Date.parse(`${todayKst}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const ms = base + i * 86400e3;
    const date = new Date(ms).toISOString().slice(0, 10);
    const season = seasonByDate(new Date(ms - 9 * 3600e3 + 12 * 3600e3)); // 한국 정오 기준
    const last = out[out.length - 1];
    if (last && last.season === season) last.to = date; else out.push({ season, from: date, to: date });
  }
  return out;
}

export const seasonIcon = (season: Season, size: 180 | 192 | 512) => `/icons/${season}-${size}.png`;
