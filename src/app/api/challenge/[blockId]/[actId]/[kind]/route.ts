import { currentUser } from "@/lib/hub";
import { getActRec, getImage } from "@/lib/challenge/store";
import { IMG_KINDS, type ImgKind } from "@/lib/challenge/rules";

// 캡처는 올린 본인과 운영진만 볼 수 있다. (다른 참가자에게는 보이지 않는다)
export async function GET(_req: Request, { params }: { params: Promise<{ blockId: string; actId: string; kind: string }> }) {
  const u = await currentUser();
  if (!u) return new Response(null, { status: 401 });
  const { blockId, actId, kind } = await params;
  if (!(IMG_KINDS as string[]).includes(kind)) return new Response(null, { status: 404 });
  const act = await getActRec(blockId, actId);
  if (!act || (act.nick !== u.nick && !u.admin)) return new Response(null, { status: 404 });
  const img = await getImage(blockId, actId, kind as ImgKind);
  if (!img) return new Response(null, { status: 404 });
  return new Response(Buffer.from(img.data, "base64"), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=3600" }, // 주소에 ?v=수정시각을 붙여 바뀌면 새로 받는다
  });
}
