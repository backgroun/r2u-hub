import { NextResponse } from "next/server";
import { allowEventPreview, currentUser } from "@/lib/hub";

// 오픈 전 이벤트(빙고)는 운영진만 열어 볼 수 있다. 운영진이면 미리보기 쿠키를 주고 빙고로 보낸다.
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u?.admin) return NextResponse.redirect(new URL("/event", req.url));
  await allowEventPreview(u.nick);
  const staff = new URL(req.url).searchParams.has("staff"); // 운영진 페이지의 ‘빙고 운영진 모드’ 버튼용
  return NextResponse.redirect(new URL(staff ? "/event?staff=1" : "/event", req.url));
}
