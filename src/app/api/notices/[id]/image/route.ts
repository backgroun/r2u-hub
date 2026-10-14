import { currentUser } from "@/lib/hub";
import { getNoticeImage } from "@/lib/notice";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response(null, { status: 401 });
  const { id } = await params;
  const image = await getNoticeImage(id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(Buffer.from(image.data, "base64"), {
    headers: { "content-type": image.type, "cache-control": "private, max-age=300" },
  });
}
