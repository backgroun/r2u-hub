import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, kstToday } from "@/lib/hub";
import NoticeMedia from "@/components/notice-media";
import { getNotices, noticeState, type Notice } from "@/lib/notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "공지 전체 보기" };

const postedDate = (at: number) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
}).format(at);

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n: openId } = await searchParams;
  const u = await currentUser();
  if (!u) redirect("/login?next=/notices");
  const today = kstToday();
  const visible = (await getNotices()).filter((n) => noticeState(n, today) !== "scheduled");
  const featured = visible.find((n) => noticeState(n, today) === "live");
  const previous = visible.filter((n) => n.id !== featured?.id);

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/" className="text-sm text-muted">← 홈으로</Link>
        <h1 className="hub-h1">공지 전체 보기</h1>
        <p className="text-sm text-muted">홈에 보이는 공지와 이전 안내를 확인할 수 있어요.</p>
      </header>

      <section className="grid gap-2">
        <h2 className="label">홈에 표시 중인 공지</h2>
        {featured ? <NoticeCard notice={featured} open={featured.id === openId} /> : <p className="text-sm text-muted">현재 안내 중인 공지가 없어요.</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="label">이전 공지 {previous.length}</h2>
        {previous.length ? previous.map((n) => <NoticeCard key={n.id} notice={n} open={n.id === openId} />) : <p className="text-sm text-muted">이전 공지가 없어요.</p>}
      </section>
    </main>
  );
}

function NoticeCard({ notice: n, open }: { notice: Notice; open?: boolean }) {
  return (
    <details id={`n-${n.id}`} open={open} className="panel p-4 scroll-mt-16">
      <summary className="font-bold cursor-pointer">
        <span className="grid gap-1 min-w-0">
          <span>{n.title}</span>
          <span className="text-xs text-muted font-normal">{postedDate(n.at)} · {n.by}</span>
        </span>
      </summary>
      <div className="grid gap-3 mt-3">
        {n.body && <p className="text-sm whitespace-pre-wrap">{n.body}</p>}
        <NoticeMedia notice={n} />
      </div>
    </details>
  );
}
