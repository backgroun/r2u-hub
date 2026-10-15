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
  ["11-15", "11-30", "thanksgiving"],
  ["03-01", "05-31", "spring"],
  ["06-01", "08-31", "summer"],
  ["09-01", "11-30", "fall"],
  ["12-01", "02-29", "winter"],
];

export function currentSeason(now: Date = new Date()): Season {
  const forced = process.env.ICON_SEASON as Season | undefined;
  if (forced && SEASONS.includes(forced)) return forced;
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const md = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  for (const [from, to, season] of RULES) {
    const hit = from <= to ? md >= from && md <= to : md >= from || md <= to; // 연말~연초에 걸치는 구간
    if (hit) return season;
  }
  return "basic";
}

export const seasonIcon = (season: Season, size: 180 | 192 | 512) => `/icons/${season}-${size}.png`;
