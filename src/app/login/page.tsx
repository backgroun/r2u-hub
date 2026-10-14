import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, getMembers, isStaffNick } from "@/lib/hub";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "로그인" };

// 입장할 때마다 무작위로 하나 보여 주는 러닝 명언
const QUOTES: { q: string; by?: string }[] = [
  { q: "고통은 피할 수 없지만, 괴로워할지는 선택이다.", by: "무라카미 하루키" },
  { q: "천 리 길도 한 걸음부터.", by: "노자" },
  { q: "느려도 괜찮아요. 멈추지만 않으면 돼요." },
  { q: "가장 어려운 일은 현관문을 나서는 일이에요." },
  { q: "어제의 나보다 1km 더." },
  { q: "뛰고 나서 후회한 적은 한 번도 없어요." },
  { q: "함께 달리면 더 멀리 갈 수 있어요." },
  { q: "오르막 다음엔 반드시 내리막이 와요." },
  { q: "마지막 1km는 다리가 아니라 마음으로 달려요." },
  { q: "포기하고 싶은 순간엔, 왜 시작했는지 떠올려 보세요." },
  { q: "페이스는 숫자일 뿐, 완주는 이야기가 돼요." },
  { q: "비 오는 날의 러닝이 가장 오래 기억에 남아요." },
  { q: "오늘의 한 걸음이 다음 대회의 완주를 만들어요." },
  { q: "작은 달리기가 쌓여 큰 변화를 만들어요." },
  { q: "숨이 차오를 때가 한 걸음 더 성장하는 때예요." },
  { q: "러닝화 끈을 묶는 순간, 오늘의 절반은 해낸 거예요." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  if (await currentUser()) redirect(next.startsWith("/") ? next : "/");
  const members = (await getMembers()).map((m) => ({ nick: m.nick, name: m.name?.trim() || "없음", hasPw: !!m.pw, admin: m.role === "admin", manager: !!m.manager }));
  members.sort((a, b) => a.nick.localeCompare(b.nick, "ko"));
  // ‘운영진’ 관리 계정은 닉네임 목록에서 빼고, 아래 ‘운영진 모드’로 따로 들어간다
  const crew = members.filter((m) => !isStaffNick(m.nick));
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  return (
    <main className="wrap grid gap-7" style={{ maxWidth: 420 }}>
      <header className="grid justify-items-center gap-3 pt-8 text-center">
        <span className="logo-mark xl" role="img" aria-label="R2U Run To Ulsan" />
        <h1 className="hub-h1 hub-h1-lg">R2U 크루 입장</h1>
        <blockquote className="login-quote keep-motion">
          <p>“{quote.q}”</p>
          {quote.by && <cite>— {quote.by}</cite>}
        </blockquote>
      </header>
      {/* 닉네임 목록 → 찾기 → 만들기 요청 → 안내 → (맨 아래) 운영진 모드 순서. 마지막 버튼은 LoginForm 안에 있다 */}
      <LoginForm members={crew} next={next}>
        <p className="text-center"><Link href="/join" className="btn btn-ghost text-sm">처음이세요? 닉네임 만들기 요청</Link></p>
        <div className="login-help">
          <p>닉넴/이름을 확인하고 비밀번호를 입력하세요.</p>
          <p>처음이라면 지금 정하는 비밀번호가 내 비밀번호가 돼요.</p>
          <p>명단에 닉네임이 없거나 비밀번호를 잊었다면 운영진에게 말해 주세요.</p>
        </div>
      </LoginForm>
    </main>
  );
}
