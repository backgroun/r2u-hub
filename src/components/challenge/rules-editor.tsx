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
    <div className="grid gap-3">
      <input type="hidden" name="rulesText" value={sectionsToText(toSections(secs))} />
      <div className="flex flex-wrap items-center gap-1.5" aria-label="자동으로 채워지는 값">
        <span className="text-xs text-muted">자동 입력</span>
        {RULES_TOKENS.map((t) => <button key={t} type="button" className="chip" style={{ cursor: "pointer" }} onClick={() => insert(t)} title="입력칸에서 커서가 있던 곳에 넣어요">{t}</button>)}
      </div>
      {secs.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input min-w-0 basis-full py-1.5 font-bold" placeholder="제목 (예: 📅 기록)" value={s.title} maxLength={60}
              onFocus={(e) => { last.current = { i, field: "title", el: e.currentTarget }; }} onChange={(e) => up(i, { title: e.target.value })} aria-label={`${i + 1}번 묶음 제목`} />
            <span className="ml-auto" /><button type="button" className="btn btn-ghost px-2 py-1 text-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
            <button type="button" className="btn btn-ghost px-2 py-1 text-sm" onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label="아래로">↓</button>
            <button type="button" className="btn btn-ghost btn-danger px-2 py-1 text-sm" onClick={() => { if (window.confirm("이 묶음을 지울까요?")) setSecs((a) => a.filter((_, k) => k !== i)); }} aria-label="묶음 삭제">삭제</button>
          </div>
          <textarea className="input" rows={Math.min(10, Math.max(3, s.body.split("\n").length + 1))} placeholder={"내용을 한 줄에 하나씩 적어요\n**굵게** 표시도 쓸 수 있어요"} value={s.body}
            onFocus={(e) => { last.current = { i, field: "body", el: e.currentTarget }; }} onChange={(e) => up(i, { body: e.target.value })} aria-label={`${i + 1}번 묶음 내용`} />
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={s.ordered} onChange={(e) => up(i, { ordered: e.target.checked })} /> 번호를 붙여서 보여 주기 (1. 2. 3.)</label>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn text-sm" onClick={() => setSecs((a) => [...a, { title: "", ordered: false, body: "" }])}>+ 묶음 추가</button>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => { if (window.confirm("지금 쓴 내용을 지우고 기본 문구로 되돌릴까요?")) setSecs(parseRules(defaultText).map(toSec)); }}>기본 문구로 되돌리기</button>
      </div>
    </div>
  );
}
