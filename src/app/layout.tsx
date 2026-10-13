import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClickSound from "@/components/click-sound";
import HubNav from "@/components/hub-nav";

// 페이퍼로지 (무료 폰트, 이주원) — 제목에만 쓴다. 본문은 프리텐다드
const paperlogy = localFont({
  src: [
    { path: "../fonts/Paperlogy-4Regular.woff2", weight: "400" },
    { path: "../fonts/Paperlogy-5Medium.woff2", weight: "500" },
    { path: "../fonts/Paperlogy-6SemiBold.woff2", weight: "600" },
    { path: "../fonts/Paperlogy-7Bold.woff2", weight: "700" },
    { path: "../fonts/Paperlogy-8ExtraBold.woff2", weight: "800" },
  ],
  variable: "--font-paper",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "R2U 크루", template: "%s · R2U" },
  description: "R2U 러닝크루 통합 페이지: 대회 일정, 월간 기록, 공구, 이벤트",
  icons: { icon: "/bingo/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={paperlogy.variable}>
      <head>
        {/* 본문 글꼴: 프리텐다드 (가변 글꼴, 필요한 글자만 나눠 받는 CDN) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <ClickSound />
        <HubNav />
        {children}
      </body>
    </html>
  );
}
