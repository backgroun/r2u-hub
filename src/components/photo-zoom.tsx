"use client";
import { useEffect, useState } from "react";

/** 사진을 누르면 화면 안 팝업으로 크게 보여 준다. 닫기 버튼·바깥 터치·Esc·휴대폰 뒤로가기로 닫힌다 */
export default function PhotoZoom({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
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
        <img src={src} alt={alt} loading="lazy" style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 10, background: "var(--paper)" }} />
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
