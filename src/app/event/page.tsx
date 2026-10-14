import { redirect } from "next/navigation";
import { eventOpen, eventStart } from "@/lib/event";
import { currentUser, hasEventPreview } from "@/lib/hub";
import { displayBlock, getRoster, isJoined, pollResult, type EventBlock } from "@/lib/event-blocks";
import { ActionForm, Submit } from "@/components/action-form";
import EventEditToggle from "@/components/event-edit-toggle";
import { joinEvent, leaveEvent, voteEvent } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "이벤트" };

// 운영진이 이번 달 본문에 세팅한 이벤트 블록을 보여 준다. 블록 종류(빙고·투표…)마다 화면이 다르다.
export default async function EventPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const u = await currentUser();
  const block = await displayBlock();
  // 운영진은 위에 작은 바가 붙는다: 블록 바꾸기 · 참가 신청 · 이벤트 설정으로 가기
  const bar = u?.admin ? await AdminBar({ block, nick: u.nick }) : null;
  if (!block) return <>{bar}<Message emoji="🎁" title="이벤트 기대해주세요" sub="새로운 이벤트가 곧 열려요." soon /></>;
  if (block.type === "poll") return <>{bar}<Poll block={block} nick={u?.nick} /></>;

  // 빙고
  const staff = !!(await searchParams).staff;
  if (await hasEventPreview()) return <Shell bar={bar} me={u?.nick}><Frame staff={staff} /></Shell>;
  // 운영진은 오픈 전이든 참가 신청 전이든 항상 볼 수 있다. 오픈 전이면 미리보기 허용 주소를 거쳐 다시 돌아온다.
  if (u?.admin) {
    if (!(await eventOpen())) redirect("/api/event/preview");
    return <Shell bar={bar} me={u?.nick}><Frame staff={staff} /></Shell>;
  }
  const joined = isJoined(await getRoster(), u?.nick);
  const open = await eventOpen();
  const start = await eventStart();
  if (joined && open) return <Frame staff={staff} />;
  // 신청 전·오픈 전에는 실제 빙고판을 그대로 보여 주고(칸은 눌러도 인증되지 않는다), 위에서 신청한다
  const soon = `${Number(start.slice(5, 7))}월 ${Number(start.slice(8))}일에 열려요`;
  return (
    <Shell me={u?.nick} bar={<JoinBar joined={joined} open={open} soon={soon} />}>
      <Frame staff={false} preview joined={joined} />
    </Shell>
  );
}

// 크루원용 신청 바: 빙고판을 보면서 참가 신청/취소
function JoinBar({ joined, open, soon }: { joined: boolean; open: boolean; soon: string }) {
  return (
    <div className="event-join-bar">
      <div className="event-join-text">
        {joined
          ? <><b>✅ 참가 신청 완료</b><small>{soon}. 오픈하면 바로 시작할 수 있어요.</small></>
          : <><b>이벤트에 참가하시겠어요?</b><small>{open ? "신청하면 바로 시작할 수 있어요." : `${soon}. 미리 신청해 두세요!`}</small></>}
      </div>
      <ActionForm action={joined ? leaveEvent : joinEvent} keep alertError className="shrink-0">
        <Submit className={`btn ${joined ? "" : "btn-primary"}`}>{joined ? "신청 취소" : "참가 신청하기"}</Submit>
      </ActionForm>
    </div>
  );
}

// 운영진 바: 지금 세팅된 이벤트를 보여 주고, 본인 참가 신청/취소, 빙고판 수정 모드, 이벤트 관리로 이동한다.
async function AdminBar({ block, nick }: { block: EventBlock | null; nick: string }) {
  const joined = isJoined(await getRoster(), nick);
  return (
    <div className="event-admin-bar">
      <div className="event-admin-title"><b>{block ? `${Number(block.ym.slice(5))}월 ` : ""}이벤트 신청 및 설정</b></div>
      <div className="event-admin-actions">
        {block?.type === "bingo" && (
          <ActionForm action={joined ? leaveEvent : joinEvent} keep alertError className="event-admin-join">
            <Submit className={`btn ${joined ? "btn-ghost" : "btn-primary"}`}>{joined ? "✓ 신청함" : "✋ 참가 신청"}</Submit>
          </ActionForm>
        )}
        {block?.type === "bingo" && <EventEditToggle />}
        <a href="/admin?tab=bingo" className="btn btn-ghost">⚙ 관리</a>
      </div>
    </div>
  );
}

