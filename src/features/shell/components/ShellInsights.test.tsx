// 인사이트 패널 섹션 순서 (app-shell.md R6): 집중 → 달성률 → 카테고리별 → D-day.
// 각 섹션의 내부 동작은 그 feature 의 테스트가 이미 본다 — 여기서 묻는 것은 순서와, 집중 섹션이
// "있을 때만" 그려지는지(사용자 결정 — 대기 중에는 메인 화면에서 사라진다) 둘이다.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ShellInsights } from '@/features/shell/components/ShellInsights';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
});

describe('섹션 순서 (R6)', () => {
  it('대기 중에는 집중 섹션이 없다 — 달성률 → 카테고리별 → D-day 순으로 그려진다', () => {
    render(<ShellInsights categories={[]} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    expect(headings).toEqual(['오늘 달성률', '카테고리별', 'D-day']);
  });

  it('집중 세션이 있으면 집중 → 달성률 → 카테고리별 → D-day 순으로 그려진다', () => {
    useTimerStore.setState({
      notice: { todoTitle: null, recordedSeconds: 60 },
    });
    render(<ShellInsights categories={[]} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    expect(headings).toEqual(['집중', '오늘 달성률', '카테고리별', 'D-day']);
  });
});
