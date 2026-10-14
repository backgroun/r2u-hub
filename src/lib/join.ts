import "server-only";
import { redis, newId } from "@/lib/hub";

/* ---------- 닉네임 생성 요청 (신규 크루원 → 링크 → 운영진 승인) ---------- */
export type JoinReq = { id: string; nick: string; at: number; status: "pending" | "approved" | "rejected"; by?: string; reason?: string; sheet?: "ok" | "skipped" | "failed" };
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

/** 구글시트 회원 탭 A열에 닉네임을 추가한다. B열 이름은 운영진이 적는다. */
export async function appendMemberToSheet(nick: string): Promise<"ok" | "skipped" | "failed"> {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, redirect: "follow", cache: "no-store",
      body: JSON.stringify({ secret, action: "addMember", nick, registeredAt: "" }), signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && j?.ok ? "ok" : "failed";
  } catch { return "failed"; }
}

/** 닉네임 승인 후 회원 시트 A열을 새 닉네임으로 바꾸고 B열에 이름을 유지한다. */
export async function renameMemberInSheet(oldNick: string, newNick: string, name: string): Promise<"ok" | "skipped" | "failed"> {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, redirect: "follow", cache: "no-store",
      body: JSON.stringify({ secret, action: "renameMember", oldNick, newNick, name }), signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && j?.ok ? "ok" : "failed";
  } catch { return "failed"; }
}

/** 회원 시트 B열의 이름을 바꾼다. 빈 이름은 빈칸으로 저장한다. */
export async function updateMemberNameInSheet(nick: string, name: string): Promise<"ok" | "skipped" | "failed"> {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, redirect: "follow", cache: "no-store",
      body: JSON.stringify({ secret, action: "updateMemberName", nick, name }), signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && j?.ok ? "ok" : "failed";
  } catch { return "failed"; }
}

const PENDING_MEMBER_NAMES = "r2u:pendingMemberNames";

/** Keep local name edits from being overwritten by a sheet import until the webhook catches up. */
export async function queueMemberNameForSheet(nick: string, name: string) {
  await redis.hset(PENDING_MEMBER_NAMES, { [nick]: name });
}

export async function clearQueuedMemberName(nick: string) {
  await redis.hdel(PENDING_MEMBER_NAMES, nick);
}

export async function pendingMemberNames(): Promise<Record<string, string>> {
  return (await redis.hgetall<Record<string, string>>(PENDING_MEMBER_NAMES)) ?? {};
}

/** 운영진이 처리해야 할 대기 중인 닉네임 요청 수 (메뉴 뱃지용) */
export async function pendingJoinCount() {
  return (await listJoins()).filter((r) => r.status === "pending").length;
}
