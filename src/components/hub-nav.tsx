import Link from "next/link";
import { CrownIcon } from "@/components/crown";
import { currentUser, getMenu, isStaffAccount } from "@/lib/hub";
import { logout } from "@/app/actions";
import { eventOpen } from "@/lib/event";

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
  const [menu, open] = await Promise.all([getMenu(), eventOpen()]);
  const TABS = [
    { href: "/", label: "홈" },
    { href: "/races", label: menu.races },
    { href: "/monthly", label: menu.monthly },
    { href: "/groupbuy", label: menu.groupbuy },
    // 이벤트는 오픈일 전에는 운영진에게만 보인다
    ...(open || u.admin ? [{ href: "/bingo", label: menu.bingo }] : []),
    // 운영진 모드(관리용 계정)는 개인 페이지 대신 운영진 화면, 크루원은 내 페이지
    // 운영진으로 지정된 크루원은 내 페이지와 운영진 메뉴를 모두 본다 (PC·휴대폰 동일)
    ...(isStaffAccount(u) ? [{ href: "/admin", label: "운영진" }] : [{ href: "/me", label: "내 페이지" }, ...(u.admin ? [{ href: "/admin", label: "운영진" }] : [])]),
  ];
  const TOP = TABS;
  const tab = (t: { href: string; label: string }, withIcon: boolean) => {
    const inner = <>{withIcon && <Icon href={t.href} />}<span>{t.label}{!withIcon && t.href === "/bingo" ? " ↗" : ""}</span></>;
    // 오픈 전 운영진은 미리보기 허용 주소를 거쳐 들어간다
    return t.href === "/bingo"
      ? <a key={t.href} href={open ? t.href : "/api/event/preview"} target="_blank" rel="noopener" data-tab={t.href}>{inner}</a>
      : <Link key={t.href} href={t.href} data-tab={t.href}>{inner}</Link>;
  };
  return (
    <>
      {/* 위: 로고 · (PC) 메뉴 · 내 이름 */}
      <nav className="hubnav" aria-label="R2U 메뉴">
        <div className="hubnav-in">
          <Link href="/" className="hubnav-logo" aria-label="R2U 홈"><span className="logo-mark" /></Link>
          <div className="hubnav-tabs">{TOP.map((t) => tab(t, false))}</div>
          <form action={logout} className="hubnav-me">
            <Link href={isStaffAccount(u) ? "/admin" : "/me"} className="hubnav-nick">{isStaffAccount(u) ? "운영진 모드" : <>{u.admin && <CrownIcon size={12} />}{u.nick} 님</>}</Link>
            <button className="text-xs text-[var(--bib)]" type="submit">로그아웃</button>
          </form>
        </div>
      </nav>
      {/* 아래: 휴대폰 탭바 (iOS) */}
      <nav className="tabbar" aria-label="R2U 메뉴">{TABS.map((t) => tab(t, true))}</nav>
    </>
  );
}
