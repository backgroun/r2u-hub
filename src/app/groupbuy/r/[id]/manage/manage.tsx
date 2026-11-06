"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, copyText, MY_ROUNDS, store, type MyRound } from "@/lib/client";
import { bibLabel, fmtDeadline, fmtPickup, itemLabel, minLabel, orderTotal, qtyOf, roundStatus, won, type Order, type Round } from "@/lib/types";
import RoundForm, { type DesignImage } from "@/components/round-form";
import { downloadText, ordererRows, orderSheetRows, orderSheetText, paidTimeLabel, safeName, toCsv, unpaidReminder } from "@/lib/gb-export";
import { Countdown, PayBadges, Progress, StatusChip, useToast } from "@/components/ui";
import { knownMemberLabel } from "@/lib/member-label";
import { normalizePassword } from "@/components/password-input";

export default function Manage({ id, names }: { id: string; names: Record<string, string> }) {
  const label = (nick: string) => knownMemberLabel(nick, names);
  const sp = useSearchParams();
  const router = useRouter();
  const isNew = sp.get("new") === "1";
  const [key, setKey] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [pw, setPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [round, setRound] = useState<Round | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null); // "delete-round" | order id
  const [toast, showToast] = useToast();
  const [pickupDraft, setPickupDraft] = useState<string | null>(null); // 배포 장소 입력 중인 값 (null = 편집 안 함)
  const [payFilter, setPayFilter] = useState<"all" | "unpaid" | "paid">("all");
  // 새 공구를 열 때 올리지 못한 이미지 (이 탭에 임시로 남겨 둔 것)
  const pendingKey = `crew-gb:pending-img:${id}`;
  const [pending, setPending] = useState<{ design?: { slot: number; img: DesignImage }[]; size?: DesignImage } | null>(null);
  useEffect(() => {
    try { const v = sessionStorage.getItem(pendingKey); if (v) setPending(JSON.parse(v)); } catch { /* 저장소를 못 읽으면 안내만 건너뛴다 */ }
  }, [pendingKey]);

  // 이 기기에 저장된 관리 키 (예전 ?key= 링크도 지원)
  useEffect(() => {
    const k = sp.get("key") ?? store.get<MyRound[]>(MY_ROUNDS, []).find((m) => m.id === id)?.key ?? null;
    if (k) { setKey(k); return; }
    // 로그인한 공구 오픈자(또는 운영진)면 비밀번호 없이 바로 들어간다
    api<{ adminKey: string }>(`/api/rounds/${id}/owner-key`)
      .then((d) => setKey(d.adminKey))
      .catch(() => setNeedLogin(true));
  }, [id, sp]);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const d = await api<{ round: Round; orders: Order[] }>(`/api/rounds/${id}/admin?key=${encodeURIComponent(key)}`);
      setRound(d.round); setOrders(d.orders); setErr(null);
      // 다른 기기에서 운영자 링크로 들어와도 목록에 남기기
      const mine = store.get<MyRound[]>(MY_ROUNDS, []).filter((m) => m.id !== id);
      store.set(MY_ROUNDS, [{ id, key, title: d.round.title }, ...mine]);
    } catch (e) {
      // 키가 틀리면 비밀번호로 다시 들어오게
      if ((e as Error).message.includes("운영자")) { setKey(null); setNeedLogin(true); }
      else setErr((e as Error).message);
    }
  }, [id, key]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null); setLoggingIn(true);
    try {
      const d = await api<{ adminKey: string }>(`/api/rounds/${id}/login`, { method: "POST", json: { password: pw } });
      setKey(d.adminKey); setNeedLogin(false); setPw("");
    } catch (e) { setLoginErr((e as Error).message); } finally { setLoggingIn(false); }
  }

  useEffect(() => {
    if (!key) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 45_000); // 화면이 보일 때만
    return () => clearInterval(t);
  }, [key, load]);

  const totals = useMemo(() => {
    const per: Record<string, number> = {};
    for (const o of orders) for (const [k, q] of Object.entries(o.lines)) per[k] = (per[k] ?? 0) + q;
    return per;
  }, [orders]);

  if (needLogin) return (
    <main className="wrap grid gap-5">
      <Link href={`/groupbuy/r/${id}`} className="text-sm text-muted">← 주문 화면</Link>
      <form onSubmit={login} className="panel p-5 grid gap-4">
        <h1 className="hub-h1">공구 관리</h1>
        <p className="text-sm text-muted">공구를 열 때 정한 관리 비밀번호를 입력해 주세요.</p>
        <input id="m-password" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" className="input pw-mask" placeholder="관리 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {loginErr && <p className="chip chip-failed justify-self-start text-sm">{loginErr}</p>}
        <button className="btn btn-primary" disabled={loggingIn || !pw}>{loggingIn ? "확인 중…" : "관리 화면 열기"}</button>
      </form>
    </main>
  );

  if (err) return (
    <main className="wrap grid gap-4">
      <Link href="/groupbuy" className="text-sm text-muted">← R2U 크루 공구</Link>
      <p className="panel p-4">{err}</p>
    </main>
  );
  if (!round) return <main className="wrap text-muted">불러오는 중…</main>;

  const totalQty = orders.reduce((s, o) => s + qtyOf(o.lines), 0);
  const status = roundStatus(round, totalQty);
  const grand = orders.reduce((s, o) => s + orderTotal(round.items, o.lines), 0);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const orderUrl = `${origin}/groupbuy/r/${round.id}`;
  const paidOrders = orders.filter((o) => o.paid);
  const unpaidOrders = orders.filter((o) => !o.paid);
  const paidAmount = paidOrders.reduce((s, o) => s + orderTotal(round.items, o.lines), 0);
  const shown = payFilter === "unpaid" ? unpaidOrders : payFilter === "paid" ? paidOrders : orders;
  const ended = round.closed || Date.now() >= new Date(round.deadline).getTime();
  const reminder = unpaidReminder(round, orders, orderUrl);

  const announce = [
    `🏃 [공구] ${round.title}`,
    `공구 오픈자: ${round.opener}`,
    `마감: ${fmtDeadline(round.deadline)}`,
    minLabel(round.minQty),
    ...(fmtPickup(round.pickup) ? [`배포 장소: ${fmtPickup(round.pickup)}`] : []),
    "",
    ...round.items.map((it) => `· ${itemLabel(it)} ${won(it.price)}`),
    "",
    `👉 주문은 여기서: ${orderUrl}`,
  ].join("\n");

  const report = [
    `📦 [${round.title}] 집계 (${orders.length}명 · ${totalQty}개)`,
    ...round.items.map((it) => `· ${itemLabel(it)}: ${totals[it.id] ?? 0}개`),
    `총액 ${won(grand)} · 입금완료 ${orders.filter((o) => o.paid).length}/${orders.length}명 · 수령완료 ${orders.filter((o) => o.delivered).length}/${orders.length}명`,
    ...(fmtPickup(round.pickup) ? [`📍 배포 장소: ${fmtPickup(round.pickup)}`] : []),
    "",
    ...orders.map((o) => `${bibLabel(o.bib)} ${o.name}(${o.depositor}) ${won(orderTotal(round.items, o.lines))} 입금${o.paid ? "✅" : "⬜"} 수령${o.delivered ? "✅" : "⬜"}`),
  ].join("\n");

  async function copy(text: string, done: string) {
    showToast((await copyText(text)) ? done : "복사하지 못했어요");
  }

  async function toggleDelivered(o: Order) {
    try {
      await api(`/api/rounds/${id}/orders/${o.id}`, { method: "PUT", json: { adminKey: key, delivered: !o.delivered } });
      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, delivered: !o.delivered } : x)));
    } catch (e) { showToast((e as Error).message); }
  }

  async function togglePaid(o: Order) {
    try {
      await api(`/api/rounds/${id}/orders/${o.id}`, { method: "PUT", json: { adminKey: key, paid: !o.paid } });
      setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, paid: !o.paid } : x)));
    } catch (e) { showToast((e as Error).message); }
  }

  // 올리지 못했던 시안·사이즈표 이미지를 다시 올린다
  async function retryImages() {
    if (!pending || !key) return;
    const left: typeof pending = {};
    let last: Round | null = null;
    for (const a of pending.design ?? []) {
      try { last = (await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "PUT", json: { key, kind: "design", slot: a.slot, ...a.img } })).round; }
      catch { (left.design ??= []).push(a); }
    }
    if (pending.size) {
      try { last = (await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "PUT", json: { key, kind: "size", ...pending.size } })).round; }
      catch { left.size = pending.size; }
    }
    if (last) setRound(last);
    if (left.design?.length || left.size) { sessionStorage.setItem(pendingKey, JSON.stringify(left)); setPending(left); showToast("아직 올리지 못한 이미지가 있어요. 잠시 뒤 다시 눌러 주세요"); }
    else { sessionStorage.removeItem(pendingKey); setPending(null); showToast("이미지를 올렸어요"); }
  }

  // 배포 장소는 공구를 연 뒤에 언제든 추가·수정한다
  async function savePickup() {
    if (pickupDraft === null) return;
    try {
      const d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, pickup: { place: pickupDraft } } });
      setRound(d.round); setPickupDraft(null); showToast(pickupDraft.trim() ? "배포 장소를 저장했어요" : "배포 장소를 지웠어요");
    } catch (e) { showToast((e as Error).message); }
  }

  // 이 공구를 복사해서 새 공구 열기 (계좌·상품·옵션·이미지를 그대로 가져온다)
  const copyRound = () => router.push(`/groupbuy/new?copy=${id}`);

  // 끝난 공구는 보관함으로 옮겨 목록을 깔끔하게
  async function setArchived(archived: boolean) {
    try {
      const d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, archived } });
      setRound(d.round); showToast(archived ? "보관함으로 옮겼어요" : "보관함에서 꺼냈어요");
    } catch (e) { showToast((e as Error).message); }
  }

  async function removeOrder(o: Order) {
    await api(`/api/rounds/${id}/orders/${o.id}?adminKey=${encodeURIComponent(key ?? "")}`, { method: "DELETE" });
    setConfirm(null); showToast(`${o.name} 주문을 삭제했어요`); load();
  }

  async function setClosed(closed: boolean) {
    const d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, closed } });
    setRound(d.round); showToast(closed ? "접수를 마감했어요" : "접수를 다시 열었어요");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/rounds/${id}`, { method: "PATCH", json: { key, password: newPw } });
      setNewPw(""); setPwOpen(false); showToast("관리 비밀번호를 바꿨어요");
    } catch (e) { showToast((e as Error).message); }
  }

  async function deleteRound() {
    await api(`/api/rounds/${id}?key=${encodeURIComponent(key ?? "")}`, { method: "DELETE" });
    store.set(MY_ROUNDS, store.get<MyRound[]>(MY_ROUNDS, []).filter((m) => m.id !== id));
    router.push("/groupbuy");
  }

  if (editing) return (
    <main className="wrap grid gap-5">
      <button className="text-sm text-muted justify-self-start" onClick={() => setEditing(false)}>← 관리로 돌아가기</button>
      <h1 className="hub-h1">공구 내용 수정</h1>
      <RoundForm initial={round} roundId={id} draftKey={`crew-gb:draft:edit:${id}`} submitLabel="수정 저장" onSubmit={async (draft, _pw, extra) => {
        let d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, round: draft } });
        // 시안 이미지: 새로 올렸으면 저장, 빼거나 URL 방식으로 바꿨으면 삭제 (그대로면 건드리지 않는다)
        // 시안 이미지: 뺀 칸은 지우고, 새로 고른 것은 올린다 (그대로인 칸은 건드리지 않는다)
        for (const slot of extra.design.remove) d = await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "DELETE", json: { key, kind: "design", slot } });
        for (const a of extra.design.add) d = await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "PUT", json: { key, kind: "design", slot: a.slot, ...a.img } });
        // 사이즈표: 새로 올렸으면 저장, 뺐으면 삭제
        if (extra.sizeImage && extra.sizeImage !== "keep") d = await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "PUT", json: { key, kind: "size", ...extra.sizeImage } });
        else if (extra.sizeImage === null && d.round.custom?.sizeImage) d = await api<{ round: Round }>(`/api/rounds/${id}/image`, { method: "DELETE", json: { key, kind: "size" } });
        setRound(d.round); setEditing(false); showToast("저장했어요");
      }} />
    </main>
  );

  return (
    <main className="wrap grid gap-5">
      <Link href="/groupbuy" className="text-sm text-muted">← R2U 크루 공구</Link>

      {isNew && (
        <div className="panel p-4 grid gap-2 border-[var(--bib)]">
          <p className="font-bold">공구가 열렸어요!</p>
          <p className="text-sm text-muted">
            아래 ‘공지 문구 복사’로 카톡방에 올려 주세요. 다른 폰에서 관리하려면 주문 화면 맨 아래 <b>공구 오픈자 관리</b>를 누르고 관리 비밀번호를 입력하면 돼요.
          </p>
        </div>
      )}

      {pending && (pending.design?.length || pending.size) && (
        <div className="panel p-4 grid gap-2 border-[var(--bad)]" role="alert">
          <p className="font-bold">{[pending.design?.length && "시안 이미지", pending.size && "사이즈표"].filter(Boolean).join("·")}를 올리지 못했어요</p>
          <p className="text-sm text-muted">공구는 정상으로 열렸어요. 다시 올려 볼까요? 계속 안 되면 ‘내용·마감 수정’에서 이미지를 직접 올려 주세요.</p>
          <div className="flex gap-2">
            <button className="btn btn-primary text-sm" onClick={retryImages}>다시 올리기</button>
            <button className="btn btn-ghost text-sm" onClick={() => { sessionStorage.removeItem(pendingKey); setPending(null); }}>닫기</button>
          </div>
        </div>
      )}

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">공구 관리</span>
          {round.archived && <span className="chip">보관됨</span>}
          <StatusChip status={status} />
          {status === "open" && <Countdown deadline={round.deadline} />}
        </div>
        <h1 className="font-display text-2xl leading-tight">{round.title}</h1>
        <p className="text-sm text-muted">
          공구 오픈자 {label(round.opener)} · 마감 {fmtDeadline(round.deadline)} · {round.bank.bank} {round.bank.account} ({round.bank.holder})
          {fmtPickup(round.pickup) && <><br />배포 장소 {fmtPickup(round.pickup)}</>}
        </p>
        <div className="panel p-4"><Progress count={totalQty} min={round.minQty} /></div>
      </header>

      <section className="grid gap-2" aria-label="배포 장소">
        <h2 className="label">배포 장소</h2>
        {pickupDraft === null ? (
          <div className="panel p-3.5 flex items-center justify-between gap-3">
            {fmtPickup(round.pickup)
              ? <span className="font-semibold min-w-0 break-words">{fmtPickup(round.pickup)}</span>
              : <span className="text-sm text-muted">아직 정하지 않았어요. 정해지면 여기서 추가해 주세요.</span>}
            <button className="btn text-sm shrink-0" onClick={() => setPickupDraft(round.pickup?.place ?? "")}>{fmtPickup(round.pickup) ? "수정" : "＋ 배포 장소 추가"}</button>
          </div>
        ) : (
          <form className="panel p-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); void savePickup(); }}>
            <input className="input" autoFocus maxLength={60} placeholder="예) 울산 OOO" value={pickupDraft} onChange={(e) => setPickupDraft(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn btn-primary text-sm">저장</button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setPickupDraft(null)}>취소</button>
            </div>
          </form>
        )}
        {fmtPickup(round.pickup) && pickupDraft === null && (
          <button className="btn text-sm" onClick={() => copy(`📍 [${round.title}] 배포 장소 안내\n${fmtPickup(round.pickup)}\n\n👉 ${orderUrl}`, "배포 장소 안내 문구를 복사했어요. 카톡방에 붙여넣으세요")}>배포 장소 안내 문구 복사</button>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="label">카톡방에 공유</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={() => copy(announce, "공지 문구를 복사했어요. 카톡방에 붙여넣으세요")}>공지 문구 복사</button>
          <button className="btn" onClick={() => copy(orderUrl, "주문 링크를 복사했어요")}>주문 링크만 복사</button>
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="label">상품별 수량 (발주용)</h2>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {round.items.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    {it.url ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{itemLabel(it)}</a> : itemLabel(it)}
                    {it.note && <span className="block text-xs text-muted">참고: {it.note}</span>}
                  </td>
                  <td className="p-3 text-right num text-xl font-bold whitespace-nowrap">{totals[it.id] ?? 0}<span className="text-sm text-muted">개</span></td>
                  <td className="p-3 text-right num text-muted whitespace-nowrap">{won(it.price * (totals[it.id] ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between gap-3 p-3 bg-paper text-sm">
            <span>{orders.length}명 · <b className="num">{totalQty}개</b></span>
            <span>총액 <b className="num">{won(grand)}</b></span>
          </div>
        </div>
        <button className="btn text-sm" onClick={() => copy(report, "집계표를 복사했어요")}>집계표 복사 (카톡용)</button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn text-sm" disabled={orders.length === 0} onClick={() => downloadText(`${safeName(round.title)}_발주서.csv`, toCsv(orderSheetRows(round, orders)))}>발주서 내보내기 (CSV)</button>
          <button className="btn text-sm" disabled={orders.length === 0} onClick={() => downloadText(`${safeName(round.title)}_주문자명단.csv`, toCsv(ordererRows(round, orders)))}>주문자 명단 (CSV)</button>
        </div>
        <button className="btn text-sm" disabled={orders.length === 0} onClick={() => copy(orderSheetText(round, orders), "발주 문구를 복사했어요. 업체에 붙여넣으세요")}>발주 문구 복사 (업체 전달용)</button>
      </section>

      <section className="grid gap-2">
        <div className="grid gap-2">
          <h2 className="label">입금 확인 현황 · 주문자 {orders.length}명 <span className="normal-case font-normal">(입금·수령은 신청자가 직접 표시해요)</span></h2>
          <PayBadges total={orders.length} paid={paidOrders.length} delivered={orders.filter((o) => o.delivered).length} />
          {orders.length > 0 && (
            <div className="panel p-3.5 grid gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">입금 표시된 금액</span>
                <span className="num"><b className="text-xl">{won(paidAmount)}</b> <span className="text-sm text-muted">/ {won(grand)}</span></span>
              </div>
              <div className={`track ${paidAmount >= grand && grand > 0 ? "done" : ""}`} aria-hidden style={{ height: 6 }}><span style={{ width: `${grand ? Math.min(100, (paidAmount / grand) * 100) : 0}%` }} /></div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="입금 상태 필터">
                {([["all", `전체 ${orders.length}`], ["unpaid", `입금 전 ${unpaidOrders.length}`], ["paid", `입금완료 ${paidOrders.length}`]] as const).map(([k, t]) => (
                  <button key={k} type="button" className={`chip ${payFilter === k ? "chip-confirmed" : ""}`} aria-pressed={payFilter === k} onClick={() => setPayFilter(k)}>{t}</button>
                ))}
              </div>
              <button className="btn text-sm" disabled={!reminder} onClick={() => copy(reminder, "독촉 문구를 복사했어요. 카톡방에 붙여넣으세요")}>
                {reminder ? `입금 독촉 문구 복사 (입금 전 ${unpaidOrders.length}명)` : "모두 입금 표시를 했어요 🎉"}
              </button>
            </div>
          )}
        </div>
        {orders.length === 0 && <p className="panel p-4 text-sm text-muted">아직 주문이 없어요. 공지 문구를 카톡방에 올려 보세요.</p>}
        {orders.length > 0 && shown.length === 0 && <p className="panel p-4 text-sm text-muted">해당하는 주문이 없어요.</p>}
        <ul className="grid gap-2">
          {shown.map((o) => (
            <li key={o.id} className="panel p-3.5 grid gap-2">
              <div className="flex items-center gap-3">
                <span className="bib">{bibLabel(o.bib)}</span>
                <span className="min-w-0 flex-1 grid leading-tight">
                  <span className="font-bold truncate">{label(o.name)}</span>
                  <span className="text-xs text-muted truncate">입금자명 {o.depositor}{o.paid && o.paidAt ? ` · 입금 표시 ${paidTimeLabel(o.paidAt)}` : ""}</span>
                </span>
                <span className="num font-bold">{won(orderTotal(round.items, o.lines))}</span>
              </div>
              <p className="text-sm text-muted">
                {round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" · ")}
                {o.memo && <><br />메모: {o.memo}</>}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                <button className={`chip ${o.paid ? "chip-confirmed" : "chip-warn"}`} title="신청자가 비밀번호를 잊었을 때 대신 바꿀 수 있어요" onClick={() => togglePaid(o)}>
                  {o.paid ? "✓ 입금완료" : "입금 전"}
                </button>
                <button className={`chip ${o.delivered ? "chip-ship" : "chip-warn"}`} title="신청자가 비밀번호를 잊었을 때 대신 바꿀 수 있어요" onClick={() => toggleDelivered(o)}>
                  {o.delivered ? "✓ 수령완료" : "수령 전"}
                </button>
                </div>
                {confirm === o.id ? (
                  <span className="flex gap-1">
                    <button className="btn btn-danger text-sm py-1.5" onClick={() => removeOrder(o)}>삭제</button>
                    <button className="btn btn-ghost text-sm py-1.5" onClick={() => setConfirm(null)}>아니요</button>
                  </span>
                ) : (
                  <button className="btn btn-ghost text-sm py-1.5" onClick={() => setConfirm(o.id)}>주문 삭제</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="label">공구 설정</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setEditing(true)}>내용·마감 수정</button>
          <button className="btn" onClick={copyRound}>복사해서 새 공구 열기</button>
          {round.archived
            ? <button className="btn" onClick={() => setArchived(false)}>보관함에서 꺼내기</button>
            : ended && <button className="btn" onClick={() => setArchived(true)}>보관함으로 옮기기</button>}
          <button className="btn" onClick={() => setPwOpen((v) => !v)}>관리 비밀번호 변경</button>
          {round.closed
            ? <button className="btn" onClick={() => setClosed(false)}>접수 다시 열기</button>
            : <button className="btn" onClick={() => setClosed(true)}>지금 접수 마감</button>}
          {confirm === "delete-round" ? (
            <span className="flex items-center gap-1">
              <span className="text-sm">주문까지 모두 지워져요.</span>
              <button className="btn btn-danger" onClick={deleteRound}>공구 삭제</button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>아니요</button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-danger" onClick={() => setConfirm("delete-round")}>공구 삭제</button>
          )}
        </div>
        {pwOpen && (
          <form onSubmit={changePassword} className="panel p-3 flex gap-2">
            <input id="m-new-password" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" className="input pw-mask" placeholder="새 관리 비밀번호 (영문·숫자 4자 이상)" value={newPw} onChange={(e) => setNewPw(normalizePassword(e.target.value))} />
            <button className="btn btn-primary shrink-0" disabled={newPw.length < 4}>저장</button>
          </form>
        )}
      </section>
      {toast}
    </main>
  );
}
