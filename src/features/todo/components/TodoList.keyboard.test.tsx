// 행 포커스 키·삭제 확인·편집 패널 (todo.md R6·R11·R13·R14, §5 포커스 복귀).
//
// 픽스처는 **비대칭**이다: 미완료 3건의 `order` 가 0·1·2 로 서로 다르고 완료 1건이 섞여 있어서,
// `Alt+↓` 를 "인덱스 +1" 로 잘못 구현하면(완료 항목을 세면) 화면에서 두 칸 움직인다.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TodoList } from '@/features/todo/components/TodoList';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

import { ToastViewport, dismissToast, useToasts } from '@/components/ui/Toast';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 카테고리: Category[] = [공부];

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', order: 0 });
const 영어 = makeTodo({ seq: 2, categoryId: 공부.id, title: '영어', order: 1 });
const 국어 = makeTodo({ seq: 3, categoryId: 공부.id, title: '국어', order: 2 });
const 과학 = makeTodo({
  seq: 4,
  categoryId: 공부.id,
  title: '과학',
  order: 3,
  done: true,
  doneAt: '2026-01-15T10:00:00.000Z',
});

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  for (const todo of [수학, 영어, 국어, 과학]) {
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
  }
});

/**
 * 전역 토스트 뷰포트. 앱에서는 셸이 한 번만 마운트한다(`ShellToasts`, app-shell R8) — 이 컴포넌트를
 * 단독으로 띄우는 테스트에서는 여기서 대신 세운다.
 */
function ToastHub() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

async function 화면() {
  render(
    <>
      <TodoList date={FIXTURE_DATE} categories={카테고리} />
      <ToastHub />
    </>,
  );
  await screen.findByRole('checkbox', { name: '수학' });
}

/** 제목으로 그 행(li)을 집는다. */
function 행(title: string): HTMLElement {
  const row = screen.getByRole('checkbox', { name: title }).closest('li');
  if (row === null) throw new Error(`${title} 행이 없다`);
  return row;
}

function 제목들(): string[] {
  return screen
    .getAllByRole('checkbox')
    .map(
      (box) =>
        document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
    );
}

describe('행 포커스 키 (§5)', () => {
  it('Space 로 완료를 토글한다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('수학').focus();
    await user.keyboard(' ');

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '수학' })).toBeChecked();
    });
  });

  it('Enter 로 편집 패널을 연다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('group', { name: '영어 편집' })).toBeInTheDocument();
  });

  it('Alt+↓ 는 한 칸 내리고 결과를 낭독한다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('수학').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => {
      expect(제목들()).toEqual(['영어', '수학', '국어', '과학']);
    });
    expect(screen.getByText('수학을 2번째로 옮겼어요')).toBeInTheDocument();
  });

  it('완료 항목에서 Alt+↑ 는 순서를 바꾸지 않고 이유를 낭독한다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('과학').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(await screen.findByText('완료된 항목은 순서를 바꿀 수 없어요')).toBeInTheDocument();
    expect(제목들()).toEqual(['수학', '영어', '국어', '과학']);
  });

  it('맨 위에서 Alt+↑ 는 더 옮길 곳이 없다고 알린다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('수학').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(await screen.findByText('더 옮길 곳이 없어요')).toBeInTheDocument();
  });

  it('편집 패널 안에서 친 Space·Backspace 는 행 단축키로 새지 않는다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' 추가{Backspace}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('checkbox', { name: '영어' })).not.toBeChecked();
  });
});

