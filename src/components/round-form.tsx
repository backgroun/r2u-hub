"use client";
import { useState } from "react";
import { buildCustomItems, CUSTOM_KINDS, CUSTOM_PRESETS, makeTitle, type CustomKind, type CustomSpec, type Item, type Round } from "@/lib/types";
import { normalizePassword } from "@/components/password-input";

export type RoundDraft = Omit<Round, "id" | "createdAt" | "closed">;

const uid = () => Math.random().toString(36).slice(2, 8);

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function defaultDeadline() {
  const d = new Date(Date.now() + 3 * 864e5);
  d.setHours(22, 0, 0, 0);
  return d.toISOString();
}

export const EMPTY_DRAFT: RoundDraft = {
  title: "",
  opener: "",
  bank: { bank: "", account: "", holder: "" },
  pickup: { place: "" },
  deadline: defaultDeadline(),
  minQty: 20,
  items: [
    { id: uid(), name: "", price: 0 },
  ],
};

export default function RoundForm({
  initial, submitLabel, onSubmit, askPassword = false,
}: { initial: RoundDraft; submitLabel: string; onSubmit: (d: RoundDraft, password: string) => Promise<void>; askPassword?: boolean }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [d, setD] = useState<RoundDraft>({ ...initial, pickup: initial.pickup ?? EMPTY_DRAFT.pickup });
  const [deadlineLocal, setDeadlineLocal] = useState(toLocalInput(initial.deadline));
  const [lastMin, setLastMin] = useState(initial.minQty > 0 ? initial.minQty : 20);
  const [busy, setBusy] = useState(false);
  // R2U 단체 제작: 종류(의류·모자·양말·기타)와 사이즈·컬러를 정해서 주문받는다
  const [custom, setCustom] = useState<CustomSpec | null>(initial.custom ?? null);
  const [sizesText, setSizesText] = useState((initial.custom?.sizes ?? []).join(", "));
  const [colorsText, setColorsText] = useState((initial.custom?.colors ?? []).join(", "));
  const splitList = (t: string) => [...new Set(t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
  const pickKind = (kind: CustomKind) => {
    const pre = CUSTOM_PRESETS[kind];
    setCustom((c) => ({ ...(c ?? { name: "", price: 0, sizes: [], colors: [] }), kind }));
    setSizesText(pre.sizes.join(", ")); setColorsText(pre.colors.join(", "));
  };
  const startCustom = () => { setCustom({ kind: "의류", name: "", price: 0, sizes: [], colors: [] }); setSizesText(CUSTOM_PRESETS.의류.sizes.join(", ")); setColorsText(CUSTOM_PRESETS.의류.colors.join(", ")); };
  const customNow: CustomSpec | undefined = custom ? { ...custom, sizes: splitList(sizesText), colors: splitList(colorsText) } : undefined;
  const comboCount = customNow ? Math.max(1, customNow.sizes.length) * Math.max(1, customNow.colors.length) : 0;
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof RoundDraft>(k: K, v: RoundDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) =>
    set("items", d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = new Date(deadlineLocal);
    if (Number.isNaN(t.getTime())) return setErr("마감 날짜와 시간을 정해 주세요.");
    if (askPassword && password.length < 4) return setErr("관리 비밀번호는 4자 이상으로 정해 주세요.");
    setBusy(true);
    try {
      if (customNow && !customNow.name.trim()) throw new Error("제작할 상품 이름을 입력해 주세요.");
      await onSubmit({ ...d, deadline: t.toISOString(), custom: customNow, items: customNow ? buildCustomItems(customNow) : d.items.filter((i) => i.name.trim()) }, password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <fieldset className="panel p-4 grid gap-4">
        <legend className="label px-1">기본 정보</legend>
        <div className={askPassword ? "grid grid-cols-2 gap-2" : "grid"}>
          <label className="field min-w-0">
            <span className="label">공구 오픈자</span>
            <input id="f-opener" className="input" placeholder="이름·닉네임" value={d.opener} onChange={(e) => set("opener", e.target.value)} />
          </label>
          {askPassword && (
            <label className="field min-w-0">
              <span className="label">관리 비밀번호</span>
              <div className="relative">
                <input id="f-password" type={showPw ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" spellCheck={false} className="input pr-11" placeholder="영문·숫자 4자 이상" value={password} onChange={(e) => setPassword(normalizePassword(e.target.value))} />
                <button type="button" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-muted" onClick={() => setShowPw((v) => !v)}>{showPw ? "숨김" : "보기"}</button>
              </div>
            </label>
          )}
        </div>
        {askPassword && <span className="text-xs text-muted -mt-2">관리 비밀번호는 잊으면 되찾을 수 없어요. 크루원에게는 알려주지 마세요.</span>}
      </fieldset>

      <fieldset className="panel p-4 grid gap-4">
        <legend className="label px-1">마감과 진행 조건</legend>
        <label className="field">
          <span className="label">접수 마감 (날짜·시간)</span>
          <input id="f-deadline" type="datetime-local" className="input" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} />
        </label>
        <div className="field">
          <span className="label">최소 수량 (주문 개수 합계가 이만큼 차면 진행)</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input id="f-min" type="number" inputMode="numeric" min={1} aria-label="최소 수량" className="input num w-24" disabled={d.minQty === 0}
                value={d.minQty === 0 ? "" : d.minQty}
                onChange={(e) => { const n = Number(e.target.value); set("minQty", n); if (n > 0) setLastMin(n); }} />
              <span className="text-muted">개</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-semibold">
              <input id="f-min-any" type="checkbox" className="size-5 accent-[var(--bib)]" checked={d.minQty === 0}
                onChange={(e) => set("minQty", e.target.checked ? 0 : lastMin)} />
              수량 무관
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="panel p-4 grid gap-4">
        <legend className="label px-1">배포</legend>
        <label className="field">
          <span className="label">배포 장소</span>
          <input id="f-pickup-place" className="input" placeholder="예) 울산 OOO" value={d.pickup.place} onChange={(e) => set("pickup", { place: e.target.value })} />
        </label>
      </fieldset>

      <fieldset className="panel p-4 grid gap-4">
        <legend className="label px-1">공구 입금 계좌</legend>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <input id="f-bank" className="input" placeholder="은행" value={d.bank.bank} onChange={(e) => set("bank", { ...d.bank, bank: e.target.value })} />
          <input id="f-account" className="input num" inputMode="numeric" placeholder="계좌번호" value={d.bank.account} onChange={(e) => set("bank", { ...d.bank, account: e.target.value })} />
        </div>
        <input id="f-holder" className="input" placeholder="예금주" value={d.bank.holder} onChange={(e) => set("bank", { ...d.bank, holder: e.target.value })} />
      </fieldset>

      <div className="seg" role="group" aria-label="공구 종류">
        <button type="button" className={`btn ${!custom ? "btn-primary" : ""}`} onClick={() => setCustom(null)}>일반 공구</button>
        <button type="button" className={`btn ${custom ? "btn-primary" : ""}`} onClick={() => !custom && startCustom()}>R2U 단체 제작</button>
      </div>

      {custom ? (
        <fieldset className="panel p-4 grid gap-4">
          <legend className="label px-1">단체 제작 상품</legend>
          <div className="field">
            <span className="label">무엇을 만들까요?</span>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_KINDS.map((k) => (
                <button key={k} type="button" className={`btn text-sm ${custom.kind === k ? "btn-primary" : ""}`} onClick={() => pickKind(k)}>
                  {k === "의류" ? "👕 " : k === "모자" ? "🧢 " : k === "양말" ? "🧦 " : "🎁 "}{k}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-[1.6]" placeholder="상품명 (예: R2U 크루 티셔츠)" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <div className="relative min-w-0 flex-1">
              <input type="text" inputMode="numeric" aria-label="가격" className="input num pr-7" placeholder="25,000"
                value={custom.price ? custom.price.toLocaleString("ko-KR") : ""}
                onChange={(e) => setCustom({ ...custom, price: Math.min(Number(e.target.value.replace(/[^0-9]/g, "")) || 0, 100_000_000) })} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">원</span>
            </div>
          </div>
          <label className="field">
            <span className="label">사이즈 {custom.kind === "기타" && "(없으면 비워 두세요)"}</span>
            <input className="input" placeholder="쉼표로 구분 예) S, M, L, XL" value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">컬러 {custom.kind === "기타" && "(없으면 비워 두세요)"}</span>
            <input className="input" placeholder="쉼표로 구분 예) 블랙, 화이트, 네이비" value={colorsText} onChange={(e) => setColorsText(e.target.value)} />
          </label>
          <input type="url" inputMode="url" className="input" placeholder="시안·참고 URL (선택)" value={custom.url ?? ""} onChange={(e) => setCustom({ ...custom, url: e.target.value })} />
          <input className="input" placeholder="참고사항 (선택) 예) 소재, 제작 기간, 로고 위치" value={custom.note ?? ""} onChange={(e) => setCustom({ ...custom, note: e.target.value })} />
          <p className="text-sm text-muted">
            주문 항목 <b className="num">{comboCount}</b>가지
            {customNow && (customNow.sizes.length > 0 || customNow.colors.length > 0) && <> ({customNow.colors.length ? `컬러 ${customNow.colors.length}` : ""}{customNow.colors.length && customNow.sizes.length ? " × " : ""}{customNow.sizes.length ? `사이즈 ${customNow.sizes.length}` : ""})</>}
            {" "}· 공구 이름 <b>{makeTitle(d.opener, [{ name: custom.name }])}</b> <span className="text-xs">(자동)</span>
          </p>
        </fieldset>
      ) : (
      <fieldset className="panel p-4 grid gap-3">
        <legend className="label px-1">상품</legend>
        <p className="text-sm">공구 이름 <b>{makeTitle(d.opener, d.items)}</b> <span className="text-muted text-xs">(자동)</span></p>
        {d.items.map((it, i) => (
          <div key={it.id} className="grid gap-2 pb-3 border-b border-line last:border-0 last:pb-0">
            <div className="flex gap-2">
              <input id={`f-item-${it.id}`} className="input min-w-0 flex-[1.6]" placeholder="상품명 (예: 젤 카페인)" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
              <div className="relative min-w-0 flex-1">
                <input id={`f-price-${it.id}`} type="text" inputMode="numeric" aria-label="가격" className="input num pr-7" placeholder="13,000"
                  value={it.price ? it.price.toLocaleString("ko-KR") : ""}
                  onChange={(e) => setItem(i, { price: Math.min(Number(e.target.value.replace(/[^0-9]/g, "")) || 0, 100_000_000) })} />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">원</span>
              </div>
              {d.items.length > 1 && (
                <button type="button" className="btn btn-ghost px-2 shrink-0" aria-label="상품 삭제" onClick={() => set("items", d.items.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            <div className="grid gap-2">
              <input id={`f-url-${it.id}`} type="url" inputMode="url" className="input" placeholder="상품 URL (선택) 예) https://smartstore.naver.com/…" value={it.url ?? ""} onChange={(e) => setItem(i, { url: e.target.value })} />
              <input id={`f-note-${it.id}`} className="input" placeholder="참고사항 (선택) 예) 1박스 24개입, 카페인 40mg" value={it.note ?? ""} onChange={(e) => setItem(i, { note: e.target.value })} />
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => set("items", [...d.items, { id: uid(), name: "", price: 0 }])}>+ 상품 추가</button>
      </fieldset>
      )}

      {err && <p className="chip chip-failed justify-self-start text-sm">{err}</p>}
      <button className="btn btn-primary py-3.5 text-base" disabled={busy}>{busy ? "저장 중…" : submitLabel}</button>
    </form>
  );
}
