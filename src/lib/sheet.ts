import "server-only";
import { getMembers, saveMember } from "./hub";

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
   A열 = 닉네임. ‘닉네임’ 머리글이 있으면 그 아래부터 읽는다.
   ‘역할’ 또는 ‘운영진’ 머리글 열이 있으면, 그 칸에 ‘운영’이 들어간 사람을 운영진으로 지정한다. */
export async function syncMembers(sheetUrl: string) {
  const rows = await fetchSheet(sheetUrl);
  const h = rows.findIndex((r) => r[0]?.trim() === "닉네임");
  const header = h >= 0 ? rows[h] : [];
  const roleCol = header.findIndex((c) => /역할|운영진/.test(c));
  const body = rows.slice(h + 1);
  const sheet = new Map<string, boolean>();
  for (const r of body) {
    const nick = r[0]?.trim();
    if (!nick || nick.length > 20) continue;
    sheet.set(nick, roleCol >= 0 && /운영/.test(r[roleCol] ?? ""));
  }
  if (!sheet.size) throw new Error("시트 A열에서 닉네임을 찾지 못했어요.");
  const members = await getMembers();
  const byNick = new Map(members.map((m) => [m.nick, m]));
  const added: string[] = [], promoted: string[] = [];
  for (const [nick, admin] of sheet) {
    const m = byNick.get(nick);
    if (!m) { await saveMember({ nick, role: admin ? "admin" : "member", pw: null }); added.push(nick); }
    else if (admin && m.role !== "admin") { await saveMember({ ...m, role: "admin" }); promoted.push(nick); }
  }
  const missing = members.filter((m) => !sheet.has(m.nick) && m.nick !== "운영진").map((m) => m.nick);
  return { total: sheet.size, added, promoted, missing };
}
