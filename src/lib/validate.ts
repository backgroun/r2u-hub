import { buildCustomItems, CUSTOM_KINDS, makeTitle, type CustomKind, type CustomSpec, type Item } from "./types";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export class BadInput extends Error {}

function safeUrl(v: string) {
  if (!v) return undefined;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** 쉼표·줄바꿈으로 적은 사이즈/컬러 목록 → 중복 없는 짧은 목록 */
const list = (v: unknown, max: number) => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  return [...new Set(arr.map((x) => str(x, 20)).filter(Boolean))].slice(0, max);
};
function parseCustom(v: unknown): CustomSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Record<string, unknown>;
  const kind = CUSTOM_KINDS.includes(c.kind as CustomKind) ? (c.kind as CustomKind) : "기타";
  const name = str(c.name, 50);
  if (!name) throw new BadInput("제작할 상품 이름을 입력해 주세요.");
  const sizes = list(c.sizes, 12), colors = list(c.colors, 12);
  if (sizes.length * Math.max(1, colors.length) > 60) throw new BadInput("사이즈와 컬러 조합이 너무 많아요. (최대 60가지)");
  return { kind, name, price: Math.max(0, Math.floor(Number(c.price) || 0)), sizes, colors, url: safeUrl(str(c.url, 500)), note: str(c.note, 200) || undefined };
}

export function parseRoundInput(body: Record<string, unknown>) {
  const opener = str(body.opener, 30);
  const b = (body.bank ?? {}) as Record<string, unknown>;
  const bank = { bank: str(b.bank, 20), account: str(b.account, 40), holder: str(b.holder, 20) };
  const pk = (body.pickup ?? {}) as Record<string, unknown>;
  const pickup = { place: str(pk.place, 60) };
  const deadline = str(body.deadline, 40);
  const minQty = Math.floor(Number(body.minQty));
  const custom = parseCustom(body.custom);
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const items: Item[] = custom ? buildCustomItems(custom) : rawItems
    .map((x: Record<string, unknown>, i: number) => ({
      id: str(x?.id, 20) || `i${i}`,
      name: str(x?.name, 50),
      price: Math.max(0, Math.floor(Number(x?.price) || 0)),
      url: safeUrl(str(x?.url, 500)),
      note: str(x?.note, 200) || undefined,
    }))
    .filter((x) => x.name);

  if (!opener) throw new BadInput("공구 오픈자를 입력해 주세요.");
  if (!bank.bank || !bank.account || !bank.holder) throw new BadInput("공구 입금 계좌(은행, 계좌번호, 예금주)를 모두 입력해 주세요.");
  if (Number.isNaN(Date.parse(deadline))) throw new BadInput("마감 날짜와 시간을 정해 주세요.");
  if (!Number.isFinite(minQty) || minQty < 0 || minQty > 100000) throw new BadInput("최소 수량을 정하거나 ‘수량 무관’을 선택해 주세요.");
  if (!items.length) throw new BadInput("상품을 하나 이상 추가해 주세요.");
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) items.forEach((it, i) => (it.id = `i${i}`));

  return { title: makeTitle(opener, items), opener, bank, pickup, deadline: new Date(deadline).toISOString(), minQty, items, custom };
}

export function parseOrderInput(body: Record<string, unknown>, items: Item[], needPassword = true) {
  const name = str(body.name, 30);
  const depositor = str(body.depositor, 30);
  const memo = str(body.memo, 200);
  const raw = (body.lines ?? {}) as Record<string, unknown>;
  const lines: Record<string, number> = {};
  for (const it of items) {
    const q = Math.floor(Number(raw[it.id]) || 0);
    if (q > 0) lines[it.id] = Math.min(q, 999);
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!name) throw new BadInput("닉네임을 입력해 주세요.");
  if (!depositor) throw new BadInput("입금자명을 입력해 주세요.");
  if (needPassword && (password.length < 4 || password.length > 30)) throw new BadInput("비밀번호는 4자 이상으로 정해 주세요.");
  if (!Object.keys(lines).length) throw new BadInput("수량을 1개 이상 골라 주세요.");
  return { name, depositor, memo, lines, password };
}
