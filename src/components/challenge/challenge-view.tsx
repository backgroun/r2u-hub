import type { EventBlock } from "@/lib/event-blocks";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import ActivityForm from "@/components/challenge/activity-form";
import ChallengeBoard from "@/components/challenge/challenge-board";
import CaptureGallery from "@/components/challenge/capture-gallery";
import { claimPaidAction, deleteActivityAction, joinChallengeAction, leaveChallengeAction } from "@/app/challenge-actions";
import { getAwards, getRaffle, listActs, listMembers, listPlaceMap } from "@/lib/challenge/store";
import {
  CATEGORIES, CATEGORY_LABEL, IMG_KINDS, IMG_LABEL, PHASE_LABEL, RULE, SURFACE_LABEL, awardWinners, buildBoard, fmtDate, fmtDateTime, fmtDur, fmtMdTime, fmtPace, canShowWinners, currentPhase, effectiveCfg, formatValue, judge, nowKst, bestIds, fmtBib, fmtTicket,
  parseRules, defaultRulesText, fillRules, type Activity, type Board, type ChallengeConfig, type ChallengeMember, type Phase,
} from "@/lib/challenge/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 참가자용 챌린지 화면: 규정 → 신청 → 내 기록 → 순위 → 시상 */
export default async function ChallengeView({ block, nick }: { block: EventBlock; nick: string; staff?: boolean }) {
  const cfg = block.challenge as ChallengeConfig;
  const now = nowKst();
  const phase = currentPhase(cfg, now);
  const ecfg = effectiveCfg(cfg); // 기록 기간을 보는 곳(순위·판정·입력)에는 테스트 모드에서 넓힌 설정을 쓴다
  const [members, acts, places, raffle, awardsRec] = await Promise.all([listMembers(block.id), listActs(block.id), listPlaceMap(block.id), getRaffle(block.id), getAwards(block.id)]);
  const mine = members.find((m) => m.nick === nick);
  const paidNicks = members.filter((m) => m.paid).map((m) => m.nick);
  const boardNicks = cfg.testMode ? members.map((m) => m.nick) : paidNicks; // 테스트 모드에서는 입금 확인 전 신청자도 순위에 넣는다
  const live = phase === "running";
  const board = buildBoard(acts, boardNicks, ecfg, { verifiedOnly: false, places });
  const myActs = acts.filter((a) => a.nick === nick);
  // 5km 이상 횟수: 한 번에 5km 이상 뛴 기록(8:00 이내)만 세고, 같은 날짜끼리 묶어서 하루 몫을 합산해 보여 준다
  const isFive = (a: Activity) => judge(a, ecfg).counts.fiveK && Math.round(a.distanceKm * 100) >= RULE.fiveKmHundredths;
  const dayGroups: { date: string; acts: Activity[]; five: number }[] = [];
  for (const a of myActs) {
    const g = dayGroups.find((x) => x.date === a.date) ?? (dayGroups.push({ date: a.date, acts: [], five: 0 }), dayGroups[dayGroups.length - 1]);
    g.acts.push(a); if (isFive(a)) g.five++;
  }
  const best = bestIds(myActs, ecfg); // 케이던스·Zone 2 최고기록(기록은 모두 남기고 최고에만 뱃지)
  const fiveTotal = dayGroups.reduce((s, g) => s + g.five, 0);
  const wonTickets = new Set((raffle?.winners ?? []).map((w) => w.ticket)); // 당첨된 번호는 내 기록의 번호 공에 테두리를 둘러 알린다
  const raffleOn = (cfg.raffle?.length ?? 0) > 0;
  // 시상 결과는 운영진이 확정한 뒤에만 보인다(확정할 때 고정한 값)
  const awards = awardsRec.confirmed ? CATEGORIES.map((c) => ({ category: c, winner: awardsRec.snapshot?.[c] ?? null })) : null;
  const showBoard = phase === "running" || phase === "closed";

  return (
    <div className="grid gap-4">
      <Hero title={block.title} cfg={cfg} phase={phase} now={now} />

      {mine?.bib != null && phase === "signup" && <BibCard title={block.title} nick={mine.nick} bib={mine.bib} compact={false} />}

      {cfg.testMode && (
        <p className="panel p-3 text-sm font-bold" style={{ background: "#fff4d6", color: "#5a4300" }}>🧪 테스트 모드 · 운영진에게만 보여요 · 단계: {PHASE_LABEL[phase]}</p>
      )}
      {showBoard && <ChallengeBoard me={nick} tabs={CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], rows: board[c].map((e) => ({ nick: e.nick, rank: e.rank, value: formatValue(c, e.value), pct: board[c][0].value > 0 ? e.value / board[c][0].value : 0 })) }))} />}

      <SignupPanel blockId={block.id} cfg={cfg} phase={phase} mine={mine} />

      {mine && phase === "running" && (
        <section className="ch-card ch-start">
          <h2 className="ch-h"><span className="flex items-center gap-2">기록 올리기 {mine.bib != null && <BibMini bib={mine.bib} />}</span> <small>{fmtMdTime(cfg.end)}까지{(cfg.maxPerDay ?? 0) > 0 ? ` · 하루 ${cfg.maxPerDay}번` : ""}</small></h2>
          <ActivityForm blockId={block.id} start={ecfg.start} end={ecfg.end} now={now} />
        </section>
      )}

      {raffle && raffle.winners.length > 0 && (
        <section className="ch-card">
          <h2 className="ch-h">경품 추첨 결과 <small>번호 {raffle.ticketCount}장 중</small></h2>
          {raffle.winners.some((w) => w.nick === nick) && <p className="ch-win-me">축하해요! {raffle.winners.filter((w) => w.nick === nick).map((w) => w.prize).join(", ")} 당첨이에요.</p>}
          <ol className="ch-draw">
            {raffle.winners.map((w, i) => (
              <li key={`${w.prize}-${w.ticket}`} style={{ ["--i" as string]: i }} data-me={w.nick === nick ? "1" : undefined}>
                <span className="ch-ball" data-c={w.ticket % 5}>{fmtTicket(w.ticket)}</span>
                <span className="grid"><span className="ch-draw-prize">{w.prize}</span><span className="ch-draw-who">{w.nick}{w.nick === nick ? " · 나" : ""}</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {mine && myActs.length > 0 && (
        <section className="grid gap-1.5">
          <h2 className="ch-h px-1"><span className="flex items-center gap-2">내 기록 {mine.bib != null && phase !== "running" && <BibMini bib={mine.bib} />}</span> <small>{myActs.length}건 · 5km 이상 {fiveTotal}회</small></h2>
          {dayGroups.map((g) => (
            <div key={g.date} className="grid gap-1.5">
              <div className="flex items-center justify-between px-1 pt-1 text-sm">
                <b>{fmtDate(g.date)}</b>
                <span className={g.five > 0 ? "chip chip-confirmed" : "text-xs text-muted"}>5km 이상 {g.five}회</span>
              </div>
              {g.acts.map((a) => <MyAct key={a.id} a={a} cfg={cfg} ecfg={ecfg} blockId={block.id} now={now} canEdit={live} won={a.ticket != null && wonTickets.has(a.ticket)} five={isFive(a)} bestCad={best.cadence === a.id} bestZ2={best.zone2 === a.id} />)}
            </div>
          ))}
        </section>
      )}

      {raffleOn && mine && <p className="ch-note px-1">기록을 올릴 때마다 행운 번호가 한 장씩 발급돼요. 마감 뒤 추첨으로 <b>{(cfg.raffle ?? []).join(" · ")}</b>의 주인공을 뽑아요.</p>}

      {awards && (
        <section className="ch-card">
          <h2 className="ch-h">시상</h2>
          <dl className="m-0">
            {awards.map((x) => (
              <div key={x.category} className="ch-win">
                <dt>{CATEGORY_LABEL[x.category]}</dt>
                <dd>{x.winner ?? "해당자 없음"}</dd>
              </div>
            ))}
          </dl>
          <p className="ch-note">1인 1상이에요. 상품은 위 순서대로 수상자가 고르고, 순위와 상품은 양도할 수 없어요.</p>
        </section>
      )}

      <RulesPanel cfg={cfg} open={phase === "soon" || phase === "signup"} />
    </div>
  );
}

/** 기록 기간 중 지금까지 지난 비율(0~1) */
function progressOf(now: string, start: string, end: string) {
  const t = (v: string) => Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)), Number(v.slice(11, 13)), Number(v.slice(14, 16)));
  const total = t(end) - t(start);
  return total > 0 ? Math.min(1, Math.max(0, (t(now) - t(start)) / total)) : 0;
}

