// 생성/수정 다이얼로그 테스트 (category §2-B·§2-D, R1~R7·R9).
//
// **한글 IME**: 이름 입력은 조합이 일어나는 자리라, 조합 확정 Enter 가 "만들기"를 눌러서는 안 된다.
// 판정은 `@/lib/ime` + `Dialog` 가 하고(여기서 다시 구현하지 않는다) 이 테스트는 그 규칙이 실제
// 조합 이벤트에서 작동하는지 확인한다 — `isComposing` 과 `keyCode 229` 두 경로 모두.
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PALETTE } from '@/domain/theme/palette';

import { setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { CategoryFormDialog } from '@/features/category/components/CategoryFormDialog';
import { indexCategories } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { makeCategory } from '@/test/fixtures/category';

const [CORAL, PEACH] = PALETTE;
const 공부 = makeCategory({ seq: 1, name: '공부', order: 0, color: CORAL.light });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1, color: PEACH.light });

/** 저장소·스토어를 매 테스트 초기화한다(컴포넌트는 싱글턴 스토어를 쓴다). */
beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useCategoryStore.setState({
    byId: indexCategories([공부, 운동]),
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
});

/**
 * 대기 중인 저장(마이크로태스크 + 타이머)을 전부 흘려보낸다.
 * **"제출되지 않았다" 를 단언하기 전에 반드시 부른다** — 바로 단언하면 제출이 진행 중이어도 통과한다
 * (실제로 `isImeKey` 를 끄고 확인: flush 없이는 이 테스트가 통과해 버렸다).
 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** 현재 스토어에 있는 이름들 — 저장 결과를 한 줄로 단언한다. */
function names(): string[] {
  return Object.values(useCategoryStore.getState().byId).map((category) => category.name);
}

describe('만들기', () => {
  it('이름과 색을 고르면 카테고리가 만들어지고 다이얼로그가 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);

    await user.type(screen.getByLabelText('이름'), '독서');
    await user.click(screen.getByRole('radio', { name: '피치' }));
    await user.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(names()).toContain('독서');
    const 독서 = Object.values(useCategoryStore.getState().byId).find((c) => c.name === '독서');
    expect(독서?.color).toBe(PEACH.light);
    expect(독서?.order).toBe(2);
  });

  it('이모지를 함께 저장한다', async () => {
    const user = userEvent.setup();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('이모지'), '📚');
    await user.type(screen.getByLabelText('이름'), '독서');
    await user.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(names()).toContain('독서'));
    expect(
      Object.values(useCategoryStore.getState().byId).find((c) => c.name === '독서')?.emoji,
    ).toBe('📚');
  });

  it('빈 이름·중복 이름을 입력 아래 문구로 알리고 다이얼로그를 유지한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이름을 입력해 주세요');

    await user.type(screen.getByLabelText('이름'), '운동');
    await user.click(screen.getByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 이름이 이미 있어요');

    expect(onClose).not.toHaveBeenCalled();
    expect(names()).toEqual(['공부', '운동']);
  });

  it('저장이 실패하면 다이얼로그를 유지하고 다음 행동을 안내한다', async () => {
    const user = userEvent.setup();
    const repos = createMemoryRepositories();
    setRepositories({
      ...repos,
      categories: {
        ...repos.categories,
        upsert: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
      },
    } satisfies Repositories);
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);

    await user.type(screen.getByLabelText('이름'), '독서');
    await user.click(screen.getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('한글 조합 중의 Enter (app-shell R14)', () => {
  it('조합 중 Enter 는 제출하지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);
    const name = screen.getByLabelText('이름');
    await user.type(name, '독서');

    fireEvent.compositionStart(name);
    const composing = createEvent.keyDown(name, { key: 'Enter', isComposing: true });
    fireEvent(name, composing);
    const byKeyCode = createEvent.keyDown(name, { key: 'Enter', keyCode: 229 });
    fireEvent(name, byKeyCode);
    fireEvent.compositionEnd(name);
    await flush();

    expect(composing.defaultPrevented).toBe(true);
    expect(byKeyCode.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(names()).toEqual(['공부', '운동']);
  });

  it('조합이 끝난 Enter 는 제출한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);

    await user.type(screen.getByLabelText('이름'), '독서');
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'Enter' });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(names()).toContain('독서');
  });

  it('이모지 입력의 Enter 는 제출하지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'create' }} onClose={onClose} />);

    await user.type(screen.getByLabelText('이름'), '독서');
    fireEvent.keyDown(screen.getByLabelText('이모지'), { key: 'Enter' });
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(names()).toEqual(['공부', '운동']);
  });
});

describe('수정', () => {
  it('현재 값이 채워져 있고 이름·색을 바꿔 저장한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'edit', category: 공부 }} onClose={onClose} />);

    expect(screen.getByLabelText('이름')).toHaveValue('공부');
    expect(screen.getByRole('radio', { name: '코랄' })).toBeChecked();

    await user.clear(screen.getByLabelText('이름'));
    await user.type(screen.getByLabelText('이름'), '공부방');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(names()).toEqual(['공부방', '운동']);
    // 순서는 수정으로 바뀌지 않는다.
    expect(useCategoryStore.getState().byId[공부.id].order).toBe(0);
  });

  it('활성 카테고리는 완료·중단 두 갈래로 종료할 수 있다 (R7)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CategoryFormDialog open mode={{ kind: 'edit', category: 운동 }} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '중단으로 종료' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const saved = useCategoryStore.getState().byId[운동.id];
    expect(saved.status).toBe('paused');
    expect(saved.closedAt).toBeDefined();
    // 다른 카테고리는 건드리지 않는다.
    expect(useCategoryStore.getState().byId[공부.id].status).toBe('active');
  });

  it('종료된 카테고리는 재개 버튼을 준다 (R9)', async () => {
    const user = userEvent.setup();
    const closed = makeCategory({
      seq: 3,
      name: '요리',
      status: 'completed',
      closedAt: '2026-01-20T00:00:00.000Z',
      order: 2,
    });
    useCategoryStore.setState({ byId: indexCategories([공부, 운동, closed]) });
    render(<CategoryFormDialog open mode={{ kind: 'edit', category: closed }} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '완료로 종료' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '재개' }));

    await waitFor(() => expect(useCategoryStore.getState().byId[closed.id].status).toBe('active'));
    const resumed = useCategoryStore.getState().byId[closed.id];
    expect(resumed.closedAt).toBeUndefined();
    expect(resumed.order).toBe(2);
  });
});
