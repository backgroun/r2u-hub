"use client";

import { useTransition } from "react";
import { setViewMode } from "@/app/actions";

/** 운영진 전용: 메뉴의 내 이름 탭 옆에 세로로 놓는 보기 모드 전환 (운영자 ↔ 크루). 어느 화면에서든 바로 바꾸고, 바뀌면 알림 창으로 알려 준다. */
export function ViewModeStack({ crew }: { crew: boolean }) {
  const [pending, start] = useTransition();
  const change = (mode: "admin" | "crew") => {
    if ((mode === "crew") === crew || pending) return; // 이미 그 모드면 그대로
    start(async () => {
      const fd = new FormData();
      fd.set("mode", mode);
      await setViewMode(fd);
      window.alert(mode === "crew" ? "크루 모드로 변경되었습니다." : "운영진 모드로 변경되었습니다.");
    });
  };
  return (
    <div className="mode-stack" role="group" aria-label="보기 모드">
      <button type="button" className={!crew ? "on" : ""} aria-pressed={!crew} aria-label="운영진 모드" title="운영진 모드" disabled={pending} onClick={() => change("admin")}>O</button>
      <button type="button" className={crew ? "on" : ""} aria-pressed={crew} aria-label="크루 모드" title="크루 모드" disabled={pending} onClick={() => change("crew")}>C</button>
    </div>
  );
}
