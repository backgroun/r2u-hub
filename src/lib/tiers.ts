/* 컬러 등급 (나이키 런클럽처럼): 100P마다 한 단계, 색마다 3단계. 볼트는 끝없이 단계가 올라간다. */
export const TIERS = [
  { key: "yellow", name: "옐로", color: "#FFD60A" },
  { key: "orange", name: "오렌지", color: "#FF8A1F" },
  { key: "green", name: "그린", color: "#30D158" },
  { key: "blue", name: "블루", color: "#2F8BFF" },
  { key: "purple", name: "퍼플", color: "#B061F0" },
  { key: "black", name: "블랙", color: "#111111" },
  { key: "volt", name: "볼트", color: "#CEFF1A" },
] as const;
export const STEPS_PER_TIER = 3;

/** 전체 단계(1부터) → 색과 그 색 안의 단계 */
export function tierOf(step: number) {
  const s = Math.max(1, Math.floor(step));
  const i = Math.min(Math.floor((s - 1) / STEPS_PER_TIER), TIERS.length - 1);
  const sub = s - i * STEPS_PER_TIER;
  return { ...TIERS[i], index: i, sub, label: `${TIERS[i].name} ${sub}단계` };
}
