import { NextResponse } from "next/server";
import { getOrders, getRound, keyMatches, renumberOrders } from "@/lib/db";
import { CONFIRM_REQUIRED, isConfirmed } from "@/lib/confirm-token";

type Ctx = { params: Promise<{ id: string }> };

// 공구 오픈자: 주문번호를 1번부터 빈틈없이 다시 매긴다 (지금 번호 순서 그대로). 비밀번호 확인이 필요하다.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; confirmToken?: unknown };
  if (!keyMatches(typeof body.key === "string" ? body.key : null, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  if (!(await isConfirmed(body.confirmToken))) return NextResponse.json({ error: CONFIRM_REQUIRED }, { status: 403 });
  const changed = await renumberOrders(id);
  return NextResponse.json({ ok: true, changed, count: (await getOrders(id)).length });
}
