"use client";
import { useRef, useTransition } from "react";
import { toggleAbsent, toggleCame } from "@/app/actions";

/** 당일 운영진 본인 뱃지: 한 번 누르면 출석 체크, 두 번(빠르게) 누르면 참석 불가 */
export default function SelfChip({ raceId, afterId, nick, className, children }: { raceId: string; afterId: string; nick: string; className: string; children: React.ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = useTransition();
  const run = (action: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set("id", raceId); fd.set("after", afterId); fd.set("nick", nick);
    start(async () => { await action(fd); });
  };
  const click = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; run(toggleAbsent); return; }
    timer.current = setTimeout(() => { timer.current = null; run(toggleCame); }, 320);
  };
  return <button type="button" className={className} onClick={click} title="한 번: 출석 체크 · 두 번: 참석 불가">{children}</button>;
}
