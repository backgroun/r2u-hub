"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MY_ROUNDS, store, type MyRound } from "@/lib/client";

export default function MyRounds() {
  const [mine, setMine] = useState<MyRound[]>([]);
  useEffect(() => setMine(store.get<MyRound[]>(MY_ROUNDS, [])), []);
  if (!mine.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="label">내가 연 공구 (관리)</h2>
      {mine.map((m) => (
        <Link key={m.id} href={`/groupbuy/r/${m.id}/manage`} className="panel p-4 flex items-center justify-between gap-3">
          <span className="font-bold min-w-0 truncate">{m.title}</span>
          <span className="text-sm text-[var(--lane)] shrink-0">관리 →</span>
        </Link>
      ))}
    </section>
  );
}
