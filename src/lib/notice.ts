import "server-only";
import { createHash } from "crypto";
import webpush from "web-push";
import { redis, newId } from "@/lib/hub";

/* ---------- 공지사항 (운영진이 올리고 홈에 보인다) ---------- */
export type Notice = { id: string; title: string; body: string; at: number; by: string; from?: string; to?: string; image?: boolean; forever?: boolean; editedAt?: number; icon?: string; guide?: boolean; auto?: "icon" }; // icon: 공지에 크게 보여 줄 앱 아이콘 시즌, guide: 홈 화면에 추가 방법 안내 이미지 // from·to: 노출 기간 YYYY-MM-DD(한국 날짜). to를 비우면 시작일부터 3일, forever면 계속
export const NOTICE_DEFAULT_DAYS = 3;
const kstDate = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
/** 노출 마지막 날(한국 날짜). 계속 노출이면 null */
export const noticeEnd = (n: Notice): string | null => {
  if (n.to) return n.to;
  if (n.forever) return null;
  const start = n.from ?? kstDate(n.at);
  return kstDate(Date.parse(`${start}T00:00:00Z`) + (NOTICE_DEFAULT_DAYS - 1) * 86400e3 - 9 * 3600e3);
};
/** 오늘(한국 날짜)에 홈에 보여야 하는 공지인가 */
export const noticeState = (n: Notice, today: string): "scheduled" | "live" | "ended" => {
  const end = noticeEnd(n);
  return n.from && today < n.from ? "scheduled" : end && today > end ? "ended" : "live";
};
const NOTICES = "r2u:notices";
const noticeImageKey = (id: string) => `r2u:noticeImage:${id}`;
const PUSH = "r2u:push";

/* 홈에 한꺼번에 보여 줄 공지 개수 (운영진이 정한다, 기본 1개) */
const HOME_COUNT_KEY = "r2u:cfg:homeNoticeCount";
export const MAX_HOME_NOTICES = 5;
export async function homeNoticeCount(): Promise<number> {
  try {
    const n = Number(await redis.get(HOME_COUNT_KEY));
    return Number.isInteger(n) && n >= 1 && n <= MAX_HOME_NOTICES ? n : 1;
  } catch { return 1; }
}
export async function setHomeNoticeCount(n: number) { await redis.set(HOME_COUNT_KEY, String(n)); }

export async function getNotices(): Promise<Notice[]> {
  const raw = await redis.get<Notice[] | string>(NOTICES);
  const v = typeof raw === "string" ? (JSON.parse(raw) as Notice[]) : raw;
  return Array.isArray(v) ? v : [];
}
export async function addNotice(n: Omit<Notice, "id" | "at">, image?: { type: string; data: string }) {
  const previous = await getNotices();
  const next = { ...n, id: newId(), at: Date.now(), ...(image ? { image: true } : {}) };
  const list = [next, ...previous];
  const tx = redis.multi();
  if (image) tx.set(noticeImageKey(next.id), image);
  tx.set(NOTICES, JSON.stringify(list));
  await tx.exec();
  return next;
}
export async function updateNotice(
  id: string,
  patch: Pick<Notice, "title" | "body" | "from" | "to" | "forever">,
  image?: { type: string; data: string } | "remove",
): Promise<boolean> {
  const list = await getNotices();
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return false;
  const { from, to, forever, ...rest } = patch;
  const next: Notice = { ...list[i], ...rest, editedAt: Date.now() };
  delete next.from; delete next.to; delete next.forever;
  if (from) next.from = from;
  if (to) next.to = to;
  if (forever && !to) next.forever = true;
  const tx = redis.multi();
  if (image === "remove") { delete next.image; tx.del(noticeImageKey(id)); }
  else if (image) { next.image = true; tx.set(noticeImageKey(id), image); }
  list[i] = next;
  tx.set(NOTICES, JSON.stringify(list));
  await tx.exec();
  return true;
}
export async function deleteNotice(id: string) {
  const tx = redis.multi();
  tx.set(NOTICES, JSON.stringify((await getNotices()).filter((n) => n.id !== id)));
  tx.del(noticeImageKey(id));
  await tx.exec();
}
export async function getNoticeImage(id: string): Promise<{ type: string; data: string } | null> {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  return await redis.get<{ type: string; data: string }>(noticeImageKey(id));
}

