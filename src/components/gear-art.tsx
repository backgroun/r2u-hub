import { LIST } from "@/components/gear-list";

/* 깜짝 러닝 용품 100종: 이름·설명(gear-list.ts), 아이콘 이미지(public/gear/g001~g100.webp, run_big.png에서 오려 줄인 것),
   튕기는 방식(move)과 소리(snd).
   튕기는 방식(move): g 중력 · e 바닥 반동 · minB 최소 튀는 속도 · vx 가로 속도 범위
     amp·period 속도가 느렸다 빨랐다(시간 배율의 진폭·주기초) · phase 시작 위치 · burst N초마다 갑자기 돌진
     flip N초마다 방향 뒤집기 · sway 좌우로 나풀나풀 */
export type Move = { g: number; e: number; minB: number; vx: [number, number]; amp?: number; period?: number; phase?: number; burst?: number; flip?: number; sway?: number };
/** 튕길 때 소리 종류와 높이: squeak 끽 · beep 삐빅 · boing 보잉 · bloop 퐁당 · swish 쉭 · poof 푸욱 · clink 챙 · squish 찌익 · wood 딱 · marimba 마림바 */
export type SndKind = "squeak" | "beep" | "boing" | "bloop" | "swish" | "poof" | "clink" | "squish" | "wood" | "marimba";
export type Snd = { k: SndKind; f: number; vol?: number };
export type Gear = { name: string; tip: string; pitch: string; shop?: false; move: Move; snd: Snd };

