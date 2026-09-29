// 투두 목록 화면 (todo.md §2-A·§2-C, R7·R9·R10·R13·R15·R16·R19).
//
// 픽스처는 **비대칭**이다: 공부 3건(완료 2, `order` 가 2·0·1 로 뒤섞임) · 운동 1건 · 요리(삭제된
// 카테고리) 1건 — 그룹마다 개수·완료 수·정렬 키가 달라서, 블록을 바꿔 넣거나 정렬을 빼면 화면이
// 달라진다. 완료 2건의 `doneAt` 도 `order` 와 **반대로** 두어 두 정렬 키를 섞으면 드러난다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CommandLayer } from '@/features/command';
import { TodoList } from '@/features/todo/components/TodoList';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

import { ToastViewport, dismissToast, useToasts } from '@/components/ui/Toast';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0, emoji: '📚', color: '#7cc6ff' });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1, color: '#a8e6b0' });
const 요리 = makeCategory({ seq: 3, name: '요리', order: 2 });
const 카테고리: Category[] = [공부, 운동];

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', order: 2 });
const 영어 = makeTodo({
  seq: 2,
  categoryId: 공부.id,
  title: '영어',
  order: 0,
  done: true,
  doneAt: '2026-01-15T09:00:00.000Z',
});
const 국어 = makeTodo({
  seq: 3,
  categoryId: 공부.id,
  title: '국어',
  order: 1,
  done: true,
  doneAt: '2026-01-15T11:00:00.000Z',
  memo: '문학 위주\n둘째 줄',
});
const 달리기 = makeTodo({ seq: 4, categoryId: 운동.id, title: '달리기', focusSeconds: 1500 });
const 김치 = makeTodo({ seq: 5, categoryId: 요리.id, title: '김치찌개', done: true });

const 투두들 = [수학, 영어, 국어, 달리기, 김치];

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  const repo = getRepositories().todos;
  for (const todo of 투두들) {
    await repo.upsert(todo as Persistable<Todo>);
  }
});

/**
 * 전역 토스트 뷰포트. 앱에서는 셸이 한 번만 마운트한다(`ShellToasts`, app-shell R8) — 이 컴포넌트를
 * 단독으로 띄우는 테스트에서는 여기서 대신 세운다.
 */
function ToastHub() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

function 화면() {
  // `CommandLayer` 는 셸(T-20)이 한 번 마운트한다 — 단축키 디스패처가 거기 있어서 함께 띄운다.
  return render(
    <>
      <CommandLayer />
      <TodoList date={FIXTURE_DATE} categories={카테고리} />
      <ToastHub />
    </>,
  );
}

/** 한 그룹 안의 행 제목을 화면 순서대로. 구분선·입력 행은 제목 버튼이 없어 빠진다. */
function 행들(그룹이름: string): string[] {
  const section = screen.getByRole('region', { name: 그룹이름 });
  return within(section)
    .getAllByRole('listitem')
    .flatMap((item) => {
      // 투두 행만 센다(입력 행·구분선 제외). 제목 버튼은 행에서 **유일하게 `aria-label` 이 없는**
      // 버튼이다 — 손잡이·⋯ 는 아이콘 버튼이라 이름을 속성으로 갖는다.
      if (within(item).queryByRole('checkbox') === null) return [];
      const title = within(item)
        .queryAllByRole('button')
        .find((button) => !button.hasAttribute('aria-label'));
      return title === undefined ? [] : [title.textContent ?? ''];
    });
}

async function 목록이보일때까지(): Promise<void> {
  await screen.findByRole('checkbox', { name: '수학' });
}

