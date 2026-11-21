"use client";
import { useEffect, useRef, useState } from "react";
import { Submit } from "@/components/action-form";
import MoneyInput from "@/components/money-input";

type Kind = "bingo" | "poll" | "challenge";
export type SavedAccount = { bank: string; account: string; holder: string };

/** 이벤트 블록 만들기 입력칸: 고른 종류에 해당하는 항목만 보여 준다(투표·설문은 질문·선택지, 챌린지는 계좌·상품). */
export type ChallengeDefaults = { signupStart: string; signupEnd: string; start: string; end: string; fee: number };

export default function EventBlockFields({ nowYm, accounts = [], defaults }: { nowYm: string; accounts?: SavedAccount[]; defaults?: ChallengeDefaults }) {
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
      <div className="flex items-center gap-2">
        <label htmlFor="block-type" className="label shrink-0 whitespace-nowrap">종류</label>
        <select id="block-type" name="type" className="input grow min-w-0" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="bingo">빙고</option><option value="poll">투표·설문</option><option value="challenge">기록 챌린지</option>
        </select>
        <label htmlFor="block-ym" className="label shrink-0 whitespace-nowrap ml-1">월</label>
        <input id="block-ym" name="ym" type="month" className="input grow min-w-0" defaultValue={nowYm} required />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="block-title" className="label shrink-0 whitespace-nowrap">이벤트 이름</label>
        <input id="block-title" name="title" className="input grow min-w-0" maxLength={40} required placeholder="예: 11월 5×5 미션 빙고" />
        <Submit className="btn btn-primary shrink-0 whitespace-nowrap">블록 만들기</Submit>
      </div>
      {kind === "poll" && (
        <>
          <label className="field"><span className="label">투표 질문</span><input name="question" className="input" maxLength={100} placeholder="예: 다음 번개런 코스는?" /></label>
          <label className="field"><span className="label">선택지 (한 줄에 하나·2~8개)</span><textarea name="options" className="input" rows={4} placeholder={"한강 10km\n남산 순환\n탄천 하프"} /></label>
        </>
      )}
      {kind === "challenge" && (
        <>
          {defaults && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([["signupStart", "신청 시작"], ["signupEnd", "신청 마감"], ["start", "기록 시작"], ["end", "기록 종료"]] as const).map(([k, l]) => (
                  <label key={k} className="field min-w-0"><span className="label">{l}</span><input name={k} type="datetime-local" className="input min-w-0" defaultValue={defaults[k]} required /></label>
                ))}
              </div>
              <label className="field"><span className="label">회비(원)</span><MoneyInput name="fee" defaultValue={defaults.fee} required /></label>
            </>
          )}
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
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={4} defaultValue={"넥워머\n카프슬리브\n오스무브 모자\n데카르트 장갑"} /></label>
            <label className="field"><span className="label">추첨 상품 (한 줄에 하나 · 없으면 비움)</span><textarea name="raffle" className="input" rows={4} placeholder={"예: 치킨 쿠폰\n러닝 양말"} /></label>
          </div>
        </>
      )}
    </div>
  );
}
