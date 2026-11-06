"use client";
import { useEffect, useRef, useState } from "react";
import { buildCustomItems, colorNeeds, CUSTOM_KINDS, CUSTOM_PRESETS, makeTitle, type CustomKind, type CustomSpec, type Item, type Round } from "@/lib/types";
import { normalizePassword } from "@/components/password-input";
import { store } from "@/lib/client";

export type RoundDraft = Omit<Round, "id" | "createdAt" | "closed">;
/** 시안 이미지: 새로 올린 것(base64) · null 이면 이미지 없음(있던 것은 지운다) · "keep" 이면 올려 둔 그대로 */
export type DesignImage = { type: string; data: string };
export type SubmitExtra = { designImage: DesignImage | null | "keep"; sizeImage: DesignImage | null | "keep" };

// 이전에 입력한 입금 계좌 (이 기기에만, 최근 10개)
type BankRec = { bank: string; account: string; holder: string };
const BANKS_KEY = "crew-gb:banks";
const sameBank = (a: BankRec, b: BankRec) => a.bank === b.bank && a.account === b.account && a.holder === b.holder;

/** 사진을 가로세로 1280px 이하 JPEG(약 330KB 이하)로 줄여 base64 로 만든다 */
async function compressImage(file: File, maxDim = 1280): Promise<DesignImage> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale)); canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리하지 못했어요.");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // 투명 배경은 흰색으로
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= 330 * 1024) {
      const data = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] ?? ""); fr.onerror = () => rej(new Error("이미지를 읽지 못했어요.")); fr.readAsDataURL(blob); });
      return { type: "image/jpeg", data };
    }
  }
  throw new Error("이미지가 너무 커요. 더 작은 사진을 골라 주세요.");
}

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
    { id: "i0", name: "", price: 0 }, // 고정 id (서버·브라우저 렌더가 같아야 hydration 오류가 안 난다)
  ],
};

