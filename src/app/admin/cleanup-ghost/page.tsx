import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/hub";
import { auditGhost } from "@/lib/ghost-cleanup";
import { purgeGhostAction } from "./actions";
import { ConfirmButton } from "@/components/action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "중복 기록 정리" };

export default async function CleanupGhostPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/cleanup-ghost");
  if (!user.admin) redirect("/");
  const counts = await auditGhost();
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return <main className="hub-wrap grid gap-4">
    <Link href="/admin?tab=members" className="text-sm text-muted">← 회원 목록</Link>
    <h1 className="hub-h1">마루(정곤) 중복 기록 정리</h1>
    <p className="text-sm text-muted">정확히 ‘마루(정곤)’으로 저장된 값만 찾습니다. 정상 회원 마루/정곤은 유지합니다.</p>
    <section className="panel p-4 grid gap-2">
      <h2 className="font-bold">발견된 중복 항목 {total}건</h2>
      {total ? Object.entries(counts).map(([label, count]) => <p key={label} className="text-sm">{label} {count}건</p>) : <p className="text-sm text-muted">중복 항목이 없어요.</p>}
    </section>
    {total > 0 && <form action={purgeGhostAction}><ConfirmButton className="btn btn-danger" message={`‘마루(정곤)’ 중복 기록 ${total}건을 삭제할까요?\n되돌릴 수 없어요.`}>‘마루(정곤)’ 중복 기록 삭제</ConfirmButton></form>}
  </main>;
}
