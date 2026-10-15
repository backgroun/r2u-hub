"use client";

import { useRef } from "react";
import { STEPS_PER_TIER, TIERS } from "@/lib/tiers";

/** ‘포인트 기준 보기’ 버튼: 누르면 활동별 포인트와 레벨 기준표를 창으로 보여준다 */
export default function PointGuide({ rows, step, start }: { rows: { what: string; p: string; how: string }[]; step: number; start: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost text-xs py-1 px-2.5" style={{ minHeight: 0 }} onClick={() => ref.current?.showModal()}>포인트 기준 보기</button>
      {/* 아래에서 올라오는 시트: 바깥(어두운 곳)을 누르거나 ✕로 닫는다 */}
      <dialog ref={ref} className="point-guide sheet" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <span className="sheet-grip" aria-hidden />
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg">포인트 · 컬러 등급 기준</h2>
            <button type="button" className="btn btn-ghost px-2.5 py-1" style={{ minHeight: 0 }} aria-label="닫기" onClick={() => ref.current?.close()}>✕</button>
          </div>
          <p className="text-xs text-muted">{Number(start.slice(5, 7))}월 {Number(start.slice(8))}일부터 쌓여요. 같은 활동은 한 번만 쌓이고, 취소·삭제하면 그만큼 빠져요.</p>
          <div className="grid gap-2">
            <h3 className="font-bold">컬러 등급 (누적 포인트)</h3>
            <p className="text-sm">{step}P마다 한 단계씩 올라가고, 색마다 {STEPS_PER_TIER}단계가 있어요. 볼트는 끝없이 단계가 올라가요.</p>
            <div className="pg-levels">
              {TIERS.map((t, i) => (
                <span key={t.key}><i className="tier-dot" style={{ background: t.color, margin: 0, width: 14, height: 14 }} /><b>{t.name}</b><span className="num">{(i * STEPS_PER_TIER * step).toLocaleString()}P~</span></span>
              ))}
            </div>
          </div>
          <table className="pg-table">
            <thead><tr><th>활동</th><th>포인트</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.what}>
                  <td><b>{r.what}</b><span>{r.how}</span></td>
                  <td className="num">{r.p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </dialog>
    </>
  );
}
