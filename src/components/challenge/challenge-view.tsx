import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import ActivityForm from "@/components/challenge/activity-form";
import { deleteActivityAction, fileAppealAction, joinChallengeAction, leaveChallengeAction } from "@/app/challenge-actions";
import { listActs, listAppeals, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, RULE, SURFACE_LABEL, awardWinners, buildBoard, fmtDateTime, fmtDur, fmtMdTime, fmtPace, formatValue, judge, nowKst, phaseOf, placeGroupOf, placeKey,
  type Activity, type Appeal, type Board, type ChallengeConfig, type ChallengeMember, type Phase,
} from "@/lib/challenge/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 참가자용 챌린지 화면: 규정 → 신청 → 내 기록 → 순위 → 시상 → 이의 제기 */
export default async function ChallengeView({ block, nick, staff }: { block: EventBlock; nick: string; staff: boolean }) {
  const cfg = block.challenge as ChallengeConfig;
  const now = nowKst();
  const phase = phaseOf(cfg, now);
  const [members, acts, places, appeals] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), listAppeals(block.id)]);
  const mine = members.find((m) => m.nick === nick);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const live = phase === "running" || phase === "upload";
  const board = buildBoard(acts, paidNicks, cfg, { verifiedOnly: !live, places });
  const myActs = acts.filter((a) => a.nick === nick);
  const awards = now >= cfg.finalAt ? awardWinners(buildBoard(acts, paidNicks, cfg, { verifiedOnly: true, places })) : null;
  const showBoard = phase === "running" || phase === "upload" || phase === "appeal" || phase === "closed";

  return (
    <div className="grid gap-4">
      <section className="panel p-4 grid gap-1">
        <p className="text-xs text-muted">{block.title}</p>
        <h1 className="text-lg font-bold">{fmtDateTime(cfg.start)} ~ {fmtDateTime(cfg.end)} 기록 챌린지</h1>
        <p className="text-sm"><span className="chip chip-open">{PHASE_LABEL[phase]}</span></p>
        {staff && <a href="/admin?tab=bingo" className="text-xs text-muted underline">운영진 관리 화면으로</a>}
      </section>

      {mine && !mine.paid && (
        <p className="panel p-3 text-sm">⏳ <b>입금 확인 전이에요.</b> 기록은 올릴 수 있지만, 순위와 수상에는 입금이 확인된 뒤부터 들어가요.</p>
      )}

      <SignupPanel blockId={block.id} cfg={cfg} phase={phase} mine={mine} />

      {mine && (phase === "running" || phase === "upload") && (
        <section className="panel p-4 grid gap-3">
          <h2 className="font-bold">기록 올리기</h2>
          <p className="text-xs text-muted">{fmtDateTime(cfg.uploadEnd)}까지 올리고 고칠 수 있어요. 올린 캡처는 나와 운영진만 볼 수 있어요.</p>
          <ActivityForm blockId={block.id} start={cfg.start} end={cfg.end} now={now} />
        </section>
      )}

      {mine && myActs.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-bold px-1">내 기록 {myActs.length}건</h2>
          {myActs.map((a) => <MyAct key={a.id} a={a} cfg={cfg} blockId={block.id} now={now} canEdit={live} />)}
        </section>
      )}

      {mine && phase === "appeal" && <AppealPanel blockId={block.id} acts={myActs} appeals={appeals.filter((p) => p.nick === nick)} />}

      {awards && (
        <section className="panel p-4 grid gap-2">
          <h2 className="font-bold">🏆 시상</h2>
          <ul className="grid gap-1 text-sm">
            {awards.map((x) => (
              <li key={x.category} className="flex gap-2"><span className="w-24 text-muted">{CATEGORY_LABEL[x.category]}</span>
                <b>{x.winner ?? (x.tie.length ? `동점 (${x.tie.join(", ")}) — 운영진이 정해요` : "해당자 없음")}</b>
                {x.provisional && <span className="text-xs text-muted">앞 부문 동점 정리 후 확정</span>}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">1인 1상이에요. 상품은 위 순서대로 수상자가 고르고, 순위와 상품은 양도할 수 없어요.</p>
        </section>
      )}

      {showBoard && <BoardPanel board={board} acts={acts} me={nick} verifiedOnly={!live} />}
      {showBoard && <PlacePanel acts={acts} places={places} />}

      <FeePanel cfg={cfg} paid={paidNicks.length} />
      <RulesPanel cfg={cfg} open={phase === "soon" || phase === "signup"} />
    </div>
  );
}

function SignupPanel({ blockId, cfg, phase, mine }: { blockId: string; cfg: ChallengeConfig; phase: Phase; mine?: ChallengeMember }) {
  const bank = cfg.bank.bank && cfg.bank.account ? `${cfg.bank.bank} ${cfg.bank.account} (${cfg.bank.holder})` : "입금 계좌는 곧 안내해요";
  if (phase === "signup" && !mine) {
    return (
      <section className="panel p-4 grid gap-3">
        <h2 className="font-bold">참가 신청 <span className="text-xs text-muted font-normal">{fmtDateTime(cfg.signupEnd)}까지</span></h2>
        <p className="text-sm">회비 <b>{won(cfg.fee)}</b> · {bank}</p>
        <p className="text-sm text-[var(--bad)]">회비는 신청을 취소하거나 중간에 그만두어도 환불되지 않아요.</p>
        <ActionForm action={joinChallengeAction} keep alertError className="grid gap-3">
          <input type="hidden" name="id" value={blockId} />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" className="mt-1" /> 아래 규정을 모두 읽었고, 회비 환불이 없다는 점에 동의해요.</label>
          <div><Submit pendingText="신청 중…">참가 신청하기</Submit></div>
        </ActionForm>
      </section>
    );
  }
  if (phase === "signup" && mine) {
    return (
      <section className="panel p-4 grid gap-2">
        <h2 className="font-bold">✅ 신청 완료 {mine.paid ? <span className="chip chip-confirmed">입금 확인됨</span> : <span className="chip chip-warn">입금 확인 전</span>}</h2>
        {!mine.paid && <p className="text-sm">회비 <b>{won(cfg.fee)}</b>을 입금해 주세요 · {bank}</p>}
        <ActionForm action={leaveChallengeAction} keep alertError className="flex">
          <input type="hidden" name="id" value={blockId} />
          <Submit className="btn btn-ghost btn-danger text-sm" confirm="신청을 취소할까요? 낸 회비는 돌려받을 수 없어요.">신청 취소 (환불 없음)</Submit>
        </ActionForm>
      </section>
    );
  }
  if (phase === "soon") return <section className="panel p-4 text-sm">{fmtDateTime(cfg.signupStart)}부터 신청을 받아요.</section>;
  if (!mine) return <section className="panel p-4 text-sm">신청 기간이 끝나서 이번 챌린지에는 참가할 수 없어요. 순위는 구경할 수 있어요.</section>;
  return null;
}

function MyAct({ a, cfg, blockId, now, canEdit }: { a: Activity; cfg: ChallengeConfig; blockId: string; now: string; canEdit: boolean }) {
  const j = judge(a, cfg);
  const chip = a.status === "ok" ? <span className="chip chip-confirmed">인정</span> : a.status === "rejected" ? <span className="chip chip-failed">반려</span> : <span className="chip chip-warn">검수 전</span>;
  return (
    <div className="panel p-3 grid gap-2">
      <div className="flex items-center gap-2">
        <b className="num">{a.startedAt.replace("T", " ")}</b>{chip}
        <span className="ml-auto text-xs text-muted">{SURFACE_LABEL[a.surface]}</span>
      </div>
      <p className="text-sm num">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · 평균 {fmtPace(j.paceSec)}/km{a.cadence != null ? ` · ${a.cadence}spm` : ""}{a.zone2Pct != null ? ` · Zone 2 ${a.zone2Pct}%` : ""}{a.place ? ` · ${a.place}` : ""}</p>
      {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
      <div className="flex gap-2 flex-wrap">
        {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => (
          <a key={k} href={`/api/challenge/${blockId}/${a.id}/${k}?v=${a.updatedAt}`} target="_blank" rel="noreferrer" className="text-xs underline">{IMG_LABEL[k]} 캡처</a>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2 items-start">
          <details className="grow"><summary className="btn btn-ghost text-sm cursor-pointer inline-flex">수정</summary>
            <div className="pt-3"><ActivityForm blockId={blockId} start={cfg.start} end={cfg.end} now={now} initial={a} /></div></details>
          <form action={deleteActivityAction}>
            <input type="hidden" name="id" value={blockId} /><input type="hidden" name="actId" value={a.id} />
            <ConfirmButton message={"이 기록을 삭제할까요?\n되돌릴 수 없어요."}>삭제</ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

/** 장소 정리표(공개): 같은 장소로 묶인 입력과 건수만 보여 준다. 닉네임·캡처는 싣지 않는다. */
function PlacePanel({ acts, places }: { acts: Activity[]; places: Record<string, string> }) {
  const groups = new Map<string, { label: string; raws: Map<string, number> }>();
  for (const a of acts) {
    if (a.status === "rejected" || !a.place) continue;
    const g = placeGroupOf(a.place, places);
    const k = placeKey(a.place);
    const cur = groups.get(g) ?? { label: Object.hasOwn(places, k) && places[k] ? places[k] : a.place, raws: new Map<string, number>() };
    if (Object.hasOwn(places, k) && places[k]) cur.label = places[k];
    cur.raws.set(a.place, (cur.raws.get(a.place) ?? 0) + 1);
    groups.set(g, cur);
  }
  if (groups.size === 0) return null;
  return (
    <section className="panel p-4 grid gap-2">
      <h2 className="font-bold">장소 정리표</h2>
      <p className="text-xs text-muted">같은 장소로 묶은 입력이에요. 지도 캡처상 출발 지점이 3km 이상 떨어져 있으면 다른 장소예요.</p>
      <ul className="grid gap-1 text-sm">
        {[...groups.values()].map((g) => (
          <li key={g.label}><b>{g.label}</b> <span className="text-muted">{[...g.raws.entries()].map(([r, n]) => `${r} ${n}건`).join(" · ")}</span></li>
        ))}
      </ul>
    </section>
  );
}

function BoardPanel({ board, acts, me, verifiedOnly }: { board: Board; acts: Activity[]; me: string; verifiedOnly: boolean }) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="font-bold">부문별 순위 <span className="text-xs text-muted font-normal">{verifiedOnly ? "검수 완료 기록 기준" : "잠정 · 검수 전 기록 포함"}</span></h2>
      {CATEGORIES.map((c) => (
        <div key={c} className="grid gap-1">
          <h3 className="text-sm font-bold">{CATEGORY_LABEL[c]}</h3>
          {board[c].length === 0 ? <p className="text-sm text-muted">아직 기록이 없어요.</p> : (
            <ol className="grid gap-1 text-sm">
              {board[c].map((e) => (
                <li key={e.nick} className={`flex items-center gap-2 ${e.nick === me ? "font-bold" : ""}`}>
                  <span className="num w-6 text-muted">{e.rank}</span><span className="truncate">{e.nick}</span>
                  <span className="ml-auto num">{formatValue(c, e.value)}</span>
                  {e.actIds.some((id) => byId.get(id)?.status === "pending") && <span className="chip chip-warn">검수 전</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

function AppealPanel({ blockId, acts, appeals }: { blockId: string; acts: Activity[]; appeals: Appeal[] }) {
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="font-bold">이의 제기</h2>
      {acts.length === 0 ? <p className="text-sm text-muted">이의 제기할 기록이 없어요.</p> : (
        <ActionForm action={fileAppealAction} className="grid gap-2">
          <input type="hidden" name="id" value={blockId} />
          <label className="field"><span className="label">기록</span>
            <select name="actId" className="input">{acts.map((a) => <option key={a.id} value={a.id}>{a.startedAt.replace("T", " ")} · {a.distanceKm.toFixed(2)}km</option>)}</select></label>
          <label className="field"><span className="label">사유</span><textarea name="reason" className="input" rows={3} maxLength={300} required /></label>
          <div><Submit>이의 제기하기</Submit></div>
        </ActionForm>
      )}
      {appeals.map((p) => (
        <div key={p.id} className="text-sm border-t border-[var(--line)] pt-2">
          <p>{p.reason}</p>
          <p className="text-xs text-muted">{p.done ? `답변: ${p.answer}` : "운영진이 확인 중이에요."}</p>
        </div>
      ))}
    </section>
  );
}

function FeePanel({ cfg, paid }: { cfg: ChallengeConfig; paid: number }) {
  return (
    <section className="panel p-4 grid gap-1 text-sm">
      <h2 className="font-bold">회비와 상품</h2>
      <p>모인 회비 <b>{won(cfg.fee * paid)}</b> ({paid}명 입금 확인)</p>
      <p>상품(예정, 변경될 수 있어요): {cfg.prizes.join(" · ") || "곧 안내해요"}</p>
      {cfg.spendNote && <p className="whitespace-pre-line text-muted">{cfg.spendNote}</p>}
    </section>
  );
}

function RulesPanel({ cfg, open }: { cfg: ChallengeConfig; open: boolean }) {
  const li = "list-disc ml-5";
  const h = "font-bold";
  return (
    <details className="panel p-4" open={open}>
      <summary className="font-bold cursor-pointer">규정 한눈에 보기</summary>
      <div className="grid gap-3 pt-3 text-sm">
        <div className="grid gap-1">
          <b className={h}>📅 기록</b>
          <ul className="grid gap-1">
            <li className={li}>기간은 {fmtMdTime(cfg.start)} ~ {fmtMdTime(cfg.end)}예요. 활동 <b>시작 시각</b> 기준이에요.</li>
            <li className={li}>모든 활동에는 <b>요약 캡처가 필수</b>예요. 편집한 캡처는 실격이고, 요청하면 원본을 내야 해요.</li>
            <li className={li}>평균 페이스 <b>km당 {fmtPace(RULE.maxPaceSec)} 이내</b>만 인정해요. (Zone 2 부문은 예외)</li>
            <li className={li}>로드·트레드밀·트랙 모두 가능해요.</li>
          </ul>
        </div>
        <div className="grid gap-1">
          <b className={h}>🏆 부문 (1인 1상, 아래 순서로 확정)</b>
          <ol className="grid gap-1 list-decimal ml-5">
            <li><b>거리</b>: 인정 거리 합계가 가장 긴 사람</li>
            <li><b>최장시간</b>: 인정 시간 합계가 가장 긴 사람</li>
            <li><b>케이던스</b>: {RULE.cadenceMinKm}km 이상 1건의 평균 케이던스가 가장 높은 사람</li>
            <li><b>Zone 2</b>: 비율 {RULE.zone2MinPct}% 이상 1건의 거리가 가장 긴 사람</li>
            <li><b>다양한 장소</b>: {RULE.placeMinSec / 60}분 이상 뛴 서로 다른 장소가 가장 많은 사람 (트레드밀 제외, 장소 정리표를 공개해요)</li>
            <li><b>5km</b>: 하루 합계 {RULE.fiveKmHundredths / 100}km 이상인 날이 가장 많은 사람</li>
          </ol>
        </div>
        <div className="grid gap-1">
          <b className={h}>🎁 수상</b>
          <ul className="grid gap-1">
            <li className={li}>동률이면 페이스가 빠른 사람, 그다음엔 먼저 달성한 사람이 이겨요. 완전히 같으면 공동으로 표시하고 운영진이 정해요.</li>
            <li className={li}>앞 부문 수상자는 뒤 부문에서 빠지고 차순위가 올라와요.</li>
            <li className={li}>순위와 상품은 양도할 수 없고, 상품은 확정 순서대로 골라요.</li>
          </ul>
        </div>
        <div className="grid gap-1">
          <b className={h}>💳 참가</b>
          <ul className="grid gap-1">
            <li className={li}>회비 {won(cfg.fee)} (환불 없음). 입금이 확인된 분만 순위에 들어가요.</li>
            <li className={li}>일정: 신청 {fmtMdTime(cfg.signupStart)}~{fmtMdTime(cfg.signupEnd)} · 기록 수정 {fmtMdTime(cfg.uploadEnd)}까지 · 이의 제기 {fmtMdTime(cfg.appealEnd)}까지 · 확정 {fmtMdTime(cfg.finalAt)}</li>
            <li className={li}>운영진도 참가할 수 있고, 본인 기록은 다른 운영진이 검수해요.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
