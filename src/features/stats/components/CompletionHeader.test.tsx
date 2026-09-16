// 헤더 달성률 — 수치가 스크린리더까지 닿는지(§5), 100% 문구(R4), 빈 상태(§2).
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Todo } from '@/domain/todo/todo';

import { CompletionHeader } from '@/features/stats/components/CompletionHeader';
import { useTodoStore } from '@/features/todo';
import type { TodoLoadStatus } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });

/** 5개 중 3개 완료 — 두 수가 달라야 라벨에서 자리를 맞바꾼 실수가 드러난다. */
function partiallyDone(): Todo[] {
  return [1, 2, 3, 4, 5].map((seq) => makeTodo({ seq, categoryId: STUDY.id, done: seq <= 3 }));
}

function seed(todos: readonly Todo[], status: TodoLoadStatus = 'ready'): void {
  useTodoStore.setState({
    byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])),
    date: FIXTURE_DATE,
    status,
    error: null,
  });
}

beforeEach(() => {
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('CompletionHeader', () => {
  it('링이 그래픽만 남지 않고 퍼센트·완료 수까지 이름으로 읽힌다 (§5)', () => {
    seed(partiallyDone());

    render(<CompletionHeader />);

    expect(
      screen.getByRole('img', { name: '오늘 달성률 60퍼센트, 5개 중 3개 완료' }),
    ).toBeInTheDocument();
  });

  it('화면에는 퍼센트와 완료/전체가 함께 보인다 (색만으로 정보를 주지 않는다)', () => {
    seed(partiallyDone());

    render(<CompletionHeader />);

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('보이는 숫자는 접근성 트리에서 한 번만 읽힌다 (링 라벨과 중복 낭독 금지)', () => {
    seed(partiallyDone());

    const { container } = render(<CompletionHeader />);
    const visible = screen.getByText('60%');

    expect(visible).toHaveAttribute('aria-hidden', 'true');
    // 링 하나 외에 이름이 붙은 요소가 더 생기지 않았는지 — role 을 가진 노드는 링뿐이다.
    expect(container.querySelectorAll('[role]')).toHaveLength(1);
  });

  it('투두가 0개면 — 과 0 / 0 을 보여주고 링은 "오늘 할 일 없음"으로 읽힌다 (§2)', () => {
    seed([]);

    render(<CompletionHeader />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '오늘 할 일 없음' })).toBeInTheDocument();
  });

  it('조회에 실패하면 값이 남아 있어도 — 를 보여준다 (§2 에러)', () => {
    seed(partiallyDone(), 'error');

    render(<CompletionHeader />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
  });

  it('전부 완료했을 때만 축하 문구가 붙는다 (R4)', () => {
    seed(partiallyDone());
    const { unmount } = render(<CompletionHeader />);
    expect(screen.queryByText('다 했어요 🎉')).not.toBeInTheDocument();
    unmount();

    seed([1, 2, 3].map((seq) => makeTodo({ seq, categoryId: STUDY.id, done: true })));
    const { container } = render(<CompletionHeader />);

    expect(screen.getByText('다 했어요 🎉')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    // 보상 문구는 정보다 — 화면의 `<span>` 은 라이브 영역 밖이라 여기까지 와야 스크린리더에 닿는다.
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      '달성률 100%, 다 했어요',
    );
  });

  it('반올림이 100이 되어도 전부 완료가 아니면 99%다 (R2)', () => {
    seed(
      Array.from({ length: 200 }, (_, index) =>
        makeTodo({ seq: index + 1, categoryId: STUDY.id, done: index < 199 }),
      ),
    );

    render(<CompletionHeader />);

    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.queryByText('다 했어요 🎉')).not.toBeInTheDocument();
  });

  it('링 각도는 표시 퍼센트가 아니라 반올림 전 비율로 그린다 (R3)', () => {
    seed(
      Array.from({ length: 200 }, (_, index) =>
        makeTodo({ seq: index + 1, categoryId: STUDY.id, done: index < 199 }),
      ),
    );

    const { container } = render(<CompletionHeader />);
    const progress = container.querySelectorAll('circle')[1];
    const circumference = 2 * Math.PI * 18;

    // 99%(표시값)로 그렸다면 offset 은 circumference * 0.01 이다 — 0.995 와 확실히 갈린다.
    expect(Number(progress?.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * 0.005,
      6,
    );
  });

  it('값 변경을 알리는 aria-live 영역이 있다 (§5)', () => {
    seed(partiallyDone());

    const { container } = render(<CompletionHeader />);
    const live = container.querySelector('[aria-live="polite"]');

    expect(live).toHaveTextContent('달성률 60%');
  });
});
