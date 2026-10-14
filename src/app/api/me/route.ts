import { NextResponse } from "next/server";
import { currentUser, redis } from "@/lib/hub";
import { EVENT_NICKS_KEY } from "@/lib/sheet";
import { hubPeriod } from "@/lib/event";

// 허브에 로그인한 닉네임 (빙고 입장 화면 자동 선택용). 관리용 ‘운영진’ 계정은 알려주지 않는다.
export async function GET() {
  const u = await currentUser();
  const nick = u && u.nick !== "운영진" ? u.nick : null;
  // 이벤트 참가자 명단(회원 시트 C열). 빙고 입장 화면의 선택 목록을 이 명단으로 좁힌다
  const raw = u ? await redis.get<string[] | string>(EVENT_NICKS_KEY) : null;
  const eventNicks: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
  return NextResponse.json({ nick, eventNicks, eventPeriod: u ? await hubPeriod() : null, admin: !!u?.admin, staff: u?.nick === "운영진" }, { headers: { "cache-control": "no-store" } });
}
