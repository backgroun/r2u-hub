import Link from "next/link";
import { CrownIcon } from "@/components/crown";
import { redirect } from "next/navigation";
import { currentUser, isStaffAccount, fmtRaceDate, getLinks, getMembers, getMenu, getMonth, getRaces, getSheets, kstToday, redis, MENU_DEFAULTS, type Link as HubLink, type MenuKey, type RaceFull } from "@/lib/hub";
import { addCheer, setDay, setGoal, deleteAfter, deleteRace, joinRace, leaveRace, removeRsvp, resetMonthRecord, toggleCheer, updateAfter, addMembers, changePassword, linkAction, memberAction, postNotice, removeNotice, decideJoin, saveBingoSecret, saveEventPeriod, saveLink, saveMenu, syncMembersAction } from "@/app/actions";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { bingoRpc, eventStart, hubPeriod } from "@/lib/event";
import { listJoins, pendingJoinCount } from "@/lib/join";
import { getNotices, noticeState, pushReady, subCount } from "@/lib/notice";
import SheetSync from "@/components/sheet-sync";
import LogoutButton from "@/components/logout-button";
import RaceForm from "@/components/race-form";
import GroupbuyStaff from "@/components/groupbuy-staff";
import { rankMonth, shiftYm } from "@/lib/rank";

export const dynamic = "force-dynamic";
export const metadata = { title: "운영진" };