describe('배치 (R7·R15)', () => {
  it('미완료는 order 순, 완료는 doneAt 내림차순으로 아래에 둔다', async () => {
    화면();
    await 목록이보일때까지();

    // order 는 영어(0) → 국어(1) → 수학(2) 이지만 완료 둘은 아래로 내려가고,
    // 그 안에서는 늦게 완료한 국어(11시)가 영어(9시)보다 위다.
    expect(행들('공부')).toEqual(['수학', '국어', '영어']);
  });

  it('완료 항목이 있을 때만 "완료 n" 구분선을 둔다', async () => {
    화면();
    await 목록이보일때까지();

    expect(
      within(screen.getByRole('region', { name: '공부' })).getByRole('heading', { level: 3 }),
    ).toHaveTextContent('완료 2');
    expect(
      within(screen.getByRole('region', { name: '운동' })).queryByRole('heading', { level: 3 }),
    ).toBeNull();
  });

  it('그룹 헤더에 완료/전체를 그룹마다 따로 보여준다', async () => {
    화면();
    await 목록이보일때까지();

    expect(screen.getByRole('region', { name: '공부' })).toHaveTextContent('2/3');
    expect(screen.getByRole('region', { name: '운동' })).toHaveTextContent('0/1');
  });

  it('카테고리 이름 옆에 그 카테고리의 달성률을 퍼센트로 보여준다(사용자 결정 — 옛 인사이트 패널 카테고리별 막대에서 옮겨옴)', async () => {
    화면();
    await 목록이보일때까지();

    expect(screen.getByRole('region', { name: '공부' })).toHaveTextContent('67%');
    expect(screen.getByRole('region', { name: '운동' })).toHaveTextContent('0%');
  });

  it('활성 카테고리 order 순으로 그룹을 놓고 삭제된 카테고리는 맨 뒤에 둔다', async () => {
    화면();
    await 목록이보일때까지();

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      '공부',
      '운동',
      '삭제된 카테고리',
    ]);
  });
});

describe('표시 (R9·R19)', () => {
  it('완료 항목은 취소선이고 핸들이 없다', async () => {
    화면();
    await 목록이보일때까지();

    expect(screen.getByRole('button', { name: '영어' })).toHaveClass('line-through');
    expect(screen.getByRole('button', { name: '수학' })).not.toHaveClass('line-through');
    expect(screen.queryByRole('button', { name: /영어 순서 변경/u })).toBeNull();
    expect(screen.getByRole('button', { name: /수학 순서 변경/u })).toBeInTheDocument();
  });

  it('메모가 있으면 아이콘과 첫 줄 요약이, 집중 시간이 있으면 칩이 보인다', async () => {
    화면();
    await 목록이보일때까지();

    expect(screen.getByRole('img', { name: '메모 있음' })).toBeInTheDocument();
    expect(screen.getByText('문학 위주')).toBeInTheDocument();
    expect(screen.queryByText(/둘째 줄/u)).toBeNull();
    expect(screen.getByLabelText('집중 25분')).toHaveTextContent('⏱ 25분');
  });
});

describe('삭제된 카테고리 그룹 (R16)', () => {
  it('체크를 풀 수 없고 입력 행도 없다', async () => {
    화면();
    await 목록이보일때까지();
    const group = screen.getByRole('region', { name: '삭제된 카테고리' });

    expect(within(group).getByRole('checkbox', { name: '김치찌개' })).toBeDisabled();
    expect(within(group).getByRole('button', { name: '김치찌개' })).toBeDisabled();
    expect(within(group).queryByRole('button', { name: '+ 할 일 추가' })).toBeNull();
  });

  // 마우스 경로는 `disabled` 가 막지만 **행 포커스 `Space`**(§5)는 행이 직접 받는다 — 여기서
  // `readOnly` 가드가 빠지면 삭제된 카테고리의 완료 기록이 조용히 풀린다.
  it('행 포커스 Space 로도 완료가 풀리지 않는다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();
    const row = screen.getByRole('checkbox', { name: '김치찌개' }).closest('li');
    if (row === null) throw new Error('행이 없다');

    row.focus();
    await user.keyboard(' ');

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '김치찌개' })).toBeChecked();
    });
  });

  it('행 포커스 Enter 로 편집 패널이 열리지 않는다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();
    const row = screen.getByRole('checkbox', { name: '김치찌개' }).closest('li');
    if (row === null) throw new Error('행이 없다');

    row.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('group', { name: /편집/u })).toBeNull();
  });

  it('메뉴에는 옮기기와 삭제만 있다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(screen.getByRole('button', { name: '김치찌개 메뉴' }));

    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      '다른 카테고리로 옮기기',
      '삭제',
    ]);
  });

  it('다른 카테고리로 옮기면 그 그룹으로 간다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(screen.getByRole('button', { name: '김치찌개 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '다른 카테고리로 옮기기' }));
    await user.click(screen.getByRole('menuitem', { name: '📚 공부' }));

    await waitFor(() => {
      expect(행들('공부')).toContain('김치찌개');
    });
    expect(screen.queryByRole('region', { name: '삭제된 카테고리' })).toBeNull();
  });
});

