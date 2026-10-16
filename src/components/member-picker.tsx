"use client";
import { useMemo, useState } from "react";

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s: string) => [...s].map((c) => {
  const code = c.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
}).join("");
const matches = (nick: string, name: string, q: string) => {
  const n = `${nick} ${name}`.toLowerCase(), k = q.trim().toLowerCase();
  return !k || n.includes(k) || chosung(n).includes(k);
};

/** 크루원 검색 고르기: 닉네임·이름 한두 글자나 초성으로 찾는다. 고른 닉네임이 name 으로 전송된다. */
export default function MemberPicker({ members, name = "nick", placeholder = "닉넴/이름 검색 (초성도 돼요)" }: { members: { nick: string; name: string }[]; name?: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(() => members.filter((m) => matches(m.nick, m.name, q)).slice(0, 8), [members, q]);
  const pick = (m: { nick: string; name: string }) => { setPicked(m.nick); setQ(`${m.nick}/${m.name || "없음"}`); setOpen(false); };
  return (
    <div className="member-picker min-w-0 flex-1">
      <input type="hidden" name={name} value={picked} />
      <input
        className="input w-full" style={{ minHeight: 36, height: 36, padding: "4px 10px", fontSize: 14 }} value={q} placeholder={placeholder} autoComplete="off" aria-label="크루원 검색"
        onChange={(e) => { setQ(e.target.value); setPicked(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && !picked && list[0]) { e.preventDefault(); pick(list[0]); } }}
      />
      {open && !picked && (
        <ul className="pick-list" role="listbox">
          {list.length ? list.map((m) => (
            <li key={m.nick}><button type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}>{m.nick}<span className="text-muted">/{m.name || "없음"}</span></button></li>
          )) : <li className="px-3 py-2 text-sm text-muted">찾는 크루원이 없어요</li>}
        </ul>
      )}
    </div>
  );
}
