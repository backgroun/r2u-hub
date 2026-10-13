import type { MonthRec } from "./hub";

export type RankRow = { nick: string; goal: number; km: number; rate: number | null; kmRank: number | null; rateRank: number | null; days: Record<string, number> };

const sum = (d: Record<string, number>) => Math.round(Object.values(d).reduce((a, b) => a + Number(b || 0), 0) * 100) / 100;

/** 동점은 같은 순위(1,1,3…). 값이 0이거나 없으면 순위 없음. */
function ranks(rows: RankRow[], val: (r: RankRow) => number | null, set: (r: RankRow, n: number) => void) {
  const scored = rows.filter((r) => (val(r) ?? 0) > 0).sort((a, b) => val(b)! - val(a)!);
  let prev: number | null = null, rank = 0;
  scored.forEach((r, i) => { if (val(r) !== prev) rank = i + 1; prev = val(r); set(r, rank); });
}

export function rankMonth(month: Record<string, MonthRec>): RankRow[] {
  const rows: RankRow[] = Object.entries(month).map(([nick, r]) => {
    const km = sum(r.days ?? {});
    const goal = Number(r.goal) || 0;
    return { nick, goal, km, rate: goal > 0 ? Math.round((km / goal) * 1000) / 10 : null, kmRank: null, rateRank: null, days: r.days ?? {} };
  });
  ranks(rows, (r) => r.km, (r, n) => (r.kmRank = n));
  ranks(rows, (r) => r.rate, (r, n) => (r.rateRank = n));
  return rows;
}

export const ymOf = (iso: string) => iso.slice(0, 7);
export function shiftYm(ym: string, d: number) {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return t.toISOString().slice(0, 7);
}
