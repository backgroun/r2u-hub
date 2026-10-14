"use client";
import { useEffect, useRef, useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { sendScheduleNotices } from "@/app/actions";

/** 알림 발송: 버튼을 누르면 작은 레이어 팝업이 뜨고, 보낼 종류(대회·단사·카풀·뒷풀이)를 고르면 그 종류의 아직 안 지난 일정 전부에 알림이 간다. */
export default function ScheduleNoticePanel({ raceId, kinds }: { raceId: string; kinds: { key: string; label: string; count: number }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  // 바깥을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="notice-pop-wrap">
      <button type="button" className="btn text-sm py-1.5 px-3 inline-flex w-[7.5rem] justify-center" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        🔔 알림 발송
      </button>
      {open && (
        <div className="notice-pop" role="dialog" aria-label="알림 종류 선택">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm">어떤 알림을 보낼까요?</b>
            <button type="button" className="text-muted px-1" aria-label="닫기" onClick={() => setOpen(false)}>✕</button>
          </div>
          <ActionForm action={sendScheduleNotices} keep className="grid gap-2.5">
            <input type="hidden" name="id" value={raceId} />
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <label key={k.key} className="cchip">
                  <input type="checkbox" name="k" value={k.key} checked={picked.includes(k.key)} onChange={() => toggle(k.key)} />
                  <span>{k.label}{k.count > 1 ? ` ${k.count}` : ""}</span>
                </label>
              ))}
            </div>
            <Submit className="btn btn-primary text-sm py-1.5 px-3 w-full justify-center">{picked.length ? "선택한 알림 발송" : "종류를 선택하세요"}</Submit>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
