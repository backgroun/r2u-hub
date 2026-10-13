"use client";
import { useEffect, useState } from "react";
import type { RoundStatus } from "@/lib/types";

export function StatusChip({ status }: { status: RoundStatus }) {
  if (status === "open") return <span className="chip chip-open">모집중</span>;
  if (status === "confirmed") return <span className="chip chip-confirmed">공구 확정</span>;
  return <span className="chip chip-failed">수량 미달</span>;
}

export function PayBadges({ total, paid, delivered }: { total: number; paid: number; delivered?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="chip chip-warn num">입금대기 {total - paid}명</span>
      <span className="chip chip-confirmed num">입금완료 {paid}명</span>
      {delivered !== undefined && (
        <>
          <span className="chip chip-warn num">수령대기 {total - delivered}명</span>
          <span className="chip chip-ship num">수령완료 {delivered}명</span>
        </>
      )}
    </div>
  );
}

export function Progress({ count, min }: { count: number; min: number }) {
  if (min <= 0) return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-muted">수량 무관 · 모이는 대로 진행</span>
      <span className="num text-lg font-bold">{count}<span className="text-muted">개 주문</span></span>
    </div>
  );
  const pct = Math.min(100, Math.round((count / Math.max(1, min)) * 100));
  const done = count >= min;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">
          {done ? "최소 수량 달성" : `${min - count}개 더 모이면 진행`}
        </span>
        <span className="num text-lg font-bold">
          {count}<span className="text-muted">/{min}개</span>
        </span>
      </div>
      <div className={`track ${done ? "done" : ""}`} role="progressbar" aria-valuenow={count} aria-valuemax={min}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return <span className="chip chip-warn">접수 마감</span>;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (ms < 3600e3) return <span className="chip chip-hot">🔥 곧 마감 · {Math.max(1, mm)}분 남음</span>;
  const text = d > 0 ? `${d}일 ${h}시간 남음` : h > 0 ? `${h}시간 ${mm}분 남음` : `${mm}분 남음`;
  return <span className={`chip ${d === 0 ? "chip-warn" : "chip-open"}`}>⏱ {text}</span>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg] as const;
}

export function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" aria-label={`${label} 수량`}>
      <button type="button" aria-label="하나 빼기" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <output>{value}</output>
      <button type="button" aria-label="하나 더하기" onClick={() => onChange(Math.min(999, value + 1))}>+</button>
    </div>
  );
}
