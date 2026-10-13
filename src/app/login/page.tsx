import { redirect } from "next/navigation";
import { currentUser, getMembers } from "@/lib/hub";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  if (await currentUser()) redirect(next.startsWith("/") ? next : "/");
  const members = (await getMembers()).map((m) => ({ nick: m.nick, hasPw: !!m.pw }));
  members.sort((a, b) => a.nick.localeCompare(b.nick, "ko"));
  // ‘운영진’ 관리 계정은 닉네임 목록에서 빼고, 아래 ‘운영진 모드’로 따로 들어간다
  const crew = members.filter((m) => m.nick !== "운영진");
  return (
    <main className="wrap grid gap-7" style={{ maxWidth: 420 }}>
      <header className="grid justify-items-center gap-3 pt-8 text-center">
        <span className="logo-mark lg" role="img" aria-label="R2U Run To Ulsan" />
        <h1 className="hub-h1">R2U 크루 입장</h1>
        <p className="text-sm text-muted">닉네임을 고르고 비밀번호를 입력하세요.<br />처음이라면 지금 정하는 비밀번호가 내 비밀번호가 돼요.</p>
      </header>
      <LoginForm members={crew} next={next} />
      <p className="text-xs text-muted text-center">명단에 닉네임이 없거나 비밀번호를 잊었다면 운영진에게 말해 주세요.</p>
    </main>
  );
}
