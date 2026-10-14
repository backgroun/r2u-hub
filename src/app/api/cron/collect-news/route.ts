import { NextResponse, type NextRequest } from "next/server";
import { collectNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 예약 실행(GitHub Actions 등)이 부른다. CRON_SECRET 이 없거나 다르면 401.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const log = await collectNews();
  return NextResponse.json(log, { status: log.error ? 500 : 200 });
}
export const POST = run;
export const GET = run; // Vercel Cron 은 GET 으로 부른다
