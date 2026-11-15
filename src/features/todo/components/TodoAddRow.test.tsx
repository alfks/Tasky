// 인라인 입력 행 (todo.md R3·R4·R5, §2-C 검증 오류).
//
// 픽스처는 **비대칭**이다: 같은 카테고리에 `order` 2 인 항목이 하나 있어서, 새 항목의 `order` 를
// "개수" 로 계산하면(0) 틀린 값이 나온다 — R5 는 "최대 + 1"(3) 이다.
import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TodoAddRow } from '@/features/todo/components/TodoAddRow';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

const 기존 = makeTodo({ seq: 1, title: '수학', order: 2 });

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({
    byId: { [기존.id]: 기존 },
    date: FIXTURE_DATE,
    status: 'ready',
    error: null,
  });
});

/**
 * 열림 상태를 **실제로 갈아끼우는** 껍데기로 띄운다. `open` 을 고정값으로 주면 컴포넌트가 닫으려
 * 해도 계속 열려 있어서 "저장 뒤에도 입력 행이 남는다"(R3) 가 검사되지 않는다 — 실제로 그 변이가
 * 살아남았던 자리다.
 */
function 행(처음열림 = true) {
  const onOpenChange = vi.fn();
  function Wrapper() {
    const [open, setOpen] = useState(처음열림);
    return (
      <TodoAddRow
        categoryId={FIXTURE_CATEGORY_ID}
        categoryName="공부"
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
      />
    );
  }
  const view = render(<Wrapper />);
  return { ...view, onOpenChange };
}

const 입력 = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: '공부에 할 일 추가' }) as HTMLInputElement;

/**
 * 첫 `upsert` 를 붙잡아 "저장 중" 창을 열어 둔다. 돌려받은 함수를 부르면 저장이 이어진다.
 * 실브라우저에서 창의 길이는 **한 번의 저장이 걸리는 시간**이라, 여기서는 그것을 손으로 잡는다.
 */
function 저장을붙잡는다(): () => void {
  const repositories = createMemoryRepositories();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const todos = {
    ...repositories.todos,
    upsert: async (entity: Parameters<typeof repositories.todos.upsert>[0]) => {
      if (first) {
        first = false;
        await gate;
      }
      return repositories.todos.upsert(entity);
    },
  };
  setRepositories({ ...repositories, todos });
  return () => {
    release();
  };
}

/** 방금 저장된 것들만(픽스처 제외). */
async function 저장된것(): Promise<Todo[]> {
  const all = await getRepositories().todos.listByDate(FIXTURE_DATE);
  return all.filter((todo) => todo.id !== 기존.id);
}

describe('추가 (R3·R5)', () => {
  it('Enter 로 저장하면 그룹 끝 order 를 받고 입력 행은 열린 채 비워진다', async () => {
    const user = userEvent.setup();
    행();

    await user.type(입력(), '영어{Enter}');

    await waitFor(async () => {
      expect(await 저장된것()).toHaveLength(1);
    });
    const [saved] = await 저장된것();
    expect(saved.title).toBe('영어');
    expect(saved.order).toBe(3); // 기존 최대(2) + 1 — "개수" 로 세면 0 이다.
    expect(입력()).toHaveValue('');
    expect(입력()).toHaveFocus();
  });

  it('연속으로 두 건을 넣을 수 있다 — 저장해도 입력 행이 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = 행();

    await user.type(입력(), '영어{Enter}');
    await waitFor(async () => {
      expect(await 저장된것()).toHaveLength(1);
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.type(입력(), '국어{Enter}');

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title).sort()).toEqual(['국어', '영어']);
    });
  });

  it('Esc 는 저장하지 않고 닫는다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = 행();

    await user.type(입력(), '영어{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await 저장된것()).toHaveLength(0);
  });

  it('텍스트가 남은 채 포커스가 빠지면 저장한다', async () => {
    const user = userEvent.setup();
    행();

    await user.type(입력(), '영어');
    await user.tab();

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title)).toEqual(['영어']);
    });
  });

  it('빈 채로 포커스가 빠지면 조용히 닫는다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = 행();

    입력().focus();
    await user.tab();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await 저장된것()).toHaveLength(0);
  });
});

describe('한글 IME (R4)', () => {
  it('조합 중 Enter 는 저장하지 않는다', async () => {
    const user = userEvent.setup();
    행();
    await user.type(입력(), '영어');

    fireEvent.keyDown(입력(), { key: 'Enter', isComposing: true });

    // 저장이 비동기라 한 바퀴 돌려 보고도 없어야 "안 했다" 가 성립한다.
    await Promise.resolve();
    expect(await 저장된것()).toHaveLength(0);
    expect(입력()).toHaveValue('영어');
  });

  it('isComposing 을 주지 않고 keyCode 229 만 주는 조합기에서도 저장하지 않는다', async () => {
    const user = userEvent.setup();
    행();
    await user.type(입력(), '영어');

    fireEvent.keyDown(입력(), { key: 'Enter', keyCode: 229 });

    await Promise.resolve();
    expect(await 저장된것()).toHaveLength(0);
  });

  it('조합 중 Esc 는 입력 행을 닫지 않는다 — 글자를 취소하는 키다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = 행();
    await user.type(입력(), '영어');

    fireEvent.keyDown(입력(), { key: 'Escape', isComposing: true });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('조합이 끝난 뒤의 Enter 는 저장한다', async () => {
    const user = userEvent.setup();
    행();
    await user.type(입력(), '영어');

    fireEvent.compositionEnd(입력());
    fireEvent.keyDown(입력(), { key: 'Enter' });

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title)).toEqual(['영어']);
    });
  });
});

