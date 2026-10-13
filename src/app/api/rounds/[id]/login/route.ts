import { NextResponse } from "next/server";
import { checkPassword, getRound, loginBlocked, recordLoginFail } from "@/lib/db";

// 공구 오픈자: 비밀번호 → 관리 키
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  if (await loginBlocked(id))
    return NextResponse.json({ error: "비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요." }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !checkPassword(password, r.pwHash)) {
    await recordLoginFail(id);
    return NextResponse.json({ error: "비밀번호가 맞지 않아요." }, { status: 403 });
  }
  return NextResponse.json({ adminKey: r.adminKey });
}
