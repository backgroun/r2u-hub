"use client";
import { useEffect, useState } from "react";
import { showToast } from "@/components/toaster";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const b64 = (s: string) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
};

export type PushState = "loading" | "unsupported" | "off" | "on" | "denied";

/** 이 기기의 알림 상태 */
export async function pushStatus(): Promise<PushState> {
  if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** 알림 허용을 묻고 구독을 서버에 저장한다 */
export async function enablePush(): Promise<{ state: PushState; msg?: string; bonus?: number }> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { state: perm === "denied" ? "denied" : "off" };
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY) }));
  const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON() }) });
  const j = r.ok ? await r.json().catch(() => ({})) : {};
  return r.ok ? { state: "on", bonus: Number(j.bonus) || 0 } : { state: "off", msg: "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요." };
}

/** 크루 알림 받기 켜기/끄기. iPhone은 홈 화면에 추가한 앱에서만 켤 수 있다. */
export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    pushStatus().then(setState).catch(() => setState("unsupported"));
    // 알림 켜기 팝업에서 켜면 이 버튼도 같이 바뀐다
    const on = () => setState("on");
    window.addEventListener("r2u:push-on", on);
    return () => window.removeEventListener("r2u:push-on", on);
  }, []);

  async function turnOn() {
    setMsg("");
    const r = await enablePush();
    setState(r.state);
    setMsg(r.state === "on" ? (r.bonus ? `알림을 켰어요. +${r.bonus}P` : "알림을 켰어요.") : r.msg ?? "");
    if (r.state === "on" && r.bonus) showToast(`알림을 켰어요! +${r.bonus}P 🔔`);
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
