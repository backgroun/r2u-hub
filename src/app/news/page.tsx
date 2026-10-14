import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/hub";
import { NEWS_CATEGORIES, lastNewsLog, listNews, newsConfigured, timeAgo } from "@/lib/news";
import { collectNewsNow, hideNews, pinNews } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "러닝 뉴스" };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login?next=/news");
  const { c } = await searchParams;
  const cat = NEWS_CATEGORIES.find((x) => x.code === c)?.code;
  const [items, log] = await Promise.all([listNews({ category: cat }), u.admin ? lastNewsLog() : Promise.resolve(null)]);
  const now = Date.now();

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/" className="text-sm text-muted">← 홈으로</Link>
        <h1 className="hub-h1">러닝 뉴스</h1>
        <p className="text-sm text-muted">마라톤·러닝 소식을 2시간마다 모아요. 제목을 누르면 원문 기사로 이동해요.</p>
      </header>

      <nav className="news-tabs" aria-label="뉴스 분류">
        <Link href="/news" className={!cat ? "on" : undefined}>전체</Link>
        {NEWS_CATEGORIES.map((x) => <Link key={x.code} href={`/news?c=${x.code}`} className={cat === x.code ? "on" : undefined}>{x.label}</Link>)}
      </nav>

      {u.admin && (
        <ActionForm action={collectNewsNow} className="panel p-3 grid gap-2" keep>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {!newsConfigured() ? "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수를 넣어야 수집돼요." : log ? `마지막 수집 ${timeAgo(log.at, now)} · 새 기사 ${log.saved}건${log.error ? ` · 오류 ${log.error}` : ""}` : "아직 수집한 적이 없어요."}
            </span>
            <Submit>지금 수집</Submit>
          </div>
          {log && log.unknownDomains.length > 0 && <p className="text-xs text-muted">언론사 이름이 없는 도메인: {log.unknownDomains.join(", ")}</p>}
        </ActionForm>
      )}

      <section className="grid gap-3">
        {items.length === 0 && <p className="py-6 text-sm text-muted text-center">아직 모인 뉴스가 없어요.</p>}
        {items.map((n) => {
          const label = NEWS_CATEGORIES.find((x) => x.code === n.category)?.label;
          return (
            <article key={n.id} className="panel p-4 grid gap-1.5">
              <span className="text-xs text-muted">{n.pinned ? "📌 " : ""}{label}</span>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-bold leading-snug">{n.title}</a>
              <span className="text-xs text-muted">{n.press} · {timeAgo(n.at, now)}{n.dup > 0 ? ` · 외 ${n.dup}곳 보도` : ""}</span>
              {n.summary && <p className="text-sm text-muted">{n.summary}</p>}
              {u.admin && (
                <div className="flex gap-3 pt-1 text-xs">
                  <form action={pinNews}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="pinned" value={n.pinned ? "0" : "1"} /><button className="underline text-muted">{n.pinned ? "고정 해제" : "상단 고정"}</button></form>
                  <form action={hideNews}><input type="hidden" name="id" value={n.id} /><button className="underline text-muted">숨기기</button></form>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <p className="text-xs text-muted text-center">기사 제목·요약은 각 언론사의 정보를 링크한 것으로, 저작권은 해당 언론사에 있습니다.</p>
    </main>
  );
}
