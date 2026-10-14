"use client";
import { useEffect, useState } from "react";

/** 이 요청 링크를 복사하거나 공유 시트(카카오톡 등)로 보낸다 */
export default function ShareLink({ path, text }: { path: string; text: string }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => setUrl(location.origin + path), [path]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMsg("링크를 복사했어요. 카톡방에 붙여넣어 주세요."); }
    catch { setMsg("복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요."); }
  }
  async function share() {
    try { await navigator.share({ title: "R2U 닉네임 승인 요청", text, url }); } catch { /* 취소 */ }
  }
  return (
    <div className="grid gap-2">
      <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="승인 요청 링크" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={copy}>링크 복사</button>
        {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className="btn" onClick={share}>공유하기</button>}
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
