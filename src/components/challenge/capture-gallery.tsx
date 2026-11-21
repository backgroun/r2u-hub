"use client";
import { useState } from "react";
import ImageLightbox from "@/components/image-lightbox";

export type Capture = { src: string; alt: string; label: string };

/** 캡처 썸네일 모음: 누르면 화면 가운데 팝업으로 크게 보이고, 같은 기록의 다른 캡처는 ‹ › 로 넘겨 본다. */
export default function CaptureGallery({ images, className = "grid grid-cols-2 gap-2", maxHeight = 150 }: { images: Capture[]; className?: string; maxHeight?: number }) {
  const [at, setAt] = useState<number | null>(null);
  if (!images.length) return null;
  return (
    <>
      <div className={className}>
        {images.map((im, k) => (
          <button key={im.src} type="button" className="grid gap-1 text-left" onClick={() => setAt(k)} aria-label={`${im.label} 크게 보기`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.src} alt={im.alt} loading="lazy" className="w-full rounded-lg border border-[var(--line)] bg-black/20 object-contain" style={{ maxHeight }} />
            <span className="text-xs text-muted">{im.label}</span>
          </button>
        ))}
      </div>
      {at !== null && <ImageLightbox images={images.map((x) => ({ src: x.src, alt: x.alt }))} index={at} onIndex={setAt} onClose={() => setAt(null)} />}
    </>
  );
}
