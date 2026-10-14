"use client";
import { useEffect, useState } from "react";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const b64 = (s: string) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
};

/** 크루 알림 받기 켜기/끄기. iPhone은 홈 화면에 추가한 앱에서만 켤 수 있다. */
export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "denied">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setMsg("");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY) }));
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON() }) });
    if (r.ok) { setState("on"); setMsg("알림을 켰어요."); } else setMsg("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  async function turnOff() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off"); setMsg("공지 알림을 껐어요.");
  }

  if (state === "loading") return null;
  // compact: 상단 로고 옆에 작은 버튼만 둔다 (안내 문구가 필요한 상태는 숨김)
  if (compact && (state === "unsupported" || state === "denied")) return null;
  if (state === "unsupported") return <p className="text-xs text-muted">알림은 홈 화면에 추가한 앱에서 받을 수 있어요. (iPhone: 공유 → 홈 화면에 추가)</p>;
  if (state === "denied") return <p className="text-xs text-muted">알림이 차단돼 있어요. 기기 설정에서 R2U 알림을 허용해 주세요.</p>;
  if (compact) {
    // 상단 버튼: 켜짐은 녹색 테두리, 꺼짐은 회색 테두리 (이모지·채움 없음)
    const base = { background: "transparent", boxShadow: "none" } as const;
    const on = { ...base, color: "var(--good)", border: "1.4px solid var(--good)" } as const;
    const off = { ...base, color: "var(--muted)", border: "1.2px solid var(--muted)" } as const;
    return state === "on"
      ? <button type="button" className="btn text-xs !py-1 !px-2.5" style={on} title="눌러서 알림 끄기" onClick={turnOff}>알림 켜짐</button>
      : <button type="button" className="btn text-xs !py-1 !px-2.5" style={off} title="눌러서 알림 켜기" onClick={turnOn}>알림 꺼짐</button>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on"
        ? <button type="button" className="btn text-sm" style={{ background: "transparent", color: "var(--good)", border: "1.4px solid var(--good)", boxShadow: "none" }} onClick={turnOff}>🔔 알림 켜짐 · 끄기</button>
        : <button type="button" className="btn btn-primary text-sm" onClick={turnOn}>🔔 알림 받기</button>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
