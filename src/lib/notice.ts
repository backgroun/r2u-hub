import "server-only";
import { createHash } from "crypto";
import webpush from "web-push";
import { redis, newId } from "@/lib/hub";

/* ---------- 공지사항 (운영진이 올리고 홈에 보인다) ---------- */
export type Notice = { id: string; title: string; body: string; at: number; by: string; from?: string; to?: string; image?: boolean }; // from·to: 노출 기간 YYYY-MM-DD(한국 날짜), 비우면 제한 없음
/** 오늘(한국 날짜)에 홈에 보여야 하는 공지인가 */
export const noticeState = (n: Notice, today: string): "scheduled" | "live" | "ended" =>
  n.from && today < n.from ? "scheduled" : n.to && today > n.to ? "ended" : "live";
const NOTICES = "r2u:notices";
const noticeImageKey = (id: string) => `r2u:noticeImage:${id}`;
const PUSH = "r2u:push";

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
