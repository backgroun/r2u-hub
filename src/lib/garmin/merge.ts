/** 월간 기록(MonthRec)과 가민 하루 합계 합치기. 같은 날 손으로 넣은 값과 가민 값을 이중으로 더하지 않는다 (명세 §6) */
export type MergeMode = "replace" | "separate";
export type GarminMonthRec = {
  goal: number;
  days: Record<string, number>;
  goalEdits?: number;
  /** 가민 합계가 들어간 날: replace(가민으로 대체) | separate(따로 뛴 기록 → 둘 다 합산) */
  garmin?: Record<string, MergeMode>;
  /** 가민이 들어오기 전 손으로 넣었던 값 (지우지 않고 보관) */
  manualKm?: Record<string, number>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const dayOf = (date: string) => String(Number(date.slice(8)));

/** 그날 월간 기록 다시 계산: 가민 합계 + (따로 뛴 기록이면 손으로 넣은 값) */
export function applyDay<T extends GarminMonthRec>(rec: T, date: string, garminKm: number, decision?: MergeMode): T {
  const d = dayOf(date);
  const days = { ...(rec.days ?? {}) };
  const garmin = { ...(rec.garmin ?? {}) };
  const manualKm = { ...(rec.manualKm ?? {}) };
  if (garminKm > 0) {
    if (!garmin[d]) {
      const manual = Number(days[d]) || 0;
      if (manual > 0) manualKm[d] = manual;
      garmin[d] = manual > 0 ? decision ?? "replace" : "replace";
    }
    days[d] = r2(garminKm + (garmin[d] === "separate" ? manualKm[d] ?? 0 : 0));
  } else if (garmin[d]) {
    // 가민 기록이 모두 지워지면 원래 손으로 넣은 값으로 되돌린다
    if (manualKm[d]) days[d] = manualKm[d]; else delete days[d];
    delete garmin[d]; delete manualKm[d];
  }
  return { ...rec, days, garmin, manualKm };
}
