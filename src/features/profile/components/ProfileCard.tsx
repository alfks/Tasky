'use client';

// 검색 입구 아래·달력 위 프로필 카드 (profile.md §2·R9~R11·R14, app-shell.md §2-A). 진입 청크에 남는
// 것은 이 파일·스토어·`profile.rules` 뿐이고, 편집 대화상자(검증·사진 파이프라인)는 ✎ 를 처음 누를 때
// 받는 지연 청크다(BackupLauncher 와 같은 lazy() 패턴). `email` 은 셸이 동기화 스토어에서 읽어
// 내려준다 — 이 feature 는 `sync` 를 import 하지 않는다(lazy-boundary §D-10: `sync-store` 가 이
// feature 의 스토어를 `SyncRuntime` 에 담는다).
//
// 카드 본문(아바타 + 텍스트)은 **친구 화면 진입점**이다(R11-a, social.md §2). 셸이 `onOpenFriends`
// 를 내려주면 본문이 `button` 이 되고, 없으면(면이 없는 자리 등) 같은 모양의 `div` 다. ✎ 는 그
// 버튼의 **형제**다 — 버튼 안에 버튼을 중첩하지 않는다(§5). 친구 화면 자체(지연 청크·포커스
// 복귀)는 셸의 `openSocial` 이 그대로 맡는다 — 카드가 새로 아는 것은 없다.
import { lazy, Suspense, useEffect, useState } from 'react';

import type { MetaDeps } from '@/domain/meta';
import {
  profileDisplayBio,
  profileDisplayName,
  profileInitial,
} from '@/domain/profile/profile.rules';

import { AVATAR_SIZE_CLASS, ProfileAvatar } from '@/features/profile/components/ProfileAvatar';
import { useProfileStore } from '@/features/profile/store/profile-store';

import { CARD_CLASS } from '@/components/ui/card-class';
import { IconButton } from '@/components/ui/IconButton';
import { pushToast } from '@/components/ui/Toast';

import { cn } from '@/lib/cn';
import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export const PROFILE_CARD_LABEL = '프로필';
export const PROFILE_EDIT_LABEL = '프로필 편집';
/** 본문 버튼의 접근 이름(§5) — 친구 화면의 돌아오기 `[내 할 일로]` 와 짝이다. */
export const PROFILE_FRIENDS_LABEL = '친구 화면 열기';
/** 본문 아래 한 줄 힌트 — 누르면 무엇이 열리는지 눈으로도 읽힌다(R11-a). */
export const PROFILE_FRIENDS_HINT = '친구 기록 보기 ›';
/** 소개 미설정의 자리표시 문구 (R10) — 카드에만, 대화상자 입력칸의 placeholder 는 비운다. */
export const PROFILE_BIO_PLACEHOLDER = '한 줄 소개를 적어 보세요';
/** app-shell §2-C 개별 액션 실패 문구. 대화상자는 유지된다. */
export const PROFILE_SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

/**
 * 대화상자(지연 청크)에 prop 으로 건네는 시각·id 주입기. 대화상자가 `@/lib/date`·`@/lib/id`·스토어·
 * Toast 를 **직접** import 하면 rolldown 이 그 진입 모듈들(과 `settings.rules` 같은 의존)을 진입에서
 * 떼어 별도 청크로 갈라 진입 폐포가 오히려 커진다(실측 2026-09-29, +1.4 KB). 그래서 카드가 전부
 * 들고 넘긴다 — 지연 청크는 `profile.rules`·사진 파이프라인·자기 컴포넌트만 갖는다.
 */
const DEPS: MetaDeps = { now: nowIso, id: newId };

const LazyProfileDialog = lazy(async () => {
  const loaded = await import('@/features/profile/components/ProfileDialog');
  return { default: loaded.ProfileDialog };
});

type ProfileCardProps = {
  /** 카드 껍질(면·보더·그림자)을 스스로 그릴지. 드로어(이미 면이 있는 오버레이) 안에서는 `false`. */
  framed?: boolean;
  /** 로그인 이메일 — 이름 미설정일 때 `@` 앞부분을 보인다(R10, `SyncState.userEmail` 출처). */
  email: string | null;
  /** 본문을 누르면 친구 화면을 연다(셸의 `openSocial`). 없으면 본문은 버튼이 아니다. */
  onOpenFriends?: () => void;
};

