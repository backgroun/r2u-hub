import Link from "next/link";
import { CrownIcon, GearIcon, LevelBadge } from "@/components/crown";
import { redirect } from "next/navigation";
import { currentUser, isManagerUser, isStaffAccount, isStaffNick, fmtRaceDate, getAllVs, getLastSeen, getLinks, getMembers, getMenu, getMonth, getRaces, getSheets, kstToday, MENU_DEFAULTS, type Link as HubLink, type MenuKey, type RaceFull } from "@/lib/hub";
import { addCheer, setDay, setGoal, deleteAfter, deleteRace, joinRace, leaveRace, removeRsvp, resetMemberPassword, resetMonthRecord, toggleCheer, updateAfter, addMembers, cancelVersusByAdmin, changePassword, decideNickChange, linkAction, postNotice, removeNotice, decideJoin, bingoInfo, bingoMember, activateEventBlock, createEventBlock, removeEventBlock, saveLink, saveMenu, setMemberRole, syncMembersAction, saveGearLinks, generateGearLinks, saveGearLink, deleteGearSuggestion, clearLinkEditBy } from "@/app/actions";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { bingoView } from "@/lib/bingo-admin";
import { BLOCK_TYPES, getActive, getBlocks } from "@/lib/event-blocks";
import { listJoins, pendingJoinCount } from "@/lib/join";
import { listNickChangeRequests } from "@/lib/nickname";
import { getNotices, getPushEnabledNicks, noticeState, pushReady, subCount } from "@/lib/notice";
import MemberSheetSync from "@/components/member-sheet-sync";
import LogoutButton from "@/components/logout-button";
import RaceForm from "@/components/race-form";
import GroupbuyStaff from "@/components/groupbuy-staff";
import PasswordInput from "@/components/password-input";
import AdminMemberRow from "@/components/admin-member-row";
import AdminMemberSearch from "@/components/admin-member-search";
import { GEARS, GearArt } from "@/components/gear-art";
import { RUNNER_RULES as RR } from "@/lib/runner-rules";
import { gearBoard, gearLinks, gearSuggestions, gearClickStats, gearLinkEdits, type LinkEdit } from "@/lib/gear-collect";
import { coupangReady } from "@/lib/coupang";
import SpotTestButton, { SpotCardButton } from "@/components/spot-test-button";
import KakaoPlaceField from "@/components/kakao-place-field";
import { rankMonth, shiftYm } from "@/lib/rank";
import { getLevels, getPointConfig, getPointSources, getPointTotals, levelOf, PT_LABELS, VS_SETTLE, type PointRules, type VsSettle } from "@/lib/points";
import { getVsHistory } from "@/lib/versus";
import { tierOf } from "@/lib/tiers";
import { adjustMemberPoints, savePointRules, settleVersusByAdmin } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "운영진" };

