"use client";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { setGoal } from "@/app/actions";

const PRESETS = [50, 100, 150, 200];

/** 이달 목표 고르기: 저장 전에 알림창으로 ‘한 달 2번까지만 수정’을 알려 주고 확인받는다 */
export default function GoalPicker({ ym, goal, editsLeft, limit }: { ym: string; goal: number; editsLeft: number; limit: number }) {
  const [state, run, pending] = useActionState(setGoal, null);
  const [ask, setAsk] = useState<number | null>(null); // 확인을 기다리는 목표 km
  const [notice, setNotice] = useState<string | null>(null);
  const custom = useRef<HTMLInputElement>(null);
  const locked = goal > 0 && editsLeft <= 0;

  useEffect(() => { if (state?.msg) setNotice(state.msg); }, [state]);

  const pick = (g: number) => {
    if (!(g > 0 && g <= 2000)) { setNotice("목표는 1~2000km 사이로 입력해 주세요."); return; }
    if (g === goal) { setNotice(`이미 ${g}km가 목표예요.`); return; }
    if (locked) { setNotice(`이번 달 목표는 이미 ${limit}번 바꿨어요. 더 바꾸려면 운영진에게 요청해 주세요.`); return; }
    setAsk(g);
  };
  const confirm = () => {
    const fd = new FormData();
    fd.set("ym", ym);
    fd.set("goal", String(ask));
    setAsk(null);
    startTransition(() => run(fd));
  };

  return (
    <div className="grid gap-2">
      <div className="join-head">
        <span className="label">
          {goal ? (locked ? "목표 수정 횟수를 다 썼어요" : `목표 수정 ${editsLeft}번 남음`) : "이달 목표를 정해 주세요"}
        </span>
        <button type="button" className="btn btn-primary text-sm" disabled={pending || locked} onClick={() => pick(Math.round(Number(custom.current?.value)))}>직접입력 저장</button>
      </div>
      <div className="course-row">
        {PRESETS.map((g) => (
          <button key={g} type="button" className={`goal-chip ${goal === g ? "on" : ""}`} disabled={pending || (locked && goal !== g)} onClick={() => pick(g)}>{g}km</button>
        ))}
        <input ref={custom} type="number" inputMode="numeric" min={1} max={2000} className="input cchip-etc" placeholder="직접입력"
          defaultValue={goal && !PRESETS.includes(goal) ? goal : ""} disabled={locked} aria-label="목표 직접입력 (km)" />
      </div>

      {ask !== null && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="goal-ask">
          <div className="modal-box">
            <p id="goal-ask" className="font-bold text-lg">목표를 {ask}km로 {goal ? "바꿀까요?" : "정할까요?"}</p>
            <p className="text-sm text-muted">
              {goal
                ? `이달 목표는 한 달에 ${limit}번까지만 바꿀 수 있어요. 지금 바꾸면 남은 수정은 ${editsLeft - 1}번이에요.`
                : `목표를 정한 뒤에는 이번 달에 ${limit}번까지만 바꿀 수 있어요.`}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAsk(null)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={confirm}>{goal ? "바꾸기" : "정하기"}</button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="goal-notice">
          <div className="modal-box">
            <p id="goal-notice" className="text-[15px]">{notice}</p>
            <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={() => setNotice(null)} autoFocus>확인</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
