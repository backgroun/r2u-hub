import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/hub";
import { addManualRace } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import KakaoPlaceField from "@/components/kakao-place-field";

export const dynamic = "force-dynamic";
export const metadata = { title: "대회 직접 등록" };

export default async function NewRace({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const name = ((await searchParams).name ?? "").slice(0, 60);
  return (
    <main className="hub-wrap">
      <header className="grid gap-1">
        <Link href="/races/find" className="text-sm text-muted">← 대회 찾기</Link>
        <h1 className="hub-h1">대회 직접 등록</h1>
        <p className="text-sm text-muted">찾는 대회가 없을 때 직접 적어서 우리 일정에 넣어요.</p>
      </header>
      <ActionForm action={addManualRace} className="panel p-4 grid-2" keep>
        <label className="field full"><span className="label">대회명</span><input name="name" className="input" required defaultValue={name} maxLength={60} /></label>
        <label className="field"><span className="label">대회 날짜</span><input name="date" type="date" className="input" required /></label>
        <label className="field"><span className="label">출발 시간 (선택)</span><input name="time" type="time" className="input" /></label>
        <div className="full"><KakaoPlaceField /></div>
        <label className="field"><span className="label">접수 시작 (선택)</span><input name="regStart" type="datetime-local" className="input" /></label>
        <label className="field"><span className="label">접수 마감 (선택)</span><input name="regEnd" type="datetime-local" className="input" /></label>
        <label className="field full"><span className="label">주최 측 접수 페이지 주소 (확인된 경우)</span><input name="regUrl" type="url" className="input" placeholder="https://" maxLength={500} /></label>
        <label className="field full"><span className="label">메모</span><input name="note" className="input" placeholder="코스, 신청 링크 등" maxLength={200} /></label>
        <div className="full"><Submit>우리 일정에 등록</Submit></div>
      </ActionForm>
    </main>
  );
}