describe('검증 오류 (§2-C)', () => {
  it('100자를 넘기면 문구를 보여주고 텍스트를 지우지 않는다', async () => {
    행();
    const input = 입력();
    // maxLength 를 우회해 붙여넣기와 같은 경로로 넣는다 — 검증은 제출 시점에 걸려야 한다.
    fireEvent.change(input, { target: { value: '가'.repeat(101) } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('100자까지 쓸 수 있어요')).toBeInTheDocument();
    expect(입력()).toHaveValue('가'.repeat(101));
    expect(await 저장된것()).toHaveLength(0);
  });

  it('공백만 넣으면 "할 일을 입력해 주세요" 다', async () => {
    행();
    fireEvent.change(입력(), { target: { value: '   ' } });
    fireEvent.keyDown(입력(), { key: 'Enter' });

    expect(await screen.findByText('할 일을 입력해 주세요')).toBeInTheDocument();
  });
});

describe('닫힌 상태', () => {
  it('버튼을 누르면 열린다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = 행(false);

    await user.click(screen.getByRole('button', { name: '+ 할 일 추가' }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('Esc 로 닫으면 포커스가 `+ 할 일 추가` 로 돌아간다 (포커스가 body 로 떨어지지 않는다)', async () => {
    const user = userEvent.setup();
    행();

    await user.type(입력(), '{Escape}');

    expect(screen.getByRole('button', { name: '+ 할 일 추가' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });
});

/**
 * T-67 회귀. 앞 저장이 끝나기 전에 온 `Enter` 를 이 행이 **조용히 버리고** 입력칸까지 비우던 자리다
 * (T-65 실브라우저 실측: `Enter` 간격 0·1ms 에서 5/5 유실, 오류·토스트 없음).
 *
 * `fireEvent` 두 번을 **한 틱 안에서** 쏘면 그 창이 그대로 열린다 — 첫 `addTodo` 는 첫 `await` 에
 * 걸려 있고, 그 사이에 두 번째 `Enter` 가 난다. 실브라우저 0ms 연타와 같은 순서라 목이 필요 없다.
 */
describe('저장 중에 온 입력 (T-67)', () => {
  it('앞 저장이 끝나기 전에 온 Enter 도 잃지 않는다', async () => {
    행();
    const input = 입력();

    fireEvent.change(input, { target: { value: '첫째' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: '둘째' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title).sort()).toEqual(['둘째', '첫째']);
    });
    // R5: 같은 그룹이므로 기존 최대(2) 뒤로 3·4 가 나와야 한다 — 겹치면 순서가 무너진다.
    expect((await 저장된것()).map((t) => t.order).sort((a, b) => a - b)).toEqual([3, 4]);
  });

  it('저장이 도는 중에 새로 친 글자를 앞 저장이 지우지 않는다', async () => {
    const 풀기 = 저장을붙잡는다();
    행();
    const input = 입력();

    fireEvent.change(input, { target: { value: '첫째' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // 저장이 아직 도는 중에 사용자가 다음 문장을 친다.
    fireEvent.change(input, { target: { value: '둘째' } });
    풀기();

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title)).toEqual(['첫째']);
    });
    expect(입력()).toHaveValue('둘째');
  });

  it('비워진 칸에서 난 두 번째 Enter 는 검증 문구를 띄우지 않는다', async () => {
    행();
    const input = 입력();

    fireEvent.change(input, { target: { value: '첫째' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' }); // 같은 틱, 새로 친 글자 없음

    await waitFor(async () => {
      expect((await 저장된것()).map((t) => t.title)).toEqual(['첫째']);
    });
    expect(screen.queryByText('할 일을 입력해 주세요')).not.toBeInTheDocument();
  });
});

describe('타이핑 중 입력칸의 값 속성을 다시 쓰지 않는다 (iOS 한글 키보드)', () => {
  // 제어 입력이면 키마다 리렌더가 돌고 React 가 `value` 속성(defaultValue)을 다시 쓴다. iOS 한글
  // 키보드는 조합 중인 글자를 문서에서 직접 바꿔 끼우므로 타이핑 중 DOM 쓰기를 최소로 둔다.
  // (`name`·`type` 은 React 19 가 change 이벤트마다 비제어 입력에도 쓰므로 여기서 막을 수 없다.)
  it('글자를 치고 지우는 동안 value 속성이 한 번도 바뀌지 않는다', async () => {
    const user = userEvent.setup();
    행();
    const input = 입력();
    const changed: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) changed.push(record.attributeName ?? '');
    });
    observer.observe(input, { attributes: true });

    await user.type(input, '안녕{Backspace}하');
    for (const record of observer.takeRecords()) changed.push(record.attributeName ?? '');
    observer.disconnect();

    expect(input).toHaveValue('안하');
    expect(changed).not.toContain('value');
  });
});
