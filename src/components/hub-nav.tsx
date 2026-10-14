import Link from "next/link";
import { currentUser, getMenu, isStaffAccount } from "@/lib/hub";
import { eventOpen } from "@/lib/event";
import { pendingJoinCount } from "@/lib/join";
import { listNickChangeRequests } from "@/lib/nickname";

// iOS 탭바 아이콘 (선 아이콘, currentColor)
const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  "/races": <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  "/monthly": <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  "/groupbuy": <><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
  "/bingo": <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" /></>,
  "/me": <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  "/admin": <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
};
const Icon = ({ href }: { href: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[href]}</svg>
);

export default async function HubNav() {
  const u = await currentUser();
  if (!u) return null;
  const [menu, open, joinTodo, nickTodo] = await Promise.all([getMenu(), eventOpen(), u.admin ? pendingJoinCount() : Promise.resolve(0), u.admin ? listNickChangeRequests() : Promise.resolve([])]);
  const todo = joinTodo + nickTodo.length;
  // 운영진이 처리할 닉네임 생성·변경 요청 개수
  const TABS = [
    { href: "/", label: "홈" },
    { href: "/races", label: menu.races },
    { href: "/monthly", label: menu.monthly },
    { href: "/groupbuy", label: menu.groupbuy },
    // 이벤트 아이콘은 모두에게 보인다. 오픈 전에는 운영진만 실제 화면, 크루원은 "기대해주세요" 안내
    { href: "/bingo", label: menu.bingo },
    // 운영진 모드(관리용 계정)는 개인 페이지 대신 운영진 화면, 크루원은 내 페이지
    // 운영진으로 지정된 크루원은 내 페이지와 운영진 메뉴를 모두 본다 (PC·휴대폰 동일)
    ...(isStaffAccount(u) ? [{ href: "/admin", label: "운영진" }] : [{ href: "/me", label: `${u.nick}님` }, ...(u.admin ? [{ href: "/admin", label: "운영진" }] : [])]),
  ];
  const tab = (t: { href: string; label: string }) => {
    const badge = t.href === "/admin" && todo > 0 ? <b className="tab-badge" aria-label={`처리할 일 ${todo}건`}>{todo > 9 ? "9+" : todo}</b> : null;
    const inner = <><span className="tab-ico"><Icon href={t.href} />{badge}</span><span>{t.label}</span></>;
    // 이벤트는 새 창이 아니라 메뉴 아래에 보여 준다. 오픈 전 운영진은 미리보기 허용 주소를 거쳐 들어간다
    if (t.href === "/bingo") return <a key={t.href} href={open || !u.admin ? "/event" : "/api/event/preview"} data-tab={t.href}>{inner}</a>;
    return <Link key={t.href} href={t.href} data-tab={t.href}>{inner}</Link>;
  };
  // 위쪽 메뉴 한 줄만 둔다 (로고·로그인 표시 줄은 없앰, 로그아웃은 내 페이지에)
  return (
    <nav className="tabbar" aria-label="R2U 메뉴"><div className="tabbar-in">{TABS.map(tab)}</div></nav>
  );
}