describe('삭제된 카테고리의 이름·색 복원 (category R22)', () => {
  const 요리_툼스톤 = makeCategory({
    seq: 3,
    name: '요리',
    order: 2,
    color: '#ffd27c',
    deletedAt: '2026-01-16T00:00:00.000Z',
  });

  function 화면_툼스톤포함() {
    return render(
      <>
        <CommandLayer />
        <TodoList date={FIXTURE_DATE} categories={[공부, 운동, 요리_툼스톤]} />
        <ToastHub />
      </>,
    );
  }

  it('호출부가 tombstone 을 넘기면 일반 라벨 대신 실제 이름 "(삭제됨)" 과 색을 보여준다', async () => {
    화면_툼스톤포함();
    await 목록이보일때까지();

    expect(screen.queryByRole('region', { name: '삭제된 카테고리' })).toBeNull();
    const group = screen.getByRole('region', { name: '요리 (삭제됨)' });
    expect(within(group).getByText('김치찌개')).toBeInTheDocument();
    // 색 점만 인라인 `style` 을 갖는다 — 접기 토글(R22)의 아이콘도 `aria-hidden` 이라 속성으로 더 좁힌다.
    const dot = group.querySelector('span[aria-hidden="true"][style]');
    expect(dot).toHaveStyle({ backgroundColor: '#ffd27c' });
  });

  it('여전히 읽기 전용이다 — 체크를 풀 수 없다', async () => {
    화면_툼스톤포함();
    await 목록이보일때까지();

    expect(screen.getByRole('checkbox', { name: '김치찌개' })).toBeDisabled();
  });
});

describe('날짜 이동 (R10)', () => {
  it('"내일로" 는 목록에서 내리고 되돌리기 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(screen.getByRole('button', { name: '달리기 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '내일로' }));

    expect(await screen.findByText('1월 16일로 옮겼어요')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '달리기' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '되돌리기' }));

    expect(await screen.findByRole('checkbox', { name: '달리기' })).toBeInTheDocument();
  });

  it('옮긴 뒤 포커스가 body 로 떨어지지 않는다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(screen.getByRole('button', { name: '수학 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '내일로' }));

    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '수학' })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
  });
});

// 편집 패널의 날짜 필드는 네이티브 입력이 아니라 일 피커를 여는 버튼이다(R10-c). 피커에서 고르면
// 버튼 글자만 바뀌고, 저장은 [저장] 에서만 일어난다.
describe('편집 패널 날짜 필드 (R10-c)', () => {
  it('버튼 글자가 날짜이고, [내일] 을 고르면 글자만 바뀌며, [저장] 에서야 옮겨진다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(screen.getByRole('button', { name: '달리기 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '수정' }));
    const panel = screen.getByRole('group', { name: '달리기 편집' });
    const dateButton = within(panel).getByRole('button', { name: '날짜 1월 15일 (목)' });
    expect(within(panel).queryByDisplayValue(FIXTURE_DATE)).toBeNull();

    await user.click(dateButton);
    await screen.findByRole('grid', { name: '날짜 고르기' });
    // 편집 패널에서 연 피커에는 "옮길까요" 힌트가 없다.
    expect(screen.queryByText('어느 날로 옮길까요?')).toBeNull();
    // 피커의 "오늘" 은 실제 오늘이라 픽스처 날짜와 다를 수 있다 — 칸으로 고른다.
    await user.click(screen.getByRole('gridcell', { name: '1월 16일 금요일' }));

    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    expect(within(panel).getByRole('button', { name: '날짜 1월 16일 (금)' })).toHaveFocus();
    // 아직 저장 전 — 목록에 그대로 있고 저장소도 그대로다.
    expect(screen.getByRole('checkbox', { name: '달리기' })).toBeInTheDocument();
    expect((await getRepositories().todos.getById(달리기.id))?.date).toBe(FIXTURE_DATE);

    await user.click(within(panel).getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '달리기' })).toBeNull();
    });
    expect((await getRepositories().todos.getById(달리기.id))?.date).toBe('2026-01-16');
  });
});

