import { redirect } from "next/navigation";
import { eventOpen } from "@/lib/event";
import { currentUser, hasEventPreview, redis } from "@/lib/hub";
import { EVENT_NICKS_KEY } from "@/lib/sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "이벤트" };

// 오픈일(또는 운영진 미리보기)에는 메뉴 아래에 이벤트 화면을 끼워 보여 주고, 그 전에는 안내 문구만 보여 준다.
export default async function EventPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  if (await hasEventPreview()) return <Frame staff={!!(await searchParams).staff} />;
  // 운영진은 오픈 전이든 참가자가 아니든 항상 볼 수 있다. 오픈 전이면 미리보기 허용 주소를 거쳐 다시 돌아온다.
  if ((await currentUser())?.admin) {
    if (!(await eventOpen())) redirect("/api/event/preview");
    return <Frame staff={!!(await searchParams).staff} />;
  }
  if (await eventOpen()) {
    // 이벤트 참가자 명단(회원 시트 D열)에 없는 크루원은 안내 문구만 본다. 명단이 비어 있거나 운영진이면 그대로 보여 준다.
    const u = await currentUser();
    const raw = await redis.get<string[] | string>(EVENT_NICKS_KEY);
    const nicks: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
    const joined = !nicks.length || !!u?.admin || nicks.some((n) => n.trim().toLowerCase() === (u?.nick ?? "").trim().toLowerCase());
    if (!joined) return <Message emoji="🏃" title="11월 이벤트에 참가하지 않으셨습니다." sub="이번 R2U 5×5 미션 빙고는 신청한 크루원만 참여할 수 있어요. 다음 이벤트에서 함께 달려요!" />;
    return <Frame staff={!!(await searchParams).staff} />;
  }
  return <Message emoji="🎁" title="11월 이벤트 기대해주세요" sub="달리는 25가지 즐거움, R2U 5×5 미션 빙고가 곧 열려요." soon />;
}

function Frame({ staff: isStaff }: { staff: boolean }) {
  return <iframe className="event-frame" src={`/bingo${isStaff ? "?staff=1" : ""}`} title="이벤트" allow="camera; clipboard-write" />;
}

// 이벤트 화면과 같은 초록 판·나무 간판 분위기의 안내 화면. 뒤에 흐릿한 빙고판을 깔아 둔다.
function Message({ emoji, title, sub, soon }: { emoji: string; title: string; sub: string; soon?: boolean }) {
  return (
    <main className="event-stage">
      <div className="event-ghost" aria-hidden>{Array.from({ length: 25 }, (_, i) => <i key={i} />)}</div>
      <section className="event-note">
        <div className="event-emoji" aria-hidden>{emoji}</div>
        <p className="event-kicker"><span>R2U</span> 5×5 미션 <b>빙고</b></p>
        <h1>{title}</h1>
        <p className="event-sub">{sub}</p>
        {soon && <p className="event-chip">🏁 곧 오픈</p>}
      </section>
    </main>
  );
}
