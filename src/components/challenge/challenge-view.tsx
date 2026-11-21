import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import ActivityForm from "@/components/challenge/activity-form";
import { deleteActivityAction, joinChallengeAction, leaveChallengeAction } from "@/app/challenge-actions";
import { listActs, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, RULE, awardWinners, buildBoard, fmtDate, fmtDateTime, fmtDur, fmtMdTime, fmtPace, canShowWinners, currentPhase, effectiveCfg, formatValue, judge, nowKst,
  parseRules, defaultRulesText, fillRules, type Activity, type Board, type ChallengeConfig, type ChallengeMember, type Phase,
} from "@/lib/challenge/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 참가자용 챌린지 화면: 규정 → 신청 → 내 기록 → 순위 → 시상 */
export default async function ChallengeView({ block, nick, staff }: { block: EventBlock; nick: string; staff: boolean }) {
  const cfg = block.challenge as ChallengeConfig;
  const now = nowKst();
  const phase = currentPhase(cfg, now);
  const ecfg = effectiveCfg(cfg); // 기록 기간을 보는 곳(순위·판정·입력)에는 테스트 모드에서 넓힌 설정을 쓴다
  const [members, acts, places] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id)]);
  const mine = members.find((m) => m.nick === nick);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const boardNicks = cfg.testMode ? members.map((m) => m.nick) : paidNicks; // 테스트 모드에서는 입금 확인 전 신청자도 순위에 넣는다
  const live = phase === "running";
  const board = buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places });
  const myActs = acts.filter((a) => a.nick === nick);
  const awards = canShowWinners(cfg, now, phase) ? awardWinners(buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places })) : null;
  const showBoard = phase === "running" || phase === "closed";

  return (
    <div className="grid gap-4">
      {cfg.testMode && (
        <p className="panel p-3 text-sm font-bold" style={{ background: "#fff4d6", color: "#5a4300" }}>🧪 테스트 모드 · 운영진에게만 보여요 · 단계: {PHASE_LABEL[phase]}</p>
      )}
      <section className="panel p-4 grid gap-1">
        <p className="text-xs text-muted">{block.title}</p>
        <h1 className="text-lg font-bold">{fmtDateTime(cfg.start)} ~ {fmtDateTime(cfg.end)} 기록 챌린지</h1>
        <p className="text-sm"><span className="chip chip-open">{PHASE_LABEL[phase]}</span></p>
        {staff && <a href="/admin?tab=bingo" className="text-xs text-muted underline">운영진 관리 화면으로</a>}
      </section>

      <SignupPanel blockId={block.id} cfg={cfg} phase={phase} mine={mine} />

      {mine && phase === "running" && (
        <section className="panel p-4 grid gap-3">
          <h2 className="font-bold">기록 올리기</h2>
          <p className="text-xs text-muted">{fmtDateTime(cfg.end)}까지 올리고 고칠 수 있어요. 올린 캡처는 나와 운영진만 볼 수 있어요. 운영진 확인 없이 바로 인정돼요.</p>
          <ActivityForm blockId={block.id} start={ecfg.start} end={ecfg.end} now={now} />
        </section>
      )}

      {mine && myActs.length > 0 && (
        <section className="grid gap-1.5">
          <h2 className="font-bold px-1">내 기록 {myActs.length}건</h2>
          {myActs.map((a) => <MyAct key={a.id} a={a} cfg={cfg} ecfg={ecfg} blockId={block.id} now={now} canEdit={live} />)}
        </section>
      )}

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

      {showBoard && <BoardPanel board={board} me={nick} />}

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

function MyAct({ a, ecfg, blockId, now, canEdit }: { a: Activity; cfg: ChallengeConfig; ecfg: ChallengeConfig; blockId: string; now: string; canEdit: boolean }) {
  const j = judge(a, ecfg);
  const rest = [`${a.distanceKm.toFixed(2)}km`, fmtDur(a.durationSec), `${fmtPace(j.paceSec)}/km`, a.cadence != null ? `${a.cadence}spm` : null, a.zone2Pct != null ? `Z2 ${a.zone2Pct}%` : null, a.place].filter(Boolean).join(" · ");
  return (
    <details className="panel px-3 py-2">
      <summary className="cursor-pointer text-sm num">
        <span className="min-w-0"><b>{fmtDate(a.date)}</b> <span className="text-muted">· {rest}</span>{j.notes.length > 0 && <span className="text-[var(--bad)]"> ⚠</span>}</span>
      </summary>
      <div className="grid gap-2 pt-2">
        {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
        <div className="flex gap-2 flex-wrap">
          {IMG_KINDS.filter((k) => a.imgs[k]).map((k) => (
            <a key={k} href={`/api/challenge/${blockId}/${a.id}/${k}?v=${a.updatedAt}`} target="_blank" rel="noreferrer" className="text-xs underline">{IMG_LABEL[k]} 캡처</a>
          ))}
        </div>
        {canEdit && (
          <>
            <ActivityForm blockId={blockId} start={ecfg.start} end={ecfg.end} now={now} initial={a} />
            <form action={deleteActivityAction}>
              <input type="hidden" name="id" value={blockId} /><input type="hidden" name="actId" value={a.id} />
              <ConfirmButton message={"이 기록을 삭제할까요?\n되돌릴 수 없어요."}>이 기록 삭제</ConfirmButton>
            </form>
          </>
        )}
      </div>
    </details>
  );
}

function BoardPanel({ board, me }: { board: Board; me: string }) {
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="font-bold">부문별 순위</h2>
      {CATEGORIES.map((c) => (
        <div key={c} className="grid gap-1">
          <h3 className="text-sm font-bold">{CATEGORY_LABEL[c]}</h3>
          {board[c].length === 0 ? <p className="text-sm text-muted">아직 기록이 없어요.</p> : (
            <ol className="grid gap-1 text-sm">
              {board[c].map((e) => (
                <li key={e.nick} className={`flex items-center gap-2 ${e.nick === me ? "font-bold" : ""}`}>
                  <span className="num w-6 text-muted">{e.rank}</span><span className="truncate">{e.nick}</span>
                  <span className="ml-auto num">{formatValue(c, e.value)}</span>
                </li>
              ))}
            </ol>
          )}
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
    </section>
  );
}

/** **굵게** 표시만 해석해서 보여 준다 */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t))}</>;
}

function RulesPanel({ cfg, open }: { cfg: ChallengeConfig; open: boolean }) {
  const sections = parseRules(fillRules(cfg.rulesText?.trim() ? cfg.rulesText : defaultRulesText(), cfg));
  return (
    <details className="panel p-4" open={open}>
      <summary className="font-bold cursor-pointer">규정 한눈에 보기</summary>
      <div className="grid gap-3 pt-3 text-sm">
        {sections.map((sec, i) => (
          <div key={i} className="grid gap-1">
            {sec.title && <b className="font-bold">{sec.title}</b>}
            {sec.ordered ? (
              <ol className="grid gap-1 list-decimal ml-5">{sec.items.map((t, k) => <li key={k}><Rich text={t} /></li>)}</ol>
            ) : (
              <ul className="grid gap-1">{sec.items.map((t, k) => <li key={k} className="list-disc ml-5"><Rich text={t} /></li>)}</ul>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
