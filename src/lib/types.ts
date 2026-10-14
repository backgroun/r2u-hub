/** note = 참고사항, url = 상품 페이지 */
export type Item = { id: string; name: string; price: number; url?: string; note?: string; size?: string; color?: string };

/** R2U 단체 제작: 어떤 물건을 만들지, 그리고 주문받을 사이즈·컬러 */
export const CUSTOM_KINDS = ["의류", "모자", "양말", "기타"] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
export type CustomSpec = { kind: CustomKind; name: string; price: number; sizes: string[]; colors: string[]; url?: string; note?: string };
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
    items.push({ id: `c|${color}|${size}`, name: c.name, price: c.price, url: c.url, note: c.note, size: size || undefined, color: color || undefined });
  }
  return items;
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
