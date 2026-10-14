import type { RunLike } from "./analysis";

/**
 * 내 운동 패턴에 따른 가이드 (규칙 기반, AI 아님).
 * CSV에 있는 값(거리·시간·심박·케이던스·훈련효과·날짜)만 쓰는 일반적인 훈련 원칙이라 참고용이다.
 * 기준 숫자는 아래 상수에서 한 번에 고친다.
 */
export const GUIDE = {
  windowDays: 28, // 최근 4주
  weeklyGrowth: 0.1, // 주간 거리는 평균의 ±10% 안에서 조절
  jumpWarn: 0.3, // 지난주가 그 앞 3주 평균보다 30% 넘게 늘면 경고
  hardTE: 4, // 이 점수 이상이면 ‘힘든 러닝’
  hardShareWarn: 0.5, // 힘든 러닝이 절반 이상이면 경고
  hardShareLow: 0.1, // 10% 이하면 강도를 올려 볼 만함
  longMax: 0.5, // 가장 긴 러닝이 주간 평균의 50% 넘으면 경고
  longMin: 0.25, // 25% 미만이면 롱런 권유
  longMinWeekKm: 15, // 롱런 판단은 주간 평균이 이 이상일 때만
  perWeekLow: 2, // 주 평균 횟수가 이보다 적으면 횟수부터 늘리기
  perWeekHigh: 5.5, // 이 이상이면 휴식일 확보
  effChange: 0.03, // 유산소 효율이 3% 이상 변하면 코멘트
  cadenceLow: 165,
  breakDays: 14, // 이만큼 쉬면 복귀 가이드
  minRuns: 3, // 최근 4주 러닝이 이보다 적으면 일반 가이드만
};

export type GuideTone = "warn" | "info" | "good";
export type GuideItem = { tone: GuideTone; title: string; body: string };
export type Guide = { basis: string; items: GuideItem[] };

/** 월요일 시작 주의 첫날 (analysis.ts 의 weekStart 와 같다. 테스트에서 값 import 가 안 돼서 따로 둔다) */
const weekStart = (date: string) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const r1 = (n: number) => Math.round(n * 10) / 10;
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const sum = (list: RunLike[]) => list.reduce((a, r) => a + r.distanceKm, 0);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const eff = (r: RunLike) => (r.avgHr ? (r.distanceKm * 1000) / (r.durationSec / 60) / r.avgHr : null);

const ORDER: Record<GuideTone, number> = { warn: 0, info: 1, good: 2 };

