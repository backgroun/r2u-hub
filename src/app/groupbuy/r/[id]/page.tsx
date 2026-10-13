import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrders, getRound, listOrder, publicRound, summarize } from "@/lib/db";
import { fmtDeadline, minLabel } from "@/lib/types";
import OrderView from "./order-view";
import { currentUser } from "@/lib/hub";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRound((await params).id);
  if (!r) return { title: "R2U 크루 공구" };
  return {
    title: r.title,
    description: `공구 오픈자 ${r.opener} · ${fmtDeadline(r.deadline)} 마감 · ${minLabel(r.minQty)}`,
  };
}

export default async function RoundPage({ params }: Props) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) notFound();
  const [orders, u] = await Promise.all([getOrders(id), currentUser()]);
  // 로그인한 크루원 닉네임을 주문서에 미리 채운다 (관리용 ‘운영진’ 계정은 제외)
  const me = u && u.nick !== "운영진" ? u.nick : "";
  return <OrderView round={publicRound(r)} initialSummary={summarize(r, orders)} initialOrders={orders.map(listOrder)} me={me} />;
}
