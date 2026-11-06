import { currentUser } from "@/lib/hub";
import { getRoundImage } from "@/lib/db";

/** 단체 제작 시안 이미지: 로그인한 크루원만 볼 수 있다 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(id)) return new Response(null, { status: 404 });
  const img = await getRoundImage(id, new URL(request.url).searchParams.get("k") === "size" ? "size" : "design"); // ?k=size 는 사이즈표
  if (!img) return new Response(null, { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), { headers: { "content-type": img.type, "cache-control": "private, no-cache" } });
}
