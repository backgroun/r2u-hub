import "server-only";
import { randomBytes } from "crypto";
import { K, getMember, getMembers, isStaffNick, redis, type AfterParty, type Member, type Race } from "./hub";
import { pointKeys } from "@/lib/points";
import { gearKey } from "@/lib/gear-collect";
import { renameBingoRecords } from "./bingo-store";
import { makeTitle, type StoredOrder, type StoredRound } from "./types";

const REQUESTS = "r2u:nickChangeRequests";
const LOCK = "r2u:nickChange:lock";
const BINGO_PW = "r2u:bingoPw";
const EVENT_NICKS = "r2u:eventNicks";
const parse = <T,>(value: unknown): T => typeof value === "string" ? JSON.parse(value) as T : value as T;

export type NickChangeRequest = {
  oldNick: string;
  newNick: string;
  status: "pending" | "rejected";
  at: number;
  decidedAt?: number;
  by?: string;
  reason?: string;
};

export const validNick = (nick: string) => nick.length >= 2 && [...nick].length <= 5 && !/[\s,/\\]/u.test(nick) && !isStaffNick(nick);

export async function getNickChangeRequest(nick: string): Promise<NickChangeRequest | null> {
  const raw = await redis.hget(REQUESTS, nick);
  return raw ? parse<NickChangeRequest>(raw) : null;
}

export async function listNickChangeRequests(): Promise<NickChangeRequest[]> {
  const raw = (await redis.hgetall<Record<string, unknown>>(REQUESTS)) ?? {};
  return Object.values(raw).map(parse<NickChangeRequest>).filter((r) => r.status === "pending").sort((a, b) => a.at - b.at);
}

export async function saveNickChangeRequest(request: NickChangeRequest) {
  await redis.hset(REQUESTS, { [request.oldNick]: JSON.stringify(request) });
}

export async function cancelNickChangeRequest(nick: string) {
  await redis.hdel(REQUESTS, nick);
}

export async function nickAvailable(oldNick: string, newNick: string) {
  const lower = newNick.toLocaleLowerCase("ko-KR");
  const [members, aliases, pending] = await Promise.all([
    getMembers(),
    redis.hgetall<Record<string, string>>(K.nickAliases),
    listNickChangeRequests(),
  ]);
  return !members.some((m) => m.nick !== oldNick && m.nick.toLocaleLowerCase("ko-KR") === lower)
    && !Object.entries(aliases ?? {}).some(([name, current]) => name.toLocaleLowerCase("ko-KR") === lower && current !== oldNick)
    && !pending.some((r) => r.oldNick !== oldNick && r.newNick.toLocaleLowerCase("ko-KR") === lower);
}

