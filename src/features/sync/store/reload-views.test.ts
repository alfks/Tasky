// `applyRemote` 가 채택한 테이블별 재조회 배선 (T94_LAZY_BOUNDARY.md §D-10, profile.md R15).
import { beforeEach, describe, expect, it } from 'vitest';

import { setProfile } from '@/domain/profile/profile.rules';
import type { SyncTable } from '@/domain/sync/wire';
import { createSettings } from '@/domain/theme/settings.rules';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useProfileStore } from '@/features/profile';
import { reloadAdoptedViews } from '@/features/sync/store/reload-views';
import { fixedDeps } from '@/test/fixtures/deps';

const NONE: Record<SyncTable, number> = {
  todos: 0,
  categories: 0,
  focusSessions: 0,
  settings: 0,
  ddays: 0,
  diaryEntries: 0,
  routines: 0,
};
const deps = fixedDeps();
/** `SyncRuntime` 중 이 파일이 쓰는 조각 — 실제 프로필 스토어에 잇는다. */
const rt = { reloadProfile: () => useProfileStore.getState().reloadFromStorage() };

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  window.localStorage.clear();
  useProfileStore.setState({
    name: undefined,
    bio: undefined,
    avatar: undefined,
    status: 'ready',
    hydrated: true,
  });
});

describe('reloadAdoptedViews — settings 갈래 (profile.md R15)', () => {
  it('settings 를 채택했으면 프로필 스토어가 저장소에서 다시 읽는다', async () => {
    await getRepositories().settings.upsert(
      setProfile(createSettings(deps), { name: '다른 기기', bio: '', avatar: undefined }, deps),
    );
    await reloadAdoptedViews({ ...NONE, settings: 1 }, rt);
    expect(useProfileStore.getState().name).toBe('다른 기기');
  });

  it('settings 채택이 0 이면 프로필 스토어를 건드리지 않는다', async () => {
    await getRepositories().settings.upsert(
      setProfile(createSettings(deps), { name: '다른 기기', bio: '', avatar: undefined }, deps),
    );
    await reloadAdoptedViews({ ...NONE, categories: 1 }, rt);
    expect(useProfileStore.getState().name).toBeUndefined();
  });
});
