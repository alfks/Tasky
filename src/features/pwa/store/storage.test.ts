import { describe, expect, it, vi } from 'vitest';

import { PWA_MEMORY_KEY } from '@/features/pwa/store/pwa-state';
import {
  readEstimate,
  readMemory,
  requestPersistence,
  writeMemory,
  type StorageEnv,
} from '@/features/pwa/store/storage';

const env = (manager: Partial<StorageManager> | null, memory: Storage | null = null): StorageEnv =>
  ({ manager, memory }) as StorageEnv;

describe('requestPersistence', () => {
  it('승인되면 granted', async () => {
    await expect(requestPersistence(env({ persist: async () => true }))).resolves.toBe('granted');
  });

  it('거부는 정상 경로다 — 조용히 넘기지 않고 denied 로 드러낸다', async () => {
    await expect(requestPersistence(env({ persist: async () => false }))).resolves.toBe('denied');
  });

  it('API 가 아예 없으면 unsupported', async () => {
    await expect(requestPersistence(env(null))).resolves.toBe('unsupported');
    await expect(requestPersistence(env({}))).resolves.toBe('unsupported');
  });

  it('호출이 throw 해도 앱을 멈추지 않고 unsupported 로 접는다', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('보안 정책'));
    await expect(requestPersistence(env({ persist }))).resolves.toBe('unsupported');
  });
});

describe('readEstimate', () => {
  it('숫자 두 개를 읽는다', async () => {
    const estimate = async () => ({ usage: 10, quota: 100 });
    await expect(readEstimate(env({ estimate }))).resolves.toEqual({ usage: 10, quota: 100 });
  });

  it.each<[string, Partial<StorageManager> | null]>([
    ['manager 없음', null],
    ['estimate 없음', {}],
    ['값이 비어 있음(브라우저가 안 준다)', { estimate: async () => ({}) }],
  ])('%s 이면 null 이다', async (_label, manager) => {
    await expect(readEstimate(env(manager))).resolves.toBeNull();
  });

  it('호출이 throw 해도 null 이다', async () => {
    const estimate = vi.fn().mockRejectedValue(new Error('거부'));
    await expect(readEstimate(env({ estimate }))).resolves.toBeNull();
  });
});

/** 사생활 보호 모드에서 접근 자체가 throw 하는 localStorage. */
const throwingStorage = {
  getItem: () => {
    throw new Error('차단됨');
  },
  setItem: () => {
    throw new Error('차단됨');
  },
} as unknown as Storage;

describe('기기별 기억', () => {
  it('쓰고 읽는다', () => {
    const store = new Map<string, string>();
    const memory = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    writeMemory(env(null, memory), { persistAsked: true, noticeDismissed: false });
    expect(store.get(PWA_MEMORY_KEY)).toContain('persistAsked');
    expect(readMemory(env(null, memory))).toEqual({ persistAsked: true, noticeDismissed: false });
  });

  it('localStorage 가 없거나 막혀 있어도 throw 하지 않는다', () => {
    expect(readMemory(env(null, null))).toEqual({ persistAsked: false, noticeDismissed: false });
    expect(readMemory(env(null, throwingStorage))).toEqual({
      persistAsked: false,
      noticeDismissed: false,
    });
    expect(() =>
      writeMemory(env(null, throwingStorage), { persistAsked: true, noticeDismissed: true }),
    ).not.toThrow();
  });
});