/** 오늘(now)부터 마감일까지 남은 일수. 0이면 오늘 마감. */
function daysLeft(now: string, end: string) {
  const d = (v: string) => Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
  return Math.round((d(end) - d(now)) / 86400000);
}

function Hero({ title, cfg, phase, now }: { title: string; cfg: ChallengeConfig; phase: Phase; now: string }) {
  const left = phase === "running" ? daysLeft(now, cfg.end) : null;
  const prog = phase === "running" ? progressOf(now, cfg.start, cfg.end) : phase === "closed" ? 1 : null;
  return (
    <section className="ch-hero">
      <div className="ch-line">
        <h1 className="ch-title">{title}</h1>
        <span className="ch-period"><b>{fmtMdTime(cfg.start)}</b> ~ <b>{fmtMdTime(cfg.end)}</b>{left !== null && <span className="ch-dday"> · {left > 0 ? `종료까지 ${left}일` : "오늘 마감"}</span>}</span>
        <span className="ch-pill" data-live={phase === "running" ? "1" : undefined} data-quiet={phase === "closed" || phase === "soon" ? "1" : undefined}>{PHASE_LABEL[phase]}</span>
      </div>
      {prog !== null && (
        <div className="ch-prog" role="img" aria-label={`기간의 ${Math.round(prog * 100)}% 지났어요`} style={{ ["--p" as string]: `${Math.round(prog * 100)}%` }}><i /><b /></div>
      )}
    </section>
  );
}

