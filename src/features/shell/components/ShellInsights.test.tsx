// 인사이트 패널 섹션 순서 (app-shell.md R6): 집중 → 달성률 → 카테고리별 → D-day → 단축키.
// 각 섹션의 내부 동작은 그 feature 의 테스트가 이미 본다 — 여기서 묻는 것은 순서 하나다.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ShellInsights } from '@/features/shell/components/ShellInsights';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
});

describe('섹션 순서 (R6)', () => {
  it('집중 → 달성률 → 카테고리별 → D-day 순으로 그려진다', () => {
    render(<ShellInsights categories={[]} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    expect(headings).toEqual(['집중', '오늘 달성률', '카테고리별', 'D-day']);
  });
});
