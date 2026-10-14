import { currentUser } from "@/lib/hub";
import { getPhoto } from "@/lib/bingo-store";

// 인증 사진 보기 (허브에 로그인한 크루원만)
export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await currentUser())) return new Response("login", { status: 401 });
  const path = (await ctx.params).path.map(decodeURIComponent).join("/");
  const img = await getPhoto(path);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), { headers: { "content-type": img.type, "cache-control": "private, max-age=31536000, immutable" } });
}
