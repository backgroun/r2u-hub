import "server-only";
import { redis, newId, kstToday } from "@/lib/hub";
import { EVENT_NICKS_KEY } from "@/lib/sheet";

/* ---------- 이벤트 블록 ----------
   운영진이 월별로 여러 개의 이벤트 블록(빙고·투표…)을 미리 만들어 두고,
   그중 하나를 골라 이벤트 탭 본문에 세팅한다. 월마다 활성 블록은 하나. */
export type EventBlock = {
  id: string;
  type: "bingo" | "poll";
  title: string;
  ym: string; // YYYY-MM (이 블록이 속한 달)
  at: number;
  by: string;
  poll?: { question: string; options: string[] };
};
export const BLOCK_TYPES = { bingo: "빙고", poll: "투표·설문" } as const;

const BLOCKS = "r2u:eventBlocks";
const ACTIVE = "r2u:eventActive"; // { "2026-11": blockId }
const ROSTER_OWNER = "r2u:eventRosterOwner"; // 지금 EVENT_NICKS_KEY(참가 명단)를 쓰는 빙고 블록 id
const rosterKey = (id: string) => `r2u:eventRoster:${id}`; // 활성에서 내려간 빙고 블록의 보관 명단
const votesKey = (id: string) => `r2u:pollVotes:${id}`;
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? (JSON.parse(v) as string[]) : []);

/** 블록 목록. 처음 쓸 때는 지금 운영 중인 빙고를 첫 블록으로 만들어 이어 간다. */
export async function getBlocks(): Promise<EventBlock[]> {
  const raw = await redis.get<EventBlock[] | string>(BLOCKS);
  if (raw) return parse<EventBlock[]>(raw);
  const { hubPeriod } = await import("@/lib/event");
  const ym = (await hubPeriod())?.start.slice(0, 7) ?? "2026-11";
  const first: EventBlock = { id: newId(), type: "bingo", title: "R2U 5×5 미션 빙고", ym, at: Date.now(), by: "운영진" };
  const tx = redis.multi();
  tx.set(BLOCKS, JSON.stringify([first]));
  tx.set(ACTIVE, JSON.stringify({ [ym]: first.id }));
  tx.set(ROSTER_OWNER, first.id);
  await tx.exec();
  return [first];
}
const saveBlocks = (blocks: EventBlock[]) => redis.set(BLOCKS, JSON.stringify(blocks));

export async function getActive(): Promise<Record<string, string>> {
  await getBlocks();
  const raw = await redis.get<Record<string, string> | string>(ACTIVE);
  return raw ? parse<Record<string, string>>(raw) : {};
}

/** 지금 이벤트 탭 본문에 보여 줄 블록: 이번 달 활성 블록, 없으면 가장 가까운 앞으로의 달 */
export async function displayBlock(): Promise<EventBlock | null> {
  const [blocks, active] = await Promise.all([getBlocks(), getActive()]);
  const ym = kstToday().slice(0, 7);
  const next = Object.keys(active).filter((m) => m >= ym).sort()[0];
  return next ? blocks.find((b) => b.id === active[next]) ?? null : null;
}

export async function createBlock(b: Omit<EventBlock, "id" | "at">) {
  const blocks = await getBlocks();
  const block = { ...b, id: newId(), at: Date.now() };
  await saveBlocks([...blocks, block]);
  return block;
}

/** 명단을 쓰는 빙고 블록이 바뀌면, 이전 명단은 보관하고 새 블록의 명단을 불러온다. */
async function swapRoster(toId: string) {
  const owner = await redis.get<string>(ROSTER_OWNER);
  if (owner === toId) return;
  const tx = redis.multi();
  if (owner) tx.set(rosterKey(owner), JSON.stringify(await getRoster()));
  const saved = await redis.get<string[] | string>(rosterKey(toId));
  tx.set(EVENT_NICKS_KEY, JSON.stringify(saved ? list(saved) : []));
  tx.set(ROSTER_OWNER, toId);
  await tx.exec();
}

/** 그 달의 본문 블록으로 세팅 (한 달에 하나, 이전 것은 자동으로 내려간다). blockId가 null이면 내린다. */
export async function setActive(ym: string, blockId: string | null) {
  const active = await getActive();
  if (blockId) {
    const block = (await getBlocks()).find((b) => b.id === blockId);
    if (!block) throw new Error("블록을 찾지 못했어요.");
    active[ym] = blockId;
    if (block.type === "bingo") await swapRoster(blockId);
  } else delete active[ym];
  await redis.set(ACTIVE, JSON.stringify(active));
}

export async function deleteBlock(id: string) {
  const blocks = await getBlocks();
  const active = await getActive();
  for (const m of Object.keys(active)) if (active[m] === id) delete active[m];
  const tx = redis.multi();
  tx.set(BLOCKS, JSON.stringify(blocks.filter((b) => b.id !== id)));
  tx.set(ACTIVE, JSON.stringify(active));
  tx.del(rosterKey(id), votesKey(id));
  if ((await redis.get<string>(ROSTER_OWNER)) === id) { tx.del(ROSTER_OWNER); tx.set(EVENT_NICKS_KEY, JSON.stringify([])); }
  await tx.exec();
}

/** 빙고 블록별 신청자: 지금 명단을 쓰는 블록은 현재 명단, 그 밖의 블록은 보관해 둔 명단 */
export async function getBlockRoster(blockId: string): Promise<{ list: string[]; live: boolean }> {
  const live = (await redis.get<string>(ROSTER_OWNER)) === blockId;
  return { list: live ? await getRoster() : list(await redis.get<string[] | string>(rosterKey(blockId))), live };
}

/* ---------- 참가 신청 (빙고) ---------- */
export async function getRoster(): Promise<string[]> {
  return list(await redis.get<string[] | string>(EVENT_NICKS_KEY));
}
export async function joinRoster(nick: string) {
  const roster = await getRoster();
  if (roster.some((n) => n.toLowerCase() === nick.toLowerCase())) return { added: false };
  await redis.set(EVENT_NICKS_KEY, JSON.stringify([...roster, nick]));
  return { added: true };
}
export async function leaveRoster(nick: string) {
  const roster = await getRoster();
  await redis.set(EVENT_NICKS_KEY, JSON.stringify(roster.filter((n) => n.toLowerCase() !== nick.toLowerCase())));
}
export const isJoined = (roster: string[], nick?: string | null) => !!nick && roster.some((n) => n.trim().toLowerCase() === nick.trim().toLowerCase());

/* ---------- 투표·설문 ---------- */
export async function castVote(id: string, nick: string, option: number) {
  await redis.hset(votesKey(id), { [nick]: option });
}
/** 옵션별 득표 수와 내가 고른 항목 */
export async function pollResult(block: EventBlock, nick?: string | null) {
  const all = (await redis.hgetall<Record<string, unknown>>(votesKey(block.id))) ?? {};
  const counts = (block.poll?.options ?? []).map(() => 0);
  for (const v of Object.values(all)) { const i = Number(v); if (counts[i] !== undefined) counts[i]++; }
  const mine = nick && nick in all ? Number(all[nick]) : null;
  return { counts, total: Object.keys(all).length, mine };
}
