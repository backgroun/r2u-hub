"use client";

import { useEffect, useId, useRef, useState } from "react";

type Choice = { nick: string; name: string };

export default function AdminMemberSearch({ members }: { members: Choice[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const matches = query.trim() && !selected
    ? members.filter((m) => `${m.nick} ${m.name}`.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))).slice(0, 6)
    : [];

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

  return <div className="field admin-member-search" onBlur={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }}>
    <label className="label" htmlFor={id}>회원</label>
    <input ref={inputRef} id={id} type="search" className="input" value={query} placeholder="닉네임·이름 검색" autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={open && matches.length ? `${id}-results` : undefined}
      onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setSelected(""); setOpen(true); setActive(0); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setActive((active + 1) % matches.length); }
        if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive((active - 1 + matches.length) % matches.length); }
        if (e.key === "Enter" && open && matches.length) { e.preventDefault(); choose(matches[active] ?? matches[0]); }
        if (e.key === "Escape") setOpen(false);
      }} />
    <input type="hidden" name="nick" value={selected} />
    {open && matches.length > 0 && <div id={`${id}-results`} className="admin-member-search-results" role="listbox" aria-label="회원 검색 결과">
      {matches.map((member, index) => <button key={member.nick} type="button" role="option" aria-selected={index === active}
        onMouseEnter={() => setActive(index)} onClick={() => choose(member)}>{member.nick}/{member.name}</button>)}
    </div>}
    {open && query.trim() && !selected && matches.length === 0 && <span className="text-xs text-muted">검색 결과가 없어요.</span>}
  </div>;
}