const TABS = { members: "회원", content: "게시물", notice: "공지", menu: "메뉴·링크", races: "대회", points: "포인트", gear: "스팟게임", versus: "대결", groupbuy: "공구", bingo: "이벤트", me: "내 비밀번호" } as const;
type Tab = keyof typeof TABS;
const TAGS = ["커뮤니티", "기록", "공지", "이벤트", "공구", "기타"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; sec?: string; m?: string; past?: string; edit?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login?next=/admin");
  const { tab: t, sec, m, past, edit } = await searchParams;
  if (t === "nicknames") redirect("/admin?tab=members");
  if (t === "links") redirect("/admin?tab=menu"); // 링크는 메뉴와 합쳐졌다
  const tab: Tab = t && t in TABS ? (t as Tab) : u.admin ? "members" : "me";
  if (!u.admin && tab !== "me") redirect("/admin?tab=me");
  const [pendingJoins, pendingNicknames] = u.admin ? await Promise.all([pendingJoinCount(), listNickChangeRequests()]) : [0, []];
  const todo: Partial<Record<Tab, number>> = u.admin ? { members: pendingJoins + pendingNicknames.length } : {};

  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <h1 className="hub-h1">{u.admin ? "운영진 관리" : "내 계정"}</h1>
        {u.admin && <p className="text-sm text-muted">회원·메뉴·링크·대회·공구·이벤트를 한곳에서 관리해요.</p>}
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
      {tab === "menu" && <section className="grid gap-4"><Menu /><Links /></section>}
      {tab === "races" && <Races past={past === "1"} edit={edit} />}
      {tab === "points" && <PointsAdmin />}
      {tab === "gear" && <GearCatalog mgr={await isManagerUser(u)} />}
      {tab === "versus" && <VersusAdmin />}
      {tab === "groupbuy" && <Groupbuy />}
      {tab === "bingo" && <Events />}
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
        <label className="field"><span className="label">이미지 (선택 · 3MB 이하)</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="input" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field"><span className="label">노출 시작일 (선택)</span><input name="from" type="date" className="input" /></label>
          <label className="field"><span className="label">노출 종료일 (선택)</span><input name="to" type="date" className="input" /></label>
        </div>
        <p className="text-xs text-muted">비워 두면 바로, 계속 보여요. 시작일이 오늘보다 뒤면 그날부터 보이고 알림은 보내지 않아요. 여러 공지가 보일 때는 가장 최근 것이 홈에 떠요.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="push" defaultChecked /> 알림도 보내기</label>
        <div className="flex justify-end"><Submit>공지 올리기</Submit></div>
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
            {n.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/notices/${n.id}/image`} alt={`${n.title} 공지 이미지`} className="w-full max-h-72 object-contain rounded-lg" />
            )}
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
  const [allMembers, sheets, joins, pushEnabled, lastSeen, levels] = await Promise.all([getMembers(), getSheets(), listJoins(), getPushEnabledNicks(), getLastSeen(), getLevels()]);
  const members = allMembers.filter((member) => !isStaffNick(member.nick));
  const pending = joins.filter((j) => j.status === "pending");
  const waiting = members.filter((m) => !m.pw).length;
  return (
    <section className="grid gap-4">
      <NicknameRequests />
      {pending.length > 0 && (
        <div className="panel panel-alert p-4 grid gap-3">
          <h2 className="font-bold">🙋 닉네임 생성 요청 ({pending.length})</h2>
          <p className="text-sm text-muted">카톡방으로 온 요청 링크를 열어서 승인할 수도 있어요. 승인하면 회원이 만들어지고 구글시트에도 추가돼요.</p>
          {pending.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
              <div className="min-w-0"><b>{j.nick}</b> <span className="text-xs text-muted">{new Date(j.at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ")}</span></div>
              <div className="flex gap-1.5 shrink-0">
                <form action={decideJoin}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="act" value="approve" /><button className="btn btn-primary text-sm py-1 px-3">승인</button></form>
                <details className="nick-reject"><summary className="btn btn-ghost btn-danger text-sm py-1 px-3">거절</summary><form action={decideJoin} className="grid gap-2 mt-2"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="act" value="reject" /><textarea name="reason" className="input" rows={2} maxLength={300} required placeholder="거절 메시지" /><button className="btn btn-ghost btn-danger text-sm py-1 px-3">메시지 보내고 거절</button></form></details>
              </div>
            </div>
          ))}
        </div>
      )}
      <MemberSheetSync url={sheets.members}>
        <ActionForm action={addMembers} className="member-add-form">
          <input name="names" className="input min-w-0" aria-label="추가할 크루원 닉네임" placeholder="크루원 추가 (닉네임)" title="여러 명은 쉼표로 구분해 주세요" required />
          <Submit className="btn btn-primary">추가</Submit>
        </ActionForm>
      </MemberSheetSync>
      <p className="text-sm text-muted">전체 {members.length}명 · 비번 미설정 {waiting}명 (첫 로그인 때 설정 · 분실 시 ‘비번 초기화’)</p>
      {(() => {
        const managers = members.filter((m) => m.manager);
        const staff = members.filter((m) => m.role === "admin" && !m.manager);
        const crew = members.filter((m) => m.role !== "admin");
        return (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="label"><CrownIcon size={13} />운영진 {staff.length}명</h3>
              <div className="flex items-center gap-2">
              <details className="dropdown role-settings">
                <summary>권한 설정</summary>
                <ActionForm action={setMemberRole} className="dropdown-menu role-settings-menu grid gap-2" collapse>
                  <AdminMemberSearch members={members.map((m) => ({ nick: m.nick, name: m.name?.trim() || "없음" }))} />
                  <fieldset className="field">
                    <legend className="label">권한</legend>
                    <div className="role-choices">
                      <label className="role-choice"><input type="radio" name="role" value="member" required /><span>크루원</span></label>
                      <label className="role-choice"><input type="radio" name="role" value="admin" required /><span>운영진</span></label>
                      <label className="role-choice"><input type="radio" name="role" value="manager" required /><span>관리자</span></label>
                    </div>
                  </fieldset>
                  <Submit className="btn btn-primary text-sm" confirm="선택한 크루원의 권한을 바꿀까요?">저장</Submit>
                </ActionForm>
              </details>
              <details className="dropdown role-settings">
                <summary>비번 초기화</summary>
                <ActionForm action={resetMemberPassword} className="dropdown-menu role-settings-menu grid gap-2" collapse>
                  <AdminMemberSearch members={members.filter((m) => m.pw).map((m) => ({ nick: m.nick, name: m.name?.trim() || "없음" }))} />
                  <Submit className="btn btn-primary text-sm" confirm="선택한 크루원의 비밀번호를 초기화할까요?">초기화</Submit>
                </ActionForm>
              </details>
              </div>
            </div>
            <div className="row-list">
              {staff.length === 0 && <p className="py-3 text-sm text-muted">아직 운영진으로 지정한 크루원이 없어요.</p>}
              {staff.map((m) => <AdminMemberRow key={m.nick} m={m} self={self} pushEnabled={pushEnabled.has(m.nick)} lastSeen={lastSeen[m.nick]} lv={isStaffNick(m.nick) ? undefined : levels[m.nick] ?? 1} />)}
            </div>
            {managers.length > 0 && <>
              <h3 className="label"><GearIcon size={13} />관리자 {managers.length}명</h3>
              <div className="row-list">{managers.map((m) => <AdminMemberRow key={m.nick} m={m} self={self} pushEnabled={pushEnabled.has(m.nick)} lastSeen={lastSeen[m.nick]} lv={isStaffNick(m.nick) ? undefined : levels[m.nick] ?? 1} />)}</div>
            </>}
            <h3 className="label">크루원 {crew.length}명</h3>
            <p className="text-xs text-muted" style={{ marginTop: -6 }}>알림 설정 {crew.filter((m) => pushEnabled.has(m.nick)).length}명</p>
            <div className="row-list">
              {crew.map((m) => <AdminMemberRow key={m.nick} m={m} self={self} pushEnabled={pushEnabled.has(m.nick)} lastSeen={lastSeen[m.nick]} lv={isStaffNick(m.nick) ? undefined : levels[m.nick] ?? 1} />)}
            </div>
          </>
        );
      })()}
    </section>
  );
}

async function NicknameRequests() {
  const [requests, members] = await Promise.all([listNickChangeRequests(), getMembers()]);
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name?.trim() || "없음"]));
  return (
    <section className="panel panel-alert p-4 grid gap-3">
      <h2 className="font-bold">닉네임 변경 요청 ({requests.length})</h2>
      {requests.map((request) => (
        <div key={request.oldNick} className="grid gap-2 border-t border-[var(--line)] pt-3">
          <b>{request.oldNick}/{names[request.oldNick] || "없음"} → {request.newNick}/{names[request.oldNick] || "없음"}</b>
          <span className="text-xs text-muted">신청 {new Date(request.at + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")}</span>
          <div className="flex gap-1.5 flex-wrap">
            <ActionForm action={decideNickChange} className="grid gap-1">
              <input type="hidden" name="oldNick" value={request.oldNick} /><input type="hidden" name="act" value="approve" />
              <Submit className="btn btn-primary text-sm py-1 px-3">승인</Submit>
            </ActionForm>
            <details className="nick-reject">
              <summary className="btn btn-ghost btn-danger text-sm py-1 px-3">거절</summary>
              <ActionForm action={decideNickChange} className="grid gap-2 mt-2">
                <input type="hidden" name="oldNick" value={request.oldNick} /><input type="hidden" name="act" value="reject" />
                <label className="field"><span className="label">거절 메시지</span><textarea name="reason" className="input" rows={2} maxLength={300} required placeholder="신청한 크루원에게 전달할 내용을 적어 주세요" /></label>
                <Submit className="btn btn-ghost btn-danger text-sm py-1 px-3">메시지 보내고 거절</Submit>
              </ActionForm>
            </details>
          </div>
        </div>
      ))}
    </section>
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
                <p className="text-sm">{[a.place, a.time, a.memo].filter(Boolean).join(" · ") || "내용 없음"}{kind === "carpool" && a.seats ? ` · ${a.seats}자리` : ""}</p>
                <details className="edit-fold">
                  <summary className="btn btn-ghost text-xs py-1 px-3">수정 · 명단 관리</summary>
                  <div className="grid gap-2 mt-2">
                  <ActionForm action={updateAfter} className="grid-2" keep>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="after" value={a.id} />
                    <KakaoPlaceField label={kind === "carpool" ? "출발지" : "장소"} place={a.place} address={a.address} placeUrl={a.placeUrl} />
                    <label className="field"><span className="label">시간</span><input name="time" className="input" defaultValue={a.time} maxLength={30} /></label>
                    {kind === "carpool" && <label className="field"><span className="label">자리 수</span><input name="seats" type="number" min={1} max={10} className="input" defaultValue={a.seats} /></label>}
                    <label className="field full"><span className="label">내용</span><input name="memo" className="input" defaultValue={a.memo} maxLength={200} /></label>
                    <div className="full"><Submit className="btn text-sm" confirm="수정한 내용으로 저장할까요?">수정 저장</Submit></div>
                  </ActionForm>
                  {kind !== "photo" && (a.yes.length + a.no.length > 0) && (
                    <div className="grid gap-1.5">
                      <span className="label">{kind === "carpool" ? "탑승" : "참석·불참"} (✕로 빼기)</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[...a.yes.map((n) => [n, kind === "carpool" ? "탑승" : "참석"]), ...a.no.map((n) => [n, "불참"])].map(([n, v]) => (
                          <span key={n} className="pchip">{n}<span className="text-muted">· {v}</span>
                            <form action={removeRsvp} className="inline"><input type="hidden" name="after" value={a.id} /><input type="hidden" name="nick" value={n} />
                              <ConfirmButton className="" label={`${n} 빼기`} message={`${n} 님을 명단에서 뺄까요?`}>✕</ConfirmButton></form>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                </details>
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
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const label = (nick: string) => `${nick}/${names[nick] || "없음"}`;
  const races = all.filter((r) => r.date >= today);
  const crew = members.map((x) => x.nick).filter((n) => !isStaffNick(n));
  if (!races.length) return <p className="text-sm text-muted">다가오는 대회가 없어요.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">다가오는 대회만 보여요. 크루원을 검색해서 참가자·응원으로 넣거나, 코스를 고치거나, 뺄 수 있어요.</p>
      {races.map((r) => (
        <div key={r.id} className="panel p-4 grid gap-2 entries-panel">
          <h3 className="font-bold">{raceLabel(r)}</h3>
          {r.participants.length > 0 && (
            <div className="entry-groups">
              {Array.from(r.participants.reduce((groups, person) => {
                const course = person.course?.trim() || "코스 미정";
                const people = groups.get(course) || [];
                people.push(person);
                groups.set(course, people);
                return groups;
              }, new Map<string, typeof r.participants>())).map(([course, people]) => (
                <div key={course} className="entry-group">
                  <div className="entry-group-title">{course} <span>{people.length}명</span></div>
                  {people.map((p) => (
                    <div key={p.nick} className="entry-person">
                      <span className="entry-person-name">{label(p.nick)}</span>
                      <ActionForm action={joinRace} className="entry-person-edit" keep>
                        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={p.nick} />
                        <input name="courseEtc" className="input" defaultValue={p.course} maxLength={20} aria-label={`${p.nick} 코스`} />
                        <Submit className="btn text-xs" confirm={`${p.nick} 님의 코스를 바꿀까요?`}>저장</Submit>
                      </ActionForm>
                      <form action={leaveRace} className="entry-person-remove">
                        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={p.nick} />
                        <ConfirmButton className="btn btn-ghost btn-danger text-xs">빼기</ConfirmButton>
                      </form>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <ActionForm action={joinRace} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="id" value={r.id} />
            <AdminMemberSearch label={null} required placeholder="참가자 검색해서 추가" style={{ flex: 1, minWidth: 0 }}
              members={crew.filter((n) => !r.participants.some((p) => p.nick === n)).map((n) => ({ nick: n, name: names[n] || "없음" }))} />
            <input name="courseEtc" className="input" placeholder="코스" maxLength={20} required style={{ width: 76 }} aria-label="코스" />
            <Submit className="btn text-xs">추가</Submit>
          </ActionForm>
          <ActionForm action={addCheer} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="id" value={r.id} />
            <AdminMemberSearch label={null} required placeholder="응원 검색해서 추가" style={{ flex: 1, minWidth: 0 }}
              members={crew.filter((n) => !r.cheers.includes(n)).map((n) => ({ nick: n, name: names[n] || "없음" }))} />
            <Submit className="btn text-xs">추가</Submit>
          </ActionForm>
          {r.cheers.length > 0 && (
            <div className="grid gap-1.5">
              <span className="label">응원 (✕로 빼기)</span>
              <div className="flex flex-wrap gap-1.5">
                {r.cheers.map((n) => (
                  <span key={n} className="pchip">{label(n)}
                    <form action={toggleCheer} className="inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="nick" value={n} />
                      <ConfirmButton className="" label={`${n} 응원 빼기`} message={`${n} 님의 응원 표시를 뺄까요?`}>✕</ConfirmButton></form>
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
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const rows = rankMonth(rec).filter((r) => (r.goal > 0 || r.km > 0) && !isStaffNick(r.nick)).sort((a, b) => b.km - a.km);
  const crew = members.map((x) => x.nick).filter((n) => !isStaffNick(n));
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
              <span className="font-bold mr-auto">{r.nick}/{names[r.nick] || "없음"} <span className="text-sm text-muted font-normal num">{r.km}km / 목표 {r.goal || "–"} · {Object.keys(r.days).length}일</span></span>
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
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="크루원"><option value="" disabled>크루원</option>{crew.map((n) => <option key={n} value={n}>{n}/{names[n] || "없음"}</option>)}</select>
            <input name="goal" type="number" min={1} max={2000} className="input" placeholder="목표 km" required style={{ width: 92 }} />
            <Submit className="btn text-xs" confirm="크루원의 목표를 바꿀까요?">목표 저장</Submit>
          </ActionForm>
          <ActionForm action={setDay} className="flex gap-1.5 items-center" keep>
            <input type="hidden" name="ym" value={ym} />
            <select name="nick" className="input" defaultValue="" required style={{ flex: 1, minWidth: 0 }} aria-label="크루원"><option value="" disabled>크루원</option>{crew.map((n) => <option key={n} value={n}>{n}/{names[n] || "없음"}</option>)}</select>
            <select name="day" className="input" defaultValue="1" style={{ width: 72 }} aria-label="날짜">{Array.from({ length: last }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}</select>
            <input name="km" type="number" step="0.01" min={0} max={300} className="input" placeholder="km" required style={{ width: 72 }} />
            <Submit className="btn text-xs" confirm="크루원의 그날 기록을 바꿀까요? (0이면 지워져요)">저장</Submit>
          </ActionForm>
          <p className="text-xs text-muted">날짜 기록은 그날 합계로 저장돼요(0이면 지우기). 운영진이 바꾼 목표는 크루원의 목표 수정 횟수에 들어가지 않아요.</p>
        </div>
      </details>
      <p className="text-xs text-muted">‘기록 지우기’는 그 달 목표와 기록을 모두 지워요.</p>
    </div>
  );
}

async function AddedRaces() {
  const [all, members] = await Promise.all([getRaces(), getMembers()]);
  const races = all.filter((r) => r.src || r.addedBy);
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  if (!races.length) return <p className="text-sm text-muted">크루원이 대회 찾기나 직접 등록으로 추가한 대회가 없어요.</p>;
  return (
    <div className="row-list">
      {races.map((r) => (
        <div key={r.id} className="flex items-center gap-2 py-2.5">
          <span className="min-w-0 mr-auto grid">
            <b className="truncate">{raceLabel(r)}</b>
            <span className="text-xs text-muted">{r.src ? "대회 찾기" : "직접 등록"} · {r.addedBy ? `${r.addedBy}/${names[r.addedBy] || "없음"} 님이 추가` : "추가한 크루원 미상"} · 참가 {r.participants.length}명</span>
          </span>
          <Link href={`/admin?tab=races${r.date < kstToday() ? "&past=1" : ""}&edit=${encodeURIComponent(r.id)}#admin-race-${r.id}`} className="btn text-xs">수정</Link>
          <form action={deleteRace}>
            <input type="hidden" name="id" value={r.id} />
            <ConfirmButton className="btn btn-ghost btn-danger text-xs">삭제</ConfirmButton>
          </form>
        </div>
      ))}
    </div>
  );
}

