import Link from "next/link";
import { getLevels } from "@/lib/points";
import { MemberCardSheet, MemberChip } from "@/components/member-card";
import KakaoPlaceField from "@/components/kakao-place-field";
import { redirect } from "next/navigation";
import { WEEK, currentUser, getAdminNicks, isStaffAccount, isStaffNick, fmtRaceDate, driverOf, getMembers, getRaces, kstNow, kstToday, regInfo, type AfterFull, type AfterKind, type RaceFull, type User } from "@/lib/hub";
import { addAfter, addChecker, deleteAfter, removeChecker, setAbsentReason, toggleAbsent, toggleCame, updateAfter, joinRace, leaveRace, toggleCheer } from "@/app/actions";
import { ActionForm, AlertConfirmButton, ConfirmButton, Submit } from "@/components/action-form";
import ScheduleNoticePanel from "@/components/schedule-notice";
import { Nick, WheelIcon } from "@/components/crown";
import { cache } from "react";
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

function RaceCard({ r, u, admins, managers, names, levels, past, showReg = false }: { r: RaceFull; u: User; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number>; past: boolean; showReg?: boolean }) {
  // 대회까지 남은 날(오늘 = 0, 지났으면 음수), 한국 날짜 기준
  const dd = Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${kstToday()}T00:00:00Z`)) / 86400000);
  const d = fmtRaceDate(r.date);
  const me = r.participants.find((p) => p.nick === u.nick);
  const raceAttendee = !!me || r.cheers.includes(u.nick);
  const reg = regInfo(r);
  const groups = groupByCourse(r.participants);
  const schedule = sortAfters(r.afters);
  // 알림을 보낼 수 있는 일정: 시간이 정해져 있고 아직 안 지난 대회·단사·카풀·뒷풀이
  const upcoming = (t?: string) => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && Date.parse(`${r.date}T${t}:00+09:00`) > Date.now();
  const noticeKinds = [
    { key: "race", label: "🏁 대회", count: upcoming(r.time) ? 1 : 0 },
    { key: "photo", label: "📷 단사", count: r.afters.filter((a) => a.kind === "photo" && upcoming(a.time)).length },
    { key: "carpool", label: "🚗 카풀", count: r.afters.filter((a) => a.kind === "carpool" && upcoming(a.time)).length },
    { key: "after", label: "🍽️ 뒷풀이", count: r.afters.filter((a) => (a.kind ?? "after") === "after" && upcoming(a.time)).length },
  ].filter((k) => k.count > 0);
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
        {/* 주소 · (코스·링크 메모 + 대회 정보 버튼)을 이름·시간 줄과 같은 왼쪽 선에서 시작해 오른쪽 끝까지 */}
        {(r.address || r.note || r.regUrl || r.src) && <div className="race-detail grid gap-1 min-w-0">
          {r.address && <p className="text-xs text-muted">{r.address}</p>}
          {(r.note || r.regUrl || r.src) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {r.note && <p className="text-sm break-all min-w-0"><Linkify text={r.note} /></p>}
            {r.regUrl && <a href={r.regUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary text-xs py-1.5 px-2.5">주최 측 접수 페이지 ↗</a>}
            {r.src && <a href={viewUrl(r.src)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs py-1.5 px-2.5">대회 정보 ↗</a>}
          </div>}
        </div>}
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
            <span className="truncate"><b>👥 참가 {r.participants.length}</b>
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
        <div className="grid gap-1.5">
          {groups.map((g) => (
            <div key={g.key} className="pgroup">
              <span className="pgroup-l">{g.label}<small>{g.list.length}</small></span>
              <div className="flex flex-wrap gap-1.5">
                {g.list.map((p) => (
                  <span key={p.nick} className={`pchip ${p.nick === u.nick ? "me" : ""}`}>
                    <MemberChip nick={p.nick}><Nick n={p.nick} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip>
                    {p.nick === u.nick && !past && (
                      <form action={leaveRace} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="nick" value={p.nick} />
                        <ConfirmButton className="" label={`${p.nick} 참가 취소`} message={`${r.name} 참가를 취소할까요?`}>✕</ConfirmButton>
                      </form>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {r.cheers.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="label">📣 응원 {r.cheers.length}명</span>
        {[...r.cheers].sort((a, b) => a.localeCompare(b, "ko")).map((n) => (
          <span key={n} className={`pchip cheer ${n === u.nick ? "me" : ""}`}>
            <MemberChip nick={n}><Nick n={n} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip>
          </span>
        ))}
      </div>}

      <AfterParties r={r} u={u} admins={admins} managers={managers} names={names} levels={levels}
        top={(u.admin || raceAttendee) && noticeKinds.length > 0 ? <div className="flex justify-end"><ScheduleNoticePanel raceId={r.id} kinds={noticeKinds} /></div> : null} />
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
const AFTER_ICON: Record<AfterKind, string> = { photo: "📷", carpool: "🚗", after: "🍻" };
/** 단사·카풀·뒷풀이를 시간 순서로 (시간 없는 건 뒤로) */
const sortAfters = (list: AfterFull[]) => [...list].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.at - b.at);

const crewNicks = cache(async () => (await getMembers()).filter((m) => !isStaffNick(m.nick)).sort((a, b) => a.nick.localeCompare(b.nick, "ko")));

/** 출석 체크를 맡길 크루원 고르기 */
async function CheckerSelect() {
  const nicks = await crewNicks();
  return (
    <label className="field full"><span className="label">맡길 크루원</span>
      <select name="nick" className="input" defaultValue="" required>
        <option value="" disabled>선택</option>
        {nicks.map((m) => <option key={m.nick} value={m.nick}>{m.nick}/{m.name?.trim() || "없음"}</option>)}
      </select>
    </label>
  );
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

function AfterParties({ r, u, admins, managers, names, levels, top }: { r: RaceFull; u: User; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number>; top?: React.ReactNode }) {
  const items = sortAfters(r.afters);
  const today = kstToday();
  const dayBefore = new Date(Date.parse(`${r.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const cand = [...new Set([...r.participants.map((p) => p.nick), ...r.cheers])].filter((n) => !isStaffNick(n));
  return (
    <div className="after-wrap">
      {top}
      {items.map((a) => <AfterItem key={a.id} a={a} raceId={r.id} u={u} today={today} raceDate={r.date} dayBefore={dayBefore} cand={cand} checkers={r.checkers} admins={admins} managers={managers} names={names} levels={levels} />)}
      {u.admin && r.date >= today && (
        <details className="after-add">
          <summary>출석 체크 위임{r.checkers.length ? ` (${r.checkers.join(", ")})` : ""}</summary>
          <div className="grid gap-2 mt-2">
            <span className="text-xs text-muted">운영진이 못 오면 크루원 한 명에게 당일 단사·뒷풀이 출석 체크를 맡길 수 있어요.</span>
            {r.checkers.map((n) => (
              <form key={n} action={removeChecker} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={n} />
                <b>{n}</b><ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2" message={`${n} 님의 출석 체크 위임을 취소할까요?`}>위임 취소</ConfirmButton>
              </form>
            ))}
            <ActionForm action={addChecker} className="grid-2" collapse>
              <input type="hidden" name="id" value={r.id} />
              <CheckerSelect />
              <div className="full"><Submit>위임하기</Submit></div>
            </ActionForm>
          </div>
        </details>
      )}
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
      </div>
    </div>
  );
}

function AfterItem({ a, raceId, u, today, raceDate, dayBefore, cand, checkers, admins, managers, names, levels }: { a: AfterFull; raceId: string; u: User; today: string; raceDate: string; dayBefore: string; cand: string[]; checkers: string[]; admins: Set<string>; managers: Set<string>; names: Record<string, string>; levels: Record<string, number> }) {
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
  const canCheck = u.admin || checkers.includes(u.nick); // 운영진, 또는 운영진이 출석 체크를 맡긴 크루원
  const openNow = (kind !== "carpool" && isDay) || (kind === "photo" && !!a.photo && !!a.place && today >= dayBefore && today <= raceDate);
  const canAbsent = (nick: string) => cand.includes(nick) && raceDate >= today;
  // 단사: 대회 참석자(참가·응원) 모두가 기본 명단, 못 오면 본인이 참석 불가. 뒷풀이: 평소엔 참석 신청자 목록, 당일엔 그 신청자로 출석 체크
  const showList = (kind === "photo" && !!a.photo && !!a.place) || (kind === "after" && isDay);
  const roster = [...new Set(kind === "after" ? [...a.yes, ...a.came] : [...cand, ...a.came])].sort((x, y) => x.localeCompare(y, "ko"));
  // 한 줄: 아이콘 · 시간 · 장소(제목) · 참석 수 / 누르면 참석 버튼·명단·운전자·메모·수정
  const count = kind === "carpool" ? `${a.yes.length}/${a.seats ?? 0}석` : kind === "after" ? (isDay ? `출석 ${a.came.length}/${roster.length}` : `${a.yes.length}명`) : "";
  return (
    <details className={`after-item k-${kind}`} open={mine === "yes" || openNow || undefined}>
      <summary className="after-line">
        <span className="after-ico" aria-hidden>{AFTER_ICON[kind]}</span>
        <b className="after-time num">{a.time || "--:--"}</b>
        <span className={`chip k-tag`}>{tag}</span>
        <span className="min-w-0 truncate">{title !== a.time ? title : ""}</span>
        {count && <span className={`chip ${mine === "yes" ? "chip-open" : ""} ml-auto shrink-0`}>{mine === "yes" ? "✓ " : ""}{count}</span>}
      </summary>
      <div className="grid gap-2 pt-2">
        <div className="grid gap-0.5 min-w-0">
          {a.placeUrl && <a href={a.placeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--lane)] underline">{a.place || "장소 보기"} 지도 ↗</a>}
          {a.address && <span className="text-xs text-muted">{a.address}</span>}
          {kind === "carpool" && <span className="text-sm" title="운전자"><WheelIcon /> <Nick n={driverOf(a)} admins={admins} managers={managers} names={names} levels={levels} /></span>}
          {a.memo && <span className="text-sm">{a.memo}</span>}
          {a.photo && <a href={`/api/after-photo/${a.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/after-photo/${a.id}`} alt="단체사진" loading="lazy" className="rounded-lg" style={{ maxWidth: "100%", maxHeight: 260 }} /></a>}
          <span className="text-xs text-muted"><Nick n={a.by} admins={admins} managers={managers} names={names} levels={levels} /> 님이 올림</span>
        </div>
        {kind !== "photo" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <RsvpButtons raceId={raceId} afterId={a.id} kind={kind} mine={mine} yes={a.yes.length} seats={a.seats} full={full} driver={driverOf(a) === u.nick} />
            {!(kind === "after" && isDay) && [...a.yes].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip"><MemberChip nick={n}><Nick n={n} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip></span>)}
            {!(kind === "after" && isDay) && [...a.no].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip cancelled" title="취소함"><MemberChip nick={n}><Nick n={n} admins={admins} managers={managers} names={names} levels={levels} /></MemberChip></span>)}
            {actions}
          </div>
        )}
        {showList && roster.length > 0 && (
          <div className="grid gap-1">
            <span className="text-xs text-muted">
              {kind === "after" ? "뒷풀이" : "단사"} {a.came.length > 0 || isDay ? "출석" : "참석 예정"} {isDay ? `${a.came.length}/${roster.length}` : roster.length}
              {a.no.length > 0 ? ` · 불참 ${a.no.length}` : ""}
              {canCheck && isDay ? `${u.admin ? " · 운영진: 온 사람을 누르면 출석 체크" : " · 출석 체크를 맡았어요: 온 사람을 누르세요"}${kind === "photo" ? " (내 이름은 두 번 누르면 참석 불가)" : ""}` : kind === "photo" && canAbsent(u.nick) ? " · 못 오면 내 닉네임을 눌러 참석 불가" : ""}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {roster.map((n) => {
                const on = a.came.includes(n), off = a.no.includes(n) && !on;
                const label = <>{on ? "✓ " : off ? "✕ " : ""}{n}</>;
                const cls = `came-chip ${on ? "on" : off ? "off" : ""}`;
                const adminCheck = canCheck && isDay;
                const mineAbsent = kind === "photo" && !adminCheck && n === u.nick && !on && raceDate >= today;
                if (adminCheck && kind === "photo" && n === u.nick) return <SelfChip key={n} raceId={raceId} afterId={a.id} nick={n} className={cls}>{label}</SelfChip>;
                if (!adminCheck && !mineAbsent) return <span key={n} className={cls}>{label}</span>;
                return (
                  <form key={n} action={adminCheck ? toggleCame : toggleAbsent}>
                    <input type="hidden" name="id" value={raceId} /><input type="hidden" name="after" value={a.id} />
                    {adminCheck && <input type="hidden" name="nick" value={n} />}
                    <button type="submit" className={cls} aria-pressed={on || off}>{label}</button>
                  </form>
                );
              })}
            </div>
          </div>
        )}
        {(kind === "photo" || kind === "after") && a.no.includes(u.nick) && !a.yes.includes(u.nick) && !a.came.includes(u.nick) && (
          <ActionForm action={setAbsentReason} keep hideInline className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={raceId} /><input type="hidden" name="after" value={a.id} />
            <input name="why" className="input" maxLength={40} defaultValue={a.why[u.nick]?.t ?? ""} placeholder="못 오는 이유 (짧게, 선택)" style={{ minHeight: 36, padding: "4px 10px" }} />
            <Submit className="btn btn-ghost text-xs py-1 px-2 shrink-0">저장</Submit>
          </ActionForm>
        )}
        {(kind === "photo" || kind === "after") && a.no.filter((n) => a.why[n]).sort((x, y) => a.why[x].at - a.why[y].at).map((n) => (
          <div key={n} className="why-comment"><b>{n}</b><span>{a.why[n].t}</span><time className="text-xs text-muted">{new Date(a.why[n].at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", "/")}</time></div>
        ))}
        {kind === "photo" && actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
    </details>
  );
}
