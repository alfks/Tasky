// 읽기 조건: 빌드 설정(정적 추출·이미지)을 바꿀 때.
// 빌드는 Vinext(vinext build)가 이 파일을 그대로 읽는다(ADR-0010). 서비스워커 설정은 여기가 아니라
// serwist.config.js 에 있다 — @serwist/next 는 webpack 전제라 쓰지 않는다.
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // specs/pwa.md R3(오프라인 새로고침)의 전제 — 프리렌더 HTML 이 있어야 앱 셸을 프리캐시할 수 있다.
  // 서버 기능(route handler·server action·동적 라우트)이 0 이라 잃는 것이 없다.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
