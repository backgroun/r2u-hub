import { redirect } from "next/navigation";
import { eventOpen } from "@/lib/event";

export const dynamic = "force-dynamic";
export const metadata = { title: "이벤트" };

// 오픈 전에는 안내 문구만 보여 주고, 오픈일이 되면 빙고로 보낸다.
export default async function EventTeaser() {
  if (await eventOpen()) redirect("/bingo");
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 py-16 text-center">
      <p className="text-xl font-bold">11월 이벤트 기대해주세요</p>
    </main>
  );
}
