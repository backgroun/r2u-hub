"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MY_ROUNDS, store, type MyRound } from "@/lib/client";

export default function MyRounds() {
  const [mine, setMine] = useState<MyRound[]>([]);
  useEffect(() => {
    const saved = store.get<MyRound[]>(MY_ROUNDS, []);
    setMine(saved);
    // 운영진이 지운 공구가 남지 않게, 서버에 아직 있는지 확인하고 없는 것은 목록에서 뺀다
    Promise.all(saved.map((m) => fetch(`/api/rounds/${m.id}`, { cache: "no-store" }).then((r) => (r.status === 404 ? null : m)).catch(() => m)))
      .then((res) => {
        const alive = res.filter((m): m is MyRound => !!m);
        if (alive.length !== saved.length) { store.set(MY_ROUNDS, alive); setMine(alive); }
      });
  }, []);
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
