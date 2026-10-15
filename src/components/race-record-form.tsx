"use client";
import { useRef, useState } from "react";
import { saveRaceRecord } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

const COURSES = ["5K", "10K", "Half", "Full", "기타", "DNF", "DNS"];

/** 내 대회 기록 입력. 대회를 고르면 내가 신청한 코스가 자동 선택되고, DNF·DNS(미완주·불참)는 기록 칸이 꺼진다.
 *  ‘개별 등록’: 크루 참가 표시를 안 한(목록에 없는) 대회는 이름·날짜를 직접 적어 기록한다. */
export default function RaceRecordForm({ races, initialId = "", today }: { races: { id: string; label: string; course: string }[]; initialId?: string; today: string }) {
  const [own, setOwn] = useState(races.length === 0);
  const [course, setCourse] = useState(races.find((x) => x.id === initialId)?.course ?? "");
  const [t, setT] = useState({ h: "", m: "", s: "" });
  const mRef = useRef<HTMLInputElement>(null), sRef = useRef<HTMLInputElement>(null);
  const num = (v: string, max: number) => { const d = v.replace(/\D/g, "").slice(0, 2); return d !== "" && Number(d) > max ? String(max) : d; };
  const noTime = course === "DNF" || course === "DNS";
  const time = noTime ? "" : `${Number(t.h || 0)}:${String(Number(t.m || 0)).padStart(2, "0")}:${String(Number(t.s || 0)).padStart(2, "0")}`;
  return (
    <ActionForm action={saveRaceRecord} className="grid-2 mt-3 items-start" collapse>
      <div className="field full">
        <span className="flex items-center justify-between gap-2">
          <span className="label">대회</span>
          {races.length > 0 && (
            <button type="button" className="btn btn-ghost text-xs py-0.5 px-2" style={{ minHeight: 0 }} aria-pressed={own} onClick={() => { setOwn(!own); setCourse(""); }}>
              {own ? "참가 대회에서 고르기" : "+ 개별 등록"}
            </button>
          )}
        </span>
        {own ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
            <input type="hidden" name="own" value="1" />
            <input name="raceName" className="input" required maxLength={60} placeholder="대회 이름" aria-label="대회 이름" />
            <input name="raceDate" type="date" className="input" required max={today} aria-label="대회 날짜" />
          </div>
        ) : (
          <select key="pick" name="id" className="input" required defaultValue={initialId} onChange={(e) => { const r = races.find((x) => x.id === e.target.value); if (r) setCourse(r.course); }}>
            <option value="" disabled>대회를 골라 주세요</option>
            {races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        )}
        {races.length === 0 && <span className="text-xs text-muted">크루 참가로 표시한 대회가 없어서, 대회 이름과 날짜를 직접 적어 주세요.</span>}
      </div>
      <label className="field"><span className="label">코스</span>
        <select name="course" className="input" value={course} required onChange={(e) => setCourse(e.target.value)}>
          <option value="" disabled>{own ? "코스를 골라 주세요" : "대회를 먼저 골라 주세요"}</option>
          {course && !COURSES.includes(course) && <option value={course}>{course}</option>}
          {COURSES.map((c) => <option key={c} value={c}>{c === "DNF" ? "DNF (미완주)" : c === "DNS" ? "DNS (불참)" : c}</option>)}
        </select>
      </label>
      <div className="field"><span className="label">기록 (숫자만 입력)</span>
        <input type="hidden" name="time" value={time} />
        <div className="time-fields" style={noTime ? { opacity: 0.4 } : undefined}>
          <input className="input" inputMode="numeric" placeholder="0" disabled={noTime} value={t.h} aria-label="시간"
            onChange={(e) => { const v = num(e.target.value, 9); setT({ ...t, h: v }); if (v.length >= 1) mRef.current?.focus(); }} /><span>시간</span>
          <input ref={mRef} className="input" inputMode="numeric" placeholder="00" disabled={noTime} required={!noTime} value={t.m} aria-label="분"
            onChange={(e) => { const v = num(e.target.value, 59); setT({ ...t, m: v }); if (v.length >= 2) sRef.current?.focus(); }} /><span>분</span>
          <input ref={sRef} className="input" inputMode="numeric" placeholder="00" disabled={noTime} value={t.s} aria-label="초"
            onChange={(e) => setT({ ...t, s: num(e.target.value, 59) })} /><span>초</span>
        </div>
      </div>
      <div className="full inline-edit">
        <input name="note" className="input" maxLength={100} placeholder="한 줄 메모 (선택) · 날씨, 컨디션, 소감 등" aria-label="한 줄 메모 (선택)" />
        <Submit>기록 저장</Submit>
      </div>
    </ActionForm>
  );
}
