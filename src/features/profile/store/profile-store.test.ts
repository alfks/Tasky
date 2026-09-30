// 스토어 액션 — 저장소·상태·미러 셋이 한 방향으로 움직이는지 (profile.md R7·R14·R15, ADR-0023 규칙 4).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setProfile } from '@/domain/profile/profile.rules';
import { createSettings, setAccentColor } from '@/domain/theme/settings.rules';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { parseProfileMirror, PROFILE_MIRROR_KEY } from '@/features/profile/store/profile-mirror';
import { createProfileStore } from '@/features/profile/store/profile-store';
import { fixedDeps } from '@/test/fixtures/deps';

const CORAL = '#FF8FA3';
const AVATAR = 'data:image/webp;base64,AAAA';
const deps = fixedDeps({ now: '2026-09-29T00:00:00.000Z' });

function mirror() {
  return parseProfileMirror(window.localStorage.getItem(PROFILE_MIRROR_KEY));
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  window.localStorage.clear();
});

describe('init — 미러 → 저장소 (R14)', () => {
  it('미러가 있으면 init 을 부르는 순간 **동기적으로** 이름이 상태에 있고 hydrated 다', () => {
    window.localStorage.setItem(PROFILE_MIRROR_KEY, JSON.stringify({ name: '밀리', bio: '소개' }));
    const store = createProfileStore(deps);
    void store.getState().init(); // await 하지 않는다 — 첫 렌더가 기다리지 않는다는 것이 규칙이다
    expect(store.getState().name).toBe('밀리');
    expect(store.getState().bio).toBe('소개');
    expect(store.getState().hydrated).toBe(true);
  });

  it('미러가 없으면 저장소 읽기가 끝날 때까지 hydrated 가 아니다 — 끝나면 폴백(전부 undefined)으로 hydrated', async () => {
    const store = createProfileStore(deps);
    const pending = store.getState().init();
    expect(store.getState().hydrated).toBe(false);
    await pending;
    expect(store.getState()).toMatchObject({ status: 'ready', hydrated: true, name: undefined });
    expect(mirror()).toEqual({});
  });

  it('저장소 값이 미러와 다르면 저장소가 이긴다(R14 — 미러는 캐시)', async () => {
    window.localStorage.setItem(PROFILE_MIRROR_KEY, JSON.stringify({ name: '옛 이름' }));
    await getRepositories().settings.upsert(
      setProfile(createSettings(deps), { name: '밀리', bio: '', avatar: AVATAR }, deps),
    );
    const store = createProfileStore(deps);
    await store.getState().init();
    expect(store.getState()).toMatchObject({ name: '밀리', avatar: AVATAR, bio: undefined });
    expect(mirror()).toEqual({ name: '밀리', avatar: AVATAR });
  });

  it('한 번만 돈다 — 두 번째 init 은 저장소를 다시 읽지 않는다', async () => {
    const store = createProfileStore(deps);
    await store.getState().init();
    await getRepositories().settings.upsert(
      setProfile(createSettings(deps), { name: '나중', bio: '', avatar: undefined }, deps),
    );
    await store.getState().init();
    expect(store.getState().name).toBeUndefined();
  });
});

describe('save — 새로 읽은 행 위에 쓴다 (R7, ADR-0023 규칙 4)', () => {
  it('테마가 먼저 바꾼 강조색이 살아남는다(캐시된 옛 행으로 덮지 않는다 — 회귀 방지)', async () => {
    const store = createProfileStore(deps);
    await store.getState().init(); // 행 없음 — 스토어는 아무것도 캐시하지 않는다
    // 다른 스토어(테마)가 그 사이 강조색을 바꿨다.
    await getRepositories().settings.upsert(setAccentColor(createSettings(deps), CORAL, deps));

    const ok = await store
      .getState()
      .save((settings) =>
        setProfile(settings, { name: '밀리', bio: '오늘도 한 칸씩', avatar: undefined }, deps),
      );

    expect(ok).toBe(true);
    const stored = await getRepositories().settings.get();
    expect(stored).toMatchObject({
      accentColor: CORAL,
      profileName: '밀리',
      profileBio: '오늘도 한 칸씩',
    });
    expect(store.getState()).toMatchObject({ name: '밀리', bio: '오늘도 한 칸씩', hydrated: true });
    expect(mirror()).toEqual({ name: '밀리', bio: '오늘도 한 칸씩' });
  });

  it('행이 없으면 만들어서 쓴다', async () => {
    const store = createProfileStore(deps);
    expect(await getRepositories().settings.get()).toBeUndefined();
    await store
      .getState()
      .save((s) => setProfile(s, { name: '밀', bio: '', avatar: undefined }, deps));
    expect((await getRepositories().settings.get())?.profileName).toBe('밀');
  });

  it('도메인이 던지면(상한 초과) false 이고 저장소·미러·상태가 그대로다', async () => {
    const store = createProfileStore(deps);
    const ok = await store
      .getState()
      .save((s) => setProfile(s, { name: '가'.repeat(21), bio: '', avatar: undefined }, deps));
    expect(ok).toBe(false);
    expect(store.getState().name).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_MIRROR_KEY)).toBeNull();
  });

  it('지운 사진은 상태에서도 사라진다(undefined 로 덮는다)', async () => {
    const store = createProfileStore(deps);
    await store.getState().save((s) => setProfile(s, { name: '', bio: '', avatar: AVATAR }, deps));
    expect(store.getState().avatar).toBe(AVATAR);
    await store
      .getState()
      .save((s) => setProfile(s, { name: '', bio: '', avatar: undefined }, deps));
    expect(store.getState().avatar).toBeUndefined();
    expect(mirror()).toEqual({});
  });
});

