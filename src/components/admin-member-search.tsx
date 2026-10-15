"use client";

import { useEffect, useId, useRef, useState } from "react";

type Choice = { nick: string; name: string };

/** 회원 검색 입력. label=null이면 글자 라벨을 숨기고(줄 안에 넣을 때), required면 목록에서 회원을 골라야 제출된다.
 *  고른 회원이 목록(members)에서 빠지면(방금 추가해서 후보에서 사라짐) 입력이 자동으로 비워진다. */
export default function AdminMemberSearch({ members, label = "회원", placeholder = "닉네임·이름 검색", required = false, style, name = "nick" }: { members: Choice[]; label?: string | null; placeholder?: string; required?: boolean; style?: React.CSSProperties; name?: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const matches = query.trim() && !selected
    ? members.filter((m) => `${m.nick} ${m.name}`.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))).slice(0, 6)
    : [];

  useEffect(() => { // 고른 회원이 후보에서 사라지면(추가 완료) 비운다
    if (selected && !members.some((m) => m.nick === selected)) { setQuery(""); setSelected(""); setOpen(false); setActive(0); }
  }, [members, selected]);

  useEffect(() => { // 검색어만 쓰고 고르지 않으면 제출하지 못하게 한다
    inputRef.current?.setCustomValidity(required && !selected ? "검색해서 목록에서 회원을 골라 주세요." : "");
  }, [required, selected]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => { setQuery(""); setSelected(""); setOpen(false); setActive(0); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  const choose = (member: Choice) => {
    setSelected(member.nick);
    setQuery(`${member.nick}/${member.name}`);
    setOpen(false);
    setActive(0);
  };

  return <div className="field admin-member-search" style={style} onBlur={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }}>
    {label !== null && <label className="label" htmlFor={id}>{label}</label>}
    <input ref={inputRef} id={id} type="search" className="input" value={query} placeholder={placeholder} autoComplete="off" aria-label={label ?? placeholder} required={required}
      role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={open && matches.length ? `${id}-results` : undefined}
      onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setSelected(""); setOpen(true); setActive(0); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setActive((active + 1) % matches.length); }
        if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive((active - 1 + matches.length) % matches.length); }
        if (e.key === "Enter" && open && matches.length) { e.preventDefault(); choose(matches[active] ?? matches[0]); }
        if (e.key === "Escape") setOpen(false);
      }} />
    <input type="hidden" name={name} value={selected} />
    {open && matches.length > 0 && <div id={`${id}-results`} className="admin-member-search-results" role="listbox" aria-label="회원 검색 결과">
      {matches.map((member, index) => <button key={member.nick} type="button" role="option" aria-selected={index === active}
        onMouseEnter={() => setActive(index)} onClick={() => choose(member)}>{member.nick}/{member.name}</button>)}
    </div>}
    {open && query.trim() && !selected && matches.length === 0 && <span className="text-xs text-muted">검색 결과가 없어요.</span>}
  </div>;
}