// 임시저장: 입력 중인 내용을 이 기기(브라우저)에만 저장해 두었다가 다음에 열면 불러온다. 비밀번호는 저장하지 않는다.
type Extras = { designMode: "url" | "image"; designImg: DesignImage | null; imgRemoved: boolean; sizeOpen: boolean; sizeImg: DesignImage | null; sizeRemoved: boolean; needsOpen: boolean };
type FormSnap = { d: RoundDraft; deadlineLocal: string; custom: CustomSpec | null; sizesText: string; colorsText: string; lastMin: number } & Extras;
type SavedDraft = FormSnap & { savedAt: number };
const fmtSaved = (t: number) => {
  const x = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getMonth() + 1}/${x.getDate()} ${p(x.getHours())}:${p(x.getMinutes())}`;
};

export default function RoundForm({
  initial, submitLabel, onSubmit, askPassword = false, draftKey, roundId,
}: { initial: RoundDraft; submitLabel: string; onSubmit: (d: RoundDraft, password: string, extra: SubmitExtra) => Promise<void>; askPassword?: boolean; draftKey?: string; roundId?: string }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [d, setD] = useState<RoundDraft>({ ...initial, pickup: initial.pickup ?? EMPTY_DRAFT.pickup });
  // 서버(UTC)와 브라우저(한국 시간)의 시각 표기가 달라 hydration 오류가 나므로, 마운트 뒤에 브라우저 시간으로 채운다
  const [deadlineLocal, setDeadlineLocal] = useState("");
  useEffect(() => setDeadlineLocal(toLocalInput(initial.deadline)), [initial.deadline]);
  const [lastMin, setLastMin] = useState(initial.minQty > 0 ? initial.minQty : 20);
  const [busy, setBusy] = useState(false);
  // R2U 단체 제작: 종류(의류·모자·양말·기타)와 사이즈·컬러를 정해서 주문받는다
  const [custom, setCustom] = useState<CustomSpec | null>(initial.custom ?? null);
  const hadImage = !!initial.custom?.image;
  const [designMode, setDesignMode] = useState<"url" | "image">(hadImage ? "image" : "url");
  const [sizesText, setSizesText] = useState((initial.custom?.sizes ?? []).join(", "));
  const [colorsText, setColorsText] = useState((initial.custom?.colors ?? []).join(", "));
  const splitList = (t: string) => [...new Set(t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
  const pickKind = (kind: CustomKind) => {
    const pre = CUSTOM_PRESETS[kind];
    setCustom((c) => ({ ...(c ?? { name: "", price: 0, sizes: [], colors: [] }), kind }));
    setSizesText(pre.sizes.join(", ")); setColorsText(pre.colors.join(", "));
  };
  const startCustom = () => { setCustom({ kind: "의류", name: "", price: 0, sizes: [], colors: [] }); setSizesText(CUSTOM_PRESETS.의류.sizes.join(", ")); setColorsText(CUSTOM_PRESETS.의류.colors.join(", ")); };
  const colorList = splitList(colorsText);
  const customNow: CustomSpec | undefined = custom ? {
    ...custom, sizes: splitList(sizesText), colors: colorList,
    url: designMode === "image" ? undefined : custom.url,
    needs: (() => {
      const out: Record<string, string[]> = {};
      for (const k of colorList) { const v = colorNeeds(custom, k).filter((x) => x !== k && colorList.includes(x)); if (v.length) out[k] = v; }
      return Object.keys(out).length ? out : undefined;
    })(),
  } : undefined;
  if (customNow && !customNow.needs) delete customNow.needsMode;
  const comboCount = customNow ? Math.max(1, customNow.sizes.length) * Math.max(1, customNow.colors.length) : 0;
  const [err, setErr] = useState<string | null>(null);

  // ----- 이전 입금 계좌 목록 (최근 10개) -----
  const [banks, setBanks] = useState<BankRec[]>([]);
  useEffect(() => { setBanks(store.get<BankRec[]>(BANKS_KEY, []).slice(0, 10)); }, []);
  const rememberBank = (b: BankRec) => {
    const rec = { bank: b.bank.trim(), account: b.account.trim(), holder: b.holder.trim() };
    if (!rec.bank || !rec.account) return;
    const next = [rec, ...store.get<BankRec[]>(BANKS_KEY, []).filter((x) => !sameBank(x, rec))].slice(0, 10);
    store.set(BANKS_KEY, next); setBanks(next);
  };
  const forgetBank = (b: BankRec) => { const next = banks.filter((x) => !sameBank(x, b)); store.set(BANKS_KEY, next); setBanks(next); };

  // ----- 시안: URL 또는 이미지 올리기 -----
  const [designImg, setDesignImg] = useState<DesignImage | null>(null); // 이번에 새로 고른 이미지
  const [imgRemoved, setImgRemoved] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const previewSrc = designImg ? `data:${designImg.type};base64,${designImg.data}` : hadImage && !imgRemoved && roundId ? `/api/gb-round-image/${roundId}?t=${roundId}` : null;
  // 사이즈표: 필요할 때만 ‘사이즈표 추가’를 눌러 이미지로 올린다
  const hadSize = !!initial.custom?.sizeImage;
  const [sizeOpen, setSizeOpen] = useState(hadSize);
  const [sizeImg, setSizeImg] = useState<DesignImage | null>(null);
  const [sizeRemoved, setSizeRemoved] = useState(false);
  const [sizeBusy, setSizeBusy] = useState(false);
  const sizeSrc = sizeImg ? `data:${sizeImg.type};base64,${sizeImg.data}` : hadSize && !sizeRemoved && roundId ? `/api/gb-round-image/${roundId}?k=size` : null;
  async function pickSize(file: File | undefined) {
    if (!file) return;
    setErr(null); setSizeBusy(true);
    try { setSizeImg(await compressImage(file, 1600)); setSizeRemoved(false); }
    catch (e) { setErr((e as Error).message || "이미지를 불러오지 못했어요."); }
    finally { setSizeBusy(false); }
  }
  async function pickImage(file: File | undefined) {
    if (!file) return;
    setErr(null); setImgBusy(true);
    try { setDesignImg(await compressImage(file)); setImgRemoved(false); }
    catch (e) { setErr((e as Error).message || "이미지를 불러오지 못했어요."); }
    finally { setImgBusy(false); }
  }

  // ----- 구매 조건 (이 상품은 다른 상품을 산 사람만) -----
  const needsItem = (a: string, b: string): boolean => { // a 가 (연쇄로) b 를 먼저 사야 하는가
    const seen = new Set<string>(); const stack = [...(d.items.find((x) => x.id === a)?.needs ?? [])];
    while (stack.length) { const id = stack.pop()!; if (id === b) return true; if (seen.has(id)) continue; seen.add(id); stack.push(...(d.items.find((x) => x.id === id)?.needs ?? [])); }
    return false;
  };
  const needsColor = (a: string, b: string): boolean => { // 컬러 a 가 (연쇄로) 컬러 b 를 먼저 사야 하는가
    const seen = new Set<string>(); const stack = custom ? [...colorNeeds(custom, a)] : [];
    while (stack.length) { const x = stack.pop()!; if (x === b) return true; if (seen.has(x)) continue; seen.add(x); if (custom) stack.push(...colorNeeds(custom, x)); }
    return false;
  };
  // 컬러 조건 칩: 누르면 그 컬러를 ‘먼저 사야 하는 컬러’에 넣거나 뺀다 (여러 개 가능, 하나라도 담으면 통과)
  const toggleColorNeed = (color: string, need: string) => setCustom((c) => {
    if (!c) return c;
    const rest: Record<string, string[]> = {};
    for (const k of Object.keys(c.needs ?? {})) rest[k] = colorNeeds(c, k);
    const cur = rest[color] ?? [];
    const next = cur.includes(need) ? cur.filter((x) => x !== need) : [...cur, need];
    if (next.length) rest[color] = next; else delete rest[color];
    const any = Object.keys(rest).length > 0;
    return { ...c, needs: any ? rest : undefined, needsMode: any ? c.needsMode : undefined };
  });
  const setColorCap = (on: boolean) => setCustom((c) => (c ? { ...c, needsMode: on ? "cap" : undefined } : c));
  const toggleItemNeed = (i: number, id: string) => {
    const it = d.items[i]; const cur = it.needs ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setItem(i, { needs: next.length ? next : undefined, needsMode: next.length ? it.needsMode : undefined });
  };

  // 구매 조건은 공구마다 달라서 ‘구매 조건 설정’을 눌러야만 설정 칸이 나온다. (이미 조건이 있으면 처음부터 펼쳐 둔다)
  const [needsOpen, setNeedsOpen] = useState(false);
  const hasNeeds = Object.keys(custom?.needs ?? {}).length > 0 || d.items.some((x) => x.needs?.length);
  const needsShown = needsOpen || hasNeeds;
  const clearNeeds = () => {
    setCustom((c) => (c ? { ...c, needs: undefined, needsMode: undefined } : c));
    setD((x) => ({ ...x, items: x.items.map((it) => ({ ...it, needs: undefined, needsMode: undefined })) }));
    setNeedsOpen(false);
  };

  // ----- 임시저장 (draftKey 가 있을 때만) -----
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false); // 이번에 저장본을 불러왔는가 (안내 문구용)
  const ready = useRef(false); // 저장본 불러오기를 마친 뒤부터 자동 저장
  const blocked = useRef(false); // 제출·삭제 직후에는 예약된 자동 저장이 다시 쓰지 않게 막는다
  const [draftNote, setDraftNote] = useState("");
  const initialSnap = (): FormSnap => ({
    d: { ...initial, pickup: initial.pickup ?? EMPTY_DRAFT.pickup }, deadlineLocal: toLocalInput(initial.deadline), custom: initial.custom ?? null,
    sizesText: (initial.custom?.sizes ?? []).join(", "), colorsText: (initial.custom?.colors ?? []).join(", "), lastMin: initial.minQty > 0 ? initial.minQty : 20,
    designMode: hadImage ? "image" : "url", designImg: null, imgRemoved: false, sizeOpen: hadSize, sizeImg: null, sizeRemoved: false, needsOpen: false,
  });
  const snapNow = (): FormSnap => ({ d, deadlineLocal, custom, sizesText, colorsText, lastMin, designMode, designImg, imgRemoved, sizeOpen, sizeImg, sizeRemoved, needsOpen });
  const apply = (v: FormSnap) => {
    setD(v.d); setDeadlineLocal(v.deadlineLocal); setCustom(v.custom); setSizesText(v.sizesText); setColorsText(v.colorsText); setLastMin(v.lastMin);
    setDesignMode(v.designMode); setDesignImg(v.designImg); setImgRemoved(v.imgRemoved); setSizeOpen(v.sizeOpen); setSizeImg(v.sizeImg); setSizeRemoved(v.sizeRemoved); setNeedsOpen(v.needsOpen);
  };
  // 이미지(base64)까지 저장하되, 저장 공간이 모자라면 이미지는 빼고 글만 저장한다
  const writeDraft = () => {
    const at = Date.now(); const snap = snapNow();
    const put = (v: unknown) => { try { localStorage.setItem(draftKey!, JSON.stringify(v)); return true; } catch { return false; } };
    if (put({ ...snap, savedAt: at } satisfies SavedDraft)) setDraftNote("");
    else if (put({ ...snap, designImg: null, sizeImg: null, savedAt: at } satisfies SavedDraft)) setDraftNote("이미지는 용량 때문에 저장하지 못했어요. 이미지는 다시 골라야 해요.");
    else { setDraftNote("이 기기에 저장하지 못했어요. (저장 공간 부족 또는 저장 차단)"); return; }
    setSavedAt(at);
  };
  useEffect(() => {
    if (draftKey) {
      const v = store.get<SavedDraft | null>(draftKey, null);
      if (v && v.d && Array.isArray(v.d.items)) {
        // 새 공구는 지난 마감일이 남아 있으면 새 기본값(3일 뒤)으로 바꾼다 (수정 화면은 그대로 둔다)
        const dl = roundId || new Date(v.deadlineLocal).getTime() > Date.now() ? v.deadlineLocal : toLocalInput(defaultDeadline());
        apply({ ...initialSnap(), ...v, d: { ...v.d, pickup: v.d.pickup ?? EMPTY_DRAFT.pickup }, deadlineLocal: dl });
        setSavedAt(v.savedAt ?? null); setRestored(true);
      }
    }
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 입력이 바뀌면 잠시 뒤 자동 저장. 처음 상태와 같으면 저장본을 만들지 않는다.
  useEffect(() => {
    if (!draftKey || !ready.current || blocked.current || !deadlineLocal) return;
    const t = setTimeout(() => {
      if (blocked.current) return;
      if (JSON.stringify(snapNow()) === JSON.stringify(initialSnap())) return;
      writeDraft();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, deadlineLocal, custom, sizesText, colorsText, lastMin, designMode, designImg, imgRemoved, sizeOpen, sizeImg, sizeRemoved, needsOpen]);
  const clearDraft = () => { blocked.current = true; if (draftKey) store.del(draftKey); setSavedAt(null); setRestored(false); setDraftNote(""); };
  const resetDraft = () => { clearDraft(); apply(initialSnap()); blocked.current = false; };

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
      const designImage: SubmitExtra["designImage"] = customNow && designMode === "image" ? (designImg ?? (hadImage && !imgRemoved ? "keep" : null)) : null;
      const sizeImage: SubmitExtra["sizeImage"] = customNow && sizeOpen ? (sizeImg ?? (hadSize && !sizeRemoved ? "keep" : null)) : null;
      await onSubmit({ ...d, deadline: t.toISOString(), custom: customNow, items: customNow ? buildCustomItems(customNow) : d.items.filter((i) => i.name.trim()) }, password, { designImage, sizeImage });
      rememberBank(d.bank);
      if (draftKey) clearDraft(); // 공구를 열었으면 임시저장본은 지운다
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 round-form">
      <div className="seg" role="group" aria-label="공구 종류">
        <button type="button" className={`btn ${!custom ? "btn-primary" : ""}`} onClick={() => setCustom(null)}>일반 공구</button>
        <button type="button" className={`btn ${custom ? "btn-primary" : ""}`} onClick={() => !custom && startCustom()}>R2U 단체 제작</button>
      </div>

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
        <label className="field">
          <span className="label">접수 마감 (날짜·시간)</span>
          <input id="f-deadline" type="datetime-local" className="input" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} />
        </label>
        <div className="field">
          <span className="label">최소 수량 <span className="font-normal">(합계가 이만큼 차면 진행)</span></span>
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
        <label className="field">
          <span className="label">배포 장소</span>
          <input id="f-pickup-place" className="input" placeholder="예) 울산 OOO" value={d.pickup.place} onChange={(e) => set("pickup", { place: e.target.value })} />
        </label>
      </fieldset>

      <fieldset className="panel p-4 grid gap-4">
        <legend className="label px-1">공구 입금 계좌</legend>
        {banks.length > 0 && (
          <details className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">이전에 입력한 계좌 불러오기 ({banks.length}/10)</summary>
            <ul className="grid gap-1.5 mt-2">
              {banks.map((b) => (
                <li key={`${b.bank}|${b.account}|${b.holder}`} className="flex items-center gap-1">
                  <button type="button" className="btn btn-ghost flex-1 min-w-0 !justify-start text-left text-sm" onClick={() => set("bank", { ...b })}>
                    <span className="truncate">{b.bank} {b.account} · {b.holder || "예금주 없음"}</span>
                  </button>
                  <button type="button" className="btn btn-ghost px-2 shrink-0" aria-label="이 계좌 기록 지우기" onClick={() => forgetBank(b)}>✕</button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted mt-2">눌러서 채우고, ✕ 는 이 기기의 기록에서만 지워요. 공구를 열면 최근 10개까지 저장돼요.</p>
          </details>
        )}
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <input id="f-bank" className="input" placeholder="은행" value={d.bank.bank} onChange={(e) => set("bank", { ...d.bank, bank: e.target.value })} />
          <input id="f-account" className="input num" inputMode="numeric" placeholder="계좌번호" value={d.bank.account} onChange={(e) => set("bank", { ...d.bank, account: e.target.value })} />
        </div>
        <input id="f-holder" className="input" placeholder="예금주" value={d.bank.holder} onChange={(e) => set("bank", { ...d.bank, holder: e.target.value })} />
      </fieldset>

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
          {colorList.length >= 2 && (!needsShown ? (
            <button type="button" className="btn btn-ghost justify-self-start text-sm" onClick={() => setNeedsOpen(true)}>＋ 구매 조건 설정</button>
          ) : (
            <div className="field">
              <span className="label">컬러별 구매 조건</span>
              <div className="grid gap-2">
                {colorList.map((c) => (
                  <div key={c} className="grid gap-1">
                    <span className="text-sm"><b>{c}</b> <span className="text-muted">은(는) 아래 컬러를 산 사람만</span></span>
                    <div className="flex flex-wrap gap-1.5">
                      {colorList.filter((o) => o !== c && !needsColor(o, c)).map((o) => {
                        const on = colorNeeds(custom, c).includes(o);
                        return <button key={o} type="button" className={`chip ${on ? "chip-confirmed" : ""}`} aria-pressed={on} onClick={() => toggleColorNeed(c, o)}>{on ? "✓ " : ""}{o}</button>;
                      })}
                      {colorList.filter((o) => o !== c && !needsColor(o, c)).length === 0 && <span className="text-xs text-muted">고를 수 있는 컬러가 없어요</span>}
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="size-5 accent-[var(--bib)] mt-0.5" checked={custom.needsMode === "cap"} disabled={!customNow?.needs} onChange={(e) => setColorCap(e.target.checked)} />
                <span>조건 컬러를 담은 수량까지만 주문 가능<br /><span className="text-xs text-muted">예) 블랙 2장을 담았으면 화이트는 최대 2장까지. 끄면 블랙을 1장 이상 담기만 하면 돼요.</span></span>
              </label>
              <span className="text-xs text-muted">고른 컬러 중 하나라도 담으면 통과예요. 예) 화이트 → ‘블랙’ : 블랙을 한 장 이상 담아야 화이트를 담을 수 있어요.</span>
              <button type="button" className="btn btn-ghost justify-self-start text-sm" onClick={clearNeeds}>구매 조건 빼기</button>
            </div>
          ))}
          <div className="field">
            <span className="label">시안·참고 자료 <span className="font-normal">(선택)</span></span>
            <div className="seg" role="group" aria-label="시안 방식">
              <button type="button" className={`btn text-sm ${designMode === "url" ? "btn-primary" : ""}`} onClick={() => setDesignMode("url")}>🔗 URL</button>
              <button type="button" className={`btn text-sm ${designMode === "image" ? "btn-primary" : ""}`} onClick={() => setDesignMode("image")}>🖼 이미지 올리기</button>
            </div>
            {designMode === "url" ? (
              <input type="url" inputMode="url" className="input" placeholder="시안·참고 URL (선택)" value={custom.url ?? ""} onChange={(e) => setCustom({ ...custom, url: e.target.value })} />
            ) : (
              <div className="grid gap-2">
                {previewSrc && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewSrc} alt="시안 미리보기" className="rounded-lg max-h-56 max-w-full object-contain border border-line justify-self-start" />
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn cursor-pointer text-sm">
                    {imgBusy ? "처리 중…" : previewSrc ? "다른 이미지 고르기" : "📷 이미지 고르기"}
                    <input type="file" accept="image/*" hidden disabled={imgBusy} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {previewSrc && <button type="button" className="btn btn-ghost text-sm" onClick={() => { setDesignImg(null); setImgRemoved(true); }}>이미지 빼기</button>}
                </div>
                <span className="text-xs text-muted">큰 사진은 자동으로 줄여서 올려요. 로그인한 크루원에게만 보여요.</span>
              </div>
            )}
          </div>
          {!sizeOpen ? (
            <button type="button" className="btn btn-ghost justify-self-start text-sm" onClick={() => setSizeOpen(true)}>＋ 사이즈표 추가</button>
          ) : (
            <div className="field">
              <span className="label">사이즈표 <span className="font-normal">(이미지)</span></span>
              <div className="grid gap-2">
                {sizeSrc && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sizeSrc} alt="사이즈표 미리보기" className="rounded-lg max-h-56 max-w-full object-contain border border-line justify-self-start" />
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn cursor-pointer text-sm">
                    {sizeBusy ? "처리 중…" : sizeSrc ? "다른 이미지 고르기" : "📏 사이즈표 이미지 고르기"}
                    <input type="file" accept="image/*" hidden disabled={sizeBusy} onChange={(e) => { void pickSize(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  <button type="button" className="btn btn-ghost text-sm" onClick={() => { setSizeImg(null); setSizeRemoved(true); setSizeOpen(false); }}>사이즈표 빼기</button>
                </div>
                <span className="text-xs text-muted">주문 화면에서 ‘사이즈표 보기’로 펼쳐 볼 수 있어요. 큰 사진은 자동으로 줄여서 올려요.</span>
              </div>
            </div>
          )}
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
                <button type="button" className="btn btn-ghost px-2 shrink-0" aria-label="상품 삭제" onClick={() => set("items", d.items.filter((_, j) => j !== i).map((x) => (x.needs?.includes(it.id) ? { ...x, needs: x.needs.filter((n) => n !== it.id) } : x)))}>✕</button>
              )}
            </div>
            <div className="grid gap-2">
              <input id={`f-url-${it.id}`} type="url" inputMode="url" className="input" placeholder="상품 URL (선택) 예) https://smartstore.naver.com/…" value={it.url ?? ""} onChange={(e) => setItem(i, { url: e.target.value })} />
              <input id={`f-note-${it.id}`} className="input" placeholder="참고사항 (선택) 예) 1박스 24개입, 카페인 40mg" value={it.note ?? ""} onChange={(e) => setItem(i, { note: e.target.value })} />
              {needsShown && d.items.filter((o, j) => j !== i && o.name.trim() && !needsItem(o.id, it.id)).length > 0 && (
                <div className="grid gap-1.5 rounded-xl border border-line p-2.5">
                  <span className="text-xs text-muted">이 상품은 아래 상품을 산 사람만 주문 가능 (선택, 하나라도 담으면 통과)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {d.items.filter((o, j) => j !== i && o.name.trim() && !needsItem(o.id, it.id)).map((o) => {
                      const on = !!it.needs?.includes(o.id);
                      return <button key={o.id} type="button" className={`chip ${on ? "chip-confirmed" : ""}`} aria-pressed={on} onClick={() => toggleItemNeed(i, o.id)}>{on ? "✓ " : ""}{o.name}</button>;
                    })}
                  </div>
                  {it.needs?.length ? (
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" className="size-5 accent-[var(--bib)]" checked={it.needsMode === "cap"} onChange={(e) => setItem(i, { needsMode: e.target.checked ? "cap" : undefined })} />
                      조건 상품을 담은 수량까지만 주문 가능
                    </label>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => set("items", [...d.items, { id: uid(), name: "", price: 0 }])}>+ 상품 추가</button>
          {d.items.length >= 2 && (needsShown
            ? <button type="button" className="btn btn-ghost" onClick={clearNeeds}>구매 조건 빼기</button>
            : <button type="button" className="btn btn-ghost" onClick={() => setNeedsOpen(true)}>＋ 구매 조건 설정</button>)}
        </div>
        {needsShown && d.items.length >= 2 && <p className="text-xs text-muted">상품마다 먼저 사야 하는 상품을 골라 두면, 그 상품을 담은 사람만 주문할 수 있어요. 아무것도 고르지 않은 상품은 조건 없이 주문돼요.</p>}
      </fieldset>
      )}

      {err && <p className="chip chip-failed justify-self-start text-sm">{err}</p>}
      {draftKey && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn" onClick={() => { blocked.current = false; writeDraft(); }}>임시저장</button>
          <span className="text-xs text-muted">
            {savedAt ? `${restored ? "저장해 둔 내용을 불러왔어요 · " : ""}${fmtSaved(savedAt)} 저장됨 (이 기기에만, 입력하면 자동 저장)` : "입력하면 자동으로 이 기기에 임시저장돼요. 비밀번호는 저장하지 않아요."}
            {draftNote && <b className="block text-[var(--bad)]">{draftNote}</b>}
          </span>
          {savedAt && <button type="button" className="btn btn-ghost text-xs" onClick={resetDraft}>지우고 새로 쓰기</button>}
        </div>
      )}
      <button className="btn btn-primary py-3.5 text-base" disabled={busy}>{busy ? "저장 중…" : submitLabel}</button>
    </form>
  );
}
