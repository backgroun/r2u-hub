import { NextResponse } from "next/server";
import { getOrders, getRound, hashPassword, newId, nextBib, publicOrder, saveOrder } from "@/lib/db";
import { nickKey, roundStatus } from "@/lib/types";
import { BadInput, parseOrderInput } from "@/lib/validate";
import { currentUser, isStaffNick } from "@/lib/hub";
import { pts, setPoints } from "@/lib/points";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  if (roundStatus(r, 0) !== "open") return NextResponse.json({ error: "접수가 마감된 공구예요." }, { status: 409 });
  try {
    // 로그인한 크루원이 주문하므로 주문 비밀번호는 받지 않는다 (예전 주문은 비밀번호도 계속 통함)
    const { password, ...input } = parseOrderInput(await req.json(), r.items, false);
    const u = await currentUser();
    if ((await getOrders(id)).some((o) => nickKey(o.name) === nickKey(input.name)))
      return NextResponse.json({ error: `‘${input.name}’ 닉네임으로 이미 주문했어요. 아래 주문 현황에서 ‘내 주문’을 눌러 수정해 주세요.` }, { status: 409 });
    const now = Date.now();
    const order = { ...input, id: newId(), bib: await nextBib(id), paid: false, delivered: false, pwHash: password ? hashPassword(password) : undefined, owner: u && !isStaffNick(u.nick) ? u.nick : undefined, createdAt: now, updatedAt: now };
    await saveOrder(id, order);
    await setPoints(order.owner, `gb:${id}`, (await pts()).gb, "공구 주문");
    return NextResponse.json({ order: publicOrder(order) });
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
