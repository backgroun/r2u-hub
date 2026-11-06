import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/kv/client";
import { currentUser } from "@/lib/hub";
import { getRound, getRoundImage } from "@/lib/db";
import { addNotice, deleteNotice, getNotices, sendPushAll } from "@/lib/notice";
import { designSlots, fmtDeadline, fmtPickup, minLabel, won } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
const flagKey = (id: string) => `gb:notice:${id}`; // 이 공구로 올린 공지 id
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const refresh = () => { revalidatePath("/", "layout"); revalidatePath("/notices"); };

/** 이 공구로 올린 공지가 아직 있으면 그 id */
async function postedId(roundId: string) {
  const nid = await redis.get<string>(flagKey(roundId));
  if (!nid) return null;
  return (await getNotices()).some((n) => n.id === nid) ? String(nid) : null;
}

// 공구를 홈 공지로 올리는 일은 공지를 올릴 수 있는 운영진만 한다 (공지 기능과 같은 권한)
export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return NextResponse.json({ canPost: false, posted: false });
  return NextResponse.json({ canPost: true, posted: !!(await postedId(id)) });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return fail("공지는 운영진만 올릴 수 있어요.", 403);
  const r = await getRound(id);
  if (!r) return fail("공구를 찾을 수 없어요.", 404);
  const body = (await req.json().catch(() => ({}))) as { push?: unknown };
  const deadline = new Date(r.deadline).getTime();
  if (r.closed || Date.now() >= deadline) return fail("마감된 공구는 공지로 올릴 수 없어요.", 409);

  const c = r.custom;
  const lines = [`공구 오픈자 ${r.opener}`, `마감 ${fmtDeadline(r.deadline)}`, minLabel(r.minQty)];
  if (fmtPickup(r.pickup)) lines.push(`배포 장소 ${fmtPickup(r.pickup)}`);
  lines.push("");
  if (c) {
    lines.push(`${c.name} ${won(c.price)}`);
    if (c.sizes.length) lines.push(`사이즈 ${c.sizes.join("/")}`);
    if (c.colors.length) lines.push(`컬러 ${c.colors.join("/")}`);
  } else {
    for (const it of r.items.slice(0, 6)) lines.push(`· ${it.name} ${won(it.price)}`);
    if (r.items.length > 6) lines.push(`외 ${r.items.length - 6}개`);
  }
  const text = lines.join("\n").slice(0, 500);
  const title = `🛒 ${r.title}`.slice(0, 60);

  // 시안 이미지가 있으면 첫 장을 공지 사진으로 쓴다
  const first = designSlots(c)[0];
  const img = first === undefined ? null : await getRoundImage(id, first);

  const old = await postedId(id);
  if (old) await deleteNotice(old); // 다시 올리면 이전 공지는 내린다 (중복 방지)
  // 마감일(한국 날짜)까지 홈에 보인다
  const to = new Date(deadline + 9 * 3600e3).toISOString().slice(0, 10);
  const n = await addNotice({ title, body: text, by: u.nick, to, link: `/groupbuy/r/${id}` }, img ?? undefined);
  await redis.set(flagKey(id), n.id);
  refresh();

  let pushed: number | null = null;
  if (body.push === true) {
    const res = await sendPushAll(title, text.split("\n").slice(0, 2).join(" · ").slice(0, 120), `/groupbuy/r/${id}`);
    pushed = res.skipped ? 0 : res.sent;
  }
  return NextResponse.json({ ok: true, posted: true, pushed });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return fail("공지는 운영진만 내릴 수 있어요.", 403);
  const old = await postedId(id);
  if (old) await deleteNotice(old);
  await redis.del(flagKey(id));
  refresh();
  return NextResponse.json({ ok: true, posted: false });
}
