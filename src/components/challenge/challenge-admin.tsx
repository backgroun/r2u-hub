import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { resetChallengeDataAction, saveChallengeConfigAction, setChallengeTestAction, setPaidAction } from "@/app/challenge-actions";
import { listActs, listLog, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, SURFACE_LABEL, awardWinners, buildBoard, currentPhase, effectiveCfg, fmtDur, fmtPace, judge, nowKst,
  type ChallengeConfig, type Phase,
} from "@/lib/challenge/rules";

const TEST_PHASES: Phase[] = ["signup", "ready", "running", "upload", "appeal", "closed"];
const when = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");

/** 운영진용 챌린지 관리: 설정 → 입금 → 올라온 기록 → 결과 미리보기 → 로그 */
export default async function ChallengeAdmin({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  const phase = currentPhase(cfg, nowKst());
  const ecfg = effectiveCfg(cfg); // 기록 기간을 보는 판정·순위에는 테스트 모드에서 넓힌 설정을 쓴다
  const [members, acts, places, log] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), listLog(block.id)]);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const boardNicks = cfg.testMode ? members.map((m) => m.nick) : paidNicks; // 테스트 모드에서는 입금 확인 전 신청자도 순위에 넣는다
  const recent = [...acts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const awards = awardWinners(buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places }));

  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">{block.title} <span className="chip chip-open">{PHASE_LABEL[phase]}</span></h2>
        {cfg.testMode && <p className="text-sm font-bold" style={{ color: "#8a5a00" }}>🧪 테스트 모드 켜짐 — 운영진에게만 보여요</p>}
        <p className="text-sm text-muted">신청 {members.length}명 · 입금 확인 {paidNicks.length}명 · 기록 {acts.length}건</p>
        <details className="border-t border-[var(--line)] pt-2" open={cfg.testMode}>
          <summary className="font-bold cursor-pointer text-sm">🧪 테스트 모드 {cfg.testMode ? "(켜짐)" : "(꺼짐)"}</summary>
          <div className="grid gap-3 pt-3">
            <p className="text-xs text-muted">켜면 크루원에게는 이 챌린지가 보이지 않고, 운영진만 날짜와 상관없이 전 과정을 써 볼 수 있어요. 단계를 고정하면 기록 기간 밖의 날짜로도 올릴 수 있고, 기록은 검수 없이 바로 승인돼요. 끝나면 ‘테스트 데이터 모두 지우기’로 정리하세요.</p>
            <ActionForm action={setChallengeTestAction} keep className="flex items-end gap-2 flex-wrap">
              <input type="hidden" name="id" value={block.id} />
              <label className="field"><span className="label">단계</span>
                <select name="testPhase" className="input" defaultValue={cfg.testPhase}>
                  <option value="">날짜대로(자동)</option>
                  {TEST_PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
                </select></label>
              <label className="field"><span className="label">테스트 모드</span>
                <select name="testMode" className="input" defaultValue={cfg.testMode ? "1" : "0"}>
                  <option value="1">켜기</option><option value="0">끄기</option>
                </select></label>
              <Submit className="btn btn-primary" pendingText="저장 중…">적용</Submit>
            </ActionForm>
            {cfg.testMode && (
              <ActionForm action={resetChallengeDataAction} keep className="flex">
                <input type="hidden" name="id" value={block.id} />
                <ConfirmButton className="btn btn-ghost btn-danger" message={`신청 ${members.length}명 · 기록 ${acts.length}건을 모두 지울까요?\n되돌릴 수 없어요.`}>테스트 데이터 모두 지우기</ConfirmButton>
              </ActionForm>
            )}
          </div>
        </details>
      </div>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">설정 (기간·회비·계좌·상품)</summary>
        <ActionForm action={saveChallengeConfigAction} keep restoreOnError className="grid gap-2 pt-3">
          <input type="hidden" name="id" value={block.id} />
          <p className="text-xs text-muted">일정은 모두 날짜와 시각(한국 시간)으로 정해요. 기록 시작·종료는 활동 시작 시각 기준이고, 각 마감은 그 시각까지 인정돼요. 규정은 신청 마감 전에 확정하세요. 신청이 시작된 뒤 바꾸면 분쟁이 생길 수 있어서 비밀번호 확인 후 저장되고, 기록으로 남아요.</p>
          <div className="grid grid-cols-2 gap-2">
            {([["signupStart", "신청 시작"], ["signupEnd", "신청 마감"], ["start", "기록 시작"], ["end", "기록 종료"], ["uploadEnd", "업로드 마감"], ["appealEnd", "이의 제기 마감"], ["finalAt", "최종 확정"]] as const).map(([k, l]) => (
              <label key={k} className="field"><span className="label">{l}</span><input name={k} type="datetime-local" className="input" defaultValue={cfg[k]} required /></label>
            ))}
            <label className="field"><span className="label">회비(원)</span><input name="fee" type="number" min={0} className="input" defaultValue={cfg.fee} required /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="field"><span className="label">은행</span><input name="bank" className="input" defaultValue={cfg.bank.bank} /></label>
            <label className="field"><span className="label">계좌번호</span><input name="account" className="input" defaultValue={cfg.bank.account} /></label>
            <label className="field"><span className="label">예금주</span><input name="holder" className="input" defaultValue={cfg.bank.holder} /></label>
          </div>
          <label className="field"><span className="label">상품 예정 (한 줄에 하나)</span><textarea name="prizes" className="input" rows={5} defaultValue={cfg.prizes.join("\n")} /></label>
          <label className="field"><span className="label">회비 사용 내역 (참가자에게 공개)</span><textarea name="spendNote" className="input" rows={3} maxLength={500} defaultValue={cfg.spendNote} /></label>
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

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">처리 기록 (최근 50건)</summary>
        <ul className="grid gap-1 pt-3 text-xs text-muted">
          {log.map((l, i) => <li key={i}>{when(l.at)} · {l.by} · {l.action} · {l.target}{l.note ? ` · ${l.note}` : ""}</li>)}
          {log.length === 0 && <li>아직 기록이 없어요.</li>}
        </ul>
      </details>
    </section>
  );
}
