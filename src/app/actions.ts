"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  K, redis, checkPw, hashPw, currentUser, startSession, endSession, getMember, saveMember, getMembers, getAllVs, isStaffNick,
  getLinks, saveLinks, parseRaceTime, getMonth, loginBlocked, recordFail, newId, getSheets, kstToday, vsExpiry, MENU_DEFAULTS, GOAL_EDIT_LIMIT, type AfterKind, type AfterParty, type Race, type MonthRec, type SheetKind,
} from "@/lib/hub";
import { syncMembers } from "@/lib/sheet";
import { appendMemberToSheet, clearQueuedMemberName, getJoin, listJoins, newJoinId, queueMemberNameForSheet, renameMemberInSheet, saveJoin, updateMemberNameInSheet } from "@/lib/join";
import { addNotice, deleteNotice, getPushEnabledNicks, pushReady, sendPushAll, sendPushToNicks } from "@/lib/notice";
import { EVENT_PERIOD_KEY, resetEventCache } from "@/lib/event";
import { detailExternal, viewUrl } from "@/lib/roadrun";
import { approveNickChange, cancelNickChangeRequest, getNickChangeRequest, nickAvailable, saveNickChangeRequest, validNick } from "@/lib/nickname";

export type Result = { ok: boolean; msg?: string } | null;
const ok = (msg?: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const registrationUrl = (fd: FormData): string | null => {
  const raw = str(fd, "regUrl", 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
};

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
    if (!isStaffNick(nick) && !/^[a-z0-9]+$/.test(pw)) return fail("비밀번호는 영문 소문자와 숫자만 사용할 수 있어요.");
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
  if (!/^[a-z0-9]+$/.test(pw)) return fail("새 비밀번호는 영문 소문자와 숫자만 사용할 수 있어요.");
  await saveMember({ ...m, pw: hashPw(pw) });
  return ok("비밀번호를 바꿨어요.");
}

/* ---------- 회원 (운영진) ---------- */
export async function addMembers(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const names = str(fd, "names", 2000).split(/[,\n]/).map((s) => s.trim().slice(0, 20)).filter(Boolean);
  if (!names.length) return fail("추가할 닉네임을 입력해 주세요.");
  if (names.some(isStaffNick)) return fail("관리용 계정 이름은 크루원으로 추가할 수 없어요.");
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
  if (isStaffNick(nick)) return; // 관리용 계정은 회원 목록에서 초기화·삭제하지 않는다
  if (act === "delete" && nick !== u.nick) await redis.hdel(K.members, nick);
  revalidatePath("/admin");
}

export async function setMemberRole(_: Result, fd: FormData): Promise<Result> {
  const u = await admin();
  const nick = str(fd, "nick", 30);
  const role = str(fd, "role", 10);
  if (!nick || isStaffNick(nick)) return fail("변경할 회원을 다시 선택해 주세요.");
  const member = await getMember(nick);
  if (!member) return fail("회원 목록에서 찾을 수 없어요.");
  if (!["member", "admin", "manager"].includes(role)) return fail("권한을 다시 선택해 주세요.");
  if (nick === u.nick && role === "member") return fail("본인의 운영진 권한은 해제할 수 없어요.");
  const next = role === "manager"
    ? { ...member, role: "admin" as const, manager: true, managerPreviousRole: member.manager ? member.managerPreviousRole : member.role }
    : { ...member, role: role as "admin" | "member", manager: false, managerPreviousRole: undefined };
  await saveMember(next);
  revalidatePath("/", "layout");
  return ok(`${nick}님의 권한을 ${role === "manager" ? "관리자" : role === "admin" ? "운영진" : "크루원"}(으)로 설정했어요.`);
}

export async function resetMemberPassword(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const nick = str(fd, "nick", 30);
  if (!nick || isStaffNick(nick)) return fail("회원을 다시 선택해 주세요.");
  const member = await getMember(nick);
  if (!member) return fail("회원 목록에서 찾을 수 없어요.");
  await saveMember({ ...member, pw: null });
  revalidatePath("/admin");
  return ok(`${nick}님의 비밀번호를 초기화했어요. 다음 로그인 때 새 비밀번호를 정합니다.`);
}

export async function editMemberByAdmin(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const oldNick = str(fd, "oldNick", 30);
  const kind = str(fd, "kind", 10);
  if (!oldNick || isStaffNick(oldNick)) return fail("수정할 회원을 다시 확인해 주세요.");
  const member = await getMember(oldNick);
  if (!member) return fail("회원 목록에서 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.");
  if (kind === "name") {
    const name = str(fd, "name", 30) || "없음";
    if ((member.name?.trim() || "없음") === name) return fail("현재 이름과 같아요.");
    const sheet = await updateMemberNameInSheet(oldNick, name === "없음" ? "" : name);
    await saveMember({ ...member, name });
    if (sheet === "ok") await clearQueuedMemberName(oldNick);
    else await queueMemberNameForSheet(oldNick, name === "없음" ? "" : name);
    revalidatePath("/", "layout");
    return ok(sheet === "ok" ? `${oldNick}님의 이름과 구글시트 B열을 수정했어요.` : `${oldNick}님의 이름을 수정했어요. 구글시트 반영은 대기 중이며 다음 동기화 때 다시 시도해요.`);
  }
  if (kind !== "nick") return fail("수정 항목을 다시 확인해 주세요.");
  const newNick = str(fd, "newNick", 21);
  if (!validNick(newNick)) return fail("닉네임은 2~20자, 공백·쉼표·슬래시 없이 적어 주세요.");
  if (newNick === oldNick) return fail("현재 닉네임과 같아요.");
  if (!(await nickAvailable(oldNick, newNick))) return fail("이미 사용 중이거나 신청된 닉네임이에요.");
  try {
    const { eventWarning } = await approveNickChange(oldNick, newNick);
    const sheet = await renameMemberInSheet(oldNick, newNick, member.name && member.name !== "없음" ? member.name : "");
    revalidatePath("/", "layout");
    return ok(`${oldNick} → ${newNick} 변경 완료.${sheet === "ok" ? " 구글시트 A열도 반영했어요." : " 구글시트 자동 반영에 실패했어요. 회원 시트 A열을 확인해 주세요."}${eventWarning ? " 이벤트 명단 이름 변경은 실패했으니 빙고 운영진 화면에서 확인해 주세요." : ""} 변경된 회원은 새 닉네임으로 다시 로그인해 주세요.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "닉네임을 바꾸지 못했어요.");
  }
}

export async function editMyName(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  if (isStaffNick(u.nick)) return fail("관리용 계정의 이름은 바꿀 수 없어요.");
  const member = await getMember(u.nick);
  if (!member) return fail("회원 정보를 찾을 수 없어요. 다시 로그인해 주세요.");
  const name = str(fd, "name", 30) || "없음";
  if ((member.name?.trim() || "없음") === name) return fail("현재 이름과 같아요.");
  await saveMember({ ...member, name });
  const sheet = await updateMemberNameInSheet(u.nick, name === "없음" ? "" : name);
  if (sheet === "ok") await clearQueuedMemberName(u.nick);
  else await queueMemberNameForSheet(u.nick, name === "없음" ? "" : name);
  revalidatePath("/", "layout");
  return ok(sheet === "ok" ? "이름을 변경하고 구글시트에도 반영했어요." : "이름을 변경했어요. 구글시트 반영은 대기 중이며 다음 동기화 때 다시 시도해요.");
}

/* ---------- 닉네임 변경 요청 → 운영진 승인 ---------- */
export async function requestNickChange(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  if (isStaffNick(u.nick)) return fail("관리용 계정의 닉네임은 바꿀 수 없어요.");
  const newNick = str(fd, "newNick", 21);
  if (!validNick(newNick)) return fail("닉네임은 2~20자, 공백·쉼표·슬래시 없이 적어 주세요.");
  if (newNick === u.nick) return fail("지금 쓰는 닉네임과 같아요.");
  if (!(await nickAvailable(u.nick, newNick))) return fail("이미 사용 중이거나 신청된 닉네임이에요.");
  await saveNickChangeRequest({ oldNick: u.nick, newNick, status: "pending", at: Date.now() });
  revalidatePath("/me");
  revalidatePath("/admin");
  return ok("닉네임 변경을 신청했어요. 운영진 승인 후 새 닉네임으로 다시 로그인해 주세요.");
}

export async function cancelNickChange(_state: Result): Promise<Result> {
  void _state;
  const u = await me();
  const request = await getNickChangeRequest(u.nick);
  if (!request || request.status !== "pending") return fail("대기 중인 신청이 없어요.");
  await cancelNickChangeRequest(u.nick);
  revalidatePath("/me");
  revalidatePath("/admin");
  return ok("닉네임 변경 신청을 취소했어요.");
}

export async function decideNickChange(_: Result, fd: FormData): Promise<Result> {
  const u = await admin();
  const oldNick = str(fd, "oldNick", 30);
  const request = await getNickChangeRequest(oldNick);
  if (!request || request.status !== "pending") return fail("이미 처리된 신청이에요.");
  if (u.nick === oldNick) return fail("본인의 닉네임 변경은 다른 운영진이 승인해 주세요.");
  if (str(fd, "act") === "reject") {
    const reason = str(fd, "reason", 300);
    if (!reason) return fail("거절 사유를 입력해 주세요.");
    await saveNickChangeRequest({ ...request, status: "rejected", decidedAt: Date.now(), by: u.nick, reason });
    revalidatePath("/admin");
    revalidatePath("/me");
    return ok("닉네임 변경을 거절했어요.");
  }
  if (!validNick(request.newNick) || !(await nickAvailable(oldNick, request.newNick))) return fail("새 닉네임이 이미 사용 중이에요.");
  try {
    const member = await getMember(oldNick);
    const { eventWarning } = await approveNickChange(oldNick, request.newNick);
    const sheet = await renameMemberInSheet(oldNick, request.newNick, member?.name && member.name !== "없음" ? member.name : "");
    revalidatePath("/", "layout");
    return ok(`${oldNick} → ${request.newNick} 변경 완료.${sheet === "ok" ? " 구글시트 A열 닉네임과 B열 이름도 반영했어요." : " 구글시트 자동 반영에 실패했어요. 회원 시트 A열 닉네임과 B열 이름을 확인해 주세요."}${eventWarning ? " 이벤트 명단 이름 변경은 실패했으니 빙고 운영진 화면에서 확인해 주세요." : ""}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "닉네임을 바꾸지 못했어요.");
  }
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
  const regUrl = registrationUrl(fd);
  if (regUrl === null) return fail("접수 페이지 주소는 http:// 또는 https://로 시작하는 주소를 입력해 주세요.");
  const id = str(fd, "id");
  const prev = id ? ((await redis.hget<Race>(K.races, id)) ?? undefined) : undefined;
  const dt = (k: string) => { const v = str(fd, k, 16); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : undefined; };
  const time = str(fd, "time", 5);
  const regStart = dt("regStart"), regEnd = dt("regEnd");
  const race: Race = {
    ...(typeof prev === "string" ? JSON.parse(prev) : prev ?? {}),
    id: id || newId(), name: str(fd, "name", 60), date: str(fd, "date", 10), place: str(fd, "place", 60),
    address: str(fd, "address", 150), placeUrl: str(fd, "placeUrl", 200), note: str(fd, "note", 200),
    time: /^\d{2}:\d{2}$/.test(time) ? time : undefined,
    regStart, regEnd, regUrl: regUrl || undefined,
    // 접수 날짜를 고르면 예전 글자 표기는 지운다
    reg: regStart || regEnd ? "" : str(fd, "reg", 60),
  };
  if (!/^https?:\/\/place\.map\.kakao\.com\/\d+\/?$/.test(race.placeUrl ?? "")) { race.address = ""; race.placeUrl = ""; }
  if (!race.name || !/^\d{4}-\d{2}-\d{2}$/.test(race.date)) return fail("대회명과 대회 날짜를 입력해 주세요.");
  if (regStart && regEnd && regStart > regEnd) return fail("접수 마감이 접수 시작보다 빨라요.");
  await redis.hset(K.races, { [race.id]: JSON.stringify(race) });
  revalidatePath("/", "layout");
  return ok(id ? "대회 정보를 수정했어요." : `${race.name}을(를) 추가했어요.`);
}

/** 대회 찾기에서 못 찾은 대회를 직접 적어 우리 일정에 넣는다. 크루원 누구나 가능. */
export async function addManualRace(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const regUrl = registrationUrl(fd);
  if (regUrl === null) return fail("접수 페이지 주소는 http:// 또는 https://로 시작하는 주소를 입력해 주세요.");
  const dt = (k: string) => { const v = str(fd, k, 16); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : undefined; };
  const time = str(fd, "time", 5);
  const regStart = dt("regStart"), regEnd = dt("regEnd");
  const race: Race = {
    id: newId(), name: str(fd, "name", 60), date: str(fd, "date", 10), place: str(fd, "place", 60),
    address: str(fd, "address", 150), placeUrl: str(fd, "placeUrl", 200), note: str(fd, "note", 200),
    time: /^\d{2}:\d{2}$/.test(time) ? time : undefined, regStart, regEnd, regUrl: regUrl || undefined, reg: "", addedBy: u.nick,
  };
  if (!/^https?:\/\/place\.map\.kakao\.com\/\d+\/?$/.test(race.placeUrl ?? "")) { race.address = ""; race.placeUrl = ""; }
  if (!race.name || !/^\d{4}-\d{2}-\d{2}$/.test(race.date)) return fail("대회명과 대회 날짜를 입력해 주세요.");
  if (regStart && regEnd && regStart > regEnd) return fail("접수 마감이 접수 시작보다 빨라요.");
  const existing = Object.values((await redis.hgetall<Record<string, Race>>(K.races)) ?? {}).map((v) => (typeof v === "string" ? JSON.parse(v) : v) as Race);
  const dup = existing.find((r) => r.name === race.name && r.date === race.date);
  if (dup) redirect(`/races#${dup.id}`);
  await redis.hset(K.races, { [race.id]: JSON.stringify(race) });
  revalidatePath("/", "layout");
  redirect(`/races#${race.id}`);
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
  return ok(`${who} · ${course} 크루 참가로 표시했어요. 대회 접수는 주최 측 페이지에서 별도로 확인해 주세요.`);
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
  const a: AfterParty = { id: newId(), kind, place: str(fd, "place", 60), address: str(fd, "address", 150), placeUrl: str(fd, "placeUrl", 200), time: str(fd, "time", 30), memo: str(fd, "memo", 200), by: u.nick, at: Date.now() };
  if (!/^https?:\/\/place\.map\.kakao\.com\/\d+\/?$/.test(a.placeUrl ?? "")) { a.address = ""; a.placeUrl = ""; }
  if (kind === "carpool") {
    if (!(seats >= 1 && seats <= 10)) return fail("태울 수 있는 자리 수(1~10)를 적어 주세요.");
    a.seats = seats;
    // 운전자는 올리는 사람이 아니어도 된다(크루원 중에서 고른다). 비우면 올리는 사람.
    const driver = str(fd, "driver", 30);
    if (driver && driver !== u.nick) {
      if (isStaffNick(driver) || !(await getMember(driver))) return fail("운전자는 크루원 중에서 골라 주세요.");
      a.driver = driver;
    }
  }
  if (!a.place && !a.time && !a.memo) return fail(kind === "photo" ? "단체사진 시간이나 장소를 적어 주세요." : "장소나 내용을 적어 주세요.");
  await redis.hset(K.after(id), { [a.id]: JSON.stringify(a) });
  // 뒷풀이는 올린 사람을 참석으로. 단사는 참석 표시가 없고, 카풀 운전자는 탑승자 수에서 뺀다
  if (kind === "after") await redis.hset(K.rsvp(a.id), { [u.nick]: "yes" });
  revalidatePath("/races");
  revalidatePath("/admin");
  return ok(kind === "photo" ? "단사시간을 올렸어요." : kind === "carpool" ? "카풀을 올렸어요." : "뒷풀이를 올렸어요.");
}

/** 시간 있는 일정의 참석자 또는 운영진이 알림을 보낸다. 각 일정당 1시간에 한 번만 허용. */
export async function sendScheduleNotice(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const raceId = str(fd, "id", 30), itemId = str(fd, "after", 30);
  const [raceRaw, itemRaw, participants, cheers, rsvps] = await Promise.all([
    redis.hget(K.races, raceId), itemId ? redis.hget(K.after(raceId), itemId) : Promise.resolve(null),
    redis.hkeys(K.raceP(raceId)), redis.hkeys(K.cheer(raceId)),
    itemId ? redis.hgetall<Record<string, string>>(K.rsvp(itemId)) : Promise.resolve(null),
  ]);
  if (!raceRaw || (itemId && !itemRaw)) return fail("일정을 찾을 수 없어요.");
  const race = (typeof raceRaw === "string" ? JSON.parse(raceRaw) : raceRaw) as Race;
  const item = itemRaw ? (typeof itemRaw === "string" ? JSON.parse(itemRaw) : itemRaw) as AfterParty : null;
  const kind = item?.kind ?? (item ? "after" : "race");
  const time = item?.time ?? race.time ?? "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("시간이 정해진 일정에서만 보낼 수 있어요.");
  const startsAt = Date.parse(`${race.date}T${time}:00+09:00`);
  if (!Number.isFinite(startsAt) || startsAt <= Date.now()) return fail("이미 지난 일정이에요.");
  const raceAttendees = [...(participants ?? []), ...(cheers ?? [])];
  const yes = Object.entries(rsvps ?? {}).filter(([, value]) => value === "yes").map(([nick]) => nick);
  const attendees = new Set((kind === "carpool" ? [...yes, item?.driver || item?.by || ""] : kind === "after" ? yes : raceAttendees).filter((nick) => nick && !isStaffNick(nick)));
  if (!u.admin && !attendees.has(u.nick)) return fail("이 일정의 참석자나 운영진만 알림을 보낼 수 있어요.");
  if (!pushReady()) return fail("알림 발송 설정이 아직 준비되지 않았어요.");
  const subscribed = await getPushEnabledNicks();
  const recipients = new Set([...attendees].filter((nick) => subscribed.has(nick)));
  if (!recipients.size) return fail("알림을 켠 참석자가 없어요.");
  const marker = `r2u:scheduleNotice:${raceId}:${itemId || "race"}`;
  if (await redis.set(marker, "1", { nx: true, ex: 3600 }) !== "OK") return fail("이 일정의 알림은 1시간에 한 번만 보낼 수 있어요.");
  try {
    const title = { race: "🏁 대회 알림", photo: "📷 단체사진 알림", carpool: "🚗 카풀 알림", after: "🍽️ 뒷풀이 알림" }[kind] || "일정 알림";
    const result = await sendPushToNicks(recipients, title, `${race.name} · ${time}${item?.place ? ` · ${item.place}` : race.place ? ` · ${race.place}` : ""}`, `/races#${raceId}`);
    if (!result.sent) { await redis.del(marker); return fail("알림 발송에 실패했어요. 잠시 후 다시 시도해 주세요."); }
    return ok(`알림을 보냈어요. (${result.sent}개 기기)`);
  } catch {
    await redis.del(marker);
    return fail("알림 발송에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
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
  if (post.kind === "carpool" && (post.driver || post.by) === u.nick) return; // 운전자는 탑승 신청하지 않는다
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
    if (r.renamed.length) parts.push(`이름 갱신 ${r.renamed.length}명`);
    if (r.promoted.length) parts.push(`운영진 지정: ${r.promoted.join(", ")}`);
    if (r.missing.length) parts.push(`시트에 없는 회원 ${r.missing.length}명: ${r.missing.join(", ")} (필요하면 아래에서 삭제하세요)`);
    parts.push(`이벤트 참가자 ${r.eventNicks.length}명 확인`);
    if (r.bingo?.noSecret) parts.push("이벤트 운영진 비밀 문장을 저장하면 이벤트 명단에도 자동으로 들어가요");
    else if (r.bingo) {
      if (r.bingo.pushed.length) parts.push(`이벤트 명단에 추가 (${r.bingo.pushed.join(", ")})`);
      if (r.bingo.failed.length) parts.push(`빙고 명단 추가 실패 (${r.bingo.failed.join(", ")})`);
    }
    return ok(parts.join(" · "));
  } catch (e) { return errMsg(e); }
}

/* ---------- 운영진: 크루원이 올린 내용 고치기·지우기 ---------- */
export async function updateAfter(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const id = str(fd, "id"), afterId = str(fd, "after");
  const raw = await redis.hget(K.after(id), afterId);
  if (!raw) return fail("이미 지워진 글이에요.");
  const a = (typeof raw === "string" ? JSON.parse(raw) : raw) as AfterParty;
  // 올린 사람, 카풀 운전자, 운영진이 고칠 수 있다
  if (!u.admin && a.by !== u.nick && (a.driver || a.by) !== u.nick) return fail("올린 사람만 고칠 수 있어요.");
  const next: AfterParty = { ...a, place: str(fd, "place", 60), address: str(fd, "address", 150), placeUrl: str(fd, "placeUrl", 200), time: str(fd, "time", 30), memo: str(fd, "memo", 200) };
  if (!/^https?:\/\/place\.map\.kakao\.com\/\d+\/?$/.test(next.placeUrl ?? "")) { next.address = ""; next.placeUrl = ""; }
  if (a.kind === "carpool") {
    const seats = Math.round(Number(fd.get("seats")) || 0);
    if (!(seats >= 1 && seats <= 10)) return fail("자리 수는 1~10이에요.");
    const riders = Object.values((await redis.hgetall<Record<string, string>>(K.rsvp(afterId))) ?? {}).filter((x) => x === "yes").length;
    if (seats < riders) return fail(`이미 ${riders}명이 탑승 신청했어요. 자리를 ${riders}개보다 적게 줄일 수 없어요.`);
    next.seats = seats;
    const driver = str(fd, "driver", 30);
    if (driver) {
      if (isStaffNick(driver) || !(await getMember(driver))) return fail("운전자는 크루원 중에서 골라 주세요.");
      next.driver = driver === a.by ? undefined : driver;
      // 운전자는 탑승자 명단에서 뺀다
      await redis.hdel(K.rsvp(afterId), driver);
    }
  }
  if (!next.place && !next.time && !next.memo) return fail("장소나 내용을 적어 주세요.");
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
  if (!s) return fail("이벤트 운영진 비밀 문장을 입력해 주세요.");
  await redis.set("r2u:bingoSecret", s);
  revalidatePath("/admin");
  return ok("저장했어요. 이제 버튼 한 번으로 이벤트 운영진 모드에 들어가요.");
}


/* ---------- 이벤트 오픈일·종료일 (운영진) ---------- */
export async function saveEventPeriod(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const start = str(fd, "start", 10), end = str(fd, "end", 10);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(start) || !re.test(end)) return fail("날짜를 골라 주세요.");
  if (end < start) return fail("종료일이 시작일보다 빠를 수 없어요.");
  // 허브에 저장한다 (이벤트 서버의 비밀 문장은 필요 없다). 이벤트 화면은 허브에서 이 기간을 받아 쓴다.
  await redis.set(EVENT_PERIOD_KEY, JSON.stringify({ start, end }));
  resetEventCache();
  revalidatePath("/", "layout");
  return ok("이벤트 기간을 저장했어요. (반영까지 최대 1분)");
}

/* ---------- 공지사항 (운영진) ---------- */
export async function postNotice(_: Result, fd: FormData): Promise<Result> {
  const u = await admin();
  const title = str(fd, "title", 60), body = str(fd, "body", 500);
  if (!title) return fail("공지 제목을 입력해 주세요.");
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = str(fd, "from", 10), to = str(fd, "to", 10);
  if ((from && !re.test(from)) || (to && !re.test(to))) return fail("날짜를 다시 골라 주세요.");
  if (from && to && to < from) return fail("노출 종료일이 시작일보다 빠를 수 없어요.");
  if (to && to < kstToday()) return fail("노출 종료일이 이미 지났어요.");
  const file = fd.get("image");
  let image: { type: string; data: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return fail("JPG, PNG, WebP, GIF 이미지만 올릴 수 있어요.");
    if (file.size > 3_000_000) return fail("이미지는 3MB 이하로 올려 주세요.");
    image = { type: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  await addNotice({ title, body, by: u.nick, ...(from ? { from } : {}), ...(to ? { to } : {}) }, image);
  revalidatePath("/", "layout");
  revalidatePath("/notices");
  if (from && from > kstToday()) return ok(`공지를 올렸어요. ${from}부터 홈에 보여요. (알림은 보내지 않았어요)`);
  if (fd.get("push") !== "on") return ok("공지를 올렸어요. (알림은 보내지 않았어요)");
  const r = await sendPushAll(`📢 ${title}`, body.slice(0, 120) || "새 공지가 올라왔어요.", "/");
  if (r.skipped) return ok("공지를 올렸어요. 알림용 키가 설정돼 있지 않아 알림은 보내지 못했어요.");
  return ok(`공지를 올리고 알림을 보냈어요. (성공 ${r.sent}명${r.failed ? `, 실패 ${r.failed}명` : ""})`);
}
export async function removeNotice(fd: FormData) {
  await admin();
  await deleteNotice(str(fd, "id", 40));
  revalidatePath("/", "layout");
  revalidatePath("/notices");
}

/* ---------- 닉네임 생성 요청 (신규 크루원) → 링크를 카톡방에 전달 → 운영진 승인 ---------- */
export async function requestJoin(_: Result, fd: FormData): Promise<Result> {
  const nick = str(fd, "nick", 20);
  if (nick.length < 2) return fail("닉네임은 2글자 이상으로 적어 주세요.");
  if (/[\s,\n]/.test(nick) || isStaffNick(nick)) return fail("사용할 수 없는 닉네임이에요. (공백·쉼표 없이 적어 주세요)");
  const lower = nick.toLowerCase();
  if ((await getMembers()).some((m) => m.nick.toLowerCase() === lower)) return fail("이미 있는 닉네임이에요. 로그인 화면에서 골라 주세요.");
  const all = await listJoins();
  const dup = all.find((r) => r.status === "pending" && r.nick.toLowerCase() === lower);
  if (dup) redirect(`/join/${dup.id}`);
  if (all.filter((r) => r.status === "pending").length >= 60) return fail("요청이 너무 많이 쌓여 있어요. 운영진에게 말해 주세요.");
  const id = newJoinId();
  await saveJoin({ id, nick, at: Date.now(), status: "pending" });
  redirect(`/join/${id}?new=1`);
}

export async function decideJoin(fd: FormData) {
  const u = await admin();
  const r = await getJoin(str(fd, "id", 60));
  if (!r || r.status !== "pending") return;
  if (str(fd, "act") === "reject") {
    const reason = str(fd, "reason", 300);
    if (!reason) return;
    await saveJoin({ ...r, status: "rejected", by: u.nick, reason });
  } else {
    // 그 사이 같은 닉네임이 생겼으면 새로 만들지 않는다
    if (!(await getMember(r.nick))) await saveMember({ nick: r.nick, role: "member", pw: null });
    const sheet = await appendMemberToSheet(r.nick);
    await saveJoin({ ...r, status: "approved", by: u.nick, sheet });
  }
  revalidatePath("/", "layout");
}

/* ---------- 내 대회 기록 ---------- */
export async function saveRaceRecord(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const id = str(fd, "id", 20);
  const race = await redis.hget(K.races, id);
  if (!race) return fail("대회를 골라 주세요.");
  if (!(await redis.hget(K.raceP(id), u.nick))) return fail("크루 참가로 표시한 대회만 기록할 수 있어요.");
  const course = str(fd, "course", 20) || "기타";
  // DNF(미완주)·DNS(불참)는 기록 시간 없이 저장한다
  if (course === "DNF" || course === "DNS") {
    await redis.hset(K.raceRec(u.nick), { [id]: JSON.stringify({ course, sec: 0, time: "", note: str(fd, "note", 100), at: Date.now() }) });
    revalidatePath("/me");
    return ok(`${course}로 저장했어요.`);
  }
  // 시계 입력은 초가 0이면 "01:45"처럼 초를 빼고 보낸다. 앞의 두 칸을 시:분으로 본다.
  const raw = str(fd, "time", 12);
  const t = parseRaceTime(/^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw);
  if (!t) return fail("기록의 시간·분·초를 골라 주세요. (0시간 0분 0초는 저장할 수 없어요)");
  await redis.hset(K.raceRec(u.nick), { [id]: JSON.stringify({ course, sec: t.sec, time: t.time, note: str(fd, "note", 100), at: Date.now() }) });
  revalidatePath("/me");
  return ok(`기록을 저장했어요. (${course} ${t.time})`);
}
export async function deleteRaceRecord(fd: FormData) {
  const u = await me();
  await redis.hdel(K.raceRec(u.nick), str(fd, "id", 20));
  revalidatePath("/me");
}

/* ---------- 크루 현황: 한 명 골라 대결하기 ---------- */
export async function setVersus(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const ym = str(fd, "ym", 7), opp = str(fd, "opp", 30);
  if (!/^\d{4}-\d{2}$/.test(ym) || !opp || opp === u.nick || isStaffNick(opp)) return fail("대결 상대를 다시 골라 주세요.");
  if (ym !== kstToday().slice(0, 7)) return fail("대결은 이번 달에만 시작할 수 있어요.");
  if (!(await getMember(opp))) return fail("회원 명단에 없는 상대예요.");
  const lock = `r2u:vs:${ym}:lock`;
  const token = newId();
  if (await redis.set(lock, token, { nx: true, ex: 10 }) !== "OK") return fail("대결을 처리 중이에요. 잠시 후 다시 눌러 주세요.");
  try {
    const pairs = await getAllVs(ym);
    if (pairs[u.nick]) return fail(`${u.nick}님은 이미 ${pairs[u.nick]}님과 대결 중이에요. 기존 대결을 끝내 주세요.`);
    if (pairs[opp]) return fail(`${opp}님은 이미 다른 크루원과 대결 중이에요.`);
    pairs[u.nick] = opp;
    pairs[opp] = u.nick;
    const tx = redis.multi();
    tx.del(K.vs(ym));
    tx.hset(K.vs(ym), pairs);
    tx.expireat(K.vs(ym), vsExpiry(ym));
    tx.hdel(K.vsEnd(ym), u.nick, opp);
    await tx.exec();
  } finally {
    if (await redis.get(lock) === token) await redis.del(lock);
  }
  revalidatePath("/crew");
  return ok(`${opp}님과 1:1 대결을 시작했어요.`);
}
export async function manageVersusEnd(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const ym = str(fd, "ym", 7);
  const act = str(fd, "act", 10);
  if (!/^\d{4}-\d{2}$/.test(ym)) return fail("대결 기간을 다시 확인해 주세요.");
  if (ym !== kstToday().slice(0, 7)) return fail("지난달 대결은 이미 종료됐어요.");
  if (!["request", "approve", "reject", "cancel"].includes(act)) return fail("종료 요청을 다시 확인해 주세요.");
  const lock = `r2u:vs:${ym}:lock`;
  const token = newId();
  if (await redis.set(lock, token, { nx: true, ex: 10 }) !== "OK") return fail("대결을 처리 중이에요. 잠시 후 다시 눌러 주세요.");
  try {
    const pairs = await getAllVs(ym);
    const opp = pairs[u.nick];
    if (!opp) return fail("진행 중인 대결이 없어요.");
    const [outgoing, incoming] = await Promise.all([
      redis.hget<string>(K.vsEnd(ym), u.nick),
      redis.hget<string>(K.vsEnd(ym), opp),
    ]);
    if (act === "request") {
      if (incoming === u.nick) return fail("상대방이 이미 종료를 요청했어요. 승인하거나 거절해 주세요.");
      if (outgoing === opp) return ok("상대방의 승인을 기다리고 있어요.");
      await redis.hset(K.vsEnd(ym), { [u.nick]: opp });
      await redis.expireat(K.vsEnd(ym), vsExpiry(ym));
      revalidatePath("/crew");
      return ok("대결 종료를 요청했어요. 상대방이 승인하면 대결이 끝나요.");
    }
    if (act === "cancel") {
      if (outgoing !== opp) return fail("취소할 종료 요청이 없어요.");
      await redis.hdel(K.vsEnd(ym), u.nick);
      revalidatePath("/crew");
      return ok("대결 종료 요청을 취소했어요.");
    }
    if (incoming !== u.nick) return fail("상대방의 종료 요청이 없어요.");
    if (act === "reject") {
      await redis.hdel(K.vsEnd(ym), opp);
      revalidatePath("/crew");
      return ok("대결 종료 요청을 거절했어요. 대결은 계속돼요.");
    }
    delete pairs[u.nick];
    delete pairs[opp];
    const tx = redis.multi();
    tx.del(K.vs(ym));
    if (Object.keys(pairs).length) { tx.hset(K.vs(ym), pairs); tx.expireat(K.vs(ym), vsExpiry(ym)); }
    tx.hdel(K.vsEnd(ym), u.nick, opp);
    await tx.exec();
  } finally {
    if (await redis.get(lock) === token) await redis.del(lock);
  }
  revalidatePath("/crew");
  return ok("상대방의 종료 요청을 승인해 1:1 대결을 끝냈어요.");
}

export async function cancelVersusByAdmin(_: Result, fd: FormData): Promise<Result> {
  await admin();
  const ym = str(fd, "ym", 7);
  const a = str(fd, "a", 30), b = str(fd, "b", 30);
  if (ym !== kstToday().slice(0, 7) || !a || !b || a === b) return fail("취소할 대결을 다시 확인해 주세요.");
  const lock = `r2u:vs:${ym}:lock`;
  const token = newId();
  if (await redis.set(lock, token, { nx: true, ex: 10 }) !== "OK") return fail("대결을 처리 중이에요. 잠시 후 다시 눌러 주세요.");
  try {
    const pairs = await getAllVs(ym);
    if (pairs[a] !== b || pairs[b] !== a) return fail("이미 종료됐거나 다른 대결로 변경됐어요.");
    delete pairs[a];
    delete pairs[b];
    const tx = redis.multi();
    tx.del(K.vs(ym));
    if (Object.keys(pairs).length) { tx.hset(K.vs(ym), pairs); tx.expireat(K.vs(ym), vsExpiry(ym)); }
    tx.hdel(K.vsEnd(ym), a, b);
    await tx.exec();
  } finally {
    if (await redis.get(lock) === token) await redis.del(lock);
  }
  revalidatePath("/admin");
  revalidatePath("/crew");
  return ok(`${a}님과 ${b}님의 대결을 취소했어요.`);
}
