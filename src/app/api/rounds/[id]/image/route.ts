import { NextResponse } from "next/server";
import { delRoundImage, getRound, keyMatches, publicRound, ROUND_IMAGE_MAX_BYTES, saveRound, setRoundImage } from "@/lib/db";

const kindOf = (v: unknown) => (v === "size" ? ("size" as const) : ("design" as const)); // 시안 이미지 / 사이즈표 이미지

type Ctx = { params: Promise<{ id: string }> };
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// 운영자: 단체 제작 시안 이미지 올리기(PUT)·지우기(DELETE). 운영자 키가 맞아야 한다.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  if (!r.custom) return NextResponse.json({ error: "단체 제작 공구에만 시안 이미지를 올릴 수 있어요." }, { status: 400 });
  const { type, data } = body as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !TYPES.includes(type) || typeof data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(data)) return NextResponse.json({ error: "이미지 형식이 올바르지 않아요." }, { status: 400 });
  if (Math.floor((data.length * 3) / 4) > ROUND_IMAGE_MAX_BYTES) return NextResponse.json({ error: "이미지가 너무 커요. 더 작은 사진을 올려 주세요." }, { status: 400 });
  const kind = kindOf(body.kind);
  await setRoundImage(id, { type, data }, kind);
  if (kind === "size") r.custom.sizeImage = true; else r.custom.image = true;
  await saveRound(r);
  return NextResponse.json({ round: publicRound(r) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  const kind = kindOf(body.kind);
  await delRoundImage(id, kind);
  if (r.custom) {
    if (kind === "size" && r.custom.sizeImage) { delete r.custom.sizeImage; await saveRound(r); }
    else if (kind === "design" && r.custom.image) { delete r.custom.image; await saveRound(r); }
  }
  return NextResponse.json({ round: publicRound(r) });
}
