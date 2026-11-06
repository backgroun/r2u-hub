/** note = 참고사항, url = 상품 페이지 */
/** any = 조건 상품을 1개 이상 담으면 주문 가능 · cap = 조건 상품을 담은 수량까지만 주문 가능 */
export type NeedsMode = "any" | "cap";
/** needs: 이 항목을 주문하려면 주문에 함께 담겨 있어야 하는 항목 id (이 중 하나라도 1개 이상이면 통과) */
export type Item = { id: string; name: string; price: number; url?: string; note?: string; size?: string; color?: string; needs?: string[]; needsMode?: NeedsMode };

/** R2U 단체 제작: 어떤 물건을 만들지, 그리고 주문받을 사이즈·컬러 */
export const CUSTOM_KINDS = ["의류", "모자", "양말", "기타"] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
/** image: 시안 이미지를 올려 둔 공구인가 (파일은 서버가 따로 보관하고, 이 값은 이미지 올리기·지우기 API 만 바꾼다) */
export type CustomSpec = { kind: CustomKind; name: string; price: number; sizes: string[]; colors: string[]; url?: string; note?: string; image?: boolean; sizeImage?: boolean; needs?: Record<string, string[]>; needsMode?: NeedsMode };
/** 종류별로 처음 채워 주는 사이즈·컬러 (운영진이 자유롭게 바꾼다) */
export const CUSTOM_PRESETS: Record<CustomKind, { sizes: string[]; colors: string[] }> = {
  의류: { sizes: ["S", "M", "L", "XL"], colors: ["블랙", "화이트"] },
  모자: { sizes: ["FREE"], colors: ["블랙", "화이트"] },
  양말: { sizes: ["M", "L"], colors: ["블랙", "화이트"] },
  기타: { sizes: [], colors: [] },
};
/** 사이즈 × 컬러 조합마다 주문 항목 하나. id 가 조합으로 정해져서 수정해도 기존 주문이 유지된다 */
export function buildCustomItems(c: CustomSpec): Item[] {
  const sizes = c.sizes.length ? c.sizes : [""];
  const colors = c.colors.length ? c.colors : [""];
  const items: Item[] = [];
  for (const color of colors) for (const size of sizes) {
    // 컬러 구매 조건: ‘화이트는 블랙을 산 사람만’ → 블랙의 어느 사이즈든 1개 이상 담으면 통과
    const reqs = color ? colorNeeds(c, color).filter((r) => r !== color && colors.includes(r)) : [];
    const needs = reqs.length ? reqs.flatMap((r) => sizes.map((sz) => `c|${r}|${sz}`)) : undefined;
    items.push({ id: `c|${color}|${size}`, name: c.name, price: c.price, url: c.url, note: c.note, size: size || undefined, color: color || undefined, ...(needs ? { needs, ...(c.needsMode === "cap" ? { needsMode: "cap" as const } : {}) } : {}) });
  }
  return items;
}

/** 컬러 조건 { 화이트: ["블랙"] } (예전 형식 { 화이트: "블랙" } 도 읽는다) */
export function colorNeeds(c: Pick<CustomSpec, "needs">, color: string): string[] {
  const v = (c.needs as Record<string, string | string[]> | undefined)?.[color];
  return typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
}

/** 구매 조건을 아직 못 채운 항목 id (조건 항목이 주문에 없다) */
export function blockedIds(items: Item[], lines: Record<string, number>) {
  const out = new Set<string>();
  for (const it of items) if (it.needs?.length && !it.needs.some((id) => (lines[id] ?? 0) > 0)) out.add(it.id);
  return out;
}
/** 이 항목을 최대 몇 개까지 담을 수 있나 (cap 조건: 조건 상품을 담은 수량까지). 제한이 없으면 Infinity */
export function capOf(items: Item[], lines: Record<string, number>, id: string) {
  const it = items.find((x) => x.id === id);
  if (!it || it.needsMode !== "cap" || !it.needs?.length) return Infinity;
  return it.needs.reduce((s, n) => s + (lines[n] ?? 0), 0);
}
/** 조건을 못 채운 항목의 수량을 0으로, 한도(cap)를 넘은 수량은 한도로 맞춘다 (연쇄 조건도 끝까지) */
export function pruneBlocked(items: Item[], lines: Record<string, number>) {
  let cur = lines;
  for (let guard = 0; guard < 50; guard++) {
    const next = { ...cur };
    for (const id of blockedIds(items, next)) delete next[id];
    for (const it of items) {
      const have = next[it.id] ?? 0;
      if (have <= 0) continue;
      const cap = capOf(items, next, it.id);
      if (have > cap) { if (cap > 0) next[it.id] = cap; else delete next[it.id]; }
    }
    if (JSON.stringify(next) === JSON.stringify(cur)) return cur;
    cur = next;
  }
  return cur;
}
/** 한도(cap)를 넘겨 담은 항목 id */
export function overCapIds(items: Item[], lines: Record<string, number>) {
  return items.filter((it) => (lines[it.id] ?? 0) > capOf(items, lines, it.id)).map((it) => it.id);
}
/** 🔒 안내 문구: ‘블랙 구매 시에만 주문 가능’ / ‘블랙 구매 수량 이내로만 주문 가능’ */
export function needText(items: Item[], it: Item) {
  return `${needLabel(items, it)} ${it.needsMode === "cap" ? "구매 수량 이내로만" : "구매 시에만"} 주문 가능`;
}
/** ‘블랙을 구매해야 해요’ 같은 안내용 이름 */
export function needLabel(items: Item[], it: Item) {
  const need = items.filter((x) => it.needs?.includes(x.id));
  const names = [...new Set(need.map((x) => (it.color ? x.color : x.name)).filter(Boolean))];
  return names.join(" · ");
}
/** 항목끼리 서로 먼저 사라고 물려 있어 아무도 못 사게 되는가 */
export function hasNeedCycle(items: Item[]) {
  const by = new Map(items.map((i) => [i.id, i]));
  for (const it of items) {
    const seen = new Set<string>();
    const stack = [...(it.needs ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === it.id) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(by.get(id)?.needs ?? []));
    }
  }
  return false;
}
/** 주문서·집계에 쓰는 이름: 단체 제작은 ‘상품명 (컬러/사이즈)’ */
export const itemLabel = (it: Pick<Item, "name" | "size" | "color">) => {
  const opt = [it.color, it.size].filter(Boolean).join("/");
  return opt ? `${it.name} (${opt})` : it.name;
};

