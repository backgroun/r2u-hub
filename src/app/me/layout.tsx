export default function Layout({ children }: { children: React.ReactNode }) {
  // 내 페이지 색조 (globals.css 의 data-tone)
  return <div data-tone="me">{children}</div>;
}
