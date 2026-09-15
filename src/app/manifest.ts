// 읽기 조건: PWA 설치 정보(이름·색·아이콘)를 바꿀 때. 아이콘 파일은 public/ 에 있다.
import type { MetadataRoute } from 'next';

// specs/pwa.md R1 — Lighthouse "Installable" 조건.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tasky',
    short_name: 'Tasky',
    description: '감성 할 일·일정 관리 웹앱',
    lang: 'ko',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#7CC6FF',
    background_color: '#FAFAFC',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
