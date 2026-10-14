import "server-only";
import { K, redis, type AfterParty, type Race } from "./hub";
import type { StoredOrder, StoredRound } from "./types";

/** 과거에 닉네임 전체를 한 칸에 잘못 넣어 생긴 중복 계정만 정리한다. */
const GHOST = "마루(정곤)";
const parse = <T,>(value: unknown): T => typeof value === "string" ? JSON.parse(value) as T : value as T;

type Change = { key: string; field?: string; kind: "hash" | "key" | "update"; note: string };

async function collect() {
  const changes: Change[] = [];
  const hdel = (key: string, field: string, note: string) => changes.push({ key, field, kind: "hash", note });
  const del = (key: string, note: string) => changes.push({ key, kind: "key", note });
  const update = (key: string, field: string | undefined, note: string) => changes.push({ key, field, kind: "update", note });
  const [member, aliases, requests, pendingNames, bingoPw, eventNicksRaw, joins, pushes, noticesRaw, monthKeys, vsKeys, vsEndKeys, racesRaw, roundIds] = await Promise.all([
    redis.hexists(K.members, GHOST),
    redis.hgetall<Record<string, string>>(K.nickAliases),
    redis.hgetall<Record<string, unknown>>("r2u:nickChangeRequests"),
    redis.hexists("r2u:pendingMemberNames", GHOST),
    redis.hexists("r2u:bingoPw", GHOST),
    redis.get<string[] | string>("r2u:eventNicks"),
    redis.hgetall<Record<string, unknown>>("r2u:joinreq"),
    redis.hgetall<Record<string, unknown>>("r2u:push"),
    redis.get<unknown>("r2u:notices"),
    redis.keys("r2u:month:*"),
    redis.keys("r2u:vs:*"),
    redis.keys("r2u:vsEnd:*"),
    redis.hgetall<Record<string, unknown>>(K.races),
    redis.zrange<string[]>("gb:rounds", 0, -1),
  ]);
  if (member) hdel(K.members, GHOST, "잘못 만든 회원");
  if (pendingNames) hdel("r2u:pendingMemberNames", GHOST, "이름 반영 대기");
  if (bingoPw) hdel("r2u:bingoPw", GHOST, "이벤트 비밀번호");
  if (await redis.exists(K.raceRec(GHOST))) del(K.raceRec(GHOST), "대회 기록");
  if (await redis.exists(K.fails(GHOST))) del(K.fails(GHOST), "로그인 실패 기록");
  for (const [alias, target] of Object.entries(aliases ?? {})) if (alias === GHOST || target === GHOST) hdel(K.nickAliases, alias, "옛 닉네임 연결");
  for (const [field, raw] of Object.entries(requests ?? {})) {
    const request = parse<{ oldNick?: string; newNick?: string }>(raw);
    if (field === GHOST || request.oldNick === GHOST || request.newNick === GHOST) hdel("r2u:nickChangeRequests", field, "닉네임 변경 신청");
  }
  const eventNicks = eventNicksRaw ? parse<string[]>(eventNicksRaw) : [];
  if (eventNicks.includes(GHOST)) update("r2u:eventNicks", undefined, "이벤트 참가 명단");
  for (const [field, raw] of Object.entries(joins ?? {})) {
    const request = parse<{ nick?: string; by?: string }>(raw);
    if (request.nick === GHOST || request.by === GHOST) hdel("r2u:joinreq", field, "가입 신청");
  }
  for (const [field, raw] of Object.entries(pushes ?? {})) {
    if (parse<{ nick?: string }>(raw).nick === GHOST) hdel("r2u:push", field, "알림 구독");
  }
  const notices = noticesRaw ? parse<Array<{ id: string; by: string; image?: boolean }>>(noticesRaw) : [];
  for (const notice of notices) if (notice.by === GHOST) {
    update("r2u:notices", notice.id, "공지");
    if (notice.image) del(`r2u:noticeImage:${notice.id}`, "공지 이미지");
  }
  for (const key of monthKeys.filter((key) => /^r2u:month:\d{4}-\d{2}$/.test(key))) {
    if (await redis.hexists(key, GHOST)) hdel(key, GHOST, "월간 기록");
  }
  for (const key of [...vsKeys.filter((key) => /^r2u:vs:\d{4}-\d{2}$/.test(key)), ...vsEndKeys.filter((key) => /^r2u:vsEnd:\d{4}-\d{2}$/.test(key))]) {
    for (const [field, value] of Object.entries((await redis.hgetall<Record<string, unknown>>(key)) ?? {})) {
      if (field === GHOST || value === GHOST) hdel(key, field, "대결 기록");
    }
  }
  for (const [id, raw] of Object.entries(racesRaw ?? {})) {
    const race = parse<Race>(raw);
    if (race.addedBy === GHOST) update(K.races, id, "대회 등록자 표기");
    if (await redis.hexists(K.raceP(id), GHOST)) hdel(K.raceP(id), GHOST, "대회 참가");
    if (await redis.hexists(K.cheer(id), GHOST)) hdel(K.cheer(id), GHOST, "대회 응원");
    for (const [afterId, afterRaw] of Object.entries((await redis.hgetall<Record<string, unknown>>(K.after(id))) ?? {})) {
      const after = parse<AfterParty>(afterRaw);
      if (after.by === GHOST) {
        hdel(K.after(id), afterId, "함께하기 글");
        del(K.rsvp(afterId), "함께하기 응답");
      } else {
        if (after.driver === GHOST) update(K.after(id), afterId, "카풀 운전자 표기");
        if (await redis.hexists(K.rsvp(afterId), GHOST)) hdel(K.rsvp(afterId), GHOST, "함께하기 응답");
      }
    }
  }
  for (const id of roundIds) {
    const round = await redis.get<StoredRound>(`gb:round:${id}`);
    if (round && (round.opener === GHOST || round.openerNick === GHOST)) update(`gb:round:${id}`, undefined, "공구 개설자 표기");
    for (const [field, raw] of Object.entries((await redis.hgetall<Record<string, unknown>>(`gb:orders:${id}`)) ?? {})) {
      const order = parse<StoredOrder>(raw);
      if (order.name === GHOST || order.owner === GHOST) hdel(`gb:orders:${id}`, field, "공구 주문");
    }
  }
  return { changes, eventNicks, notices, racesRaw: racesRaw ?? {}, roundIds };
}

