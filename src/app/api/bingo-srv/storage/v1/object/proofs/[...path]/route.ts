import { NextResponse } from "next/server";
import { currentUser } from "@/lib/hub";
import { savePhoto } from "@/lib/bingo-store";

// 인증 사진 올리기: 본인 폴더(닉네임/…)에만, JPEG 1MB 이하로.
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "login" }, { status: 401 });
  const parts = (await ctx.params).path.map(decodeURIComponent);
  const path = parts.join("/");
  if (parts.length !== 2 || parts[0] !== u.nick || !/^\d{1,2}-[0-9a-f]{12}(\.t)?\.jpg$/.test(parts[1])) return NextResponse.json({ error: "path" }, { status: 400 });
  const bytes = Buffer.from(await req.arrayBuffer());
  // 모자이크·목록용 작은 사진(.t.jpg)은 150KB 까지, 원본은 1.1MB 까지
  const limit = parts[1].endsWith(".t.jpg") ? 150_000 : 1_100_000;
  if (!bytes.length || bytes.length > limit) return NextResponse.json({ error: "size" }, { status: 413 });
  await savePhoto(path, bytes);
  return NextResponse.json({ ok: true });
}