/* ---------- 운영진 알림 켜기/끄기 (단사·뒷풀이에 못 온다고 누르면 운영진에게 가는 알림) ---------- */
const ADMIN_ABSENT_KEY = "r2u:cfg:adminAbsentNotify"; // "0" 이면 끔, 없으면 켬
export async function adminAbsentNoticeOn(): Promise<boolean> {
  try { return String(await redis.get(ADMIN_ABSENT_KEY)) !== "0"; } catch { return true; }
}
export async function setAdminAbsentNotice(on: boolean) {
  if (on) await redis.del(ADMIN_ABSENT_KEY); else await redis.set(ADMIN_ABSENT_KEY, "0");
}

/* ---------- 웹 푸시 알림 ---------- */
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
const key = (endpoint: string) => createHash("sha256").update(endpoint).digest("base64url").slice(0, 24);

export async function saveSub(nick: string, sub: Sub) {
  await redis.hset(PUSH, { [key(sub.endpoint)]: JSON.stringify({ sub, nick }) });
}
export async function removeSub(endpoint: string) {
  await redis.hdel(PUSH, key(endpoint));
}
export async function subCount() {
  return (await getPushEnabledNicks()).size;
}
export async function getPushEnabledNicks(): Promise<Set<string>> {
  const all = (await redis.hgetall<Record<string, unknown>>(PUSH)) ?? {};
  const nicks = new Set<string>();
  for (const value of Object.values(all)) {
    try {
      const entry = (typeof value === "string" ? JSON.parse(value) : value) as { nick?: string; sub?: Sub };
      if (entry.nick && entry.sub?.endpoint) nicks.add(entry.nick);
    } catch { /* 이전 형식이나 손상된 구독은 상태에서 제외 */ }
  }
  return nicks;
}
export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** 모든 구독자에게 알림을 보낸다. 만료된 구독(404/410)은 지운다. */
export async function sendPushAll(title: string, body: string, url = "/") {
  if (!pushReady()) return { sent: 0, failed: 0, skipped: true };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const all = (await redis.hgetall<Record<string, unknown>>(PUSH)) ?? {};
  const payload = JSON.stringify({ title, body, url });
  let sent = 0, failed = 0;
  await Promise.all(Object.entries(all).map(async ([k, v]) => {
    try {
      const { sub } = (typeof v === "string" ? JSON.parse(v) : v) as { sub: Sub };
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await redis.hdel(PUSH, k);
    }
  }));
  return { sent, failed, skipped: false };
}

/** 지정된 크루원의 등록 기기에만 알림을 보낸다. */
export async function sendPushToNicks(nicks: Set<string>, title: string, body: string, url = "/") {
  if (!pushReady()) return { sent: 0, failed: 0, skipped: true };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const all = (await redis.hgetall<Record<string, unknown>>(PUSH)) ?? {};
  const payload = JSON.stringify({ title, body, url });
  let sent = 0, failed = 0;
  await Promise.all(Object.entries(all).map(async ([field, value]) => {
    try {
      const { sub, nick } = (typeof value === "string" ? JSON.parse(value) : value) as { sub: Sub; nick: string };
      if (!nicks.has(nick) || !sub?.endpoint) return;
      await webpush.sendNotification(sub, payload, { TTL: 600 });
      sent++;
    } catch (error) {
      failed++;
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await redis.hdel(PUSH, field);
    }
  }));
  return { sent, failed, skipped: false };
}
