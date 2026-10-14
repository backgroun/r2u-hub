import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClickSound from "@/components/click-sound";
import HubNav from "@/components/hub-nav";
import AppBar from "@/components/app-bar";
import Toaster from "@/components/toaster";
import BadgeClear from "@/components/badge-clear";

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
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192" }, { url: "/icon-512.png", sizes: "512x512" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  // 카카오톡·메신저에 링크를 보냈을 때 뜨는 미리보기(썸네일)
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://crew-groupbuy.vercel.app"),
  openGraph: {
    type: "website", locale: "ko_KR", siteName: "R2U 크루", title: "R2U 크루", description: "R2U 러닝크루 통합 페이지: 대회 일정, 월간 기록, 공구, 이벤트",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "R2U Run To Ulsan" }],
  },
  twitter: { card: "summary_large_image", title: "R2U 크루", description: "R2U 러닝크루 통합 페이지", images: ["/og.png"] },
  // iOS 사파리가 숫자(기록·날짜·전화번호 꼴)를 멋대로 링크로 바꿔 hydration 오류를 내지 않게 한다
  formatDetection: { telephone: false, date: false, address: false, email: false },
  appleWebApp: { title: "R2U 크루", capable: true, statusBarStyle: "black-translucent" },
};

// 화면 모드(라이트/다크)와 상관없이 항상 어두운 디자인으로 보여 준다 (data-theme="dark" + 브라우저 기본 요소도 다크)
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "dark", themeColor: "#0f161d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" className={paperlogy.variable}>
      <head>
        {/* 본문 글꼴: 프리텐다드 (가변 글꼴, 필요한 글자만 나눠 받는 CDN) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* 대결 배너 제목용 아주 굵은 글꼴 (검은고딕) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <ClickSound />
        <BadgeClear />
        <AppBar />
        <Toaster />
        <HubNav />
        {children}
      </body>
    </html>
  );
}
