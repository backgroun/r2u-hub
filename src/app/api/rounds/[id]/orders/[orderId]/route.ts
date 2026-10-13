import { NextResponse } from "next/server";
import { checkPassword, deleteOrder, getOrder, getOrders, getRound, keyMatches, listOrder, loginBlocked, publicOrder, recordLoginFail, saveOrder } from "@/lib/db";
import { nickKey, roundStatus, type StoredOrder, type StoredRound } from "@/lib/types";
import { BadInput, parseOrderInput } from "@/lib/validate";
import { currentUser } from "@/lib/hub";

type Ctx = { params: Promise<{ id: string; orderId: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** 본인(허브 로그인 닉네임) · 허브 운영진 · 공구 오픈자(관리 키) · 예전 주문 비밀번호 순으로 확인 */
async function authorize(req: Request, ctx: Ctx) {
  const { id, orderId } = await ctx.params;
  const r = await getRound(id);
  const o = r ? await getOrder(id, orderId) : null;
  if (!r || !o) return { res: fail("주문을 찾을 수 없어요.", 404) };
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (keyMatches(body.adminKey as string, r.adminKey)) return { id, r, o, body, who: "admin" as const };
  const u = await currentUser();
  if (u && (o.owner === u.nick || nickKey(o.name) === nickKey(u.nick))) return { id, r, o, body, who: "owner" as const };
  if (u?.admin) return { id, r, o, body, who: "admin" as const };
  const failKey = `${id}:${orderId}`;
  if (await loginBlocked(failKey)) return { res: fail("비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요.", 429) };
  if (!o.pwHash) return { res: fail("본인 주문만 바꿀 수 있어요.", 403) };
  if (typeof body.password !== "string" || !checkPassword(body.password, o.pwHash)) {
    await recordLoginFail(failKey);
    return { res: fail("비밀번호가 맞지 않아요.", 403) };
  }
  return { id, r, o, body, who: "owner" as const };
}

const isOpen = (r: StoredRound) => roundStatus(r, 0) === "open";

async function save(id: string, o: StoredOrder) {
  o.updatedAt = Date.now();
  await saveOrder(id, o);
}

// 내 주문 확인 (비밀번호) → 입금자명·메모까지
export async function POST(req: Request, ctx: Ctx) {
  const a = await authorize(req, ctx);
  if (a.res) return a.res;
  return NextResponse.json({ order: publicOrder(a.o) });
}

// 입금완료·수령완료: 신청자 (공구 오픈자도 대신 가능)
export async function PUT(req: Request, ctx: Ctx) {
  const a = await authorize(req, ctx);
  if (a.res) return a.res;
  const { id, o, body } = a;
  if (typeof body.paid === "boolean") o.paid = body.paid;
  if (typeof body.delivered === "boolean") o.delivered = body.delivered;
  await save(id, o);
  return NextResponse.json({ order: listOrder(o) });
}

// 주문 수정 (마감 전, 신청자)
export async function PATCH(req: Request, ctx: Ctx) {
  const a = await authorize(req, ctx);
  if (a.res) return a.res;
  const { id, r, o, body, who } = a;
  if (who === "owner" && !isOpen(r)) return fail("마감된 뒤에는 공구 오픈자에게 수정을 요청해 주세요.", 409);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...input } = parseOrderInput(body, r.items, false);
    if ((await getOrders(id)).some((x) => x.id !== o.id && nickKey(x.name) === nickKey(input.name)))
      return fail(`‘${input.name}’ 닉네임으로 이미 다른 주문이 있어요.`, 409);
    Object.assign(o, input);
  } catch (e) {
    if (e instanceof BadInput) return fail(e.message, 400);
    throw e;
  }
  await save(id, o);
  return NextResponse.json({ order: publicOrder(o) });
}

// 주문 취소: 신청자(마감 전) 또는 공구 오픈자
export async function DELETE(req: Request, ctx: Ctx) {
  // 예전 방식(?adminKey=) 호환
  const qKey = new URL(req.url).searchParams.get("adminKey");
  if (qKey) {
    const { id, orderId } = await ctx.params;
    const r = await getRound(id);
    if (!r) return NextResponse.json({ ok: true });
    if (!keyMatches(qKey, r.adminKey)) return fail("운영자 링크가 아니에요.", 403);
    await deleteOrder(id, orderId);
    return NextResponse.json({ ok: true });
  }
  const a = await authorize(req, ctx);
  if (a.res) return a.res;
  if (a.who === "owner" && !isOpen(a.r)) return fail("마감된 뒤에는 공구 오픈자에게 취소를 요청해 주세요.", 409);
  await deleteOrder(a.id, a.o.id);
  return NextResponse.json({ ok: true });
}
