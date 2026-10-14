"use client";
import { useEffect, useState } from "react";

/** 이벤트 탭 운영진 바의 ‘설정’: 누르면 아래 빙고판이 수정 모드로 바뀌어 칸을 눌러 이모지·제목·설명을 고칠 수 있다. 다시 누르면(수정 완료) 원래대로. */
export default function EventEditToggle() {
  const [on, setOn] = useState(false);
  const send = (value: boolean) => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe.event-frame");
    frame?.contentWindow?.postMessage({ type: "bingo-edit", on: value }, location.origin);
  };

  // 빙고 화면이 (다시) 열리면 현재 수정 모드 상태를 알려 준다
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === "bingo-ready") send(on); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [on]);

  return (
    <button type="button" className={`btn ${on ? "btn-primary" : "btn-ghost"}`} aria-pressed={on} onClick={() => { const next = !on; setOn(next); send(next); }}>
      {on ? "✔ 수정 완료" : "✏️ 수정"}
    </button>
  );
}
