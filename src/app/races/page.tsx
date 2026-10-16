import Link from "next/link";
import { getLevels } from "@/lib/points";
import { getPushEnabledNicks } from "@/lib/notice";
import { MemberCardSheet, MemberChip } from "@/components/member-card";
import KakaoPlaceField from "@/components/kakao-place-field";
import { redirect } from "next/navigation";
import { WEEK, currentUser, getAdminNicks, isStaffAccount, isStaffNick, fmtRaceDate, driverOf, getMembers, attendanceMode, getRaces, kstNow, kstToday, regInfo, type AfterFull, type AfterKind, type RaceFull, type User } from "@/lib/hub";
import { addAfter, addChecker, setCheckMode, sendItemNotice, sendScheduleNotices, deleteAfter, removeChecker, toggleAbsent, toggleCame, updateAfter, joinRace, leaveRace, toggleCheer } from "@/app/actions";
import { ActionForm, AlertConfirmButton, ConfirmButton, Submit } from "@/components/action-form";
import { Nick, WheelIcon } from "@/components/crown";
import { cache } from "react";
import MemberPicker from "@/components/member-picker";
import SelfChip from "@/components/self-chip";
import PhotoPicker from "@/components/photo-picker";
import RsvpButtons from "@/components/rsvp-buttons";
import { viewUrl } from "@/lib/roadrun";

export const dynamic = "force-dynamic";
export const metadata = { title: "대회 일정" };

const COURSES = ["5K", "10K", "Half", "Full"];
const VIEWS = { upcoming: "다가오는 대회", cal: "캘린더", reg: "접수 일정", mine: "참가 대회", past: "지난 대회", all: "전체" } as const;
type View = keyof typeof VIEWS;

