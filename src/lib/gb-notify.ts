import "server-only";
import { redis } from "./kv/client";
import { getOrders, getRound, listRoundIds } from "./db";
import { getPushEnabledNicks, sendPushToNicks } from "./notice";
import { fmtDeadline, nickKey, qtyOf, type Round } from "./types";

// 공구 알림 (웹 푸시). 같은 공구에 같은 알림은 한 번만 보낸다.
const SOON_HOURS = 30; // 하루 한 번 도는 크론이 놓치지 않게 24시간보다 넉넉하게
const flag = (id: string, kind: "goal" | "soon") => `gb:notif:${id}:${kind}`;
const url = (id: string) => `/groupbuy/r/${id}`;

/** 공구를 열면서 ‘오픈 알림’을 켠 경우: 푸시를 켠 크루원 모두에게 새 공구를 알린다 (연 사람 본인은 뺀다) */
export async function notifyRoundOpened(r: Round, openerNick?: string) {
  const nicks = await getPushEnabledNicks();
  if (openerNick) nicks.delete(openerNick);
  if (!nicks.size) return { sent: 0 };
  await sendPushToNicks(nicks, "새 공구가 열렸어요 🛒", `${r.opener}님의 공구 · ${r.title} (${fmtDeadline(r.deadline)} 마감)`, url(r.id));
  return { sent: nicks.size };
}

/** 최소 수량이 처음 채워진 순간: 주문자와 공구 오픈자에게 알린다 */
export async function notifyGoalReached(roundId: string) {
  const r = await getRound(roundId);
  if (!r || r.minQty <= 0 || r.notify?.reminders === false) return; // 알림을 끈 공구는 보내지 않는다
  const orders = await getOrders(roundId);
  if (orders.reduce((s, o) => s + qtyOf(o.lines), 0) < r.minQty) return;
  if (await redis.get(flag(roundId, "goal"))) return;
  await redis.set(flag(roundId, "goal"), 1);
  const nicks = new Set<string>(orders.map((o) => o.owner ?? o.name));
  if (r.openerNick) nicks.add(r.openerNick);
  await sendPushToNicks(nicks, "공구 목표 달성 🎉", `${r.title}: 최소 ${r.minQty}개가 모였어요. 공구가 진행돼요!`, url(roundId));
}

/** 마감 30시간 안으로 들어온 공구: 아직 주문 안 한 사람에게 ‘마감 임박’, 주문했지만 입금 표시가 없는 사람에게 ‘입금 확인’ */
export async function notifyDeadlineSoon() {
  const now = Date.now();
  const enabled = await getPushEnabledNicks();
  const done: { id: string; toOthers: number; toUnpaid: number }[] = [];
  for (const id of await listRoundIds(100)) {
    const r = await getRound(id);
    if (!r || r.closed || r.archived || r.notify?.reminders === false) continue;
    const left = new Date(r.deadline).getTime() - now;
    if (left <= 0 || left > SOON_HOURS * 3600e3) continue;
    if (await redis.get(flag(id, "soon"))) continue;
    await redis.set(flag(id, "soon"), 1);
    const orders = await getOrders(id);
    const ordered = new Set(orders.map((o) => nickKey(o.owner ?? o.name)));
    const others = new Set([...enabled].filter((n) => !ordered.has(nickKey(n)) && n !== r.openerNick));
    const unpaid = new Set(orders.filter((o) => !o.paid && o.owner).map((o) => o.owner as string));
    if (others.size) await sendPushToNicks(others, "공구 마감 임박 ⏰", `${r.title} — ${fmtDeadline(r.deadline)} 마감이에요. 아직 주문 전이시면 서둘러 주세요!`, url(id));
    if (unpaid.size) await sendPushToNicks(unpaid, "입금 확인 부탁드려요 💸", `${r.title} — 입금하셨다면 ‘내 주문’에서 입금완료를 눌러 주세요.`, url(id));
    done.push({ id, toOthers: others.size, toUnpaid: unpaid.size });
  }
  return done;
}
