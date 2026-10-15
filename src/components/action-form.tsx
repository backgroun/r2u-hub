"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/app/actions";
import { showToast } from "@/components/toaster";

/** 서버 액션 폼: 결과 메시지를 폼 아래에 보여주고, 성공하면 입력칸을 비운다. */
export function ActionForm({
  action, children, className, keep = false, id, collapse = false, alertError = false,
}: {
  action: (s: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  keep?: boolean;
  id?: string;
  /** 성공하면 감싸고 있는 <details>(펼침 영역)를 접는다 */
  collapse?: boolean;
  /** 실패 메시지를 폼 안 글씨 대신 알럿 창으로 띄운다 (성공 메시지는 위쪽 알림으로만) */
  alertError?: boolean;
}) {
  const [state, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.msg) { if (alertError && !state.ok) window.alert(state.msg); else showToast(state.msg, state.ok ? "ok" : "err"); }
    if (!state?.ok) return;
    if (!keep) ref.current?.reset();
    if (collapse) ref.current?.closest("details")?.removeAttribute("open");
  }, [state, keep, collapse, alertError]);
  return (
    <form ref={ref} id={id} action={run} className={className} data-af="1">
      {children}
      {state?.msg && !alertError && (
        <p role="status" className={`text-sm ${state.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`} style={{ gridColumn: "1 / -1" }}>
          {state.msg}
        </p>
      )}
    </form>
  );
}

/** form: 폼 바깥에 둔 버튼일 때 연결할 폼 id · confirm: 있으면 저장 전에 확인 창을 띄운다 (기존 내용 수정 등) */
export function Submit({ children, className = "btn btn-primary", form, confirm }: { children: React.ReactNode; className?: string; form?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" form={form} className={className} disabled={pending} onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {pending ? "저장 중…" : children}
    </button>
  );
}

/** 위험한 버튼 (삭제 등): 누르면 확인 창을 띄우고, 확인해야 실행된다. message가 없으면 버튼 글자로 문구를 만든다. */
export function ConfirmButton({ children, message, className = "btn btn-ghost btn-danger text-sm py-1.5 px-2.5", label }: { children: React.ReactNode; message?: string; className?: string; label?: string }) {
  const text = message ?? (typeof children === "string" ? `[${children}] 정말 진행할까요?\n되돌릴 수 없어요.` : "정말 진행할까요?\n되돌릴 수 없어요.");
  return (
    <button type="submit" className={className} aria-label={label} onClick={(e) => { if (!window.confirm(text)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

/** 누르면 확인 알럿(confirm)을 먼저 띄우고, 확인해야 폼이 제출되는 버튼 */
export function AlertConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
