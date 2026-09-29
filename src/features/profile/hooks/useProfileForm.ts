// 편집 대화상자의 폼 상태 (profile.md §2·R1·R2·R7). 검증은 도메인 함수를 그대로 부르고(복제 금지),
// 저장은 카드가 넘긴 스토어 액션에 `setProfile` 변환을 건넨다 — 이 파일은 지연 청크(대화상자) 안에서만
// 산다. **스토어·`@/lib/*` 를 직접 import 하지 않는다**: 지연 청크가 진입 모듈을 정적으로 끌면 rolldown
// 이 그 모듈(과 그 의존 — `settings.rules` 등)을 진입에서 떼어 별도 청크로 만든다(실측, `ProfileCard`
// 머리주석). 카드(진입)가 `save`·`deps`·초기값을 prop 으로 준다.
import { useState } from 'react';

import type { MetaDeps, Persistable } from '@/domain/meta';
import {
  setProfile,
  validateProfileBio,
  validateProfileName,
} from '@/domain/profile/profile.rules';
import type { Settings } from '@/domain/theme/settings';

import { AVATAR_ERROR_MESSAGES, readAvatarFile } from '@/features/profile/lib/avatar-image';

export type ProfileFormInitial = {
  name: string | undefined;
  bio: string | undefined;
  avatar: string | undefined;
};

export type ProfileFormDeps = {
  initial: ProfileFormInitial;
  /** 스토어의 `save` — 새로 읽은 설정 행에 변환을 적용해 쓴다(R7). */
  save: (change: (settings: Settings) => Persistable<Settings>) => Promise<boolean>;
  deps: MetaDeps;
};

/**
 * `DomainError` 의 문구만 쓴다 — 코드가 아닌 예외(프로그래밍 오류)는 그대로 던진다. 클래스를 import 하지
 * 않고 `code` 필드로 판별한다(`@/domain/errors` 를 이 지연 청크가 정적으로 끌면 `meta` 청크 간선이 하나
 * 더 생긴다 — 번들 실측, `ProfileCard` 머리주석과 같은 이유).
 */
function messageOf(error: unknown): string {
  if (error instanceof Error && 'code' in error) return error.message;
  throw error;
}

export function useProfileForm({ initial, save, deps }: ProfileFormDeps) {
  const [name, setName] = useState(initial.name ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [avatar, setAvatar] = useState(initial.avatar);
  const [nameError, setNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 파일 선택 → 즉시 미리보기(아직 저장 전). 오류가 나도 이전 미리보기는 그대로다 (§2). */
  const pickPhoto = async (file: File): Promise<void> => {
    setReading(true);
    try {
      const result = await readAvatarFile(file);
      if (result.ok) {
        setAvatar(result.dataUrl);
        setPhotoError(null);
      } else {
        setPhotoError(AVATAR_ERROR_MESSAGES[result.error]);
      }
    } finally {
      setReading(false);
    }
  };

  const clearPhoto = (): void => {
    setAvatar(undefined);
    setPhotoError(null);
  };

  /** 제출 시에만 R1·R2 문구를 보인다(todo.md 제목과 같은 방식). `invalid` 는 칸 아래 문구로 끝난다. */
  const submit = async (): Promise<'saved' | 'invalid' | 'failed'> => {
    let valid = true;
    try {
      validateProfileName(name);
      setNameError(null);
    } catch (error) {
      setNameError(messageOf(error));
      valid = false;
    }
    try {
      validateProfileBio(bio);
      setBioError(null);
    } catch (error) {
      setBioError(messageOf(error));
      valid = false;
    }
    if (!valid) return 'invalid';

    setSaving(true);
    try {
      const ok = await save((settings) => setProfile(settings, { name, bio, avatar }, deps));
      return ok ? 'saved' : 'failed';
    } finally {
      setSaving(false);
    }
  };

  return {
    name,
    bio,
    avatar,
    nameError,
    bioError,
    photoError,
    reading,
    saving,
    setName: (value: string) => {
      setName(value);
      if (nameError !== null) setNameError(null);
    },
    setBio: (value: string) => {
      setBio(value);
      if (bioError !== null) setBioError(null);
    },
    pickPhoto,
    clearPhoto,
    submit,
  };
}
