// SPA 진입점(ADR-0013). `index.html` 의 <script type="module"> 이 이 파일을 가리킨다.
//
// 예전의 `layout.tsx` 가 하던 일은 둘로 갈렸다: <head> 는 `index.html` 이 정적으로 갖고, 조립·마운트는
// 여기가 한다. 조립 지점(`@/app/providers`)을 import 할 수 있는 파일은 여전히 **하나뿐**이고, 그게 이 파일이다
// (ADR-0006 규칙 6 — eslint.config.mjs 의 예외 블록이 파일명을 박아 강제한다).
import { lazy, StrictMode, Suspense } from 'react';

import { createRoot } from 'react-dom/client';

import { Page } from '@/app/page';
import { Providers, PublicProviders } from '@/app/providers';
import { isPublicRoute } from '@/app/social-route';
import { loadPublicWorkspace } from '@/features/shell';

import '@/styles/globals.css';

const PublicWorkspace = lazy(() =>
  loadPublicWorkspace().then((module) => ({ default: module.PublicWorkspace })),
);

// index.html 의 <div id="root"> 가 유일한 마운트 지점이다. 없으면 조용히 빈 화면이 되므로 여기서 멈춘다.
const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html 에 <div id="root"> 가 없습니다 — 마운트할 수 없습니다.');
}

createRoot(container).render(
  <StrictMode>
    {isPublicRoute(location.pathname) ? (
      <PublicProviders>
        <Suspense fallback={<p role="status">공개 기록을 불러오는 중</p>}>
          <PublicWorkspace />
        </Suspense>
      </PublicProviders>
    ) : (
      <Providers>
        <Page />
      </Providers>
    )}
  </StrictMode>,
);
