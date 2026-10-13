import { NextResponse } from "next/server";
import { getRound } from "@/lib/db";
import { nickKey } from "@/lib/types";
import { currentUser } from "@/lib/hub";

// 로그인한 공구 오픈자(또는 허브 운영진)에게 관리 키를 준다. 관리 비밀번호 없이 관리 화면에 들어가기 위함.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r, u] = await Promise.all([getRound(id), currentUser()]);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const isOpener = !!u && (r.openerNick === u.nick || nickKey(r.opener) === nickKey(u.nick));
  if (!u || !(isOpener || u.admin)) return NextResponse.json({ error: "공구를 연 사람만 관리할 수 있어요." }, { status: 403 });
  return NextResponse.json({ adminKey: r.adminKey }, { headers: { "cache-control": "no-store" } });
}
