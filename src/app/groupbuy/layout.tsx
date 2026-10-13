export default function Layout({ children }: { children: React.ReactNode }) {
  // 페이지별 배경 색조 (globals.css 의 data-tone)
  return <div data-tone="groupbuy">{children}</div>;
}
