"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, copyText, MY_ROUNDS, store, type MyRound } from "@/lib/client";
import { bibLabel, fmtDeadline, fmtPickup, itemLabel, orderTotal, qtyOf, roundStatus, won, type Order, type Round } from "@/lib/types";
import RoundForm, { type DesignImage } from "@/components/round-form";
import { confirmWithPassword } from "@/components/confirm-password";
import { downloadText, finalCheckText, ordererRows, orderSheetRows, orderSheetText, paidTimeLabel, safeName, toCsv, unpaidReminder } from "@/lib/gb-export";
import { Countdown, PayBadges, Progress, StatusChip, useToast } from "@/components/ui";
import { knownMemberLabel } from "@/lib/member-label";

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
  const [round, setRound] = useState<Round | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, showToast] = useToast();
  // 공구를 홈 공지로 올리기 (공지를 올릴 수 있는 운영진 계정에만 보인다)
  const [noticeInfo, setNoticeInfo] = useState<{ canPost: boolean; posted: boolean } | null>(null);
  const [noticePush, setNoticePush] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  useEffect(() => {
    api<{ canPost: boolean; posted: boolean }>(`/api/rounds/${id}/notice`).then(setNoticeInfo).catch(() => setNoticeInfo(null));
  }, [id]);
  const [pickupDraft, setPickupDraft] = useState<{ place: string; date: string; time: string } | null>(null); // 배포 장소·일자 입력 중인 값 (null = 편집 안 함)
  const [exportKind, setExportKind] = useState<"sheet" | "orderers">("sheet"); // 내보내기 드롭다운: 발주서 / 주문자 명단
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

  // 카톡방 공지 문구: 제목·마감·(배포 장소)·상품·링크만 간결하게
  const c = round.custom;
  const announce = [
    `🛒 ${round.title}`,
    `마감 ${fmtDeadline(round.deadline)}`,
    ...(fmtPickup(round.pickup) ? [`배포 ${fmtPickup(round.pickup)}`] : []),
    ...(c
      ? [`${c.name} ${won(c.price)}`, ...(c.sizes.length ? [`사이즈 ${c.sizes.join("/")}`] : []), ...(c.colors.length ? [`컬러 ${c.colors.join("/")}`] : [])]
      : round.items.map((it) => `· ${itemLabel(it)} ${won(it.price)}`)),
    `👉 ${orderUrl}`,
  ].join("\n");

  // 크루용 집계표(카톡) = 최종 주문 확인 문구: 누가 무엇을 주문했는지 목록
  const report = finalCheckText(round, orders, orderUrl);

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

  async function postAsNotice() {
    setNoticeBusy(true);
    try {
      const d = await api<{ pushed: number | null }>(`/api/rounds/${id}/notice`, { method: "POST", json: { push: noticePush } });
      setNoticeInfo({ canPost: true, posted: true });
      showToast(d.pushed === null ? "홈 공지로 올렸어요" : `홈 공지로 올리고 알림을 보냈어요 (${d.pushed}명)`);
    } catch (e) { showToast((e as Error).message); } finally { setNoticeBusy(false); }
  }
  async function takeDownNotice() {
    const token = await confirmWithPassword("홈 공지를 내릴까요?", "공지 내리기");
    if (!token) return;
    setNoticeBusy(true);
    try {
      await api(`/api/rounds/${id}/notice`, { method: "DELETE", json: { confirmToken: token } });
      setNoticeInfo({ canPost: true, posted: false }); showToast("공지를 내렸어요");
    } catch (e) { showToast((e as Error).message); } finally { setNoticeBusy(false); }
  }

  // 배포 장소는 공구를 연 뒤에 언제든 추가·수정한다
  async function savePickup() {
    if (pickupDraft === null) return;
    try {
      const d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, pickup: pickupDraft } });
      setRound(d.round); setPickupDraft(null); showToast(pickupDraft.place.trim() || pickupDraft.date || pickupDraft.time ? "배포 장소·일자를 저장했어요" : "배포 정보를 지웠어요");
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

  // 삭제처럼 되돌리기 어려운 동작은 본인 로그인 비밀번호를 다시 입력해야 실행된다
  async function removeOrder(o: Order) {
    const token = await confirmWithPassword(`${o.name}님의 주문을 삭제할까요?\n되돌릴 수 없어요.`, "주문 삭제");
    if (!token) return;
    try {
      await api(`/api/rounds/${id}/orders/${o.id}?adminKey=${encodeURIComponent(key ?? "")}`, { method: "DELETE", json: { confirmToken: token } });
      showToast(`${o.name} 주문을 삭제했어요`); load();
    } catch (e) { showToast((e as Error).message); }
  }

  async function setClosed(closed: boolean) {
    let token: string | null = null;
    if (closed) {
      token = await confirmWithPassword("지금 접수를 마감할까요?\n마감하면 더 이상 주문을 받을 수 없어요.", "접수 마감");
      if (!token) return;
    }
    try {
      const d = await api<{ round: Round }>(`/api/rounds/${id}`, { method: "PATCH", json: { key, closed, ...(token ? { confirmToken: token } : {}) } });
      setRound(d.round); showToast(closed ? "접수를 마감했어요" : "접수를 다시 열었어요");
    } catch (e) { showToast((e as Error).message); }
  }

  async function deleteRound() {
    const token = await confirmWithPassword("이 공구를 삭제할까요?\n주문 내역까지 모두 지워지고 되돌릴 수 없어요.", "공구 삭제");
    if (!token) return;
    try {
      await api(`/api/rounds/${id}?key=${encodeURIComponent(key ?? "")}`, { method: "DELETE", json: { confirmToken: token } });
      store.set(MY_ROUNDS, store.get<MyRound[]>(MY_ROUNDS, []).filter((m) => m.id !== id));
      router.push("/groupbuy");
    } catch (e) { showToast((e as Error).message); }
  }

  // 주문번호를 1번부터 빈틈없이 다시 매긴다 (삭제로 번호가 비어 있을 때)
  async function renumber() {
    const token = await confirmWithPassword("주문번호를 지금 순서 그대로 001번부터 다시 매길까요?\n번호만 바뀌고 주문 내용은 그대로예요.", "번호 다시 매기기");
    if (!token) return;
    try {
      const d = await api<{ changed: number }>(`/api/rounds/${id}/renumber`, { method: "POST", json: { key, confirmToken: token } });
      showToast(d.changed ? `주문번호를 다시 매겼어요 (${d.changed}건 변경)` : "이미 번호가 순서대로 매겨져 있어요");
      load();
    } catch (e) { showToast((e as Error).message); }
  }

  if (editing) return (
    <main className="wrap grid gap-5">
      <button className="text-sm text-muted justify-self-start" onClick={() => setEditing(false)}>← 관리로 돌아가기</button>
      <h1 className="hub-h1">공구 내용 수정</h1>
      <RoundForm initial={round} roundId={id} draftKey={`crew-gb:draft:edit:${id}`} submitLabel="수정 저장"
        onSendNotify={async () => {
          const d = await api<{ sent: number; notifiedAt: number }>(`/api/rounds/${id}/notify`, { method: "POST", json: { key } });
          return { message: `${d.sent}명에게 오픈 알림을 보냈어요.`, at: d.notifiedAt };
        }} onSubmit={async (draft, _pw, extra) => {
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

      <div className="panel divide-y divide-[var(--line)]">
      <details className="past px-3.5 py-2.5">
        <summary className="label flex items-center gap-1.5">
          <span className="past-caret inline-block transition-transform">▸</span> 배포 장소·일자{fmtPickup(round.pickup) && <span className="normal-case font-normal text-muted"> · {fmtPickup(round.pickup)}</span>}
        </summary>
        <div className="grid gap-2 mt-2.5">
        {pickupDraft === null ? (
          <div className="flex items-center justify-between gap-3">
            {fmtPickup(round.pickup)
              ? <span className="font-semibold min-w-0 break-words">{fmtPickup(round.pickup)}</span>
              : <span className="text-sm text-muted">아직 정하지 않았어요. 정해지면 장소·일자를 추가해 주세요.</span>}
            <button className="btn text-sm shrink-0" onClick={() => setPickupDraft({ place: round.pickup?.place ?? "", date: round.pickup?.date ?? "", time: round.pickup?.time ?? "" })}>{fmtPickup(round.pickup) ? "수정" : "＋ 장소·일자 추가"}</button>
          </div>
        ) : (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void savePickup(); }}>
            <input className="input" autoFocus maxLength={60} placeholder="배포 장소 예) 울산 OOO" value={pickupDraft.place} onChange={(e) => setPickupDraft({ ...pickupDraft, place: e.target.value })} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input type="date" aria-label="배포 일자" className="input min-w-0" value={pickupDraft.date} onChange={(e) => setPickupDraft({ ...pickupDraft, date: e.target.value })} />
              <input type="time" aria-label="배포 시간 (선택)" className="input" value={pickupDraft.time} onChange={(e) => setPickupDraft({ ...pickupDraft, time: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary text-sm">저장</button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setPickupDraft(null)}>취소</button>
            </div>
          </form>
        )}
        {fmtPickup(round.pickup) && pickupDraft === null && (
          <button className="btn text-sm" onClick={() => copy(`📍 [${round.title}] 배포 장소 안내\n${fmtPickup(round.pickup)}\n\n👉 ${orderUrl}`, "배포 장소 안내 문구를 복사했어요. 카톡방에 붙여넣으세요")}>배포 장소 안내 문구 복사</button>
        )}
        </div>
      </details>

      {noticeInfo?.canPost && (
        <details className="past px-3.5 py-2.5">
          <summary className="label flex items-center gap-1.5">
            <span className="past-caret inline-block transition-transform">▸</span> 공지로 올리기{noticeInfo.posted && <span className="normal-case font-normal text-muted"> · 올라가 있음</span>}
          </summary>
          <div className="grid gap-2.5 mt-2.5">
            <p className="text-xs text-muted">공구 요약과 ‘공구 보러 가기’ 버튼이 홈 공지로 올라가요. 다시 올리면 이전 공지는 내려가요.</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="푸시를 켠 크루 모두에게 알림을 보내요">
                <input type="checkbox" className="size-5 accent-[var(--bib)]" checked={noticePush} onChange={(e) => setNoticePush(e.target.checked)} />
                푸시 알림
              </label>
              <button className="btn btn-primary text-sm py-1.5" disabled={noticeBusy || ended} onClick={postAsNotice}>{noticeInfo.posted ? "공지 다시 올리기" : "공지로 올리기"}</button>
              {noticeInfo.posted && <button className="btn btn-ghost text-sm py-1.5" disabled={noticeBusy} onClick={takeDownNotice}>공지 내리기</button>}
            </div>
            {ended && <p className="text-xs text-muted">마감된 공구는 새로 올릴 수 없어요.</p>}
          </div>
        </details>
      )}
      </div>

      <section className="grid gap-2">
        <div className="grid gap-2">
          <h2 className="label">입금 확인 현황 · 주문자 {orders.length}명 <span className="normal-case font-normal">(입금·수령은 신청자가 직접 표시해요)</span></h2>
          <PayBadges total={orders.length} paid={paidOrders.length} delivered={orders.filter((o) => o.delivered).length} />
          {orders.length > 0 && (
            <button className="text-xs text-muted underline underline-offset-2 justify-self-end" onClick={renumber}>주문번호 다시 매기기</button>
          )}
          {orders.length > 0 && (
            <div className="rounded-2xl border-2 border-[var(--bib)] p-4 grid gap-2.5 shadow-lg" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--bib) 22%, var(--card)), var(--card) 70%)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--bib)]">💰 입금 확인 현황</span>
                <span className="text-xs text-muted">입금 표시된 금액</span>
              </div>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="num"><b className="text-3xl">{won(paidAmount)}</b> <span className="text-sm text-muted">/ {won(grand)}</span></span>
              </div>
              <div className={`track ${paidAmount >= grand && grand > 0 ? "done" : ""}`} aria-hidden style={{ height: 6 }}><span style={{ width: `${grand ? Math.min(100, (paidAmount / grand) * 100) : 0}%` }} /></div>
              {/* 필터는 신청자 카드·상태 칩과 모양이 달라 보이도록 탭(분할 버튼) 형태로 */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--paper)] p-1" role="tablist" aria-label="입금 상태 필터">
                {([["all", "전체", orders.length], ["unpaid", "입금 전", unpaidOrders.length], ["paid", "입금완료", paidOrders.length]] as const).map(([k, t, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={payFilter === k}
                    className={`rounded-lg py-1.5 text-sm font-semibold transition-colors ${payFilter === k ? "bg-[var(--ink)] text-[var(--card)]" : "text-muted"}`}
                    onClick={() => setPayFilter(k)}>{t} <span className="num">{n}</span></button>
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
        {/* 한 줄 요약 + 누르면 펼쳐지는 상세: 주문자가 많아도 목록이 길어지지 않게 */}
        <ul className="panel divide-y divide-[var(--line)]">
          {shown.map((o) => {
            const short = round.items.filter((it) => o.lines[it.id]).map((it) => `${round.custom ? [it.color, it.size].filter(Boolean).join("/") || it.name : it.name} ${o.lines[it.id]}`).join(", ");
            const full = round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" · ");
            const stop = (e: React.MouseEvent, fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn(); }; // 요약 줄의 버튼을 눌러도 펼쳐지지 않게
            return (
              <li key={o.id}>
                <details>
                  <summary className="px-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden grid gap-1">
                    {/* 1줄: 번호 · 닉네임(+메모 M) · 금액 / 2줄: 입금자명·주문 요약 · 입금/수령 버튼 — 좁은 모바일 화면에서도 글이 잘리지 않게 두 줄로 나눈다 */}
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="num shrink-0 rounded px-1.5 py-0.5 text-[11px] font-extrabold leading-none bg-[var(--bib)] text-[var(--bib-ink)]">{bibLabel(o.bib)}</span>
                      <span className="font-semibold text-sm min-w-0 flex-1 break-words leading-snug">{label(o.name)}</span>
                      {o.memo && <span className="shrink-0 rounded px-1 text-[10px] font-extrabold leading-4 bg-[var(--bib)] text-black" title={`메모: ${o.memo}`} aria-label="메모 있음">M</span>}
                      <span className="num text-sm font-bold shrink-0">{won(orderTotal(round.items, o.lines))}</span>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="min-w-0 flex-1 text-xs text-muted break-words leading-snug"><span title="입금자명">입금 {o.depositor}</span> · {short}</span>
                    <button type="button" className={`chip shrink-0 ${o.paid ? "chip-confirmed" : "chip-warn"}`} title="신청자가 비밀번호를 잊었을 때 대신 바꿀 수 있어요" onClick={(e) => stop(e, () => void togglePaid(o))}>{o.paid ? "입금✓" : "입금"}</button>
                    <button type="button" className={`chip shrink-0 ${o.delivered ? "chip-ship" : "chip-warn"}`} title="신청자가 비밀번호를 잊었을 때 대신 바꿀 수 있어요" onClick={(e) => stop(e, () => void toggleDelivered(o))}>{o.delivered ? "수령✓" : "수령"}</button>
                    </div>
                  </summary>
                  <div className="px-3 pb-2.5 grid gap-1 text-xs text-muted">
                    <p>입금자명 <b className="text-[var(--ink)]">{o.depositor}</b>{o.paid && o.paidAt ? ` · 입금 표시 ${paidTimeLabel(o.paidAt)}` : ""}</p>
                    <p>{full}</p>
                    {o.memo && <p>메모: {o.memo}</p>}
                    <div className="flex justify-end">
                      <button className="btn btn-ghost text-xs py-1" onClick={() => removeOrder(o)}>주문 삭제</button>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 1) 업체 발주: 상품별 수량 · 업체 전달용 발주서 · 파일 내보내기 */}
      <section className="grid gap-2" aria-label="발주">
        <h2 className="label">집계 · 발주 · 내보내기</h2>
        <div className="panel p-3.5 grid gap-3">
          <details className="past">
            <summary className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="past-caret inline-block transition-transform">▸</span> 상품별 수량
              <span className="font-normal text-muted"> · {orders.length}명 · {totalQty}개 · {won(grand)}</span>
            </summary>
            <div className="mt-2.5 rounded-lg border border-line overflow-hidden">
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
          </details>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn text-sm" disabled={orders.length === 0} onClick={() => copy(report, "크루용 집계표(최종 주문 확인)를 복사했어요. 카톡방에 붙여넣으세요")}>크루용 집계표 복사</button>
            <button className="btn text-sm" disabled={orders.length === 0} onClick={() => copy(orderSheetText(round, orders), "업체용 발주서를 복사했어요. 업체에 붙여넣으세요")}>업체용 발주서 복사</button>
          </div>
          <div className="flex gap-2">
            <select aria-label="내보낼 파일 종류" className="input min-w-0 flex-1 py-2 text-sm" value={exportKind} onChange={(e) => setExportKind(e.target.value as "sheet" | "orderers")}>
              <option value="sheet">발주서 (CSV)</option>
              <option value="orderers">주문자 명단 (CSV)</option>
            </select>
            <button className="btn btn-primary text-sm shrink-0" disabled={orders.length === 0} onClick={() => exportKind === "sheet"
              ? downloadText(`${safeName(round.title)}_발주서.csv`, toCsv(orderSheetRows(round, orders)))
              : downloadText(`${safeName(round.title)}_주문자명단.csv`, toCsv(ordererRows(round, orders)))}>내보내기</button>
          </div>
        </div>
      </section>

      {/* 2) 공구 설정: 접수 상태·수정·복사·보관은 위, 삭제는 구분선 아래 */}
      <section className="grid gap-2" aria-label="공구 설정">
        <h2 className="label">공구 설정</h2>
        <div className="panel p-3.5 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button className="btn text-sm" onClick={() => setEditing(true)}>내용·마감 수정</button>
            <button className="btn text-sm" onClick={copyRound}>복사해서 새 공구 열기</button>
            {round.closed
              ? <button className="btn text-sm" onClick={() => setClosed(false)}>접수 다시 열기</button>
              : <button className="btn text-sm" onClick={() => setClosed(true)}>지금 접수 마감</button>}
            {round.archived
              ? <button className="btn text-sm" onClick={() => setArchived(false)}>보관함에서 꺼내기</button>
              : <button className="btn text-sm" disabled={!ended} title={ended ? undefined : "마감된 공구만 보관할 수 있어요"} onClick={() => setArchived(true)}>보관함으로 옮기기</button>}
          </div>
          <div className="border-t border-line pt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">비밀번호 확인 후 주문 내역까지 모두 삭제돼요</span>
            <button className="btn btn-ghost btn-danger text-sm" onClick={deleteRound}>공구 삭제</button>
          </div>
        </div>
      </section>

      {/* 3) 카톡방에 공유: 공지·링크·크루용 집계표 */}
      <section className="grid gap-2" aria-label="카톡방에 공유">
        <h2 className="label">카톡방에 공유</h2>
        <div className="panel p-3.5 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary text-sm" onClick={() => copy(announce, "공지 문구를 복사했어요. 카톡방에 붙여넣으세요")}>공지 문구 복사</button>
            <button className="btn text-sm" onClick={() => copy(orderUrl, "주문 링크를 복사했어요")}>주문 링크만 복사</button>
          </div>
        </div>
      </section>
      {toast}
    </main>
  );
}