/** 승인 시 닉네임을 키로 쓰는 기존 기록을 한 번에 이동한다. 기존 세션은 새 닉네임으로 다시 로그인한다. */
export async function approveNickChange(oldNick: string, newNick: string): Promise<{ eventWarning: boolean }> {
  const token = randomBytes(12).toString("base64url");
  const locked = await redis.set(LOCK, token, { nx: true, ex: 300 });
  if (locked !== "OK") throw new Error("다른 닉네임 변경을 처리 중이에요. 잠시 뒤 다시 시도해 주세요.");
  try {
    const member = await getMember(oldNick);
    if (!member || !(await nickAvailable(oldNick, newNick))) throw new Error("회원 또는 새 닉네임을 다시 확인해 주세요.");
    const [racesRaw, monthKeys, vsKeys, vsEndKeys, aliasesRaw, eventRaw, noticesRaw, pushRaw, joinRaw, roundIds, raceRecords, bingoPw] = await Promise.all([
      redis.hgetall<Record<string, unknown>>(K.races),
      redis.keys("r2u:month:*"),
      redis.keys("r2u:vs:*"),
      redis.keys("r2u:vsEnd:*"),
      redis.hgetall<Record<string, string>>(K.nickAliases),
      redis.get<string[] | string>(EVENT_NICKS),
      redis.get<unknown>("r2u:notices"),
      redis.hgetall<Record<string, unknown>>("r2u:push"),
      redis.hgetall<Record<string, unknown>>("r2u:joinreq"),
      redis.zrange<string[]>("gb:rounds", 0, -1),
      redis.hgetall<Record<string, unknown>>(K.raceRec(oldNick)),
      redis.hget(BINGO_PW, oldNick),
    ]);
    if (await redis.exists(K.raceRec(newNick))) throw new Error("새 닉네임의 대회 기록이 이미 있어요.");
    const gearLog = await redis.hgetall<Record<string, unknown>>(gearKey(oldNick)); // 스팟게임 수집 기록
    const [ptLog, ptTotal] = await Promise.all([redis.hgetall<Record<string, unknown>>(pointKeys.log(oldNick)), redis.hget<number | string>(pointKeys.total, oldNick)]);
    const races = Object.entries(racesRaw ?? {}).map(([id, raw]) => ({ id, value: parse<Race>(raw) }));
    const afterByRace = await Promise.all(races.map(async ({ value }) => ({
      raceId: value.id,
      posts: (await redis.hgetall<Record<string, unknown>>(K.after(value.id))) ?? {},
    })));
    const afterIds = afterByRace.flatMap(({ posts }) => Object.keys(posts));
    const [months, matches, endRequests, participants, cheers, rsvps, rounds, orders] = await Promise.all([
      Promise.all(monthKeys.map((key) => redis.hgetall<Record<string, unknown>>(key))),
      Promise.all(vsKeys.map((key) => redis.hgetall<Record<string, unknown>>(key))),
      Promise.all(vsEndKeys.map((key) => redis.hgetall<Record<string, unknown>>(key))),
      Promise.all(races.map(({ value }) => redis.hget(K.raceP(value.id), oldNick))),
      Promise.all(races.map(({ value }) => redis.hget(K.cheer(value.id), oldNick))),
      Promise.all(afterIds.map((id) => redis.hget(K.rsvp(id), oldNick))),
      Promise.all(roundIds.map((id) => redis.get<StoredRound>(`gb:round:${id}`))),
      Promise.all(roundIds.map((id) => redis.hgetall<Record<string, StoredOrder>>(`gb:orders:${id}`))),
    ]);
    const targetFields = [
      ...races.flatMap(({ value }, i) => [
        participants[i] != null ? K.raceP(value.id) : null,
        cheers[i] != null ? K.cheer(value.id) : null,
      ]),
      ...afterIds.map((id, i) => rsvps[i] != null ? K.rsvp(id) : null),
      ...monthKeys.filter((_, i) => Object.hasOwn(months[i] ?? {}, oldNick)),
      ...vsKeys.filter((_, i) => Object.hasOwn(matches[i] ?? {}, oldNick)),
      ...vsEndKeys.filter((_, i) => Object.hasOwn(endRequests[i] ?? {}, oldNick)),
      bingoPw != null ? BINGO_PW : null,
    ].filter((key): key is string => !!key);
    if ((await Promise.all(targetFields.map((key) => redis.hexists(key, newNick)))).some(Boolean)) {
      throw new Error("새 닉네임으로 저장된 기존 기록이 있어 변경할 수 없어요. 운영진에게 알려 주세요.");
    }
    for (const orderSet of orders) {
      const existing = Object.values(orderSet ?? {});
      if (existing.some((order) => order.name === oldNick) && existing.some((order) => order.name.toLowerCase() === newNick.toLowerCase())) {
        throw new Error("같은 공구에 새 닉네임으로 된 주문이 이미 있어요. 주문을 먼저 확인해 주세요.");
      }
    }
    const oldRecord = (raceRecords ?? {});
    const eventNicks = eventRaw ? parse<string[]>(eventRaw) : [];
    const notices = noticesRaw ? parse<{ by: string }[]>(noticesRaw) : [];
    const aliases = aliasesRaw ?? {};
    const tx = redis.multi();

    // 새 회원 키를 먼저 쓰고, 같은 거래에서 이전 키를 지운다.
    const nextMember: Member = { ...member, nick: newNick };
    const storedMember = { name: nextMember.name, role: nextMember.role, pw: nextMember.pw, manager: nextMember.manager, managerPreviousRole: nextMember.managerPreviousRole };
    tx.hset(K.members, { [newNick]: JSON.stringify(storedMember) });
    tx.hdel(K.members, oldNick);
    for (const [alias, current] of Object.entries(aliases)) {
      if (current === oldNick) {
        if (alias.toLocaleLowerCase("ko-KR") === newNick.toLocaleLowerCase("ko-KR")) tx.hdel(K.nickAliases, alias);
        else tx.hset(K.nickAliases, { [alias]: newNick });
      }
    }
    tx.hset(K.nickAliases, { [oldNick]: newNick });

    for (let i = 0; i < races.length; i++) {
      const { id, value } = races[i];
      if (participants[i] != null) { tx.hset(K.raceP(value.id), { [newNick]: participants[i] }); tx.hdel(K.raceP(value.id), oldNick); }
      if (cheers[i] != null) { tx.hset(K.cheer(value.id), { [newNick]: cheers[i] }); tx.hdel(K.cheer(value.id), oldNick); }
      if (value.addedBy === oldNick) tx.hset(K.races, { [id]: JSON.stringify({ ...value, addedBy: newNick }) });
    }
    for (const { raceId, posts } of afterByRace) {
      for (const [id, raw] of Object.entries(posts)) {
        const post = parse<AfterParty>(raw);
        if (post.by === oldNick || post.driver === oldNick) {
          tx.hset(K.after(raceId), { [id]: JSON.stringify({ ...post, by: post.by === oldNick ? newNick : post.by, driver: post.driver === oldNick ? newNick : post.driver }) });
        }
      }
    }
    for (let i = 0; i < afterIds.length; i++) {
      if (rsvps[i] != null) { tx.hset(K.rsvp(afterIds[i]), { [newNick]: rsvps[i] }); tx.hdel(K.rsvp(afterIds[i]), oldNick); }
    }
    if (Object.keys(oldRecord).length) {
      tx.hset(K.raceRec(newNick), Object.fromEntries(Object.entries(oldRecord).map(([id, value]) => [id, typeof value === "string" ? value : JSON.stringify(value)])));
      tx.del(K.raceRec(oldNick));
    }
    if (gearLog && Object.keys(gearLog).length) { // 스팟게임 수집 기록도 새 닉네임으로
      tx.hset(gearKey(newNick), Object.fromEntries(Object.entries(gearLog).map(([k, v]) => [k, Number(v) || 0])));
      tx.del(gearKey(oldNick));
    }
    // 레벨 포인트도 새 닉네임으로
    if (ptLog && Object.keys(ptLog).length) {
      tx.hset(pointKeys.log(newNick), Object.fromEntries(Object.entries(ptLog).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])));
      tx.del(pointKeys.log(oldNick));
    }
    if (ptTotal != null) { tx.hset(pointKeys.total, { [newNick]: Number(ptTotal) || 0 }); tx.hdel(pointKeys.total, oldNick); }
    for (let i = 0; i < monthKeys.length; i++) {
      const raw = months[i] ?? {};
      if (Object.hasOwn(raw, oldNick)) {
        tx.hset(monthKeys[i], { [newNick]: typeof raw[oldNick] === "string" ? raw[oldNick] : JSON.stringify(raw[oldNick]) });
        tx.hdel(monthKeys[i], oldNick);
      }
    }
    for (let i = 0; i < vsKeys.length; i++) {
      const raw = matches[i] ?? {};
      if (Object.hasOwn(raw, oldNick)) { tx.hset(vsKeys[i], { [newNick]: raw[oldNick] }); tx.hdel(vsKeys[i], oldNick); }
      for (const [nick, opponent] of Object.entries(raw)) {
        if (nick !== oldNick && opponent === oldNick) tx.hset(vsKeys[i], { [nick]: newNick });
      }
    }
    for (let i = 0; i < vsEndKeys.length; i++) {
      const raw = endRequests[i] ?? {};
      if (Object.hasOwn(raw, oldNick)) { tx.hset(vsEndKeys[i], { [newNick]: raw[oldNick] }); tx.hdel(vsEndKeys[i], oldNick); }
      for (const [nick, opponent] of Object.entries(raw)) {
        if (nick !== oldNick && opponent === oldNick) tx.hset(vsEndKeys[i], { [nick]: newNick });
      }
    }
    if (eventNicks.includes(oldNick)) tx.set(EVENT_NICKS, JSON.stringify(eventNicks.map((nick) => nick === oldNick ? newNick : nick)));
    if (notices.some((notice) => notice.by === oldNick)) tx.set("r2u:notices", JSON.stringify(notices.map((notice) => notice.by === oldNick ? { ...notice, by: newNick } : notice)));
    for (const [key, raw] of Object.entries(pushRaw ?? {})) {
      const entry = parse<{ nick: string }>(raw);
      if (entry.nick === oldNick) tx.hset("r2u:push", { [key]: JSON.stringify({ ...entry, nick: newNick }) });
    }
    for (const [key, raw] of Object.entries(joinRaw ?? {})) {
      const entry = parse<{ nick: string; by?: string }>(raw);
      if (entry.nick === oldNick || entry.by === oldNick) tx.hset("r2u:joinreq", { [key]: JSON.stringify({ ...entry, nick: entry.nick === oldNick ? newNick : entry.nick, by: entry.by === oldNick ? newNick : entry.by }) });
    }
    if (bingoPw != null) { tx.hset(BINGO_PW, { [newNick]: bingoPw }); tx.hdel(BINGO_PW, oldNick); }
    for (let i = 0; i < roundIds.length; i++) {
      const round = rounds[i];
      if (round && (round.openerNick === oldNick || round.opener === oldNick)) {
        const updated = { ...round, openerNick: round.openerNick === oldNick ? newNick : round.openerNick, opener: round.opener === oldNick ? newNick : round.opener };
        updated.title = makeTitle(updated.opener, updated.items);
        tx.set(`gb:round:${roundIds[i]}`, updated);
      }
      for (const [id, order] of Object.entries(orders[i] ?? {})) {
        if (order.owner === oldNick || order.name === oldNick) {
          tx.hset(`gb:orders:${roundIds[i]}`, { [id]: { ...order, owner: order.owner === oldNick ? newNick : order.owner, name: order.name === oldNick ? newNick : order.name } });
        }
      }
    }
    tx.hdel(REQUESTS, oldNick);
    await tx.exec();

    // 빙고 기록(칸 인증·사진)도 허브 안에 있으므로 새 닉네임으로 옮긴다. (명단은 위에서 이미 바뀌었다)
    let eventWarning = false;
    try { await renameBingoRecords(oldNick, newNick); } catch { eventWarning = true; }
    return { eventWarning };
  } finally {
    if (await redis.get(LOCK) === token) await redis.del(LOCK);
  }
}