describe('삭제 확인 (R13)', () => {
  const 확인창 = (): HTMLElement => screen.getByRole('alertdialog');

  it('① 행에서 Delete 키', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Delete}');

    expect(within(확인창()).getByText("'영어'를 삭제할까요?")).toBeInTheDocument();
  });

  it('④ 행에서 Backspace 키 — Delete 와 같은 대화상자를 연다 (R13)', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Backspace}');

    expect(within(확인창()).getByText("'영어'를 삭제할까요?")).toBeInTheDocument();
  });

  it('② 메뉴 "삭제"', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));

    expect(확인창()).toBeInTheDocument();
  });

  it('③ 편집 패널의 [삭제]', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Enter}');
    await user.click(
      within(screen.getByRole('group', { name: '영어 편집' })).getByRole('button', {
        name: '삭제',
      }),
    );

    expect(확인창()).toBeInTheDocument();
  });

  it('취소하면 아무것도 지우지 않는다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Delete}');
    await user.click(within(확인창()).getByRole('button', { name: '취소' }));

    expect(screen.getByRole('checkbox', { name: '영어' })).toBeInTheDocument();
  });

  it('확인하면 지우고 토스트를 띄운다 — 되돌리기 버튼은 두지 않는다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Delete}');
    await user.click(within(확인창()).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '영어' })).toBeNull();
    });
    expect(screen.getByText('삭제했어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
  });
});

describe('삭제 뒤 포커스 복귀 (§5·app-shell R14)', () => {
  it('① 다음 형제 행으로 간다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('영어').focus();
    await user.keyboard('{Delete}');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(행('국어')).toHaveFocus();
    });
  });

  it('② 마지막 행이면 이전 형제 행으로 간다', async () => {
    const user = userEvent.setup();
    await 화면();

    행('과학').focus();
    await user.keyboard('{Delete}');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(행('국어')).toHaveFocus();
    });
  });

  it('③ 마지막 한 건이면 목록 컨테이너로 가고, 그룹은 추가 행만 남긴 채 빈 문구를 그리지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <>
        <TodoList date={FIXTURE_DATE} categories={카테고리} />
        <ToastHub />
      </>,
    );
    await screen.findByRole('checkbox', { name: '수학' });
    for (const title of ['수학', '영어', '국어', '과학']) {
      행(title).focus();
      await user.keyboard('{Delete}');
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }),
      );
      await waitFor(() => {
        expect(screen.queryByRole('checkbox', { name: title })).toBeNull();
      });
    }

    const list = screen.getByRole('list', { name: '공부 할 일' });
    expect(list).toHaveFocus();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // 그룹에 남는 것은 추가 행 하나뿐이다.
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: '+ 할 일 추가' })).toBeInTheDocument();
  });

  it('어느 경로에서도 포커스가 body 로 떨어지지 않는다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
  });
});

describe('편집 패널 (R14·R12)', () => {
  it('제목을 고치고 Enter 로 저장한다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    const panel = screen.getByRole('group', { name: '영어 편집' });
    await user.clear(within(panel).getByLabelText('제목'));
    await user.type(within(panel).getByLabelText('제목'), '영어 듣기{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '영어 듣기' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('group', { name: /편집/u })).toBeNull();
  });

  it('메모는 맨 Enter 로 저장되지 않고 Mod+Enter 로 저장된다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    const memo = within(screen.getByRole('group', { name: '영어 편집' })).getByLabelText('메모');
    await user.type(memo, '듣기{Enter}쓰기');
    expect(screen.getByRole('group', { name: '영어 편집' })).toBeInTheDocument();

    await user.type(memo, '{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: /편집/u })).toBeNull();
    });
    expect(screen.getByText('듣기')).toBeInTheDocument();
  });

  it('Esc 는 확인 없이 취소하고 원래 제목을 남긴다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    await user.type(
      within(screen.getByRole('group', { name: '영어 편집' })).getByLabelText('제목'),
      '!!{Escape}',
    );

    expect(screen.queryByRole('group', { name: /편집/u })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '영어' })).toBeInTheDocument();
  });

  it('제목 조합 중 Enter 는 저장하지 않는다 (R4)', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    const panel = screen.getByRole('group', { name: '영어 편집' });
    const title = within(panel).getByLabelText('제목');
    await user.clear(title);
    await user.type(title, '영어 듣기');
    fireEvent.keyDown(title, { key: 'Enter', isComposing: true });

    await Promise.resolve();
    expect(screen.getByRole('group', { name: '영어 편집' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '영어' })).toBeInTheDocument();
  });

  it('메모 조합 중 Mod+Enter 도 저장하지 않는다 (R4)', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    const memo = within(screen.getByRole('group', { name: '영어 편집' })).getByLabelText('메모');
    await user.type(memo, '듣기');
    fireEvent.keyDown(memo, { key: 'Enter', ctrlKey: true, isComposing: true });

    await Promise.resolve();
    expect(screen.getByRole('group', { name: '영어 편집' })).toBeInTheDocument();
  });

  it('조합 중 Esc 는 편집을 닫지 않는다 (R4)', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    const title = within(screen.getByRole('group', { name: '영어 편집' })).getByLabelText('제목');
    fireEvent.keyDown(title, { key: 'Escape', isComposing: true });

    expect(screen.getByRole('group', { name: '영어 편집' })).toBeInTheDocument();
  });

  it('편집 패널은 한 번에 하나만 열린다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '영어' }));
    await user.click(screen.getByRole('button', { name: '국어' }));

    expect(screen.getAllByRole('group', { name: /편집/u })).toHaveLength(1);
    expect(screen.getByRole('group', { name: '국어 편집' })).toBeInTheDocument();
  });
});

