import { currentUser, getMembers, isStaffNick } from "@/lib/hub";
import { knownMemberLabel } from "@/lib/member-label";
import { listPolls, isPollOpen, pollResult, POLL_LIMITS, type GbPoll } from "@/lib/groupbuy-poll";
import { fmtDeadline } from "@/lib/types";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import PollOptionsEditor from "@/components/poll-options-editor";
import { closeGbPoll, createGbPoll, deleteGbPoll, editGbPoll } from "@/app/actions";
import PollCard, { type PollView } from "./poll-card";

/** 공구 페이지 투표 영역: 진행 중 투표 · 지난 투표 · (운영진) 만들기/수정/마감/삭제 */
export default async function Polls() {
  const [polls, user, members] = await Promise.all([listPolls(), currentUser(), getMembers()]);
  const names = Object.fromEntries(members.map((m) => [m.nick, m.name || "없음"]));
  const isAdmin = !!user?.admin;
  const canVote = !!user && !isStaffNick(user.nick);
  const now = Date.now();

  const views = await Promise.all(polls.map(async (p) => {
    const open = isPollOpen(p, now);
    const r = await pollResult(p, user?.nick);
    const showCounts = !open || p.showLive || isAdmin;
    const view: PollView = {
      id: p.id, question: p.question, options: p.options, maxPick: p.maxPick, changeable: p.changeable, showLive: p.showLive,
      optionImages: p.options.map((_, i) => !!p.optionImages?.[i]), ver: p.ver ?? p.at,
      deadlineLabel: p.deadline ? fmtDeadline(new Date(p.deadline).toISOString()) : null, open,
      counts: showCounts ? r.counts : null, voters: r.voters, mine: r.mine,
      // 누가 어디에 투표했는지는 운영진에게만 내려보낸다 (다른 크루원 화면에는 닉네임이 전달되지 않는다)
      voterNames: isAdmin ? r.nicks.map((list) => list.map((n) => knownMemberLabel(n, names))) : null,
    };
    return { view, poll: p };
  }));
  const current = views.filter((v) => v.view.open);
  const past = views.filter((v) => !v.view.open);

  if (!isAdmin && views.length === 0) return null;

  return (
    <section className="grid gap-3">
      <h2 className="label">크루 투표</h2>
      {current.length === 0 && <div className="panel p-4 text-muted text-sm">진행 중인 투표가 없어요.</div>}
      {current.map(({ view, poll }) => (
        <div key={view.id} className="grid gap-1.5">
          <PollCard poll={view} canVote={canVote} />
          {isAdmin && <AdminBar poll={poll} />}
        </div>
      ))}
      {past.length > 0 && (
        <details className="past grid gap-3">
          <summary className="label flex items-center gap-1.5 py-1">
            <span className="past-caret inline-block transition-transform">▸</span> 지난 투표 {past.length}개
          </summary>
          <div className="grid gap-3 mt-3 opacity-80">
            {past.map(({ view, poll }) => (
              <div key={view.id} className="grid gap-1.5">
                <PollCard poll={view} canVote={false} />
                {isAdmin && <AdminBar poll={poll} />}
              </div>
            ))}
          </div>
        </details>
      )}
      {isAdmin && (
        <details className="panel p-3.5">
          <summary className="font-bold text-sm cursor-pointer min-h-[44px] flex items-center">+ 새 투표 만들기 (운영진)</summary>
          <ActionForm action={createGbPoll} collapse className="grid gap-3 mt-3">
            <PollFields />
            <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="push" defaultChecked /> 알림도 보내기 (전체 크루원)</label>
            <Submit>투표 만들기</Submit>
          </ActionForm>
        </details>
      )}
    </section>
  );
}

/** 마감 시각을 <input type="datetime-local"> 값(한국 시각)으로 */
const kstInput = (ms: number) => (ms ? new Date(ms + 9 * 3600_000).toISOString().slice(0, 16) : "");

/** 만들기·수정 폼이 함께 쓰는 입력칸 (poll이 있으면 그 값으로 채운다) */
function PollFields({ poll }: { poll?: GbPoll }) {
  return (
    <>
      <input name="question" className="input" placeholder="투표 질문" maxLength={POLL_LIMITS.question} defaultValue={poll?.question} required />
      <PollOptionsEditor
        min={POLL_LIMITS.minOptions} max={POLL_LIMITS.maxOptions} maxChars={POLL_LIMITS.option} maxBytes={POLL_LIMITS.imageBytes}
        initial={poll?.options.map((text, i) => ({ text, imageSrc: poll.optionImages?.[i] ? `/api/gb-poll-image/${poll.id}/${i}?v=${poll.ver ?? poll.at}` : undefined }))}
      />
      <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="multi" value="1" defaultChecked={!!poll && poll.maxPick > 1} /> 복수 선택 허용</label>
      <label className="flex items-center gap-2 text-sm">최대 선택 개수 (복수 선택일 때)
        <input type="number" name="maxPick" min={2} max={POLL_LIMITS.maxOptions} defaultValue={poll && poll.maxPick > 1 ? poll.maxPick : 2} className="input w-20" />
      </label>
      <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="changeable" value="1" defaultChecked={poll ? poll.changeable : true} /> 마감 전 투표 변경 가능</label>
      <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="showLive" value="1" defaultChecked={poll ? poll.showLive : true} /> 마감 전에도 결과 공개</label>
      <label className="grid gap-1 text-sm">마감 시각 (비우면 운영진이 직접 마감)
        <input type="datetime-local" name="deadline" className="input" defaultValue={kstInput(poll?.deadline ?? 0)} />
      </label>
    </>
  );
}

function AdminBar({ poll }: { poll: GbPoll }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-end gap-2">
        <form action={closeGbPoll}>
          <input type="hidden" name="id" value={poll.id} />
          <input type="hidden" name="closed" value={poll.closed ? "0" : "1"} />
          <button className="btn btn-ghost text-sm py-1.5 px-2.5">{poll.closed ? "다시 열기" : "지금 마감"}</button>
        </form>
        <form action={deleteGbPoll}>
          <input type="hidden" name="id" value={poll.id} />
          <ConfirmButton message={"이 투표와 모든 응답을 삭제할까요?\n되돌릴 수 없어요."}>삭제</ConfirmButton>
        </form>
      </div>
      {/* key: 저장하면 최신 내용으로 입력칸을 다시 채운다 */}
      <details className="panel p-3.5" key={poll.ver ?? poll.at}>
        <summary className="font-bold text-sm cursor-pointer min-h-[44px] flex items-center">투표 수정</summary>
        <ActionForm action={editGbPoll} keep collapse className="grid gap-3 mt-3">
          <input type="hidden" name="id" value={poll.id} />
          <PollFields poll={poll} />
          <Submit confirm="투표 내용을 수정할까요? 이미 한 투표는 그대로 유지돼요.">수정 저장</Submit>
        </ActionForm>
      </details>
    </div>
  );
}
