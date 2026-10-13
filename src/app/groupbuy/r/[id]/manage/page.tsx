import { Suspense } from "react";
import Manage from "./manage";

export const metadata = { title: "공구 관리", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <Manage id={id} />
    </Suspense>
  );
}
