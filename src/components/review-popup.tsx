"use client";
import { useEffect, useState } from "react";

/** 버튼을 누르면 화면 안 팝업으로 내용을 보여 준다. 닫기 버튼·바깥 터치·Esc·뒤로가기로 닫힌다. (내용은 서버에서 그려 children 으로 받는다) */
export default function ReviewPopup({ label, title, defaultOpen = false, children }: { label: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!open) return;
    history.pushState({ review: true }, "");
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
      <button type="button" className="btn btn-primary shrink-0" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={title} onClick={() => history.back()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3">
          <div onClick={(e) => e.stopPropagation()} className="panel grid w-full overflow-hidden" style={{ maxWidth: 640, maxHeight: "92dvh", gridTemplateRows: "auto 1fr", background: "var(--card)" }}>
            <div className="flex items-center gap-2 p-3 border-b border-[var(--line)]">
              <b className="min-w-0 truncate">{title}</b>
              <button type="button" className="btn btn-ghost ml-auto shrink-0" onClick={() => history.back()}>닫기</button>
            </div>
            <div className="overflow-y-auto p-4" style={{ overscrollBehavior: "contain" }}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
