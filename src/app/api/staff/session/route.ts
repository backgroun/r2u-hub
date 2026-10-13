import { NextResponse } from "next/server";
import { currentUser } from "@/lib/hub";
import { staffToken } from "@/lib/db";

// 허브 운영진에게 공구 운영진 토큰을 내준다.
export async function GET() {
  const u = await currentUser();
  if (!u?.admin) return NextResponse.json({ error: "허브 운영진만 쓸 수 있어요." }, { status: 403 });
  return NextResponse.json({ token: staffToken() });
}
