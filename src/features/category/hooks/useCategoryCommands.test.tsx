// 카테고리 명령 등록 (shortcuts R7).
//
// **"뜬다" 가 아니라 "열린다" 를 잰다** — `run` 이 빈 함수여도 목록 단언은 통과하므로, 레지스트리의
// `runCommand` 를 거쳐 `카테고리 만들기` 대화상자가 실제로 뜨는 것까지 본다.
//
// 두 번째 묶음은 **사이드바가 한 순간 둘이 되는 창**을 재현한다(컬럼 + 드로어). 등록을 인스턴스에
// 그대로 걸면 여기서 `DuplicateCommandError` 가 던져져 앱이 통째로 하얘진다.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CategoryList } from '@/features/category/components/CategoryList';
import {
  CATEGORY_NEW_COMMAND_ID,
  useCategoryCommands,
} from '@/features/category/hooks/useCategoryCommands';
import { indexCategories } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { availableCommands, matchCommands, useCommandStore } from '@/features/command';
import { makeCategory } from '@/test/fixtures/category';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });

function commandIds(): string[] {
  return useCommandStore.getState().commands.map((command) => command.id);
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
  useCategoryStore.setState({ ...indexCategories([공부]), status: 'ready', error: null });
});

describe('CategoryList 가 등록한다 (R7)', () => {
  it('팔레트에 `새 카테고리` 가 올라간다', async () => {
    render(<CategoryList />);

    await waitFor(() => expect(commandIds()).toContain(CATEGORY_NEW_COMMAND_ID));
    expect(matchCommands(useCommandStore.getState().commands, '카테고리')).toHaveLength(1);
  });

  it('라벨에 없는 말(`만들기`)로도 찾힌다 — 키워드가 거기 쓰인다 (R8)', async () => {
    render(<CategoryList />);
    await waitFor(() => expect(commandIds()).toContain(CATEGORY_NEW_COMMAND_ID));

    const hits = matchCommands(useCommandStore.getState().commands, '만들기');

    expect(hits.map((command) => command.id)).toEqual([CATEGORY_NEW_COMMAND_ID]);
  });

  it('Enter 로 실행하면 `카테고리 만들기` 가 **실제로** 열린다', async () => {
    render(<CategoryList />);
    await waitFor(() => expect(commandIds()).toContain(CATEGORY_NEW_COMMAND_ID));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await useCommandStore.getState().runCommand(CATEGORY_NEW_COMMAND_ID);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '카테고리 만들기' })).toBeInTheDocument(),
    );
  });

  it('목록을 아직 못 읽었으면 팔레트에 내지 않는다 (이름 유일성·개수 제한이 빈 모집단으로 돈다)', async () => {
    useCategoryStore.setState({ status: 'loading' });
    render(<CategoryList />);
    await waitFor(() => expect(commandIds()).toContain(CATEGORY_NEW_COMMAND_ID));

    expect(availableCommands(useCommandStore.getState().commands)).toEqual([]);
  });

  it('사이드바가 사라지면 명령도 사라진다', async () => {
    const view = render(<CategoryList />);
    await waitFor(() => expect(commandIds()).toContain(CATEGORY_NEW_COMMAND_ID));

    view.unmount();

    expect(commandIds()).toEqual([]);
  });
});

describe('컬럼 + 드로어로 둘 마운트되는 한 프레임', () => {
  it('중복 등록으로 죽지 않고 명령은 하나다', async () => {
    render(
      <>
        <CategoryList />
        <CategoryList />
      </>,
    );

    await waitFor(() => expect(commandIds()).toEqual([CATEGORY_NEW_COMMAND_ID]));
  });

  /**
   * **어느 인스턴스가 여는지**는 `CategoryList` 로는 가릴 수 없다 — 대화상자는 `document.body` 로
   * 포털되고 두 인스턴스가 똑같은 것을 그린다. 그래서 훅만 단독으로 걸어 누가 불렸는지 기록한다.
   */
  function Probe({ tag, opened }: { tag: string; opened: string[] }) {
    useCategoryCommands(() => opened.push(tag));
    return null;
  }

  it('나중에 뜬 쪽(= 드로어가 컬럼을 덮는다)이 실행을 받는다', async () => {
    const opened: string[] = [];
    render(
      <>
        <Probe tag="column" opened={opened} />
        <Probe tag="drawer" opened={opened} />
      </>,
    );
    await waitFor(() => expect(commandIds()).toEqual([CATEGORY_NEW_COMMAND_ID]));

    await useCommandStore.getState().runCommand(CATEGORY_NEW_COMMAND_ID);

    expect(opened).toEqual(['drawer']);
  });

  it('나중에 뜬 쪽이 사라지면 남은 쪽이 이어받는다 — 죽은 등록이 남지 않는다', async () => {
    const opened: string[] = [];
    function Pair({ both }: { both: boolean }) {
      return (
        <>
          <Probe tag="column" opened={opened} />
          {both ? <Probe tag="drawer" opened={opened} /> : null}
        </>
      );
    }
    const view = render(<Pair both />);
    await waitFor(() => expect(commandIds()).toEqual([CATEGORY_NEW_COMMAND_ID]));

    view.rerender(<Pair both={false} />);
    await useCommandStore.getState().runCommand(CATEGORY_NEW_COMMAND_ID);

    expect(opened).toEqual(['column']);
    expect(commandIds()).toEqual([CATEGORY_NEW_COMMAND_ID]);
  });
});
