import { redirect } from "next/navigation";
import { currentUser } from "@/lib/hub";
import { eventHidden } from "@/lib/event";
import { activeChallenge } from "@/lib/event-blocks";
import ChallengeView from "@/components/challenge/challenge-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "기록 챌린지" };

export default async function ChallengePage() {
  const u = await currentUser();
  if (!u) redirect("/login");
  const block = await activeChallenge(undefined, { staff: u.realAdmin ?? u.admin });
  // 운영진이 이벤트를 숨겨 둔 동안에는 크루원이 직접 주소로 들어와도 이벤트 탭의 안내 화면으로 보낸다
  if (!block || (!u.admin && (await eventHidden()))) redirect("/event");
  return <main className="hub-wrap"><ChallengeView block={block} nick={u.nick} staff={u.admin} /></main>;
}