describe('reloadFromStorage — 풀 채택 뒤 다시 읽기 (R15)', () => {
  it('느린 init 이 먼저 시작해도 나중에 채택한 원격 값을 덮지 않는다', async () => {
    const repository = getRepositories().settings;
    let finishInit: (value: Awaited<ReturnType<typeof repository.get>>) => void = () => {};
    vi.spyOn(repository, 'get').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInit = resolve;
        }),
    );
    const store = createProfileStore(deps);
    const initialRead = store.getState().init();
    await repository.upsert(
      setProfile(createSettings(deps), { name: '다른 기기', bio: '', avatar: AVATAR }, deps),
    );
    await store.getState().reloadFromStorage();
    finishInit(undefined);
    await initialRead;

    expect(store.getState()).toMatchObject({ status: 'ready', name: '다른 기기', avatar: AVATAR });
    expect(mirror()).toEqual({ name: '다른 기기', avatar: AVATAR });
  });

  it('원격 재조회 실패 뒤 loading 에 갇히지 않고 다음 재조회에서 회복한다', async () => {
    const repository = getRepositories().settings;
    let finishInit: (value: Awaited<ReturnType<typeof repository.get>>) => void = () => {};
    vi.spyOn(repository, 'get')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInit = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('read failed'));
    const store = createProfileStore(deps);
    const initialRead = store.getState().init();
    await store.getState().reloadFromStorage();
    finishInit(undefined);
    await initialRead;
    expect(store.getState()).toMatchObject({ status: 'error', hydrated: true });

    await repository.upsert(
      setProfile(createSettings(deps), { name: '복구', bio: '', avatar: undefined }, deps),
    );
    await store.getState().reloadFromStorage();
    expect(store.getState()).toMatchObject({ status: 'ready', name: '복구' });
  });

  it('저장소의 새 값으로 상태·미러가 바뀐다', async () => {
    const store = createProfileStore(deps);
    await store.getState().init();
    await getRepositories().settings.upsert(
      setProfile(createSettings(deps), { name: '다른 기기', bio: '', avatar: undefined }, deps),
    );
    await store.getState().reloadFromStorage();
    expect(store.getState().name).toBe('다른 기기');
    expect(mirror()).toEqual({ name: '다른 기기' });
  });
});

describe('forgetLocal — 로컬 삭제와 함께 (R13·R14)', () => {
  it('미러를 지우고 상태를 초기값으로 되돌린다 — 다음 init 이 다시 읽는다', async () => {
    window.localStorage.setItem(
      PROFILE_MIRROR_KEY,
      JSON.stringify({ name: '밀리', avatar: AVATAR }),
    );
    const store = createProfileStore(deps);
    await store.getState().init();
    store.getState().forgetLocal();
    expect(window.localStorage.getItem(PROFILE_MIRROR_KEY)).toBeNull();
    expect(store.getState()).toMatchObject({
      status: 'idle',
      hydrated: false,
      name: undefined,
      avatar: undefined,
    });
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
  });
});

describe('parseProfileMirror', () => {
  it('손상·다른 모양은 undefined, 문자열 아닌 필드는 버린다', () => {
    expect(parseProfileMirror(null)).toBeUndefined();
    expect(parseProfileMirror('{')).toBeUndefined();
    expect(parseProfileMirror('[]')).toBeUndefined();
    expect(parseProfileMirror('{"name":1,"bio":"소개"}')).toEqual({ bio: '소개' });
    // avatar 는 R5 형식만 — `http://` 가 미러를 타고 img src 가 되지 않게(리뷰 A-m2).
    expect(parseProfileMirror('{"avatar":"http://evil.example/a.png"}')).toEqual({});
    expect(parseProfileMirror('{"avatar":"data:image/webp;base64,AAAA"}')).toEqual({
      avatar: 'data:image/webp;base64,AAAA',
    });
  });
});
