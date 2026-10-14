export default function Layout({ children }: { children: React.ReactNode }) {
  // 월간 기록과 같은 초록 색조 (globals.css 의 data-tone)
  return <div data-tone="crew">{children}</div>;
}
