import { NextResponse } from "next/server";
import { currentUser } from "@/lib/hub";

// 허브에 로그인한 닉네임 (빙고 입장 화면 자동 선택용). 관리용 ‘운영진’ 계정은 알려주지 않는다.
export async function GET() {
  const u = await currentUser();
  const nick = u && u.nick !== "운영진" ? u.nick : null;
  return NextResponse.json({ nick }, { headers: { "cache-control": "no-store" } });
}
