"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/app/actions";
import { showToast } from "@/components/toaster";

/** 서버 액션 폼: 결과 메시지를 폼 아래에 보여주고, 성공하면 입력칸을 비운다. */
export function ActionForm({
  action, children, className, keep = false, id, collapse = false,
}: {
  action: (s: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  keep?: boolean;
  id?: string;
  /** 성공하면 감싸고 있는 <details>(펼침 영역)를 접는다 */
  collapse?: boolean;
}) {
  const [state, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.msg) showToast(state.msg, state.ok ? "ok" : "err");
    if (!state?.ok) return;
    if (!keep) ref.current?.reset();
    if (collapse) ref.current?.closest("details")?.removeAttribute("open");
  }, [state, keep, collapse]);
  return (
    <form ref={ref} id={id} action={run} className={className} data-af="1">
      {children}
      {state?.msg && (
        <p role="status" className={`text-sm ${state.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`} style={{ gridColumn: "1 / -1" }}>
          {state.msg}
        </p>
      )}
    </form>
  );
}

/** form: 폼 바깥에 둔 버튼일 때 연결할 폼 id */
export function Submit({ children, className = "btn btn-primary", form }: { children: React.ReactNode; className?: string; form?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" form={form} className={className} disabled={pending}>{pending ? "저장 중…" : children}</button>;
}

/** 두 번 눌러야 실행되는 위험한 버튼 (삭제 등). confirm() 대신 쓴다. */
export function ConfirmButton({ children, className = "btn btn-ghost btn-danger text-sm py-1.5 px-2.5" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref} type="submit" className={className}
      onClick={(e) => {
        const b = e.currentTarget;
        if (b.dataset.armed) return;
        e.preventDefault(); b.dataset.armed = "1"; b.textContent = "한 번 더 누르면 실행";
        setTimeout(() => { if (ref.current) { delete ref.current.dataset.armed; ref.current.textContent = String(children); } }, 4000);
      }}
    >{children}</button>
  );
}
