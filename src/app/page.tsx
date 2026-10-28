import Link from "next/link";
import { LevelBadge, CrownIcon, GearIcon } from "@/components/crown";
import { redirect } from "next/navigation";
import { currentUser, getMember, getMembers, getRaceRecs, isStaffAccount, fmtRaceDate, getLinks, getMonth, getRaces, fmtDtKo, kstNow, kstToday, memberLabel, regInfo } from "@/lib/hub";
import { knownMemberLabel } from "@/lib/member-label";
import NoticeMedia from "@/components/notice-media";
import HomeNotices from "@/components/home-notice";
import PushToggle from "@/components/push-toggle";
import { InfoTip } from "@/components/run-charts";
import PushPrompt from "@/components/push-prompt";
import MatchBoard from "@/components/match-board";
import { getNotices, getPushEnabledNicks, homeNoticeCount, noticeState } from "@/lib/notice";
import { rankMonth, ymOf } from "@/lib/rank";
import { greeting } from "@/lib/greeting";
import { listNews, timeAgo } from "@/lib/news";
import { liveBrags } from "@/lib/brag";
import BragTicker from "@/components/brag-ticker";
import { getPointConfig, getPointTotals, levelOf } from "@/lib/points";
import { autoSettleVersus } from "@/lib/versus";

export const dynamic = "force-dynamic";

/** 응원 배너 하단 문구: 들어올 때마다 하나를 무작위로 보여 준다 */
const CHEER_LINES = [
  "완주도 응원도 모두 멋져요, 오늘도 즐겁게 달려요!",
  "한 걸음 한 걸음이 기록이에요. 끝까지 파이팅!",
  "기록보다 소중한 건 완주의 기쁨이에요.",
  "오늘의 땀방울이 내일의 자신감이 돼요.",
  "R2U가 함께 달려요. 다치지 말고 즐겁게!",
  "결승선에서 만나요. 모두 파이팅!",
  "페이스는 천천히, 마음은 뜨겁게!",
  "달리는 분도, 응원하는 분도 오늘의 주인공이에요.",
  "오늘 흘린 땀은 거짓말하지 않아요.",
  "출발선에 선 것만으로도 이미 멋져요.",
  "끝까지 웃으며 들어와요, 우리가 기다릴게요!",
  "바람은 등 뒤에서, 햇살은 얼굴 위에!",
];

/** 응원 배너용 단순한 아이콘 (선·면 한 가지 색) */
const FlagIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg>
);
const FlameIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden><path d="M12 2.5c.6 3.2-2.2 4.8-2.2 8a2.7 2.7 0 0 0 5.4 0c0-1.1-.4-1.9-1-2.7 2.1.9 3.8 3 3.8 6A6 6 0 0 1 6 13.8C6 9 11 7.6 12 2.5z" /></svg>
);
const SparkIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden><path d="M12 2l2 6.2L20.5 10 14 12l-2 6.5L10 12 3.5 10 10 8.2z" /></svg>
);