export async function auditGhost() {
  const { changes } = await collect();
  return changes.reduce<Record<string, number>>((counts, change) => {
    counts[change.note] = (counts[change.note] ?? 0) + 1;
    return counts;
  }, {});
}

export async function purgeGhost() {
  const { changes, eventNicks, notices, racesRaw, roundIds } = await collect();
  if (!changes.length) return 0;
  const tx = redis.multi();
  for (const change of changes) {
    if (change.kind === "hash") tx.hdel(change.key, change.field!);
    if (change.kind === "key") tx.del(change.key);
    if (change.kind === "update" && change.key === "r2u:eventNicks") tx.set(change.key, JSON.stringify(eventNicks.filter((nick) => nick !== GHOST)));
    if (change.kind === "update" && change.key === "r2u:notices") tx.set(change.key, JSON.stringify(notices.filter((notice) => notice.by !== GHOST)));
    if (change.kind === "update" && change.key === K.races) {
      const race = parse<Race>(racesRaw[change.field!]);
      tx.hset(K.races, { [change.field!]: JSON.stringify({ ...race, addedBy: undefined }) });
    }
    if (change.kind === "update" && change.key.startsWith("r2u:race:") && change.field) {
      const raw = await redis.hget(change.key, change.field);
      if (raw) tx.hset(change.key, { [change.field]: JSON.stringify({ ...parse<AfterParty>(raw), driver: undefined }) });
    }
    if (change.kind === "update" && change.key.startsWith("gb:round:")) {
      const id = change.key.slice("gb:round:".length);
      if (roundIds.includes(id)) {
        const round = await redis.get<StoredRound>(change.key);
        if (round) tx.set(change.key, { ...round, opener: round.opener === GHOST ? "알 수 없음" : round.opener, openerNick: round.openerNick === GHOST ? undefined : round.openerNick });
      }
    }
  }
  await tx.exec();
  return changes.length;
}
