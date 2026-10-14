import { NextResponse } from "next/server";
import { currentUser } from "@/lib/hub";
import { removeSub, saveSub } from "@/lib/notice";

// 로그인한 크루원의 기기를 공지 알림 대상으로 등록/해제한다.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const sub = (await req.json().catch(() => null))?.sub;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ ok: false }, { status: 400 });
  await saveSub(u.nick, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const endpoint = (await req.json().catch(() => null))?.endpoint;
  if (endpoint) await removeSub(endpoint);
  return NextResponse.json({ ok: true });
}
