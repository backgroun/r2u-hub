import { NextResponse } from "next/server";
import { currentUser } from "@/lib/hub";
import { savePhoto } from "@/lib/bingo-store";

// 인증 사진 올리기: 본인 폴더(닉네임/…)에만, JPEG 1MB 이하로.
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "login" }, { status: 401 });
  const parts = (await ctx.params).path.map(decodeURIComponent);
  const path = parts.join("/");
  if (parts.length !== 2 || parts[0] !== u.nick || !/^\d{1,2}-[0-9a-f]{12}\.jpg$/.test(parts[1])) return NextResponse.json({ error: "path" }, { status: 400 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > 1_100_000) return NextResponse.json({ error: "size" }, { status: 413 });
  await savePhoto(path, bytes);
  return NextResponse.json({ ok: true });
}
