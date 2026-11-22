import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import MoneyInput from "@/components/money-input";
import RecordSlider from "@/components/challenge/record-slider";
import CaptureGallery from "@/components/challenge/capture-gallery";
import RulesEditor from "@/components/challenge/rules-editor";
import { confirmAwardsAction, drawRaffleAction, replaceAwardAction, unconfirmAwardsAction, resetChallengeDataAction, saveChallengeRulesAction, setChallengeTestAction, setPaidAction } from "@/app/challenge-actions";
import { getAwards, getRaffle, listActs, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORY_LABEL, IMG_KINDS, effectiveWinners, formatValue, IMG_LABEL, PHASE_LABEL, SURFACE_LABEL, awardWinners, buildBoard, currentPhase, fmtTicket, RULES_TOKENS, defaultRulesText, effectiveCfg, fmtBib, fmtDate, fmtDur, fmtPace, judge, nowKst,
  type ChallengeConfig, type Phase,
} from "@/lib/challenge/rules";

const TEST_PHASES: Phase[] = ["signup", "running", "closed"]; // 테스트에서 고정해 볼 단계 (날짜대로·시작 전은 뺐다)
const when = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
const day = (ms: number) => when(ms).slice(0, 5); // 월-일만

/** 운영진용 챌린지 관리: 설정 → 입금 → 올라온 기록 → 결과 미리보기 */
export default async function ChallengeAdmin({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  const phase = currentPhase(cfg, nowKst());
  const ecfg = effectiveCfg(cfg); // 기록 기간을 보는 판정·순위에는 테스트 모드에서 넓힌 설정을 쓴다
  const [members, acts, places, raffle, awardsRec] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), getRaffle(block.id), getAwards(block.id)]);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const boardNicks = cfg.testMode ? members.map((m) => m.nick) : paidNicks; // 테스트 모드에서는 입금 확인 전 신청자도 순위에 넣는다
  const eligibleTickets = acts.filter((a) => a.ticket != null && (cfg.testMode || paidNicks.includes(a.nick))).length;
  const raffleReady = phase === "closed" || cfg.testMode;
  const waiting = members.filter((m) => !m.paid && m.paidClaimedAt).length; // 입금했다고 알렸지만 아직 확인 전인 사람
  // 참가자별로 발급된 행운 번호(추첨 대상 여부와 당첨 표시용)
  const ticketsByNick = new Map<string, number[]>();
  for (const a of acts) if (a.ticket != null) ticketsByNick.set(a.nick, [...(ticketsByNick.get(a.nick) ?? []), a.ticket]);
  const ticketRows = [...ticketsByNick.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([nick, list]) => ({ nick, list: list.sort((p, q) => p - q), ok: cfg.testMode || paidNicks.includes(nick) }));
  const wonTickets = new Set((raffle?.winners ?? []).map((w) => w.ticket));
  const recent = [...acts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const board = buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places });
  const awards = effectiveWinners(awardWinners(board), awardsRec.overrides);
  const awardsReady = phase === "closed" || cfg.testMode;

  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">{block.title} <span className="chip chip-open">{PHASE_LABEL[phase]}</span></h2>
        <p className="text-sm text-muted">신청 {members.length}명 · 입금 확인 {paidNicks.length}명 · 기록 {acts.length}건</p>
        <div className="flex items-start gap-2 border-t border-[var(--line)] pt-2">
          <details className="grow min-w-0">
            <summary className="cursor-pointer text-sm font-bold py-1" style={cfg.testMode ? { color: "#8a5a00" } : undefined}>🧪 테스트 {cfg.testMode ? "켜짐 · 운영진에게만 보여요" : "꺼짐"}</summary>
            {/* 켜기/끄기는 한 버튼으로 번갈아 누른다. 켜진 동안에는 단계 버튼을 눌러 단계를 바꾼다(버튼마다 자기 값을 숨은 칸에 담아 보낸다). */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {cfg.testMode && (
                <div className="ch-radios" role="group" aria-label="테스트 단계">
                  {TEST_PHASES.map((p) => (
                    <ActionForm key={p} action={setChallengeTestAction} keep hideInline className="flex-1">
                      <input type="hidden" name="id" value={block.id} /><input type="hidden" name="testMode" value="1" /><input type="hidden" name="testPhase" value={p} />
                      <button type="submit" className="ch-phase" aria-pressed={cfg.testPhase === p} data-on={cfg.testPhase === p ? "1" : undefined}>{PHASE_LABEL[p]}</button>
                    </ActionForm>
                  ))}
                </div>
              )}
              <ActionForm action={setChallengeTestAction} keep hideInline className="shrink-0">
                <input type="hidden" name="id" value={block.id} />
                <input type="hidden" name="testMode" value={cfg.testMode ? "0" : "1"} />
                <input type="hidden" name="testPhase" value={TEST_PHASES.includes(cfg.testPhase as Phase) ? cfg.testPhase : "running"} />
                <Submit className={`btn h-10 min-h-0 py-0 text-sm px-4 ${cfg.testMode ? "" : "btn-primary"}`} pendingText="…">{cfg.testMode ? "테스트 끄기" : "테스트 켜기"}</Submit>
              </ActionForm>
            </div>
          </details>
          {cfg.testMode && (
            <ActionForm action={resetChallengeDataAction} keep className="shrink-0">
              <input type="hidden" name="id" value={block.id} />
              <ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2" message={`신청 ${members.length}명 · 기록 ${acts.length}건을 모두 지울까요?\n되돌릴 수 없어요.`}>테스트 데이터 지우기</ConfirmButton>
            </ActionForm>
          )}
        </div>
      </div>

      <ActionForm action={saveChallengeRulesAction} keep restoreOnError>
        <input type="hidden" name="id" value={block.id} />
        <details className="panel p-3">
          <summary className="font-bold cursor-pointer">
            <span className="grow">규정 안내</span>
            <ConfirmButton className="btn btn-primary text-xs py-1 px-3" message={"규정 안내를 저장할까요?\n참가자 화면에 바로 반영돼요."}>저장</ConfirmButton>
          </summary>
          <div className="pt-2">
            <RulesEditor initialText={cfg.rulesText?.trim() ? cfg.rulesText : defaultRulesText()} defaultText={defaultRulesText()} />
          </div>
        </details>
      </ActionForm>

      <details className="panel p-4" open={paidNicks.length < members.length}>
        <summary className="font-bold cursor-pointer">
          <span className="grow">참가자·입금 ({paidNicks.length}/{members.length})</span>
          <span className="flex gap-1.5 text-xs font-normal">
            <span className="chip chip-confirmed">입금확인 {paidNicks.length}건</span>
            <span className={`chip ${waiting > 0 ? "chip-warn" : ""}`}>확인대기 {waiting}건</span>
          </span>
        </summary>
        <div className="grid gap-2 pt-3">
          {members.length === 0 && <p className="text-sm text-muted">아직 신청한 사람이 없어요.</p>}
          {members.map((m) => (
            <form key={m.nick} action={setPaidAction} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={block.id} /><input type="hidden" name="nick" value={m.nick} />
              <b className="truncate">{m.nick}</b>{m.bib != null && <span className="chip num">배번 {fmtBib(m.bib)}</span>}<span className="text-xs text-muted">{day(m.appliedAt)} 신청</span>{!m.paid && m.paidClaimedAt && <span className="chip chip-warn">입금함 {day(m.paidClaimedAt)}</span>}
              <input type="hidden" name="paid" value={m.paid ? "0" : "1"} />
              <button className={`btn text-xs py-1 px-2.5 ml-auto ${m.paid ? "" : "btn-primary"}`} style={m.paid ? { background: "var(--good-bg)", color: "var(--good)", borderColor: "var(--good)" } : undefined} title={m.paid ? "누르면 확인을 취소해요" : undefined}>{m.paid ? "확인완료" : "입금 확인"}</button>
            </form>
          ))}
        </div>
      </details>

      <ActionForm action={drawRaffleAction} keep>
        <input type="hidden" name="id" value={block.id} />
        <details className="panel p-4" open>
          <summary className="font-bold cursor-pointer">
            <span className="grow">경품 추첨 (번호 {eligibleTickets}장 · 상품 {(cfg.raffle ?? []).length}개)</span>
            {(cfg.raffle ?? []).length > 0 && raffleReady && (
              <ConfirmButton className="btn btn-primary text-xs py-1 px-3" message={raffle ? "이미 추첨했어요. 다시 뽑으면 이전 결과가 사라져요. 다시 추첨할까요?" : `번호 ${eligibleTickets}장으로 추첨할까요?\n결과는 참가자 화면에 바로 보여요.`}>{raffle ? "다시 추첨하기" : "추첨하기"}</ConfirmButton>
            )}
          </summary>
          <div className="grid gap-3 pt-3">
            <p className="text-xs text-muted">기록을 올릴 때마다 행운 번호가 한 장씩 발급돼요. 추첨은 입금 확인된 참가자의 번호만 대상이고, 한 사람은 한 번만 당첨돼요.{!raffleReady && " 기록이 끝난 뒤에 추첨할 수 있어요."}</p>
            {(cfg.raffle ?? []).length === 0 && <p className="text-sm">이벤트 블록 설정의 “추첨 상품”에 상품을 적어야 추첨할 수 있어요.</p>}
            {ticketRows.length === 0 ? <p className="text-sm text-muted">아직 발급된 행운 번호가 없어요.</p> : (
              <ul className="grid gap-2" aria-label="참가자별 행운 번호">
                {ticketRows.map((r) => (
                  <li key={r.nick} className="grid gap-1" style={r.ok ? undefined : { opacity: 0.5 }}>
                    <span className="text-sm"><b>{r.nick}</b> <span className="text-xs text-muted">{r.list.length}장{r.ok ? "" : " · 입금 확인 전이라 추첨에서 빠져요"}</span></span>
                    <ul className="ch-balls">{r.list.map((n) => <li key={n} className="ch-ball ch-ball-sm" data-c={n % 5} data-hit={wonTickets.has(n) ? "1" : undefined}>{fmtTicket(n)}</li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
            {raffle && (
              <ol className="grid gap-1 text-sm">
                {raffle.winners.map((w) => <li key={`${w.prize}-${w.ticket}`}><b>{w.prize}</b> · {w.nick} <span className="text-muted num">({fmtTicket(w.ticket)})</span></li>)}
              </ol>
            )}
          </div>
        </details>
      </ActionForm>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">올라온 기록 ({acts.length}건)</summary>
        <div className="pt-3">
          <RecordSlider>
          {recent.map((a) => {
            const j = judge(a, ecfg);
            return (
              <div key={a.id} className="grid content-start gap-2">
                <div className="flex items-center gap-2 flex-wrap"><b>{a.nick}</b><span className="num text-sm">{fmtDate(a.date)}</span>{a.ticket != null && <span className="ch-ball ch-ball-sm ml-auto" data-c={a.ticket % 5} aria-label={`행운 번호 ${fmtTicket(a.ticket)}`}>{fmtTicket(a.ticket)}</span>}</div>
                <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km · {SURFACE_LABEL[a.surface]}{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}% · 심박 ${a.avgHr}` : ""}{a.place ? ` · ${a.place}` : ""}</p>
                {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
                <CaptureGallery maxHeight={240} className="grid grid-cols-2 gap-2" images={IMG_KINDS.filter((k) => a.imgs[k]).map((k) => ({ src: `/api/challenge/${block.id}/${a.id}/${k}?v=${a.updatedAt}`, alt: `${IMG_LABEL[k]} 캡처`, label: `${IMG_LABEL[k]} 캡처` }))} />
              </div>
            );
          })}
          </RecordSlider>
          {recent.length === 0 && <p className="text-sm text-muted">아직 올라온 기록이 없어요.</p>}
        </div>
      </details>

      <ActionForm id={`aw-${block.id}`} action={awardsRec.confirmed ? unconfirmAwardsAction : confirmAwardsAction} keep>
        <input type="hidden" name="id" value={block.id} />
      </ActionForm>
      <details className="panel p-4" open>
        <summary className="font-bold cursor-pointer">
          <span className="grow flex flex-wrap items-center gap-x-2 gap-y-1">수상 결과 (확정·교체)
            {awardsRec.confirmed
              ? <><span className="chip chip-confirmed">확정됨</span><span className="text-xs font-normal text-muted">{awardsRec.confirmedAt ? when(awardsRec.confirmedAt) : ""} · {awardsRec.confirmedBy}</span></>
              : <><span className="chip chip-warn">확정 전</span>{!awardsReady && <span className="text-xs font-normal text-muted">기록이 끝난 뒤에 확정할 수 있어요</span>}</>}
          </span>
          {awardsRec.confirmed
            ? <ConfirmButton form={`aw-${block.id}`} className="btn btn-danger text-xs py-1 px-3" message={"확정을 취소할까요?\n참가자 화면에서 수상 결과가 다시 숨겨져요."}>확정 취소</ConfirmButton>
            : <ConfirmButton form={`aw-${block.id}`} className="btn btn-primary text-xs py-1 px-3" message={"수상 결과를 확정할까요?\n지금 결과가 고정되어 참가자 화면에 공개돼요."}>수상 결과 확정</ConfirmButton>}
        </summary>
        <div className="grid gap-3 pt-3">
          <ul className="grid gap-3">
            {awards.map((x) => {
              const rest = board[x.category].filter((e) => e.rank >= 2 && e.rank <= 10);
              return (
                <li key={x.category} className="grid gap-1.5 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
                  <details open={x.tie.length > 0 && !x.overridden}>
                    <summary className="flex cursor-pointer items-center gap-2 flex-wrap">
                      <b className="text-sm">{CATEGORY_LABEL[x.category]}</b>
                      <span className="font-bold">{x.winner ?? (x.tie.length ? `동점 · ${x.tie.join(", ")}` : "해당자 없음")}</span>
                      {x.overridden && <span className="chip">교체됨</span>}
                      {x.winner === null && x.tie.length === 0 && board[x.category][0] && (() => {
                        // 기록은 있는데 해당자가 없는 경우: 1위가 앞 부문 수상자라 1인 1상으로 빠진 것
                        const top = board[x.category][0], other = awards.find((y) => y.category !== x.category && y.winner === top.nick);
                        return <span className="text-xs text-muted">1위 {top.nick} {formatValue(x.category, top.value)}{other ? ` · ${CATEGORY_LABEL[other.category]} 수상자라 제외(1인 1상)` : ""}</span>;
                      })()}
                      <span className="btn btn-ghost ml-auto min-h-0 px-3 py-1 text-xs">교체</span>
                    </summary>
                    <ActionForm action={replaceAwardAction} keep className="flex items-center gap-2 pt-2">
                      <input type="hidden" name="id" value={block.id} /><input type="hidden" name="category" value={x.category} />
                      <select name="nick" aria-label={`${CATEGORY_LABEL[x.category]} 수상자 교체`} className="input min-w-0 flex-1 py-1.5 text-sm" style={{ width: "auto" }} defaultValue={x.winner ?? ""}>
                        <option value="" disabled>참가자 선택</option>
                        {members.map((m) => <option key={m.nick} value={m.nick}>{m.nick}</option>)}
                      </select>
                      <Submit className="btn btn-primary text-sm px-3 py-1.5 shrink-0" pendingText="…">교체</Submit>
                    </ActionForm>
                  </details>
                  {rest.length > 0 && (
                    <ol className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted" aria-label={`${CATEGORY_LABEL[x.category]} 2~10위`}>
                      {rest.map((e) => <li key={e.nick} className="flex justify-between gap-2"><span className="truncate"><span className="num">{e.rank}위</span> {e.nick}</span><span className="num shrink-0">{formatValue(x.category, e.value)}</span></li>)}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </section>
  );
}
