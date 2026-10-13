import { NextResponse } from "next/server";
import { getOrders, getRound, keyMatches, publicOrder, publicRound } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key");
  if (!keyMatches(key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  const orders = (await getOrders(id)).map(publicOrder);
  return NextResponse.json({ round: publicRound(r), orders });
}
