import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 테스트 모드(npm run test-day)는 별도 폴더를 써서 npm run dev 의 캐시(.next)와 섞이지 않게 한다 (섞이면 "reading 'call'" 오류가 난다)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // 개발 서버 화면 왼쪽 아래의 Next.js 표시(검은 동그라미)를 숨긴다
  devIndicators: false,
  // 개발 서버(npm run dev)를 같은 와이파이의 폰에서 열 때 허용할 주소 (배포 환경에는 영향 없음)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
  // 빙고는 정적 앱(public/bingo). index.html 안의 <base href="/bingo/"> 로 css/js 경로를 맞춘다.
  async rewrites() {
    return [{ source: "/bingo", destination: "/bingo/index.html" }];
  },
  // 예전 공구 주소(crew-groupbuy.vercel.app/r/…)로 들어와도 새 경로로 이어지게
  async redirects() {
    return [
      { source: "/r/:path*", destination: "/groupbuy/r/:path*", permanent: true },
      { source: "/new", destination: "/groupbuy/new", permanent: true },
      { source: "/staff", destination: "/groupbuy/staff", permanent: true },
    ];
  },
};

export default nextConfig;
