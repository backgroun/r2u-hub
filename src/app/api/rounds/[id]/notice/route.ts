import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/kv/client";
import { currentUser } from "@/lib/hub";
import { getOrders, getRound, getRoundImage } from "@/lib/db";
import { addNotice, deleteNotice, getNotices, sendPushAll, sendPushToNicks } from "@/lib/notice";
import { finalCheckText } from "@/lib/gb-export";
import { designSlots, fmtDeadline, fmtPickup, minLabel, won } from "@/lib/types";
import { CONFIRM_REQUIRED, isConfirmed } from "@/lib/confirm-token";

type Ctx = { params: Promise<{ id: string }> };
type Kind = "summary" | "final"; // summary = 공구 소개 공지, final = 최종 주문 확인 공지(누가 뭘 주문했는지)
const kindOf = (v: unknown): Kind => (v === "final" ? "final" : "summary");
const flagKey = (id: string, kind: Kind) => (kind === "final" ? `gb:notice:${id}:final` : `gb:notice:${id}`); // 이 공구로 올린 공지 id
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const refresh = () => { revalidatePath("/", "layout"); revalidatePath("/notices"); };

/** 이 공구로 올린 공지가 아직 있으면 그 id */
async function postedId(roundId: string, kind: Kind) {
  const nid = await redis.get<string>(flagKey(roundId, kind));
  if (!nid) return null;
  return (await getNotices()).some((n) => n.id === nid) ? String(nid) : null;
}

// 공구를 홈 공지로 올리는 일은 공지를 올릴 수 있는 운영진만 한다 (공지 기능과 같은 권한)
export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return NextResponse.json({ canPost: false, posted: false, postedFinal: false });
  return NextResponse.json({ canPost: true, posted: !!(await postedId(id, "summary")), postedFinal: !!(await postedId(id, "final")) });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return fail("공지는 운영진만 올릴 수 있어요.", 403);
  const r = await getRound(id);
  if (!r) return fail("공구를 찾을 수 없어요.", 404);
  const body = (await req.json().catch(() => ({}))) as { push?: unknown; kind?: unknown };
  const kind = kindOf(body.kind);
  const deadline = new Date(r.deadline).getTime();

  let title: string, text: string, to: string | undefined, img: { type: string; data: string } | null = null;
  if (kind === "final") {
    // 최종 주문 확인: 마감 뒤에 올리는 경우가 대부분이라 마감 여부와 상관없이 올릴 수 있다 (3일간 보인다)
    const orders = await getOrders(id);
    if (!orders.length) return fail("아직 주문이 없어요.", 409);
    title = `✅ 최종 주문 확인 · ${r.title}`.slice(0, 60);
    const full = finalCheckText(r, orders);
    text = full.length > 2500 ? `${full.slice(0, 2480)}\n…(이하는 공구 화면에서 확인해 주세요)` : full;
  } else {
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
    text = lines.join("\n").slice(0, 500);
    title = `🛒 ${r.title}`.slice(0, 60);
    // 시안 이미지가 있으면 첫 장을 공지 사진으로 쓴다
    const first = designSlots(c)[0];
    img = first === undefined ? null : await getRoundImage(id, first);
    // 마감일(한국 날짜)까지 홈에 보인다
    to = new Date(deadline + 9 * 3600e3).toISOString().slice(0, 10);
  }

  const old = await postedId(id, kind);
  if (old) await deleteNotice(old); // 다시 올리면 이전 공지는 내린다 (중복 방지)
  const n = await addNotice({ title, body: text, by: u.nick, ...(to ? { to } : {}), link: `/groupbuy/r/${id}` }, img ?? undefined);
  await redis.set(flagKey(id, kind), n.id);
  refresh();

  let pushed: number | null = null;
  if (body.push === true) {
    if (kind === "final") {
      // 최종 확인은 주문한 사람에게만 알린다
      const nicks = new Set((await getOrders(id)).map((o) => o.owner).filter((x): x is string => !!x));
      const res = await sendPushToNicks(nicks, "최종 주문 확인 ✅", `${r.title} — 주문 내용이 맞는지 확인해 주세요.`, `/groupbuy/r/${id}`);
      pushed = res.skipped ? 0 : res.sent;
    } else {
      const res = await sendPushAll(title, text.split("\n").slice(0, 2).join(" · ").slice(0, 120), `/groupbuy/r/${id}`);
      pushed = res.skipped ? 0 : res.sent;
    }
  }
  return NextResponse.json({ ok: true, posted: true, pushed });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  if (!u?.admin) return fail("공지는 운영진만 내릴 수 있어요.", 403);
  const body = (await req.json().catch(() => ({}))) as { confirmToken?: unknown };
  if (!(await isConfirmed(body.confirmToken))) return fail(CONFIRM_REQUIRED, 403); // 공지 내리기는 비밀번호 확인 필요
  const kind = kindOf(new URL(req.url).searchParams.get("kind"));
  const old = await postedId(id, kind);
  if (old) await deleteNotice(old);
  await redis.del(flagKey(id, kind));
  refresh();
  return NextResponse.json({ ok: true, posted: false });
}
