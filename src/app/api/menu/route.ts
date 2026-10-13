import { NextResponse } from "next/server";
import { getMenu } from "@/lib/hub";

// 빙고(정적 화면) 탭바가 허브와 같은 메뉴 이름을 쓰도록 알려 준다
export async function GET() {
  return NextResponse.json(await getMenu(), { headers: { "cache-control": "no-store" } });
}
