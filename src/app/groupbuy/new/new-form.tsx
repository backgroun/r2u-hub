"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RoundForm, { EMPTY_DRAFT } from "@/components/round-form";
import { api, MY_ROUNDS, store, type MyRound } from "@/lib/client";
import { makeTitle } from "@/lib/types";

export default function NewRoundForm({ me }: { me: string }) {
  const router = useRouter();
  return (
    <main className="wrap grid gap-5">
      <Link href="/groupbuy" className="text-sm text-muted">← 처음으로</Link>
      <h1 className="font-display text-2xl">새 공구 열기</h1>
      <RoundForm
        initial={{ ...EMPTY_DRAFT, opener: me }}
        submitLabel="공구 열기"
        onSubmit={async (d, password) => {
          const { id, adminKey } = await api<{ id: string; adminKey: string }>("/api/rounds", { method: "POST", json: { ...d, password } });
          const mine = store.get<MyRound[]>(MY_ROUNDS, []);
          store.set(MY_ROUNDS, [{ id, key: adminKey, title: makeTitle(d.opener, d.items) }, ...mine]);
          router.push(`/groupbuy/r/${id}/manage?new=1`);
        }}
      />
    </main>
  );
}
