import { Suspense } from "react";
import Manage from "./manage";
import { getMembers } from "@/lib/hub";

export const metadata = { title: "공구 관리", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const members = await getMembers();
  const names = Object.fromEntries(members.map((member) => [member.nick, member.name || "없음"]));
  return (
    <Suspense>
      <Manage id={id} names={names} />
    </Suspense>
  );
}
