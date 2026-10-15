import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { currentUser, isStaffNick } from "@/lib/hub";
import { getRoster, isJoined } from "@/lib/event-blocks";
import { getInfo, myRecords, removeRow, saveMission, setRow, snapshot } from "@/lib/bingo-store";
import { PT, setPoints } from "@/lib/points";

// 빙고 화면이 예전 서버(Supabase)에 보내던 요청을 허브가 그대로 받아 처리한다.
// 신원은 허브 로그인(쿠키)이고, 이름·비밀번호는 받지 않는다. 이벤트에 참가 신청한 크루원(또는 운영진)만 쓸 수 있다.
const headers = { "cache-control": "no-store" };
const err = (error: string, auth = false) => NextResponse.json({ ok: false, error, ...(auth ? { auth: true } : {}) }, { headers });

export async function POST(req: Request, ctx: { params: Promise<{ fn: string }> }) {
  const { fn } = await ctx.params;
  const u = await currentUser();
  if (!u) return err("허브에 로그인해 주세요.", true);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (fn === "get_snapshot") return NextResponse.json(await snapshot(), { headers });

  // 운영진이 빙고판에서 바로 미션(이모지·제목·설명)을 고친다 (운영진 계정 포함, 크루 보기 중에는 불가)
  if (fn === "admin_mission_save") {
    if (!u.admin) return err("운영진만 고칠 수 있어요.", true);
    // 제목·설명은 줄바꿈을 그대로 보관한다 (빈 줄은 하나로, 제목은 최대 2줄·설명은 최대 3줄)
    const lines = (v: unknown, max: number, len: number) => String(v ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max).join("\n").slice(0, len);
    const n = Number(body.p_no), e = String(body.p_emoji ?? "").trim().slice(0, 8), t = lines(body.p_title, 2, 40), d = lines(body.p_descr, 3, 120);
    if (!Number.isInteger(n) || n < 1 || n > 25) return err("미션 번호가 올바르지 않아요.");
    if (!t) return err("제목을 입력해 주세요.");
    await saveMission(n, e, t, d);
    return NextResponse.json(await snapshot(), { headers });
  }

  // 아래부터는 ‘나’의 기록을 다룬다
  if (isStaffNick(u.nick)) return err("운영진 모드 계정은 개인 기록을 입력하지 않아요.", true);
  if (!u.admin && !isJoined(await getRoster(), u.nick)) return err("이벤트에 참가 신청한 크루원만 쓸 수 있어요.", true);

  if (fn === "app_login") return NextResponse.json({ ...(await snapshot()), name: u.nick }, { headers });

  if (fn === "app_my_report") return NextResponse.json({ ok: true, records: await myRecords(u.nick) }, { headers });

  const no = Number(body.p_no);
  if (fn === "app_photo_slot") {
    if (!Number.isInteger(no) || no < 1 || no > 25) return err("미션 번호가 올바르지 않아요.");
    return NextResponse.json({ ok: true, path: `${u.nick}/${no}-${randomBytes(6).toString("hex")}.jpg` }, { headers });
  }
  if (fn === "app_set") {
    const photo = typeof body.p_photo === "string" ? body.p_photo : "";
    if (photo && !photo.startsWith(`${u.nick}/`)) return err("사진 경로가 올바르지 않아요.");
    const problem = await setRow(u.nick, no, String(body.p_date ?? ""), photo);
    if (!problem) await setPoints(u.nick, `bingo:${(await getInfo()).start}:${no}`, PT.bingo, "빙고 미션");
    return problem ? err(problem) : NextResponse.json(await snapshot(), { headers });
  }
  if (fn === "app_remove") {
    const problem = await removeRow(u.nick, no);
    if (!problem) await setPoints(u.nick, `bingo:${(await getInfo()).start}:${no}`, 0, "");
    return problem ? err(problem) : NextResponse.json(await snapshot(), { headers });
  }
  return err("알 수 없는 요청이에요.");
}
