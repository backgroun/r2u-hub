"use client";
import { useEffect, useRef, useState } from "react";
import { Submit } from "@/components/action-form";

type Kind = "bingo" | "poll" | "challenge";
export type SavedAccount = { bank: string; account: string; holder: string };

/** 이벤트 블록 만들기 입력칸: 고른 종류에 해당하는 항목만 보여 준다(투표·설문은 질문·선택지, 챌린지는 계좌·상품). */
export default function EventBlockFields({ nowYm, accounts = [] }: { nowYm: string; accounts?: SavedAccount[] }) {
  const [kind, setKind] = useState<Kind>("bingo");
  const [acct, setAcct] = useState<SavedAccount>({ bank: "", account: "", holder: "" });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = root.current?.closest("form");
    const reset = () => { setKind("bingo"); setAcct({ bank: "", account: "", holder: "" }); }; // 만든 뒤 폼이 초기화되면 처음 값으로
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return (
    <div ref={root} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span className="label">종류</span>
          <select name="type" className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="bingo">빙고</option><option value="poll">투표·설문</option><option value="challenge">기록 챌린지</option>
          </select></label>
        <label className="field"><span className="label">월</span><input name="ym" type="month" className="input" defaultValue={nowYm} required /></label>
      </div>
      <div className="flex items-end gap-2">
        <label className="field grow min-w-0"><span className="label">이벤트 이름</span><input name="title" className="input" maxLength={40} required placeholder="예: 11월 5×5 미션 빙고" /></label>
        <Submit className="btn btn-primary shrink-0">블록 만들기</Submit>
      </div>
      {kind === "poll" && (
        <>
          <label className="field"><span className="label">투표 질문</span><input name="question" className="input" maxLength={100} placeholder="예: 다음 번개런 코스는?" /></label>
          <label className="field"><span className="label">선택지 (한 줄에 하나·2~8개)</span><textarea name="options" className="input" rows={4} placeholder={"한강 10km\n남산 순환\n탄천 하프"} /></label>
        </>
      )}
      {kind === "challenge" && (
        <>
          {accounts.length > 0 && (
            <label className="field"><span className="label">이전에 쓴 계좌 선택</span>
              <select className="input" value="" onChange={(e) => { const a = accounts[Number(e.target.value)]; if (a) setAcct(a); }}>
                <option value="">직접 입력</option>
                {accounts.map((a, i) => <option key={`${a.bank}${a.account}`} value={i}>{a.bank} {a.account} ({a.holder})</option>)}
              </select></label>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="field"><span className="label">은행</span><input name="bank" className="input" maxLength={20} value={acct.bank} onChange={(e) => setAcct({ ...acct, bank: e.target.value })} /></label>
            <label className="field"><span className="label">계좌번호</span><input name="account" className="input" maxLength={30} value={acct.account} onChange={(e) => setAcct({ ...acct, account: e.target.value })} /></label>
            <label className="field"><span className="label">예금주</span><input name="holder" className="input" maxLength={20} value={acct.holder} onChange={(e) => setAcct({ ...acct, holder: e.target.value })} /></label>
          </div>
          <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={4} defaultValue={"넥워머\n카프슬리브\n오스무브 모자\n데카르트 장갑"} /></label>
        </>
      )}
    </div>
  );
}
