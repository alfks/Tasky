import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { SocialCategoryView } from '@/domain/social/social';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, getSocialRepository } from '@/repositories/container';

import { useCategoryPublication, useCategoryStore } from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { captureSocialDispatch, loadSocialScreen } from '@/features/social';
import type { CompletedSocialChoice } from '@/features/social';

import { newId } from '@/lib/id';

const SocialScreen = lazy(() =>
  loadSocialScreen().then((module) => ({ default: module.SocialScreen })),
);

type SocialWorkspaceProps = {
  onReturn: () => void;
  initialPublic?: boolean;
  onManageCategories?: () => void;
};

export function SocialWorkspace({
  onReturn,
  initialPublic,
  onManageCategories,
}: SocialWorkspaceProps) {
  const selectedDate = useDateStripStore((state) => state.selectedDate);
  const [date, setDate] = useState(selectedDate);
  const publication = useCategoryPublication();
  const { todos, loading } = useCompletedTodos(date);
  const choiceKeys = useRef(new Map<string, string>());
  const choices: CompletedSocialChoice[] = todos.map((todo) => {
    let key = choiceKeys.current.get(todo.id);
    if (key === undefined) {
      key = newId();
      choiceKeys.current.set(todo.id, key);
    }
    const category = useCategoryStore.getState().byId[todo.categoryId];
    return {
      key,
      text: todo.title,
      happenedOn: todo.date,
      categoryLabel: category?.name ?? '카테고리 없음',
      resolveCategory: () => resolveOwnedCategory(todo.categoryId),
      onChangeAudience: () => {
        const current = useCategoryStore.getState().byId[todo.categoryId];
        if (current !== undefined) publication.openVisibility(current);
      },
    };
  });
  return (
    <Suspense
      fallback={
        <main id="shell-main" className="min-w-0 flex-1 p-[var(--space-4)]">
          <p role="status">친구 화면을 불러오는 중</p>
        </main>
      }
    >
      <SocialScreen
        choices={choices}
        choicesLoading={loading}
        date={date}
        onDateChange={(value) => {
          if (isValidDateKey(value)) setDate(value);
        }}
        onReturn={onReturn}
        initialPublic={initialPublic}
        onManageCategories={onManageCategories}
      />
    </Suspense>
  );
}

function useCompletedTodos(date: DateKey) {
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setTodos([]);
    void getRepositories()
      .todos.listByDate(date)
      .then((items) => {
        if (alive) setTodos(items.filter((todo) => todo.done));
      })
      .catch(() => {
        if (alive) setTodos([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date]);
  return { todos, loading };
}

/** 개인 연결을 서버 소유자 목록에서 재확인한다. 원래 카테고리 id는 DTO에 넣지 않는다. */
async function resolveOwnedCategory(categoryId: CategoryId): Promise<SocialCategoryView | null> {
  const category = useCategoryStore.getState().byId[categoryId];
  if (category?.socialCategoryId === undefined) return null;
  const allowed = captureSocialDispatch();
  const persistAllowed = () => {
    const latest = useCategoryStore.getState().byId[categoryId];
    return (
      allowed() &&
      latest !== undefined &&
      latest.socialCategoryId === category.socialCategoryId &&
      latest.socialCategoryVersion === category.socialCategoryVersion &&
      latest.name === category.name &&
      latest.color === category.color &&
      latest.emoji === category.emoji
    );
  };
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await getSocialRepository().categories({
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!allowed()) return null;
    const owned = result.data.items.find((candidate) => candidate.id === category.socialCategoryId);
    if (owned !== undefined) {
      if ('revoked' in owned && owned.revoked === true) {
        await useCategoryStore.getState().confirmAudience(categoryId, null, persistAllowed);
        return null;
      }
      if (!(await useCategoryStore.getState().confirmAudience(categoryId, owned, persistAllowed)))
        return null;
      return allowed() ? owned : null;
    }
    if (result.data.nextCursor === null) {
      await useCategoryStore.getState().confirmAudience(categoryId, null, persistAllowed);
      return null;
    }
    cursor = result.data.nextCursor;
  }
  throw new Error('공개 범위를 다시 확인해 주세요.');
}

/** DOM 순서가 바뀌어도 같은 스크롤 영역과 살아 있는 진입 버튼으로 복귀한다. */
export function captureSocialReturn(
  opener: Element | null,
  stillMounted: () => boolean = () => true,
): () => void {
  const positions = new Map(
    Array.from(document.querySelectorAll<HTMLElement>('[data-shell-scroll-region]'), (element) => [
      element.dataset.shellScrollRegion,
      element.scrollTop,
    ]),
  );
  // 연 버튼이 친구 화면 동안 언마운트되는 자리가 있다 — 프로필 카드 본문(헤더 슬롯, profile.md
  // R11-a)은 친구 화면이 헤더를 통째로 대신하므로 돌아올 때 **새 요소**로 다시 선다. 잡아 둔
  // 참조는 끊겨 있으니 같은 접근 이름의 후임을 찾아 포커스를 넘긴다(드로어 `[친구]` 는 드로어가
  // 닫혀 후임이 없으므로 그대로 `main` 으로 간다). 후임은 개인 화면이 다시 커밋돼야 서는데 그 시점이
  // 호출 프레임과 어긋날 수 있어(지연 청크·Suspense) 몇 프레임을 더 기다린다 — 그 사이 사용자가
  // 포커스를 직접 옮겼으면(활성 요소가 `body` 가 아니면) 빼앗지 않고 멈춘다.
  const label = opener instanceof HTMLElement ? opener.getAttribute('aria-label') : null;
  return () => {
    for (const element of document.querySelectorAll<HTMLElement>('[data-shell-scroll-region]'))
      element.scrollTop = positions.get(element.dataset.shellScrollRegion) ?? 0;
    if (opener instanceof HTMLElement && opener.isConnected) return opener.focus();
    const fallback = () => document.getElementById('shell-main')?.focus();
    if (label === null) return fallback();
    const selector = `button[aria-label="${CSS.escape(label)}"]`;
    let attempts = 0;
    const seek = () => {
      // 셸이 내려간 뒤(로그아웃·계정 전환) 남은 프레임은 버린다 — 후임을 찾아도 보낼 곳이 없다.
      if (!stillMounted()) return;
      const active = document.activeElement;
      if (attempts > 0 && active !== null && active !== document.body) return;
      const successor = document.querySelector<HTMLElement>(selector);
      if (successor !== null) return successor.focus();
      if (++attempts < SUCCESSOR_FRAMES) return void requestAnimationFrame(seek);
      fallback();
    };
    seek();
  };
}

/** 후임 버튼을 기다리는 상한(프레임). 넘기면 `main` 으로 간다 — 포커스가 영영 비는 일은 없다. */
const SUCCESSOR_FRAMES = 10;
