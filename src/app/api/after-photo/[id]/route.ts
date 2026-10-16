import { K, currentUser, redis } from "@/lib/hub";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return new Response(null, { status: 404 });
  const img = await redis.get<{ type: string; data: string }>(K.afterPhoto(id));
  if (!img) return new Response(null, { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), { headers: { "content-type": img.type, "cache-control": "private, max-age=3600" } });
}
