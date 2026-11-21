"use client";
import { useState } from "react";

const fmt = (digits: string) => (digits ? Number(digits).toLocaleString("ko-KR") : "");

/** 금액 입력칸: 보이는 값에는 천 단위 콤마를 붙이고, 폼에는 숫자만(name) 담아 보낸다. */
export default function MoneyInput({ name, defaultValue = 0, required, className = "input" }: { name: string; defaultValue?: number; required?: boolean; className?: string }) {
  const [digits, setDigits] = useState(String(defaultValue ?? ""));
  return (
    <>
      <input type="text" inputMode="numeric" autoComplete="off" className={className} required={required} value={fmt(digits)}
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))} />
      <input type="hidden" name={name} value={digits} />
    </>
  );
}
