export default function Layout({ children }: { children: React.ReactNode }) {
  // 대회 찾기는 대회 일정과 다른 색조 (globals.css 의 data-tone)
  return <div data-tone="find">{children}</div>;
}
