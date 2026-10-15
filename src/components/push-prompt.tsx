"use client";

import { useEffect, useRef, useState } from "react";
import { enablePush, pushStatus } from "@/components/push-toggle";
import { showToast } from "@/components/toaster";

/* 알림을 안 켠 크루원에게 홈에서 ‘알림 켜기’ 팝업(아래에서 올라오는 시트)을 띄운다.
   - 꺼져 있음: 바로 켜는 버튼
   - iPhone에서 홈 화면 앱이 아님: 홈 화면에 추가하는 방법 안내 (그래야 알림을 받을 수 있다)
   - 차단됨: 기기 설정에서 허용하는 방법 안내
   ‘오늘은 그만’을 누르면 그날은 다시 안 뜬다. 알림을 켜면 더 이상 안 뜬다. */
type Kind = "off" | "install" | "denied";
const KEY = "pushPromptHide";
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const DEVICE_KEY = "pushDeviceHintDone"; // 이미 알림을 설정한 사람에게 새 기기 안내는 기기마다 한 번만
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* 저장 못 해도 괜찮다 */ } };

export default function PushPrompt({ bonus = 0, subscribed = false }: { bonus?: number; subscribed?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (subscribed) {
      // 다른 기기에서 이미 켠 사람: 큰 팝업 대신, 이 기기가 꺼져 있을 때 작은 안내를 한 번만
      let done = false;
      try { done = localStorage.getItem(DEVICE_KEY) === "1"; } catch { /* 무시 */ }
      if (done) return;
      pushStatus().then((st) => { if (st === "off") setHint(true); }).catch(() => {});
      return;
    }
    if (get() === today()) return;
    const t = setTimeout(async () => {
      const st = await pushStatus().catch(() => "unsupported" as const);
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const k: Kind | null = st === "off" ? "off" : st === "denied" ? "denied" : st === "unsupported" && ios && !standalone ? "install" : null;
      if (!k) return;
      setKind(k);
      ref.current?.showModal();
    }, 1200);
    return () => clearTimeout(t);
  }, [subscribed]);

  const closeHint = () => { try { localStorage.setItem(DEVICE_KEY, "1"); } catch { /* 무시 */ } setHint(false); };
  if (subscribed) {
    if (!hint) return null;
    return (
      <div className="toaster" role="status" style={{ pointerEvents: "auto" }}>
        <div className="toast-item ok flex items-center gap-2" style={{ pointerEvents: "auto" }}>
          <span className="text-sm">이 기기에서도 알림 받을까요?</span>
          <button type="button" className="btn btn-primary text-xs !py-1 !px-2.5" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await enablePush().catch(() => ({ state: "off" as const, msg: "알림을 켜지 못했어요." }));
            setBusy(false);
            if (r.state === "on") { window.dispatchEvent(new Event("r2u:push-on")); showToast("이 기기에서도 알림을 켰어요! 🔔"); closeHint(); }
            else if (r.msg) showToast(r.msg, "err");
            else closeHint();
          }}>켜기</button>
          <button type="button" className="btn btn-ghost text-xs !py-1 !px-2" onClick={closeHint}>닫기</button>
        </div>
      </div>
    );
  }

  const close = (hideToday: boolean) => { if (hideToday) set(today()); ref.current?.close(); };

  return (
    <dialog ref={ref} className="point-guide sheet push-prompt" onClick={(e) => { if (e.target === ref.current) close(true); }}>
      <span className="sheet-grip" aria-hidden />
      {kind && (
        <div className="grid gap-3 text-center">
          <div className="push-bell" aria-hidden>🔔</div>
          <h2 className="font-bold text-lg">크루 알림을 켜 주세요</h2>
          {bonus > 0 && <p className="push-bonus">처음 켜면 <b>+{bonus}P</b> 드려요</p>}
          {kind === "off" && <p className="text-sm text-muted">대회 출발·단사·카풀·뒤풀이 시간과 운영진 공지를 놓치지 않게 알려 드려요.</p>}
          {kind === "install" && (
            <div className="grid gap-1.5 text-sm text-left push-steps">
              <p className="text-muted text-center">iPhone은 R2U를 <b className="text-[var(--ink)]">홈 화면에 추가한 앱</b>에서만 알림을 받을 수 있어요.</p>
              <p>① 아래 <b>공유 버튼</b>(네모에 위 화살표)을 눌러요</p>
              <p>② <b>홈 화면에 추가</b>를 눌러요</p>
              <p>③ 홈 화면의 R2U 앱을 열고 알림을 켜요</p>
            </div>
          )}
          {kind === "denied" && (
            <div className="grid gap-1.5 text-sm text-left push-steps">
              <p className="text-muted text-center">알림이 차단돼 있어요. 기기 설정에서 허용해 주세요.</p>
              <p>· iPhone: 설정 → 알림 → R2U → 알림 허용</p>
              <p>· 안드로이드: 주소창 왼쪽 자물쇠(또는 앱 정보) → 알림 → 허용</p>
            </div>
          )}
          {kind === "off" ? (
            <button type="button" className="btn btn-primary py-3 text-base" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await enablePush().catch(() => ({ state: "off" as const, msg: "알림을 켜지 못했어요." }));
              setBusy(false);
              if (r.state === "on") { window.dispatchEvent(new Event("r2u:push-on")); showToast(r.bonus ? `알림을 켰어요! +${r.bonus}P 🔔` : "알림을 켰어요! 🔔"); close(false); }
              else if (r.state === "denied") setKind("denied");
              else if (r.msg) showToast(r.msg, "err");
            }}>{busy ? "켜는 중…" : bonus > 0 ? `알림 켜고 +${bonus}P 받기` : "알림 켜기"}</button>
          ) : (
            <button type="button" className="btn btn-primary py-3 text-base" onClick={() => close(true)}>알겠어요</button>
          )}
          {kind === "off" && <button type="button" className="btn btn-ghost text-sm" onClick={() => close(true)}>오늘은 그만 보기</button>}
        </div>
      )}
    </dialog>
  );
}
