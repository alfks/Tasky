import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRepositories,
  getSocialRepository,
  getSyncTransport,
  setRepositories,
  setSocialRepository,
  setSyncTransport,
} from '@/repositories/container';
import { contractDeps, contractTodo } from '@/repositories/contract';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';

describe('container', () => {
  beforeEach(() => {
    setRepositories(createMemoryRepositories());
  });

  it('주입 전에는 throw 한다 — 조립 누락을 조기에 드러낸다', async () => {
    vi.resetModules();
    // 전역 셋업(src/test/setup.ts)이 이미 주입해 두므로, 주입 전 상태는 모듈을 새로 읽어야 볼 수 있다.
    const fresh = await import('@/repositories/container');

    expect(() => fresh.getRepositories()).toThrow();
  });

  it('주입한 묶음을 그대로 돌려준다', () => {
    const repositories = createMemoryRepositories();

    setRepositories(repositories);

    expect(getRepositories()).toBe(repositories);
  });

  it('아홉 저장소를 모두 노출한다 (엔티티 4 + dataset + dday + diaryEntries + routines + sync)', () => {
    expect(Object.keys(getRepositories()).sort()).toEqual([
      'categories',
      'dataset',
      'dday',
      'diaryEntries',
      'focusSessions',
      'routines',
      'settings',
      'sync',
      'todos',
    ]);
  });

  it('memory 묶음의 여섯 저장소(dday·diaryEntries 제외)는 같은 상태를 공유한다', async () => {
    const repositories = getRepositories();
    const todo = contractTodo(contractDeps());

    await repositories.dataset.write([{ table: 'todos', entity: todo }]);

    expect(await repositories.todos.getById(todo.id)).toBeDefined();
  });

  it('createMemoryRepositories() 는 호출마다 격리된 상태를 만든다', async () => {
    const todo = contractTodo(contractDeps());
    await getRepositories().todos.upsert(todo);

    expect(await createMemoryRepositories().todos.getById(todo.id)).toBeUndefined();
  });

  describe('동기화 트랜스포트 슬롯 (Repositories 와 별개)', () => {
    it('주입 전에는 throw 한다', async () => {
      vi.resetModules();
      const fresh = await import('@/repositories/container');

      expect(() => fresh.getSyncTransport()).toThrow();
    });

    it('주입한 트랜스포트를 그대로 돌려준다', () => {
      const transport = createMemorySyncTransport(createMemorySyncServer(), null);

      setSyncTransport(transport);

      expect(getSyncTransport()).toBe(transport);
    });
  });

  describe('온라인 소셜 슬롯 (개인 묶음과 별개)', () => {
    it('주입 전에는 throw 한다', async () => {
      vi.resetModules();
      const fresh = await import('@/repositories/container');
      expect(() => fresh.getSocialRepository()).toThrow();
    });

    it('주입한 포트만 돌려준다', () => {
      const social = { me: vi.fn() } as unknown as ReturnType<typeof getSocialRepository>;
      setSocialRepository(social);
      expect(getSocialRepository()).toBe(social);
      expect('social' in getRepositories()).toBe(false);
    });
  });
});
