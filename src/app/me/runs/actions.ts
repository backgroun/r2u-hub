"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, isStaffNick } from "@/lib/hub";
import { deleteAllRuns, deleteRun, saveRunsConsent } from "@/lib/runs";
import type { Result } from "@/app/actions";

async function me() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/me/runs");
  if (isStaffNick(u.nick)) throw new Error("운영진 모드에서는 개인 기록을 다루지 않아요.");
  return u;
}
const refresh = () => { revalidatePath("/me/runs"); revalidatePath("/monthly"); revalidatePath("/me"); revalidatePath("/"); };

export async function agreeRunsConsent(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  if (fd.get("agree") !== "1") return { ok: false, msg: "동의에 체크해 주세요." };
  await saveRunsConsent(u.nick);
  revalidatePath("/me/runs");
  return { ok: true, msg: "동의했어요. 이제 가민 CSV를 올릴 수 있어요." };
}

export async function removeRun(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const ok = await deleteRun(u.nick, String(fd.get("startedAt") ?? "").slice(0, 19));
  refresh();
  return ok ? { ok: true, msg: "기록을 지웠어요. 다시 올려도 되살아나지 않아요." } : { ok: false, msg: "이미 없는 기록이에요." };
}

export async function removeAllRuns(): Promise<Result> {
  const u = await me();
  const n = await deleteAllRuns(u.nick);
  refresh();
  return { ok: true, msg: `가민 기록 ${n}건과 동의를 모두 지웠어요.` };
}
