/** note = 참고사항, url = 상품 페이지 */
export type Item = { id: string; name: string; price: number; url?: string; note?: string };

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
  const names = items.map((i) => i.name.trim()).filter(Boolean);
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
