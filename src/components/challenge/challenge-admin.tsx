import { currentUser } from "@/lib/hub";
import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { resolveAppealAction, reviewActivityAction, saveChallengeConfigAction, setPaidAction, setPlaceGroupAction } from "@/app/challenge-actions";
import { listActs, listAppeals, listLog, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, SURFACE_LABEL, awardWinners, buildBoard, fmtDur, fmtPace, judge, nowKst, phaseOf, placeKey,
  type Activity, type ChallengeConfig,
} from "@/lib/challenge/rules";

const when = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
const rankOf = (a: Activity, top: Set<string>) => (a.status === "pending" ? (top.has(a.id) ? 0 : 1) : a.status === "ok" ? 2 : 3);

/** 운영진용 챌린지 관리: 설정 → 입금 → 검수 → 장소 정리표 → 이의 제기 → 결과 미리보기 → 로그 */
export default async function ChallengeAdmin({ block }: { block: EventBlock }) {
  const cfg = block.challenge as ChallengeConfig;
  const me = (await currentUser())?.nick ?? "";
  const phase = phaseOf(cfg, nowKst());
  const [members, acts, places, appeals, log] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), listAppeals(block.id), listLog(block.id)]);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const liveBoard = buildBoard(acts, paidNicks, cfg, { verifiedOnly: false, places });
  // 각 부문 상위 3위 후보의 근거 활동은 캡처를 전수 확인한다
  const top = new Set<string>();
  for (const c of CATEGORIES) for (const e of liveBoard[c].filter((x) => x.rank <= 3)) e.actIds.forEach((id) => top.add(id));
  const dup = new Map<string, number>();
  for (const a of acts) { const key = `${a.startedAt}|${a.distanceKm}|${a.durationSec}`; dup.set(key, (dup.get(key) ?? 0) + 1); }
  const queue = [...acts].sort((a, b) => rankOf(a, top) - rankOf(b, top) || b.startedAt.localeCompare(a.startedAt));
  const pending = acts.filter((a) => a.status === "pending").length;
  const placeList = new Map<string, { label: string; n: number }>();
  for (const a of acts) if (a.place) { const k = placeKey(a.place); placeList.set(k, { label: placeList.get(k)?.label ?? a.place, n: (placeList.get(k)?.n ?? 0) + 1 }); }
  const awards = awardWinners(buildBoard(acts, paidNicks, cfg, { verifiedOnly: true, places }));
  const openAppeals = appeals.filter((p) => !p.done);

  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-1">
        <h2 className="font-bold">{block.title} <span className="chip chip-open">{PHASE_LABEL[phase]}</span></h2>
        <p className="text-sm text-muted">신청 {members.length}명 · 입금 확인 {paidNicks.length}명 · 기록 {acts.length}건(검수 전 {pending}건) · 이의 제기 {openAppeals.length}건 대기</p>
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

      <details className="panel p-4" open>
        <summary className="font-bold cursor-pointer">기록 검수 ({pending}건 대기 / 전체 {acts.length}건)</summary>
        <p className="text-sm text-muted pt-2">각 부문 상위 3위 후보의 근거 기록은 ‘상위 후보’로 먼저 보여요. 캡처를 열어 날짜·거리·시간이 입력과 같은지 확인하세요. 본인 기록은 검수할 수 없어요.</p>
        <div className="grid gap-3 pt-3">
          {queue.map((a) => {
            const j = judge(a, cfg);
            const same = dup.get(`${a.startedAt}|${a.distanceKm}|${a.durationSec}`) ?? 0;
            return (
              <div key={a.id} className="grid gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <b>{a.nick}</b><span className="num text-sm">{a.startedAt.replace("T", " ")}</span>
                  {top.has(a.id) && <span className="chip chip-hot">상위 후보</span>}
                  {same > 1 && <span className="chip chip-failed">같은 기록 {same}건</span>}
                  <span className={`chip ml-auto ${a.status === "ok" ? "chip-confirmed" : a.status === "rejected" ? "chip-failed" : "chip-warn"}`}>{a.status === "ok" ? "인정" : a.status === "rejected" ? "반려" : "검수 전"}</span>
                </div>
                <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km · {SURFACE_LABEL[a.surface]}{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}% · 심박 ${a.avgHr}` : ""}{a.place ? ` · ${a.place}` : ""}</p>
                {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
                {a.status === "rejected" && a.rejectReason && <p className="text-xs text-muted">반려 사유: {a.rejectReason}</p>}
                <div className="flex gap-2 flex-wrap">
                  {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => (
                    <a key={k} href={`/api/challenge/${block.id}/${a.id}/${k}?v=${a.updatedAt}`} target="_blank" rel="noreferrer" className="text-xs underline">{IMG_LABEL[k]} 캡처 열기</a>
                  ))}
                </div>
                {a.nick !== me && (
                  <ActionForm action={reviewActivityAction} keep hideInline className="flex gap-2 items-center flex-wrap">
                    {/* name="id"는 쓰지 않는다: 폼의 id 속성이 이 입력칸에 가려져 React가 승인·반려 버튼 값을 빠뜨린다 */}
                    <input type="hidden" name="blockId" value={block.id} /><input type="hidden" name="actId" value={a.id} /><input type="hidden" name="v" value={a.updatedAt} />
                    <input name="reason" className="input grow" placeholder="반려 사유 (반려할 때만)" maxLength={200} />
                    <button name="decision" value="ok" className="btn btn-primary text-sm py-1 px-3">승인</button>
                    <button name="decision" value="rejected" className="btn btn-ghost btn-danger text-sm py-1 px-3">반려</button>
                  </ActionForm>
                )}
              </div>
            );
          })}
          {queue.length === 0 && <p className="text-sm text-muted">아직 올라온 기록이 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">장소 정리표 ({placeList.size}곳)</summary>
        <p className="text-sm text-muted pt-2">같은 장소로 볼 입력을 한 이름으로 묶으세요. 기준: 지도 캡처상 출발 지점이 3km 이상 떨어져 있으면 다른 장소예요. 묶음 이름을 비우면 묶음이 풀려요.</p>
        <div className="grid gap-2 pt-3">
          {[...placeList.entries()].map(([k, v]) => (
            <ActionForm key={k} action={setPlaceGroupAction} keep hideInline className="flex items-center gap-2 text-sm">
              <input type="hidden" name="id" value={block.id} /><input type="hidden" name="raw" value={v.label} />
              <span className="truncate">{v.label} <span className="text-muted">({v.n}건)</span></span>
              <input name="label" className="input ml-auto" style={{ maxWidth: 160 }} placeholder="묶음 이름" maxLength={40} defaultValue={Object.hasOwn(places, k) ? places[k] : ""} />
              <Submit className="btn text-xs py-1 px-2.5" pendingText="…">저장</Submit>
            </ActionForm>
          ))}
          {placeList.size === 0 && <p className="text-sm text-muted">입력된 장소가 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4" open={openAppeals.length > 0}>
        <summary className="font-bold cursor-pointer">이의 제기 ({openAppeals.length}건 대기 / 전체 {appeals.length}건)</summary>
        <div className="grid gap-3 pt-3">
          {appeals.map((p) => (
            <div key={p.id} className="grid gap-1 border-t border-[var(--line)] pt-2 first:border-0 first:pt-0 text-sm">
              <p><b>{p.nick}</b> <span className="text-xs text-muted">{when(p.at)} · 기록 {p.actId}</span></p>
              <p>{p.reason}</p>
              {p.done ? <p className="text-xs text-muted">답변({p.answeredBy}): {p.answer}</p> : (
                <ActionForm action={resolveAppealAction} keep hideInline className="flex gap-2">
                  <input type="hidden" name="id" value={block.id} /><input type="hidden" name="appealId" value={p.id} />
                  <input name="answer" className="input grow" placeholder="답변" maxLength={300} required />
                  <Submit className="btn btn-primary text-sm py-1 px-3" pendingText="…">답변</Submit>
                </ActionForm>
              )}
            </div>
          ))}
          {appeals.length === 0 && <p className="text-sm text-muted">접수된 이의 제기가 없어요.</p>}
        </div>
      </details>

      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">결과 미리보기 (검수 완료 기준 · 1인 1상)</summary>
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