const PI = Math.PI;
/* 처음 10종은 직접 맞춰 둔 움직임·소리, 나머지는 16가지 움직임을 돌려가며 쓴다 */
const FIRST: { move: Move; snd: Snd }[] = [
  { move: { g: 1500, e: 0.82, minB: 560, vx: [150, 280] }, snd: { k: "squeak", f: 900 } },
  { move: { g: 750, e: 0.9, minB: 380, vx: [90, 170] }, snd: { k: "beep", f: 1700 } },
  { move: { g: 1200, e: 0.85, minB: 520, vx: [130, 240], amp: 0.7, period: 2.2 }, snd: { k: "boing", f: 260 } },
  { move: { g: 2300, e: 0.72, minB: 600, vx: [230, 380] }, snd: { k: "bloop", f: 420 } },
  { move: { g: 520, e: 0.92, minB: 260, vx: [70, 130], sway: 90 }, snd: { k: "swish", f: 1800, vol: 0.8 } },
  { move: { g: 1400, e: 0.84, minB: 540, vx: [140, 240], burst: 1.6 }, snd: { k: "poof", f: 110 } },
  { move: { g: 1000, e: 0.88, minB: 480, vx: [120, 210], amp: 0.85, period: 3 }, snd: { k: "clink", f: 1250 } },
  { move: { g: 2700, e: 0.86, minB: 800, vx: [330, 460] }, snd: { k: "squish", f: 330 } },
  { move: { g: 1300, e: 0.85, minB: 520, vx: [110, 200], amp: 0.9, period: 4.5, phase: -PI / 2 }, snd: { k: "wood", f: 520 } },
  { move: { g: 1450, e: 0.83, minB: 540, vx: [150, 260], flip: 1.3 }, snd: { k: "marimba", f: 520 } },
];
const PRESETS: Move[] = [
  { g: 1500, e: 0.82, minB: 560, vx: [150, 280] },
  { g: 750, e: 0.9, minB: 380, vx: [90, 170] },
  { g: 1200, e: 0.85, minB: 520, vx: [130, 240], amp: 0.7, period: 2.2 },
  { g: 2300, e: 0.72, minB: 600, vx: [230, 380] },
  { g: 520, e: 0.92, minB: 260, vx: [70, 130], sway: 90 },
  { g: 1400, e: 0.84, minB: 540, vx: [140, 240], burst: 1.6 },
  { g: 1000, e: 0.88, minB: 480, vx: [120, 210], amp: 0.85, period: 3 },
  { g: 2700, e: 0.86, minB: 800, vx: [330, 460] },
  { g: 1300, e: 0.85, minB: 520, vx: [110, 200], amp: 0.9, period: 4.5, phase: -PI / 2 },
  { g: 1450, e: 0.83, minB: 540, vx: [150, 260], flip: 1.3 },
  { g: 900, e: 0.9, minB: 420, vx: [100, 180], amp: 0.8, period: 1.6, flip: 2.2 },
  { g: 1800, e: 0.8, minB: 620, vx: [200, 320], burst: 1.2, flip: 2 },
  { g: 600, e: 0.93, minB: 300, vx: [90, 160], amp: 0.9, period: 2.6, sway: 70 },
  { g: 2000, e: 0.78, minB: 700, vx: [260, 400], amp: 0.6, period: 1.4 },
  { g: 1100, e: 0.87, minB: 500, vx: [140, 230], flip: 0.9 },
  { g: 1600, e: 0.8, minB: 600, vx: [180, 300], burst: 2.2, amp: 0.7, period: 3.4 },
];
/** 이름에 들어 있는 낱말로 소리를 고른다 (위에서부터 먼저 맞는 규칙) */
const SND_RULES: [RegExp, SndKind][] = [
  [/신발끈|신발 주머니/, "swish"],
  [/러닝화|스파이크|슬리퍼|깔창/, "squeak"],
  [/워치|폰|스톱워치|센서|랜턴|카메라|배터리|안전등|경광등|칩/, "beep"],
  [/메달|호루라기|멀티툴|트레킹 폴|아치|덤벨/, "clink"],
  [/젤|크림|바세린|영양제|비타민|에너지 바/, "squish"],
  [/물통|플라스크|음료|드링크|물컵|차단제|퇴치|선크림/, "bloop"],
  [/폼롤러|마사지|롤러|보드|매트|아이싱|밴드 반창고|테이프|패치|스트레칭 밴드/, "boing"],
  [/번호표|넘버|일기장/, "wood"],
  [/양말|장갑|비니|토시|판초|우산|타월|파우치/, "poof"],
  [/싱글렛|티셔츠|반바지|타이츠|조끼|재킷|우비|후디|베스트|내의|스카프|버프|밴드|벨트|슬리브|세탁망|가방|백팩|팩|캡|모자|바이저|넥쿨러|바지/, "swish"],
];
const BASE_F: Record<SndKind, number> = { squeak: 900, beep: 1500, boing: 280, bloop: 430, swish: 1800, poof: 110, clink: 1250, squish: 330, wood: 560, marimba: 520 };

/** 깜짝 러닝 용품 전체 100종 (순서 = 아이콘 이미지 번호) */
export const GEARS: Gear[] = LIST.map((it, i) => {
  if (i < FIRST.length) return { ...it, ...FIRST[i] };
  const k = SND_RULES.find(([re]) => re.test(it.name))?.[1] ?? "wood";
  const f = Math.round(BASE_F[k] * (0.88 + ((i * 7) % 6) * 0.05));
  return { ...it, move: PRESETS[(i * 5 + 3) % PRESETS.length], snd: { k, f, vol: k === "swish" || k === "poof" ? 0.8 : 1 } };
});

/** 용품 아이콘. i: 0~99 (GEARS 순서). 이미지는 투명 배경이라 어떤 바탕에서도 그대로 보인다. */
export function GearArt({ i, size = 64 }: { i: number; size?: number }) {
  const n = ((i % GEARS.length) + GEARS.length) % GEARS.length;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/gear/g${String(n + 1).padStart(3, "0")}.webp`} alt="" width={size} height={size} draggable={false} style={{ display: "block", width: size, height: size, objectFit: "contain", pointerEvents: "none", userSelect: "none" }} />;
}
