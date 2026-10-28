import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { postIconChangeNotice } from "@/lib/icon-notice";

export const dynamic = "force-dynamic";

// 매일 한국 시간 0시 5분에 Vercel Cron 이 부른다. 아이콘이 바뀌는 날이면 공지를 한 번 올린다.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await postIconChangeNotice();
  if (r.posted) { revalidatePath("/", "layout"); revalidatePath("/notices"); }
  return NextResponse.json(r);
}
export const GET = run;
export const POST = run;
