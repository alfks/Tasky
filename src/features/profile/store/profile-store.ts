// 프로필 스토어 (profile.md R7·R14·R15, ADR-0023 규칙 4). `Settings` 행의 세 필드를 읽고, 편집
// 대화상자가 넘긴 도메인 변환을 **저장소에서 새로 읽은 행** 위에 적용해 쓴다.
//
// **값 자체를 바꾸는 도메인 함수(`setProfile`)는 이 파일이 import 하지 않는다** — 지연 로드되는
// 대화상자가 `save((settings) => setProfile(settings, input, deps))` 로 넘긴다. 이 스토어는 사이드바
// 카드와 함께 진입 청크에 남으므로(카드가 첫 페인트에 쓴다) 검증·인코딩 코드를 여기서 정적으로
// 끌어오면 그대로 진입 예산을 먹는다(테마 스토어의 `save(change)` 와 같은 모양).
import { create } from 'zustand';

import type { MetaDeps, Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';
import { createSettings } from '@/domain/theme/settings.rules';

import { getRepositories } from '@/repositories/container';

import {
  clearProfileMirror,
  readProfileMirror,
  writeProfileMirror,
  type ProfileMirror,
} from '@/features/profile/store/profile-mirror';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export type ProfileLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ProfileState = ProfileMirror & {
  status: ProfileLoadStatus;
  /**
   * 카드가 텍스트·원을 그려도 되는가 (R14 — 미러가 있었거나 저장소 읽기가 끝났다). 거짓이면 카드는
   * 높이만 예약한다 — 폴백 문구(이메일 앞부분)가 매 기동마다 실제 값으로 바뀌며 깜빡이는 것을 막는다.
   */
  hydrated: boolean;
};

export type ProfileActions = {
  /** 미러 → 저장소 순. 미러가 있으면 **동기적으로** 상태에 넣는다(R14). 한 번만 돈다. */
  init: () => Promise<void>;
  /**
   * 저장소에서 새로 읽은 설정 행에 `change` 를 적용해 쓴다 (R7, ADR-0023 규칙 4). 성공하면 상태·미러를
   * 갱신하고 true. 실패(저장소·도메인 예외)는 false — 호출부가 토스트를 띄운다.
   */
  save: (change: (settings: Settings) => Persistable<Settings>) => Promise<boolean>;
  /** 동기화 풀이 설정 행을 채택했을 때 (R15). 못 읽으면 화면은 그대로 둔다. */
  reloadFromStorage: () => Promise<void>;
  /** 로컬 전량 삭제와 함께 (R13·R14) — 미러를 지우고 상태를 초기값으로 되돌린다. */
  forgetLocal: () => void;
};

export type ProfileStore = ProfileState & ProfileActions;

const initialState: ProfileState = { status: 'idle', hydrated: false };

const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/**
 * `Settings` 행 → 스토어가 드는 세 값. 없는 필드는 `undefined` 로 **덮어써** 지운 값이 남지 않게 한다
 * (`JSON.stringify` 는 `undefined` 를 빼므로 같은 객체가 그대로 미러가 된다).
 */
function fieldsOf(settings: Settings | undefined): ProfileMirror {
  return {
    name: settings?.profileName,
    bio: settings?.profileBio,
    avatar: settings?.profileAvatar,
  };
}

export function createProfileStore(deps: MetaDeps = defaultDeps) {
  return create<ProfileStore>()((set, get) => ({
    ...initialState,

    init: async () => {
      if (get().status !== 'idle') return;
      const mirror = readProfileMirror();
      set({
        status: 'loading',
        ...(mirror === undefined ? {} : { ...fieldsOf(undefined), ...mirror, hydrated: true }),
      });
      try {
        const fields = fieldsOf(await getRepositories().settings.get());
        set({ ...fields, status: 'ready', hydrated: true });
        writeProfileMirror(fields);
      } catch {
        // 미러가 있었으면 그대로 두고, 없었으면 이제야 폴백을 보여준다(읽기가 "끝났다").
        set({ status: 'error', hydrated: true });
      }
    },

    save: async (change) => {
      try {
        // 쓰기 경로에서만 행을 만든다 — 읽기(`init`·`reload`)는 행이 없으면 그냥 "미설정" 이다. 새로 만든
        // 기본 행은 따로 쓰지 않는다: `change` 의 결과가 곧 그 행이다(쓰기 한 번).
        const repository = getRepositories().settings;
        const next = change((await repository.get()) ?? createSettings(deps));
        await repository.upsert(next);
        const fields = fieldsOf(next);
        set({ ...fields, hydrated: true });
        writeProfileMirror(fields);
        return true;
      } catch {
        return false;
      }
    },

    reloadFromStorage: async () => {
      try {
        const fields = fieldsOf(await getRepositories().settings.get());
        set({ ...fields, hydrated: true });
        writeProfileMirror(fields);
      } catch {
        /* 원격 채택 뒤 재조회 실패 — 화면은 그대로, 다음 풀에서 다시 읽는다. */
      }
    },

    forgetLocal: () => {
      clearProfileMirror();
      set({ ...fieldsOf(undefined), ...initialState });
    },
  }));
}

/** 앱이 쓰는 단 하나의 프로필 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useProfileStore = createProfileStore();
