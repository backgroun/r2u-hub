"use server";

import { revalidatePath } from "next/cache";
import { bustRaces, currentUser } from "@/lib/hub";
import { purgeGhost } from "@/lib/ghost-cleanup";

export async function purgeGhostAction() {
  const user = await currentUser();
  if (!user?.admin) throw new Error("운영진 권한이 필요해요.");
  await purgeGhost();
  bustRaces();
  revalidatePath("/admin/cleanup-ghost");
  revalidatePath("/", "layout");
}
