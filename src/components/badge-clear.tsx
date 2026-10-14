"use client";
import { useEffect } from "react";

/** 앱을 열거나 다시 보면 홈 화면 아이콘의 알림 숫자를 지운다 (서비스워커가 세던 숫자도 0으로) */
export default function BadgeClear() {
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState !== "visible") return;
      try { (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {}); } catch { /* 지원하지 않는 기기 */ }
      navigator.serviceWorker?.getRegistration("/sw.js").then((reg) => reg?.active?.postMessage({ type: "clear-badge" })).catch(() => {});
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("focus", clear);
    return () => { document.removeEventListener("visibilitychange", clear); window.removeEventListener("focus", clear); };
  }, []);
  return null;
}
