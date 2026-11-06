import { NextResponse } from "next/server";
import { delRoundImage, getRound, keyMatches, publicRound, ROUND_IMAGE_MAX_BYTES, saveRound, setRoundImage, type RoundImageKey } from "@/lib/db";
import { designSlots, MAX_DESIGN_IMAGES } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 요청의 이미지 칸: kind "size" = 사이즈표, 그 외 = 시안 이미지(slot 0~4, 없으면 0번) */
function keyOf(body: { kind?: unknown; slot?: unknown }): RoundImageKey | null {
  if (body.kind === "size") return "size";
  const slot = body.slot === undefined ? 0 : Number(body.slot);
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_DESIGN_IMAGES ? slot : null;
}

// 운영자: 단체 제작 시안·사이즈표 이미지 올리기(PUT)·지우기(DELETE). 운영자 키가 맞아야 한다.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  if (!r.custom) return NextResponse.json({ error: "단체 제작 공구에만 시안 이미지를 올릴 수 있어요." }, { status: 400 });
  const k = keyOf(body);
  if (k === null) return NextResponse.json({ error: `시안 이미지는 최대 ${MAX_DESIGN_IMAGES}장까지 올릴 수 있어요.` }, { status: 400 });
  const { type, data } = body as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !TYPES.includes(type) || typeof data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(data)) return NextResponse.json({ error: "이미지 형식이 올바르지 않아요." }, { status: 400 });
  if (Math.floor((data.length * 3) / 4) > ROUND_IMAGE_MAX_BYTES) return NextResponse.json({ error: "이미지가 너무 커요. 더 작은 사진을 올려 주세요." }, { status: 400 });
  await setRoundImage(id, { type, data }, k);
  if (k === "size") r.custom.sizeImage = true;
  else { r.custom.images = [...new Set([...designSlots(r.custom), k])].sort((a, b) => a - b); delete r.custom.image; }
  await saveRound(r);
  return NextResponse.json({ round: publicRound(r) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  const k = keyOf(body);
  if (k === null) return NextResponse.json({ error: "지울 이미지를 찾을 수 없어요." }, { status: 400 });
  await delRoundImage(id, k);
  if (r.custom) {
    if (k === "size") delete r.custom.sizeImage;
    else {
      const left = designSlots(r.custom).filter((n) => n !== k);
      if (left.length) r.custom.images = left; else delete r.custom.images;
      delete r.custom.image;
    }
    await saveRound(r);
  }
  return NextResponse.json({ round: publicRound(r) });
}
