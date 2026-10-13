"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  K, redis, checkPw, hashPw, currentUser, startSession, endSession, getMember, saveMember, getMembers,
  getLinks, saveLinks, getMonth, loginBlocked, recordFail, newId, getSheets, kstToday, MENU_DEFAULTS, GOAL_EDIT_LIMIT, type AfterKind, type AfterParty, type Race, type MonthRec, type SheetKind,
} from "@/lib/hub";
import { syncMembers } from "@/lib/sheet";
import { detailExternal, viewUrl } from "@/lib/roadrun";

export type Result = { ok: boolean; msg?: string } | null;
const ok = (msg?: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

async function me() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
async function admin() {
  const u = await me();
  if (!u.admin) throw new Error("운영진만 할 수 있어요.");
  return u;
}

/* ---------- 로그인 ---------- */
export async function login(_: Result, fd: FormData): Promise<Result> {
  const nick = str(fd, "nick", 30);
  const pw = String(fd.get("pw") ?? "");
  const pw2 = fd.get("pw2");
  const next = str(fd, "next", 300);
  let m = await getMember(nick);
  // 첫 운영진 계정: 닉네임 ‘운영진’ + Vercel 환경변수 ADMIN_PASSWORD
  // 비밀번호가 비어 있을 때(처음이거나 초기화된 경우)도 같은 방법으로 들어온다
  if ((!m || !m.pw) && nick === "운영진" && process.env.ADMIN_PASSWORD) {
    if (await loginBlocked(nick)) return fail("비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요.");
    if (pw !== process.env.ADMIN_PASSWORD) { await recordFail(nick); return fail("비밀번호가 맞지 않아요."); }
    m = { nick, role: "admin", pw: hashPw(pw) };
    await saveMember(m);
  }
  if (!m) return fail("닉네임을 목록에서 골라 주세요.");
  if (await loginBlocked(nick)) return fail("비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요.");
  if (!m.pw) {
    if (pw.length < 4) return fail("비밀번호는 4자 이상으로 정해 주세요.");
    if (pw2 === null) return fail("처음 로그인이에요. 비밀번호를 한 번 더 입력해 주세요.");
    if (pw !== String(pw2)) return fail("두 비밀번호가 달라요. 다시 입력해 주세요.");
    await saveMember({ ...m, pw: hashPw(pw) });
  } else if (!checkPw(pw, m.pw)) {
    await recordFail(nick);
    return fail("비밀번호가 맞지 않아요. 잊었다면 운영진에게 초기화를 요청하세요.");
  }
  await startSession(nick);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const m = (await getMember(u.nick))!;
  if (!checkPw(String(fd.get("cur") ?? ""), m.pw)) return fail("지금 비밀번호가 맞지 않아요.");
  const pw = String(fd.get("pw") ?? "");
  if (pw.length < 4) return fail("새 비밀번호는 4자 이상이어야 해요.");
  await saveMember({ ...m, pw: hashPw(pw) });
  return ok("비밀번호를 바꿨어요.");
}

/* ---------- 회원 (운영진) ---------- */
export async function addMembers(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const names = str(fd, "names", 2000).split(/[,\n]/).map((s) => s.trim().slice(0, 20)).filter(Boolean);
  if (!names.length) return fail("추가할 닉네임을 입력해 주세요.");
  const existing = new Set((await getMembers()).map((m) => m.nick));
  const fresh = names.filter((n) => !existing.has(n));
  for (const n of fresh) await saveMember({ nick: n, role: "member", pw: null });
  revalidatePath("/", "layout");
  return ok(fresh.length ? `${fresh.join(", ")} 님을 추가했어요.` : "이미 모두 등록된 닉네임이에요.");
}

export async function memberAction(fd: FormData) {
  const u = await admin();
  const nick = str(fd, "nick", 30);
  const act = str(fd, "act");
  const m = await getMember(nick);
  if (!m) return;
  if (nick === "운영진") return; // 관리용 계정은 회원 목록에서 초기화·삭제하지 않는다
  if (act === "reset") await saveMember({ ...m, pw: null });
  if (act === "role" && nick !== u.nick) await saveMember({ ...m, role: m.role === "admin" ? "member" : "admin" });
  if (act === "delete" && nick !== u.nick) await redis.hdel(K.members, nick);
  revalidatePath("/admin");
}

/* ---------- 링크 (운영진) ---------- */
export async function saveLink(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const id = str(fd, "id");
  const link = { id: id || newId(), title: str(fd, "title", 40), url: str(fd, "url", 500), desc: str(fd, "desc", 80), tag: str(fd, "tag", 10) || "기타" };
  if (!link.title) return fail("이름을 입력해 주세요.");
  if (!/^https?:\/\//.test(link.url) && !link.url.startsWith("/")) return fail("주소는 https:// 로 시작해야 해요.");
  const links = await getLinks();
  const i = links.findIndex((l) => l.id === id);
  if (i >= 0) links[i] = link; else links.push(link);
  await saveLinks(links);
  revalidatePath("/", "layout");
  return ok(i >= 0 ? "수정했어요." : "추가했어요.");
}

export async function linkAction(fd: FormData) {
  await admin();
  const id = str(fd, "id");
  const act = str(fd, "act");
  const links = await getLinks();
  const i = links.findIndex((l) => l.id === id);
  if (i < 0) return;
  if (act === "delete") links.splice(i, 1);
  if (act === "up" && i > 0) [links[i - 1], links[i]] = [links[i], links[i - 1]];
  if (act === "down" && i < links.length - 1) [links[i + 1], links[i]] = [links[i], links[i + 1]];
  await saveLinks(links);
  revalidatePath("/", "layout");
}

/* ---------- 대회 ---------- */
export async function saveRace(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const id = str(fd, "id");
  const prev = id ? ((await redis.hget<Race>(K.races, id)) ?? undefined) : undefined;
  const dt = (k: string) => { const v = str(fd, k, 16); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : undefined; };
  const time = str(fd, "time", 5);
  const regStart = dt("regStart"), regEnd = dt("regEnd");
  const race: Race = {
    ...(typeof prev === "string" ? JSON.parse(prev) : prev ?? {}),
    id: id || newId(), name: str(fd, "name", 60), date: str(fd, "date", 10), place: str(fd, "place", 60), note: str(fd, "note", 200),
    time: /^\d{2}:\d{2}$/.test(time) ? time : undefined,
    regStart, regEnd,
    // 접수 날짜를 고르면 예전 글자 표기는 지운다
    reg: regStart || regEnd ? "" : str(fd, "reg", 60),
  };
  if (!race.name || !/^\d{4}-\d{2}-\d{2}$/.test(race.date)) return fail("대회명과 대회 날짜를 입력해 주세요.");
  if (regStart && regEnd && regStart > regEnd) return fail("접수 마감이 접수 시작보다 빨라요.");
  await redis.hset(K.races, { [race.id]: JSON.stringify(race) });
  revalidatePath("/", "layout");
  return ok(id ? "대회 정보를 수정했어요." : `${race.name}을(를) 추가했어요.`);
}

/** 대회 찾기(마라톤온라인)에서 고른 대회를 크루 일정에 넣는다. 크루원 누구나 가능. */
export async function addExternalRace(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const no = str(fd, "no", 12);
  const existing = Object.values((await redis.hgetall<Record<string, Race>>(K.races)) ?? {}).map((v) => (typeof v === "string" ? JSON.parse(v) : v) as Race);
  try {
    const d = await detailExternal(no);
    if (!d.name || !d.date) return fail("대회 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (existing.some((r) => r.src === no || (r.name === d.name && r.date === d.date))) return ok("이미 우리 일정에 있어요.");
    const race: Race = {
      id: newId(), name: d.name, date: d.date, time: d.time, place: d.place, reg: "",
      regStart: d.regStart, regEnd: d.regEnd, src: no, addedBy: u.nick,
      note: [d.courses, d.homepage ?? viewUrl(no)].filter(Boolean).join(" · "),
    };
    await redis.hset(K.races, { [race.id]: JSON.stringify(race) });
    revalidatePath("/", "layout");
    return ok(`${d.name}을(를) 우리 일정에 넣었어요.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "마라톤온라인에 연결하지 못했어요.");
  }
}

export async function deleteRace(fd: FormData) {
  await admin();
  const id = str(fd, "id");
  const afters = (await redis.hkeys(K.after(id))) ?? [];
  await redis.hdel(K.races, id);
  await redis.del(K.raceP(id), K.cheer(id), K.after(id), ...afters.map((a) => K.rsvp(a)));
  revalidatePath("/", "layout");
}

export async function joinRace(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const id = str(fd, "id");
  const who = u.admin ? str(fd, "nick", 30) || u.nick : u.nick;
  const course = str(fd, "courseEtc", 20) || str(fd, "course", 20);
  if (!course) return fail("코스를 고르거나 직접 입력해 주세요.");
  if (!(await redis.hexists(K.races, id))) return fail("없는 대회예요.");
  await redis.hset(K.raceP(id), { [who]: course });
  revalidatePath("/races");
  revalidatePath("/admin");
  revalidatePath("/");
  return ok(`${who} · ${course} 참가로 기록했어요.`);
}

/* ---------- 응원 참석 ---------- */
export async function toggleCheer(fd: FormData) {
  const u = await me();
  const id = str(fd, "id");
  const who = u.admin ? str(fd, "nick", 30) || u.nick : u.nick;
  if (!(await redis.hexists(K.races, id))) return;
  if (await redis.hexists(K.cheer(id), who)) await redis.hdel(K.cheer(id), who);
  else await redis.hset(K.cheer(id), { [who]: Date.now() });
  revalidatePath("/races");
  revalidatePath("/admin");
  revalidatePath("/");
}

/** 운영진: 크루원을 응원자로 추가 (이미 있으면 그대로) */
export async function addCheer(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const id = str(fd, "id");
  const nick = str(fd, "nick", 30);
  if (!nick) return fail("응원할 크루원을 골라 주세요.");
  if (!(await redis.hexists(K.races, id))) return fail("없는 대회예요.");
  await redis.hset(K.cheer(id), { [nick]: Date.now() });
  revalidatePath("/races");
  revalidatePath("/admin");
  revalidatePath("/");
  return ok(`${nick} 님을 응원으로 넣었어요.`);
}

/* ---------- 뒷풀이 (대회 아래 댓글처럼) ---------- */
export async function addAfter(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const id = str(fd, "id");
  if (!(await redis.hexists(K.races, id))) return fail("없는 대회예요.");
  const kind = (["photo", "carpool", "after"].includes(str(fd, "kind")) ? str(fd, "kind") : "after") as AfterKind;
  const seats = Math.round(Number(fd.get("seats")) || 0);
  const a: AfterParty = { id: newId(), kind, place: str(fd, "place", 60), time: str(fd, "time", 30), memo: str(fd, "memo", 200), by: u.nick, at: Date.now() };
  if (kind === "carpool") {
    if (!(seats >= 1 && seats <= 10)) return fail("태울 수 있는 자리 수(1~10)를 적어 주세요.");
    a.seats = seats;
  }
  if (!a.place && !a.time && !a.memo) return fail(kind === "photo" ? "단체사진 시간이나 장소를 적어 주세요." : "장소나 내용을 적어 주세요.");
  await redis.hset(K.after(id), { [a.id]: JSON.stringify(a) });
  // 뒷풀이는 올린 사람을 참석으로. 단사는 참석 표시가 없고, 카풀 운전자는 탑승자 수에서 뺀다
  if (kind === "after") await redis.hset(K.rsvp(a.id), { [u.nick]: "yes" });
  revalidatePath("/races");
  revalidatePath("/admin");
  return ok(kind === "photo" ? "단사시간을 올렸어요." : kind === "carpool" ? "카풀을 올렸어요." : "뒷풀이를 올렸어요.");
}

export async function rsvpAfter(fd: FormData) {
  const u = await me();
  const afterId = str(fd, "after");
  const v = str(fd, "v");
  // 카풀: 자리가 다 찼으면 탑승 신청을 받지 않는다 (자리 수는 저장된 글에서 읽는다)
  const raw = await redis.hget(K.after(str(fd, "id")), afterId);
  if (!raw) return;
  const post = (typeof raw === "string" ? JSON.parse(raw) : raw) as AfterParty;
  const seats = post.kind === "carpool" ? post.seats ?? 0 : 0;
  if (post.kind === "carpool" && post.by === u.nick) return; // 운전자는 탑승 신청하지 않는다
  if (v === "yes" && seats > 0) {
    const cur = Object.entries((await redis.hgetall<Record<string, string>>(K.rsvp(afterId))) ?? {});
    if (cur.filter(([n, x]) => x === "yes" && n !== u.nick).length >= seats) return;
  }
  if (v === "yes" || v === "no") await redis.hset(K.rsvp(afterId), { [u.nick]: v });
  else await redis.hdel(K.rsvp(afterId), u.nick);
  revalidatePath("/races");
  revalidatePath("/admin");
}

export async function deleteAfter(fd: FormData) {
  const u = await me();
  const id = str(fd, "id"), afterId = str(fd, "after");
  const raw = await redis.hget(K.after(id), afterId);
  if (!raw) return;
  const a = (typeof raw === "string" ? JSON.parse(raw) : raw) as { by: string };
  if (a.by !== u.nick && !u.admin) return;
  await redis.hdel(K.after(id), afterId);
  await redis.del(K.rsvp(afterId));
  revalidatePath("/races");
  revalidatePath("/admin");
}

export async function leaveRace(fd: FormData) {
  const u = await me();
  const nick = str(fd, "nick", 30);
  if (nick !== u.nick && !u.admin) return;
  await redis.hdel(K.raceP(str(fd, "id")), nick);
  revalidatePath("/races");
  revalidatePath("/admin");
  revalidatePath("/");
}

/* ---------- 월간 기록 ---------- */
async function editable(fd: FormData) {
  const u = await me();
  const nick = u.admin ? str(fd, "nick", 30) || u.nick : u.nick;
  const ym = str(fd, "ym", 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error("월 형식이 잘못됐어요.");
  const rec: MonthRec = (await getMonth(ym))[nick] ?? { goal: 0, days: {} };
  return { nick, ym, rec };
}

export async function setGoal(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const { nick, ym, rec } = await editable(fd);
  const goal = Math.round(Number(fd.get("goal")));
  if (!(goal > 0 && goal <= 2000)) return fail("목표는 1~2000km 사이로 입력해 주세요.");
  if (goal === rec.goal) return ok(`이미 ${goal}km가 목표예요.`);
  // 크루원은 처음 정한 뒤 한 달에 2번까지만 바꿀 수 있다 (운영진 화면에서 바꾸는 건 횟수에 넣지 않는다)
  const byAdmin = u.admin && fd.get("admin") === "1";
  let goalEdits = rec.goalEdits ?? 0;
  if (rec.goal > 0 && !byAdmin) {
    if (goalEdits >= GOAL_EDIT_LIMIT) return fail(`이번 달 목표는 이미 ${GOAL_EDIT_LIMIT}번 바꿨어요. 더 바꾸려면 운영진에게 요청해 주세요.`);
    goalEdits += 1;
  }
  await redis.hset(K.month(ym), { [nick]: JSON.stringify({ ...rec, goal, goalEdits }) });
  revalidatePath("/monthly");
  revalidatePath("/admin");
  revalidatePath("/");
  const left = GOAL_EDIT_LIMIT - goalEdits;
  if (byAdmin) return ok(`${nick} 님 목표를 ${goal}km로 정했어요.`);
  return ok(rec.goal > 0 ? `목표를 ${goal}km로 바꿨어요. 이번 달 남은 수정 ${left}번` : `목표를 ${goal}km로 정했어요. 이번 달 ${GOAL_EDIT_LIMIT}번까지 바꿀 수 있어요.`);
}

export async function setDay(_: Result, fd: FormData): Promise<Result> {
  const { nick, ym, rec } = await editable(fd);
  const day = Number(fd.get("day"));
  const raw = String(fd.get("km") ?? "").trim();
  const km = raw === "" ? 0 : Math.round(Number(raw) * 100) / 100;
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
  if (!(day >= 1 && day <= last)) return fail("날짜를 골라 주세요.");
  const iso = `${ym}-${String(day).padStart(2, "0")}`;
  if (iso > kstToday()) return fail("오늘 이후 날짜는 아직 기록할 수 없어요.");
  if (!(km >= 0 && km <= 300)) return fail("거리는 0~300km 사이 숫자로 입력해 주세요.");
  // mode=add: 그날 기록에 더하기(하루 여러 번 달린 경우), 그 외: 그날 기록을 이 값으로 바꾸기(0이면 지우기)
  const add = fd.get("mode") === "add";
  if (add && !(km > 0)) return fail("달린 거리를 입력해 주세요.");
  const days = { ...rec.days };
  const total = add ? Math.round(((Number(days[day]) || 0) + km) * 100) / 100 : km;
  if (total > 0) days[day] = total; else delete days[day];
  await redis.hset(K.month(ym), { [nick]: JSON.stringify({ ...rec, days }) });
  revalidatePath("/monthly");
  revalidatePath("/");
  const md = `${Number(ym.slice(5))}월 ${day}일`;
  if (add) return ok(`${md} +${km}km 더했어요. 이날 합계 ${total}km`);
  return ok(total > 0 ? `${md} 기록을 ${total}km로 고쳤어요.` : `${md} 기록을 지웠어요.`);
}

/* ---------- 구글시트 동기화 (운영진) ---------- */
async function sheetUrl(fd: FormData, kind: SheetKind) {
  const url = str(fd, "url", 500);
  if (!/docs\.google\.com\/spreadsheets\/d\//.test(url)) throw new Error("구글시트 주소를 붙여 넣어 주세요.");
  await redis.set("r2u:sheets", JSON.stringify({ ...(await getSheets()), [kind]: url }));
  return url;
}
const errMsg = (e: unknown) => fail(e instanceof Error ? e.message : "시트를 읽지 못했어요.");

export async function syncMembersAction(_: Result, fd: FormData): Promise<Result> {
  await admin();
  try {
    const r = await syncMembers(await sheetUrl(fd, "members"));
    revalidatePath("/", "layout");
    const parts = [`시트 ${r.total}명 확인`, r.added.length ? `새 회원 ${r.added.length}명 추가 (${r.added.join(", ")})` : "새 회원 없음"];
    if (r.promoted.length) parts.push(`운영진 지정: ${r.promoted.join(", ")}`);
    if (r.missing.length) parts.push(`시트에 없는 회원 ${r.missing.length}명: ${r.missing.join(", ")} (필요하면 아래에서 삭제하세요)`);
    return ok(parts.join(" · "));
  } catch (e) { return errMsg(e); }
}

/* ---------- 운영진: 크루원이 올린 내용 고치기·지우기 ---------- */
export async function updateAfter(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const id = str(fd, "id"), afterId = str(fd, "after");
  const raw = await redis.hget(K.after(id), afterId);
  if (!raw) return fail("이미 지워진 글이에요.");
  const a = (typeof raw === "string" ? JSON.parse(raw) : raw) as AfterParty;
  const next: AfterParty = { ...a, place: str(fd, "place", 60), time: str(fd, "time", 30), memo: str(fd, "memo", 200) };
  if (a.kind === "carpool") {
    const seats = Math.round(Number(fd.get("seats")) || 0);
    if (!(seats >= 1 && seats <= 10)) return fail("자리 수는 1~10이에요.");
    next.seats = seats;
  }
  await redis.hset(K.after(id), { [afterId]: JSON.stringify(next) });
  revalidatePath("/races");
  revalidatePath("/admin");
  return ok("고쳤어요.");
}

export async function removeRsvp(fd: FormData) {
  await admin();
  await redis.hdel(K.rsvp(str(fd, "after")), str(fd, "nick", 30));
  revalidatePath("/races");
  revalidatePath("/admin");
}

export async function resetMonthRecord(fd: FormData) {
  await admin();
  const ym = str(fd, "ym", 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return;
  await redis.hdel(K.month(ym), str(fd, "nick", 30));
  revalidatePath("/monthly");
  revalidatePath("/admin");
  revalidatePath("/");
}

/* ---------- 상단 메뉴 이름 (운영진) ---------- */
export async function saveMenu(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const menu = Object.fromEntries(
    (Object.keys(MENU_DEFAULTS) as (keyof typeof MENU_DEFAULTS)[]).map((k) => [k, str(fd, k, 12) || MENU_DEFAULTS[k]]),
  );
  await redis.set("r2u:menu", JSON.stringify(menu));
  revalidatePath("/", "layout");
  return ok("메뉴 이름을 저장했어요.");
}

/* ---------- 빙고 비밀 문장 (운영진) ---------- */
export async function saveBingoSecret(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const s = str(fd, "secret", 200);
  if (!s) return fail("빙고 운영진 비밀 문장을 입력해 주세요.");
  await redis.set("r2u:bingoSecret", s);
  revalidatePath("/admin");
  return ok("저장했어요. 이제 버튼 한 번으로 빙고 운영진 모드에 들어가요.");
}

