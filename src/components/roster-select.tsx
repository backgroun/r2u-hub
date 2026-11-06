"use client";
import Link from "next/link";
import { confirmWithPassword } from "@/components/confirm-password";
import { useState, useTransition } from "react";
import { bingoBulk } from "@/app/actions";
import { showToast } from "@/components/toaster";

type M = { name: string; label: string; cnt: number };

/** 이벤트 명단: 위쪽에서 사람을 골라 ‘기록 초기화’·‘명단에서 빼기’를 한꺼번에 적용한다 (적용 전에 반드시 확인창). 이름을 누르면 그 사람의 리포트로 간다. */
export default function RosterSelect({ members }: { members: M[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const picked = members.filter((m) => sel.has(m.name));
  const allOn = members.length > 0 && picked.length === members.length;
  const toggle = (name: string) => setSel((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const apply = (act: "reset_data" | "delete") => {
    if (!picked.length) { showToast("먼저 대상을 선택해 주세요.", "err"); return; }
    const who = picked.length <= 3 ? picked.map((p) => p.label).join(", ") : `${picked.slice(0, 3).map((p) => p.label).join(", ")} 외 ${picked.length - 3}명`;
    const total = picked.reduce((a, p) => a + p.cnt, 0);
    const msg = act === "reset_data"
      ? `[기록 초기화]\n${who} (${picked.length}명)의 인증 ${total}칸을 모두 지울까요?\n사진·댓글도 함께 지워지고 되돌릴 수 없어요.\n(명단에는 그대로 남아요)`
      : `[명단에서 빼기]\n${who} (${picked.length}명)을 이벤트 명단에서 뺄까요?\n인증 ${total}칸도 함께 지워지고 되돌릴 수 없어요.`;
    start(async () => {
      const token = await confirmWithPassword(msg); // 본인 비밀번호 확인 후에만 실행
      if (!token) return;
      const fd = new FormData();
      fd.set("act", act);
      fd.set("confirmToken", token);
      picked.forEach((p) => fd.append("nick", p.name));
      const r = await bingoBulk(null, fd);
      if (r?.msg) showToast(r.msg, r.ok ? "ok" : "err");
      if (r?.ok) setSel(new Set());
    });
  };

  return (
    <div className="grid gap-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(members.map((m) => m.name)))} aria-label="전체 선택" />
          <span>전체 선택 <span className="text-muted">· {picked.length}명 선택</span></span>
        </label>
        <div className="ml-auto flex gap-1.5">
          <button type="button" disabled={pending || !picked.length} onClick={() => apply("reset_data")} className="btn btn-ghost btn-danger text-xs py-1 px-2.5">선택 기록 초기화</button>
          <button type="button" disabled={pending || !picked.length} onClick={() => apply("delete")} className="btn btn-ghost btn-danger text-xs py-1 px-2.5">선택 명단에서 빼기</button>
        </div>
      </div>
      {members.map((m, i) => (
        <div key={m.name} className="flex items-center gap-2 border-t border-[var(--line)] pt-2">
          <input type="checkbox" checked={sel.has(m.name)} onChange={() => toggle(m.name)} aria-label={`${m.label} 선택`} className="shrink-0" />
          <span className="num text-muted text-sm shrink-0 text-center" style={{ width: 22 }}>{i + 1}</span>
          <Link href={`/admin/bingo/${encodeURIComponent(m.name)}`} className="flex items-baseline gap-2 min-w-0 flex-1" aria-label={`${m.label} 리포트 보기`}>
            <b className="truncate">{m.label}</b><small className="text-muted shrink-0">인증 {m.cnt}칸</small>
            <span className="text-muted ml-auto shrink-0" aria-hidden>리포트 ›</span>
          </Link>
        </div>
      ))}
    </div>
  );
}
