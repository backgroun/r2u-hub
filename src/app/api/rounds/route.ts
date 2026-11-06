import { after, NextResponse } from "next/server";
import { getRound, getRoundImage, hashPassword, listRounds, newId, saveRound, setRoundImage } from "@/lib/db";
import { BadInput, parseRoundInput } from "@/lib/validate";
import { MAX_DESIGN_IMAGES } from "@/lib/types";
import { notifyRoundOpened } from "@/lib/gb-notify";
import { currentUser, isStaffNick } from "@/lib/hub";

export async function GET() {
  return NextResponse.json(await listRounds());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseRoundInput(body);
    // 로그인한 크루원이 여니, 관리 비밀번호는 선택 (내 페이지에서 바로 관리)
    const pw = typeof body.password === "string" ? body.password : "";
    if (pw && (pw.length < 4 || pw.length > 30)) throw new BadInput("관리 비밀번호는 4자 이상으로 정해 주세요.");
    if (pw && !/^[a-z0-9]+$/.test(pw)) throw new BadInput("관리 비밀번호는 영문 소문자와 숫자만 사용할 수 있어요.");
    const u = await currentUser();
    const round = { ...input, id: newId(), adminKey: newId(18), pwHash: pw ? hashPassword(pw) : "", openerNick: u && !isStaffNick(u.nick) ? u.nick : undefined, createdAt: Date.now(), closed: false };
    // 공구 복제: 원본의 시안·사이즈표 이미지를 그대로 가져온다 (로그인한 크루원이면 볼 수 있는 이미지라 그대로 복사해도 된다)
    const cp = body.copyImages as { from?: unknown; design?: unknown; size?: unknown } | undefined;
    if (u && round.custom && cp && typeof cp.from === "string" && /^[A-Za-z0-9_-]{6,30}$/.test(cp.from) && (await getRound(cp.from))) {
      const slots = (Array.isArray(cp.design) ? cp.design : cp.design === true ? [0] : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < MAX_DESIGN_IMAGES);
      const copied: number[] = [];
      for (const slot of [...new Set(slots)].sort((a, b) => a - b)) {
        const img = await getRoundImage(cp.from, slot);
        if (!img) continue;
        await setRoundImage(round.id, img, slot);
        copied.push(slot);
      }
      if (copied.length) round.custom.images = copied;
      if (cp.size === true) {
        const img = await getRoundImage(cp.from, "size");
        if (img) { await setRoundImage(round.id, img, "size"); round.custom.sizeImage = true; }
      }
    }
    await saveRound(round);
    // 공구를 열면서 ‘오픈 알림’을 켠 경우에만 크루에게 푸시 (응답을 늦추지 않는다)
    if (body.notifyOpen === true && u) after(() => notifyRoundOpened(round, u.nick).catch(() => {}));
    return NextResponse.json({ id: round.id, adminKey: round.adminKey });
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