const BODY_CLASS =
  'flex min-h-0 min-w-0 flex-1 items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] text-left';

export function ProfileCard({ framed = true, email, onOpenFriends }: ProfileCardProps) {
  const name = useProfileStore((state) => state.name);
  const bio = useProfileStore((state) => state.bio);
  const avatar = useProfileStore((state) => state.avatar);
  const hydrated = useProfileStore((state) => state.hydrated);
  const status = useProfileStore((state) => state.status);
  const init = useProfileStore((state) => state.init);
  const save = useProfileStore((state) => state.save);
  const [editing, setEditing] = useState(false);

  // 외부 저장소 읽기(code-style §3 이 금지하는 파생 상태 동기화가 아니다). 스토어가 `idle` 일 때만
  // 돈다 — 마운트 때 한 번, 그리고 셸이 선 채로 로컬을 지우는 두 경로(첫 로그인 "내보내고 지우기"·
  // 계정 전환) 뒤 `forgetLocal` 이 `idle` 로 되돌렸을 때 다시(리뷰 A-M1 — 그러지 않으면 카드가
  // 새로고침 전까지 빈 칸으로 남는다, R13·R14).
  useEffect(() => {
    if (status === 'idle') void init();
  }, [status, init]);

  const displayName = profileDisplayName(name, email);
  const displayBio = profileDisplayBio(bio);
  const size = framed ? 56 : 40;

  // R14: 미러도 저장소 값도 아직 없으면 텍스트·원을 그리지 않고 높이만 예약한다. 힌트 줄도 같이
  // 미룬다 — 빈 카드에 힌트 한 줄만 떠 있으면 그것이 곧 "깜빡임" 이다.
  const body = (
    <>
      {hydrated ? (
        <ProfileAvatar avatar={avatar} initial={profileInitial(displayName)} size={size} />
      ) : (
        <span aria-hidden="true" className={cn('shrink-0', AVATAR_SIZE_CLASS[size])} />
      )}
      <div className="flex min-h-[40px] min-w-0 flex-1 flex-col justify-center">
        {hydrated ? (
          <>
            <p className="truncate text-lg font-semibold text-text">{displayName}</p>
            <p className="line-clamp-2 text-sm text-muted">
              {displayBio ?? PROFILE_BIO_PLACEHOLDER}
            </p>
            {onOpenFriends === undefined ? null : (
              <p aria-hidden="true" className="mt-[var(--space-1)] truncate text-xs text-muted">
                {PROFILE_FRIENDS_HINT}
              </p>
            )}
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <section
      aria-label={PROFILE_CARD_LABEL}
      // 높이 하한은 토큰(`--profile-card-min-h`, tokens.css)이 갖는다 — 1열에서는 달력을 뺀 남는
      // 높이를 셸의 슬롯이 채워 주고(`ShellHeader` 의 `flex-1` 슬롯), 2영역 달력 컬럼에서는 하한만
      // 적용된다(app-shell R3 — 프로필을 뺀 달력 블록 ≤ 380 은 그대로).
      className={cn(
        'flex w-full max-w-full min-w-0 shrink-0 items-start gap-[var(--space-2)]',
        framed ? [CARD_CLASS, 'min-h-[var(--profile-card-min-h)]'] : 'px-[var(--space-2)]',
      )}
    >
      {onOpenFriends === undefined ? (
        <div className={BODY_CLASS}>{body}</div>
      ) : (
        <button
          type="button"
          aria-label={PROFILE_FRIENDS_LABEL}
          onClick={onOpenFriends}
          className={`${BODY_CLASS} self-stretch hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
        >
          {body}
        </button>
      )}
      {/* 읽기가 끝나기 전에 열면 빈 폼이 새로 읽은 행 위에 빈 값을 써 이름·사진을 지운다(R7) — 리뷰 B-m3. */}
      <IconButton label={PROFILE_EDIT_LABEL} disabled={!hydrated} onClick={() => setEditing(true)}>
        ✎
      </IconButton>
      {editing ? (
        <Suspense fallback={null}>
          <LazyProfileDialog
            email={email}
            initial={{ name, bio, avatar }}
            save={save}
            deps={DEPS}
            onClose={() => setEditing(false)}
            onSaveFailed={() => pushToast({ message: PROFILE_SAVE_FAILED })}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
