// 프로필의 **localStorage 첫 페인트 미러** (profile.md R14). 설정 행은 마운트 뒤 비동기로 읽히므로
// (테마 스토어와 같다) 마지막으로 읽은/저장한 세 값을 동기적으로 읽을 수 있는 자리에 복사해 둔다.
// **캐시일 뿐이고 저장소 값이 우선한다**(theme R8 과 같은 성격). 테마 미러와 다른 점: 로그아웃·계정
// 전환·계정 삭제의 로컬 삭제와 **함께 지운다**(`clearProfileMirror`, `auth-actions.ts#wipeLocalAndMirrors`)
// — 공용 PC 에 이름·사진이 남지 않게. 브라우저 저장소를 만지는 곳은 이 파일뿐이다.

import { isValidProfileAvatar } from '@/domain/profile/profile.rules';

/** 미러 키. 값은 `{ name?, bio?, avatar? }` JSON — 세 값 다 없으면 빈 객체. */
export const PROFILE_MIRROR_KEY = 'tasky.profile.v1';

export type ProfileMirror = {
  name?: string;
  bio?: string;
  avatar?: string;
};

/** 차단된 저장소·SSR 은 `undefined` — 미러 없이 간다. 세 함수가 이 하나로 실패를 삼킨다. */
function withStorage<T>(run: (storage: Storage) => T): T | undefined {
  try {
    return typeof window === 'undefined' ? undefined : run(window.localStorage);
  } catch {
    return undefined;
  }
}

/** 손상·구버전·다른 탭이 쓴 쓰레기여도 던지지 않고 `undefined`(미러 없음)로 본다. */
export function parseProfileMirror(raw: string | null): ProfileMirror | undefined {
  if (raw === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const mirror: ProfileMirror = {};
  for (const key of ['name', 'bio'] as const) {
    if (typeof record[key] === 'string') mirror[key] = record[key];
  }
  // 첫 페인트에 곧장 `img src` 가 된다 — R5 형식(data:image/webp|jpeg)만 받아 `http://…` 가 미러를 타고
  // 들어와도 외부 요청이 나가지 않게 한다(리뷰 A-m2). 검증은 진입 청크에 이미 있어 공짜다.
  if (typeof record['avatar'] === 'string' && isValidProfileAvatar(record['avatar'])) {
    mirror.avatar = record['avatar'];
  }
  return mirror;
}

export function readProfileMirror(): ProfileMirror | undefined {
  return withStorage((storage) => parseProfileMirror(storage.getItem(PROFILE_MIRROR_KEY)));
}

/** 저장소에서 읽은(또는 저장에 성공한) 값만 넣는다. 용량 초과·차단은 삼킨다 — 캐시라서. */
export function writeProfileMirror(mirror: ProfileMirror): void {
  withStorage((storage) => storage.setItem(PROFILE_MIRROR_KEY, JSON.stringify(mirror)));
}

/** 로컬 전량 삭제(R13)와 함께 부른다. */
export function clearProfileMirror(): void {
  withStorage((storage) => storage.removeItem(PROFILE_MIRROR_KEY));
}