export default async function Home({ searchParams }: { searchParams: Promise<{ testrecord?: string }> }) {
  const testRecord = !!(await searchParams).testrecord;
  const u = await currentUser();
  if (!u) redirect("/login");
  const today = kstToday();
  await autoSettleVersus(today); // 지난달 1:1 대결 승리 정산 (한 달에 한 번만 실제로 돈다)
  const ym = ymOf(today);
  const [races, month, links, member, members, myRecs, brags, myPoints] = await Promise.all([getRaces(), getMonth(ym), getLinks(), getMember(u.nick), getMembers(), isStaffAccount(u) ? Promise.resolve({} as Awaited<ReturnType<typeof getRaceRecs>>) : getRaceRecs(u.nick), liveBrags(), getPointTotals().then((t) => t[u.nick] ?? 0)]);
  const names = Object.fromEntries(members.map((entry) => [entry.nick, entry.name || "없음"]));
  const news = await listNews({ limit: 3 }).catch(() => []);
  const pushOn = isStaffAccount(u) ? new Set<string>() : await getPushEnabledNicks().catch(() => new Set<string>());
  const allNotices = (await getNotices()).filter((n) => noticeState(n, today) !== "scheduled");
  const liveNotices = allNotices.filter((n) => noticeState(n, today) === "live").slice(0, await homeNoticeCount());
  const notice = liveNotices[0];
  // 대회 당일: 그날 대회에 올라온 단사·뒷풀이를 홈 맨 위에 띄운다
  // 오늘 열리는 대회는 단사·뒷풀이가 없어도 모두 보여 준다 (출발 시각 순), 그 아래에 대회별 단사·뒷풀이
  const todayRaces = races.filter((r) => r.date === today).sort((x, y) => (x.time || "99:99").localeCompare(y.time || "99:99"));
  const plansOf = (r: (typeof races)[number]) => r.afters.filter((a) => a.kind === "photo" || (a.kind ?? "after") === "after").sort((x, y) => (x.time || "99:99").localeCompare(y.time || "99:99"));
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
  // 참가로 표시한 대회가 끝난 뒤 7일 동안, 아직 기록을 안 남겼다면 기록 입력을 알려 준다
  const dayMs = 86400000, todayMs = Date.parse(`${today}T00:00:00Z`);
  const recordDue = races
    .map((r) => ({ r, since: Math.round((todayMs - Date.parse(`${r.date}T00:00:00Z`)) / dayMs) }))
    .filter(({ r, since }) => since >= 0 && since <= 7 && !myRecs[r.id] && r.participants.some((p) => p.nick === u.nick))
    .map(({ r, since }) => ({ id: r.id, name: r.name, left: 7 - since }));
  // 테스트: 쩝쩝 계정에서 주소 뒤에 ?testrecord=1 을 붙이면 예시 알림이 보인다 (실제 대회가 끝나기 전에 화면을 확인하는 용도)
  if (testRecord && u.nick === "쩝쩝") recordDue.unshift({ id: "test", name: "(테스트) 경주마라톤", left: 5 });
  const closingRace = races.filter((r) => r.date >= today && r.regEnd && regInfo(r, now).status === "open").sort((a, b) => (a.regEnd ?? "").localeCompare(b.regEnd ?? ""))[0];

  return (
    <main className="hub-wrap">
      {/* 알림을 안 켠 크루원에게 알림 켜기 팝업 (운영진 계정, 이미 알림을 설정한 크루원은 새 기기에서 작은 안내만) */}
      {!isStaffAccount(u) && <PushPrompt bonus={(await getPointConfig()).pt.push} subscribed={pushOn.has(u.nick)} />}
      <header className="flex items-center justify-between gap-4 pt-2">
        <div className="min-w-0">
          <h1 className="hub-h1 hub-greeting flex items-center gap-2.5">
            {member?.manager ? <GearIcon size={20} /> : u.admin && !isStaffAccount(u) ? <CrownIcon size={20} /> : null}
            <span className="min-w-0 truncate">{greeting(memberLabel(member ?? u))}</span>
            {!isStaffAccount(u) && <LevelBadge lv={levelOf(myPoints).lv} />}
          </h1>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <PushToggle compact />
          <span className="logo-mark hub-logo shrink-0" role="img" aria-label="R2U Run To Ulsan" />
        </div>
      </header>


      {todayRaces.length > 0 && (
        <Link href="/races" className="cheer-card keep-motion p-4 grid gap-3">
          <span className="cheer-flag" aria-hidden><FlagIcon /></span>
          <div className="grid gap-1 min-w-0">
            <span className="cheer-live"><i aria-hidden />RACE DAY</span>
            <b className="cheer-title">오늘은 대회 날! <span className="cheer-grad">R2U 파이팅</span> <span className="cheer-bounce cheer-flame" aria-hidden><FlameIcon /></span></b>
            <span className="text-xs cheer-sub">{todayRaces.map((r) => r.name).join(" · ")}</span>
          </div>
          <div className="grid gap-2.5">
            {todayRaces.map((r) => (
              <div key={r.id} className="cheer-race-card">
                <span className="cheer-race flex items-center gap-2 min-w-0">
                  <span className="cheer-time num shrink-0">{r.time || "--:--"}</span>
                  <b className="min-w-0 truncate">{r.name}</b>
                </span>
                {plansOf(r).length > 0 && (
                  <div className="cheer-plans">
                    {plansOf(r).map((a) => (
                      <span key={a.id} className="cheer-row flex items-center gap-2 text-sm min-w-0">
                        <b className="num shrink-0">{a.time || "--:--"}</b>
                        <span className="cheer-tag shrink-0">{a.kind === "photo" ? "단체사진" : "뒷풀이"}</span>
                        <span className="min-w-0 truncate">{a.place || r.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <span className="cheer-foot text-xs inline-flex items-center gap-1.5"><SparkIcon />{CHEER_LINES[Math.floor(Math.random() * CHEER_LINES.length)]}</span>
        </Link>
      )}

      {recordDue.map((r) => (
        <Link key={r.id} href={`/me?rec=${r.id}#race-record`} className="panel panel-alert p-3.5 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🏁</span>
          <span className="min-w-0 grid">
            <b className="truncate">{r.name} 어땠어요?</b>
            <span className="text-xs text-muted">대회 기록을 남겨 주세요 · {r.left === 0 ? "오늘까지" : `${r.left}일 남음`}</span>
          </span>
          <span className="btn btn-primary text-sm shrink-0 ml-auto">기록 입력</span>
        </Link>
      ))}

      {/* 1:1 매치: 나에게 온 신청(받아주기·거절)·내가 보낸 신청·내 대결 */}
      {!isStaffAccount(u) && <MatchBoard ym={ym} viewer={u.nick} mineOnly />}

      {/* 자랑하기: 기록을 남긴 크루원이 올린 소식 (3시간 동안 공지처럼 보인다) */}
      <BragTicker items={brags.map((b) => ({ key: b.key, who: knownMemberLabel(b.nick, names), race: b.race, record: `${b.course} ${b.time}`, ago: timeAgo(b.at), canOff: b.nick === u.nick || !!u.admin }))} />

      {/* 공지: 올라온 공지가 없으면 홈에서 아예 보이지 않는다 */}
      {liveNotices.length > 0 && (
        <HomeNotices items={liveNotices.map((n) => ({
          key: `${n.id}:${n.editedAt ?? 0}`,
          title: n.title,
          meta: `${new Date(n.at + 9 * 3600e3).toISOString().slice(5, 10).replace("-", "/")} · ${knownMemberLabel(n.by, names)}`,
          body: <>{n.body && <p className="text-sm whitespace-pre-wrap">{n.body}</p>}<NoticeMedia notice={n} open /></>,
        }))} />
      )}
      {!notice && allNotices.length > 0 && (
        <Link href="/notices" className="panel p-3 flex items-center justify-between text-sm">
          <span>📢 지난 공지 보기</span><span className="text-muted">{allNotices.length}개 →</span>
        </Link>
      )}

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
          <h2 className="label inline-flex items-center gap-1.5">다가오는 접수 일정
            <InfoTip warn text={"✓ 대량 수집 자료로 일정 오류 가능성 있음!\n✓ 접수 전 공식 사이트에서 필수 확인!"} />
          </h2>
          <Link href="/races?view=reg">접수 일정 전체 →</Link>
        </div>
        <div className="row-list">
          {regs.length === 0 && <p className="py-4 text-sm text-muted">예정된 접수 일정이 없어요. 대회에 접수 시작·마감을 넣으면 여기에 보여요.</p>}
          {regs.map((r) => {
            const g = regInfo(r, now);
            return (
              <Link key={r.id} href={`/races?view=reg#${r.id}`} className="flex items-center gap-3 py-3 px-1 hover:bg-[var(--card)]">
                <span className={`chip shrink-0 ${g.status === "open" ? "chip-open" : "chip-warn"}`}>{g.status === "open" ? "접수중" : "접수예정"}</span>
                <span className="font-bold truncate min-w-0 flex-1">{r.name}</span>
                <span className="text-sm text-muted shrink-0 whitespace-nowrap">{r.regStart ? `${fmtDtKo(r.regStart)} 시작` : g.text}</span>
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
            const dd = Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
            return (
              <Link key={r.id} href={`/races#${r.id}`} className={`flex items-center gap-3 py-3 px-1 hover:bg-[var(--card)]`}>
                <span className={`datebox ${dd >= 0 && dd <= 3 ? "datebox-gold keep-motion" : ""}`}><b>{d.md}</b><span>{d.w}요일</span></span>
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
