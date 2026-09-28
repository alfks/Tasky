'use client';

// 로그인 화면 (sync.md §2 R1·R2). 표식이 없을 때 유일하게 보이는 화면 — 제목·한 줄 설명·버튼
// 하나뿐이다. `/auth/login` 은 302 로 구글로 넘어가는 평범한 내비게이션이라(worker/auth/handlers.ts
// `handleLogin`) 진짜 `<a>` 로 이동한다. 초대가 있을 때만 앱이 준 동기 beforeLogin을 실행한다.
import { useState } from 'react';

import { useSyncStore } from '@/features/sync/store/sync-store';

const NOTICE_TEXT: Record<'denied' | 'error' | 'signed-out', string> = {
  denied: '로그인이 취소됐어요. 다시 시도해 주세요.',
  error: '로그인 중 문제가 생겼어요. 다시 시도해 주세요.',
  // 리뷰 Major 3(user) — 세션 만료와 "다른 기기 모두 로그아웃" 둘 다 같은 경로(verifySession)로
  // 여기 온다. 어느 쪽인지 서버가 구분해 알려주지 않으니(범위 밖) 둘 다 아우르는 문구만 쓴다.
  'signed-out': '로그인이 풀렸어요. 세션이 만료되었거나 다른 기기에서 로그아웃했을 수 있어요.',
};

type LoginScreenProps = {
  beforeLogin?: (withoutInvite?: boolean) => boolean;
};

export function LoginScreen({ beforeLogin }: LoginScreenProps) {
  const online = useSyncStore((state) => state.online);
  const notice = useSyncStore((state) => state.loginNotice);
  const [inviteStorageFailed, setInviteStorageFailed] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[var(--space-5)] bg-surface px-[var(--space-4)] text-center text-text">
      <div className="flex flex-col gap-[var(--space-2)]">
        <h1 className="text-2xl font-bold">Tasky</h1>
        <p className="text-sm text-muted">하루를 카테고리 색으로 꾸미며</p>
      </div>

      {notice === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {NOTICE_TEXT[notice]}
        </p>
      )}

      {inviteStorageFailed ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-[var(--space-2)] text-sm text-danger"
        >
          <p>초대 정보를 보관하지 못했어요. 로그인 후 초대 링크를 다시 열어 주세요.</p>
          <a
            href="/auth/login"
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              if (beforeLogin?.(true) === false) event.preventDefault();
            }}
            className="font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            초대 없이 로그인
          </a>
        </div>
      ) : null}

      {online ? (
        <a
          href="/auth/login"
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            if (beforeLogin?.() === false) {
              event.preventDefault();
              setInviteStorageFailed(true);
            }
          }}
          className="flex h-[var(--control-height)] items-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-accent px-[var(--space-4)] text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true">G</span>
          <span>Google로 계속하기</span>
        </a>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="flex h-[var(--control-height)] items-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-accent px-[var(--space-4)] text-sm font-medium text-on-accent opacity-50"
          >
            <span aria-hidden="true">G</span>
            <span>Google로 계속하기</span>
          </button>
          <p className="text-sm text-muted">온라인이 되면 로그인할 수 있어요.</p>
        </>
      )}
    </div>
  );
}
