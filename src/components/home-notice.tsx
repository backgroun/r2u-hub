"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export type HomeNoticeItem = { key: string; title: string; meta: string; body: React.ReactNode };

/** 홈 공지 박스 하나에 공지를 차곡차곡 담는다. 공지마다 접으면 이 기기에서 접힌 채로 유지된다(수정되면 다시 펼쳐진다). */
export default function HomeNotices({ items }: { items: HomeNoticeItem[] }) {
  return (
    <section className="panel panel-alert notice-box">
      <div className="sec-head">
        <span className="label">📢 공지{items.length > 1 ? ` ${items.length}` : ""}</span>
        <Link href="/notices">공지 전체 보기 →</Link>
      </div>
      {items.map((it) => <Item key={it.key} item={it} />)}
    </section>
  );
}

function Item({ item }: { item: HomeNoticeItem }) {
  const storeKey = `r2u:noticeFold:${item.key}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(storeKey) === "1") setOpen(false); } catch { /* 저장소를 못 쓰면 펼쳐 둔다 */ }
  }, [storeKey]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { if (next) localStorage.removeItem(storeKey); else localStorage.setItem(storeKey, "1"); } catch { /* 무시 */ }
  };
  return (
    <div className="notice-item">
      <button type="button" className="notice-toggle" aria-expanded={open} onClick={toggle}>
        <span className="notice-title">{item.title}</span>
        <span className="notice-chev" aria-hidden>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div className="notice-body">
          {item.body}
          <p className="text-xs text-muted">{item.meta}</p>
        </div>
      )}
    </div>
  );
}