export default async function RacesPage({ searchParams }: { searchParams: Promise<{ view?: string; m?: string; d?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const { view: v, m: mParam, d: dParam } = await searchParams;
  const view: View = v && v in VIEWS ? (v as View) : "upcoming";
  const today = kstToday();
  const [all, admins, members, levels] = await Promise.all([getRaces(), getAdminNicks(), getMembers(), getLevels()]);
  const managers = new Set(members.filter((member) => member.manager).map((member) => member.nick));
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const list = all.filter((r) =>
    view === "reg" ? (r.regStart || r.regEnd) && regInfo(r, kstNow()).status !== "closed"
    : view === "upcoming" ? r.date >= today
    : view === "past" ? r.date < today
    : view === "mine" ? r.participants.some((p) => p.nick === u.nick)
    : view === "cal" ? false
    : true);
  if (view === "past") list.reverse();
  if (view === "reg") list.sort((a, b) => (a.regEnd ?? a.regStart ?? "").localeCompare(b.regEnd ?? b.regStart ?? ""));

  // 월별로 묶기
  const groups = new Map<string, RaceFull[]>();
  list.forEach((r) => { const k = r.date.slice(0, 7); groups.set(k, [...(groups.get(k) ?? []), r]); });

  return (
    <main className="hub-wrap">
      <MemberCardSheet />
      <header className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="hub-h1 hub-title-sm">대회 일정</h1>
          <details className="dropdown">
            <summary className={view === "past" || view === "all" ? "on" : ""}>{view === "past" ? "지난 대회" : view === "all" ? "전체 대회" : "지난·전체"} ▾</summary>
            <div className="dropdown-menu">
              <Link href="/races?view=past" aria-current={view === "past" ? "page" : undefined}>지난 대회</Link>
              <Link href="/races?view=all" aria-current={view === "all" ? "page" : undefined}>전체 대회</Link>
            </div>
          </details>
        </div>
        <p className="text-xs text-muted">참가 표시는 명단용, 접수는 주최 측에서 진행해요.</p>
      </header>

      {/* 보기: 다가오는 대회 / 참가 대회 / 접수 일정 / 대회 찾기 / 캘린더 — 가로를 꽉 채운다 */}
      <nav className="tabs tabs-fill" aria-label="보기">
        {(["upcoming", "mine", "reg", "find", "cal"] as const).map((k) => k === "find"
          ? <Link key={k} href="/races/find" className="tab-tinted">대회 찾기</Link>
          : <Link key={k} href={`/races?view=${k}`} aria-current={k === view ? "page" : undefined}>{VIEWS[k]}</Link>)}
      </nav>


      {view === "cal" && <RaceCalendar races={all} u={u} admins={admins} managers={managers} names={names} levels={levels} today={today} ym={/^\d{4}-\d{2}$/.test(mParam ?? "") ? mParam! : today.slice(0, 7)} day={dParam} />}

      {view !== "cal" && list.length === 0 && <p className="text-sm text-muted">{view === "reg" ? "접수 중이거나 접수 예정인 대회가 없어요. 대회 정보에 접수 시작·마감을 넣으면 여기에 보여요." : "해당하는 대회가 없어요."}</p>}

      {[...groups].map(([ym, races]) => (
        <section key={ym} className="grid gap-2">
          <h2 className="label">{ym.slice(0, 4)}년 {Number(ym.slice(5))}월</h2>
          <div className="grid gap-3">
            {races.map((r) => <RaceCard key={r.id} r={r} u={u} admins={admins} managers={managers} names={names} levels={levels} past={r.date < today}  showReg={view === "reg"} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

/** 달력 보기: 한 달 칸마다 대회 이름, 날짜를 누르면 그날 대회 카드가 아래에 열린다 */
/** 캘린더 칸용 짧은 대회명: 연도·회차와 ‘마라톤·대회·국제·전국’ 같은 말을 빼고 핵심만 (다 빠지면 원래 이름) */
function calName(name: string) {
  const short = name
    .replace(/\(.*?\)/g, "")
    .replace(/20\d\d\s*년?|제?\s*\d+\s*회/g, "")
    .replace(/마라톤대회|마라톤|대회|국제|전국|기념|in\s/gi, "")
    .replace(/\s+/g, " ").trim();
  return short || name;
}

function RaceCalendar({ races, u, admins, managers, names, levels, today, ym, day }: { races: RaceFull[]; u: User; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number>; today: string; ym: string; day?: string }) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();
  const shift = (d: number) => new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
  const byDay = new Map<number, RaceFull[]>();
  races.filter((r) => r.date.startsWith(ym)).forEach((r) => { const d = Number(r.date.slice(8)); byDay.set(d, [...(byDay.get(d) ?? []), r]); });
  const isThis = today.startsWith(ym);
  const sel = Number(day) || (isThis && byDay.has(Number(today.slice(8))) ? Number(today.slice(8)) : 0);
  const picked = byDay.get(sel) ?? [];
  const href = (o: Record<string, string>) => `/races?${new URLSearchParams({ view: "cal", m: ym, ...o })}`;
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <Link href={href({ m: shift(-1) })} className="btn btn-ghost px-3" aria-label="이전 달">←</Link>
        <h2 className="font-bold text-lg">{y}년 {m}월 <span className="text-sm text-muted font-normal">대회 {[...byDay.values()].flat().length}개</span></h2>
        <Link href={href({ m: shift(1) })} className="btn btn-ghost px-3" aria-label="다음 달">→</Link>
      </div>
      <div className="rcal">
        {WEEK.map((w, i) => <span key={w} className={`rcal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: last }, (_, i) => {
          const d = i + 1;
          const rs = byDay.get(d) ?? [];
          const dow = (first + i) % 7;
          return (
            <Link key={d} href={href({ d: String(d) })} scroll={false}
              className={`rcal-d ${rs.length ? "has" : ""} ${isThis && d === Number(today.slice(8)) ? "today" : ""} ${sel === d ? "sel" : ""}`}>
              <span className={`rcal-n ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}>{d}</span>
              {rs.slice(0, 2).map((r) => (
                <span key={r.id} className={`rcal-r ${r.participants.some((p) => p.nick === u.nick) ? "mine" : ""}`} title={r.name}>{calName(r.name)}</span>
              ))}
              {rs.length > 2 && <span className="rcal-more">+{rs.length - 2}</span>}
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-muted">진하게 칠한 대회는 내가 크루 참가로 표시한 대회예요.</p>
      {sel > 0 && (
        <div className="grid gap-3">
          <h3 className="label">{m}월 {sel}일 대회</h3>
          {picked.length === 0 && <p className="text-sm text-muted">이날은 대회가 없어요.</p>}
          {picked.map((r) => <RaceCard key={r.id} r={r} u={u} admins={admins} managers={managers} names={names} levels={levels} past={r.date < today} />)}
        </div>
      )}
    </section>
  );
}

/** 참가자를 코스별로 묶는다 (5K → 10K → 하프 → 풀 → 그 밖 → 미정 순). 표기가 달라도(Half/하프, Full/풀) 같은 코스로 보고, 이름은 코스 선택 버튼과 같게 5K·10K·Half·Full로 쓴다 */
function groupByCourse(ps: RaceFull["participants"]) {
  const norm = (c: string) => { const t = c.trim().toLowerCase(); return t === "half" || t === "하프" ? "half" : t === "full" || t === "풀" ? "full" : t; };
  const ORDER = ["5k", "10k", "half", "full"];
  const map = new Map<string, { key: string; label: string; list: typeof ps }>();
  for (const p of ps) {
    const key = norm(p.course ?? "") || "";
    const label = key === "" ? "미정" : key === "half" ? "Half" : key === "full" ? "Full" : key === "5k" ? "5K" : key === "10k" ? "10K" : (p.course ?? "").trim();
    if (!map.has(key)) map.set(key, { key, label, list: [] });
    map.get(key)!.list.push(p);
  }
  const rank = (k: string) => (k === "" ? 99 : ORDER.includes(k) ? ORDER.indexOf(k) : 50);
  for (const g of map.values()) g.list.sort((a, b) => a.nick.localeCompare(b.nick, "ko"));
  return [...map.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

/** 알림 종 아이콘: 채워진 단순한 모양 */
function BellIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="bell-ico" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M12 3a6 6 0 0 0-6 6v4.2L4.3 16.5c-.3.6.1 1.3.8 1.3h13.8c.7 0 1.1-.7.8-1.3L18 13.2V9a6 6 0 0 0-6-6z" />
      <path d="M10 19.4a2 2 0 0 0 4 0z" />
    </svg>
  );
}

/** 확인 모드 체크 아이콘: 켜짐은 초록 그라데이션 + 흰 체크, 꺼짐은 점선 테두리 */
function ModeCheckIcon({ on, size = 22 }: { on: boolean; size?: number }) {
  return (
    <svg className={`mode-ico ${on ? "on" : "off"}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="mc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#16a34a" /></linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" className="mc-box" fill={on ? "url(#mc-g)" : "none"} />
      {on && <path d="M7.4 12.6l3.2 3.2 6-6.6" className="mc-tick" />}
    </svg>
  );
}

async function RaceCard({ r, u, admins, managers, names, levels, past, showReg = false }: { r: RaceFull; u: User; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number>; past: boolean; showReg?: boolean }) {
  // 대회까지 남은 날(오늘 = 0, 지났으면 음수), 한국 날짜 기준
  const dd = Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${kstToday()}T00:00:00Z`)) / 86400000);
  const d = fmtRaceDate(r.date);
  const me = r.participants.find((p) => p.nick === u.nick);
  const raceAttendee = !!me || r.cheers.includes(u.nick);
  const reg = regInfo(r);
  const groups = groupByCourse(r.participants);
  const schedule = sortAfters(r.afters);
  // 확인 모드: 단사 글이 있고 대회 2일 전~당일이면 위쪽 참가·응원 목록이 출석 체크 목록으로 바뀐다 (단사 참석자 = 대회 참석자 전원)
  const photoPost = schedule.find((a) => kindOf(a) === "photo");
  const checkMode = !!photoPost && attendanceMode(r, kstToday());
  const canCheck = u.admin || r.checkers.includes(u.nick);
  const canToggleMode = u.admin && !past && !!photoPost; // 운영진은 확인 모드를 체크 버튼으로 켜고 끈다 (기본은 2일 전부터 자동)
  const everyone = new Set([...r.participants.map((p) => p.nick), ...r.cheers]);
  const cameCount = photoPost ? [...everyone].filter((n) => photoPost.came.includes(n)).length : 0;
  /** 참가·응원 칩 하나: 확인 모드에선 앞에 체크 버튼, 아니면 기존 모습 (불참은 ✕ 빨강) */
  const chip = (nick: string, extra: string, leave?: React.ReactNode) => {
    const on = !!photoPost?.came.includes(nick), off = !!photoPost && photoPost.no.includes(nick) && !on;
    if (!checkMode) {
      return (
        <span key={nick} className={`pchip ${extra} ${off ? "chk-off" : ""}`}>
          {off && <b aria-hidden className="chk-x">✕</b>}
          <MemberChip nick={nick}><Nick n={nick} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip>
          {leave}
        </span>
      );
    }
    // 확인 모드: 뒷풀이 출석 칩과 같은 모습 (닉네임만, 점선 테두리 → 출석 ✓ 초록 / 불참 ✕ 빨강)
    const label = <>{on ? "✓ " : off ? "✕ " : ""}{nick}</>;
    const cls = `came-chip ${on ? "on" : off ? "off" : ""}`;
    const hidden = <><input type="hidden" name="id" value={r.id} /><input type="hidden" name="after" value={photoPost!.id} /><input type="hidden" name="nick" value={nick} /></>;
    if (canCheck && nick === u.nick) return <SelfChip key={nick} raceId={r.id} afterId={photoPost!.id} nick={nick} className={cls}>{label}</SelfChip>;
    if (canCheck) return <form key={nick} action={toggleCame} className="inline-flex">{hidden}<button type="submit" className={cls} aria-pressed={on}>{label}</button></form>;
    if (nick === u.nick && !on) return <form key={nick} action={toggleAbsent} className="inline-flex">{hidden}<button type="submit" className={cls} aria-pressed={off}>{label}</button></form>;
    return <span key={nick} className={cls}>{label}</span>;
  };
  // 알림을 보낼 수 있는 일정: 시간이 정해져 있고 아직 안 지난 대회·단사·카풀·뒷풀이
  const upcoming = (t?: string) => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && Date.parse(`${r.date}T${t}:00+09:00`) > Date.now();
  const noticeKinds = [
    { key: "race", label: "🏁 대회", count: upcoming(r.time) ? 1 : 0 },
    { key: "photo", label: "📷 단사", count: r.afters.filter((a) => a.kind === "photo" && upcoming(a.time)).length },
    { key: "carpool", label: "🚗 카풀", count: r.afters.filter((a) => a.kind === "carpool" && upcoming(a.time)).length },
    { key: "after", label: "🍽️ 뒷풀이", count: r.afters.filter((a) => (a.kind ?? "after") === "after" && upcoming(a.time)).length },
  ].filter((k) => k.count > 0);
  // 알림 받을 사람(대상)과 그중 알림을 켠 사람: 확인창에 인원을 보여 준다
  const pushOn = await pushNicks();
  const noticeInfo = (key: string) => {
    const targets = new Set<string>(
      key === "race" ? [...r.participants.map((p) => p.nick), ...r.cheers]
        : r.afters.filter((a) => kindOf(a) === "carpool" && upcoming(a.time)).flatMap((a) => [...a.yes, driverOf(a)]));
    const list = [...targets].filter((n) => n && !isStaffNick(n));
    return { total: list.length, reach: list.filter((n) => pushOn.has(n)).length };
  };
  return (
    <article id={r.id} className={`panel p-4 grid gap-3 ${dd >= 0 && dd <= 3 ? "race-gold keep-motion" : ""}`} style={past ? { opacity: 0.8 } : undefined}>
      <div className="race-head">
        <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
        <div className="min-w-0 grid gap-0.5" style={{ flex: 1 }}>
          <h3 className="font-bold text-lg leading-snug flex flex-wrap items-center gap-x-2 gap-y-1">
            {r.name}
            <span className={`chip dday ${dd < 0 ? "past" : dd === 0 ? "today" : dd <= 3 ? "gold keep-motion" : dd <= 7 ? "soon" : ""}`}>{dd < 0 ? "종료" : dd === 0 ? "D-DAY" : `D-${dd}`}</span>
          </h3>
          {/* 시간·장소는 이름 바로 아래(날짜 박스 옆)에, 코스·링크 메모와 대회 정보 이동은 다음 줄 */}
          <p className="text-sm text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
            <span className="min-w-0 race-place">{r.time ? `${r.time} 출발 · ` : ""}{r.placeUrl ? <a href={r.placeUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--lane)] underline">{r.place || "장소 보기"}</a> : r.place || "장소 미정"}</span>
            {showReg && reg.text && (
              <>
                <span aria-hidden>·</span>
                {reg.status === "open" && !past && <span className="chip chip-open">접수중</span>}
                {reg.status === "soon" && !past && <span className="chip chip-warn">접수예정</span>}
                {reg.status === "closed" && !past && <span className="chip chip-failed">접수마감</span>}
                <span>접수 {reg.text}</span>
              </>
            )}
          </p>
          {/* 주소 · (코스·링크 메모 + 대회 정보 버튼)을 이름·시간 줄과 같은 왼쪽 선에서 시작해 오른쪽 끝까지 */}
          {/* 하단 대회 정보(주소·코스 메모·접수/대회 정보 링크)는 기본으로 접어 둔다 */}
          {(r.address || r.note || r.regUrl || r.src) && <details className="race-fold min-w-0">
            <summary className="race-fold-sum">대회 정보</summary>
            {r.address && <p className="text-xs text-muted mt-1.5">{r.address}</p>}
            {(r.note || r.regUrl || r.src) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-1.5">
              {r.note && <p className="text-sm break-all min-w-0"><Linkify text={r.note} /></p>}
              {r.regUrl && <a href={r.regUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary text-xs py-1.5 px-2.5">주최 측 접수 페이지 ↗</a>}
              {r.src && <a href={viewUrl(r.src)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs py-1.5 px-2.5">대회 정보 ↗</a>}
            </div>}
          </details>}
        </div>
        {/* 오른쪽: 참가할게요(코스 변경) · 응원 갈게요 버튼 (같은 크기) */}
        <div className="shrink-0 grid justify-items-end gap-1.5">
          {!past && !isStaffAccount(u) && (
            <Submit form={`join-${r.id}`} className="btn btn-primary race-act text-xs justify-center" confirm={me ? "참가 코스를 바꿀까요?" : undefined}>{me ? "코스 변경" : "참가해요"}</Submit>
          )}
          {!past && !isStaffNick(u.nick) ? (
          <form action={toggleCheer}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="nick" value={u.nick} />
            <AlertConfirmButton className={`btn cheer-btn race-act text-xs justify-center ${r.cheers.includes(u.nick) ? "is-on" : ""}`} message={r.cheers.includes(u.nick) ? "응원 표시를 취소할까요?" : `${r.name} 응원 갈게요로 표시할까요?`}>
              {r.cheers.includes(u.nick) ? "응원 가요 ✓" : "응원 갈게요"}
            </AlertConfirmButton>
          </form>
          ) : <span className="chip count-badge" aria-label={`크루 참가 ${r.participants.length}명`}>👥 {r.participants.length}명</span>}
        </div>
      </div>

      {/* 참가 표시 입력(코스 선택)은 늘 보이고, 참가자·응원·단사/카풀/뒷풀이는 요약 줄을 눌러 펼친다 */}
      {!past && !isStaffAccount(u) && (
        <ActionForm action={joinRace} className="join-form" id={`join-${r.id}`} alertError>
          <input type="hidden" name="id" value={r.id} />
          <div className="course-row" role="radiogroup" aria-label="코스 선택">
            {COURSES.map((c) => (
              <label key={c} className="cchip">
                <input type="radio" name="course" value={c} defaultChecked={me?.course === c} />
                <span>{c}</span>
              </label>
            ))}
            <input name="courseEtc" className="input cchip-etc" placeholder="코스 선택 및 입력" maxLength={20} aria-label="코스 직접입력" />
          </div>
        </ActionForm>
      )}

      {/* D-3 이내(오늘 포함) 대회는 펼쳐 둔다 */}
      <details className="race-more" open={(dd >= 0 && dd <= 3) || undefined}>
        <summary className="race-sum">
          {/* 1줄: 참가 인원(코스별) · 2줄: 응원 · 단사·카풀·뒷풀이 시간 */}
          <span className="race-sum-text grid gap-0.5">
            <span className="truncate">{checkMode && <b className="mode-tag inline-flex items-center gap-1"><ModeCheckIcon on size={16} />확인 모드 </b>}<b>👥 참가 {r.participants.length}</b>
              {groups.length > 0 && <span className="text-muted"> ({groups.map((g) => `${g.label} ${g.list.length}`).join(" · ")})</span>}</span>
            {/* 응원·단사·카풀·뒷풀이는 있을 때만 (0명이면 안 적는다) */}
            {(r.cheers.length > 0 || schedule.length > 0) && (
              <span className="text-muted text-[13px]">
                {[...(r.cheers.length > 0 ? [`📣 응원 ${r.cheers.length}`] : []),
                  ...schedule.map((a) => `${AFTER_ICON[kindOf(a)]} ${KINDS.find((k) => k.kind === kindOf(a))!.tag}${a.time ? ` ${a.time}` : ""}`)].join(" · ")}
              </span>
            )}
          </span>
        </summary>
        <div className="grid gap-3 pt-3">
      <div className="grid gap-1.5">
        {r.participants.length === 0 && <span className="text-sm text-muted">아직 없어요.</span>}
        {(checkMode || canToggleMode) && (
          <div className={`mode-banner ${checkMode ? "" : "mode-off"}`}>
            {canToggleMode ? (
              <form action={setCheckMode} className="inline-flex">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="mode" value={checkMode ? "off" : "on"} />
                <button type="submit" className="mode-check" aria-pressed={checkMode} aria-label={checkMode ? "확인 모드 끄기" : "확인 모드 켜기"}><ModeCheckIcon on={checkMode} /></button>
              </form>
            ) : <span aria-hidden className="inline-flex"><ModeCheckIcon on /></span>}
            <b>확인 모드</b>
            {checkMode
              ? <><span>{canCheck ? "이름을 누르면 출석 체크돼요" : "운영진이 출석을 체크해요 · 못 오면 내 이름을 눌러 참석 불가"}</span><b className="num ml-auto">{cameCount}/{everyone.size}</b></>
              : <span className="text-muted">꺼져 있어요 · 체크하면 켜져요</span>}
          </div>
        )}
        <div className="grid gap-1.5">
          {groups.map((g) => (
            <div key={g.key} className="pgroup">
              <span className="pgroup-l">{g.label}<small>{g.list.length}</small></span>
              <div className="flex flex-wrap gap-1.5">
                {g.list.map((p) => chip(p.nick, p.nick === u.nick ? "me" : "", p.nick === u.nick && !past && !checkMode ? (
                  <form action={leaveRace} className="inline">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="nick" value={p.nick} />
                    <ConfirmButton className="" label={`${p.nick} 참가 취소`} message={`${r.name} 참가를 취소할까요?`}>✕</ConfirmButton>
                  </form>
                ) : undefined))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {r.cheers.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="label">📣 응원 {r.cheers.length}명</span>
        {[...r.cheers].sort((a, b) => a.localeCompare(b, "ko")).map((n) => chip(n, `cheer ${n === u.nick ? "me" : ""}`))}
      </div>}

      <AfterParties r={r} u={u} admins={admins} managers={managers} names={names} levels={levels}
        top={(u.admin || raceAttendee || r.checkers.includes(u.nick)) && noticeKinds.some((k) => k.key === "race" || k.key === "carpool") ? (
          // 알림은 종류별로 따로 보낸다 (단사·뒷풀이·카풀·대회 각각 버튼)
          <div className="flex flex-wrap justify-end gap-1.5">
            {noticeKinds.filter((k) => k.key === "race" || k.key === "carpool").map((k) => (
              <ActionForm key={k.key} action={sendScheduleNotices} keep alertError>
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="k" value={k.key} />
                <Submit className="btn text-sm py-1.5 px-3" pendingText="보내는 중…" confirm={`${k.label.replace(/^\S+\s/, "")} 알림을 보낼까요?\n알림을 켠 ${noticeInfo(k.key).reach}명에게 가요. (대상 ${noticeInfo(k.key).total}명)`}><BellIcon />{k.label.replace(/^\S+\s/, "")} 알림{k.count > 1 ? ` ${k.count}` : ""}</Submit>
              </ActionForm>
            ))}
          </div>
        ) : null} />
        </div>
      </details>

    </article>
  );
}


/** 메모 속 주소를 누를 수 있는 링크로 */
function Linkify({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s·]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--lane)] underline">{part.replace(/^https?:\/\/(www\.)?/, "")}</a>
      : part);
}

/** 대회 아래 함께하기: 단사시간 · 카풀 · 뒷풀이. 댓글처럼 쌓이고 각자 참석(탑승)을 고른다 */
const KINDS: { kind: AfterKind; add: string; tag: string }[] = [
  { kind: "photo", add: "+ 단사시간 추가", tag: "단사" },
  { kind: "carpool", add: "+ 카풀 추가", tag: "카풀" },
  { kind: "after", add: "+ 뒷풀이 추가", tag: "뒷풀이" },
];
const kindOf = (a: AfterFull): AfterKind => a.kind ?? "after";
/** 한국 시각 MM/DD HH:MM */
const fmtStamp = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
const AFTER_ICON: Record<AfterKind, string> = { photo: "📷", carpool: "🚗", after: "🍻" };
/** 단사·카풀·뒷풀이를 시간 순서로 (시간 없는 건 뒤로) */
const sortAfters = (list: AfterFull[]) => [...list].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.at - b.at);

const pushNicks = cache(async () => getPushEnabledNicks());
const crewNicks = cache(async () => (await getMembers()).filter((m) => !isStaffNick(m.nick)).sort((a, b) => a.nick.localeCompare(b.nick, "ko")));

/** 출석 체크를 맡길 크루원 찾기 (닉네임·이름·초성 검색) */
async function CheckerSelect() {
  const nicks = await crewNicks();
  return <MemberPicker members={nicks.map((m) => ({ nick: m.nick, name: m.name?.trim() || "" }))} />;
}

/** 카풀 운전자 고르기: 기본은 올리는 나, 다른 크루원도 고를 수 있다 */
async function DriverSelect({ me, value }: { me: string; value?: string }) {
  const nicks = await crewNicks();
  return (
    <label className="field full"><span className="label">운전자</span>
      <select name="driver" className="input" defaultValue={value ?? me}>
        {nicks.map((m) => <option key={m.nick} value={m.nick}>{m.nick}/{m.name?.trim() || "없음"}{m.nick === me ? " (나)" : ""}</option>)}
      </select>
    </label>
  );
}

/** 단사·카풀·뒷풀이 입력 칸 (새로 올릴 때와 고칠 때 같이 쓴다) */
function AfterFields({ kind, me, a }: { kind: AfterKind; me: string; a?: AfterFull }) {
  return (
    <>
              {kind === "photo" && <>
                <label className="field"><span className="label">시간</span><input name="time" type="time" className="input" defaultValue={a?.time} /></label>
                <KakaoPlaceField label="장소" place={a?.place} address={a?.address} placeUrl={a?.placeUrl} placeholder="예: 출발선 왼쪽 R2U 깃발" />
                <PhotoPicker current={a?.photo ? `/api/after-photo/${a.id}` : undefined} removable={!!a} />
              </>}
              {kind === "carpool" && <>
                <DriverSelect me={me} value={a ? driverOf(a) : undefined} />
                <KakaoPlaceField label="출발지" place={a?.place} address={a?.address} placeUrl={a?.placeUrl} placeholder="예: 삼산 롯데백화점 앞" />
                <label className="field"><span className="label">출발 시간</span><input name="time" type="time" className="input" defaultValue={a?.time} /></label>
                <label className="field"><span className="label">태울 수 있는 자리</span><input name="seats" type="number" defaultValue={a?.seats} inputMode="numeric" min={1} max={10} className="input" placeholder="예: 3" required /></label>
              </>}
              {kind === "after" && <>
                <KakaoPlaceField label="장소" place={a?.place} address={a?.address} placeUrl={a?.placeUrl} placeholder="예: 태화강 국밥집" />
                <label className="field"><span className="label">시간</span><input name="time" type="time" className="input" defaultValue={a?.time} /></label>
              </>}
              <label className="field full"><span className="label">내용</span><input name="memo" className="input" defaultValue={a?.memo} maxLength={200} placeholder="기타 공유 사항" /></label>
    </>
  );
}

async function AfterParties({ r, u, admins, managers, names, levels, top }: { r: RaceFull; u: User; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number>; top?: React.ReactNode }) {
  const items = sortAfters(r.afters);
  const pushOn = await pushNicks(); // 알림을 켠 크루원 (알림 버튼 확인창에 보낼 인원 수를 보여 주려고)
  const today = kstToday();
  const dayBefore = new Date(Date.parse(`${r.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const inMode = attendanceMode(r, today); // 확인 모드: 자동(2일 전~당일) 또는 운영진이 정한 켬/끔
  const cand = [...new Set([...r.participants.map((p) => p.nick), ...r.cheers])].filter((n) => !isStaffNick(n));
  // 운영진이 참가·응원 명단에 한 명도 없을 때만 출석 체크 위임을 보여 준다 (이미 위임한 게 있으면 취소할 수 있게 계속 보인다)
  const adminAttending = [...r.participants.map((p) => p.nick), ...r.cheers].some((n) => admins.has(n));
  return (
    <div className="after-wrap">
      {top}
      {items.map((a) => <AfterItem key={a.id} a={a} raceId={r.id} u={u} today={today} raceDate={r.date} dayBefore={dayBefore} inMode={inMode} pushOn={pushOn} cand={cand} checkers={r.checkers} admins={admins} managers={managers} names={names} levels={levels} />)}
      <div className="after-adds">
        {KINDS.filter((k) => k.kind === "carpool" || !items.some((a) => kindOf(a) === k.kind)).map((k) => (
          <details key={k.kind} className="after-add">
            <summary>{k.add}</summary>
            <ActionForm action={addAfter} className="grid-2 mt-2" collapse>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="kind" value={k.kind} />
              <AfterFields kind={k.kind} me={u.nick} />
              <div className="full"><Submit>올리기</Submit></div>
            </ActionForm>
          </details>
        ))}
        {u.admin && r.date >= today && (!adminAttending || r.checkers.length > 0) && (
          <details className="after-add">
            <summary>+ 체크 위임{r.checkers.length ? ` (${r.checkers.join(", ")})` : ""}</summary>
            <div className="grid gap-2 mt-2">
              <span className="text-xs text-muted">운영진이 못 오면 크루원 한 명에게 당일 단사·뒷풀이 출석 체크를 맡길 수 있어요.</span>
              <div className="flex items-center gap-2">
                <ActionForm action={addChecker} className="flex items-center gap-2 min-w-0 flex-1" collapse>
                  <input type="hidden" name="id" value={r.id} />
                  <CheckerSelect />
                  <Submit className="btn btn-primary text-sm shrink-0" >위임하기</Submit>
                </ActionForm>
                {r.checkers.length > 0 && (
                  <form action={removeChecker} className="shrink-0">
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton className="btn btn-danger text-sm shrink-0" message={`${r.checkers.join(", ")} 님의 출석 체크 위임을 취소할까요?`}>위임취소</ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function AfterItem({ a, raceId, u, today, raceDate, dayBefore, inMode, pushOn, cand, checkers, admins, managers, names, levels }: { a: AfterFull; raceId: string; u: User; today: string; raceDate: string; dayBefore: string; inMode: boolean; pushOn: Set<string>; cand: string[]; checkers: string[]; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number> }) {
  const kind = kindOf(a);
  const mine = a.yes.includes(u.nick) ? "yes" : a.no.includes(u.nick) ? "no" : "";
  const tag = KINDS.find((k) => k.kind === kind)!.tag;
  const full = kind === "carpool" && (a.seats ?? 0) > 0 && a.yes.length >= (a.seats ?? 0);
  const title = kind === "carpool" ? `${a.place || "출발지 미정"} 출발` : a.place || a.time || tag;
  const canEdit = u.admin || a.by === u.nick || driverOf(a) === u.nick;
  const actions = canEdit ? (
    <>
      <details className="after-add after-edit ml-auto">
        <summary>수정</summary>
        <ActionForm action={updateAfter} className="grid-2 mt-2" keep collapse>
          <input type="hidden" name="id" value={raceId} />
          <input type="hidden" name="after" value={a.id} />
          <AfterFields kind={kind} me={u.nick} a={a} />
          <div className="full"><Submit confirm="수정한 내용으로 저장할까요?">수정 저장</Submit></div>
        </ActionForm>
      </details>
      {a.by === u.nick && (
        <form action={deleteAfter}>
          <input type="hidden" name="id" value={raceId} /><input type="hidden" name="after" value={a.id} />
          <ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2">삭제</ConfirmButton>
        </form>
      )}
    </>
  ) : null;
  // 대회 당일엔 단사·뒷풀이 모두 펼치고, 단사는 사진과 장소가 입력돼 있으면 전날부터 펼친다
  const isDay = today === raceDate;
  // 사진은 대회 다음 날 밤에 저장소에서 자동 삭제되므로, 그 뒤에는 깨진 그림이 보이지 않게 숨긴다
  const photoAlive = !!a.photo && today <= new Date(Date.parse(`${raceDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const canCheck = u.admin || checkers.includes(u.nick); // 운영진, 또는 운영진이 출석 체크를 맡긴 크루원
  // 이 일정에 알림 보내기: 운영진·위임받은 사람·대회 참석자, 아직 안 지난 시간이 있을 때
  // 알림 받을 사람: 단사는 대회 참석자 중 아직 출석 체크 안 된 사람, 뒷풀이는 참석 신청자
  const noticeTargets = kind === "photo" ? cand.filter((n) => !a.came.includes(n)) : a.yes.filter((n) => !isStaffNick(n));
  const noticeReach = noticeTargets.filter((n) => pushOn.has(n)).length;
  const canNotify = (kind === "photo" || kind === "after") && (canCheck || cand.includes(u.nick)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time ?? "") && Date.parse(`${raceDate}T${a.time}:00+09:00`) > Date.now();
  // 확인 모드가 켜지면 단사·뒷풀이를 펼치고, 아니면 접어 둔다
  const openNow = (kind === "photo" || kind === "after") && inMode;
  const canAbsent = (nick: string) => cand.includes(nick) && raceDate >= today;
  // 단사: 대회 참석자(참가·응원) 모두가 기본 명단, 못 오면 본인이 참석 불가. 뒷풀이: 평소엔 참석 신청자 목록, 당일엔 그 신청자로 출석 체크
  const showList = kind === "after" && inMode; // 단사 명단은 위쪽 참가·응원 목록(확인 모드)으로 대신한다
  const roster = [...new Set([...a.yes, ...a.came])].sort((x, y) => x.localeCompare(y, "ko"));
  // 한 줄: 아이콘 · 시간 · 장소(제목) · 참석 수 / 누르면 참석 버튼·명단·운전자·메모·수정
  const count = kind === "carpool" ? `${a.yes.length}/${a.seats ?? 0}석` : kind === "after" && !inMode ? `${a.yes.length}명` : ""; // 확인 모드에서는 출석 수를 따로 적지 않는다
  return (
    <div className="grid gap-1 after-block">
    <details className={`after-item k-${kind}`} open={openNow || undefined}>
      <summary className={`after-line ${canNotify ? "has-notify" : ""}`}>
        {kind === "carpool" ? (
          <>
            <span className="after-ico" aria-hidden>{AFTER_ICON[kind]}</span>
            <b className="after-time num">{a.time || "--:--"}</b>
            <span className={`chip k-tag`}>{tag}</span>
            <span className="min-w-0 truncate">{title !== a.time ? title : ""}</span>
          </>
        ) : (
          // 단사·뒷풀이: 뱃지 / 시간 (아이콘·장소는 빼고, 장소는 펼친 안쪽에 있다)
          <>
            <span className={`chip k-tag`}>{tag}</span>
            <b className="after-time num">{a.time || "--:--"}</b>
          </>
        )}
        {count && <span className={`chip ${mine === "yes" ? "chip-open" : ""} ml-auto shrink-0`}>{mine === "yes" ? "✓ " : ""}{count}</span>}
      </summary>
      {/* 알림 버튼: 박스 안쪽 맨 위, 단사·뒷풀이 뱃지와 같은 높이(오른쪽) */}
      {canNotify && (
        <div className="notify-abs">
          <ActionForm action={sendItemNotice} keep alertError>
            <input type="hidden" name="id" value={raceId} /><input type="hidden" name="item" value={a.id} />
            <Submit className="btn text-xs py-1 px-2.5" pendingText="보내는 중…" confirm={`${tag} 알림을 보낼까요?\n알림을 켠 ${noticeReach}명에게 가요. (대상 ${noticeTargets.length}명)`}><BellIcon />알림</Submit>
          </ActionForm>
        </div>
      )}
      <div className="grid gap-2 pt-2">
        {/* 위치 정보(왼쪽)와 참석 버튼(오른쪽)을 같은 줄 맨 위에 맞춘다 */}
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-0.5 min-w-0">
            {a.placeUrl && <a href={a.placeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--lane)] underline">{a.place || "장소 보기"} 지도 ↗</a>}
            {a.address && <span className="text-xs text-muted">{a.address}</span>}
            {kind === "carpool" && <span className="text-sm" title="운전자"><WheelIcon /> <Nick n={driverOf(a)} admins={admins} managers={managers} names={names} levels={levels} /></span>}
          </div>
          {kind !== "photo" && (
            <div className="shrink-0 grid justify-items-end gap-1.5">
              <div className="rsvp-fixed"><RsvpButtons raceId={raceId} afterId={a.id} kind={kind} mine={mine} yes={a.yes.length} seats={a.seats} full={full} driver={driverOf(a) === u.nick} /></div>
            </div>
          )}
        </div>
        {(a.memo || photoAlive) && <div className="grid gap-0.5 min-w-0">
          {a.memo && <span className="text-sm">{a.memo}</span>}
          {photoAlive && <img src={`/api/after-photo/${a.id}`} alt="단체사진" loading="lazy" className="rounded-lg" style={{ maxWidth: "100%", maxHeight: 260, pointerEvents: "none" }} />}
        </div>}
        {kind !== "photo" && !(kind === "after" && inMode) && (a.yes.length > 0 || a.no.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!(kind === "after" && inMode) && [...a.yes].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip"><MemberChip nick={n}><Nick n={n} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip></span>)}
            {!(kind === "after" && inMode) && [...a.no].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip cancelled" title="취소함"><MemberChip nick={n}><Nick n={n} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip></span>)}
          </div>
        )}
        {showList && roster.length > 0 && (
          <div className="grid gap-1">
            <span className="text-xs text-muted">
              <span className="inline-flex items-center gap-1 align-middle"><ModeCheckIcon on size={14} /> 확인 모드</span> · 뒷풀이 출석 {a.came.length}/{roster.length}
              {canCheck ? (u.admin ? " · 온 사람을 누르면 출석 체크" : " · 출석 체크를 맡았어요: 온 사람을 누르세요") : ""}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {roster.map((n) => {
                const on = a.came.includes(n);
                const label = <>{on ? "✓ " : ""}{n}</>;
                const cls = `came-chip ${on ? "on" : ""}`;
                if (!canCheck) return <span key={n} className={cls}>{label}</span>;
                return (
                  <form key={n} action={toggleCame}>
                    <input type="hidden" name="id" value={raceId} /><input type="hidden" name="after" value={a.id} /><input type="hidden" name="nick" value={n} />
                    <button type="submit" className={cls} aria-pressed={on}>{label}</button>
                  </form>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
      {/* 올린 사람·올린 시각·수정 시각: 박스 바깥 오른쪽 */}
      <div className="after-by flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-xs text-muted">
        {actions}
        <span><Nick n={a.by} admins={admins} managers={managers} names={names} levels={levels} /> 님이 올림 · {fmtStamp(a.at)}{a.editedAt ? ` · 수정 ${fmtStamp(a.editedAt)}` : ""}</span>
      </div>
    </div>
  );
}
