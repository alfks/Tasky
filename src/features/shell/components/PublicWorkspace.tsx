import { lazy, Suspense } from 'react';

import { loadPublicScreen } from '@/features/social';

const PublicScreen = lazy(() =>
  loadPublicScreen().then((module) => ({ default: module.PublicScreen })),
);

export function PublicWorkspace() {
  return (
    <Suspense
      fallback={
        <main className="p-[var(--space-4)]">
          <p role="status">공개 기록을 불러오는 중</p>
        </main>
      }
    >
      <PublicScreen />
    </Suspense>
  );
}
