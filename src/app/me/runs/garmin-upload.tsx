"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { parseGarminFile, type GarminRun, type ParseResult } from "@/lib/garmin/csv";
import { aggregateByDay, fmtDur, fmtPace } from "@/lib/garmin/aggregate";
import { showToast } from "@/components/toaster";

type Status = "new" | "updated" | "unchanged" | "deleted";
type ImportResult = {
  summary: Record<Status, number>;
  flagged: number;
  byDate: { date: string; status: Status[] }[];
  manualConflicts: { date: string; manualKm: number; garminKm: number; garminRuns: number }[];
  notSynced: number;
  monthDays: number;
};
const STATUS_LABEL: Record<Status, string> = { new: "새 기록", updated: "변경", unchanged: "이미 있음", deleted: "지운 기록" };
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export default function GarminUpload() {
  const router = useRouter();
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "replace" | "separate">>({});

  const reset = () => { setParsed(null); setPreview(null); setDecisions({}); setError(""); };
  const send = (runs: GarminRun[], dryRun: boolean) =>
    api<ImportResult>("/api/runs/import", { method: "POST", json: { dryRun, runs, conflictDecisions: decisions } });

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setBusy(true);
    try {
      const p = await parseGarminFile(file, unit);
      setParsed(p);
      if (p.warning) { setError(p.warning); return; }
      if (!p.runs.length) { setError("러닝 기록이 없어요. 가민에서 러닝이 보이게 스크롤한 뒤 다시 내보내 주세요."); return; }
      setPreview(await send(p.runs, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await send(parsed.runs, false);
      showToast(`저장했어요. 새 기록 ${r.summary.new} · 변경 ${r.summary.updated} · 월간 기록 ${r.monthDays}일 반영`, "ok");
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const days = parsed ? aggregateByDay(parsed.runs) : [];
  const statusOf = new Map(preview?.byDate.map((d) => [d.date, d.status]) ?? []);
  const excludedTotal = parsed ? parsed.excluded.notRun + parsed.excluded.empty : 0;

  return (
    <section className="panel p-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-primary" style={{ cursor: busy ? "wait" : "pointer" }}>
          {busy ? "읽는 중…" : "가민 CSV 올리기"}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className="text-sm flex items-center gap-1">
          가민 단위
          <select className="input" style={{ width: "auto", minHeight: 32, paddingBlock: 2 }} value={unit} onChange={(e) => setUnit(e.target.value as "km" | "mi")}>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-[var(--bad)]">{error}</p>}

      {parsed && preview && (
        <div className="grid gap-3">
          <div className="text-sm grid gap-1">
            <p className="font-bold">가민 기록 {parsed.totalRows}건을 읽었어요</p>
            <p>✅ 러닝 {parsed.runs.length}건 <span className="text-muted">(새 기록 {preview.summary.new} · 변경 {preview.summary.updated} · 이미 있음 {preview.summary.unchanged}{preview.summary.deleted ? ` · 내가 지운 기록 ${preview.summary.deleted}` : ""})</span></p>
            <p>➖ 제외 {excludedTotal}건 <span className="text-muted">(러닝 아님 {parsed.excluded.notRun} · 빈 기록 {parsed.excluded.empty})</span></p>
            <p>⚠️ 의심 기록 {preview.flagged}건{preview.flagged ? <span className="text-muted"> (2:30/km보다 빨라 월간 순위에서 빠져요)</span> : null}</p>
            {preview.manualConflicts.length > 0 && <p>🔁 손으로 넣은 기록과 겹치는 날 {preview.manualConflicts.length}일 → 아래에서 골라 주세요</p>}
            {preview.monthDays > 0 && <p>📅 월간 기록에 {preview.monthDays}일 반영돼요</p>}
            {preview.notSynced > 0 && <p className="text-muted">ℹ️ {preview.notSynced}일은 허브 시작 전이거나 마감이 지난 달이라 월간 순위에는 반영하지 않아요.</p>}
          </div>

          {preview.manualConflicts.map((c) => (
            <fieldset key={c.date} className="panel p-3 grid gap-1 text-sm">
              <legend className="font-bold px-1">{md(c.date)} 손으로 넣은 {c.manualKm}km ↔ 가민 {c.garminKm}km ({c.garminRuns}건)</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name={`c-${c.date}`} checked={(decisions[c.date] ?? "replace") === "replace"} onChange={() => setDecisions({ ...decisions, [c.date]: "replace" })} />
                가민 기록으로 대체 (합계 {c.garminKm}km)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`c-${c.date}`} checked={decisions[c.date] === "separate"} onChange={() => setDecisions({ ...decisions, [c.date]: "separate" })} />
                따로 뛴 기록이에요 (둘 다 합산 {Math.round((c.garminKm + c.manualKm) * 100) / 100}km)
              </label>
            </fieldset>
          ))}

          <div style={{ overflowX: "auto" }}>
            <table className="text-sm w-full" style={{ borderCollapse: "collapse", minWidth: 520 }}>
              <thead className="text-muted text-xs">
                <tr>{["날짜", "건수", "거리", "시간", "페이스", "심박", "케이던스", "훈련효과", "상태"].map((h) => <th key={h} className="text-left py-1 pr-2 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody className="num">
                {days.map((d) => {
                  const st = statusOf.get(d.date) ?? [];
                  const label = [...new Set(st)].map((s) => STATUS_LABEL[s]).join("·");
                  return (
                    <tr key={d.date} style={{ borderTop: "1px solid var(--line, #8883)" }}>
                      <td className="py-1 pr-2">{d.date.slice(2).replaceAll("-", ".")}</td>
                      <td className="pr-2">{d.runCount}</td>
                      <td className="pr-2">{d.distanceKm}km</td>
                      <td className="pr-2">{fmtDur(d.durationSec)}</td>
                      <td className="pr-2">{fmtPace(d.avgPaceSec)}</td>
                      <td className="pr-2">{d.avgHr ?? "–"}</td>
                      <td className="pr-2">{d.avgCadence ?? "–"}</td>
                      <td className="pr-2">{d.aerobicTE ?? "–"}</td>
                      <td className={st.includes("new") || st.includes("updated") ? "" : "text-muted"}>{label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>취소</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || (!preview.summary.new && !preview.summary.updated && !preview.manualConflicts.length && !preview.monthDays)}>
              {busy ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
