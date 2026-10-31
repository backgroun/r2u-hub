import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, getMember, isStaffNick } from "@/lib/hub";
import { bingoMemberReport } from "@/lib/bingo-admin";
import BingoReviewCard from "@/components/bingo-review-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "인증 리포트" };

// 이벤트 명단에서 크루원을 누르면 오는 화면: 그 사람의 빙고 인증을 날짜별로 보고, 잘못된 인증에 댓글을 단다 (운영진만)
export default async function BingoMemberReport({ params }: { params: Promise<{ nick: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin?tab=bingo");
  if (!user.admin) redirect("/");
  const nick = decodeURIComponent((await params).nick);
  const member = await getMember(nick);
  if (!member || isStaffNick(nick)) notFound();

  const rep = await bingoMemberReport(nick);
  const missionOf = new Map(rep.missions.map((m) => [m.no, m]));
  const days = new Map<string, typeof rep.records>();
  for (const r of rep.records) days.set(r.d, [...(days.get(r.d) ?? []), r]);

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/admin?tab=bingo" className="text-sm text-muted">← 이벤트 명단으로</Link>
        <h1 className="hub-h1">{member.nick}/{member.name?.trim() || "없음"} 님의 인증 리포트</h1>
        <p className="text-sm text-muted">인증 {rep.records.length}칸 · 빙고 {rep.lines}줄 · 사진 {rep.photos}장{rep.comments ? ` · 운영진 댓글 ${rep.comments}개` : ""}</p>
      </header>
      {rep.records.length === 0 ? (
        <section className="panel p-4"><p className="text-sm text-muted">아직 인증한 기록이 없어요.</p></section>
      ) : (
        [...days.entries()].map(([d, list]) => (
          <section key={d} className="panel p-4 grid gap-3">
            <h2 className="font-bold">{Number(d.slice(5, 7))}월 {Number(d.slice(8))}일 <span className="text-sm text-muted font-normal">· {list.length}건</span></h2>
            {list.map((r) => <BingoReviewCard key={`${r.n}|${r.no}`} r={r} mission={missionOf.get(r.no)} name={member.name?.trim()} />)}
          </section>
        ))
      )}
    </main>
  );
}
