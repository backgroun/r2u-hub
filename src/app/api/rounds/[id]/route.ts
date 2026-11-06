import { NextResponse } from "next/server";
import { delAllDesignImages, delRoundImage, deleteRound, getOrders, getRound, hashPassword, keyMatches, listOrder, publicRound, saveRound, summarize } from "@/lib/db";
import { BadInput, parsePickup, parseRoundInput } from "@/lib/validate";
import { designSlots } from "@/lib/types";
import { CONFIRM_REQUIRED, isConfirmed } from "@/lib/confirm-token";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const orders = await getOrders(id);
  return NextResponse.json({ round: publicRound(r), summary: summarize(r, orders), orders: orders.map(listOrder) });
}

// 운영자: 마감/재오픈, 내용 수정
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json();
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  // 접수를 마감하는 일은 되돌리기 번거로워서 본인 비밀번호 확인이 필요하다 (다시 여는 것은 그대로)
  if (body.closed === true && !r.closed && !(await isConfirmed(body.confirmToken))) return NextResponse.json({ error: CONFIRM_REQUIRED }, { status: 403 });
  try {
    if (typeof body.closed === "boolean") r.closed = body.closed;
    // 배포 장소만 따로 추가·수정 (공구를 연 뒤에 정하는 경우)
    if (body.pickup && typeof body.pickup === "object") r.pickup = parsePickup(body.pickup);
    if (typeof body.archived === "boolean") { if (body.archived) r.archived = true; else delete r.archived; } // 종료 공구 보관/해제
    if (body.round) {
      const hadSlots = designSlots(r.custom), hadSize = !!r.custom?.sizeImage; // 이미지 표시는 이미지 API 만 바꾼다 (화면에서 보낸 값은 믿지 않는다)
      Object.assign(r, parseRoundInput(body.round));
      if (r.custom) { if (hadSlots.length) r.custom.images = hadSlots; if (hadSize) r.custom.sizeImage = true; }
      else { // 단체 제작이 아니게 바뀌면 이미지도 지운다
        if (hadSlots.length) await delAllDesignImages(id);
        if (hadSize) await delRoundImage(id, "size");
      }
    }
    if (typeof body.password === "string") {
      if (body.password.length < 4 || body.password.length > 30) throw new BadInput("관리 비밀번호는 4자 이상으로 정해 주세요.");
      if (!/^[a-z0-9]+$/.test(body.password)) throw new BadInput("관리 비밀번호는 영문 소문자와 숫자만 사용할 수 있어요.");
      r.pwHash = hashPassword(body.password);
    }
    await saveRound(r);
    return NextResponse.json({ round: publicRound(r) });
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ ok: true });
  const key = new URL(req.url).searchParams.get("key");
  if (!keyMatches(key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { confirmToken?: unknown };
  if (!(await isConfirmed(body.confirmToken))) return NextResponse.json({ error: CONFIRM_REQUIRED }, { status: 403 }); // 공구 삭제는 비밀번호 확인 필요
  await deleteRound(id);
  return NextResponse.json({ ok: true });
}
