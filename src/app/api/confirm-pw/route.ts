import { NextResponse } from "next/server";
import { checkPw, currentRealUser, getMember, loginBlocked, recordFail } from "@/lib/hub";
import { issueConfirmToken } from "@/lib/confirm-token";

// 민감한 동작 전에 본인 로그인 비밀번호를 다시 확인한다. 맞으면 3분짜리 확인 토큰을 돌려준다.
// 틀리면 로그인과 같은 횟수 제한(10분에 10번)을 받는다.
export async function POST(req: Request) {
  const u = await currentRealUser();
  if (!u) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (await loginBlocked(u.nick)) return NextResponse.json({ error: "비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { pw?: unknown };
  const self = await getMember(u.nick);
  if (!self?.pw) return NextResponse.json({ error: "비밀번호가 설정돼 있지 않아 확인할 수 없어요." }, { status: 400 });
  if (typeof body.pw !== "string" || !checkPw(body.pw, self.pw)) {
    await recordFail(u.nick);
    return NextResponse.json({ error: "비밀번호가 맞지 않아요." }, { status: 403 });
  }
  return NextResponse.json({ token: issueConfirmToken(u.nick) });
}
