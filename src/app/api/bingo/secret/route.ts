import { NextResponse } from "next/server";
import { currentUser, redis } from "@/lib/hub";

// 허브 운영진에게만 빙고 운영진 비밀 문장을 내준다 (빙고 화면 자동 입장용).
export async function GET() {
  const u = await currentUser();
  if (!u?.admin) return NextResponse.json({ error: "허브 운영진만 쓸 수 있어요." }, { status: 403 });
  return NextResponse.json({ secret: (await redis.get<string>("r2u:bingoSecret")) ?? null }, { headers: { "cache-control": "no-store" } });
}
