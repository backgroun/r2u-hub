import { blockedIds, buildCustomItems, CUSTOM_KINDS, hasNeedCycle, makeTitle, overCapIds, type CustomKind, type CustomSpec, type Item } from "./types";

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
  // 컬러 구매 조건 { 화이트: "블랙" }: 없는 컬러·자기 자신은 버린다
  const needs: Record<string, string[]> = {};
  if (c.needs && typeof c.needs === "object") for (const [k, v] of Object.entries(c.needs as Record<string, unknown>)) {
    const arr = [...new Set((Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string"))].filter((x) => x !== k && colors.includes(x));
    if (colors.includes(k) && arr.length) needs[k] = arr;
  }
  return { kind, name, price: Math.max(0, Math.floor(Number(c.price) || 0)), sizes, colors, url: safeUrl(str(c.url, 500)), note: str(c.note, 200) || undefined, ...(Object.keys(needs).length ? { needs, ...(c.needsMode === "cap" ? { needsMode: "cap" as const } : {}) } : {}) };
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
      needs: (Array.isArray(x?.needs) ? (x.needs as unknown[]) : []).filter((n): n is string => typeof n === "string").slice(0, 10),
      needsMode: x?.needsMode === "cap" ? ("cap" as const) : undefined,
    }))
    .filter((x) => x.name);

  if (!opener) throw new BadInput("공구 오픈자를 입력해 주세요.");
  if (!bank.bank || !bank.account || !bank.holder) throw new BadInput("공구 입금 계좌(은행, 계좌번호, 예금주)를 모두 입력해 주세요.");
  if (Number.isNaN(Date.parse(deadline))) throw new BadInput("마감 날짜와 시간을 정해 주세요.");
  if (!Number.isFinite(minQty) || minQty < 0 || minQty > 100000) throw new BadInput("최소 수량을 정하거나 ‘수량 무관’을 선택해 주세요.");
  if (!items.length) throw new BadInput("상품을 하나 이상 추가해 주세요.");
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) { items.forEach((it, i) => { it.id = `i${i}`; it.needs = []; }); ids.clear(); items.forEach((it) => ids.add(it.id)); }
  // 구매 조건은 실제 있는 다른 상품만 가리킨다
  for (const it of items) {
    const ok = (it.needs ?? []).filter((n) => n !== it.id && ids.has(n));
    if (ok.length) it.needs = ok; else { delete it.needs; delete it.needsMode; }
    if (!it.needsMode) delete it.needsMode;
  }
  if (hasNeedCycle(items)) throw new BadInput("구매 조건이 서로 물려 있어요. 서로를 먼저 사야 하는 상품이 없게 해 주세요.");

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
  if ([...blockedIds(items, lines)].some((id) => lines[id])) throw new BadInput("먼저 구매해야 하는 상품을 담지 않았어요. 구매 조건이 있는 상품을 확인해 주세요.");
  if (overCapIds(items, lines).length) throw new BadInput("조건 상품을 담은 수량보다 많이 담은 상품이 있어요. 구매 조건을 확인해 주세요.");
  return { name, depositor, memo, lines, password };
}