// 운영진 바(있으면)와 빙고 화면을 세로로 쌓고, 빙고는 남는 높이를 채운다
async function Shell({ bar, children, me }: { bar: React.ReactNode; children: React.ReactNode; me?: string | null }) {
  const roster = await getRoster();
  return (
    <div className="event-shell">
      {bar}
      {children}
      <section className="event-roster" aria-label="참가 신청한 사람들">
        <h2>참가 신청 <span className="num">{roster.length}</span>명</h2>
        {roster.length === 0 ? <p className="event-roster-empty">아직 신청한 사람이 없어요.</p> : (
          <ul>{roster.map((n) => <li key={n} className={isJoined([n], me) ? "me" : ""}>{n}</li>)}</ul>
        )}
      </section>
    </div>
  );
}

function Frame({ staff: isStaff, preview = false, joined = false }: { staff: boolean; preview?: boolean; joined?: boolean }) {
  return <iframe className="event-frame" src={`/bingo${preview ? `?preview=1${joined ? "&joined=1" : ""}` : isStaff ? "?staff=1" : ""}`} title="이벤트" allow="camera; clipboard-write" />;
}

// 초록 판·나무 간판 분위기의 안내 화면. 뒤에 흐릿한 빙고판을 깔아 둔다.
function Message({ emoji, title, sub, soon, kicker, children }: { emoji: string; title: string; sub: string; soon?: boolean; kicker?: string; children?: React.ReactNode }) {
  return (
    <main className="event-stage">
      <div className="event-ghost" aria-hidden>{Array.from({ length: 25 }, (_, i) => <i key={i} />)}</div>
      <section className="event-note">
        <div className="event-emoji" aria-hidden>{emoji}</div>
        {kicker && <p className="event-kicker">{kicker}</p>}
        <h1>{title}</h1>
        <p className="event-sub">{sub}</p>
        {soon && <p className="event-chip">🏁 곧 오픈</p>}
        {children}
      </section>
    </main>
  );
}

// 투표·설문: 투표한 뒤에 결과(득표 수)가 보인다. 마감 전에는 다시 골라 바꿀 수 있다.
async function Poll({ block, nick }: { block: EventBlock; nick?: string | null }) {
  const options = block.poll?.options ?? [];
  const r = await pollResult(block, nick);
  const voted = r.mine !== null;
  return (
    <main className="hub-wrap">
      <section className="panel p-4 grid gap-3">
        <p className="text-xs text-muted">{block.title}</p>
        <h1 className="text-lg font-bold">{block.poll?.question}</h1>
        <ActionForm action={voteEvent} keep className="grid gap-2">
          <input type="hidden" name="id" value={block.id} />
          {options.map((o, i) => {
            const pct = r.total ? Math.round((r.counts[i] / r.total) * 100) : 0;
            return (
              <label key={i} className="panel p-3 grid gap-1.5 cursor-pointer" style={{ background: "var(--paper)" }}>
                <span className="flex items-center gap-2.5">
                  <input type="radio" name="option" value={i} defaultChecked={r.mine === i} required />
                  <span className="font-bold">{o}</span>
                  {voted && <span className="ml-auto text-sm text-muted">{r.counts[i]}표 · {pct}%</span>}
                </span>
                {voted && <span className="track"><span style={{ width: `${pct}%` }} /></span>}
              </label>
            );
          })}
          <div className="flex items-center justify-between gap-2">
            <Submit>{voted ? "다시 투표" : "투표하기"}</Submit>
            <span className="text-xs text-muted">{voted ? `${r.total}명 참여` : "투표하면 결과가 보여요"}</span>
          </div>
        </ActionForm>
      </section>
    </main>
  );
}
