import type { Metadata } from 'next';

import { Providers } from '@/app/providers';
import { FONT_PRELOAD, THEME_INIT_SCRIPT } from '@/features/theme';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Tasky',
  description: '감성 투두·일정 관리 웹앱',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 을 여기서 박지 않는다(예전 "light" 고정이 tokens.css 의 시스템 다크 블록을 영영
    // 꺼 두고 있었다). 값은 아래 인라인 스크립트가 첫 페인트 전에 정하고, 스크립트가 못 돌면
    // 속성이 없는 상태로 남아 prefers-color-scheme 규칙이 그대로 산다(theme R6·R7).
    <html lang="ko">
      <head>
        {/* pwa R9: 현재 테마의 --color-bg. 값은 아래 스크립트가 테마에 맞춰 덮어쓰므로
         **스크립트보다 먼저** 나와야 한다(순서가 바뀌면 querySelector 가 못 찾는다). */}
        <meta name="theme-color" content="#FAFAFC" />
        {/* theme R13: 폰트 preload 1건. href 의 해시는 src/styles/fonts.css 가 단일 소스다. */}
        <link {...FONT_PRELOAD} />
        {/* 첫 페인트 테마 적용(theme R6·R11). 동기 스크립트라 <body> 가 그려지기 전에 끝난다 —
            async·defer·외부 파일로 바꾸면 다크 사용자가 흰 화면을 한 프레임 본다. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