describe('단축키', () => {
  it('N 은 첫 활성 카테고리의 입력 행을 연다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.keyboard('n');

    expect(screen.getByRole('textbox', { name: '공부에 할 일 추가' })).toHaveFocus();
  });
});

// `TodoAddRow` 단독 렌더로는 이 자리를 못 잡는다 — 검증 문구를 지우는 쪽이 `TodoList` 의 토스트
// effect 라, 둘을 **함께** 마운트한 조립 경로에서만 드러난다(리뷰 Major-2: false green).
describe('입력 행 검증 문구 (§2-C)', () => {
  /** 입력 행 아래의 `role="status"`. 그룹 안에 하나뿐이다. */
  function 문구(그룹이름: string): HTMLElement {
    return within(screen.getByRole('region', { name: 그룹이름 })).getByRole('status');
  }

  /** 그 그룹의 입력 행을 열고 `<input>` 을 돌려준다. */
  async function 입력행열기(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    const 공부그룹 = screen.getByRole('region', { name: '공부' });
    await user.click(within(공부그룹).getByRole('button', { name: '+ 할 일 추가' }));
    return screen.getByRole('textbox', { name: '공부에 할 일 추가' });
  }

  it('빈 제목으로 제출하면 필드 아래에 문구가 남고 aria-invalid 가 선다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    const input = await 입력행열기(user);
    await user.type(input, '   {Enter}');

    await waitFor(() => {
      expect(문구('공부')).toHaveTextContent('할 일을 입력해 주세요');
    });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // 검증 오류는 **인라인** 이다 — 토스트는 저장 실패용이라 여기서 뜨면 같은 말이 두 번 나온다.
    // 에러 토스트는 뷰포트의 assertive 영역(`role="alert"`)에 들어간다.
    expect(screen.getByRole('alert')).toHaveTextContent('');
  });

  it('다시 제출해 성공하면 문구가 사라진다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    const input = await 입력행열기(user);
    await user.type(input, '   {Enter}');
    await waitFor(() => {
      expect(문구('공부')).toHaveTextContent('할 일을 입력해 주세요');
    });

    await user.clear(input);
    await user.type(input, '한국사{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '한국사' })).toBeInTheDocument();
    });
    expect(문구('공부')).toHaveTextContent('');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('그룹 접기/펼치기 (R22)', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  /** 헤더의 접기/펼치기 토글. 접힌 채면 이름이 "펼치기", 펼친 채면 "접기" 다. */
  function 토글(그룹이름: string, 동작: '접기' | '펼치기' = '접기'): HTMLElement {
    return within(screen.getByRole('region', { name: 그룹이름 })).getByRole('button', {
      name: `${그룹이름} ${동작}`,
    });
  }

  it('기본은 펼쳐진 채라 항목이 보인다', async () => {
    화면();
    await 목록이보일때까지();

    expect(토글('공부')).toHaveAttribute('aria-expanded', 'true');
    expect(행들('공부')).toEqual(['수학', '국어', '영어']);
  });

  it('접으면 항목이 사라지고 완료/전체 카운트는 남는다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(토글('공부'));

    const group = screen.getByRole('region', { name: '공부' });
    expect(within(group).queryByRole('checkbox')).toBeNull();
    expect(group).toHaveTextContent('2/3');
    expect(within(group).getByRole('button', { name: '공부 펼치기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('다시 누르면 펼쳐진다 — 다른 그룹은 영향받지 않는다', async () => {
    const user = userEvent.setup();
    화면();
    await 목록이보일때까지();

    await user.click(토글('공부'));
    await user.click(토글('공부', '펼치기'));

    expect(행들('공부')).toEqual(['수학', '국어', '영어']);
    expect(행들('운동')).toEqual(['달리기']);
  });

  it('접은 상태가 새로고침(재마운트) 뒤에도 유지된다', async () => {
    const user = userEvent.setup();
    const { unmount } = 화면();
    await 목록이보일때까지();

    await user.click(토글('공부'));
    unmount();

    화면();
    await screen.findByRole('checkbox', { name: '달리기' });
    expect(within(screen.getByRole('region', { name: '공부' })).queryByRole('checkbox')).toBeNull();
  });
});
