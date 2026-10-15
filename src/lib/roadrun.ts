import "server-only";
import { redis } from "./hub";

// 마라톤온라인(roadrun.co.kr) 대회일정을 읽어 온다. 공식 API가 없어 페이지(EUC-KR)를 해석한다.
// 사이트 구조가 바뀌면 여기만 고치면 된다.
const BASE = "http://www.roadrun.co.kr/schedule";

// 지역 이름의 EUC-KR 인코딩 (사이트 검색 폼이 EUC-KR 값을 받는다)
export const AREAS: Record<string, string> = {
  전국: "", // 지역을 비우면 전국 대회가 나온다
  울산: "%BF%EF%BB%EA", 부산: "%BA%CE%BB%EA", 경남: "%B0%E6%B3%B2", 경북: "%B0%E6%BA%CF", 대구: "%B4%EB%B1%B8",
  서울: "%BC%AD%BF%EF", 경기: "%B0%E6%B1%E2", 인천: "%C0%CE%C3%B5", 강원: "%B0%AD%BF%F8", 충북: "%C3%E6%BA%CF",
  충남: "%C3%E6%B3%B2", 대전: "%B4%EB%C0%FC", 세종: "%BC%BC%C1%BE", 전북: "%C0%FC%BA%CF", 전남: "%C0%FC%B3%B2",
  광주: "%B1%A4%C1%D6", 제주: "%C1%A6%C1%D6",
};

export type ExtRace = { no: string; date: string; name: string; courses: string; place: string; host: string };
export type ExtDetail = { name: string; date: string; time?: string; place: string; courses: string; regStart?: string; regEnd?: string; homepage?: string };

const dec = (buf: ArrayBuffer) => new TextDecoder("euc-kr").decode(buf);
const text = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").trim();

async function get(url: string, body?: string) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
    body, cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`마라톤온라인 응답 오류 (${res.status})`);
  return dec(await res.arrayBuffer());
}

/** 지역·연도별 대회 목록. 6시간 동안 저장해 두고 다시 쓴다. */
export async function listExternal(area: string, year: number): Promise<ExtRace[]> {
  const key = `r2u:rr:${area}:${year}`;
  const cached = await redis.get<ExtRace[]>(key);
  if (cached) return cached;
  const html = await get(`${BASE}/list.php`, `area_key=${AREAS[area] ?? ""}&syear_key=${year}`);
  const rows: ExtRace[] = [];
  for (const tr of html.split(/<tr>/i)) {
    const no = tr.match(/view\.php\?no=(\d+)/)?.[1];
    const md = tr.match(/size="4"[^>]*>\s*(\d{1,2})\/(\d{1,2})\s*</);
    if (!no || !md) continue;
    const name = text(tr.match(/view\.php\?no=\d+[^>]*>([^<]+)<\/a>/)?.[1] ?? "");
    const courses = text(tr.match(/color="#990000">([^<]*)</)?.[1] ?? "");
    const cells = tr.split(/<td/i).slice(1);
    const place = text((cells[2] ?? "").replace(/^[^>]*>/, ""));
    const host = text((cells[3] ?? "").replace(/^[^>]*>/, "")).split("\n")[0].trim();
    rows.push({ no, name, courses, place, host, date: `${year}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}` });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  await redis.set(key, JSON.stringify(rows), { ex: 6 * 3600 });
  return rows;
}

/** 상세 페이지: 출발시간, 접수기간, 홈페이지 */
export async function detailExternal(no: string): Promise<ExtDetail> {
  if (!/^\d+$/.test(no)) throw new Error("잘못된 대회 번호예요.");
  const lines = text(await get(`${BASE}/view.php?no=${no}`)).split("\n").map((l) => l.trim()).filter(Boolean);
  // "대회일시 2026년10월3일 출발시간:9:00" 처럼 머리글과 값이 같은 줄 또는 다음 줄에 온다
  const flat = lines.join(" ");
  const field = (label: string, next: string[]) => {
    const i = flat.indexOf(label);
    if (i < 0) return "";
    const rest = flat.slice(i + label.length);
    const end = Math.min(...next.map((n) => { const j = rest.indexOf(n); return j < 0 ? Infinity : j; }));
    return rest.slice(0, end === Infinity ? 200 : end).trim();
  };
  const LABELS = ["대표자명", "E-mail", "대회일시", "전화번호", "대회종목", "대회지역", "대회장소", "주최단체", "접수기간", "홈페이지", "대회장", "기타소개"];
  const nextOf = (l: string) => LABELS.filter((x) => x !== l);
  const ymd = (s: string) => { const m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined; };
  const when = field("대회일시", nextOf("대회일시"));
  const t = when.match(/출발시간\s*:?\s*(\d{1,2}):(\d{2})/);
  const [r1, r2] = field("접수기간", nextOf("접수기간")).split("~");
  const rs = r1 ? ymd(r1) : undefined, re = r2 ? ymd(r2) : undefined;
  const home = field("홈페이지", nextOf("홈페이지")).replace(/\s+/g, "");
  return {
    name: field("대회명", ["대표자명"]),
    date: ymd(when) ?? "",
    time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : undefined,
    place: field("대회장소", nextOf("대회장소")),
    courses: field("대회종목", nextOf("대회종목")),
    regStart: rs ? `${rs}T00:00` : undefined,
    regEnd: re ? `${re}T23:59` : undefined,
    homepage: /^https?:\/\/\S+\.\S+/.test(home) ? home : undefined,
  };
}

export const viewUrl = (no: string) => `${BASE}/view.php?no=${no}`;

/** 목록용 접수기간만 따로: 대회마다 12시간 동안 저장해 두고 다시 쓴다 (없는 대회도 기억해 다시 묻지 않는다) */
export async function regPeriodExternal(no: string): Promise<{ regStart?: string; regEnd?: string }> {
  const key = `r2u:rr:reg:${no}`;
  const cached = await redis.get<{ regStart?: string; regEnd?: string }>(key);
  if (cached) return cached;
  let v: { regStart?: string; regEnd?: string } = {};
  try { const d = await detailExternal(no); v = { regStart: d.regStart, regEnd: d.regEnd }; } catch { return {}; }
  await redis.set(key, JSON.stringify(v), { ex: 12 * 3600 });
  return v;
}
