"use client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { joinRace } from "@/app/actions";
import { showToast } from "@/components/toaster";

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={pending}>{pending ? "저장 중…" : label}</button>;
}

/** 참가해요/코스 변경 버튼: 누르면 코스 선택·입력 팝업이 뜬다. 이전에 고른 코스는 미리 채우지 않고 빈 상태로 시작한다. */
export default function JoinPopup({ raceId, raceName, courses, joined }: { raceId: string; raceName: string; courses: string[]; joined: boolean }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(""); // 고른 코스 ("" 없음, "__etc" 직접 입력)
  const [state, run] = useActionState(joinRace, null);

  useEffect(() => {
    if (!state?.msg) return;
    if (state.ok) { showToast(state.msg, "ok"); setOpen(false); } else window.alert(state.msg);
  }, [state]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-primary race-act text-xs justify-center" onClick={() => { setSel(""); setOpen(true); }}>{joined ? "코스 변경" : "참가해요"}</button>
      {open && (
        <div className="join-pop-back" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form action={run} className="join-pop" role="dialog" aria-modal="true" aria-label="참가 코스 선택" key={String(open)}>
            <input type="hidden" name="id" value={raceId} />
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm min-w-0 truncate">{raceName}</b>
              <button type="button" className="text-muted px-1" aria-label="닫기" onClick={() => setOpen(false)}>✕</button>
            </div>
            <span className="text-xs text-muted">참가할 코스를 고르거나 직접 입력해 주세요.</span>
            <div className="course-row" role="radiogroup" aria-label="코스 선택">
              {courses.map((c) => (
                <label key={c} className="cchip">
                  <input type="radio" name="course" value={c} checked={sel === c} onChange={() => setSel(c)} />
                  <span>{c}</span>
                </label>
              ))}
              {/* 풀 옆: 누르면 코스를 직접 입력하는 칸이 열린다 */}
              <label className="cchip">
                <input type="radio" checked={sel === "__etc"} onChange={() => setSel("__etc")} />
                <span>직접 입력</span>
              </label>
            </div>
            {sel === "__etc" && <input name="courseEtc" className="input" placeholder="예: 3K, 하프" maxLength={20} aria-label="코스 직접입력" autoComplete="off" autoFocus />}
            <div className="flex gap-2">
              <button type="button" className="btn flex-1 justify-center" onClick={() => setOpen(false)}>취소</button>
              <Go label={joined ? "코스 변경" : "참가하기"} />
            </div>
          </form>
        </div>
      )}
    </>
  );
}
