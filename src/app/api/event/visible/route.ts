import { eventVisible } from "@/lib/event";

export const dynamic = "force-dynamic";

/** 크루원이 이벤트를 볼 수 있는가. 미들웨어(엣지)는 DB 에 직접 접속하지 못해서 이 길로 묻는다. */
export async function GET() {
  let visible = false;
  try { visible = await eventVisible(); } catch { visible = false; }
  return Response.json({ visible }, { headers: { "cache-control": "no-store" } });
}
