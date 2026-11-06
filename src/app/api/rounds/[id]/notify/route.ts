import { NextResponse } from "next/server";
import { getRound, keyMatches, saveRound } from "@/lib/db";
import { currentUser } from "@/lib/hub";
import { notifyRoundOpened } from "@/lib/gb-notify";

type Ctx = { params: Promise<{ id: string }> };
const COOLDOWN_MS = 10 * 60 * 1000; // 같은 공구 오픈 알림은 10분에 한 번까지 (실수로 연달아 누르는 것 방지)

// 공구 오픈자: 열 때 오픈 알림을 안 보냈어도 나중에 수정 화면에서 보낼 수 있다. 운영자 키가 맞아야 한다.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getRound(id);
  if (!r) return NextResponse.json({ error: "공구를 찾을 수 없어요." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!keyMatches(body.key, r.adminKey)) return NextResponse.json({ error: "운영자 링크가 아니에요." }, { status: 403 });
  if (r.closed || Date.now() >= new Date(r.deadline).getTime()) return NextResponse.json({ error: "마감된 공구는 오픈 알림을 보낼 수 없어요." }, { status: 409 });
  if (r.notifiedAt && Date.now() - r.notifiedAt < COOLDOWN_MS) return NextResponse.json({ error: "방금 알림을 보냈어요. 10분 뒤에 다시 보낼 수 있어요." }, { status: 429 });
  const u = await currentUser();
  const res = await notifyRoundOpened(r, u?.nick ?? r.openerNick);
  if (res.skipped) return NextResponse.json({ error: "알림용 키가 설정돼 있지 않아 알림을 보내지 못했어요." }, { status: 503 });
  if (res.sent === 0) return NextResponse.json({ error: "알림을 받을 수 있는 크루원이 아직 없어요. (푸시 알림을 켠 사람이 없어요)" }, { status: 409 });
  r.notifiedAt = Date.now();
  await saveRound(r);
  return NextResponse.json({ ok: true, sent: res.sent, notifiedAt: r.notifiedAt });
}
