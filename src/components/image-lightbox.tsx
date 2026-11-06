"use client";
import { useEffect } from "react";

export type LightboxImage = { src: string; alt: string };

/** 이미지를 눌렀을 때 화면 가운데에 크게 띄우는 팝업. 여러 장이면 ‹ › 로 넘기고, 바깥을 누르거나 Esc 로 닫는다. */
export default function ImageLightbox({ images, index, onIndex, onClose }: { images: LightboxImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const n = images.length;
  const cur = images[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && n > 1) onIndex((index - 1 + n) % n);
      else if (e.key === "ArrowRight" && n > 1) onIndex((index + 1) % n);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 팝업 뒤 화면이 같이 스크롤되지 않게
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [index, n, onClose, onIndex]);
  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3" role="dialog" aria-modal="true" aria-label={cur.alt} onClick={onClose}>
      <button type="button" aria-label="닫기" className="absolute top-3 right-3 size-11 rounded-full bg-white/15 text-white text-2xl leading-none" onClick={onClose}>✕</button>
      {n > 1 && (
        <button type="button" aria-label="이전 이미지" className="absolute left-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 text-white text-2xl leading-none" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + n) % n); }}>‹</button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cur.src} alt={cur.alt} className="max-h-[88vh] max-w-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      {n > 1 && (
        <button type="button" aria-label="다음 이미지" className="absolute right-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/15 text-white text-2xl leading-none" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % n); }}>›</button>
      )}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">{cur.alt}{n > 1 ? ` · ${index + 1}/${n}` : ""}</span>
    </div>
  );
}
