"use client";
import { useEffect, useRef, useState } from "react";

/** 사진을 누르면 화면 안 팝업으로 크게 보여 준다. 닫기 버튼·바깥 터치·Esc·휴대폰 뒤로가기로 닫힌다 */
export default function PhotoZoom({ src, thumb, alt }: { src: string; thumb?: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false); // 작은 사진이 없는 예전 사진은 원본을 그대로 쓴다
  const imgRef = useRef<HTMLImageElement>(null);
  // 서버가 그려 준 이미지가 화면이 살아나기 전에 이미 실패했으면 onError 를 놓치므로, 뜬 직후 한 번 확인한다
  useEffect(() => { const i = imgRef.current; if (thumb && i && i.complete && i.naturalWidth === 0) setThumbFailed(true); }, [thumb]);
  useEffect(() => {
    if (!open) return;
    // 뒤로가기가 페이지를 떠나지 않고 팝업만 닫도록 기록을 하나 쌓아 둔다
    history.pushState({ photoZoom: true }, "");
    const onPop = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") history.back(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${alt} 크게 보기`} className="block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={thumb && !thumbFailed ? thumb : src} onError={() => { if (thumb) setThumbFailed(true); }} alt={alt} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 10, background: "var(--paper)" }} />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${alt} 크게 보기`} onClick={() => history.back()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <button type="button" onClick={() => history.back()} aria-label="닫기" className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/60 text-white text-xl" autoFocus>✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}
