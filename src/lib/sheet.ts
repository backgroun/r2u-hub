import "server-only";
import { K, getMembers, isStaffNick, saveMember, redis } from "./hub";
import type { MemberDiff } from "./member-sync-types";
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
   이벤트 참가자는 시트가 아니라 이벤트 페이지에서 크루원이 직접 신청한다. */
export const EVENT_NICKS_KEY = "r2u:eventNicks";

/** 시트와 현재 회원을 비교만 한다 (아무것도 바꾸지 않는다). apply 가 true 면 같은 내용을 실제로 저장한다. */
export async function syncMembers(sheetUrl: string, apply = true): Promise<MemberDiff> {
  const queuedNames = await pendingMemberNames();
  if (apply) {
    for (const [nick, name] of Object.entries(queuedNames)) {
      if (await updateMemberNameInSheet(nick, name) === "ok") {
        await clearQueuedMemberName(nick);
        delete queuedNames[nick];
      }
    }
  }
  const rows = await fetchSheet(sheetUrl);
  const h = rows.findIndex((r) => r[0]?.trim() === "닉네임");
  const header = h >= 0 ? rows[h] : [];
  const roleCol = header.findIndex((c) => /역할|운영진/.test(c));
  const body = rows.slice(h + 1);
  const aliases = (await redis.hgetall<Record<string, string>>(K.nickAliases)) ?? {};
  const canonical = (nick: string) => aliases[nick] || nick;
  const sheet = new Map<string, { admin: boolean; name: string; blank: boolean }>();
  for (const r of body) {
    const nick = r[0]?.trim();
    if (!nick || nick.length > 20) continue;
    const resolvedNick = canonical(nick);
    const raw = r[1]?.trim() || "";
    sheet.set(resolvedNick, { admin: roleCol >= 0 && /운영/.test(r[roleCol] ?? ""), name: resolvedNick in queuedNames ? queuedNames[resolvedNick] || "없음" : raw || "없음", blank: !raw && !(resolvedNick in queuedNames) });
  }
  if (!sheet.size) throw new Error("시트 A열에서 닉네임을 찾지 못했어요.");
  const members = await getMembers();
  const byNick = new Map(members.map((m) => [m.nick, m]));
  const diff: MemberDiff = { sheetTotal: sheet.size, currentTotal: members.filter((m) => !isStaffNick(m.nick)).length, unchanged: 0, added: [], renamed: [], promoted: [], missing: [] };
  for (const [nick, { admin, name, blank }] of sheet) {
    const m = byNick.get(nick);
    if (!m) { if (apply) await saveMember({ nick, name, role: admin ? "admin" : "member", pw: null }); diff.added.push({ nick, name, admin }); continue; }
    const nameChanged = (m.name?.trim() || "없음") !== name || (m.name !== name && !!m.name);
    const promote = admin && m.role !== "admin";
    if (!nameChanged && !promote) { diff.unchanged++; continue; }
    if (apply) await saveMember({ ...m, name, role: admin ? "admin" : m.role });
    if (nameChanged) diff.renamed.push({ nick, from: m.name?.trim() || "없음", to: name, blank });
    if (promote) diff.promoted.push(nick);
  }
  diff.missing = members.filter((m) => !sheet.has(m.nick) && !isStaffNick(m.nick)).map((m) => ({ nick: m.nick, name: m.name?.trim() || "없음" }));
  return diff;
}
