"use client";
import { useEffect, useRef, useState } from "react";

type Row = {
  id: number; text: string; file: File | null; url: string;
  /** 수정 모드: 이미 있는 항목이면 true (지울 수 없다) */
  existing: boolean;
  /** 수정 모드: 서버에 저장된 이미지 주소 (새 사진을 고르거나 지우기 전까지) */
  saved: string;
  /** 수정 모드: 저장된 이미지를 지우기로 했는가 */
  del: boolean;
};
export type InitialOption = { text: string; imageSrc?: string };

/** 긴 변 800px·WebP로 줄이기 (항목당 보통 50~120KB). 서버로는 줄인 파일만 간다. */
async function shrink(f: File, maxBytes: number): Promise<File> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.78, blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", q));
    if (blob && blob.size <= maxBytes) break;
    q -= 0.12;
  }
  if (!blob || blob.size > maxBytes) throw new Error("big");
  return new File([blob], "option.webp", { type: blob.type });
}

/**
 * 투표 항목 입력: 항목마다 글자 + 이미지 1장(선택).
 * 폼에는 항목 글자 `option`(칸 순서대로)과, 같은 순번의 이미지 `optImg{순번}` · 저장된 이미지 삭제 표시 `optDel{순번}`이 담긴다.
 * initial을 주면 수정 모드: 기존 항목은 글자·사진만 바꿀 수 있고 지울 수 없다 (투표 기록이 항목 번호로 저장돼 있어서).
 */
export default function PollOptionsEditor({ min, max, maxChars, maxBytes, initial }: { min: number; max: number; maxChars: number; maxBytes: number; initial?: InitialOption[] }) {
  const make = (): Row[] =>
    initial?.length
      ? initial.map((o, i) => ({ id: i, text: o.text, file: null, url: "", existing: true, saved: o.imageSrc ?? "", del: false }))
      : Array.from({ length: min }, (_, i) => ({ id: i, text: "", file: null, url: "", existing: false, saved: "", del: false }));
  const [rows, setRows] = useState<Row[]>(make);
  const seq = useRef(rows.length);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const hidden = useRef<(HTMLInputElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const floor = initial?.length ?? min; // 이 개수까지는 지울 수 없다

  // 행이 바뀔 때마다 실제 전송용(숨김) 입력에 그 행의 이미지를 맞춰 넣는다
  useEffect(() => {
    rows.forEach((r, i) => {
      const el = hidden.current[i];
      if (!el) return;
      const dt = new DataTransfer();
      if (r.file) dt.items.add(r.file);
      el.files = dt.files;
    });
  }, [rows]);

  // 저장 성공으로 폼이 reset되면 처음 상태로
  useEffect(() => {
    const form = wrap.current?.closest("form");
    if (!form) return;
    const clear = () => setRows(make());
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (id: number, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function onPick(id: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(""); setBusy(id);
    try {
      const small = await shrink(f, maxBytes);
      const old = rows.find((r) => r.id === id)?.url;
      if (old) URL.revokeObjectURL(old);
      patch(id, { file: small, url: URL.createObjectURL(small), del: false });
    } catch { setErr("사진을 읽지 못했어요. 다른 사진으로 해 주세요."); }
    setBusy(null);
  }

  /** 새로 고른 사진이 있으면 그것을, 없으면 저장된 사진을 지운다 */
  function removeImage(id: number) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    if (r.url) URL.revokeObjectURL(r.url);
    patch(id, { file: null, url: "", del: r.saved ? !r.file : false });
  }

  function removeRow(id: number) {
    const r = rows.find((x) => x.id === id);
    if (r?.url) URL.revokeObjectURL(r.url);
    setRows((cur) => cur.filter((x) => x.id !== id));
  }

  return (
    <div ref={wrap} className="grid gap-2">
      <span className="text-sm">항목 ({min}~{max}개) · 항목마다 이미지 1장 (선택)</span>
      {initial && <span className="text-xs text-muted">이미 있는 항목은 지우거나 순서를 바꿀 수 없어요. 새 항목은 뒤에 붙어요.</span>}
      {rows.map((r, i) => {
        const shown = r.url || (!r.del && r.saved) || "";
        return (
          <div key={r.id} className="flex items-center gap-2">
            <input type="file" name={`optImg${i}`} ref={(el) => { hidden.current[i] = el; }} hidden />
            {r.del && <input type="hidden" name={`optDel${i}`} value="1" />}
            <input
              name="option" className="input flex-1 min-w-0" placeholder={`항목 ${i + 1}`} maxLength={maxChars}
              value={r.text} onChange={(e) => patch(r.id, { text: e.target.value })} required={i < min || r.existing}
            />
            {shown ? (
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shown} alt={`항목 ${i + 1} 이미지 미리보기`} className="rounded-lg w-11 h-11 object-cover" />
                <button type="button" aria-label={`항목 ${i + 1} 이미지 지우기`} onClick={() => removeImage(r.id)} className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 text-white w-6 h-6 text-xs">✕</button>
              </div>
            ) : (
              <label className="btn btn-ghost text-sm shrink-0 min-h-[44px] flex items-center cursor-pointer" aria-label={`항목 ${i + 1} 이미지 추가`}>
                {busy === r.id ? "…" : "🖼 사진"}
                <input type="file" accept="image/*" hidden onChange={(e) => onPick(r.id, e)} />
              </label>
            )}
            {!r.existing && rows.length > floor && (
              <button type="button" aria-label={`항목 ${i + 1} 삭제`} onClick={() => removeRow(r.id)} className="shrink-0 w-11 h-11 text-muted">✕</button>
            )}
          </div>
        );
      })}
      {rows.length < max && (
        <button type="button" className="btn btn-ghost text-sm justify-self-start" onClick={() => setRows((cur) => [...cur, { id: seq.current++, text: "", file: null, url: "", existing: false, saved: "", del: false }])}>+ 항목 추가</button>
      )}
      {err && <span className="text-xs text-[var(--bad)]">{err}</span>}
    </div>
  );
}
