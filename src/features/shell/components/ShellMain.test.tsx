// `ShellMain` — <680(compact, 1열) 전용 껍데기 (app-shell.md §2-A · R1 `main` · calendar-layout.md R8·R21).
//
// 본문(빈 상태 문구·목록·다이어리)의 진짜 규칙은 `DayPanelBody` 가 갖고 있고 `ShellDayPanel.test.tsx`
// 가 지킨다 — 여기서 묻는 것은 **이 껍데기가 그 본문을 실제로 감싸 넣는가** 하나다: 넘긴 `header` 가
// 고정 영역에 뜨는가, `main` 랜드마크 id 가 맞는가, 하단 고정 `[+ 할 일]` 표식이 붙는가.
import type { ComponentProps } from 'react';

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { useDiaryStore } from '@/features/diary';
import { BOTTOM_BAR_ATTR, SHELL_MAIN_ID, ShellMain } from '@/features/shell/components/ShellMain';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';

const TODAY = '2026-09-17' as DateKey;
const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  useDiaryStore.setState({
    date: null,
    entry: undefined,
    status: 'idle',
    error: null,
    pendingRemoval: null,
  });
});

async function mount(overrides: Partial<ComponentProps<typeof ShellMain>> = {}): Promise<void> {
  render(
    <ShellMain
      date={TODAY}
      categories={[STUDY]}
      categoriesPending={false}
      todosFirstLoading={false}
      failureCard={null}
      todosEmpty
      header={<p>머리글</p>}
      onCreateCategory={() => {}}
      showBottomAdd={false}
      {...overrides}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

describe('머리(header)와 본문 배선 (R1·R3)', () => {
  it('`main` 이 SHELL_MAIN_ID 를 갖고, 넘긴 header 가 고정 영역에 뜬다', async () => {
    await mount();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', SHELL_MAIN_ID);
    expect(screen.getByText('머리글')).toBeInTheDocument();
  });

  it('failureCard 가 있으면 header 를 그리지 않는다(§2-C 에러)', async () => {
    await mount({ failureCard: <p>문제가 생겼어요</p> });
    expect(screen.queryByText('머리글')).not.toBeInTheDocument();
    expect(screen.getByText('문제가 생겼어요')).toBeInTheDocument();
  });

  it('본문(DayPanelBody)이 실제로 안에 들어간다 — 빈 상태 문구가 보인다', async () => {
    await mount();
    expect(screen.getByText('오늘은 비어 있어요. 하나 적어 볼까요?')).toBeInTheDocument();
  });
});

describe('하단 고정 [+ 할 일] 표식 (§2-B)', () => {
  it('showBottomAdd 가 참이고 본문이 살아 있으면 표식이 붙는다', async () => {
    await mount({ showBottomAdd: true });
    expect(document.querySelector(`[${BOTTOM_BAR_ATTR}]`)).not.toBeNull();
  });

  it('showBottomAdd 가 거짓이면 표식이 없다', async () => {
    await mount({ showBottomAdd: false });
    expect(document.querySelector(`[${BOTTOM_BAR_ATTR}]`)).toBeNull();
  });
});
