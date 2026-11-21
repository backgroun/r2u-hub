"use client";
import { useEffect, useRef, useState } from "react";

const MAX = 450 * 1024; // rules.ts 의 RULE.imageMaxBytes 와 같은 값

/** 캡처 1장 고르기: 브라우저에서 긴 변 1600px로 줄여 올린다(글씨가 읽히도록 사진 올리기보다 크게). 폼이 초기화되면 미리보기도 비운다. */
export default function PhotoField({ name, label, hint, have, required, inline, existingSrc }: { name: string; label: string; hint?: string; have?: boolean; required?: boolean; inline?: boolean /* 제목과 파일 선택을 한 줄에 */; existingSrc?: string /* 이미 올려 둔 캡처 주소(수정할 때 미리보기) */ }) {
  const pick = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const form = out.current?.form;
    const clear = () => { setPreview(""); setMsg(""); if (pick.current) pick.current.value = ""; };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let mime = "image/webp", q = 0.85, blob: Blob | null = null;
      for (let i = 0; i < 6; i++) {
        blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, q));
        // 일부 브라우저(사파리)는 WebP로 못 줄이고 PNG를 돌려준다 → JPEG로 다시 시도
        if (blob && blob.type !== mime && mime === "image/webp") { mime = "image/jpeg"; i--; continue; }
        if (blob && blob.size <= MAX) break;
        q -= 0.12;
      }
      if (!blob || blob.size > MAX) throw new Error("big");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `${name}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type }));
      out.current!.files = dt.files;
      setPreview(URL.createObjectURL(blob));
      setMsg(`${Math.round(blob.size / 1024)}KB로 줄였어요`);
    } catch {
      if (out.current) out.current.value = "";
      setPreview(""); setMsg("사진을 읽지 못했어요. 다른 캡처로 해 주세요.");
    }
    setBusy(false);
  }

  return (
    <div className={inline ? "flex flex-wrap items-center gap-x-2 gap-y-1" : "field"}>
      <span className={inline ? "label shrink-0 whitespace-nowrap" : "label"}>{label}{required && <b className="text-[var(--bad)]"> *</b>}</span>
      <input ref={out} type="file" name={name} hidden />
      <input ref={pick} type="file" accept="image/*" className={inline ? "input min-w-0 grow basis-0" : "input"} onChange={onPick} />
      {hint && <span className={`text-xs text-muted ${inline ? "basis-full" : ""}`}>{hint}</span>}
      {preview && <img src={preview} alt={`${label} 미리보기`} className={`mt-1 rounded-lg ${inline ? "basis-0" : ""}`} style={{ maxHeight: 140, maxWidth: "100%", ...(inline ? { flexBasis: "100%", objectFit: "contain", objectPosition: "left" } : {}) }} />}
      {busy && <span className={`text-xs text-muted ${inline ? "basis-full" : ""}`}>줄이는 중…</span>}
      {msg && <span className={`text-xs text-muted ${inline ? "basis-full" : ""}`}>{msg}</span>}
      {have && !preview && <span className={`text-xs text-muted ${inline ? "basis-full" : ""}`}>올려 둔 캡처가 있어요. 새로 고르면 바뀌어요.</span>}
      {have && !preview && existingSrc && (
        <a href={existingSrc} target="_blank" rel="noreferrer" className={`block ${inline ? "basis-full" : ""}`} title="누르면 원본이 새 탭에서 열려요">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={existingSrc} alt={`올려 둔 ${label}`} loading="lazy" className="rounded-lg border border-[var(--line)] bg-black/20" style={{ maxHeight: 160, maxWidth: "100%", objectFit: "contain" }} />
        </a>
      )}
    </div>
  );
}
