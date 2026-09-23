// 카테고리 접힘 상태 저장 (todo.md R22 — shell ui-prefs.test.ts 와 같은 방식으로 검증한다).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COLLAPSED_CATEGORIES_KEY,
  useCollapsedCategories,
} from '@/features/todo/hooks/useCollapsedCategories';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useCollapsedCategories', () => {
  it('기본은 펼침이다', () => {
    const { result } = renderHook(() => useCollapsedCategories());
    expect(result.current.isCollapsed('cat-1')).toBe(false);
  });

  it('토글하면 접히고, 다시 토글하면 펼쳐진다', () => {
    const { result } = renderHook(() => useCollapsedCategories());

    act(() => result.current.toggle('cat-1'));
    expect(result.current.isCollapsed('cat-1')).toBe(true);
    expect(result.current.isCollapsed('cat-2')).toBe(false);

    act(() => result.current.toggle('cat-1'));
    expect(result.current.isCollapsed('cat-1')).toBe(false);
  });

  it('접은 상태가 localStorage 에 남아 다음 마운트에서도 유지된다', () => {
    const { result, unmount } = renderHook(() => useCollapsedCategories());
    act(() => result.current.toggle('cat-1'));
    unmount();

    const remounted = renderHook(() => useCollapsedCategories());
    expect(remounted.result.current.isCollapsed('cat-1')).toBe(true);
  });

  it('깨진 JSON·이상한 타입은 빈 상태(전부 펼침)로 떨어진다', () => {
    window.localStorage.setItem(COLLAPSED_CATEGORIES_KEY, '{not json');
    expect(renderHook(() => useCollapsedCategories()).result.current.isCollapsed('cat-1')).toBe(
      false,
    );

    window.localStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify({ not: 'an array' }));
    expect(renderHook(() => useCollapsedCategories()).result.current.isCollapsed('cat-1')).toBe(
      false,
    );
  });

  it('localStorage 접근 자체가 throw 해도(사생활 보호 모드) 기본값으로 산다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useCollapsedCategories());
    expect(result.current.isCollapsed('cat-1')).toBe(false);
  });

  it('저장 실패는 조용히 넘긴다 — 이번 세션의 화면 상태는 그대로 바뀐다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useCollapsedCategories());

    expect(() => act(() => result.current.toggle('cat-1'))).not.toThrow();
    expect(result.current.isCollapsed('cat-1')).toBe(true);
  });
});
