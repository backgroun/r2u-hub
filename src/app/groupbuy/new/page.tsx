import { currentUser, isStaffNick } from "@/lib/hub";
import { getRound, publicRound } from "@/lib/db";
import NewRoundForm from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewRound({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const u = await currentUser();
  const { copy } = await searchParams;
  // ?copy=공구id → 그 공구의 계좌·배포 장소·상품·옵션을 가져와 새 공구 폼을 채운다 (마감일·주문·이름은 새로)
  const src = copy && /^[A-Za-z0-9_-]{6,30}$/.test(copy) ? await getRound(copy) : null;
  const copyOf = src ? (() => {
    const r = publicRound(src);
    return { id: r.id, round: { bank: r.bank, pickup: r.pickup, minQty: r.minQty, items: r.items, custom: r.custom } };
  })() : undefined;
  // 공구 오픈자 칸에 로그인한 닉네임을 미리 채운다 (관리용 ‘운영진’ 계정은 제외)
  return <NewRoundForm me={u && !isStaffNick(u.nick) ? u.nick : ""} copyOf={copyOf} />;
}
