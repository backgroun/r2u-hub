import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isStaffAccount } from "@/lib/hub";
import { getOrders, listRounds } from "@/lib/db";
import { fmtPickup, itemLabel, nickKey, orderTotal, qtyOf, roundStatus, won } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 주문 이력" };

const FILTERS = [
  { k: "all", t: "전체" },
  { k: "unpaid", t: "입금 전" },
  { k: "todo", t: "수령 전" },
  { k: "done", t: "수령 완료" },
] as const;
type Filter = (typeof FILTERS)[number]["k"];

const kstDate = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 10).replace("-", "/");

/** 내 페이지 → 내가 주문한 이력만 모아 보는 화면 (내가 연 공구·다른 기록은 빼고 주문만) */
export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login?next=/me/orders");
  if (isStaffAccount(u)) redirect("/admin");
  const { f } = await searchParams;
  const filter: Filter = FILTERS.some((x) => x.k === f) ? (f as Filter) : "all";

  // 보관함으로 옮긴 공구까지 포함해 내가 주문한 것을 모두 찾는다 (로그인 닉네임 또는 주문 닉네임이 같은 것)
  const rounds = await listRounds(100);
  const lists = await Promise.all(rounds.map((x) => getOrders(x.round.id)));
  const all = rounds
    .flatMap((x, i) => lists[i].filter((o) => o.owner === u.nick || nickKey(o.name) === nickKey(u.nick)).map((o) => ({ round: x.round, summary: x.summary, o })))
    .sort((a, b) => b.o.createdAt - a.o.createdAt); // 최근 주문이 위

  const total = (e: (typeof all)[number]) => orderTotal(e.round.items, e.o.lines);
  const shown = all.filter((e) => filter === "unpaid" ? !e.o.paid : filter === "todo" ? e.o.paid && !e.o.delivered : filter === "done" ? e.o.delivered : true);
  const sum = all.reduce((s, e) => s + total(e), 0);
  const unpaidSum = all.filter((e) => !e.o.paid).reduce((s, e) => s + total(e), 0);
  const counts: Record<Filter, number> = {
    all: all.length,
    unpaid: all.filter((e) => !e.o.paid).length,
    todo: all.filter((e) => e.o.paid && !e.o.delivered).length,
    done: all.filter((e) => e.o.delivered).length,
  };

  return (
    <main className="wrap grid gap-5">
      <Link href="/me" className="text-sm text-muted">← 내 페이지</Link>
      <header className="flex items-center justify-between gap-3">
        <h1 className="hub-h1">내 주문 이력</h1>
        <Link href="/groupbuy" className="btn btn-primary text-sm shrink-0">공구 페이지 →</Link>
      </header>

      {all.length === 0 ? (
        <div className="panel p-5 text-sm text-muted">아직 주문한 공구가 없어요. 위의 ‘공구 페이지’에서 진행 중인 공구를 확인해 보세요.</div>
      ) : (
        <>
          <section className="panel p-4 grid grid-cols-3 gap-2 text-center" aria-label="주문 요약">
            <div className="grid gap-0.5"><span className="text-xs text-muted">총 주문</span><b className="num text-lg">{all.length}<small className="text-sm text-muted">건</small></b></div>
            <div className="grid gap-0.5"><span className="text-xs text-muted">총 금액</span><b className="num text-lg">{won(sum)}</b></div>
            <div className="grid gap-0.5"><span className="text-xs text-muted">입금 전</span><b className={`num text-lg ${unpaidSum ? "text-[var(--bad)]" : ""}`}>{won(unpaidSum)}</b></div>
          </section>

          <nav className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--paper)] p-1" aria-label="주문 필터">
            {FILTERS.map(({ k, t }) => (
              <Link key={k} href={k === "all" ? "/me/orders" : `/me/orders?f=${k}`} aria-current={filter === k ? "page" : undefined}
                className={`rounded-lg py-1.5 text-center text-sm font-semibold ${filter === k ? "bg-[var(--ink)] text-[var(--card)]" : "text-muted"}`}>
                {t} <span className="num">{counts[k]}</span>
              </Link>
            ))}
          </nav>

          {shown.length === 0 && <div className="panel p-4 text-sm text-muted">해당하는 주문이 없어요.</div>}
          <ul className="grid gap-2.5">
            {shown.map(({ round, summary, o }) => {
              const open = roundStatus(round, summary.totalQty) === "open";
              return (
                <li key={o.id}>
                  <Link href={`/groupbuy/r/${round.id}`} className="panel p-3.5 grid gap-1.5 hover:border-[var(--lane)]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold leading-snug min-w-0 break-words">{round.title}</span>
                      <span className="num font-bold shrink-0">{won(total({ round, summary, o }))}</span>
                    </div>
                    <p className="text-sm text-muted break-words">
                      {round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" · ")} · <span className="num">{qtyOf(o.lines)}개</span>
                    </p>
                    {o.memo && <p className="text-xs text-muted break-words">메모: {o.memo}</p>}
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="chip">{kstDate(o.createdAt)} 주문</span>
                      {open && <span className="chip chip-open">모집중</span>}
                      {o.paid ? <span className="chip chip-confirmed">입금완료</span> : <span className="chip chip-warn">입금대기</span>}
                      {o.delivered ? <span className="chip chip-ship">수령완료</span> : o.paid && <span className="chip chip-warn">수령대기</span>}
                      {round.archived && <span className="chip">보관됨</span>}
                    </div>
                    {fmtPickup(round.pickup) && <p className="text-xs text-muted">📍 배포 {fmtPickup(round.pickup)}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
