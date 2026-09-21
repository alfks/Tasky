// 진입 청크(T94_LAZY_BOUNDARY.md §A-3). AuthGate 의 판정 상태 + 계정 블록이 보여줄 값만 들고,
// 실제 동기화 로직(엔진·표식 쓰기·로그아웃·계정 삭제)은 전부 **동적 import** 로 위임한다 —
// `@/features/sync/store/sync-engine`·`@/features/sync/store/auth-actions` 값을 이 파일이
// 정적으로 import 하면 그 순간 지연 청크가 진입에 흡수된다(lazy-boundary.test.ts 가 막는다).
//
// **지연 청크는 이 파일을 값으로 import 하지 않는다** — `auth-actions.ts`·`sync-engine.ts` 가
// `useSyncStore` 를 직접 부르면 "진입 → (동적) → 지연 → (정적) → 진입" 순환이 생겨
// `import/no-cycle` 이 막는다(실측). 그래서 상태 읽기/쓰기·`ensureEngineStarted`·등록된
// `exportBackup` 을 **함수 묶음**(`SyncRuntime`)으로 캡슐화해 `import type` 으로만 그 모양을
// 공유하고, 실제 참조는 이 파일이 만들어 호출 시점에 인자로 건넨다.
import { create } from 'zustand';

import { getRepositories } from '@/repositories/container';

import { pushToast } from '@/components/ui/Toast';

/**
 * `AuthGate` 가 그리는 화면. `'checking'` 은 표식 조회가 끝나기 전(Providers 스켈레톤과 같은
 * 프레임), `'login'` 은 `LoginScreen` 만, `'ready'` 는 `AppShell` 을 즉시 그린다(R6).
 */
export type GatePhase = 'checking' | 'login' | 'ready';

/** 로그인 화면에 남길 안내. OAuth 콜백이 `/?auth=error`·`/?auth=denied` 로 돌아온다(worker 실물 계약). */
export type LoginNotice = 'denied' | 'error' | null;

export type SyncStoreState = {
  phase: GatePhase;
  /** 로그인된 계정 이메일. 오프라인에서도 표식(`SyncState.userEmail`)에서 읽으므로 항상 채워진다. */
  email: string | null;
  loginNotice: LoginNotice;
  online: boolean;
  /** 아웃박스에 남은 건수 — 계정 블록의 "○ 대기 N건"(R6). 엔진이 사이클마다 갱신한다. */
  pendingCount: number;
  /** R7 첫 로그인 업로드 다이얼로그를 띄울지. */
  uploadPrompt: boolean;
  /** 원격에서 받아 적용한 변경이 있을 때마다 +1 — 다른 feature 가 재조회 트리거로 구독한다
   * (`ShellHeader#useSummaryRevision`, `backup/index.ts` 의 `dataRevision` 과 같은 패턴). */
  dataRevision: number;
};

export type SyncStoreActions = {
  /** `AuthGate` 마운트 시 한 번. 표식을 읽어 phase 를 정하고, 있으면 엔진을 시작한다. 멱등. */
  bootstrap: () => Promise<void>;
  /** R7 다이얼로그의 선택 처리. `exportBackup` 은 `sync` 가 `backup` 을 import 할 수 없어(§D-10)
   * 호출부(`AccountBlockLauncher`)가 prop 으로 받은 것을 그대로 넘긴다. */
  resolveUpload: (
    choice: 'upload' | 'export-wipe',
    exportBackup: () => Promise<boolean>,
  ) => Promise<boolean>;
  /** Esc·✕·바깥 클릭 — 선택을 보류한다(다음 접속에 다시 묻는다, R7 다이얼로그 규칙). */
  deferUpload: () => void;
  /** 성공(내보내기 확인 → 삭제까지 끝남)하면 true. 내보내기를 취소했으면 false(로그아웃하지 않는다). */
  logout: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
  /** 성공하면 true. */
  deleteAccount: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
};

export type SyncStore = SyncStoreState & SyncStoreActions;

/**
 * 지연 청크(`auth-actions.ts`·`sync-engine.ts`)가 진입 상태를 건드리는 유일한 통로. 값은 이
 * 파일이 만들어 호출부에 넘기고, 지연 청크는 **타입만**(`import type`) 공유한다 — `import type` 은
 * 컴파일 후 지워져 런타임 그래프에 간선을 남기지 않으므로 순환이 생기지 않는다(위 머리주석).
 */
export type SyncRuntime = {
  getState: () => SyncStoreState;
  setState: (
    partial: Partial<SyncStoreState> | ((state: SyncStoreState) => Partial<SyncStoreState>),
  ) => void;
  /** 계정 전환처럼 사용자 상호작용 없이 자동으로 일어나는 내보내기가 쓴다. 등록 전이면 `null`. */
  getExportBackup: () => (() => Promise<boolean>) | null;
  /** 엔진 청크를 딱 한 번 가져와 시작한다. 여러 번 불러도 안전(멱등). */
  ensureEngineStarted: () => Promise<void>;
};