/** 배포 장소 */
export type Pickup = { place: string };

export type Bank = { bank: string; account: string; holder: string };

export type Round = {
  id: string;
  title: string;
  opener: string;
  bank: Bank;
  pickup: Pickup;
  deadline: string; // ISO
  minQty: number; // 최소 주문 개수, 0 = 수량 무관
  items: Item[];
  custom?: CustomSpec; // 있으면 R2U 단체 제작 공구 (items 는 여기서 만들어진다)
  createdAt: number;
  closed: boolean;
  archived?: boolean; // 끝난 공구를 보관함으로 옮겼는가 (공구 오픈자가 정한다)
};

export type StoredRound = Round & { adminKey: string; pwHash: string; openerNick?: string }; // openerNick: 공구를 연 허브 닉네임

export type Order = {
  id: string;
  bib: number;
  name: string; // 닉네임
  depositor: string; // 입금자명
  lines: Record<string, number>;
  memo: string;
  createdAt: number;
  updatedAt: number;
  paid: boolean; // 신청자가 직접 입금완료 표시
  paidAt?: number; // 입금완료로 표시한 시각
  delivered: boolean; // 신청자가 직접 수령완료 표시
};

export type StoredOrder = Order & { pwHash?: string; owner?: string }; // owner: 주문한 허브 닉네임 (로그인으로 본인 확인)

/** 주문 현황 (모두에게 공개) */
export type PublicOrder = Pick<Order, "id" | "bib" | "name" | "lines" | "paid" | "delivered">;

export type RoundStatus = "open" | "confirmed" | "failed";

export type PublicSummary = {
  participants: number;
  totalQty: number;
  paidCount: number;
  deliveredCount: number;
  itemTotals: Record<string, number>;
};

/** qty = 지금까지 주문된 총 개수 */
export function roundStatus(r: Pick<Round, "deadline" | "closed" | "minQty">, qty: number): RoundStatus {
  const ended = r.closed || Date.now() >= new Date(r.deadline).getTime();
  if (!ended) return "open";
  return qty >= r.minQty ? "confirmed" : "failed";
}

export function orderTotal(items: Item[], lines: Record<string, number>) {
  return items.reduce((sum, it) => sum + it.price * (lines[it.id] ?? 0), 0);
}

export const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const fmtPickup = (p?: Pickup) => p?.place ?? "";

export const minLabel = (min: number) => (min > 0 ? `${min}개 이상 모이면 진행` : "수량 무관 진행");

export const qtyOf = (lines: Record<string, number>) => Object.values(lines).reduce((a, b) => a + b, 0);

/** 공구 이름: [공구 오픈자] 제품명 (외 N개) */
export function makeTitle(opener: string, items: Pick<Item, "name">[]) {
  const names = [...new Set(items.map((i) => i.name.trim()).filter(Boolean))];
  const product = names.length === 0 ? "공구" : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}개`;
  return `[${opener.trim() || "공구 오픈자"}] ${product}`;
}

/** 닉네임 중복 비교용 (공백·대소문자 무시) */
export const nickKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 마감 7일이 지났거나 지난달 이전에 마감된 공구 = 지난 공구 */
export function isPastRound(deadline: string, now = Date.now()) {
  const t = new Date(deadline).getTime();
  if (t > now) return false;
  const kst = new Date(now + 9 * 3600e3);
  const monthStart = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600e3;
  return t < monthStart || now - t > 7 * 864e5;
}

export const bibLabel = (n: number) => String(n).padStart(3, "0");