const TABS = { members: "회원", content: "게시물", notice: "공지", menu: "메뉴", links: "링크", races: "대회", groupbuy: "공구", bingo: "이벤트", me: "내 비밀번호" } as const;
type Tab = keyof typeof TABS;
const TAGS = ["커뮤니티", "기록", "공지", "이벤트", "공구", "기타"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; sec?: string; m?: string; past?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login?next=/admin");
  const { tab: t, sec, m, past } = await searchParams;
  const tab: Tab = t && t in TABS ? (t as Tab) : u.admin ? "members" : "me";
  if (!u.admin && tab !== "me") redirect("/admin?tab=me");
  const todo: Partial<Record<Tab, number>> = u.admin ? { members: await pendingJoinCount() } : {};

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <h1 className="hub-h1">{u.admin ? "운영진 관리" : "내 계정"}</h1>
        {u.admin && <p className="text-sm text-muted">회원·메뉴·대회·공구·이벤트를 한곳에서 관리해요.</p>}
      </header>
      {u.admin && (
        <nav className="tabs" aria-label="관리 메뉴">
          {(Object.keys(TABS) as Tab[]).filter((k) => k !== "me" || isStaffAccount(u)).map((k) => (
            <Link key={k} href={`/admin?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{TABS[k]}{todo[k] ? <b className="tab-badge inline">{todo[k]}</b> : null}</Link>
          ))}
        </nav>
      )}
      {tab === "members" && <Members self={u.nick} />}
      {tab === "content" && <Content sec={sec} ym={m} />}
      {tab === "notice" && <Notices />}
      {tab === "menu" && <Menu />}
      {tab === "links" && <Links />}
      {tab === "races" && <Races past={past === "1"} />}
      {tab === "groupbuy" && <Groupbuy />}
      {tab === "bingo" && <Bingo />}
      {tab === "me" && <Me />}
    </main>
  );
}

async function Notices() {
  const [list, subs] = await Promise.all([getNotices(), subCount()]);
  return (
    <section className="grid gap-3">
      <ActionForm action={postNotice} className="panel p-4 grid gap-3">
        <h2 className="font-bold">공지 올리기</h2>
        <p className="text-sm text-muted">올리면 홈 화면 맨 위에 보여요. 알림을 켠 크루원 {subs}명에게는 휴대폰 알림도 가요.{pushReady() ? "" : " (알림용 키가 아직 설정되지 않아 알림은 가지 않아요)"}</p>
        <label className="field"><span className="label">제목</span><input name="title" className="input" required maxLength={60} /></label>
        <label className="field"><span className="label">내용 (선택)</span><textarea name="body" className="input" rows={4} maxLength={500} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field"><span className="label">노출 시작일 (선택)</span><input name="from" type="date" className="input" /></label>
          <label className="field"><span className="label">노출 종료일 (선택)</span><input name="to" type="date" className="input" /></label>
        </div>
        <p className="text-xs text-muted">비워 두면 바로, 계속 보여요. 시작일이 오늘보다 뒤면 그날부터 보이고 알림은 보내지 않아요. 여러 공지가 보일 때는 가장 최근 것이 홈에 떠요.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="push" defaultChecked /> 알림도 보내기</label>
        <div><Submit>공지 올리기</Submit></div>
      </ActionForm>
      <div className="panel p-4 grid gap-3">
        <h2 className="font-bold">올린 공지 ({list.length})</h2>
        {list.length === 0 && <p className="text-sm text-muted">아직 올린 공지가 없어요.</p>}
        {list.map((n) => (
          <div key={n.id} className="grid gap-1 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
            <div className="flex items-start justify-between gap-2">
              <b>{n.title}</b>
              <form action={removeNotice}><input type="hidden" name="id" value={n.id} /><ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2">삭제</ConfirmButton></form>
            </div>
            {n.body && <p className="text-sm text-muted whitespace-pre-wrap">{n.body}</p>}
            <p className="text-xs text-muted">
              {new Date(n.at + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} · {n.by}
              {" · "}{n.from || n.to ? `노출 ${n.from ?? "처음"} ~ ${n.to ?? "계속"}` : "기간 제한 없음"}
              {" · "}<b>{{ live: "노출 중", scheduled: "노출 예정", ended: "노출 종료" }[noticeState(n, kstToday())]}</b>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

async function Members({ self }: { self: string }) {
  const [members, sheets, joins] = await Promise.all([getMembers(), getSheets(), listJoins()]);
  const pending = joins.filter((j) => j.status === "pending");
  const waiting = members.filter((m) => !m.pw).length;
  return (
    <section className="grid gap-4">
      {pending.length > 0 && (
        <div className="panel panel-alert p-4 grid gap-3">
          <h2 className="font-bold">🙋 닉네임 생성 요청 ({pending.length})</h2>
          <p className="text-sm text-muted">카톡방으로 온 요청 링크를 열어서 승인할 수도 있어요. 승인하면 회원이 만들어지고 구글시트에도 추가돼요.</p>
          {pending.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
              <div className="min-w-0"><b>{j.nick}</b> <span className="text-xs text-muted">{new Date(j.at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ")}</span></div>
              <div className="flex gap-1.5 shrink-0">
                <form action={decideJoin}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="act" value="approve" /><button className="btn btn-primary text-sm py-1 px-3">승인</button></form>
                <form action={decideJoin}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="act" value="reject" /><button className="btn btn-ghost btn-danger text-sm py-1 px-3">거절</button></form>
              </div>
            </div>
          ))}
        </div>
      )}
      <SheetSync
        title="구글시트로 회원 동기화"
        help="시트 탭의 A열에 닉네임을 적고(머리글 ‘닉네임’ 아래부터), 이 버튼을 누르면 새 닉네임이 회원으로 추가돼요. C열 ‘닉네임(이벤트)’의 닉네임은 이벤트 참가자로 불러와요. 시트에서 빠진 회원은 자동으로 지우지 않고 알려만 드려요."
        url={sheets.members} action={syncMembersAction} button="회원 동기화"
      />
      <ActionForm action={addMembers} className="panel p-4 grid gap-3">
        <h2 className="font-bold">크루원 추가</h2>
        <label className="field">
          <span className="label">닉네임 (여러 명은 쉼표나 줄바꿈으로 구분)</span>
          <textarea name="names" rows={2} className="input" placeholder="예: 달려, 뽀까" required />
        </label>
        <div><Submit>추가</Submit></div>
      </ActionForm>
      <p className="text-sm text-muted">전체 {members.length}명 · 비밀번호 미설정 {waiting}명 (첫 로그인 때 직접 정해요). 비밀번호를 잊은 크루원은 ‘비번 초기화’ 후 다시 정하게 하세요.</p>
      {(() => {
        const staff = members.filter((m) => m.role === "admin" && m.nick !== "운영진");
        const crew = members.filter((m) => m.role !== "admin");
        return (
          <>
            <h3 className="label"><CrownIcon size={13} />운영진 {staff.length}명</h3>
            <div className="row-list">
              {staff.length === 0 && <p className="py-3 text-sm text-muted">아직 운영진으로 지정한 크루원이 없어요.</p>}
              {staff.map((m) => <MemberRow key={m.nick} m={m} self={self} />)}
            </div>
            <h3 className="label">크루원 {crew.length}명</h3>
            <div className="row-list">
              {crew.map((m) => <MemberRow key={m.nick} m={m} self={self} />)}
            </div>
          </>
        );
      })()}
    </section>
  );
}

/** 회원 한 줄: 위에 이름·상태, 아래 오른쪽에 작은 버튼들 */
function MemberRow({ m, self }: { m: { nick: string; role: string; pw: string | null }; self: string }) {
  const admin = m.role === "admin";
  return (
    <div className="member-row">
      <span className="member-name">
        <b>{admin && <CrownIcon />}{m.nick}</b>
        {!m.pw && <span className="chip chip-warn">비번 미설정</span>}
      </span>
      <span className="member-actions">
        {m.pw && <MemberBtn nick={m.nick} act="reset" label="비번 초기화" />}
        {m.nick !== self && <MemberBtn nick={m.nick} act="role" label={admin ? "운영진 해제" : "운영진 지정"} />}
        {m.nick !== self && (
          <form action={memberAction}>
            <input type="hidden" name="nick" value={m.nick} /><input type="hidden" name="act" value="delete" />
            <ConfirmButton className="btn btn-ghost btn-danger text-xs">삭제</ConfirmButton>
          </form>
        )}
      </span>
    </div>
  );
}

function MemberBtn({ nick, act, label, disabled }: { nick: string; act: string; label: string; disabled?: boolean }) {
  return (
    <form action={memberAction}>
      <input type="hidden" name="nick" value={nick} /><input type="hidden" name="act" value={act} />
      <button className="btn btn-ghost text-xs" disabled={disabled}>{label}</button>
    </form>
  );
}

/* ---------- 게시물: 크루원이 올린 내용 고치기·지우기 ---------- */
const SECS = { posts: "단사·카풀·뒷풀이", entries: "참가·응원", monthly: "월간 기록", added: "추가한 대회" } as const;
type Sec = keyof typeof SECS;
const KIND_TAG = { photo: "단사", carpool: "카풀", after: "뒷풀이" } as const;

async function Content({ sec: s0, ym: m0 }: { sec?: string; ym?: string }) {
  const sec: Sec = s0 && s0 in SECS ? (s0 as Sec) : "posts";
  const today = kstToday();
  return (
    <section className="grid gap-4">
      <p className="text-sm text-muted">크루원이 올리거나 입력한 내용을 고치거나 지울 수 있어요.</p>
      <nav className="tabs" aria-label="게시물 종류">
        {(Object.keys(SECS) as Sec[]).map((k) => (
          <Link key={k} href={`/admin?tab=content&sec=${k}`} aria-current={k === sec ? "page" : undefined}>{SECS[k]}</Link>
        ))}
      </nav>
      {sec === "posts" && <Posts today={today} />}
      {sec === "entries" && <Entries today={today} />}
      {sec === "monthly" && <MonthlyRecords ym={/^\d{4}-\d{2}$/.test(m0 ?? "") ? m0! : today.slice(0, 7)} />}
      {sec === "added" && <AddedRaces />}
    </section>
  );
}

const raceLabel = (r: RaceFull) => { const d = fmtRaceDate(r.date); return `${d.md}(${d.w}) ${r.name}`; };

async function Posts({ today }: { today: string }) {
  const races = (await getRaces()).filter((r) => r.afters.length);
  races.sort((a, b) => (a.date >= today ? 0 : 1) - (b.date >= today ? 0 : 1) || a.date.localeCompare(b.date));
  if (!races.length) return <p className="text-sm text-muted">올라온 단사·카풀·뒷풀이 글이 없어요.</p>;
  return (
    <div className="grid gap-4">
      {races.map((r) => (
        <div key={r.id} className="grid gap-2">
          <h3 className="label">{raceLabel(r)}</h3>
          {r.afters.map((a) => {
            const kind = a.kind ?? "after";
            return (
              <div key={a.id} className="panel p-4 grid gap-2">
                <div className="flex items-center gap-2">
                  <span className="chip k-tag" style={{ background: "var(--fill)" }}>{KIND_TAG[kind]}</span>
                  <span className="text-sm text-muted mr-auto">{a.by} 님이 올림</span>
                  <form action={deleteAfter}>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="after" value={a.id} />
                    <ConfirmButton className="btn btn-ghost btn-danger text-xs">글 삭제</ConfirmButton>
                  </form>
                </div>
                <ActionForm action={updateAfter} className="grid-2" keep>
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="after" value={a.id} />
                  <label className="field"><span className="label">{kind === "carpool" ? "출발지" : "장소"}</span><input name="place" className="input" defaultValue={a.place} maxLength={60} /></label>
                  <label className="field"><span className="label">시간</span><input name="time" className="input" defaultValue={a.time} maxLength={30} /></label>
                  {kind === "carpool" && <label className="field"><span className="label">자리 수</span><input name="seats" type="number" min={1} max={10} className="input" defaultValue={a.seats} /></label>}
                  <label className="field full"><span className="label">내용</span><input name="memo" className="input" defaultValue={a.memo} maxLength={200} /></label>
                  <div className="full"><Submit className="btn text-sm">수정 저장</Submit></div>
                </ActionForm>
                {kind !== "photo" && (a.yes.length + a.no.length > 0) && (
                  <div className="grid gap-1.5">
                    <span className="label">{kind === "carpool" ? "탑승" : "참석·불참"} (✕로 빼기)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[...a.yes.map((n) => [n, kind === "carpool" ? "탑승" : "참석"]), ...a.no.map((n) => [n, "불참"])].map(([n, v]) => (
                        <span key={n} className="pchip">{n}<span className="text-muted">· {v}</span>
                          <form action={removeRsvp} className="inline"><input type="hidden" name="after" value={a.id} /><input type="hidden" name="nick" value={n} />
                            <button type="submit" aria-label={`${n} 빼기`}>✕</button></form>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

async function Entries({ today }: { today: string }) {
  const [all, members] = await Promise.all([getRaces(), getMembers()]);
  const races = all.filter((r) => r.date >= today);
  const crew = members.map((x) => x.nick).filter((n) => n !== "운영진");
  if (!races.length) return <p className="text-sm text-muted">다가오는 대회가 없어요.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">다가오는 대회만 보여요. 크루원을 참가자·응원으로 넣거나, 코스를 고치거나, 뺄 수 있어요.</p>
      {races.map((r) => (
        <div key={r.id} className="panel p-4 grid gap-3">
          <h3 className="font-bold">{raceLabel(r)}</h3>
          {r.participants.length > 0 && (
            <div className="row-list" style={{ background: "var(--fill)" }}>
              {r.participants.map((p) => (
                <div key={p.nick} className="flex items-center gap-2 py-2">
                  <span className="font-bold" style={{ minWidth: 64 }}>{p.nick}</span>
                  <ActionForm action={joinRace} className="flex gap-1.5 items-center" keep>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={p.nick} />
                    <input name="courseEtc" className="input" defaultValue={p.course} maxLength={20} style={{ width: 90, minHeight: 34 }} aria-label={`${p.nick} 코스`} />
                    <Submit className="btn text-xs">저장</Submit>
                  </ActionForm>
                  <form action={leaveRace} className="ml-auto">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={p.nick} />
                    <ConfirmButton className="btn btn-ghost btn-danger text-xs">빼기</ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          )}
          <ActionForm action={joinRace} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="id" value={r.id} />
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="참가자로 넣을 크루원">
              <option value="" disabled>참가자 추가</option>
              {crew.filter((n) => !r.participants.some((p) => p.nick === n)).map((n) => <option key={n}>{n}</option>)}
            </select>
            <input name="courseEtc" className="input" placeholder="코스" maxLength={20} required style={{ width: 76 }} aria-label="코스" />
            <Submit className="btn text-xs">추가</Submit>
          </ActionForm>
          <ActionForm action={addCheer} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="id" value={r.id} />
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="응원으로 넣을 크루원">
              <option value="" disabled>응원 추가</option>
              {crew.filter((n) => !r.cheers.includes(n)).map((n) => <option key={n}>{n}</option>)}
            </select>
            <Submit className="btn text-xs">추가</Submit>
          </ActionForm>
          {r.cheers.length > 0 && (
            <div className="grid gap-1.5">
              <span className="label">응원 (✕로 빼기)</span>
              <div className="flex flex-wrap gap-1.5">
                {r.cheers.map((n) => (
                  <span key={n} className="pchip">{n}
                    <form action={toggleCheer} className="inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={n} />
                      <button type="submit" aria-label={`${n} 응원 빼기`}>✕</button></form>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

async function MonthlyRecords({ ym }: { ym: string }) {
  const [rec, members] = await Promise.all([getMonth(ym), getMembers()]);
  const rows = rankMonth(rec).filter((r) => (r.goal > 0 || r.km > 0) && r.nick !== "운영진").sort((a, b) => b.km - a.km);
  const crew = members.map((x) => x.nick).filter((n) => n !== "운영진");
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
  const [y, mm] = ym.split("-").map(Number);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Link href={`/admin?tab=content&sec=monthly&m=${shiftYm(ym, -1)}`} className="btn btn-ghost">←</Link>
        <b>{y}년 {mm}월 · {rows.length}명</b>
        <Link href={`/admin?tab=content&sec=monthly&m=${shiftYm(ym, 1)}`} className="btn btn-ghost">→</Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">이 달에는 기록이 없어요.</p> : (
        <div className="row-list">
          {rows.map((r) => (
            <div key={r.nick} className="flex items-center gap-2 py-2.5">
              <span className="font-bold mr-auto">{r.nick} <span className="text-sm text-muted font-normal num">{r.km}km / 목표 {r.goal || "–"} · {Object.keys(r.days).length}일</span></span>
              <form action={resetMonthRecord}>
                <input type="hidden" name="ym" value={ym} /><input type="hidden" name="nick" value={r.nick} />
                <ConfirmButton className="btn btn-ghost btn-danger text-xs">기록 지우기</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
      )}
      <details className="panel p-4">
        <summary className="font-bold">크루원 기록 고치기</summary>
        <div className="grid gap-3 mt-3">
          <ActionForm action={setGoal} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="ym" value={ym} /><input type="hidden" name="admin" value="1" />
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="크루원"><option value="" disabled>크루원</option>{crew.map((n) => <option key={n}>{n}</option>)}</select>
            <input name="goal" type="number" min={1} max={2000} className="input" placeholder="목표 km" required style={{ width: 92 }} />
            <Submit className="btn text-xs">목표 저장</Submit>
          </ActionForm>
          <ActionForm action={setDay} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="ym" value={ym} />
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="크루원"><option value="" disabled>크루원</option>{crew.map((n) => <option key={n}>{n}</option>)}</select>
            <select name="day" className="input" defaultValue="1" style={{ width: 72 }} aria-label="날짜">{Array.from({ length: last }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}</select>
            <input name="km" type="number" step="0.01" min={0} max={300} className="input" placeholder="km" required style={{ width: 72 }} />
            <Submit className="btn text-xs">저장</Submit>
          </ActionForm>
          <p className="text-xs text-muted">날짜 기록은 그날 합계로 저장돼요(0이면 지우기). 운영진이 바꾼 목표는 크루원의 목표 수정 횟수에 들어가지 않아요.</p>
        </div>
      </details>
      <p className="text-xs text-muted">‘기록 지우기’는 그 달 목표와 기록을 모두 지워요.</p>
    </div>
  );
}

async function AddedRaces() {
  const races = (await getRaces()).filter((r) => r.src);
  if (!races.length) return <p className="text-sm text-muted">대회 찾기로 추가한 대회가 없어요.</p>;
  return (
    <div className="row-list">
      {races.map((r) => (
        <div key={r.id} className="flex items-center gap-2 py-2.5">
          <span className="min-w-0 mr-auto grid">
            <b className="truncate">{raceLabel(r)}</b>
            <span className="text-xs text-muted">{r.addedBy ? `${r.addedBy} 님이 추가` : "대회 찾기로 추가"} · 참가 {r.participants.length}명</span>
          </span>
          <Link href={`/races?view=all#${r.id}`} className="btn text-xs">수정</Link>
          <form action={deleteRace}>
            <input type="hidden" name="id" value={r.id} />
            <ConfirmButton className="btn btn-ghost btn-danger text-xs">삭제</ConfirmButton>
          </form>
        </div>
      ))}
    </div>
  );
}

const MENU_LABELS: Record<MenuKey, string> = { races: "대회 (/races)", monthly: "월간기록 (/monthly)", groupbuy: "공구 (/groupbuy)", bingo: "이벤트 (/event)" };

async function Menu() {
  const menu = await getMenu();
  return (
    <ActionForm action={saveMenu} className="panel p-4 grid gap-3" keep>
      <h2 className="font-bold">상단 메뉴 이름</h2>
      <p className="text-sm text-muted">상단 메뉴에 보이는 이름이에요. 비워 두면 기본 이름으로 돌아가요. 12자까지, 짧을수록 휴대폰에서 잘 보여요.</p>
      <div className="grid-2">
        {(Object.keys(MENU_DEFAULTS) as MenuKey[]).map((k) => (
          <label key={k} className="field">
            <span className="label">{MENU_LABELS[k]} · 기본 “{MENU_DEFAULTS[k]}”</span>
            <input name={k} className="input" maxLength={12} defaultValue={menu[k]} placeholder={MENU_DEFAULTS[k]} />
          </label>
        ))}
      </div>
      <div><Submit>저장</Submit></div>
    </ActionForm>
  );
}

async function Links() {
  const links = await getLinks();
  return (
    <section className="grid gap-4">
      <p className="text-sm text-muted">홈 화면 ‘바로가기’에 보이는 링크예요. 상단 메뉴(대회·월간기록·공구·이벤트)에 없는 밴드, 단톡방 같은 외부 링크를 넣으세요.</p>
      <div className="panel p-4 grid gap-1">
        <h2 className="font-bold">새 링크</h2>
        <LinkForm />
      </div>
      <div className="row-list">
        {links.length === 0 && <p className="py-4 text-sm text-muted">등록된 링크가 없어요.</p>}
        {links.map((l, i) => (
          <div key={l.id} className="py-3 px-1 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag">{l.tag}</span>
              <span className="font-bold mr-auto min-w-0">{l.title}</span>
              <LinkBtn id={l.id} act="up" label="↑" disabled={i === 0} />
              <LinkBtn id={l.id} act="down" label="↓" disabled={i === links.length - 1} />
              <form action={linkAction}>
                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="act" value="delete" />
                <ConfirmButton>삭제</ConfirmButton>
              </form>
            </div>
            <p className="text-sm text-muted break-all">{l.url}</p>
            <details>
              <summary className="text-sm text-muted cursor-pointer">수정</summary>
              <LinkForm l={l} />
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinkBtn({ id, act, label, disabled }: { id: string; act: string; label: string; disabled?: boolean }) {
  return (
    <form action={linkAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="act" value={act} />
      <button className="btn btn-ghost text-sm py-1.5 px-2.5" disabled={disabled} aria-label={act === "up" ? "위로" : "아래로"}>{label}</button>
    </form>
  );
}

function LinkForm({ l }: { l?: HubLink }) {
  return (
    <ActionForm action={saveLink} className="grid-2 mt-2" keep={!!l}>
      {l && <input type="hidden" name="id" value={l.id} />}
      <label className="field"><span className="label">이름</span><input name="title" className="input" required maxLength={40} defaultValue={l?.title} /></label>
      <label className="field"><span className="label">분류</span>
        <select name="tag" className="input" defaultValue={l?.tag ?? "커뮤니티"}>{TAGS.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="field full"><span className="label">주소</span><input name="url" type="url" className="input" required placeholder="https://" defaultValue={l?.url} /></label>
      <label className="field full"><span className="label">한 줄 설명</span><input name="desc" className="input" maxLength={80} defaultValue={l?.desc} /></label>
      <div className="full"><Submit>{l ? "수정 저장" : "링크 추가"}</Submit></div>
    </ActionForm>
  );
}

async function Races({ past }: { past: boolean }) {
  const today = kstToday();
  const all = await getRaces();
  const races = past ? all.filter((r) => r.date < today).reverse() : all.filter((r) => r.date >= today);
  return (
    <section className="grid gap-3">
      <details className="panel p-4">
        <summary className="font-bold">+ 대회 추가</summary>
        <RaceForm />
      </details>
      <nav className="tabs" aria-label="대회 목록">
        <Link href="/admin?tab=races" aria-current={!past ? "page" : undefined}>다가오는 대회 {all.filter((r) => r.date >= today).length}</Link>
        <Link href="/admin?tab=races&past=1" aria-current={past ? "page" : undefined}>지난 대회 {all.filter((r) => r.date < today).length}</Link>
      </nav>
      {races.length === 0 && <p className="text-sm text-muted">대회가 없어요.</p>}
      <div className="row-list">
        {races.map((r) => (
          <details key={r.id} className="py-2.5">
            <summary className="flex items-center gap-2 cursor-pointer">
              <span className="min-w-0 mr-auto grid">
                <b className="truncate">{raceLabel(r)}</b>
                <span className="text-xs text-muted">참가 {r.participants.length} · 응원 {r.cheers.length} · 글 {r.afters.length}{r.addedBy ? ` · ${r.addedBy} 님이 추가` : ""}</span>
              </span>
              <span className="text-xs text-[var(--bib)]">수정</span>
            </summary>
            <RaceForm r={r} />
            <form action={deleteRace} className="mt-2">
              <input type="hidden" name="id" value={r.id} />
              <ConfirmButton>대회 삭제 (참가·응원·글 모두 삭제)</ConfirmButton>
            </form>
          </details>
        ))}
      </div>
    </section>
  );
}

function Groupbuy() {
  return (
    <section className="grid gap-3">
      <div className="flex justify-end"><Link href="/groupbuy/new" className="btn btn-primary text-sm">+ 새 공구 열기</Link></div>
      <GroupbuyStaff embedded />
    </section>
  );
}

async function Bingo() {
  const has = !!(await redis.get("r2u:bingoSecret"));
  const snap = await bingoRpc<{ info?: { start?: string; end?: string } }>("get_snapshot");
  const own = await hubPeriod();
  const start = own?.start ?? snap?.info?.start ?? (await eventStart()), end = own?.end ?? snap?.info?.end ?? "2026-11-30";
  const raw = await redis.get<string[] | string>("r2u:eventNicks");
  const nicks: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">이벤트 참가자 ({nicks.length}명)</h2>
        <p className="text-sm text-muted">회원 시트 C열 ‘닉네임(이벤트)’의 닉네임이에요. 회원 탭의 ‘회원 동기화’를 누르면 갱신돼요.</p>
        {nicks.length ? <div className="flex flex-wrap gap-1.5">{nicks.map((n) => <span key={n} className="chip">{n}</span>)}</div>
          : <p className="text-sm text-muted">아직 불러온 명단이 없어요.</p>}
      </div>
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">이벤트 운영진 모드</h2>
        <p className="text-sm text-muted">
          {has ? "저장된 비밀 문장으로 이벤트 운영진 화면에 바로 들어가요. 참가자 명단, 미션, 이벤트 기간을 거기서 관리해요."
            : "이벤트 운영진 비밀 문장을 한 번 저장해 두면, 다음부터 버튼 한 번으로 이벤트 운영진 모드에 들어가요."}
        </p>
        {has && <div><a href="/api/event/preview?staff=1" className="btn btn-primary">이벤트 운영진 모드 열기</a></div>}
      </div>
      <ActionForm action={saveEventPeriod} className="panel p-4 grid gap-3">
        <h2 className="font-bold">이벤트 오픈일·종료일</h2>
        <p className="text-sm text-muted">오픈일 전에는 운영진만 이벤트 화면을 볼 수 있고, 크루원에게는 “11월 이벤트 기대해주세요”가 보여요.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="field"><span className="label">오픈일(시작일)</span><input name="start" type="date" className="input" defaultValue={start} required /></label>
          <label className="field"><span className="label">종료일</span><input name="end" type="date" className="input" defaultValue={end} required /></label>
        </div>
        <div><Submit>기간 저장</Submit></div>
      </ActionForm>
      <ActionForm action={saveBingoSecret} className="panel p-4 grid gap-3">
        <label className="field">
          <span className="label">이벤트 운영진 비밀 문장 {has ? "(바꾸려면 새로 입력)" : ""}</span>
          <input name="secret" className="input" autoComplete="off" required maxLength={200} />
        </label>
        <div><Submit>저장</Submit></div>
      </ActionForm>
    </section>
  );
}

function Me() {
  return (
    <section className="grid gap-3">
    <ActionForm action={changePassword} className="panel p-4 grid gap-3" >
      <h2 className="font-bold">비밀번호 바꾸기</h2>
      <label className="field"><span className="label">지금 비밀번호</span><input name="cur" type="text" className="input pw-mask" required autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
      <label className="field"><span className="label">새 비밀번호 (4자 이상)</span><input name="pw" type="text" className="input pw-mask" required minLength={4} autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
      <div><Submit>변경</Submit></div>
    </ActionForm>
      <LogoutButton />
    </section>
  );
}
