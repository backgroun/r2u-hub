import "server-only";
import { redis, kstToday } from "@/lib/hub";
import { addNotice } from "@/lib/notice";
import { forcedSeason, iconSchedule, seasonByDate, type Season } from "@/lib/season-icon";

const COPY: Record<Season, { emoji: string; name: string; line: string }> = {
  basic: { emoji: "🏃", name: "기본", line: "R2U 기본 아이콘으로 돌아왔어요." },
  newyear: { emoji: "🎍", name: "새해", line: "새해 복 많이 받으세요! 새해 아이콘으로 바뀌었어요." },
  spring: { emoji: "🌸", name: "봄", line: "봄 러닝 시즌! 벚꽃 아이콘으로 바뀌었어요." },
  summer: { emoji: "☀️", name: "여름", line: "더운 여름, 물 챙기며 달려요. 여름 아이콘으로 바뀌었어요." },
  fall: { emoji: "🍂", name: "가을", line: "달리기 좋은 가을이에요. 가을 아이콘으로 바뀌었어요." },
  halloween: { emoji: "🎃", name: "할로윈", line: "할로윈 아이콘으로 바뀌었어요." },
  thanksgiving: { emoji: "🦃", name: "추수감사절", line: "감사한 마음으로 달려요. 추수감사절 아이콘으로 바뀌었어요." },
  christmas: { emoji: "🎄", name: "크리스마스", line: "메리 크리스마스! 크리스마스 아이콘으로 바뀌었어요." },
  winter: { emoji: "⛄", name: "겨울", line: "추운 날엔 옷 따뜻하게 챙겨요. 겨울 아이콘으로 바뀌었어요." },
};
const TIP = "웹앱이라 이미 홈 화면에 추가해 둔 아이콘은 자동으로 바뀌지 않아요. 새 아이콘을 보려면 기존 아이콘을 지우고, 아래 방법대로 홈 화면에 다시 추가해 주세요.";

export const iconNoticeText = (season: Season) => {
  const c = COPY[season];
  return { title: `${c.emoji} 앱 아이콘이 ${c.name} 버전으로 바뀌었어요`, body: `${c.line}\n${TIP}` };
};

// 아이콘이 바뀐 날이 아니어도 이 날짜에 이 시즌 공지를 한 번 올린다 (이미 바뀐 시즌의 늦은 안내)
const EXTRA: Record<string, Season> = { "2026-10-27": "halloween" };

/* 운영진이 예약 공지의 제목·내용을 미리 고쳐 둔 값 (날짜별) */
const OVERRIDES = "r2u:iconNoticeOverride";
type Override = { title: string; body: string };
async function getOverrides(): Promise<Record<string, Override>> {
  const all = (await redis.hgetall<Record<string, unknown>>(OVERRIDES).catch(() => null)) ?? {};
  const out: Record<string, Override> = {};
  for (const [d, v] of Object.entries(all)) { try { out[d] = (typeof v === "string" ? JSON.parse(v) : v) as Override; } catch { /* 손상된 값은 무시 */ } }
  return out;
}
export async function saveIconOverride(date: string, o: Override | null) {
  if (o) await redis.hset(OVERRIDES, { [date]: JSON.stringify(o) }); else await redis.hdel(OVERRIDES, date);
}

/** 오늘 아이콘 시즌이 어제와 달라졌으면 공지를 한 번만 올린다. (이미 올렸거나 시즌 고정 중이면 올리지 않는다) */
export async function postIconChangeNotice(): Promise<{ posted: boolean; reason: string }> {
  if (forcedSeason()) return { posted: false, reason: "시즌 고정 중" };
  const today = kstToday();
  const noon = (d: string) => new Date(Date.parse(`${d}T03:00:00Z`)); // 한국 정오
  const season = EXTRA[today] ?? seasonByDate(noon(today));
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  if (!EXTRA[today] && seasonByDate(noon(yesterday)) === season) return { posted: false, reason: "오늘은 아이콘이 바뀌는 날이 아니에요" };
  if ((await redis.set(`r2u:iconNotice:${today}`, season, { nx: true, ex: 7 * 86400 })) !== "OK") return { posted: false, reason: "이미 올렸어요" };
  const { title, body } = { ...iconNoticeText(season), ...((await getOverrides())[today] ?? {}) };
  await addNotice({ title, body, by: "운영진", from: today, icon: season, guide: true, auto: "icon" });
  return { posted: true, reason: title };
}

/** 앞으로 시스템이 자동으로 올릴 아이콘 공지 목록 (올린 날은 posted) */
export async function upcomingIconNotices(today: string, days = 400): Promise<{ date: string; season: Season; title: string; body: string; posted: boolean; extra: boolean; edited: boolean }[]> {
  const items: { date: string; season: Season; extra: boolean }[] = [];
  const segs = iconSchedule(today, days);
  segs.slice(1).forEach((r) => items.push({ date: r.from, season: r.season, extra: false }));
  for (const [date, season] of Object.entries(EXTRA)) if (date >= today && !items.some((i) => i.date === date)) items.push({ date, season, extra: true });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const overrides = await getOverrides();
  return Promise.all(items.map(async (i) => ({
    ...i, ...iconNoticeText(i.season), ...(overrides[i.date] ?? {}), edited: !!overrides[i.date],
    posted: (await redis.get(`r2u:iconNotice:${i.date}`).catch(() => null)) != null,
  })));
}
