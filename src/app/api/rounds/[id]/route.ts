import { NextResponse } from "next/server";
import { deleteRound, getOrders, getRound, hashPassword, keyMatches, listOrder, publicRound, saveRound, summarize } from "@/lib/db";
import { BadInput, parseRoundInput } from "@/lib/validate";

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
  try {
    if (typeof body.closed === "boolean") r.closed = body.closed;
    if (body.round) Object.assign(r, parseRoundInput(body.round));
    if (typeof body.password === "string") {
      if (body.password.length < 4 || body.password.length > 30) throw new BadInput("관리 비밀번호는 4자 이상으로 정해 주세요.");
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
  await deleteRound(id);
  return NextResponse.json({ ok: true });
}
