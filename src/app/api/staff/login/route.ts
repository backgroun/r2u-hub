import { NextResponse } from "next/server";
import { keyMatches, loginBlocked, recordLoginFail, staffEnabled, staffToken } from "@/lib/db";

export async function POST(req: Request) {
  if (!staffEnabled() || !process.env.STAFF_PASSWORD) return NextResponse.json({ error: "운영진 비밀번호가 아직 설정되지 않았어요." }, { status: 503 });
  if (await loginBlocked("staff"))
    return NextResponse.json({ error: "비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요." }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !keyMatches(password, process.env.STAFF_PASSWORD!)) {
    await recordLoginFail("staff");
    return NextResponse.json({ error: "운영진 비밀번호가 맞지 않아요." }, { status: 403 });
  }
  return NextResponse.json({ token: staffToken() });
}
