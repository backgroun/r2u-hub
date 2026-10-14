"use client";
import { useEffect, useRef, useState } from "react";

type T = { id: number; msg: string; kind: "ok" | "err" };
const EVT = "r2u:toast";

/** 어디서든 부를 수 있는 알림 띄우기 (화면 위쪽에 잠깐 떴다가 사라진다) */
export function showToast(msg: string, kind: "ok" | "err" = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT, { detail: { msg, kind } }));
}

const doneText = (label: string) => {
  const t = label.replace(/\s+/g, " ").trim();
  if (!t || t.includes("한 번 더")) return "처리했어요.";
  if (t.includes("삭제")) return "삭제했어요.";
  if (t.includes("승인")) return "승인했어요.";
  if (t.includes("거절")) return "거절했어요.";
  if (t.includes("취소") || t === "✕") return "취소했어요.";
  if (t.includes("응원")) return "응원을 반영했어요.";
  if (t.includes("마감")) return "접수 상태를 바꿨어요.";
  if (t.includes("초기화")) return "초기화했어요.";
  return "완료됐어요.";
};

/** 알림 표시 + 결과 메시지가 따로 없는 버튼(삭제·승인·응원 등)을 눌렀을 때 완료 알림을 자동으로 띄운다 */
export default function Toaster() {
  const [list, setList] = useState<T[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const push = (msg: string, kind: "ok" | "err") => {
      const id = ++seq.current;
      setList((l) => [...l.slice(-2), { id, msg, kind }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 2600);
    };
    const onToast = (e: Event) => { const d = (e as CustomEvent<{ msg: string; kind: "ok" | "err" }>).detail; if (d?.msg) push(d.msg, d.kind); };
    window.addEventListener(EVT, onToast);

    // 결과 메시지 폼(ActionForm)이 아닌 일반 폼 제출을 기억해 둔다
    let pending: { label: string; at: number } | null = null;
    const onSubmit = (e: Event) => {
      const ev = e as SubmitEvent;
      const form = ev.target as HTMLFormElement;
      if (form.dataset.af || form.getAttribute("method")?.toLowerCase() === "get" || typeof form.action !== "string") return;
      if (form.action.includes("/races/find")) return; // 검색
      const label = (ev.submitter as HTMLElement | null)?.textContent ?? "";
      pending = { label, at: Date.now() };
    };
    document.addEventListener("submit", onSubmit, true);

    // 서버 기능(Server Action) 요청이 끝나면 완료 알림을 띄운다
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const res = await orig(...args);
      try {
        const h = args[1]?.headers as Record<string, string> | Headers | undefined;
        const isAction = h instanceof Headers ? h.has("next-action") : !!h && Object.keys(h).some((k) => k.toLowerCase() === "next-action");
        if (isAction && pending && Date.now() - pending.at < 15000) {
          const p = pending; pending = null;
          if (res.ok) push(doneText(p.label), "ok"); else push("처리하지 못했어요. 잠시 후 다시 시도해 주세요.", "err");
        }
      } catch { /* 알림 실패는 무시 */ }
      return res;
    };
    return () => { window.removeEventListener(EVT, onToast); document.removeEventListener("submit", onSubmit, true); window.fetch = orig; };
  }, []);

  if (!list.length) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast-item ${t.kind}`}>{t.kind === "ok" ? "✓ " : "⚠ "}{t.msg}</div>)}
    </div>
  );
}
