"use client";
import { useEffect } from "react";

/** 모바일에서 누른 순간 바로 눌림이 보이게 한다.
   iOS는 touchstart를 듣는 곳이 없으면 :active가 안 먹고, 손가락이 가리는 짧은 터치는 :active가 보이기 전에 끝난다.
   그래서 누르는 즉시 is-pressed를 붙이고, 손을 떼도 최소 140ms는 유지한다. */
const PRESSABLE = "button, a[href], summary, [role='button'], label.chip, .chip, .btn";
export default function PressFeel() {
  useEffect(() => {
    let el: Element | null = null, at = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      const t = el; el = null;
      if (!t) return;
      clearTimeout(timer);
      timer = setTimeout(() => t.classList.remove("is-pressed"), Math.max(0, 140 - (Date.now() - at)));
    };
    const down = (e: Event) => {
      const t = (e.target as Element | null)?.closest?.(PRESSABLE);
      if (!t || (t as HTMLButtonElement).disabled || t.closest(".bounce-item")) return;
      el = t; at = Date.now();
      t.classList.add("is-pressed");
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("pointerdown", down, { passive: true });
    for (const ev of ["touchend", "touchcancel", "pointerup", "pointercancel", "scroll"]) document.addEventListener(ev, release, { passive: true, capture: ev === "scroll" });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("pointerdown", down);
      for (const ev of ["touchend", "touchcancel", "pointerup", "pointercancel", "scroll"]) document.removeEventListener(ev, release, { capture: ev === "scroll" });
    };
  }, []);
  return null;
}
