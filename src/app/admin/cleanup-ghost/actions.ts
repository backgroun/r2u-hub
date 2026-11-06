"use server";

import { revalidatePath } from "next/cache";
import { bustRaces, currentUser } from "@/lib/hub";
import { purgeGhost } from "@/lib/ghost-cleanup";
import { isConfirmed } from "@/lib/confirm-token";

export async function purgeGhostAction(fd: FormData) {
  const user = await currentUser();
  if (!user?.admin) throw new Error("운영진 권한이 필요해요.");
  if (!(await isConfirmed(fd.get("confirmToken")))) return; // 비밀번호 확인 필요
  await purgeGhost();
  bustRaces();
  revalidatePath("/admin/cleanup-ghost");
  revalidatePath("/", "layout");
}
