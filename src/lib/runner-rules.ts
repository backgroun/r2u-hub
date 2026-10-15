/* 스팟게임(깜짝 러닝 용품)의 규칙: 화면 동작·포인트 계산·운영자 안내가 모두 여기 값을 쓴다 */
export const RUNNER_RULES = {
  chance: 1, // 앱을 열 때 나올 확률 (1이면 매일 나온다. 단 계정당 하루 한 번)
  life: 5, // 나온 뒤 이 시간(초) 안에 못 잡으면 떨어져 사라진다
  need: 1, // 이만큼 눌러야 잡힌다
  missRate: 0.2, // 꽝(0P)이 나올 확률
  minP: 0.1, // 꽝이 아닐 때 받는 포인트(0.1 단위, 랜덤)
  maxP: 3,
  perWeek: 3, // 한 계정이 일주일(월~일)에 받을 수 있는 횟수 (하루 한 번)
  set: "v1", // 용품 세트 이름. 새 용품으로 교체할 때 바꾸면(v2…) 모두의 수집 기록이 새로 시작된다
  replaceRatio: 0.5, // 크루원 이 비율 이상이 모든 용품을 모으면 교체할 때
} as const;

/** 받을 포인트를 뽑는다: 꽝(0P)이 가끔 나오고, 아니면 0.1~3P를 0.1 단위로(작은 값이 더 자주, 큰 값은 드물게) */
export function rollPoints(): number {
  const { minP, maxP, missRate } = RUNNER_RULES;
  if (Math.random() < missRate) return 0;
  const v = minP + (maxP - minP) * Math.pow(Math.random(), 1.6);
  return Math.min(maxP, Math.max(minP, Math.round(v * 10) / 10));
}