async function VersusAdmin() {
  const ym = kstToday().slice(0, 7);
  const [all, members] = await Promise.all([getAllVs(ym), getMembers()]);
  const names = Object.fromEntries(members.map((m) => [m.nick, m.name || "없음"]));
  const seen = new Set<string>();
  const pairs = Object.entries(all).filter(([a, b]) => {
    if (seen.has(a) || seen.has(b)) return false;
    seen.add(a); seen.add(b);
    return true;
  });
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="font-bold">{ym} 진행 중인 대결 ({pairs.length})</h2>
        <p className="text-sm text-muted">운영진이 취소하면 두 크루원의 대결이 바로 종료돼요. 월말에는 진행 중인 대결이 자동으로 종료돼요.</p>
      </div>
      {pairs.length === 0 && <p className="text-sm text-muted">진행 중인 대결이 없어요.</p>}
      <div className="row-list">
        {pairs.map(([a, b]) => (
          <div key={`${a}:${b}`} className="flex items-center gap-3 py-2.5">
            <b className="min-w-0 mr-auto">{a}/{names[a] || "없음"} vs {b}/{names[b] || "없음"}</b>
            <ActionForm action={cancelVersusByAdmin}>
              <input type="hidden" name="ym" value={ym} />
              <input type="hidden" name="a" value={a} />
              <input type="hidden" name="b" value={b} />
              <ConfirmButton className="btn btn-ghost btn-danger text-xs">대결 취소</ConfirmButton>
            </ActionForm>
          </div>
        ))}
      </div>
      <VersusSettle ym={ym} names={names} />
    </section>
  );
}

