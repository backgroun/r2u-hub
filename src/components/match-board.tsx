import { getAllVs, getMembers, getMonth, kstToday } from "@/lib/hub";
import { getVsRequests, getVsTally } from "@/lib/versus";
import { rankMonth } from "@/lib/rank";
import { acceptVersus, cancelVersusRequest, declineVersus, voteVersus } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 매치 현황: 지금 진행 중인 1:1 대결, 나에게 온/내가 보낸 신청, 응원 투표. 이번 달에만 보인다.
 *  mineOnly(홈): 나에게 온·내가 보낸 신청과 내 대결만 보여 준다. */
export default async function MatchBoard({ ym, viewer, mineOnly = false }: { ym: string; viewer: string; mineOnly?: boolean }) {
  if (ym !== kstToday().slice(0, 7)) return null;
  const [pairsMap, reqs, month, members] = await Promise.all([getAllVs(ym), getVsRequests(ym), getMonth(ym), getMembers()]);
  const seen = new Set<string>();
  const pairs = Object.entries(pairsMap).filter(([a, b]) => {
    if (seen.has(a) || seen.has(b)) return false;
    seen.add(a); seen.add(b);
    return !mineOnly || a === viewer || b === viewer;
  });
  const incoming = Object.entries(reqs).filter(([, to]) => to === viewer).map(([from]) => from);
  const outgoing = reqs[viewer] ?? null;
  if (pairs.length === 0 && incoming.length === 0 && !outgoing) return null;

  const names = Object.fromEntries(members.map((m) => [m.nick, m.name || "없음"]));
  const km = Object.fromEntries(rankMonth(month).map((r) => [r.nick, r.km]));
  const label = (n: string) => `${n}/${names[n] || "없음"}`;
  const tallies = await Promise.all(pairs.map(([a, b]) => getVsTally(ym, a, b, viewer)));

  return (
    <section className="panel match-board" aria-label="매치 현황">
      <h2 className="match-title">⚔️ {mineOnly ? "내 매치" : "매치 현황"}{!mineOnly && pairs.length > 0 && <span className="num"> {pairs.length}</span>}</h2>

      {incoming.map((from) => (
        <div key={from} className="match-req">
          <p><b>{label(from)}</b>님이 대결을 신청했어요!</p>
          <div className="match-req-btns">
            <ActionForm action={acceptVersus} keep><input type="hidden" name="ym" value={ym} /><input type="hidden" name="from" value={from} /><Submit className="btn btn-primary text-sm">받아주기</Submit></ActionForm>
            <ActionForm action={declineVersus} keep><input type="hidden" name="ym" value={ym} /><input type="hidden" name="from" value={from} /><Submit className="btn btn-ghost text-sm">거절</Submit></ActionForm>
          </div>
        </div>
      ))}
      {outgoing && (
        <div className="match-req">
          <p><b>{label(outgoing)}</b>님에게 신청 중 · 받아주면 매치가 시작돼요</p>
          <ActionForm action={cancelVersusRequest} keep><input type="hidden" name="ym" value={ym} /><Submit className="btn btn-ghost text-sm">신청 취소</Submit></ActionForm>
        </div>
      )}

      {pairs.map(([a, b], i) => {
        const t = tallies[i];
        const total = t.a + t.b;
        const pa = total ? Math.round((t.a / total) * 100) : 50;
        const kmA = r1(km[a] ?? 0), kmB = r1(km[b] ?? 0);
        const mine = viewer === a || viewer === b;
        return (
          <article key={`${a}|${b}`} className="match-card">
            <div className="match-head">
              <b className={`truncate ${kmA > kmB ? "win" : ""}`}>{a}</b>
              <span className="vs-x">VS</span>
              <b className={`truncate text-right ${kmB > kmA ? "win" : ""}`}>{b}</b>
            </div>
            <div className="match-km num"><span>{kmA}km</span><span className="text-muted">이번 달 거리</span><span>{kmB}km</span></div>
            <div className="match-vote-bar" aria-hidden><span style={{ width: `${pa}%` }} /></div>
            <div className="match-vote">
              {[[a, t.a], [b, t.b]].map(([n, c]) => (
                mine ? (
                  <span key={n as string} className="match-vote-count">{n} {c}표</span>
                ) : (
                  <ActionForm key={n as string} action={voteVersus} keep>
                    <input type="hidden" name="ym" value={ym} /><input type="hidden" name="a" value={a} /><input type="hidden" name="b" value={b} /><input type="hidden" name="pick" value={n as string} />
                    <Submit className={`btn text-sm ${t.mine === n ? "btn-primary" : ""}`}>{t.mine === n ? "✓ " : ""}{n} 응원 · {c}표</Submit>
                  </ActionForm>
                )
              ))}
            </div>
            <p className="text-xs text-muted">{mine ? "내 대결이에요. 다른 크루원들이 투표해요." : t.mine ? "투표했어요. 마감 전에는 바꿀 수 있어요." : "누가 이길지 투표해 보세요!"}</p>
          </article>
        );
      })}
    </section>
  );
}
