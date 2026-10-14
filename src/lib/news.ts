import "server-only";
import { createHash } from "crypto";
import { redis } from "@/lib/hub";

/* 러닝 뉴스 자동 수집 (running-news-board-spec.md).
 * 네이버 검색 API(뉴스, NAVER API HUB)로 제목·요약·원문 링크만 모아 Redis에 쌓는다. 본문·사진은 저장하지 않는다. */

export const NEWS_CATEGORIES = [
  { code: "race", label: "🏁 대회·접수", keywords: ["접수", "참가 신청", "개최", "대회", "코스 공개", "참가자 모집", "레이스"] },
  { code: "record", label: "🏅 기록·선수", keywords: ["우승", "신기록", "세계기록", "한국기록", "국가대표", "선수", "올림픽", "메이저"] },
  { code: "gear", label: "👟 장비", keywords: ["러닝화", "신발", "출시", "워치", "스마트워치", "가민", "코로스", "나이키", "아디다스", "아식스", "호카"] },
  { code: "health", label: "💪 훈련·건강", keywords: ["훈련", "부상", "무릎", "족저근막", "심박", "스트레칭", "근력", "영양", "회복", "건강", "운동법"] },
  { code: "general", label: "📰 일반", keywords: [] as string[] },
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["code"];

// 수집 키워드: 관리 화면 없이 코드에서 관리한다 ("러닝" 단독 검색은 노이즈가 많아 쓰지 않는다)
const INCLUDE = ["마라톤", "하프마라톤", "풀코스 마라톤", "마라톤 대회", "마라톤 접수", "러닝크루", "트레일러닝", "울트라마라톤", "러닝화", "달리기 운동", "러너", "10km 달리기"];
const EXCLUDE = [
  "러닝메이트", "머신러닝", "딥러닝", "러닝타임", "러닝 타임", "러닝개런티", "러닝 개런티", "이러닝", "e러닝", "블렌디드 러닝", "러닝커브", "러닝 커브",
  "마라톤 협상", "마라톤 회의", "마라톤 회담", "마라톤 토론", "마라톤 청문회", "마라톤 심사", "마라톤 협의", "마라톤 필리버스터",
];
const PRESS: Record<string, string> = {
  "yna.co.kr": "연합뉴스", "newsis.com": "뉴시스", "news1.kr": "뉴스1", "chosun.com": "조선일보", "joongang.co.kr": "중앙일보", "donga.com": "동아일보",
  "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "hankookilbo.com": "한국일보", "seoul.co.kr": "서울신문", "segye.com": "세계일보", "munhwa.com": "문화일보",
  "kmib.co.kr": "국민일보", "mk.co.kr": "매일경제", "hankyung.com": "한국경제", "sedaily.com": "서울경제", "edaily.co.kr": "이데일리", "mt.co.kr": "머니투데이",
  "heraldcorp.com": "헤럴드경제", "asiae.co.kr": "아시아경제", "fnnews.com": "파이낸셜뉴스", "newspim.com": "뉴스핌", "nocutnews.co.kr": "노컷뉴스", "ohmynews.com": "오마이뉴스",
  "kbs.co.kr": "KBS", "imbc.com": "MBC", "sbs.co.kr": "SBS", "ytn.co.kr": "YTN", "jtbc.co.kr": "JTBC", "mbn.co.kr": "MBN",
  "sportsseoul.com": "스포츠서울", "sportschosun.com": "스포츠조선", "isplus.com": "일간스포츠", "osen.co.kr": "OSEN", "xportsnews.com": "엑스포츠뉴스",
  "mydaily.co.kr": "마이데일리", "starnewskorea.com": "스타뉴스", "sports.khan.co.kr": "스포츠경향",
};

const MAX_AGE_DAYS = 7; // 이보다 오래된 기사는 수집 안 함
const SUMMARY_MAX = 120;
const DEDUPE_SIMILARITY = 0.6;
const DEDUPE_WINDOW_MS = 48 * 3600_000;
const RETENTION_DAYS = 90;
const LOG_KEEP = 30;

export type NewsItem = {
  id: string; url: string; title: string; titleKey: string; summary: string; press: string;
  category: NewsCategory; keywords: string[]; dup: number; at: number; hidden?: boolean; pinned?: boolean;
};
export type NewsLog = { at: number; error?: string; fetched: number; excluded: number; duplicated: number; saved: number; unknownDomains: string[]; perKeyword: { keyword: string; fetched: number; error?: string }[] };

const NK = {
  items: "r2u:news:items", // hash id -> NewsItem
  idx: "r2u:news:idx", // zset (score: 발행 시각 ms, member: id)
  logs: "r2u:news:logs", // list (최신이 앞)
};

/* ---------- 정리(normalize) ---------- */
const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", "#39": "'", nbsp: " " };
export const cleanText = (s = "") =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      ENTITIES[e] ?? (e.startsWith("#x") ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/\s+/g, " ").trim();

export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  [...u.searchParams.keys()].filter((k) => k.startsWith("utm_") || k === "fbclid" || k === "gclid").forEach((k) => u.searchParams.delete(k));
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

const squash = (s: string) => s.replace(/\s+/g, "");
export const isExcluded = (text: string) => EXCLUDE.some((k) => text.includes(k) || squash(text).includes(squash(k)));

export function categorize(text: string): NewsCategory {
  return NEWS_CATEGORIES.find((c) => c.keywords.some((k) => text.includes(k)))?.code ?? "general";
}

function pressFromUrl(url: string): { press: string; known: boolean } {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const hit = Object.keys(PRESS).filter((d) => host === d || host.endsWith("." + d)).sort((a, b) => b.length - a.length)[0];
  return hit ? { press: PRESS[hit], known: true } : { press: host, known: false };
}

export const titleKey = (t: string) => t.replace(/^(\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*/g, "").replace(/[^\p{L}\p{N}]/gu, "");
export function similarity(a: string, b: string): number {
  const grams = (s: string) => new Set(Array.from({ length: Math.max(s.length - 1, 0) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return inter / (A.size + B.size - inter);
}
const sameStory = (a: Pick<NewsItem, "titleKey" | "at">, b: Pick<NewsItem, "titleKey" | "at">) =>
  Math.abs(a.at - b.at) <= DEDUPE_WINDOW_MS && (a.titleKey === b.titleKey || similarity(a.titleKey, b.titleKey) >= DEDUPE_SIMILARITY);

/* ---------- 네이버 API ---------- */
type Raw = { title: string; originallink: string; link: string; description: string; pubDate: string };
async function fetchNaver(query: string): Promise<Raw[]> {
  // 개발자센터 검색 API 는 NAVER API HUB 로 이관됐다 (주소·경로·헤더가 다르다). 응답 형식은 같다.
  const res = await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(query)}&display=100&start=1&sort=date&format=json`, {
    headers: { "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_CLIENT_ID!, "X-NCP-APIGW-API-KEY": process.env.NAVER_CLIENT_SECRET! },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`NAVER_API_${res.status}`);
  return (await res.json()).items ?? [];
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idOf = (url: string) => createHash("sha1").update(url).digest("base64url").slice(0, 12);

export const newsConfigured = () => !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

/** 수집 1회 실행. 기존 글은 절대 덮어쓰지 않는다(숨김 상태가 살아나지 않도록 hsetnx). */
export async function collectNews(): Promise<NewsLog> {
  const log: NewsLog = { at: Date.now(), fetched: 0, excluded: 0, duplicated: 0, saved: 0, unknownDomains: [], perKeyword: [] };
  if (!newsConfigured()) {
    log.error = "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없어요.";
    await redis.lpush(NK.logs, log); await redis.ltrim(NK.logs, 0, LOG_KEEP - 1);
    return log;
  }
  const minAt = Date.now() - MAX_AGE_DAYS * 86400_000;
  const found = new Map<string, NewsItem>(); // url -> item (키워드가 여럿 걸리면 합침)
  const unknown = new Set<string>();

  for (const keyword of INCLUDE) {
    const per = { keyword, fetched: 0 as number, error: undefined as string | undefined };
    try {
      for (const raw of await fetchNaver(keyword)) {
        per.fetched++;
        const at = new Date(raw.pubDate).getTime();
        if (!Number.isFinite(at) || at < minAt) continue;
        let url: string;
        try { url = normalizeUrl(raw.originallink || raw.link); } catch { continue; }
        const title = cleanText(raw.title), desc = cleanText(raw.description);
        const hit = found.get(url);
        if (hit) { if (!hit.keywords.includes(keyword)) hit.keywords.push(keyword); continue; }
        const { press, known } = pressFromUrl(url);
        if (!known) unknown.add(press);
        found.set(url, {
          id: idOf(url), url, title, titleKey: titleKey(title),
          summary: desc.length > SUMMARY_MAX ? desc.slice(0, SUMMARY_MAX) + "…" : desc,
          press, category: categorize(`${title} ${desc}`), keywords: [keyword], dup: 0, at,
        });
      }
    } catch (e) { per.error = e instanceof Error ? e.message : String(e); }
    log.fetched += per.fetched;
    log.perKeyword.push(per);
    await sleep(200);
  }
  log.unknownDomains = [...unknown].slice(0, 30);
  const apiDown = log.perKeyword.length > 0 && log.perKeyword.every((p) => p.error);
  if (apiDown) log.error = log.perKeyword[0].error;

  // 제외 키워드 → 먼저 발행된 순으로 훑으며 URL·제목 유사 중복 제거
  const fresh = [...found.values()].filter((it) => {
    if (isExcluded(`${it.title} ${it.summary}`)) { log.excluded++; return false; }
    return true;
  }).sort((a, b) => a.at - b.at);

  const recentIds = (await redis.zrange<string[]>(NK.idx, Date.now() - DEDUPE_WINDOW_MS - 86400_000, "+inf", { byScore: true })) ?? [];
  const recent = recentIds.length ? ((await redis.hmget<Record<string, NewsItem>>(NK.items, ...recentIds)) ?? {}) : {};
  const kept: NewsItem[] = Object.values(recent).filter((x): x is NewsItem => !!x);
  const bump = new Map<string, number>(); // 원본 id -> 추가로 보도한 곳 수

  for (const it of fresh) {
    if (kept.some((k) => k.id === it.id)) { log.duplicated++; continue; } // URL 중복
    const twin = kept.find((k) => sameStory(k, it));
    if (twin) { log.duplicated++; bump.set(twin.id, (bump.get(twin.id) ?? 0) + 1); continue; }
    if (await redis.hsetnx(NK.items, it.id, it)) {
      await redis.zadd(NK.idx, { score: it.at, member: it.id });
      kept.push(it);
      log.saved++;
    } else log.duplicated++;
  }
  for (const [id, n] of bump) {
    const cur = await redis.hget<NewsItem>(NK.items, id);
    if (cur) await redis.hset(NK.items, { [id]: { ...cur, dup: cur.dup + n } });
  }

  // 오래된 기사 정리
  const old = (await redis.zrange<string[]>(NK.idx, 0, Date.now() - RETENTION_DAYS * 86400_000, { byScore: true })) ?? [];
  if (old.length) { await redis.hdel(NK.items, ...old); await redis.zrem(NK.idx, ...old); }

  await redis.lpush(NK.logs, log);
  await redis.ltrim(NK.logs, 0, LOG_KEEP - 1);
  return log;
}

/* ---------- 조회 ---------- */
/** 고정글 먼저, 그다음 최신순. 숨김 글은 빼고 category 가 있으면 그 분류만. */
export async function listNews({ category, limit = 40 }: { category?: string; limit?: number } = {}): Promise<NewsItem[]> {
  const ids = (await redis.zrange<string[]>(NK.idx, 0, 399, { rev: true })) ?? [];
  if (!ids.length) return [];
  const map = (await redis.hmget<Record<string, NewsItem>>(NK.items, ...ids)) ?? {};
  const all = ids.map((id) => map[id]).filter((x): x is NewsItem => !!x && !x.hidden && (!category || x.category === category));
  return [...all.filter((x) => x.pinned), ...all.filter((x) => !x.pinned)].slice(0, limit);
}

export async function lastNewsLog(): Promise<NewsLog | null> {
  return (await (redis.lrange(NK.logs, 0, 0) as Promise<NewsLog[]>).then((r) => r[0])) ?? null;
}

export async function patchNews(id: string, patch: Partial<Pick<NewsItem, "hidden" | "pinned" | "category">>) {
  const cur = await redis.hget<NewsItem>(NK.items, id);
  if (cur) await redis.hset(NK.items, { [id]: { ...cur, ...patch } });
}

export function timeAgo(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 60) return `${Math.max(m, 1)}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
