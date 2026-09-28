import type { PostView, ProfileView, SocialErrorCode, SocialMode } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { socialErrorCode, uniquePosts } from '@/features/social/lib/feed-validation';
import { validatePage, type FeedClock } from '@/features/social/lib/validate-page';
import type {
  SocialInvalidation,
  SocialSessionClient,
  SocialSessionScope,
} from '@/features/social/session-lifecycle';

export type FeedSnapshot = {
  phase: 'blocked' | 'loading' | 'ready' | 'error';
  mode: SocialMode | null;
  profile: ProfileView | null;
  items: readonly PostView[];
  canShow: boolean;
  cursorStack: readonly (string | null)[];
  pageIndex: number;
  nextCursor: string | null;
  firstHeadId: string | null;
  hasNew: boolean;
  leaseUntil: number;
  error: SocialErrorCode | null;
  cursorExpired: boolean;
};

export type FeedDependencies = {
  repository: () => SocialRepository;
  clock: FeedClock;
  capture: () => () => boolean;
  activate: () => Promise<SocialSessionScope | null>;
  deactivate: () => void;
  attach: (client: SocialSessionClient) => () => void;
  invalidateSession: (reason: SocialInvalidation) => void;
  online: () => boolean;
  visible: () => boolean;
};

const INITIAL: FeedSnapshot = {
  phase: 'blocked',
  mode: null,
  profile: null,
  items: [],
  canShow: false,
  cursorStack: [null],
  pageIndex: 0,
  nextCursor: null,
  firstHeadId: null,
  hasNew: false,
  leaseUntil: 0,
  error: null,
  cursorExpired: false,
};

