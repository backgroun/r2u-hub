import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import MoneyInput from "@/components/money-input";
import { resetChallengeDataAction, saveChallengeConfigAction, setChallengeTestAction, setPaidAction } from "@/app/challenge-actions";
import { listActs, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, SURFACE_LABEL, awardWinners, buildBoard, currentPhase, defaultRulesText, effectiveCfg, fmtDur, fmtPace, judge, nowKst,
  type ChallengeConfig, type Phase,
} from "@/lib/challenge/rules";

const TEST_PHASES: Phase[] = ["signup", "ready", "running", "closed"];
const when = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");

/** 운영진용 챌린지 관리: 설정 → 입금 → 올라온 기록 → 결과 미리보기 */
export default async function ChallengeAdmin({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  const phase = currentPhase(cfg, nowKst());
  const ecfg = effectiveCfg(cfg); // 기록 기간을 보는 판정·순위에는 테스트 모드에서 넓힌 설정을 쓴다
  const [members, acts, places] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id)]);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const boardNicks = cfg.testMode ? members.map((m) => m.nick) : paidNicks; // 테스트 모드에서는 입금 확인 전 신청자도 순위에 넣는다
  const recent = [...acts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const awards = awardWinners(buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places }));

  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">{block.title} <span className="chip chip-open">{PHASE_LABEL[phase]}</span></h2>
        <p className="text-sm text-muted">신청 {members.length}명 · 입금 확인 {paidNicks.length}명 · 기록 {acts.length}건</p>
        <div className="flex items-start gap-2 border-t border-[var(--line)] pt-2">
          <details className="grow min-w-0">
            <summary className="cursor-pointer text-sm font-bold py-1" style={cfg.testMode ? { color: "#8a5a00" } : undefined}>🧪 테스트 {cfg.testMode ? "켜짐 · 운영진에게만 보여요" : "꺼짐"}</summary>
            <ActionForm action={setChallengeTestAction} keep className="flex items-stretch gap-2 pt-2">
              <input type="hidden" name="id" value={block.id} />
              <select name="testPhase" aria-label="단계" className="input min-w-0 flex-[3] py-1.5 text-sm" style={{ width: "auto" }} defaultValue={cfg.testPhase}>
                <option value="">단계: 날짜대로</option>
                {TEST_PHASES.map((p) => <option key={p} value={p}>단계: {PHASE_LABEL[p]}</option>)}
              </select>
              <select name="testMode" aria-label="테스트 모드" className="input min-w-0 flex-[2] py-1.5 text-sm" style={{ width: "auto" }} defaultValue={cfg.testMode ? "1" : "0"}>
                <option value="1">켜기</option><option value="0">끄기</option>
              </select>
              <Submit className="btn btn-primary shrink-0 text-sm px-4" pendingText="…">적용</Submit>
            </ActionForm>
          </details>
          {cfg.testMode && (
            <ActionForm action={resetChallengeDataAction} keep className="shrink-0">
              <input type="hidden" name="id" value={block.id} />
              <ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2" message={`신청 ${members.length}명 · 기록 ${acts.length}건을 모두 지울까요?\n되돌릴 수 없어요.`}>테스트 데이터 지우기</ConfirmButton>
            </ActionForm>
          )}
        </div>
      </div>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">설정 (기간·회비·계좌·상품)</summary>
        <ActionForm action={saveChallengeConfigAction} keep restoreOnError className="grid gap-2 pt-3">
          <input type="hidden" name="id" value={block.id} />
          <p className="text-xs text-muted">일정은 모두 날짜와 시각(한국 시간)으로 정해요. 기록 시작·종료는 활동 시작 시각 기준이고, 각 마감은 그 시각까지 인정돼요. 규정은 신청 마감 전에 확정하세요. 신청이 시작된 뒤 바꾸면 분쟁이 생길 수 있어서 비밀번호 확인 후 저장되고, 기록으로 남아요.</p>
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
          <label className="field"><span className="label">규정 안내 (참가자 화면의 ‘규정 한눈에 보기’)</span>
            <textarea name="rulesText" className="input" rows={14} defaultValue={cfg.rulesText?.trim() ? cfg.rulesText : defaultRulesText(cfg)} />
            <span className="text-xs text-muted">“## 제목” 줄이 묶음 제목, “1. ” 로 시작하면 번호 목록, 나머지 줄은 점 목록이에요. **굵게** 표시를 쓸 수 있어요. 기본 문구 그대로 두면 기간·회비를 바꿀 때 자동으로 따라가요.</span></label>
          <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={5} defaultValue={cfg.prizes.join("\n")} /></label>
          <div><ConfirmButton className="btn btn-primary" message={"챌린지 설정을 저장할까요?\n기간·회비·상품이 참가자 화면에 바로 반영돼요."}>저장</ConfirmButton></div>
        </ActionForm>
      </details>

      <details className="panel p-4" open={paidNicks.length < members.length}>
        <summary className="font-bold cursor-pointer">참가자·입금 ({paidNicks.length}/{members.length})</summary>
        <div className="grid gap-2 pt-3">
          {members.length === 0 && <p className="text-sm text-muted">아직 신청한 사람이 없어요.</p>}
          {members.map((m) => (
            <form key={m.nick} action={setPaidAction} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={block.id} /><input type="hidden" name="nick" value={m.nick} />
              <b className="truncate">{m.nick}</b><span className="text-xs text-muted">{when(m.appliedAt)} 신청 · 동의 {when(m.agreedAt)}</span>
              <input type="hidden" name="paid" value={m.paid ? "0" : "1"} />
              <button className={`btn text-xs py-1 px-2.5 ml-auto ${m.paid ? "" : "btn-primary"}`}>{m.paid ? "입금 확인됨 (취소)" : "입금 확인"}</button>
            </form>
          ))}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">올라온 기록 ({acts.length}건)</summary>
        <div className="grid gap-3 pt-3">
          {recent.map((a) => {
            const j = judge(a, ecfg);
            return (
              <div key={a.id} className="grid gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 flex-wrap"><b>{a.nick}</b><span className="num text-sm">{a.startedAt.replace("T", " ")}</span></div>
                <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km · {SURFACE_LABEL[a.surface]}{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}% · 심박 ${a.avgHr}` : ""}{a.place ? ` · ${a.place}` : ""}</p>
                {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => {
                    const src = `/api/challenge/${block.id}/${a.id}/${k}?v=${a.updatedAt}`;
                    return (
                      <a key={k} href={src} target="_blank" rel="noreferrer" className="grid gap-1" title="누르면 원본이 새 탭에서 열려요">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`${IMG_LABEL[k]} 캡처`} loading="lazy" className="w-full max-h-72 object-contain rounded-lg border border-[var(--line)] bg-black/20" />
                        <span className="text-xs text-muted">{IMG_LABEL[k]} 캡처</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {recent.length === 0 && <p className="text-sm text-muted">아직 올라온 기록이 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">결과 미리보기 (1인 1상)</summary>
        <ul className="grid gap-1 pt-3 text-sm">
          {awards.map((x) => (
            <li key={x.category} className="flex gap-2"><span className="w-24 text-muted">{CATEGORY_LABEL[x.category]}</span>
              <b>{x.winner ?? (x.tie.length ? `동점 (${x.tie.join(", ")}) — 운영진이 정해 주세요` : "해당자 없음")}</b>
              {x.provisional && <span className="text-xs text-muted">앞 부문 동점 정리 후 확정</span>}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
