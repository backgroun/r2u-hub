import { NextResponse } from "next/server";
import { currentUser, redis, seal, unseal } from "@/lib/hub";

// 빙고 비밀번호를 허브 로그인 본인에게만 보관·전달한다 (빙고 자동 입장용).
const KEY = "r2u:bingoPw";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function GET() {
  const u = await currentUser();
  if (!u || u.nick === "운영진") return NextResponse.json({ pw: null });
  const box = await redis.hget<string>(KEY, u.nick);
  return NextResponse.json({ pw: box ? unseal(box) : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || u.nick === "운영진") return NextResponse.json({ ok: false }, { status: 403 });
  const { name, pw } = await req.json().catch(() => ({}));
  // 빙고에 들어간 이름이 허브 닉네임과 같을 때만 저장 (다른 사람 비번을 내 것으로 저장하지 않게)
  if (typeof name !== "string" || typeof pw !== "string" || !same(name, u.nick) || pw.length < 4 || pw.length > 100)
    return NextResponse.json({ ok: false }, { status: 400 });
  await redis.hset(KEY, { [u.nick]: seal(pw) });
  return NextResponse.json({ ok: true });
}
