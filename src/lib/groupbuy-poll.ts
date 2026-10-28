import "server-only";
import { redis, newId } from "@/lib/hub";

/** 공구 페이지 투표: 운영진이 만들고, 규칙(복수 선택·변경 가능·결과 공개)은 투표마다 정한다 */
export type GbPoll = {
  id: string;
  question: string;
  options: string[];
  /** 한 사람이 고를 수 있는 최대 개수 (1이면 단일 선택) */
  maxPick: number;
  /** 투표 후 마감 전까지 선택을 바꿀 수 있는가 */
  changeable: boolean;
  /** 마감 전에도 결과를 보여주는가 (false면 마감 후 공개) */
  showLive: boolean;
  /** 마감 시각(ms). 0이면 운영진이 직접 마감할 때까지 */
  deadline: number;
  closed: boolean;
  /** 선택지별 이미지 유무 (options와 같은 순서). 이미지는 항목당 1장 */
  optionImages?: boolean[];
  /** 마지막으로 고친 시각(ms). 이미지 주소에 붙여 바뀐 사진이 바로 보이게 한다 */
  ver?: number;
  by: string;
  at: number;
};

export const POLL_LIMITS = { question: 100, option: 40, minOptions: 2, maxOptions: 10, imageBytes: 200 * 1024 };

const POLLS = "gb:polls";
const votesKey = (id: string) => `gb:pollvotes:${id}`;
const imageKey = (id: string, n: number) => `gb:pollimg:${id}:${n}`;

export type PollImage = { type: string; data: string };

export async function getPollImage(id: string, n: number) {
  return redis.get<PollImage>(imageKey(id, n));
}

export const isPollOpen = (p: GbPoll, now = Date.now()) => !p.closed && (!p.deadline || p.deadline > now);

export async function listPolls(): Promise<GbPoll[]> {
  const all = (await redis.hgetall<Record<string, GbPoll | string>>(POLLS)) ?? {};
  return Object.values(all)
    .map((v) => (typeof v === "string" ? (JSON.parse(v) as GbPoll) : v))
    .sort((a, b) => b.at - a.at);
}

export async function getPoll(id: string): Promise<GbPoll | null> {
  const v = await redis.hget<GbPoll | string>(POLLS, id);
  if (!v) return null;
  return typeof v === "string" ? (JSON.parse(v) as GbPoll) : v;
}

/** images: 선택지와 같은 순서, 이미지가 없는 항목은 null */
export async function createPoll(p: Omit<GbPoll, "id" | "at" | "closed" | "optionImages">, images: (PollImage | null)[] = []) {
  const poll: GbPoll = { ...p, id: newId(), at: Date.now(), closed: false, optionImages: p.options.map((_, i) => !!images[i]) };
  // 이미지를 먼저 저장해서, 투표가 보이는데 이미지가 없는 순간이 생기지 않게 한다
  for (const [n, img] of images.entries()) if (img) await redis.set(imageKey(poll.id, n), img);
  await redis.hset(POLLS, { [poll.id]: JSON.stringify(poll) });
  return poll;
}

export type PollEdit = Omit<GbPoll, "id" | "at" | "closed" | "by" | "optionImages" | "ver">;

/**
 * 투표 내용을 고친다. 기존 항목은 순서와 번호를 그대로 두고(투표 기록이 번호로 저장돼 있어서) 글자·이미지만 바꾸며, 새 항목은 뒤에 붙는다.
 * images: 항목과 같은 순서. 이미지 → 새로 저장 · null → 이미지 없음(있던 건 삭제) · "keep" → 그대로
 */
export async function updatePoll(old: GbPoll, next: PollEdit, images: (PollImage | null | "keep")[]) {
  const poll: GbPoll = {
    ...old, ...next, ver: Date.now(),
    optionImages: next.options.map((_, i) => (images[i] === "keep" ? !!old.optionImages?.[i] : !!images[i])),
  };
  for (const [i, img] of images.entries()) {
    if (img && img !== "keep") await redis.set(imageKey(old.id, i), img);
    else if (img === null && old.optionImages?.[i]) await redis.del(imageKey(old.id, i));
  }
  await redis.hset(POLLS, { [old.id]: JSON.stringify(poll) });
  return poll;
}

export async function setPollClosed(id: string, closed: boolean) {
  const p = await getPoll(id);
  if (!p) return false;
  await redis.hset(POLLS, { [id]: JSON.stringify({ ...p, closed }) });
  return true;
}

export async function deletePoll(id: string) {
  const p = await getPoll(id);
  const tx = redis.multi();
  tx.hdel(POLLS, id);
  tx.del(votesKey(id), ...(p?.optionImages ?? []).flatMap((has, n) => (has ? [imageKey(id, n)] : [])));
  await tx.exec();
}

const parsePick = (v: unknown): number[] => {
  const arr = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isInteger(n)) : [];
};

export async function getMyPick(id: string, nick: string): Promise<number[] | null> {
  const v = await redis.hget<unknown>(votesKey(id), nick);
  return v == null ? null : parsePick(v);
}

export async function savePick(id: string, nick: string, picks: number[]) {
  await redis.hset(votesKey(id), { [nick]: JSON.stringify(picks) });
}

/**
 * 선택지별 득표 수 · 투표 인원 · 내 선택 · 선택지별 투표자 닉네임
 * (결과 비공개 투표는 호출하는 쪽에서 counts를 가리고, nicks는 운영진 화면에만 넘긴다)
 */
export async function pollResult(p: GbPoll, nick?: string | null) {
  const all = (await redis.hgetall<Record<string, unknown>>(votesKey(p.id))) ?? {};
  const counts = p.options.map(() => 0);
  const nicks: string[][] = p.options.map(() => []);
  for (const [who, v] of Object.entries(all)) {
    for (const i of new Set(parsePick(v))) if (counts[i] !== undefined) { counts[i]++; nicks[i].push(who); }
  }
  for (const list of nicks) list.sort((a, b) => a.localeCompare(b, "ko"));
  const mine = nick && nick in all ? parsePick(all[nick]) : null;
  return { counts, voters: Object.keys(all).length, mine, nicks };
}
