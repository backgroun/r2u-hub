"use client";

import { useRef } from "react";

/** ‘포인트 기준 보기’ 버튼: 누르면 활동별 포인트와 레벨 기준표를 창으로 보여준다 */
export default function PointGuide({ rows, levels, start }: { rows: { what: string; p: string; how: string }[]; levels: number[]; start: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost text-xs py-1 px-2.5" style={{ minHeight: 0 }} onClick={() => ref.current?.showModal()}>포인트 기준 보기</button>
      <dialog ref={ref} className="point-guide" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg">레벨 포인트 기준</h2>
            <button type="button" className="btn btn-ghost px-2.5 py-1" style={{ minHeight: 0 }} aria-label="닫기" onClick={() => ref.current?.close()}>✕</button>
          </div>
          <p className="text-xs text-muted">{Number(start.slice(5, 7))}월 {Number(start.slice(8))}일부터 쌓여요. 같은 활동은 한 번만 쌓이고, 취소·삭제하면 그만큼 빠져요.</p>
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
          <div className="grid gap-2">
            <h3 className="font-bold">레벨 기준 (누적 포인트)</h3>
            <div className="pg-levels">
              {levels.map((p, i) => <span key={i}><b>Lv.{i + 1}</b><span className="num">{p.toLocaleString()}P</span></span>)}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
