'use client';

// 사이드바 맨 위 프로필 카드 (profile.md §2·R9~R11·R14, app-shell.md §2-A). 컬럼(`framed`)에서는 상시
// 카드, 드로어에서는 껍질 없이(app-shell R18). 진입 청크에 남는 것은 이 파일·스토어·`profile.rules`
// 뿐이고, 편집 대화상자(검증·사진 파이프라인)는 ✎ 를 처음 누를 때 받는 지연 청크다(BackupLauncher
// 와 같은 lazy() 패턴). `email` 은 셸이 동기화 스토어에서 읽어 내려준다 — 이 feature 는 `sync` 를
// import 하지 않는다(lazy-boundary §D-10: `sync-store` 가 이 feature 의 스토어를 `SyncRuntime` 에 담는다).
import { lazy, Suspense, useEffect, useState } from 'react';

import type { MetaDeps } from '@/domain/meta';
import {
  profileDisplayBio,
  profileDisplayName,
  profileInitial,
} from '@/domain/profile/profile.rules';

import { ProfileAvatar } from '@/features/profile/components/ProfileAvatar';
import { useProfileStore } from '@/features/profile/store/profile-store';

import { CARD_CLASS } from '@/components/ui/card-class';
import { IconButton } from '@/components/ui/IconButton';
import { pushToast } from '@/components/ui/Toast';

import { cn } from '@/lib/cn';
import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export const PROFILE_CARD_LABEL = '프로필';
export const PROFILE_EDIT_LABEL = '프로필 편집';
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
};

export function ProfileCard({ framed = true, email }: ProfileCardProps) {
  const name = useProfileStore((state) => state.name);
  const bio = useProfileStore((state) => state.bio);
  const avatar = useProfileStore((state) => state.avatar);
  const hydrated = useProfileStore((state) => state.hydrated);
  const init = useProfileStore((state) => state.init);
  const save = useProfileStore((state) => state.save);
  const [editing, setEditing] = useState(false);

  // 외부 저장소 읽기(code-style §3 이 금지하는 파생 상태 동기화가 아니다). 스토어가 한 번만 돈다.
  useEffect(() => {
    void init();
  }, [init]);

  const displayName = profileDisplayName(name, email);
  const displayBio = profileDisplayBio(bio);

  return (
    <section
      aria-label={PROFILE_CARD_LABEL}
      className={cn(
        'flex shrink-0 items-center gap-[var(--space-3)]',
        framed ? CARD_CLASS : 'px-[var(--space-2)]',
      )}
    >
      {/* R14: 미러도 저장소 값도 아직 없으면 텍스트·원을 그리지 않고 높이만 예약한다. */}
      {hydrated ? (
        <ProfileAvatar avatar={avatar} initial={profileInitial(displayName)} size={40} />
      ) : (
        <span aria-hidden="true" className="size-[40px] shrink-0" />
      )}
      <div className="flex min-h-[40px] min-w-0 flex-1 flex-col justify-center">
        {hydrated ? (
          <>
            <p className="truncate text-base font-semibold text-text">{displayName}</p>
            <p className="truncate text-sm text-muted">{displayBio ?? PROFILE_BIO_PLACEHOLDER}</p>
          </>
        ) : null}
      </div>
      <IconButton label={PROFILE_EDIT_LABEL} onClick={() => setEditing(true)}>
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
