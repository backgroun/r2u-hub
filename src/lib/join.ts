import "server-only";
import { redis, newId } from "@/lib/hub";

/* ---------- 닉네임 생성 요청 (신규 크루원 → 링크 → 운영진 승인) ---------- */
export type JoinReq = { id: string; nick: string; at: number; status: "pending" | "approved" | "rejected"; by?: string; sheet?: "ok" | "skipped" | "failed" };
const JOIN = "r2u:joinreq";
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export async function getJoin(id: string): Promise<JoinReq | null> {
  const v = await redis.hget(JOIN, id);
  return v ? parse<JoinReq>(v) : null;
}
export async function saveJoin(r: JoinReq) {
  await redis.hset(JOIN, { [r.id]: JSON.stringify(r) });
}
export async function listJoins(): Promise<JoinReq[]> {
  const h = (await redis.hgetall<Record<string, unknown>>(JOIN)) ?? {};
  return Object.values(h).map((v) => parse<JoinReq>(v)).sort((a, b) => b.at - a.at);
}
export const newJoinId = () => newId() + newId() + newId(); // 링크 주소 역할이라 길게

/** 구글시트 회원 탭 A열에 닉네임을, B열에 등록일시(한국 시간)를 추가한다. 시트에 붙인 Apps Script(웹앱) 주소가 있어야 한다. docs/members-sheet-webhook.gs 참고 */
export async function appendMemberToSheet(nick: string, when = new Date()): Promise<"ok" | "skipped" | "failed"> {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, redirect: "follow", cache: "no-store",
      body: JSON.stringify({ secret, action: "addMember", nick, registeredAt: new Date(when.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") }), signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && j?.ok ? "ok" : "failed";
  } catch { return "failed"; }
}

/** 운영진이 처리해야 할 대기 중인 닉네임 요청 수 (메뉴 뱃지용) */
export async function pendingJoinCount() {
  return (await listJoins()).filter((r) => r.status === "pending").length;
}
