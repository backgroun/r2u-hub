import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { currentUser, isStaffNick } from "@/lib/hub";
import { hasRunsConsent, importRuns, validateRuns, type MergeMode } from "@/lib/runs";

/** 가민 CSV 업로드. 브라우저가 파싱한 요약만 받는다. dryRun=true면 분류 결과만 돌려준다 (명세 §7) */
export async function POST(req: Request) {
  const u = await currentUser(); // 닉네임은 세션에서만 (바디로 받지 않는다)
  if (!u) return NextResponse.json({ error: "로그인해 주세요." }, { status: 401 });
  if (isStaffNick(u.nick)) return NextResponse.json({ error: "운영진 모드에서는 개인 기록을 올리지 않아요." }, { status: 403 });
  if (!(await hasRunsConsent(u.nick))) return NextResponse.json({ error: "건강정보 수집 동의가 필요해요." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const v = validateRuns(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const dryRun = body?.dryRun !== false;
  const result = await importRuns(u.nick, v.runs, { dryRun, conflictDecisions: (body?.conflictDecisions ?? {}) as Record<string, MergeMode> });
  if (!dryRun) {
    revalidatePath("/me/runs");
    revalidatePath("/monthly");
    revalidatePath("/me");
    revalidatePath("/");
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
