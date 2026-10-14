import Link from "next/link";
import { redirect } from "next/navigation";
import { WEEK, currentUser, getAdminNicks, isStaffAccount, fmtRaceDate, driverOf, getMembers, getRaces, kstNow, kstToday, regInfo, type AfterFull, type AfterKind, type RaceFull, type User } from "@/lib/hub";
import { addAfter, deleteAfter, updateAfter, joinRace, leaveRace, toggleCheer } from "@/app/actions";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { Nick } from "@/components/crown";
import { cache } from "react";
import RsvpButtons from "@/components/rsvp-buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "대회 일정" };

const COURSES = ["5K", "10K", "Half", "Full"];
const VIEWS = { upcoming: "다가오는 대회", cal: "달력", reg: "접수 일정", mine: "내 참가", past: "지난 대회", all: "전체" } as const;
type View = keyof typeof VIEWS;

export default async function RacesPage({ searchParams }: { searchParams: Promise<{ view?: string; m?: string; d?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const { view: v, m: mParam, d: dParam } = await searchParams;
  const view: View = v && v in VIEWS ? (v as View) : "upcoming";
  const today = kstToday();
  const [all, admins] = await Promise.all([getRaces(), getAdminNicks()]);
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
      <header className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="hub-h1">대회 일정</h1>
          <details className="dropdown">
            <summary className={view === "past" || view === "all" ? "on" : ""}>{view === "past" ? "지난 대회" : view === "all" ? "전체 대회" : "지난·전체"} ▾</summary>
            <div className="dropdown-menu">
              <Link href="/races?view=past" aria-current={view === "past" ? "page" : undefined}>지난 대회</Link>
              <Link href="/races?view=all" aria-current={view === "all" ? "page" : undefined}>전체 대회</Link>
            </div>
          </details>
        </div>
        <p className="text-sm text-muted">나갈 대회에 코스를 골라 참가하세요.</p>
      </header>

      <nav className="tabs" aria-label="보기">
        {(Object.keys(VIEWS) as View[]).filter((k) => k !== "past" && k !== "all").map((k) => (
          <Link key={k} href={`/races?view=${k}`} aria-current={k === view ? "page" : undefined}>{VIEWS[k]}</Link>
        ))}
        <Link href="/races/find" className="tab-tinted">+ 대회 찾기</Link>
      </nav>


      {view === "cal" && <RaceCalendar races={all} u={u} admins={admins} today={today} ym={/^\d{4}-\d{2}$/.test(mParam ?? "") ? mParam! : today.slice(0, 7)} day={dParam} />}

      {view !== "cal" && list.length === 0 && <p className="text-sm text-muted">{view === "reg" ? "접수 중이거나 접수 예정인 대회가 없어요. 대회 정보에 접수 시작·마감을 넣으면 여기에 보여요." : "해당하는 대회가 없어요."}</p>}

      {[...groups].map(([ym, races]) => (
        <section key={ym} className="grid gap-2">
          <h2 className="label">{ym.slice(0, 4)}년 {Number(ym.slice(5))}월</h2>
          <div className="grid gap-3">
            {races.map((r) => <RaceCard key={r.id} r={r} u={u} admins={admins} past={r.date < today} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

/** 달력 보기: 한 달 칸마다 대회 이름, 날짜를 누르면 그날 대회 카드가 아래에 열린다 */
function RaceCalendar({ races, u, admins, today, ym, day }: { races: RaceFull[]; u: User; admins: Set<string>; today: string; ym: string; day?: string }) {
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
                <span key={r.id} className={`rcal-r ${r.participants.some((p) => p.nick === u.nick) ? "mine" : ""}`}>{r.name.replace(/^(제?\d+회|20\d\d)\s*/, "")}</span>
              ))}
              {rs.length > 2 && <span className="rcal-more">+{rs.length - 2}</span>}
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-muted">진하게 칠한 대회는 내가 참가 신청한 대회예요.</p>
      {sel > 0 && (
        <div className="grid gap-3">
          <h3 className="label">{m}월 {sel}일 대회</h3>
          {picked.length === 0 && <p className="text-sm text-muted">이날은 대회가 없어요.</p>}
          {picked.map((r) => <RaceCard key={r.id} r={r} u={u} admins={admins} past={r.date < today} />)}
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

function RaceCard({ r, u, admins, past }: { r: RaceFull; u: User; admins: Set<string>; past: boolean }) {
  // 대회까지 남은 날(오늘 = 0, 지났으면 음수), 한국 날짜 기준
  const dd = Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${kstToday()}T00:00:00Z`)) / 86400000);
  const d = fmtRaceDate(r.date);
  const me = r.participants.find((p) => p.nick === u.nick);
  const reg = regInfo(r);
  return (
    <article id={r.id} className={`panel p-4 grid gap-3 ${dd >= 0 && dd <= 3 ? "race-gold keep-motion" : ""}`} style={past ? { opacity: 0.8 } : undefined}>
      <div className="flex gap-3 items-start">
        <span className="datebox"><b>{d.md}</b><span>{d.w}요일</span></span>
        <div className="min-w-0 grid gap-0.5" style={{ flex: 1 }}>
          <h3 className="font-bold text-lg leading-snug flex flex-wrap items-center gap-x-2 gap-y-1">
            {r.name}
            <span className={`chip dday ${dd < 0 ? "past" : dd === 0 ? "today" : dd <= 3 ? "gold keep-motion" : dd <= 7 ? "soon" : ""}`}>{dd < 0 ? "종료" : dd === 0 ? "D-DAY" : `D-${dd}`}</span>
            <span className="chip count-badge" aria-label={`크루 참가 ${r.participants.length}명`}>👥 {r.participants.length}명</span>
          </h3>
          <p className="text-sm text-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>{r.time ? `${r.time} 출발 · ` : ""}{r.place || "장소 미정"}</span>
            {reg.text && (
              <>
                <span aria-hidden>·</span>
                {reg.status === "open" && !past && <span className="chip chip-open">접수중</span>}
                {reg.status === "soon" && !past && <span className="chip chip-warn">접수예정</span>}
                {reg.status === "closed" && !past && <span className="chip chip-failed">접수마감</span>}
                <span>접수 {reg.text}</span>
              </>
            )}
          </p>
          {r.note && <p className="text-sm break-all"><Linkify text={r.note} /></p>}
        </div>
        {!past && !isStaffAccount(u) && (
          <Submit form={`join-${r.id}`} className="btn btn-primary text-sm py-1.5 px-4 shrink-0">{me ? "코스 변경" : "참가 신청"}</Submit>
        )}
      </div>

      <div className="grid gap-1.5">
        {r.participants.length === 0 && <span className="text-sm text-muted">아직 없어요.</span>}
        <div className="grid gap-1.5">
          {groupByCourse(r.participants).map((g) => (
            <div key={g.key} className="pgroup">
              <span className="pgroup-l">{g.label}<small>{g.list.length}</small></span>
              <div className="flex flex-wrap gap-1.5">
                {g.list.map((p) => (
                  <span key={p.nick} className={`pchip ${p.nick === u.nick ? "me" : ""}`}>
                    <Nick n={p.nick} admins={admins} />
                    {p.nick === u.nick && !past && (
                      <form action={leaveRace} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="nick" value={p.nick} />
                        <button type="submit" aria-label={`${p.nick} 참가 취소`}>✕</button>
                      </form>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!past && !isStaffAccount(u) && (
        <ActionForm action={joinRace} className="join-form" id={`join-${r.id}`}>
          <input type="hidden" name="id" value={r.id} />
          <span className="label">{me ? `내 코스: ${me.course || "미정"}` : "코스 선택"}</span>
          <div className="course-row" role="radiogroup" aria-label="코스">
            {COURSES.map((c) => (
              <label key={c} className="cchip">
                <input type="radio" name="course" value={c} defaultChecked={me?.course === c} />
                <span>{c}</span>
              </label>
            ))}
            <input name="courseEtc" className="input cchip-etc" placeholder="직접입력" maxLength={20} aria-label="코스 직접입력" />
          </div>
        </ActionForm>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label">📣 응원 {r.cheers.length}명</span>
        {[...r.cheers].sort((a, b) => a.localeCompare(b, "ko")).map((n) => (
          <span key={n} className={`pchip cheer ${n === u.nick ? "me" : ""}`}>
            <Nick n={n} admins={admins} />
          </span>
        ))}
        {!past && u.nick !== "운영진" && (
          <form action={toggleCheer} className="ml-auto">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="nick" value={u.nick} />
            <button className={`btn cheer-btn text-sm py-1.5 px-3 ${r.cheers.includes(u.nick) ? "is-on" : ""}`}>
              {r.cheers.includes(u.nick) ? "응원 가요 ✓" : "응원 갈게요"}
            </button>
          </form>
        )}
      </div>

      <AfterParties r={r} u={u} admins={admins} />

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

const crewNicks = cache(async () => (await getMembers()).map((m) => m.nick).filter((n) => n !== "운영진").sort((a, b) => a.localeCompare(b, "ko")));

/** 카풀 운전자 고르기: 기본은 올리는 나, 다른 크루원도 고를 수 있다 */
async function DriverSelect({ me, value }: { me: string; value?: string }) {
  const nicks = await crewNicks();
  return (
    <label className="field full"><span className="label">운전자</span>
      <select name="driver" className="input" defaultValue={value ?? me}>
        {nicks.map((n) => <option key={n} value={n}>{n}{n === me ? " (나)" : ""}</option>)}
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
                <label className="field"><span className="label">장소</span><input name="place" className="input" defaultValue={a?.place} maxLength={60} placeholder="예: 출발선 왼쪽 R2U 깃발" /></label>
              </>}
              {kind === "carpool" && <>
                <DriverSelect me={me} value={a ? driverOf(a) : undefined} />
                <label className="field"><span className="label">출발지</span><input name="place" className="input" defaultValue={a?.place} maxLength={60} placeholder="예: 삼산 롯데백화점 앞" /></label>
                <label className="field"><span className="label">출발 시간</span><input name="time" type="time" className="input" defaultValue={a?.time} /></label>
                <label className="field"><span className="label">태울 수 있는 자리</span><input name="seats" type="number" defaultValue={a?.seats} inputMode="numeric" min={1} max={10} className="input" placeholder="예: 3" required /></label>
              </>}
              {kind === "after" && <>
                <label className="field"><span className="label">장소</span><input name="place" className="input" defaultValue={a?.place} maxLength={60} placeholder="예: 태화강 국밥집" /></label>
                <label className="field"><span className="label">시간</span><input name="time" type="time" className="input" defaultValue={a?.time} /></label>
              </>}
              <label className="field full"><span className="label">내용</span><input name="memo" className="input" defaultValue={a?.memo} maxLength={200} placeholder="기타 공유 사항" /></label>
    </>
  );
}

function AfterParties({ r, u, admins }: { r: RaceFull; u: User; admins: Set<string> }) {
  const order: AfterKind[] = ["photo", "carpool", "after"];
  const items = [...r.afters].sort((a, b) => order.indexOf(kindOf(a)) - order.indexOf(kindOf(b)) || a.at - b.at);
  return (
    <div className="after-wrap">
      {items.map((a) => <AfterItem key={a.id} a={a} raceId={r.id} u={u} admins={admins} />)}
      <div className="after-adds">
        {KINDS.map((k) => (
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

function AfterItem({ a, raceId, u, admins }: { a: AfterFull; raceId: string; u: User; admins: Set<string> }) {
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
          <div className="full"><Submit>수정 저장</Submit></div>
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
  return (
    <div className={`after-item k-${kind}`}>
      <div className="flex items-start gap-2">
        <span className={`chip k-tag`}>{tag}</span>
        <div className="min-w-0 grid gap-0.5" style={{ flex: 1 }}>
          <b className="leading-snug">{title}{a.time && title !== a.time && <span className="text-muted font-normal"> · {a.time}</span>}</b>
          {kind === "carpool" && <span className="text-sm" title="운전자"><span aria-label="운전자">🚗</span> <Nick n={driverOf(a)} admins={admins} /></span>}
          {a.memo && <span className="text-sm">{a.memo}</span>}
        </div>
        <span className="text-xs text-muted text-right shrink-0 ml-auto self-start leading-snug"><><Nick n={a.by} admins={admins} /> 님이 올림</></span>
      </div>
      {kind !== "photo" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <RsvpButtons raceId={raceId} afterId={a.id} kind={kind} mine={mine} yes={a.yes.length} seats={a.seats} full={full} driver={driverOf(a) === u.nick} />
          {[...a.yes].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip"><Nick n={n} admins={admins} /></span>)}
          {[...a.no].sort((x, y) => x.localeCompare(y, "ko")).map((n) => <span key={n} className="pchip cancelled" title="취소함"><Nick n={n} admins={admins} /></span>)}
          {actions}
        </div>
      )}
      {kind === "photo" && actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
