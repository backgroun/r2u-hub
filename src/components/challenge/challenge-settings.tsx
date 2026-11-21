import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import MoneyInput from "@/components/money-input";
import { saveChallengeConfigAction } from "@/app/challenge-actions";
import type { ChallengeConfig } from "@/lib/challenge/rules";

/** 챌린지 이벤트 블록의 설정: 신청·기록 일정, 회비·입금 계좌, 상품·추첨 상품. (규정 안내 글은 챌린지 관리의 ‘규정 안내’에서 따로 적는다.) */
export default function ChallengeSettings({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  return (
    <ActionForm action={saveChallengeConfigAction} keep restoreOnError className="rounded-lg border border-[var(--line)] p-3">
      <input type="hidden" name="id" value={block.id} />
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-bold">
          <span>일정·회비·계좌·상품 설정</span>
          <ConfirmButton className="btn btn-primary text-xs py-1 px-3" message={"챌린지 설정을 저장할까요?\n기간·회비·상품이 참가자 화면에 바로 반영돼요."}>저장</ConfirmButton>
        </summary>
        <div className="grid gap-2 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {([["signupStart", "신청 시작"], ["signupEnd", "신청 마감"], ["start", "기록 시작"], ["end", "기록 종료"]] as const).map(([k, l]) => (
              <label key={k} className="field"><span className="label">{l}</span><input name={k} type="datetime-local" className="input" defaultValue={cfg[k]} required /></label>
            ))}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1.6fr 1fr" }}>
            <label className="field min-w-0"><span className="label">회비(원)</span><MoneyInput name="fee" defaultValue={cfg.fee} required className="input min-w-0" /></label>
            <label className="field min-w-0"><span className="label">은행</span><input name="bank" className="input min-w-0" defaultValue={cfg.bank.bank} /></label>
            <label className="field min-w-0"><span className="label">계좌번호</span><input name="account" className="input min-w-0" defaultValue={cfg.bank.account} /></label>
            <label className="field min-w-0"><span className="label">예금주</span><input name="holder" className="input min-w-0" defaultValue={cfg.bank.holder} /></label>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`mpd-${block.id}`} className="label shrink-0 whitespace-nowrap">하루 인증 횟수</label>
            <input id={`mpd-${block.id}`} name="maxPerDay" type="number" min={0} max={50} inputMode="numeric" className="input min-w-0 grow" defaultValue={cfg.maxPerDay ?? 0} required />
            <span className="shrink-0 whitespace-nowrap text-xs text-muted">0 = 제한 없음</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={4} defaultValue={cfg.prizes.join("\n")} /></label>
            <label className="field"><span className="label">추첨 상품 (한 줄에 하나 · 비우면 추첨 없음)</span><textarea name="raffle" className="input" rows={4} placeholder={"예: 치킨 쿠폰\n러닝 양말"} defaultValue={(cfg.raffle ?? []).join("\n")} /></label>
          </div>
        </div>
      </details>
    </ActionForm>
  );
}
