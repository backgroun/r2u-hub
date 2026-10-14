"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, MY_ROUNDS, store, type MyRound } from "@/lib/client";
import { fmtDeadline, roundStatus, type PublicSummary, type Round } from "@/lib/types";
import { PayBadges, StatusChip, useToast } from "@/components/ui";

type Row = { round: Round; adminKey: string; summary: PublicSummary };
const TOKEN = "crew-gb:staff";

/** 공구 운영진 화면. embedded: 운영진 화면(공구 탭) 안에 넣을 때 머리말·나가기·비밀번호 입력을 숨긴다 */
export default function GroupbuyStaff({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "ended">("all");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    const saved = store.get<string | null>(TOKEN, null);
    if (saved) { setToken(saved); setReady(true); return; }
    // 허브 운영진으로 로그인했으면 비밀번호 없이 바로 입장
    api<{ token: string }>("/api/staff/session")
      .then((d) => { store.set(TOKEN, d.token); setToken(d.token); })
      .catch(() => { if (embedded) setErr("공구 관리 정보를 불러오지 못했어요. 새로고침해 주세요."); })
      .finally(() => setReady(true));
  }, [embedded]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRows(await api<Row[]>("/api/staff/rounds", { headers: { "x-staff-token": token } }));
    } catch (e) {
      store.del(TOKEN); setToken(null); setErr((e as Error).message);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const d = await api<{ token: string }>("/api/staff/login", { method: "POST", json: { password: pw } });
      store.set(TOKEN, d.token); setToken(d.token); setPw("");
    } catch (e) { setErr((e as Error).message); }
  }

  function openManage(r: Row) {
    const mine = store.get<MyRound[]>(MY_ROUNDS, []).filter((m) => m.id !== r.round.id);
    store.set(MY_ROUNDS, [{ id: r.round.id, key: r.adminKey, title: r.round.title }, ...mine]);
    router.push(`/groupbuy/r/${r.round.id}/manage`);
  }

  async function setClosed(r: Row, closed: boolean) {
    await api(`/api/rounds/${r.round.id}`, { method: "PATCH", json: { key: r.adminKey, closed } });
    showToast(closed ? "접수를 마감했어요" : "접수를 다시 열었어요"); load();
  }

  async function remove(r: Row) {
    await api(`/api/rounds/${r.round.id}?key=${encodeURIComponent(r.adminKey)}`, { method: "DELETE" });
    store.set(MY_ROUNDS, store.get<MyRound[]>(MY_ROUNDS, []).filter((m) => m.id !== r.round.id));
    setConfirm(null); showToast("공구를 삭제했어요"); load();
  }

  if (!ready) return null;

  if (!token && embedded) return <p className="panel p-4 text-sm text-muted">{err ?? "공구 목록을 불러오는 중…"}</p>;
  if (!token) return (
    <main className="wrap grid gap-5">
      <Link href="/groupbuy" className="text-sm text-muted">← R2U 크루 공구</Link>
      <form onSubmit={login} className="panel p-5 grid gap-4">
        <h1 className="hub-h1">운영진 모드</h1>
        <p className="text-sm text-muted">크루 운영진 비밀번호를 입력하면 모든 공구를 한곳에서 관리할 수 있어요.</p>
        <input id="s-password" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" className="input pw-mask" placeholder="운영진 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <p className="chip chip-failed justify-self-start text-sm">{err}</p>}
        <button className="btn btn-primary" disabled={!pw}>들어가기</button>
      </form>
    </main>
  );

  const list = (rows ?? []).map((r) => ({ ...r, status: roundStatus(r.round, r.summary.totalQty) }));
  const shown = list.filter((r) => filter === "all" || (filter === "open" ? r.status === "open" : r.status !== "open"));
  const openCount = list.filter((r) => r.status === "open").length;
  const orderCount = list.reduce((s, r) => s + r.summary.participants, 0);

  return (
    <main className={embedded ? "grid gap-4" : "wrap grid gap-5"}>
      {!embedded && <>
        <div className="flex items-center justify-between gap-2">
          <Link href="/groupbuy" className="text-sm text-muted">← R2U 크루 공구</Link>
          <button className="text-sm text-muted underline underline-offset-2" onClick={() => { store.del(TOKEN); setToken(null); setRows(null); }}>운영진 모드 나가기</button>
        </div>
        <header className="grid gap-1">
          <h1 className="hub-h1">운영진 모드</h1>
        </header>
      </>}

      <div className="grid grid-cols-3 gap-2">
        {[["전체 공구", list.length], ["모집중", openCount], ["총 주문", orderCount]].map(([k, v]) => (
          <div key={k} className="panel p-3 grid">
            <span className="label">{k}</span>
            <span className="num text-2xl font-bold">{v}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5" role="tablist">
        {([["all", "전체"], ["open", "모집중"], ["ended", "마감"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`btn text-sm py-1.5 ${filter === k ? "btn-primary" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {rows === null && <p className="text-muted text-sm">불러오는 중…</p>}
      {rows && shown.length === 0 && <p className="panel p-4 text-sm text-muted">해당하는 공구가 없어요.</p>}

      <ul className="grid gap-2.5">
        {shown.map((r) => (
          <li key={r.round.id} className="panel p-4 grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <StatusChip status={r.status} />
              <span className="num text-sm text-muted">
                {r.summary.participants}명 · {r.round.minQty > 0 ? `${r.summary.totalQty}/${r.round.minQty}개` : `${r.summary.totalQty}개`}
              </span>
            </div>
            <Link href={`/groupbuy/r/${r.round.id}`} className="font-bold text-lg leading-snug">{r.round.title}</Link>
            <p className="text-sm text-muted">마감 {fmtDeadline(r.round.deadline)}{r.round.pickup?.place && ` · 배포 ${r.round.pickup.place}`}</p>
            <PayBadges total={r.summary.participants} paid={r.summary.paidCount} delivered={r.status === "open" ? undefined : r.summary.deliveredCount} />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary text-sm py-2" onClick={() => openManage(r)}>관리 화면</button>
              {r.round.closed
                ? <button className="btn text-sm py-2" onClick={() => setClosed(r, false)}>접수 다시 열기</button>
                : <button className="btn text-sm py-2" onClick={() => setClosed(r, true)}>지금 마감</button>}
              {confirm === r.round.id ? (
                <span className="flex items-center gap-1">
                  <button className="btn btn-danger text-sm py-2" onClick={() => remove(r)}>주문까지 삭제</button>
                  <button className="btn btn-ghost text-sm py-2" onClick={() => setConfirm(null)}>아니요</button>
                </span>
              ) : (
                <button className="btn btn-ghost btn-danger text-sm py-2" onClick={() => setConfirm(r.round.id)}>삭제</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {toast}
    </main>
  );
}
