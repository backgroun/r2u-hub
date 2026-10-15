"use client";

import { useState } from "react";
import { suggestGear } from "@/app/actions";
import { showToast } from "@/components/toaster";

/* 용품 카드의 "제품 추천하기": 추천하고 싶은 제품 링크를 입력해서 운영진에게 보낸다. test=true(테스트 용품)여도 실제로 저장하되 "테스트" 표시를 붙인다(관리자 목록에서 확인하고 지울 수 있다). */
export default function SuggestForm({ g, test, onDone }: { g: number; test?: boolean; onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    const r = await suggestGear(g, url, !!test).catch(() => ({ ok: false, msg: "보내지 못했어요. 잠시 뒤 다시 해 주세요." }));
    setBusy(false);
    showToast(r.msg, r.ok ? "ok" : "err");
    if (r.ok) onDone();
  };
  return (
    <div className="bi-suggest" onClick={(e) => e.stopPropagation()}>
      <input type="url" inputMode="url" autoComplete="off" value={url} placeholder="추천할 제품 링크를 붙여 넣어 주세요" aria-label="추천할 제품 링크"
        onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
      <button type="button" disabled={busy || !url.trim()} onClick={() => void send()}>{busy ? "보내는 중…" : "보내기"}</button>
    </div>
  );
}
