/** 분석 기간: 프리셋(전체·최근 N일·올해) 또는 직접 입력한 시작일~종료일. 주소 ?range= / ?from=&to= 에서 읽는다 */
export type RangeParams = { range?: string; from?: string; to?: string };
export type Range = { key: string; from: string | null; to: string | null; label: string };

export const PRESETS = [
  { key: "all", label: "전체" },
  { key: "30", label: "최근 30일" },
  { key: "90", label: "최근 90일" },
  { key: "year", label: "올해" },
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s?: string) => !!s && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

export function resolveRange(p: RangeParams, today: string): Range {
  if (validDate(p.from) || validDate(p.to)) {
    let from = validDate(p.from) ? p.from! : null, to = validDate(p.to) ? p.to! : null;
    if (from && to && from > to) [from, to] = [to, from];
    return { key: "custom", from, to, label: `${from ?? "처음"} ~ ${to ?? "오늘"}` };
  }
  if (p.range === "30" || p.range === "90") {
    const n = Number(p.range);
    return { key: p.range, from: addDays(today, -(n - 1)), to: today, label: `최근 ${n}일 (${md(addDays(today, -(n - 1)))} ~ ${md(today)})` };
  }
  if (p.range === "year") return { key: "year", from: `${today.slice(0, 4)}-01-01`, to: today, label: `${today.slice(0, 4)}년` };
  return { key: "all", from: null, to: null, label: "전체 기간" };
}

export const inRange = (date: string, r: Range) => (!r.from || date >= r.from) && (!r.to || date <= r.to);
