import { NextResponse, type NextRequest } from "next/server";
import { notifyDeadlineSoon } from "@/lib/gb-notify";

export const dynamic = "force-dynamic";

// 매일 한국 시간 오전 9시에 Vercel Cron 이 부른다. 마감이 가까운 공구의 마감 임박·입금 확인 알림을 보낸다.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ notified: await notifyDeadlineSoon() });
}
export const GET = run;
export const POST = run;