// 패널은 `onClose()` 로 언마운트될 뿐이라, 돌아갈 곳을 정해 두지 않으면 **네 경로 전부**에서
// 포커스가 `<body>` 로 떨어진다(Chromium 실측 — 리뷰 Major-1). 그러면 다음 `Tab` 이 문서 처음으로
// 돌아간다. 한 경로만 고쳐도 나머지 셋이 남으므로 네 개를 각각 고정한다.
describe('편집 패널을 닫은 뒤 포커스 (§5·app-shell R14)', () => {
  /** 편집 패널을 열고 그 패널을 돌려준다. */
  async function 패널열기(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: '영어' }));
    return screen.getByRole('group', { name: '영어 편집' });
  }

  /** 편집하던 항목의 제목 버튼 = 돌아가야 할 자리. */
  function 제목버튼(name: string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  it('① Esc 로 닫으면 그 항목의 제목 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    await 화면();

    const panel = await 패널열기(user);
    await user.type(within(panel).getByLabelText('제목'), '{Escape}');

    await waitFor(() => {
      expect(제목버튼('영어')).toHaveFocus();
    });
    expect(document.activeElement).not.toBe(document.body);
  });

  it('② [취소] 로 닫아도 같은 자리로 돌아온다', async () => {
    const user = userEvent.setup();
    await 화면();

    const panel = await 패널열기(user);
    await user.click(within(panel).getByRole('button', { name: '취소' }));

    await waitFor(() => {
      expect(제목버튼('영어')).toHaveFocus();
    });
  });

  it('③ [저장] 으로 닫으면 고친 제목의 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    await 화면();

    const panel = await 패널열기(user);
    await user.clear(within(panel).getByLabelText('제목'));
    await user.type(within(panel).getByLabelText('제목'), '영어 듣기');
    await user.click(within(panel).getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(제목버튼('영어 듣기')).toHaveFocus();
    });
  });

  it('④ 제목에서 Enter 로 저장해도 마찬가지다', async () => {
    const user = userEvent.setup();
    await 화면();

    const panel = await 패널열기(user);
    await user.clear(within(panel).getByLabelText('제목'));
    await user.type(within(panel).getByLabelText('제목'), '영어 쓰기{Enter}');

    await waitFor(() => {
      expect(제목버튼('영어 쓰기')).toHaveFocus();
    });
  });

  it('삭제 확인으로 닫힌 경우에는 대화상자가 정한 행선지를 빼앗지 않는다', async () => {
    const user = userEvent.setup();
    await 화면();

    const panel = await 패널열기(user);
    await user.click(within(panel).getByRole('button', { name: '삭제' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '영어' })).toBeNull();
    });
    expect(행('국어')).toHaveFocus();
  });
});
