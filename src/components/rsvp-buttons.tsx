"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rsvpAfter } from "@/app/actions";
import { showToast } from "@/components/toaster";

/** 뒷풀이 참석·불참, 카풀 탑승 버튼. 값을 직접 담아 보내고, 끝나면 화면을 새로 불러온다. */
export default function RsvpButtons({ raceId, afterId, kind, mine, yes, seats, full, driver }: {
  raceId: string; afterId: string; kind: "after" | "carpool"; mine: "yes" | "no" | ""; yes: number; seats?: number; full?: boolean; driver?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");

  function send(v: "yes" | "no" | "", done: string) {
    setBusy(v || "x");
    const fd = new FormData();
    fd.set("id", raceId); fd.set("after", afterId); fd.set("v", v);
    start(async () => {
      try {
        await rsvpAfter(fd);
        showToast(done);
        router.refresh();
      } catch {
        showToast("처리하지 못했어요. 잠시 후 다시 시도해 주세요.", "err");
      } finally { setBusy(""); }
    });
  }

  if (kind === "carpool") {
    if (driver) return <span className="text-sm font-bold">탑승 {yes}/{seats}명</span>;
    const on = mine === "yes";
    return (
      <button type="button" disabled={pending || (!!full && !on)} className={`btn text-sm py-1 px-3 ${on ? "is-on" : ""}`}
        onClick={() => send(on ? "no" : "yes", on ? "탑승을 취소했어요." : "탑승 신청했어요.")}>
        {busy ? "…" : on ? `탑승 ${yes}/${seats} ✓` : mine === "no" ? `취소함 · 다시 탑승 (${yes}/${seats})` : full ? `자리 없음 (${yes}/${seats})` : `탑승 ${yes}/${seats}`}
      </button>
    );
  }
  // 참석 버튼 하나: 누르면 참석, 한 번 더 누르면 불참(취소)
  const on = mine === "yes";
  return (
    <button type="button" disabled={pending} className={`btn text-sm py-1 px-3 ${on ? "is-on" : ""}`}
      onClick={() => send(on ? "no" : "yes", on ? "불참으로 바꿨어요." : "참석으로 표시했어요.")}>
      {busy ? "…" : on ? `참석 ${yes} ✓` : mine === "no" ? `불참 · 다시 참석 (${yes})` : `참석 ${yes}`}
    </button>
  );
}
