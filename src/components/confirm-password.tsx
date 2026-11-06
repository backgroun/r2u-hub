"use client";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * 삭제 같은 민감한 동작 전에 본인 로그인 비밀번호를 다시 입력받는 팝업.
 * 맞으면 확인 토큰(문자열)을 돌려주고, 취소하면 null. 토큰은 서버가 동작을 실행할 때 다시 확인한다.
 */
export function confirmWithPassword(message: string, confirmLabel = "확인"): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (token: string | null) => { root.unmount(); host.remove(); resolve(token); };
    root.render(<PasswordDialog message={message} confirmLabel={confirmLabel} onDone={done} />);
  });
}

function PasswordDialog({ message, confirmLabel, onDone }: { message: string; confirmLabel: string; onDone: (token: string | null) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/confirm-pw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pw }) });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !data.token) { setErr(data.error ?? "확인하지 못했어요. 잠시 후 다시 시도해 주세요."); setBusy(false); return; }
      onDone(data.token);
    } catch { setErr("네트워크 오류가 났어요. 다시 시도해 주세요."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="비밀번호 확인" onClick={() => onDone(null)}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="panel w-full max-w-sm p-5 grid gap-3" style={{ background: "var(--card)" }}>
        <p className="font-bold">🔒 비밀번호 확인</p>
        <p className="text-sm whitespace-pre-wrap">{message}</p>
        <label className="field">
          <span className="label">내 로그인 비밀번호</span>
          <input ref={input} type="password" autoComplete="current-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" />
        </label>
        {err && <p className="chip chip-failed justify-self-start text-sm" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>취소</button>
          <button className="btn btn-danger" disabled={!pw || busy}>{busy ? "확인 중…" : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
