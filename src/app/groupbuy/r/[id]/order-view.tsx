"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { bibLabel, fmtDeadline, fmtPickup, itemLabel, minLabel, nickKey, orderTotal, qtyOf, roundStatus, won, type Order, type PublicOrder, type PublicSummary, type Round } from "@/lib/types";
import { Countdown, Progress, StatusChip, Stepper, useToast } from "@/components/ui";
import { knownMemberLabel } from "@/lib/member-label";

type Unlocked = { order: Order; password: string };

export default function OrderView({ round, initialSummary, initialOrders, me = "", names }: { round: Round; initialSummary: PublicSummary; initialOrders: PublicOrder[]; me?: string; names: Record<string, string> }) {
  const label = (nick: string) => knownMemberLabel(nick, names);
  const [summary, setSummary] = useState(initialSummary);
  const [orders, setOrders] = useState(initialOrders);
  const [done, setDone] = useState<Order | null>(null);
  const [lines, setLines] = useState<Record<string, number>>({});
  const [name, setName] = useState(me);
  const [depositor, setDepositor] = useState("");
  const [password, setPassword] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 주문 현황의 '내 주문'
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rowPw, setRowPw] = useState("");
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const [editing, setEditing] = useState<Unlocked | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, showToast] = useToast();
  const [now, setNow] = useState(() => Date.now());

  const status = roundStatus(round, summary.totalQty);
  const isOpen = status === "open" && now < new Date(round.deadline).getTime();
  const total = orderTotal(round.items, lines);
  const req = <span className="text-[var(--bad)]" aria-hidden> *</span>;
  const dup = name.trim() !== "" && orders.some((o) => o.id !== editing?.order.id && nickKey(o.name) === nickKey(name));

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ summary: PublicSummary; orders: PublicOrder[] }>(`/api/rounds/${round.id}`);
      setSummary(d.summary); setOrders(d.orders);
    } catch { /* keep last */ }
    setNow(Date.now());
  }, [round.id]);

  useEffect(() => {
    // 화면이 보일 때만 60초마다 새로 읽는다 (탭을 켜 둔 채 두면 계속 요청이 나가서 요청 한도를 잡아먹는다)
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  function resetForm() {
    setLines({}); setName(me); setDepositor(""); setPassword(""); setMemo(""); setErr(null);
  }

  async function submit() {
    setErr(null); setBusy(true);
    try {
      if (editing) {
        const d = await api<{ order: Order }>(`/api/rounds/${round.id}/orders/${editing.order.id}`, {
          method: "PATCH", json: { password: editing.password, name, depositor, memo, lines },
        });
        setUnlocked({ order: d.order, password: editing.password });
        setEditing(null); resetForm(); setOpenRow(d.order.id);
        showToast("주문을 수정했어요");
      } else {
        const d = await api<{ order: Order }>(`/api/rounds/${round.id}/orders`, { method: "POST", json: { name, depositor, memo, lines } });
        setDone(d.order); resetForm();
        showToast("주문이 접수됐어요");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  function toggleRow(o: PublicOrder) {
    setRowErr(null); setRowPw(""); setConfirmCancel(false);
    const opening = openRow !== o.id;
    setOpenRow(opening ? o.id : null);
    if (opening && unlocked?.order.id !== o.id) unlock(o); // 로그인한 본인 주문은 비밀번호 없이 바로 열린다
  }
  const isMine = (o: PublicOrder) => !!me && nickKey(o.name) === nickKey(me);

  async function unlock(o: PublicOrder) {
    setRowErr(null);
    try {
      const d = await api<{ order: Order }>(`/api/rounds/${round.id}/orders/${o.id}`, { method: "POST", json: rowPw ? { password: rowPw } : {} });
      setUnlocked({ order: d.order, password: rowPw }); setRowPw("");
    } catch (e) { setRowErr((e as Error).message); }
  }

  async function setPaid(u: Unlocked, paid: boolean) {
    setRowErr(null);
    try {
      const d = await api<{ order: PublicOrder }>(`/api/rounds/${round.id}/orders/${u.order.id}`, { method: "PUT", json: { password: u.password, paid } });
      setOrders((os) => os.map((x) => (x.id === d.order.id ? d.order : x)));
      setUnlocked({ ...u, order: { ...u.order, paid } });
      showToast(paid ? "입금완료로 표시했어요" : "입금완료 표시를 취소했어요");
    } catch (e) { setRowErr((e as Error).message); }
  }

  async function setDelivered(u: Unlocked, delivered: boolean) {
    setRowErr(null);
    try {
      const d = await api<{ order: PublicOrder }>(`/api/rounds/${round.id}/orders/${u.order.id}`, { method: "PUT", json: { password: u.password, delivered } });
      setOrders((os) => os.map((x) => (x.id === d.order.id ? d.order : x)));
      setUnlocked({ ...u, order: { ...u.order, delivered } });
      showToast(delivered ? "수령완료로 표시했어요" : "수령완료 표시를 취소했어요");
    } catch (e) { setRowErr((e as Error).message); }
  }

  function startEdit(u: Unlocked) {
    setEditing(u);
    setLines(u.order.lines); setName(u.order.name); setDepositor(u.order.depositor); setMemo(u.order.memo); setErr(null);
    document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function cancelOrder(u: Unlocked) {
    setRowErr(null);
    try {
      await api(`/api/rounds/${round.id}/orders/${u.order.id}`, { method: "DELETE", json: { password: u.password } });
      setUnlocked(null); setOpenRow(null); setConfirmCancel(false);
      if (editing?.order.id === u.order.id) { setEditing(null); resetForm(); }
      if (done?.id === u.order.id) setDone(null);
      showToast("주문을 취소했어요"); refresh();
    } catch (e) { setRowErr((e as Error).message); }
  }

  const missing = [
    !Object.values(lines).some(Boolean) && "수량",
    !name.trim() && "닉네임",
    !depositor.trim() && "입금자명",
  ].filter(Boolean) as string[];
  const paidCount = orders.filter((o) => o.paid).length;
  const account = `${round.bank.bank} ${round.bank.account} ${round.bank.holder}`;

  return (
    <main className="wrap grid gap-5">
      <Link href="/groupbuy" className="text-sm text-muted">← R2U 크루 공구</Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={isOpen ? "open" : status === "open" ? (summary.totalQty >= round.minQty ? "confirmed" : "failed") : status} />
          {isOpen && <Countdown deadline={round.deadline} />}
        </div>
        <h1 className="font-display text-2xl leading-tight">{round.title}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">공구 오픈자</dt><dd className="font-semibold">{label(round.opener)}</dd>
          <dt className="text-muted">접수 마감</dt><dd className="font-semibold">{fmtDeadline(round.deadline)}</dd>
          <dt className="text-muted">진행 조건</dt><dd className="font-semibold">{minLabel(round.minQty)}</dd>
          {fmtPickup(round.pickup) && (<><dt className="text-muted">배포 장소</dt><dd className="font-semibold">{fmtPickup(round.pickup)}</dd></>)}
        </dl>
        <div className="panel p-4 grid gap-3">
          <Progress count={summary.totalQty} min={round.minQty} />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
            <div className="min-w-0 grid gap-0.5">
              <span className="text-xs text-muted">입금 계좌 · 주문 때 적은 입금자명으로 보내 주세요</span>
              <p className="num font-semibold break-all text-sm">{account}</p>
            </div>
            <button className="btn text-sm shrink-0" onClick={async () => showToast((await copyText(`${round.bank.bank} ${round.bank.account}`)) ? "계좌번호를 복사했어요" : "복사하지 못했어요. 길게 눌러 복사해 주세요")}>복사</button>
          </div>
        </div>
      </header>

      {done && (
        <div className="panel p-4 grid gap-1 border-[var(--good)]" role="status">
          <div className="flex items-center gap-2">
            <span className="bib">{bibLabel(done.bib)}</span>
            <b>{label(done.name)}님 주문이 접수됐어요</b>
          </div>
          <p className="text-sm text-muted">
            {round.items.filter((it) => done.lines[it.id]).map((it) => `${itemLabel(it)} ${done.lines[it.id]}개`).join(" · ")} · <b className="num">{won(orderTotal(round.items, done.lines))}</b>
          </p>
          <p className="text-sm text-muted">입금한 뒤 아래 <b>주문 현황</b>에서 내 닉네임 옆 ‘내 주문’을 누르고 비밀번호를 넣어 입금완료를, 물건을 받으면 수령완료를 표시해 주세요. 마감 전에는 같은 곳에서 수정·취소도 할 수 있어요.</p>
        </div>
      )}

      {!isOpen && (
        <div className="panel p-4 text-sm">
          {summary.totalQty >= round.minQty
            ? "접수가 끝났어요. 최소 수량이 차서 공구가 진행돼요."
            : "접수가 끝났어요. 최소 수량이 차지 않아 이번 공구는 진행되지 않아요."}
        </div>
      )}

      {isOpen && (
        <section id="order-form" className="grid gap-4 scroll-mt-4" aria-label="주문하기">
          <div className="flex items-center justify-between gap-2">
            <h2 className="label">{editing ? `${label(editing.order.name)}님 주문 수정` : "주문하기"} <span className="normal-case font-normal">(<span className="text-[var(--bad)]">*</span> 필수, 수량 1개 이상)</span></h2>
            {editing && <button className="text-sm text-muted underline underline-offset-2" onClick={() => { setEditing(null); resetForm(); }}>수정 그만두기</button>}
          </div>
          {round.custom && (
            <div className="panel p-3.5 grid gap-1">
              <span className="chip chip-open justify-self-start">R2U 단체 제작 · {round.custom.kind}</span>
              <b className="text-lg leading-snug">{round.custom.name}</b>
              <span className="num text-sm">{won(round.custom.price)}{round.custom.sizes.length > 0 && <span className="text-muted"> · 사이즈 {round.custom.sizes.join(" / ")}</span>}{round.custom.colors.length > 0 && <span className="text-muted"> · 컬러 {round.custom.colors.join(" / ")}</span>}</span>
              {round.custom.note && <span className="text-xs text-muted">참고: {round.custom.note}</span>}
              {round.custom.url && <a href={round.custom.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--lane)] underline underline-offset-2 justify-self-start">시안·상품 보기 ↗</a>}
            </div>
          )}
          <ul className="grid gap-2.5">
            {round.items.map((it) => (
              <li key={it.id} className="panel p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0 grid">
                  <span className="font-semibold leading-snug">{round.custom ? [it.color, it.size].filter(Boolean).join(" · ") || it.name : it.name}</span>
                  {!round.custom && it.note && <span className="text-xs text-muted">참고: {it.note}</span>}
                  {!round.custom && it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--lane)] underline underline-offset-2 justify-self-start">상품 보기 ↗</a>}
                  <span className="num text-sm">{won(it.price)} <span className="text-muted">· 지금까지 {summary.itemTotals[it.id] ?? 0}개</span></span>
                </div>
                <Stepper label={itemLabel(it)} value={lines[it.id] ?? 0} onChange={(n) => setLines((l) => ({ ...l, [it.id]: n }))} />
              </li>
            ))}
          </ul>
          <div className="panel p-4 grid gap-3">
            <label className="field">
              <span className="label">닉네임{req}</span>
              <input id="o-name" required className="input" placeholder="카톡방 닉네임 (주문 현황에 보여요)" value={name} onChange={(e) => setName(e.target.value)} />
              {dup && <span className="text-xs font-semibold text-[var(--bad)]">‘{name.trim()}’ 닉네임으로 이미 주문했어요. 아래 주문 현황에서 ‘내 주문’을 눌러 수정해 주세요.</span>}
            </label>
            <label className="field">
              <span className="label">입금자명{req}</span>
              <input id="o-depositor" required className="input" placeholder="통장에 찍히는 이름 (공구 오픈자만 봐요)" value={depositor} onChange={(e) => setDepositor(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">메모 (선택)</span>
              <input id="o-memo" className="input" placeholder="맛 요청 등" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          </div>
          {err && <p className="chip chip-failed justify-self-start text-sm">{err}</p>}
        </section>
      )}

      {isOpen && (
        <div className="bar-bottom">
          <div className="max-w-[528px] mx-auto flex items-center justify-between gap-3">
            <div className="grid leading-tight">
              <span className="text-xs text-muted">{missing.length ? `${missing.join(", ")} 입력 필요` : "합계"}</span>
              <span className="num text-2xl font-bold">{won(total)}</span>
            </div>
            <button className="btn btn-primary px-6 py-3" disabled={busy || dup || missing.length > 0} onClick={submit}>
              {busy ? "보내는 중…" : editing ? "수정 저장" : "주문 넣기"}
            </button>
          </div>
        </div>
      )}

      <section className="grid gap-2" aria-label="주문 현황">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="label">주문 현황</h2>
          <span className="text-xs text-muted num">{orders.length}명 · {summary.totalQty}개 · 입금완료 {paidCount}명</span>
        </div>
        {orders.length === 0 && <p className="panel p-4 text-sm text-muted">아직 주문이 없어요. 첫 주문을 넣어 보세요.</p>}
        {orders.length > 0 && (
          <ul className="panel divide-y divide-[var(--line)]">
            {orders.map((o) => {
              const u = unlocked?.order.id === o.id ? unlocked : null;
              return (
                <li key={o.id} className="p-3 grid gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="bib text-sm">{bibLabel(o.bib)}</span>
                    <div className="min-w-0 flex-1 grid leading-snug">
                      <span className="font-semibold truncate">{label(o.name)}</span>
                      <span className="text-xs text-muted">
                        {round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" · ")} · <span className="num">{qtyOf(o.lines)}개 {won(orderTotal(round.items, o.lines))}</span>
                      </span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        {o.paid ? <span className="chip chip-confirmed">입금완료</span> : <span className="chip chip-warn">입금대기</span>}
                        {o.delivered ? <span className="chip chip-ship">수령완료</span> : o.paid && <span className="chip chip-warn">수령대기</span>}
                      </span>
                    </div>
                    {isMine(o) && (
                      <button className="btn text-xs py-1.5 px-2.5 shrink-0" aria-expanded={openRow === o.id} onClick={() => toggleRow(o)}>
                        {openRow === o.id ? "닫기" : "내 주문"}
                      </button>
                    )}
                  </div>

                  {openRow === o.id && !u && (
                    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); unlock(o); }}>
                      <p className="text-xs text-muted">{label(o.name)}님, 주문할 때 정한 비밀번호를 입력해 주세요.</p>
                      <div className="flex gap-2">
                        <input id={`pw-${o.id}`} type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" className="input pw-mask py-2" placeholder="주문 비밀번호" value={rowPw} onChange={(e) => setRowPw(e.target.value)} autoFocus />
                        <button className="btn btn-primary shrink-0 py-2" disabled={!rowPw}>확인</button>
                      </div>
                    </form>
                  )}

                  {openRow === o.id && u && (
                    <div className="rounded-lg bg-paper p-3 grid gap-2.5">
                      <p className="text-xs text-muted">입금자명 <b className="text-[var(--ink)]">{u.order.depositor}</b>{u.order.memo && <> · 메모 {u.order.memo}</>}</p>
                      <div className="flex flex-wrap gap-2">
                        {u.order.paid
                          ? <button className="btn text-sm py-2" onClick={() => setPaid(u, false)}>입금완료 취소</button>
                          : <button className="btn btn-primary text-sm py-2" onClick={() => setPaid(u, true)}>입금완료 표시</button>}
                        {u.order.delivered
                          ? <button className="btn text-sm py-2" onClick={() => setDelivered(u, false)}>수령완료 취소</button>
                          : <button className="btn text-sm py-2" onClick={() => setDelivered(u, true)}>수령완료 표시</button>}
                        {isOpen && <button className="btn text-sm py-2" onClick={() => startEdit(u)}>주문 수정</button>}
                        {isOpen && !confirmCancel && <button className="btn btn-ghost btn-danger text-sm py-2" onClick={() => setConfirmCancel(true)}>주문 취소</button>}
                      </div>
                      {confirmCancel && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">주문을 취소할까요?</span>
                          <button className="btn btn-danger text-sm py-1.5" onClick={() => cancelOrder(u)}>취소하기</button>
                          <button className="btn btn-ghost text-sm py-1.5" onClick={() => setConfirmCancel(false)}>아니요</button>
                        </div>
                      )}
                      {!isOpen && <p className="text-xs text-muted">마감 뒤 수정·취소는 공구 오픈자({label(round.opener)})에게 요청해 주세요.</p>}
                    </div>
                  )}
                  {openRow === o.id && rowErr && <p className="chip chip-failed justify-self-start text-xs">{rowErr}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {toast}
    </main>
  );
}
