import { NextResponse } from "next/server";
import { hashPassword, listRounds, newId, saveRound } from "@/lib/db";
import { BadInput, parseRoundInput } from "@/lib/validate";
import { currentUser } from "@/lib/hub";

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
    const u = await currentUser();
    const round = { ...input, id: newId(), adminKey: newId(18), pwHash: pw ? hashPassword(pw) : "", openerNick: u && u.nick !== "운영진" ? u.nick : undefined, createdAt: Date.now(), closed: false };
    await saveRound(round);
    return NextResponse.json({ id: round.id, adminKey: round.adminKey });
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
