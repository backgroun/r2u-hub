"use client";
import { useState } from "react";
import type { Guide, GuideTone } from "@/lib/garmin/guide";

const TAG: Record<GuideTone, { text: string; color: string }> = {
  warn: { text: "주의", color: "var(--warn)" },
  info: { text: "참고", color: "var(--muted)" },
  good: { text: "좋아요", color: "var(--good)" },
};

/** 내 운동 패턴에 따른 가이드: 버튼을 눌러야만 펼쳐진다 (상시 노출 X) */
export default function RunGuide({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
        style={{ padding: "13px 16px", background: "none", border: 0, color: "var(--ink)", cursor: "pointer" }}>
        <span className="grid gap-0.5">
          <b className="text-sm">{open ? "가이드 닫기" : "내 운동 패턴에 따른 가이드 받기"}</b>
          {!open && <span className="text-xs text-muted">최근 4주 기록을 보고 알려 드려요</span>}
        </span>
        <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden style={{ flex: "none", transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <p className="text-xs text-muted" style={{ padding: "10px 16px 2px" }}>{guide.basis}</p>
          {guide.items.map((it, i) => (
            <div key={it.title} style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <p className="flex items-center gap-2 text-sm">
                <span style={{ fontSize: 11, fontWeight: 800, color: TAG[it.tone].color, border: `1px solid ${TAG[it.tone].color}`, borderRadius: 999, padding: "1px 7px", flex: "none" }}>{TAG[it.tone].text}</span>
                <b>{it.title}</b>
              </p>
              <p className="text-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>{it.body}</p>
            </div>
          ))}
          <p className="text-xs text-muted" style={{ padding: "10px 16px 14px", borderTop: "1px solid var(--line)" }}>
            일반적인 훈련 원칙으로 만든 참고용 가이드예요. 통증이 있거나 컨디션이 좋지 않으면 쉬세요.
          </p>
        </div>
      )}
    </div>
  );
}
