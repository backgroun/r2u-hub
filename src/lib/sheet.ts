import "server-only";
import { K, getMembers, isStaffNick, saveMember, redis } from "./hub";
import { bingoRpc } from "./event";
import { clearQueuedMemberName, pendingMemberNames, updateMemberNameInSheet } from "./join";

/** 시트 주소(…/d/<id>/edit?gid=<gid>)를 CSV 내보내기 주소로 바꾼다. 시트는 ‘링크가 있는 모든 사용자’ 보기 공유여야 한다. */
export function csvUrl(sheetUrl: string) {
  const id = sheetUrl.match(/\/d\/([\w-]+)/)?.[1];
  const gid = sheetUrl.match(/[#?&]gid=(\d+)/)?.[1] ?? "0";
  if (!id) throw new Error("구글시트 주소가 아니에요. 시트 탭을 연 상태의 주소를 붙여 넣어 주세요.");
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function fetchSheet(sheetUrl: string) {
  const res = await fetch(csvUrl(sheetUrl), { cache: "no-store", redirect: "follow" });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) throw new Error("시트를 읽지 못했어요. 공유 설정을 ‘링크가 있는 모든 사용자 - 뷰어’로 바꿔 주세요.");
  return parseCsv(text);
}

export function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- 회원 동기화 ----------
   A열 = 닉네임, B열 = 이름(비어 있으면 '없음').
   ‘역할’ 또는 ‘운영진’ 머리글 열이 있으면, 그 칸에 ‘운영’이 들어간 사람을 운영진으로 지정한다.
   '닉네임(이벤트)' 머리글 열(현재 D열)의 닉네임이 이벤트 참가자 명단이 된다. */
export const EVENT_NICKS_KEY = "r2u:eventNicks";

/** 이벤트 참가자 명단을 빙고 서버에도 넣는다(없는 사람만 추가). 빙고 운영진 비밀 문장이 저장돼 있어야 한다. */
async function pushToBingo(nicks: string[]) {
  const secret = await redis.get<string>("r2u:bingoSecret");
  if (!secret) return { pushed: [] as string[], failed: [] as string[], noSecret: true };
  const snap = await bingoRpc<{ names?: string[] }>("get_snapshot");
  const have = new Set((snap?.names ?? []).map((n) => n.trim().toLowerCase()));
  const pushed: string[] = [], failed: string[] = [];
  for (const nick of nicks) {
    if (have.has(nick.toLowerCase())) continue;
    const r = await bingoRpc<{ ok?: boolean }>("admin_member", { p_secret: secret, p_action: "add", p_name: nick, p_new_name: null });
    (r?.ok ? pushed : failed).push(nick);
  }
  return { pushed, failed, noSecret: false };
}

export async function syncMembers(sheetUrl: string) {
  const queuedNames = await pendingMemberNames();
  for (const [nick, name] of Object.entries(queuedNames)) {
    if (await updateMemberNameInSheet(nick, name) === "ok") {
      await clearQueuedMemberName(nick);
      delete queuedNames[nick];
    }
  }
  const rows = await fetchSheet(sheetUrl);
  const h = rows.findIndex((r) => r[0]?.trim() === "닉네임");
  const header = h >= 0 ? rows[h] : [];
  const roleCol = header.findIndex((c) => /역할|운영진/.test(c));
  const eventCol = header.findIndex((c) => /닉네임.*이벤트|이벤트.*닉네임/.test(c.trim()));
  const body = rows.slice(h + 1);
  const aliases = (await redis.hgetall<Record<string, string>>(K.nickAliases)) ?? {};
  const canonical = (nick: string) => aliases[nick] || nick;
  const sheet = new Map<string, { admin: boolean; name: string }>();
  for (const r of body) {
    const nick = r[0]?.trim();
    if (!nick || nick.length > 20) continue;
    const resolvedNick = canonical(nick);
    sheet.set(resolvedNick, { admin: roleCol >= 0 && /운영/.test(r[roleCol] ?? ""), name: resolvedNick in queuedNames ? queuedNames[resolvedNick] || "없음" : r[1]?.trim() || "없음" });
  }
  if (!sheet.size) throw new Error("시트 A열에서 닉네임을 찾지 못했어요.");
  if (eventCol < 0) throw new Error("시트에서 ‘닉네임(이벤트)’ 머리글을 찾지 못했어요.");
  // 이벤트 참가 닉네임 (머리글을 찾아 읽고 중복 제거)
  const eventNicks: string[] = [];
  for (const r of body) {
    const n = canonical(r[eventCol]?.trim() ?? "");
    if (n && n.length <= 20 && !/^닉네임/.test(n) && !eventNicks.includes(n)) eventNicks.push(n);
  }
  await redis.set(EVENT_NICKS_KEY, JSON.stringify(eventNicks));
  const bingo = eventNicks.length ? await pushToBingo(eventNicks) : null;
  const members = await getMembers();
  const byNick = new Map(members.map((m) => [m.nick, m]));
  const added: string[] = [], promoted: string[] = [], renamed: string[] = [];
  for (const [nick, { admin, name }] of sheet) {
    const m = byNick.get(nick);
    if (!m) { await saveMember({ nick, name, role: admin ? "admin" : "member", pw: null }); added.push(nick); }
    else if (m.name !== name || (admin && m.role !== "admin")) {
      await saveMember({ ...m, name, role: admin ? "admin" : m.role });
      if (m.name !== name) renamed.push(nick);
      if (admin && m.role !== "admin") promoted.push(nick);
    }
  }
  const missing = members.filter((m) => !sheet.has(m.nick) && !isStaffNick(m.nick)).map((m) => m.nick);
  return { total: sheet.size, added, promoted, renamed, missing, eventNicks, bingo };
}
