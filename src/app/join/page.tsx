import Link from "next/link";
import { requestJoin } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export const metadata = { title: "닉네임 만들기" };

export default function JoinPage() {
  return (
    <main className="wrap grid gap-5" style={{ maxWidth: 420 }}>
      <header className="grid gap-2 pt-6 text-center">
        <h1 className="hub-h1 hub-h1-lg">닉네임 만들기</h1>
        <p className="text-sm text-muted">쓰고 싶은 닉네임을 적고 요청하면 승인 링크가 만들어져요.<br />그 링크를 크루 카톡방에 보내면 운영진이 승인해 줘요.</p>
      </header>
      <ActionForm action={requestJoin} className="panel p-5 grid gap-4" keep>
        <label className="field">
          <span className="label">원하는 닉네임</span>
          <input name="nick" className="input" required minLength={2} maxLength={5} autoComplete="off" placeholder="2~5글자, 공백 없이" />
        </label>
        <Submit>승인 링크 만들기</Submit>
      </ActionForm>
      <p className="text-center"><Link href="/login" className="text-sm text-muted underline">← 로그인 화면으로</Link></p>
    </main>
  );
}
