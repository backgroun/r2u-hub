import { currentUser } from "@/lib/hub";
import { getPollImage, POLL_LIMITS } from "@/lib/groupbuy-poll";

/** 공구 투표 첨부 이미지: 로그인한 크루원만 볼 수 있다 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const { id, n } = await params;
  const i = Number(n);
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id) || !Number.isInteger(i) || i < 0 || i >= POLL_LIMITS.maxOptions) return new Response(null, { status: 404 });
  const img = await getPollImage(id, i);
  if (!img) return new Response(null, { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), { headers: { "content-type": img.type, "cache-control": "private, max-age=86400" } });
}
