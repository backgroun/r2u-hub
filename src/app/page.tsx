import Link from "next/link";
import { CrownIcon, GearIcon } from "@/components/crown";
import { redirect } from "next/navigation";
import { currentUser, getMember, getMembers, isStaffAccount, fmtRaceDate, getLinks, getMonth, getRaces, kstNow, kstToday, memberLabel, regInfo } from "@/lib/hub";
import { knownMemberLabel } from "@/lib/member-label";
import PushToggle from "@/components/push-toggle";
import { getNotices, noticeState } from "@/lib/notice";
import { rankMonth, ymOf } from "@/lib/rank";
import { greeting } from "@/lib/greeting";
import { listNews, timeAgo } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  if (!u) redirect("/login");
  const today = kstToday();
  const ym = ymOf(today);
  const [races, month, links, member, members] = await Promise.all([getRaces(), getMonth(ym), getLinks(), getMember(u.nick), getMembers()]);
  const names = Object.fromEntries(members.map((entry) => [entry.nick, entry.name || "없음"]));
  const news = await listNews({ limit: 3 }).catch(() => []);
  const notice = (await getNotices()).find((n) => noticeState(n, today) === "live");
  const upcoming = races.filter((r) => r.date >= today).slice(0, 4);
  // 접수 마감 전인 대회: 접수중 먼저(마감 임박 순), 그다음 접수예정(시작 순)
  const now = kstNow();
  const regs = races
    .filter((r) => (r.regStart || r.regEnd) && regInfo(r, now).status !== "closed")
    .sort((a, b) => {
      const sa = regInfo(a, now).status, sb = regInfo(b, now).status;
      if (sa !== sb) return sa === "open" ? -1 : 1;
      return sa === "open" ? (a.regEnd ?? "9").localeCompare(b.regEnd ?? "9") : (a.regStart ?? "").localeCompare(b.regStart ?? "");
    })
    .slice(0, 4);
  const mine = rankMonth(month).find((r) => r.nick === u.nick);
  const pct = mine?.rate ?? 0;
  const myNextRace = races.filter((r) => r.date >= today && r.participants.some((p) => p.nick === u.nick)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const closingRace = races.filter((r) => r.date >= today && r.regEnd && regInfo(r, now).status === "open").sort((a, b) => (a.regEnd ?? "").localeCompare(b.regEnd ?? ""))[0];

  return (
    <main className="hub-wrap">
      <header className="flex items-center justify-between gap-4 pt-2">
        <div className="min-w-0">
          <h1 className="hub-h1 hub-greeting flex items-center gap-2.5">
            {member?.manager ? <GearIcon size={20} /> : u.admin && !isStaffAccount(u) ? <CrownIcon size={20} /> : null}
            <span className="min-w-0 truncate">{greeting(memberLabel(member ?? u))}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <PushToggle compact />
          <span className="logo-mark hub-logo shrink-0" role="img" aria-label="R2U Run To Ulsan" />
        </div>
      </header>

      <section className={`panel ${notice ? "panel-alert p-4" : "px-4 py-2.5"}`}>
        {/* 새 공지가 있으면 펼친 채로, 없으면 접어서 보여 준다 */}
        <details open={!!notice} className="notice-fold">
          <summary className="sec-head"><h2 className="label">📢 공지</h2><Link href="/notices">공지 전체 보기 →</Link></summary>
          <div className="grid gap-1.5 pt-2.5">
            {notice ? <>
              <h2 className="font-bold">{notice.title}</h2>
              {notice.body && <p className="text-sm whitespace-pre-wrap">{notice.body}</p>}
              {notice.image && (
                // Uploaded notices have different aspect ratios; keep the original ratio.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/notices/${notice.id}/image`} alt={`${notice.title} 공지 이미지`} className="w-full h-auto rounded-lg" />
              )}
              <p className="text-xs text-muted">{new Date(notice.at + 9 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} · {knownMemberLabel(notice.by, names)}</p>
            </> : null}
          </div>
        </details>
      </section>

      {!isStaffAccount(u) && <section className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Link href={myNextRace ? `/races#${myNextRace.id}` : "/races"} className="panel p-3 grid gap-1 hover:border-[var(--lane)]">
            <span className="text-xs text-muted">내 다음 대회</span>
            <b className="leading-snug">{myNextRace?.name ?? "참가할 대회 찾기"}</b>
            <span className="text-xs text-muted">{myNextRace ? `${fmtRaceDate(myNextRace.date).md} · ${myNextRace.participants.find((p) => p.nick === u.nick)?.course || "코스 미정"}` : "대회 일정 보기"} →</span>
          </Link>
          <Link href={closingRace ? `/races#${closingRace.id}` : "/races?view=reg"} className="panel p-3 grid gap-1 hover:border-[var(--lane)]">
            <span className="text-xs text-muted">가장 가까운 접수 마감</span>
            <b className="leading-snug">{closingRace?.name ?? "접수 일정 보기"}</b>
            <span className="text-xs text-muted">{closingRace?.regEnd ? `${closingRace.regEnd.slice(5).replace("-", "/").replace("T", " ")} 마감` : "예정된 접수 마감 없음"} →</span>
          </Link>
        </div>
      </section>}

      {!isStaffAccount(u) && (
      <section className="panel p-4 grid gap-2.5">
        <div className="sec-head">
          <h2 className="label">{Number(ym.slice(5))}월 기록 및 목표</h2>
          <Link href="/monthly">기록하기 →</Link>
        </div>
        {mine?.goal ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="num text-3xl font-bold">{mine.km}<span className="text-base text-muted"> / {mine.goal}km</span></span>
              <span className="num text-xl font-bold" style={{ color: pct >= 100 ? "var(--good)" : "var(--lane)" }}>{pct}%</span>
            </div>
            <div className={`track ${pct >= 100 ? "done" : ""}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p className="text-sm text-muted">
              달성율 {mine.rateRank ? `${mine.rateRank}위` : "순위 없음"} · 거리 {mine.kmRank ? `${mine.kmRank}위` : "순위 없음"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">이번 달 목표를 아직 정하지 않았어요. 월간 기록에서 목표 거리를 정해 보세요.</p>
        )}
      </section>
      )}

      <section className="grid gap-2">
        <div className="sec-head">
          <h2 className="label">다가오는 접수 일정</h2>
          <Link href="/races?view=reg">접수 일정 전체 →</Link>
        </div>
        <div className="row-list">
          {regs.length === 0 && <p className="py-4 text-sm text-muted">예정된 접수 일정이 없어요. 대회에 접수 시작·마감을 넣으면 여기에 보여요.</p>}
          {regs.map((r) => {
            const g = regInfo(r, now);
            return (
              <Link key={r.id} href={`/races#${r.id}`} className="flex items-center gap-3 py-3 px-1 hover:bg-[var(--card)]">
                <span className={`chip shrink-0 ${g.status === "open" ? "chip-open" : "chip-warn"}`}>{g.status === "open" ? "접수중" : "접수예정"}</span>
                <span className="min-w-0 grid">
                  <span className="font-bold truncate">{r.name}</span>
                  <span className="text-sm text-muted truncate">접수 {g.text}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {news.length > 0 && (
        <section className="grid gap-2">
          <div className="sec-head">
            <h2 className="label">오늘의 러닝 뉴스</h2>
            <Link href="/news">더보기 →</Link>
          </div>
          <div className="row-list">
            {news.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="grid gap-0.5 py-3 px-1 hover:bg-[var(--card)]">
                <span className="font-bold leading-snug">{n.title}</span>
                <span className="text-xs text-muted">{n.press} · {timeAgo(n.at)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <div className="sec-head">
          <h2 className="label">다가오는 대회</h2>
          <Link href="/races">전체 일정 →</Link>
        </div>
        <div className="row-list">
          {upcoming.length === 0 && <p className="py-4 text-sm text-muted">예정된 대회가 없어요.</p>}
          {upcoming.map((r) => {
            const d = fmtRaceDate(r.date);
            const me = r.participants.find((p) => p.nick === u.nick);
            return (
              <Link key={r.id} href={`/races#${r.id}`} className="flex items-center gap-3 py-3 px-1 hover:bg-[var(--card)]">
                <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
                <span className="min-w-0 grid">
                  <span className="font-bold truncate">{r.name}</span>
                  <span className="text-sm text-muted truncate">{r.time ? `${r.time} 출발 · ` : ""}{r.place || "장소 미정"} · 크루 {r.participants.length}명</span>
                </span>
                {me && <span className="chip chip-confirmed ml-auto shrink-0">크루 참가 {me.course}</span>}
              </Link>
            );
          })}
        </div>
      </section>

      {links.length > 0 && (
        <section className="grid gap-2">
          <h2 className="label">바로가기</h2>
          <div className="grid grid-cols-2 gap-2">
            {links.map((l) => <Row key={l.id} title={l.title} desc={l.desc} tag={l.tag} url={l.url} />)}
          </div>
        </section>
      )}
    </main>
  );
}

function Row({ title, desc, tag, url }: { title: string; desc: string; tag: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="panel p-3 flex items-center justify-between gap-2 hover:border-[var(--lane)]">
      <span className="min-w-0 grid gap-0.5">
        <span className="text-xs text-muted truncate">{tag}</span>
        <span className="font-bold leading-snug truncate">{title}</span>
        {desc && <span className="text-xs text-muted truncate">{desc}</span>}
      </span>
      <span className="text-muted shrink-0" aria-hidden>↗</span>
    </a>
  );
}