const initialState: SyncStoreState = {
  phase: 'checking',
  email: null,
  loginNotice: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  uploadPrompt: false,
  dataRevision: 0,
};

/** `?auth=error`·`?auth=denied` 를 읽고 지운다(뒤로가기·새로고침에서 배너가 되살아나지 않게). */
function consumeAuthNotice(): LoginNotice {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const auth = params.get('auth');
  const notice: LoginNotice = auth === 'denied' || auth === 'error' ? auth : null;
  if (notice !== null) {
    params.delete('auth');
    const query = params.toString();
    const next =
      window.location.pathname + (query === '' ? '' : `?${query}`) + window.location.hash;
    window.history.replaceState(null, '', next);
  }
  return notice;
}

let engineStarted = false;

async function ensureEngineStarted(): Promise<void> {
  if (engineStarted) return;
  engineStarted = true;
  try {
    const { startEngine } = await import('@/features/sync/store/sync-engine');
    startEngine(runtime());
  } catch (error) {
    engineStarted = false;
    console.error('동기화 엔진을 불러오지 못했습니다.', error);
    pushToast({ message: '동기화 모듈을 불러오지 못했어요 — 새로고침해 주세요.' });
  }
}

let bootstrapStarted = false;

/**
 * `AccountBlockLauncher`(진입)가 마운트 시 `exportBackup` 을 등록해 둔다. `sync` 는 `backup` 을
 * import 할 수 없으므로(§D-10, `sync → backup` 금지) 값을 직접 끌어오지 않고, 이미 ShellSidebar
 * → AccountBlockLauncher 로 내려온 prop 을 여기 등록해 지연 청크(엔진·auth-actions)가 필요할 때
 * `SyncRuntime.getExportBackup()` 으로 읽어 쓴다.
 */
let registeredExportBackup: (() => Promise<boolean>) | null = null;

export function registerExportBackup(fn: (() => Promise<boolean>) | null): void {
  registeredExportBackup = fn;
}

export const useSyncStore = create<SyncStore>()((set, get) => ({
  ...initialState,

  bootstrap: async () => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;
    const loginNotice = consumeAuthNotice();
    let state;
    try {
      state = await getRepositories().sync.getState();
    } catch (error) {
      console.error('동기화 표식을 읽지 못했습니다.', error);
      state = undefined;
    }
    if (state?.userSub === undefined) {
      set({ phase: 'login', loginNotice, email: null });
      // OAuth 콜백은 `/` 로 그대로 돌아온다(쿼리 표식이 없다) — 표식이 아직 없어도 쿠키가 막
      // 생겼을 수 있으므로 온라인이면 배경에서 한 번 확인한다(`auth-actions.probeSession`).
      if (get().online) {
        void (async () => {
          const { probeSession } = await import('@/features/sync/store/auth-actions');
          await probeSession(runtime());
        })();
      }
      return;
    }
    set({ phase: 'ready', email: state.userEmail ?? null, loginNotice });
    void ensureEngineStarted();
  },

  resolveUpload: async (choice, exportBackup) => {
    const { resolveUploadChoice } = await import('@/features/sync/store/auth-actions');
    return resolveUploadChoice(runtime(), choice, exportBackup);
  },

  deferUpload: () => set({ uploadPrompt: false }),

  logout: async (exportBackup) => {
    const { performLogout } = await import('@/features/sync/store/auth-actions');
    return performLogout(runtime(), exportBackup);
  },

  deleteAccount: async (exportBackup) => {
    const { performDeleteAccount } = await import('@/features/sync/store/auth-actions');
    return performDeleteAccount(runtime(), exportBackup);
  },
}));

function runtime(): SyncRuntime {
  return {
    getState: () => useSyncStore.getState(),
    setState: (partial) => useSyncStore.setState(partial),
    getExportBackup: () => registeredExportBackup,
    ensureEngineStarted,
  };
}

/** 테스트 전용 — 모듈 스코프 가드를 되돌린다(`bootstrap`/`ensureEngineStarted` 의 멱등 가드는
 * 모듈이 살아 있는 동안 전역이라, 격리된 테스트마다 다시 시작할 수 있어야 한다). */
export function resetSyncStoreForTest(): void {
  bootstrapStarted = false;
  engineStarted = false;
  registeredExportBackup = null;
  useSyncStore.setState({ ...initialState });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSyncStore.setState({ online: true }));
  window.addEventListener('offline', () => useSyncStore.setState({ online: false }));
}