/** 대결 승리 정산: 이번 달·지난달 대결과 정산 결과, 운영진 '승리 정산' 버튼 */
async function VersusSettle({ ym, names }: { ym: string; names: Record<string, string> }) {
  const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
  const prev = d.toISOString().slice(0, 7);
  const [cfg, cur, last] = await Promise.all([getPointConfig(), getVsHistory(ym), getVsHistory(prev)]);
  const rows = [...last.map((h) => ({ ym: prev, h })), ...cur.map((h) => ({ ym, h }))];
  return (
    <div className="grid gap-2 mt-2">
      <h2 className="font-bold">대결 승리 정산</h2>
      <p className="text-sm text-muted">정산 방식: <b className="text-[var(--ink)]">{VS_SETTLE[cfg.vsSettle]}</b> · 승리 {cfg.pt.versusWin}P (포인트 탭에서 바꿀 수 있어요). 그달 거리가 더 많은 사람이 이겨요.</p>
      {rows.length === 0 && <p className="text-sm text-muted">정산할 대결이 없어요.</p>}
      <div className="row-list">
        {rows.map(({ ym: m, h }) => (
          <div key={`${m}:${h.a}:${h.b}`} className="flex items-center gap-2 py-2.5 text-sm">
            <span className="text-xs text-muted shrink-0">{Number(m.slice(5))}월</span>
            <span className="min-w-0 mr-auto">
              <b>{h.a}/{names[h.a] || "없음"} vs {h.b}/{names[h.b] || "없음"}</b>
              {h.settled && <span className="block text-xs text-muted">{h.settled.winner ? `${h.settled.winner} 승리` : "무승부"} · {h.settled.ka}km : {h.settled.kb}km</span>}
            </span>
            <ActionForm action={settleVersusByAdmin}>
              <input type="hidden" name="ym" value={m} /><input type="hidden" name="a" value={h.a} /><input type="hidden" name="b" value={h.b} />
              <Submit className="btn text-xs" confirm={`${h.a} vs ${h.b} 대결을 지금 거리로 정산할까요?`}>{h.settled ? "다시 정산" : "승리 정산"}</Submit>
            </ActionForm>
          </div>
        ))}
      </div>
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
      <div><Submit confirm="메뉴 이름을 바꿀까요?">저장</Submit></div>
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
      <div className="full"><Submit confirm={l ? "수정한 내용으로 저장할까요?" : undefined}>{l ? "수정 저장" : "링크 추가"}</Submit></div>
    </ActionForm>
  );
}

