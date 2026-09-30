import type { ReactNode } from 'react';

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CategoryPublicationProvider } from '@/features/category/hooks/useCategoryPublication';
import { useCategoryRemoval } from '@/features/category/hooks/useCategoryRemoval';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useShellSocial } from '@/features/shell/hooks/useShellSocial';
import {
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';
import { makeCategory } from '@/test/fixtures/category';

vi.mock('@/features/todo', () => ({ useTodoStore: { getState: () => ({ date: null }) } }));
const initial = makeCategory({
  name: '원래 이름',
  visibility: 'public',
  socialCategoryId: 'a'.repeat(32),
  socialCategoryVersion: 3,
});
function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  resetSocialSessionForTest();
  const tables = createMemoryTables();
  tables.categories.rows.set(initial.id, initial);
  setRepositories(createMemoryRepositories(tables));
  useCategoryStore.setState({
    byId: { [initial.id]: initial },
    pendingRemoval: null,
    error: null,
    status: 'ready',
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetSocialSessionForTest();
});
function fixture(beforeRemove: () => Promise<boolean>) {
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const shell = useShellSocial(vi.fn(), vi.fn());
    return (
      <CategoryPublicationProvider bridge={{ ...shell.bridge, beforeRemove }}>
        {children}
      </CategoryPublicationProvider>
    );
  };
  const hook = renderHook(useCategoryRemoval, { wrapper: Wrapper });
  const request = async (category = initial) => {
    await act(async () => hook.result.current.requestRemove(category));
    expect(hook.result.current.target?.id).toBe(category.id);
  };
  return { hook, request };
}

describe('공유 철회 후 canonical 삭제와 오래된 UI 완료', () => {
  it('자기 revoked 뒤 삭제하고 undo해도 public 연결을 복원하지 않는다', async () => {
    const f = fixture(async () => {
      await useCategoryStore.getState().confirmAudience(initial.id, null);
      invalidateSocialSession('revoked');
      return true;
    });
    await f.request();
    await act(async () =>
      expect(await f.hook.result.current.confirm({ incomplete: 'delete' })).toBe(true),
    );
    expect(useCategoryStore.getState().byId[initial.id]).toBeUndefined();
    expect(useCategoryStore.getState().pendingRemoval?.category.visibility).toBe('private');
    expect(useCategoryStore.getState().pendingRemoval?.category.socialCategoryId).toBeUndefined();
    expect(f.hook.result.current.toast?.action?.label).toBe('되돌리기');
    await act(async () => {
      f.hook.result.current.toast?.action?.onAction();
    });
    const restored = useCategoryStore.getState().byId[initial.id];
    expect(restored.visibility).toBe('private');
    expect(restored.socialCategoryId).toBeUndefined();
    expect(restored.socialCategoryVersion).toBeUndefined();
  });

  it.each(['metadata', 'rebind'] as const)(
    '철회 대기 중 %s 변경은 새 확인을 요구하며 삭제/undo toast를 만들지 않는다',
    async (kind) => {
      const gate = deferred();
      const f = fixture(() => gate.promise);
      await f.request();
      let confirming!: Promise<boolean>;
      act(() => {
        confirming = f.hook.result.current.confirm({ incomplete: 'delete' });
      });
      const latest =
        kind === 'metadata'
          ? {
              ...initial,
              name: '다른 이름',
              visibility: 'private' as const,
              socialCategoryId: undefined,
              socialCategoryVersion: undefined,
            }
          : { ...initial, socialCategoryId: 'b'.repeat(32) };
      useCategoryStore.setState({ byId: { [latest.id]: latest } });
      await act(async () => {
        gate.resolve(true);
        expect(await confirming).toBe(false);
      });
      expect(useCategoryStore.getState().byId[latest.id]).toBe(latest);
      expect(useCategoryStore.getState().pendingRemoval).toBeNull();
      expect(f.hook.result.current.toast).toBeNull();
      expect(f.hook.result.current.error).toContain('다시 삭제');
    },
  );

  it('auth 대기 완료는 옛 대화상자만 정리하고 계정 상태/메모/toast를 쓰지 않는다', async () => {
    const gate = deferred();
    const f = fixture(() => gate.promise);
    await f.request();
    let confirming!: Promise<boolean>;
    act(() => {
      confirming = f.hook.result.current.confirm({ incomplete: 'delete' });
    });
    act(() => invalidateSocialSession('auth'));
    await act(async () => {
      gate.resolve(true);
      expect(await confirming).toBe(false);
    });
    expect(f.hook.result.current.target).toBeNull();
    expect(f.hook.result.current.removing).toBe(false);
    expect(f.hook.result.current.toast).toBeNull();
    expect(useCategoryStore.getState().byId[initial.id]).toBe(initial);
    expect(useCategoryStore.getState().pendingRemoval).toBeNull();
  });

  it('늦은 옛 완료는 새 삭제 대상/저장중 상태를 닫거나 바꾸지 않는다', async () => {
    const first = deferred();
    const second = deferred();
    const beforeRemove = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const f = fixture(beforeRemove);
    await f.request();
    let old!: Promise<boolean>;
    act(() => {
      old = f.hook.result.current.confirm({ incomplete: 'delete' });
    });
    act(() => invalidateSocialSession('account'));
    const next = makeCategory({ seq: 2, name: '새 계정 대상' });
    useCategoryStore.setState({ byId: { [next.id]: next } });
    await f.request(next);
    let current!: Promise<boolean>;
    act(() => {
      current = f.hook.result.current.confirm({ incomplete: 'delete' });
    });
    await act(async () => {
      first.resolve(true);
      expect(await old).toBe(false);
    });
    expect(f.hook.result.current.target).toBe(next);
    expect(f.hook.result.current.removing).toBe(true);
    expect(f.hook.result.current.toast).toBeNull();
    await act(async () => {
      second.resolve(false);
      expect(await current).toBe(false);
    });
  });
});
