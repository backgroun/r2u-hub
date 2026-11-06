// 공구 관리 화면용: 발주서·주문자 명단 내보내기, 입금 독촉 문구 (브라우저에서만 쓴다)
import { bibLabel, itemLabel, orderTotal, won, type Order, type Round } from "./types";

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** 엑셀에서 한글이 깨지지 않게 BOM 을 붙인 CSV */
export const toCsv = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 파일 이름에 못 쓰는 글자를 뺀다 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "공구";

const fmtTime = (t?: number) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

/** 상품별 수량 합계 */
function totalsOf(orders: Order[]) {
  const per: Record<string, number> = {};
  for (const o of orders) for (const [k, q] of Object.entries(o.lines)) per[k] = (per[k] ?? 0) + q;
  return per;
}

/** 발주서: 일반 공구는 상품·단가·수량·금액, 단체 제작은 컬러 × 사이즈 표 */
export function orderSheetRows(round: Round, orders: Order[]): (string | number)[][] {
  const per = totalsOf(orders);
  const qty = (id: string) => per[id] ?? 0;
  const grand = round.items.reduce((s, it) => s + it.price * qty(it.id), 0);
  const all = round.items.reduce((s, it) => s + qty(it.id), 0);
  const c = round.custom;
  const rows: (string | number)[][] = [[`[${round.title}] 발주서`], [`주문 ${orders.length}명`, `총 ${all}개`, `총액 ${grand}원`], []];
  if (c && (c.sizes.length || c.colors.length)) {
    const sizes = c.sizes.length ? c.sizes : [""];
    const colors = c.colors.length ? c.colors : [""];
    const cell = (color: string, size: string) => {
      const it = round.items.find((x) => (x.color ?? "") === color && (x.size ?? "") === size);
      return it ? qty(it.id) : 0;
    };
    rows.push([`${c.name} (${c.price}원)`, ...sizes.map((s) => s || "-"), "합계"]);
    for (const color of colors) {
      const cells = sizes.map((s) => cell(color, s));
      rows.push([color || "-", ...cells, cells.reduce((a, b) => a + b, 0)]);
    }
    rows.push(["합계", ...sizes.map((s) => colors.reduce((a, col) => a + cell(col, s), 0)), all]);
  } else {
    rows.push(["상품", "단가", "수량", "금액"]);
    for (const it of round.items) rows.push([itemLabel(it), it.price, qty(it.id), it.price * qty(it.id)]);
    rows.push(["합계", "", all, grand]);
  }
  return rows;
}

/** 주문자별 명단 (입금·수령 현황 포함) */
export function ordererRows(round: Round, orders: Order[]): (string | number)[][] {
  const rows: (string | number)[][] = [["번호", "닉네임", "입금자명", "주문 내역", "수량", "금액", "입금", "입금 표시 시각", "수령", "메모"]];
  for (const o of orders) {
    const lines = round.items.filter((it) => o.lines[it.id]).map((it) => `${itemLabel(it)} ${o.lines[it.id]}`).join(" / ");
    rows.push([bibLabel(o.bib), o.name, o.depositor, lines, Object.values(o.lines).reduce((a, b) => a + b, 0), orderTotal(round.items, o.lines), o.paid ? "입금완료" : "입금 전", fmtTime(o.paidAt), o.delivered ? "수령완료" : "수령 전", o.memo]);
  }
  return rows;
}

/** 업체에 보낼 발주 문구 (카톡용 텍스트) */
export function orderSheetText(round: Round, orders: Order[]) {
  const per = totalsOf(orders);
  const all = round.items.reduce((s, it) => s + (per[it.id] ?? 0), 0);
  const grand = round.items.reduce((s, it) => s + it.price * (per[it.id] ?? 0), 0);
  return [
    `📦 [${round.title}] 발주 수량 (총 ${all}개 · ${won(grand)})`,
    ...round.items.filter((it) => per[it.id]).map((it) => `· ${itemLabel(it)} ${per[it.id]}개`),
  ].join("\n");
}

/** 최종 확인용: 누가 무엇을 몇 개 주문했는지 (업체 발주서와는 별개로, 주문한 사람들이 내용을 확인하라고 공지한다). 입금자명은 넣지 않는다. */
export function finalCheckText(round: Round, orders: Order[], orderUrl?: string) {
  const all = orders.reduce((s, o) => s + Object.values(o.lines).reduce((a, b) => a + b, 0), 0);
  const label = (it: Round["items"][number]) => (round.custom ? [it.color, it.size].filter(Boolean).join("/") || it.name : it.name);
  return [
    `✅ [${round.title}] 최종 주문 확인 (${orders.length}명 · ${all}개)`,
    "주문하신 내용이 맞는지 확인해 주세요. 다르면 공구 오픈자에게 알려 주세요.",
    "",
    ...orders.map((o) => `${bibLabel(o.bib)} ${o.name} · ${round.items.filter((it) => o.lines[it.id]).map((it) => `${label(it)} ${o.lines[it.id]}`).join(", ")} (${won(orderTotal(round.items, o.lines))})`),
    ...(orderUrl ? ["", `👉 ${orderUrl}`] : []),
  ].join("\n");
}

/** 입금 독촉 문구: 아직 입금 표시를 안 한 사람을 모아 카톡방에 붙여넣는다 */
export function unpaidReminder(round: Round, orders: Order[], orderUrl: string) {
  const un = orders.filter((o) => !o.paid);
  if (!un.length) return "";
  return [
    `💸 [${round.title}] 입금 확인 부탁드려요`,
    `입금 계좌: ${round.bank.bank} ${round.bank.account} (${round.bank.holder})`,
    "입금하신 뒤 주문 화면의 ‘내 주문’에서 입금완료를 눌러 주세요.",
    "",
    `아직 입금 표시가 없는 분 (${un.length}명)`,
    ...un.map((o) => `· ${o.name} (${o.depositor}) ${won(orderTotal(round.items, o.lines))}`),
    "",
    `👉 ${orderUrl}`,
  ].join("\n");
}

export const paidTimeLabel = fmtTime;
