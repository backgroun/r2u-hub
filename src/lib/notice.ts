import "server-only";
import { createHash } from "crypto";
import webpush from "web-push";
import { redis, newId } from "@/lib/hub";

/* ---------- 공지사항 (운영진이 올리고 홈에 보인다) ---------- */
export type Notice = { id: string; title: string; body: string; at: number; by: string; from?: string; to?: string }; // from·to: 노출 기간 YYYY-MM-DD(한국 날짜), 비우면 제한 없음
/** 오늘(한국 날짜)에 홈에 보여야 하는 공지인가 */
export const noticeState = (n: Notice, today: string): "scheduled" | "live" | "ended" =>
  n.from && today < n.from ? "scheduled" : n.to && today > n.to ? "ended" : "live";
const NOTICES = "r2u:notices";
const PUSH = "r2u:push";

export async function getNotices(): Promise<Notice[]> {
  const raw = await redis.get<Notice[] | string>(NOTICES);
  const v = typeof raw === "string" ? (JSON.parse(raw) as Notice[]) : raw;
  return Array.isArray(v) ? v : [];
}
export async function addNotice(n: Omit<Notice, "id" | "at">) {
  const list = [{ ...n, id: newId(), at: Date.now() }, ...(await getNotices())].slice(0, 30);
  await redis.set(NOTICES, JSON.stringify(list));
  return list[0];
}
export async function deleteNotice(id: string) {
  await redis.set(NOTICES, JSON.stringify((await getNotices()).filter((n) => n.id !== id)));
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
  return Object.keys((await redis.hgetall(PUSH)) ?? {}).length;
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