export function createSocialFeedManager(
  deps: FeedDependencies,
  onChange: (state: FeedSnapshot) => void,
  onInvalidate?: (reason: SocialInvalidation) => void,
) {
  let state: FeedSnapshot = INITIAL;
  let generation = 0;
  let open = false;
  let viewEpoch = 0;
  let timer: unknown;
  let leaseTimer: unknown;
  let detach: (() => void) | null = null;

  function update(partial: Partial<FeedSnapshot>): void {
    state = { ...state, ...partial };
    onChange(state);
  }

  function stopTimer(): void {
    if (timer !== undefined) deps.clock.clear(timer);
    if (leaseTimer !== undefined) deps.clock.clear(leaseTimer);
    timer = undefined;
    leaseTimer = undefined;
  }

  function current(captured: number, allowed: () => boolean): boolean {
    return open && generation === captured && allowed() && deps.online() && deps.visible();
  }

  function invalidate(reason: SocialInvalidation): void {
    generation += 1;
    stopTimer();
    const purge =
      reason === 'closed' ||
      reason === 'auth' ||
      reason === 'account' ||
      reason === 'revoked' ||
      reason === 'cross-tab' ||
      reason === 'provider';
    update({
      phase: 'blocked',
      canShow: false,
      leaseUntil: 0,
      error: null,
      cursorExpired: false,
      ...(purge
        ? {
            items: [],
            profile: null,
            mode: null,
            cursorStack: [null],
            pageIndex: 0,
            nextCursor: null,
            firstHeadId: null,
            hasNew: false,
          }
        : {}),
    });
    onInvalidate?.(reason);
  }

  function schedulePoll(): void {
    stopTimer();
    const captured = generation;
    leaseTimer = deps.clock.schedule(
      () => {
        leaseTimer = undefined;
        if (open && generation === captured && deps.clock.now() >= state.leaseUntil) {
          update({ canShow: false });
        }
      },
      Math.max(0, state.leaseUntil - deps.clock.now()),
    );
    timer = deps.clock.schedule(
      () => {
        timer = undefined;
        if (deps.clock.now() >= state.leaseUntil) {
          deps.invalidateSession('recheck');
          void deps.activate();
          return;
        }
        void validateCurrent();
      },
      Math.max(0, state.leaseUntil - deps.clock.now() - 5_000),
    );
  }

  function failed(
    error: unknown,
    captured: number,
    allowed: () => boolean,
    cursorRequestFailed = false,
  ): void {
    if (!current(captured, allowed)) return;
    const code = socialErrorCode(error);
    if (code === 'unauthorized' || code === 'account-deleted') {
      deps.invalidateSession(code === 'unauthorized' ? 'auth' : 'account');
      return;
    }
    generation += 1;
    stopTimer();
    update({
      phase: 'error',
      items: [],
      canShow: false,
      leaseUntil: 0,
      error: code,
      cursorExpired: cursorRequestFailed && code === 'validation',
    });
  }

  async function loadPage(cursor: string | null, stack: readonly (string | null)[]): Promise<void> {
    const captured = ++generation;
    const allowed = deps.capture();
    let requestingFeed = false;
    stopTimer();
    update({
      phase: 'loading',
      items: [],
      canShow: false,
      leaseUntil: 0,
      error: null,
      cursorExpired: false,
      cursorStack: stack,
      pageIndex: stack.length - 1,
      nextCursor: null,
      hasNew: false,
    });
    if (!current(captured, allowed)) return;
    try {
      const repo = deps.repository();
      const identity = await repo.me();
      if (!current(captured, allowed)) return;
      if (identity.data.profile === null || identity.data.mode === 'off') {
        update({ phase: 'ready', profile: identity.data.profile, mode: identity.data.mode });
        return;
      }
      requestingFeed = true;
      const response = await repo.feed(cursor === null ? undefined : { cursor });
      requestingFeed = false;
      if (!current(captured, allowed)) return;
      const items = uniquePosts(response.data.items);
      const validationStartedAt = deps.clock.now();
      const permitted = await validatePage(
        repo,
        items.map((post) => post.id),
        deps.clock,
      );
      if (!current(captured, allowed)) return;
      if (deps.clock.now() >= validationStartedAt + 35_000)
        return failed(new Error('검증 유효 시간이 지났습니다.'), captured, allowed);
      update({
        phase: 'ready',
        mode: identity.data.mode,
        profile: identity.data.profile,
        items: items.filter((post) => permitted.has(post.id)),
        canShow: true,
        leaseUntil: validationStartedAt + 35_000,
        nextCursor: response.data.nextCursor,
        firstHeadId: cursor === null ? (items[0]?.id ?? null) : state.firstHeadId,
      });
      schedulePoll();
    } catch (error) {
      failed(error, captured, allowed, requestingFeed && cursor !== null);
    }
  }

  async function validateCurrent(): Promise<void> {
    const captured = ++generation;
    const allowed = deps.capture();
    stopTimer();
    update({ canShow: false, phase: 'loading' });
    if (!current(captured, allowed)) return;
    try {
      const identity = await deps.repository().me();
      if (!current(captured, allowed)) return;
      if (identity.data.profile === null || identity.data.mode === 'off') {
        generation += 1;
        update({
          phase: 'ready',
          profile: identity.data.profile,
          mode: identity.data.mode,
          items: [],
          canShow: false,
          leaseUntil: 0,
          nextCursor: null,
        });
        return;
      }
      const ids = state.items.map((post) => post.id);
      const validationStartedAt = deps.clock.now();
      const permitted = await validatePage(deps.repository(), ids, deps.clock);
      if (!current(captured, allowed)) return;
      const first = await deps.repository().feed();
      if (!current(captured, allowed)) return;
      if (deps.clock.now() >= validationStartedAt + 35_000) {
        failed(new Error('검증 유효 시간이 지났습니다.'), captured, allowed);
        return;
      }
      const filtered = state.items.filter((post) => permitted.has(post.id));
      update({
        phase: 'ready',
        profile: identity.data.profile,
        mode: identity.data.mode,
        items: filtered,
        canShow: true,
        leaseUntil: validationStartedAt + 35_000,
        hasNew: (first.data.items[0]?.id ?? null) !== state.firstHeadId,
      });
      schedulePoll();
    } catch (error) {
      failed(error, captured, allowed);
    }
  }

  const client: SocialSessionClient = {
    invalidate,
    resume: () => {
      if (state.items.length > 0) void validateCurrent();
      else void loadPage(state.cursorStack[state.pageIndex] ?? null, state.cursorStack);
    },
  };

  return {
    getSnapshot: () => state,
    visibleItems: () =>
      state.canShow && deps.clock.now() < state.leaseUntil && deps.online() && deps.visible()
        ? state.items
        : [],
    open: async () => {
      if (open) return;
      open = true;
      const openedAt = ++viewEpoch;
      detach = deps.attach(client);
      const scope = await deps.activate();
      if (scope === null && open && viewEpoch === openedAt) invalidate('auth');
    },
    close: () => {
      if (!open) return;
      open = false;
      viewEpoch += 1;
      deps.deactivate();
      detach?.();
      detach = null;
      invalidate('closed');
    },
    refresh: () => loadPage(null, [null]),
    /** 명령 뒤 현재 읽는 페이지를 다시 조회한다. 커서/이전 페이지 경로는 유지한다. */
    refreshCurrent: () => loadPage(state.cursorStack[state.pageIndex] ?? null, state.cursorStack),
    next: () =>
      state.nextCursor === null
        ? Promise.resolve()
        : loadPage(state.nextCursor, [...state.cursorStack, state.nextCursor]),
    previous: () =>
      state.pageIndex === 0
        ? Promise.resolve()
        : loadPage(state.cursorStack[state.pageIndex - 1] ?? null, state.cursorStack.slice(0, -1)),
    validate: validateCurrent,
    invalidate,
  };
}
