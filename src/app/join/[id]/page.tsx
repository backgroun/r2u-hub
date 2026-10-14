import Link from "next/link";
import { currentUser } from "@/lib/hub";
import { getJoin } from "@/lib/join";
import { decideJoin } from "@/app/actions";
import ShareLink from "@/components/share-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "닉네임 승인" };

export default async function JoinStatus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const fresh = !!(await searchParams).new;
  const [r, u] = await Promise.all([getJoin(id), currentUser()]);
  if (!r) return <main className="wrap" style={{ maxWidth: 420 }}><p className="panel p-5 text-center">없는 요청이에요. 링크를 다시 확인해 주세요.</p></main>;
  const admin = !!u?.admin;
  return (
    <main className="wrap grid gap-5" style={{ maxWidth: 420 }}>
      <header className="grid gap-2 pt-6 text-center">
        <h1 className="hub-h1 hub-h1-lg">닉네임 승인</h1>
        <p className="text-sm text-muted">신규 크루원 닉네임 생성 요청</p>
      </header>
      <section className="panel p-5 grid gap-4 text-center">
        <p className="text-2xl font-bold">{r.nick}</p>
        {r.status === "pending" && <p className="chip chip-warn justify-self-center">승인 대기 중</p>}
        {r.status === "approved" && <p className="chip chip-confirmed justify-self-center">승인 완료</p>}
        {r.status === "rejected" && <p className="chip chip-failed justify-self-center">거절됨</p>}

        {r.status === "pending" && admin && (
          <div className="grid gap-2">
            <p className="text-sm text-muted">승인하면 닉네임이 생기고 구글시트 회원 명단에도 추가돼요.</p>
            <div className="flex justify-center gap-2">
              <form action={decideJoin}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="approve" /><button className="btn btn-primary">승인</button></form>
              <details className="nick-reject text-left"><summary className="btn btn-ghost btn-danger">거절</summary><form action={decideJoin} className="grid gap-2 mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="reject" /><textarea name="reason" className="input" rows={2} maxLength={300} required placeholder="신청자에게 전달할 메시지" /><button className="btn btn-ghost btn-danger">메시지 보내고 거절</button></form></details>
            </div>
          </div>
        )}
        {r.status === "pending" && !admin && (
          <div className="grid gap-3 text-left">
            {fresh && <p className="text-sm">요청이 만들어졌어요! 아래 링크를 <b>크루 카톡방에 보내 주세요.</b> 운영진이 승인하면 로그인할 수 있어요.</p>}
            <ShareLink path={`/join/${r.id}`} text={`R2U 닉네임 '${r.nick}' 승인 부탁드려요!`} />
            <p className="text-xs text-muted">운영진이라면 로그인한 뒤 이 링크를 열어 승인해 주세요. <Link href={`/login?next=/join/${r.id}`} className="underline">운영진 로그인</Link></p>
          </div>
        )}
        {r.status === "approved" && (
          <div className="grid gap-2">
            {admin && r.sheet === "ok" && <p className="text-sm text-muted">구글시트 회원 명단에도 추가했어요.</p>}
            {admin && r.sheet === "skipped" && <p className="text-sm text-muted">구글시트 자동 추가는 아직 설정되지 않아 시트에는 직접 적어 주세요.</p>}
            {admin && r.sheet === "failed" && <p className="text-sm text-[var(--bad)]">구글시트에 추가하지 못했어요. 시트에 직접 적어 주세요.</p>}
            <p className="text-sm text-muted">이제 로그인 화면에서 닉네임을 고르고 비밀번호를 정하면 돼요.</p>
            <Link href="/login" className="btn btn-primary justify-self-center">로그인하러 가기</Link>
          </div>
        )}
        {r.status === "rejected" && <p className="text-sm text-muted">{r.reason ? `운영진 메시지: ${r.reason}` : "운영진에게 문의해 주세요."}</p>}
      </section>
      <p className="text-center"><Link href="/login" className="btn btn-ghost text-sm">← 로그인 화면으로</Link></p>
    </main>
  );
}
