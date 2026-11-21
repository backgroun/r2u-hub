"use client";
import { useRef, useState } from "react";
import { RULES_TOKENS, parseRules, sectionsToText, type RulesSection } from "@/lib/challenge/rules";

type Sec = { title: string; ordered: boolean; body: string };
const toSec = (s: RulesSection): Sec => ({ title: s.title, ordered: s.ordered, body: s.items.join("\n") });
const toSections = (secs: Sec[]): RulesSection[] => secs.map((s) => ({ title: s.title, ordered: s.ordered, items: s.body.split("\n").map((x) => x.trim()).filter(Boolean) }));

/** 규정 안내 입력: 묶음마다 제목과 내용(한 줄에 하나)을 따로 적는다. 글자 규칙(## · 1.)을 몰라도 된다. 저장할 때는 hidden 칸에 규정 글로 합쳐 보낸다. */
export default function RulesEditor({ initialText, defaultText }: { initialText: string; defaultText: string }) {
  const [secs, setSecs] = useState<Sec[]>(() => parseRules(initialText).map(toSec));
  const last = useRef<{ i: number; field: "title" | "body"; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const up = (i: number, patch: Partial<Sec>) => setSecs((a) => a.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => setSecs((a) => { const j = i + d; if (j < 0 || j >= a.length) return a; const c = [...a]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const insert = (token: string) => {
    const f = last.current;
    if (!f) return;
    const el = f.el, from = el.selectionStart ?? el.value.length, to = el.selectionEnd ?? from;
    const next = el.value.slice(0, from) + token + el.value.slice(to);
    up(f.i, f.field === "title" ? { title: next } : { body: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from + token.length, from + token.length); });
  };
  return (
    <div className="grid gap-2">
      <input type="hidden" name="rulesText" value={sectionsToText(toSections(secs))} />
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5" aria-label="자동으로 채워지는 값">
        <span className="shrink-0 text-xs text-muted">자동 입력</span>
        {RULES_TOKENS.map((t) => <button key={t} type="button" className="chip shrink-0" style={{ cursor: "pointer" }} onClick={() => insert(t)} title="입력칸에서 커서가 있던 곳에 넣어요">{t}</button>)}
      </div>
      {secs.map((s, i) => (
        <div key={i} className="grid gap-1.5 rounded-lg border border-[var(--line)] p-2">
          <div className="flex items-center gap-1.5">
            <input className="input min-w-0 flex-1 font-bold" style={{ minHeight: 0, padding: "5px 10px", fontSize: 14 }} placeholder="제목 (예: 📅 기록)" value={s.title} maxLength={60}
              onFocus={(e) => { last.current = { i, field: "title", el: e.currentTarget }; }} onChange={(e) => up(i, { title: e.target.value })} aria-label={`${i + 1}번 묶음 제목`} />
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="번호를 붙여서 보여 주기 (1. 2. 3.)"><input type="checkbox" checked={s.ordered} onChange={(e) => up(i, { ordered: e.target.checked })} />번호</label>
            <button type="button" className="btn btn-ghost min-h-0 px-2 py-0.5 text-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
            <button type="button" className="btn btn-ghost min-h-0 px-2 py-0.5 text-xs" onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label="아래로">↓</button>
            <button type="button" className="btn btn-ghost btn-danger min-h-0 px-2 py-0.5 text-xs" onClick={() => { if (window.confirm("이 묶음을 지울까요?")) setSecs((a) => a.filter((_, k) => k !== i)); }} aria-label="묶음 삭제">삭제</button>
          </div>
          <textarea className="input" style={{ minHeight: 0, padding: "6px 10px", fontSize: 14, lineHeight: 1.45 }} rows={Math.min(4, Math.max(2, s.body.split("\n").length))} placeholder="내용 (한 줄에 하나, **굵게** 가능)" value={s.body}
            onFocus={(e) => { last.current = { i, field: "body", el: e.currentTarget }; }} onChange={(e) => up(i, { body: e.target.value })} aria-label={`${i + 1}번 묶음 내용`} />
        </div>
      ))}
      <div className="flex gap-1.5">
        <button type="button" className="btn min-h-0 px-3 py-1 text-xs" onClick={() => setSecs((a) => [...a, { title: "", ordered: false, body: "" }])}>+ 묶음 추가</button>
        <button type="button" className="btn btn-ghost min-h-0 px-3 py-1 text-xs" onClick={() => { if (window.confirm("지금 쓴 내용을 지우고 기본 문구로 되돌릴까요?")) setSecs(parseRules(defaultText).map(toSec)); }}>기본 문구로 되돌리기</button>
      </div>
    </div>
  );
}