/** today: 한국 날짜 YYYY-MM-DD. runs: 의심 기록을 뺀 러닝 전체(기간 필터 없이) */
export function buildGuide(input: RunLike[], today: string): Guide | null {
  const runs = input.filter((r) => r.date <= today).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!runs.length) return null;
  const last = runs[runs.length - 1];
  const since = diffDays(today, last.date);
  const items: GuideItem[] = [];

  // 오래 쉬었을 때: 쉬기 전 4주를 기준으로 복귀 계획만 알려 준다
  if (since >= GUIDE.breakDays) {
    const lastWeek = weekStart(last.date);
    const wk = [0, 1, 2, 3].map((i) => sum(runs.filter((r) => r.date >= addDays(lastWeek, -7 * i) && r.date <= addDays(lastWeek, -7 * i + 6))));
    const base = r1(mean(wk));
    items.push({ tone: "info", title: `${since}일째 쉬고 있어요`, body: base > 0
      ? `쉬기 전 4주 평균은 주 ${base}km였어요. 복귀 첫 주는 그 70%인 약 ${r1(base * 0.7)}km 안에서 시작하세요.`
      : "다시 시작할 때는 짧은 거리부터 천천히 늘려 보세요." });
    items.push({ tone: "info", title: "처음 2주는 편한 속도로", body: "대화가 가능한 속도로 주 2~3회만 달리고, 2주 동안은 거리를 늘리지 마세요. 몸이 적응한 뒤에 주간 거리를 10%씩 늘려 가면 돼요." });
    return { basis: `마지막 러닝 ${md(last.date)} 기준`, items };
  }

  const from = addDays(today, -(GUIDE.windowDays - 1));
  const recent = runs.filter((r) => r.date >= from);
  const basis = `최근 4주(${md(from)}~${md(today)}) 러닝 ${recent.length}회 기준`;
  if (recent.length < GUIDE.minRuns) {
    return { basis, items: [{ tone: "info", title: "기록이 아직 적어요", body: `최근 4주 러닝이 ${recent.length}번이에요. 맞춤 가이드를 드리려면 기록이 조금 더 필요해요. 우선 주 2~3회, 편한 속도로 리듬부터 만들어 보세요.` }] };
  }

  // 주간 거리: 지난 4주 평균 대비
  const thisWeek = weekStart(today);
  const wkKm = (i: number) => sum(runs.filter((r) => r.date >= addDays(thisWeek, 7 * i) && r.date <= addDays(thisWeek, 7 * i + 6)));
  const prev4 = [-4, -3, -2, -1].map(wkKm);
  const base = mean(prev4), cur = wkKm(0);
  const prior3 = mean(prev4.slice(0, 3));
  if (prior3 > 0 && prev4[3] > prior3 * (1 + GUIDE.jumpWarn)) {
    items.push({ tone: "warn", title: "지난주 거리가 급하게 늘었어요", body: `지난주 ${r1(prev4[3])}km는 그 앞 3주 평균(${r1(prior3)}km)보다 ${prev4[3] / prior3 >= 2 ? `약 ${Math.round(prev4[3] / prior3)}배` : `${Math.round((prev4[3] / prior3 - 1) * 100)}%`} 많아요. 이번 주는 더 늘리지 말고 지난주 이하로 유지하세요.` });
  } else if (base > 0) {
    items.push({ tone: "info", title: `이번 주 권장 ${r1(base * (1 - GUIDE.weeklyGrowth))}~${r1(base * (1 + GUIDE.weeklyGrowth))}km`, body: `이전 4주 평균이 주 ${r1(base)}km예요. 평균의 ±10% 안에서 조절하면 무리 없이 이어 갈 수 있어요. 이번 주는 지금까지 ${r1(cur)}km 달렸어요.` });
  }

  // 강도 균형: 훈련효과
  const tes = recent.filter((r) => r.aerobicTE != null);
  if (tes.length >= 3) {
    const hard = tes.filter((r) => r.aerobicTE! >= GUIDE.hardTE);
    const share = hard.length / tes.length;
    if (share >= GUIDE.hardShareWarn) items.push({ tone: "warn", title: "힘든 러닝 비중이 높아요", body: `최근 4주 ${tes.length}번 중 ${hard.length}번이 훈련효과 ${GUIDE.hardTE}점 이상이에요. 힘든 러닝은 주 1~2회로 줄이고, 나머지는 대화할 수 있는 편한 속도로 달려 보세요.` });
    else if (share <= GUIDE.hardShareLow && tes.length >= 4) items.push({ tone: "info", title: "강도를 조금 올려 볼 수 있어요", body: "최근 4주 러닝이 모두 가벼운 강도였어요. 컨디션이 좋다면 주 1회 템포런이나 인터벌을 더해 보세요." });
    else items.push({ tone: "good", title: "강도 균형이 좋아요", body: `힘든 러닝 ${hard.length}번, 편한 러닝 ${tes.length - hard.length}번이에요. 지금 비율을 유지하세요.` });
    const over = runs.filter((r) => r.date >= addDays(today, -13) && (r.aerobicTE ?? 0) >= 5).length;
    if (over >= 2) items.push({ tone: "warn", title: "훈련효과 5점이 이어졌어요", body: `최근 2주에 5점(과부하) 러닝이 ${over}번이에요. 다음 러닝은 쉬거나 아주 편하게 하세요.` });
    // 회복 간격: 힘든 러닝이 하루 이내 간격으로 연달아
    const hardDates = hard.map((r) => r.date).sort();
    const tight = hardDates.slice(1).filter((d, i) => diffDays(d, hardDates[i]) <= 1).length;
    if (tight > 0) items.push({ tone: "warn", title: "힘든 러닝이 연달아 있었어요", body: `힘든 러닝 사이를 하루 이내로 달린 경우가 ${tight}번 있어요. 힘든 러닝 다음 날은 쉬거나 편한 러닝으로 회복하세요.` });
  }

  // 롱런 비중
  const weekAvg = sum(recent) / 4;
  const longest = Math.max(...recent.map((r) => r.distanceKm));
  if (weekAvg >= GUIDE.longMinWeekKm) {
    const share = longest / weekAvg;
    if (share > GUIDE.longMax) items.push({ tone: "warn", title: "한 번에 너무 몰아 달렸어요", body: `가장 긴 러닝 ${r1(longest)}km가 주간 평균(${r1(weekAvg)}km)의 ${Math.round(share * 100)}%예요. 나눠서 달리면 부상 위험을 줄일 수 있어요.` });
    else if (share < GUIDE.longMin) items.push({ tone: "info", title: "주 1회 롱런을 넣어 보세요", body: `주간 거리의 25~35%(약 ${r1(weekAvg * 0.25)}~${r1(weekAvg * 0.35)}km)를 한 번에 길게 달리면 지구력에 도움이 돼요.` });
    else items.push({ tone: "good", title: "롱런 비중이 적당해요", body: `가장 긴 러닝 ${r1(longest)}km가 주간 평균의 ${Math.round(share * 100)}%예요.` });
  }

  // 러닝 빈도
  const perWeek = new Set(recent.map((r) => r.date)).size / 4;
  if (perWeek < GUIDE.perWeekLow) items.push({ tone: "info", title: "러닝 횟수를 먼저 늘려 보세요", body: `최근 4주 주 평균 ${r1(perWeek)}일 달렸어요. 거리를 늘리기보다 주 3회로 횟수를 먼저 늘리면 부담이 적어요.` });
  else if (perWeek >= GUIDE.perWeekHigh) items.push({ tone: "warn", title: "쉬는 날을 챙기세요", body: `주 평균 ${r1(perWeek)}일 달렸어요. 주 1~2일은 완전히 쉬는 날로 두세요.` });

  // 유산소 효율: 최근 4주 vs 그 앞 4주
  const e1 = recent.map(eff).filter((v): v is number => v != null);
  const e0 = runs.filter((r) => r.date < from && r.date >= addDays(from, -GUIDE.windowDays)).map(eff).filter((v): v is number => v != null);
  if (e1.length >= 2 && e0.length >= 2) {
    const ch = mean(e1) / mean(e0) - 1;
    if (ch >= GUIDE.effChange) items.push({ tone: "good", title: "유산소 효율이 좋아졌어요", body: `같은 심박으로 이전 4주보다 ${Math.round(ch * 100)}% 더 빨리 달리고 있어요. 지금 훈련이 잘 맞고 있어요.` });
    else if (ch <= -GUIDE.effChange) items.push({ tone: "info", title: "유산소 효율이 조금 떨어졌어요", body: `이전 4주보다 ${Math.round(-ch * 100)}% 낮아요. 피로, 더위, 수면 부족일 수 있어요. 편한 러닝 위주로 회복해 보세요.` });
  }

  // 케이던스
  const cad = recent.filter((r) => r.avgCadence != null);
  if (cad.length >= 3) {
    const w = cad.reduce((a, r) => a + r.durationSec, 0);
    const c = Math.round(cad.reduce((a, r) => a + r.avgCadence! * r.durationSec, 0) / w);
    if (c < GUIDE.cadenceLow) items.push({ tone: "info", title: "케이던스를 조금 올려 보세요", body: `평균 ${c}spm이에요. 보폭을 살짝 줄이고 걸음 수를 5%쯤 늘려 보면 무릎 부담이 줄 수 있어요.` });
  }

  // 며칠 쉬었을 때
  if (since >= 7) items.unshift({ tone: "info", title: `${since}일 쉬었어요`, body: "다음 러닝은 편한 속도로 평소보다 짧게 시작하세요." });

  items.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  return { basis, items: items.slice(0, 7) };
}