/** 작은 배번표: 제목 줄 옆에 붙는 한 줄짜리 번호표 */
function BibMini({ bib }: { bib: number }) {
  return <span className="ch-bibmini" role="img" aria-label={`내 배번 ${fmtBib(bib)}`}>{fmtBib(bib)}</span>;
}

/** 내 배번표: 마라톤처럼 신청 때부터 대회가 끝날 때까지 상단에 보인다. 신청 중에는 크게, 기록 중·종료 후에는 작게. */
function BibCard({ title, nick, bib, compact }: { title: string; nick: string; bib: number; compact: boolean }) {
  return (
    <div className="ch-bibcard" data-compact={compact ? "1" : undefined} role="img" aria-label={`내 배번 ${fmtBib(bib)}`}>
      <div className="ch-bibcard-top"><span>R2U</span><span>{title}</span></div>
      <div className="ch-bibcard-no">{fmtBib(bib)}</div>
      <div className="ch-bibcard-who">{nick}</div>
    </div>
  );
}

function SignupPanel({ blockId, cfg, phase, mine }: { blockId: string; cfg: ChallengeConfig; phase: Phase; mine?: ChallengeMember }) {
  const bank = cfg.bank.bank && cfg.bank.account ? `${cfg.bank.bank} ${cfg.bank.account} (${cfg.bank.holder})` : "입금 계좌는 곧 안내해요";
  if (phase === "signup" && !mine) {
    return (
      <section className="ch-card">
        <div className="flex items-start justify-between gap-3">
          <h2 className="ch-h min-w-0 flex-wrap gap-x-2">참가 신청 <small>{fmtDateTime(cfg.signupEnd)}까지</small></h2>
          <ActionForm action={joinChallengeAction} keep alertError className="shrink-0">
            <input type="hidden" name="id" value={blockId} />
            <Submit className="btn btn-primary" pendingText="신청 중…">참가 신청하기</Submit>
          </ActionForm>
        </div>
        <p className="text-sm">회비 <b>{won(cfg.fee)}</b> · {bank}</p>
        <p className="text-sm text-[var(--bad)]">입금 후에는 신청을 취소하거나 중간에 그만두어도 회비가 환불되지 않아요.</p>
      </section>
    );
  }
  if (phase === "signup" && mine) {
    return (
      <section className="ch-card">
        <h2 className="ch-h">신청 완료 <span>{mine.paid ? <span className="chip chip-confirmed">입금 확인됨</span> : <span className="chip chip-warn">입금 확인 전</span>}</span></h2>
        {!mine.paid && <p className="text-sm">회비 <b>{won(cfg.fee)}</b>을 입금해 주세요 · {bank}</p>}
        {mine.paid && <p className="text-sm text-[var(--bad)]">입금이 확인된 뒤에는 신청을 취소해도 회비가 환불되지 않아요.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {!mine.paid && (
            <ActionForm action={claimPaidAction} keep alertError className="flex">
              <input type="hidden" name="id" value={blockId} />
              {mine.paidClaimedAt && <input type="hidden" name="undo" value="1" />}
              <Submit className={mine.paidClaimedAt ? "btn text-sm" : "btn btn-primary text-sm"}>{mine.paidClaimedAt ? "입금 완료 알림 취소" : "입금 완료"}</Submit>
            </ActionForm>
          )}
          <ActionForm action={leaveChallengeAction} keep alertError className="flex">
            <input type="hidden" name="id" value={blockId} />
            <Submit className="btn btn-danger text-sm" confirm={mine.paid ? "신청을 취소할까요? 낸 회비는 돌려받을 수 없어요." : "신청을 취소할까요?"}>{mine.paid ? "신청 취소 (환불 없음)" : "신청 취소"}</Submit>
          </ActionForm>
        </div>
        {!mine.paid && mine.paidClaimedAt && <p className="ch-note">입금했다고 알렸어요. 운영진이 확인하면 “입금 확인됨”으로 바뀌어요.</p>}
      </section>
    );
  }
  if (phase === "soon") return <section className="ch-card text-sm">{fmtDateTime(cfg.signupStart)}부터 신청을 받아요.</section>;
  if (!mine) return <section className="ch-card text-sm">신청 기간이 끝나서 이번 챌린지에는 참가할 수 없어요. 순위는 구경할 수 있어요.</section>;
  return null;
}

function MyAct({ a, ecfg, blockId, now, canEdit, won, five, bestCad, bestZ2 }: { a: Activity; cfg: ChallengeConfig; ecfg: ChallengeConfig; blockId: string; now: string; canEdit: boolean; won: boolean; five: boolean; bestCad: boolean; bestZ2: boolean }) {
  const j = judge(a, ecfg);
  // 줄 구성: 1줄 = 거리 · 시간 · 페이스(항상 한 줄), 2줄 = 부가 정보(종류·케이던스·Zone 2·장소)와 뱃지. 폭이 좁아도 같은 모양이 되도록 두 줄로 정해 둔다.
  const extra = [a.surface !== "road" ? SURFACE_LABEL[a.surface] : null, a.cadence != null ? `${a.cadence}spm` : null, a.zone2Pct != null ? `Z2 ${a.zone2Pct}%` : null, a.place].filter(Boolean).join(" · ");
  const tag = { fontSize: 10, padding: "1px 6px" } as const;
  const hasLine2 = five || bestCad || bestZ2 || !!extra;
  return (
    <details className="panel ch-act px-3 py-2">
      <summary className="cursor-pointer num">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {a.ticket != null && <span className="ch-ball ch-ball-sm" data-c={a.ticket % 5} data-hit={won ? "1" : undefined} aria-label={`행운 번호 ${fmtTicket(a.ticket)}`}>{fmtTicket(a.ticket)}</span>}
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-sm font-bold">{a.distanceKm.toFixed(2)}km · {fmtDur(a.durationSec)} · {fmtPace(j.paceSec)}/km{j.notes.length > 0 && <span className="text-[var(--bad)]"> ⚠</span>}</span>
            {hasLine2 && (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
                {five && <span className="chip chip-confirmed" style={tag}>5km 이상</span>}
                {bestCad && <span className="chip chip-open" style={tag}>케이던스 최고</span>}
                {bestZ2 && <span className="chip chip-open" style={tag}>Zone 2 최고</span>}
                {extra && <span className="min-w-0 truncate">{extra}</span>}
              </span>
            )}
          </span>
        </span>
      </summary>
      <div className="grid gap-2 pt-2">
        {j.notes.map((n) => <p key={n} className="text-xs text-[var(--bad)]">{n}</p>)}
        <CaptureGallery images={IMG_KINDS.filter((k) => a.imgs[k]).map((k) => ({ src: `/api/challenge/${blockId}/${a.id}/${k}?v=${a.updatedAt}`, alt: `${IMG_LABEL[k]} 캡처`, label: `${IMG_LABEL[k]} 캡처` }))} />
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

/** **굵게** 표시만 해석해서 보여 준다 */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t))}</>;
}

function RulesPanel({ cfg, open }: { cfg: ChallengeConfig; open: boolean }) {
  const sections = parseRules(fillRules(cfg.rulesText?.trim() ? cfg.rulesText : defaultRulesText(), cfg));
  return (
    <details className="panel p-4 rounded-[18px]" open={open}>
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
