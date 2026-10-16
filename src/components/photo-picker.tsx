"use client";
import { useRef, useState } from "react";

/** 사진 1장 고르기: 브라우저에서 긴 변 1280px·WebP로 줄여서 올린다(보통 100~200KB). 서버로는 줄인 파일만 간다. */
export default function PhotoPicker({ current, removable }: { current?: string; removable?: boolean }) {
  const pick = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let q = 0.78, blob: Blob | null = null;
      for (let i = 0; i < 5; i++) {
        blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", q));
        if (blob && blob.size <= 300 * 1024) break;
        q -= 0.12;
      }
      if (!blob || blob.size > 400 * 1024) throw new Error("big");
      const file = new File([blob], "photo.webp", { type: blob.type });
      const dt = new DataTransfer(); dt.items.add(file);
      out.current!.files = dt.files;
      setPreview(URL.createObjectURL(blob));
      setMsg(`${Math.round(blob.size / 1024)}KB로 줄였어요`);
    } catch {
      out.current!.value = ""; setPreview(""); setMsg("사진을 읽지 못했어요. 다른 사진으로 해 주세요.");
    }
    setBusy(false);
    e.target.value = "";
  }

  return (
    <div className="field full">
      <span className="label">사진 (1장 · 대회 다음 날 자동 삭제)</span>
      <input ref={out} type="file" name="photo" hidden />
      <input ref={pick} type="file" accept="image/*" className="input" onChange={onPick} />
      {(preview || current) && <img src={preview || current} alt="단체사진 미리보기" className="mt-2 rounded-lg" style={{ maxHeight: 160, maxWidth: "100%" }} />}
      {busy && <span className="text-xs text-muted">줄이는 중…</span>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {removable && current && <label className="text-xs mt-1"><input type="checkbox" name="removePhoto" value="1" /> 사진 지우기</label>}
    </div>
  );
}