async function Races({ past, edit }: { past: boolean; edit?: string }) {
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
          <details key={r.id} id={`admin-race-${r.id}`} className="py-2.5" open={edit === r.id}>
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

async function Events() {
  const members = await getMembers();
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  const [blocks, active] = await Promise.all([getBlocks(), getActive()]);
  const view = await bingoView();
  const start = view.info.start, end = view.info.end;
  const nowYm = kstToday().slice(0, 7);
  const months = [...new Set([...blocks.map((b) => b.ym), ...Object.keys(active)])].sort().reverse();
  return (
    <section className="grid gap-3">
      <div className="panel p-4 grid gap-1">
        <h2 className="font-bold">이벤트 블록</h2>
        <p className="text-sm text-muted">이벤트를 블록으로 미리 만들어 두고, 달마다 하나를 골라 ‘본문에 세팅’하면 이벤트 탭에 보여요. 같은 달에 다른 블록을 세팅하면 이전 것은 자동으로 내려가요.</p>
      </div>

      {months.map((ym) => (
        <div key={ym} className="panel p-4 grid gap-2">
          <h3 className="font-bold">{ym.slice(0, 4)}년 {Number(ym.slice(5))}월 {ym === nowYm && <span className="chip chip-open">이번 달</span>}</h3>
          {blocks.filter((b) => b.ym === ym).map((b) => {
            const on = active[ym] === b.id;
            return (
              <div key={b.id} className="grid gap-2 border-t border-[var(--line)] pt-2 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <div className="min-w-0 grid">
                  <span className="font-bold truncate">{b.title} {on && <span className="chip chip-confirmed">본문에 세팅됨</span>}</span>
                  <span className="text-xs text-muted truncate">{BLOCK_TYPES[b.type]}{b.poll ? ` · ${b.poll.question}` : ""}</span>
                </div>
                <div className="ml-auto flex gap-1.5 shrink-0">
                  <form action={activateEventBlock}>
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="ym" value={ym} />
                    {on ? <><input type="hidden" name="off" value="1" /><button className="btn text-xs py-1 px-2.5">내리기</button></> : <button className="btn btn-primary text-xs py-1 px-2.5">본문에 세팅</button>}
                  </form>
                  <form action={removeEventBlock}><input type="hidden" name="id" value={b.id} /><ConfirmButton className="btn btn-ghost btn-danger text-xs py-1 px-2">삭제</ConfirmButton></form>
                </div>
              </div>
              </div>
            );
          })}
        </div>
      ))}

      <details className="panel p-4" open>
        <summary className="font-bold cursor-pointer">이벤트 명단 ({view.members.length}명)</summary>
        <div className="grid gap-3 pt-3">
          {view.members.map((m, i) => (
            <div key={m.name} className="flex items-center gap-2 border-t border-[var(--line)] pt-2">
              <span className="num text-muted text-sm shrink-0 text-center" style={{ width: 22 }}>{i + 1}</span>
              <div className="flex items-baseline gap-2 min-w-0"><b>{m.name}/{names[m.name] || "없음"}</b><small className="text-muted">인증 기록 {m.cnt}칸</small></div>
              <div className="ml-auto flex flex-nowrap items-center gap-1.5 shrink-0">
                {([["reset_data", "기록 초기화"], ["delete", "명단에서 빼기"]] as const).map(([act, label]) => (
                  <ActionForm key={act} action={bingoMember} className="inline">
                    <input type="hidden" name="act" value={act} /><input type="hidden" name="name" value={m.name} />
                    <ConfirmButton className={`btn btn-ghost text-xs py-1 px-2 ${act === "delete" || act === "reset_data" ? "btn-danger" : ""}`}>{label}</ConfirmButton>
                  </ActionForm>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* 평소에는 접어 두고, 새 블록을 만들 때만 펼친다 (만들면 자동으로 다시 접힌다) */}
      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">+ 이벤트 블록 만들기</summary>
        <ActionForm action={createEventBlock} className="grid gap-3 pt-3" collapse>
          <div className="grid grid-cols-2 gap-3">
            <label className="field"><span className="label">종류</span>
              <select name="type" className="input" defaultValue="bingo"><option value="bingo">빙고</option><option value="poll">투표·설문</option></select></label>
            <label className="field"><span className="label">월</span><input name="ym" type="month" className="input" defaultValue={nowYm} required /></label>
          </div>
          <label className="field"><span className="label">이벤트 이름</span><input name="title" className="input" maxLength={40} required placeholder="예: 11월 5×5 미션 빙고" /></label>
          <label className="field"><span className="label">투표 질문 (투표·설문일 때)</span><input name="question" className="input" maxLength={100} placeholder="예: 다음 번개런 코스는?" /></label>
          <label className="field"><span className="label">선택지 (투표·설문일 때, 한 줄에 하나·2~8개)</span><textarea name="options" className="input" rows={4} placeholder={"한강 10km\n남산 순환\n탄천 하프"} /></label>
          <div><Submit>블록 만들기</Submit></div>
        </ActionForm>
      </details>

      {/* 빙고 운영: 예전에는 빙고 화면 안의 ‘운영진 모드’에서만 가능했던 설정을 허브에서 바로 */}
      <details className="panel p-4">
        <summary className="font-bold cursor-pointer">이벤트 안내/기간</summary>
        <ActionForm action={bingoInfo} keep className="event-info-form grid gap-2 pt-2">
          <label className="field"><span className="label">안내 제목</span><input name="title" className="input" maxLength={60} defaultValue={view.info.title} /></label>
          <div className="grid items-end gap-2" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
            <label className="field"><span className="label">오픈일</span><input name="start" type="date" className="input" defaultValue={start} required /></label>
            <label className="field"><span className="label">종료일</span><input name="end" type="date" className="input" defaultValue={end} required /></label>
            <Submit className="btn btn-primary" confirm="이벤트 안내·기간을 바꿀까요?">저장</Submit>
          </div>
        </ActionForm>
      </details>

    </section>
  );
}

function Me() {
  return (
    <section className="grid gap-3">
    <ActionForm action={changePassword} className="panel p-4 grid gap-3" >
      <h2 className="font-bold">비밀번호 바꾸기</h2>
      <label className="field"><span className="label">지금 비밀번호</span><input name="cur" type="text" className="input pw-mask" required autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" /></label>
      <label className="field"><span className="label">새 비밀번호 (4자 이상)</span><PasswordInput name="pw" className="input pw-mask" required minLength={4} data-lpignore="true" /></label>
      <div><Submit confirm="비밀번호를 바꿀까요?">변경</Submit></div>
    </ActionForm>
      <LogoutButton />
    </section>
  );
}

/** 포인트: 회원별 등급·포인트와 조정, 포인트·등급 기준 바꾸기 */
/** 스팟게임: 규칙, 수집 현황(누가 몇 종을 모았나), 용품별 받은 사람. 같은 용품이 한 사람에게 되도록 다시 안 나오게 하는 게 목적이라 포인트 액수는 보지 않는다. */
async function GearCatalog({ mgr }: { mgr: boolean }) {
  const members = await getMembers();
  const crew = members.filter((m) => !isStaffNick(m.nick));
  const names = Object.fromEntries(members.map((m) => [m.nick, m.name?.trim() || "없음"]));
  const nicks = Array.from(new Set([...members.map((m) => m.nick), "운영진", "관리자"]));
  // 쿠팡 링크·클릭·수정 기록은 운영진이 아닌 "관리자"만 읽는다 (아니면 아예 불러오지 않는다)
  const [board, links, sugs, clicks, edits] = await Promise.all([
    gearBoard(nicks),
    mgr ? gearLinks() : Promise.resolve({} as Record<number, string>),
    gearSuggestions(),
    mgr ? gearClickStats() : Promise.resolve({} as Awaited<ReturnType<typeof gearClickStats>>),
    mgr ? gearLinkEdits() : Promise.resolve({} as Record<number, LinkEdit[]>),
  ]);
  // 크루원이 보낸 제품 추천: 최근 것이 위로
  const inbox = Object.entries(sugs).flatMap(([g, list]) => list.map((x) => ({ g: Number(g), ...x }))).sort((a, b) => b.at - a.at);
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const total = GEARS.length;
  const count = (n: string) => Object.keys(board[n] ?? {}).length;
  const done = crew.filter((m) => count(m.nick) >= total).length;
  const ratio = crew.length ? done / crew.length : 0;
  const progress = crew.map((m) => ({ nick: m.nick, n: count(m.nick) })).sort((a, b) => b.n - a.n || a.nick.localeCompare(b.nick, "ko"));
  const who = (i: number) => nicks.filter((n) => board[n]?.[i] != null).sort((a, b) => (board[a][i] ?? 0) - (board[b][i] ?? 0));
  return (
    <section className="grid gap-4">
      {inbox.length > 0 && (
        <div className="panel p-4 grid gap-2">
          <h2 className="font-bold">🔔 제품 추천 {inbox.length}건</h2>
          <p className="text-xs text-muted">크루원이 보낸 주소예요. 열기 전에 주소를 확인하세요. 쓸 제품이면 파트너스 링크를 만들어 아래 용품의 [링크 수정]에 넣어요.</p>
          <div className="row-list">
            {inbox.map((x) => (
              <div key={`${x.g}:${x.nick}`} className="gear-sug-row">
                <span className="gear-ico"><GearArt i={x.g} size={32} /></span>
                <span className="gear-txt">
                  <b>{x.g + 1}. {GEARS[x.g]?.name} {x.test && <small className="gear-test">테스트</small>}<small className="gear-cnt">{names[x.nick] && !isStaffNick(x.nick) ? `${x.nick}/${names[x.nick]}` : x.nick} · {new Date(x.at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", "/")}</small></b>
                  <a className="gear-sug-link" href={x.url} target="_blank" rel="noopener noreferrer nofollow ugc"><b>{host(x.url)}</b> {x.url.length > 60 ? `${x.url.slice(0, 60)}…` : x.url}</a>
                </span>
                <form action={deleteGearSuggestion}>
                  <input type="hidden" name="g" value={x.g} /><input type="hidden" name="nick" value={x.nick} />
                  <ConfirmButton className="btn btn-ghost btn-danger text-xs">삭제</ConfirmButton>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
      <details className="panel p-4 gear-fold">
        <summary>스팟게임 · 게임의 법칙</summary>
        <ul className="rules-list mt-3">
          <li><b>등장</b><span>{RR.chance >= 1 ? "앱을 열면 매일" : `앱을 열 때 ${Math.round(RR.chance * 100)}% 확률로`} 러닝 용품이 한 번 튕겨 나와요. 계정당 하루 한 번(놓쳐도 그날은 끝), 이미 잡은 용품은 되도록 안 나와요.</span></li>
          <li><b>잡기</b><span>{RR.need === 1 ? "한 번" : `${RR.need}번`} 누르면 성공이에요. {RR.life}초 안에 못 잡으면 사라지고, 중간에 한 번쯤 느려져요.</span></li>
          <li><b>보상</b><span>꽝(약 {Math.round(RR.missRate * 100)}%) 또는 {RR.minP}~{RR.maxP}P 랜덤(큰 값은 드물게) + 색종이 축포 + 용품 설명 카드.</span></li>
          <li><b>제한</b><span>포인트는 하루 한 번, 주 {RR.perWeek}번까지(최대 {RR.perWeek * RR.maxP}P, 꽝도 1번). 그 뒤에도 매일 나오지만 설명 카드만 보여요. 운영진도 똑같이 참가해요.</span></li>
          <li><b>교체</b><span>크루원의 {Math.round(RR.replaceRatio * 100)}% 이상이 {total}종을 모두 모으면 새 용품으로 교체해요.</span></li>
        </ul>
        <div className="gear-test-row">
          <p className="text-xs text-muted">테스트하면 용품이 바로 튕겨 나와요. 포인트는 반영되지 않아요. 아래 용품 목록에서 아이콘·이름을 누르면 카드를 볼 수 있어요.</p>
          <SpotTestButton />
        </div>
      </details>
      <div className="panel p-4 grid gap-2">
        <h2 className="font-bold">수집 현황</h2>
        <p className="text-sm">{total}종을 모두 모은 크루원 <b>{done}/{crew.length}명</b> ({Math.round(ratio * 100)}%)</p>
        <div className="gear-bar" aria-hidden><i style={{ width: `${Math.round(ratio * 100)}%` }} /><s style={{ left: `${Math.round(RR.replaceRatio * 100)}%` }} /></div>
        {ratio >= RR.replaceRatio
          ? <p className="gear-replace">🔔 교체할 때예요! 크루원의 {Math.round(RR.replaceRatio * 100)}% 이상이 {total}종을 모두 모았어요. 새 용품으로 바꾸면 수집 기록이 새로 시작돼요.</p>
          : <p className="text-xs text-muted">{Math.round(RR.replaceRatio * 100)}%({Math.ceil(crew.length * RR.replaceRatio)}명)가 모두 모으면 교체할 때예요.</p>}
        <details className="edit-fold">
          <summary className="btn btn-ghost text-xs py-1 px-3">크루원별 진행 보기</summary>
          <div className="row-list mt-2">
            {progress.map((r) => (
              <div key={r.nick} className="flex items-center gap-2 py-1.5 text-sm">
                <b className="truncate min-w-0">{r.nick}/{names[r.nick]}</b>
                <span className="num ml-auto shrink-0 text-muted">{r.n}/{total}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
      {mgr && (
        <details className="panel p-4 gear-fold">
          <summary>쿠팡 파트너스 링크 <small className="gear-cnt">{Object.keys(links).length}/{GEARS.filter((x) => x.shop !== false).length}개 등록</small></summary>
          <div className="grid gap-2 mt-3">
            <p className="text-sm text-muted">자동 생성하거나, 아래 칸에 <b>번호 링크</b>를 한 줄씩 넣어 저장해요.</p>
            <ActionForm action={generateGearLinks} className="grid gap-1" keep>
              <div className="flex items-center gap-2 flex-wrap">
                <Submit className="btn text-sm" confirm="비어 있는 용품에 쿠팡 검색 링크를 자동으로 만들까요? (이미 넣은 링크는 그대로 둬요)">쿠팡 검색 링크 자동 생성</Submit>
                <span className="text-xs text-muted">{coupangReady() ? "키 설정됨 · 링크가 비어 있는 용품만 채워요" : "키가 아직 설정되지 않았어요 (.env.local의 COUPANG_ACCESS_KEY · COUPANG_SECRET_KEY)"}</span>
              </div>
            </ActionForm>
            <ActionForm action={saveGearLinks} className="grid gap-2" keep>
              <textarea name="links" className="input gear-links-text" wrap="off" spellCheck={false} placeholder={"1 https://link.coupang.com/a/xxxxx\n2 https://link.coupang.com/a/yyyyy"}
                defaultValue={Object.entries(links).sort((a, b) => Number(a[0]) - Number(b[0])).map(([i, u]) => `${Number(i) + 1} ${u}`).join("\n")} />
              <div><Submit confirm="쿠팡 링크를 저장할까요?">저장</Submit></div>
            </ActionForm>
          </div>
        </details>
      )}
      <div className="panel p-4 grid gap-1">
        <h2 className="font-bold">용품별 받은 사람</h2>
        <ol className="row-list gear-list">
          {GEARS.map((g, i) => {
            const got = who(i);
            return (
              <li key={g.name + i}>
                <span className="gear-no num">{i + 1}</span>
                <SpotCardButton g={i} className="gear-ico gear-card-btn" label={`${g.name} 카드 보기`}><GearArt i={i} size={40} /></SpotCardButton>
                <span className="gear-txt">
                  <b><SpotCardButton g={i} className="gear-name-btn" label={`${g.name} 카드 보기`}>{g.name}</SpotCardButton> <small className="gear-cnt">{got.length}명</small>{mgr && g.shop !== false && <>{links[i] && <small className="gear-link-ok">쿠팡 링크 등록됨</small>}<small className="gear-clk">쿠팡 클릭 {clicks[i]?.n ?? 0}회</small></>}</b>
                  <span className="text-sm text-muted">{g.tip} {g.pitch}</span>
                  <span className="gear-who">{got.length ? got.join(", ") : "아직 아무도 못 잡았어요"}</span>
                </span>
              {mgr && g.shop !== false && (
                <div className="gear-row-edit">
                  <details className="edit-fold gear-edit">
                    <summary className="gear-find">링크 수정</summary>
                    <ActionForm action={saveGearLink} collapse keep className="gear-edit-form">
                      <input type="hidden" name="no" value={i + 1} />
                      <input name="url" className="input" defaultValue={links[i] ?? ""} placeholder="https://link.coupang.com/a/…" aria-label={`${g.name} 쿠팡 링크`} />
                      <AdminMemberSearch name="by" label={null} placeholder="추천한 사람 검색" style={{ flex: "none", width: 168 }}
                        members={crew.map((m) => ({ nick: m.nick, name: names[m.nick] }))} />
                      <Submit className="btn text-xs">저장</Submit>
                    </ActionForm>
                  </details>
                  {edits[i]?.[0] && (
                    <div className="gear-edit-log">
                      <span>
                        링크 {edits[i][0].removed ? "삭제" : "수정"} {new Date(edits[i][0].at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", "/")}
                        {edits[i][0].by ? ` · 추천 ${edits[i][0].by}` : ""} · {edits[i][0].via === "직접" ? "수정" : edits[i][0].via} {edits[i][0].editor}
                        {edits[i].length > 1 ? ` (총 ${edits[i].length}회)` : ""}
                      </span>
                      {edits[i][0].by && (
                        <form action={clearLinkEditBy}>
                          <input type="hidden" name="g" value={i} />
                          <ConfirmButton className="gear-by-x" message="이 기록의 추천자 표시를 지울까요?" label="추천자 삭제">추천자 삭제</ConfirmButton>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

async function PointsAdmin() {
  const [members, totals, cfg] = await Promise.all([getMembers(), getPointTotals(), getPointConfig()]);
  const crew = members.filter((m) => !isStaffNick(m.nick))
    .map((m) => ({ m, p: totals[m.nick] ?? 0 }))
    .sort((a, b) => b.p - a.p || a.m.nick.localeCompare(b.m.nick, "ko"));
  const sources = await getPointSources(crew.map(({ m }) => m.nick)); // 누르면 어디서 모았는지 보인다
  return (
    <section className="grid gap-4">
      <div className="panel p-4 grid gap-3">
        <h2 className="font-bold">회원별 포인트 조정</h2>
        <ActionForm action={adjustMemberPoints} className="grid gap-2" keep>
          <AdminMemberSearch members={crew.map(({ m }) => ({ nick: m.nick, name: m.name?.trim() || "없음" }))} />
          <div className="flex gap-2">
            <input name="delta" type="number" step="0.1" className="input" style={{ width: 96 }} placeholder="+10 / -5" required aria-label="더하거나 뺄 포인트" />
            <input name="why" className="input flex-1 min-w-0" maxLength={40} placeholder="사유 (예: 대회 진행 도움)" required aria-label="사유" />
          </div>
          <div><Submit confirm="이 크루원의 포인트를 조정할까요?">반영</Submit></div>
        </ActionForm>
        <div className="row-list">
          {crew.map(({ m, p }) => {
            const lv = levelOf(p, cfg.step).lv;
            return (
              <details key={m.nick} className="pt-member">
                <summary className="flex items-center gap-2 py-2 text-sm">
                  <LevelBadge lv={lv} />
                  <b className="truncate min-w-0">{m.nick}/{m.name?.trim() || "없음"}</b>
                  <span className="text-xs text-muted shrink-0">{tierOf(lv).label}</span>
                  <b className="num ml-auto shrink-0">{p.toLocaleString()}P</b>
                </summary>
                <div className="pt-src pb-2">
                  {(sources[m.nick] ?? []).length === 0 && <p className="text-muted text-xs">아직 쌓인 포인트가 없어요.</p>}
                  {(sources[m.nick] ?? []).map((x) => (
                    <p key={x.label} className="flex justify-between gap-2 text-sm"><span className="truncate">{x.label} <small className="text-muted">{x.n}번</small></span><b className="num shrink-0">{x.p > 0 ? "+" : ""}{x.p}P</b></p>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <details className="panel p-4">
        <summary className="font-bold">포인트 · 등급 기준 바꾸기</summary>
        <ActionForm action={savePointRules} className="grid gap-2 mt-3" keep>
          <p className="text-xs text-muted">바꾼 기준은 저장한 뒤 새로 쌓이는 포인트부터 적용돼요. 이미 쌓인 포인트는 그대로예요.</p>
          <div className="pt-rules">
            {(Object.keys(PT_LABELS) as (keyof PointRules)[]).map((k) => (
              <label key={k} className="field"><span className="label">{PT_LABELS[k]}</span>
                <input name={k} type="number" step="0.1" min={0} className="input" defaultValue={cfg.pt[k]} required /></label>
            ))}
            <label className="field"><span className="label">한 단계에 필요한 포인트</span>
              <input name="step" type="number" min={10} className="input" defaultValue={cfg.step} required /></label>
          </div>
          <fieldset className="field">
            <legend className="label">1:1 대결 승리 정산 시점</legend>
            <div className="grid gap-1.5">
              {(Object.keys(VS_SETTLE) as VsSettle[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="vsSettle" value={k} defaultChecked={cfg.vsSettle === k} /> {VS_SETTLE[k]}</label>
              ))}
            </div>
          </fieldset>
          <div><Submit confirm="포인트 기준을 바꿀까요?">기준 저장</Submit></div>
        </ActionForm>
      </details>
    </section>
  );
}
