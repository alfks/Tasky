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

import { useProfileStore } from '@/features/profile';

import { pushToast } from '@/components/ui/Toast';

/**
 * `AuthGate` 가 그리는 화면. `'checking'` 은 표식 조회가 끝나기 전(Providers 스켈레톤과 같은
 * 프레임), `'login'` 은 `LoginScreen` 만, `'ready'` 는 `AppShell` 을 즉시 그린다(R6).
 */
export type GatePhase = 'checking' | 'login' | 'ready';

/** 로그인 화면에 남길 안내. `'denied'`·`'error'` 는 OAuth 콜백이 `/?auth=error`·`/?auth=denied` 로
 * 돌아올 때(worker 실물 계약). `'signed-out'` 은 URL 이 아니라 `verifySession` 이 표식은 있는데
 * 세션만 없어졌음을 감지했을 때(리뷰 Major 3, user) — 세션 만료든 "다른 기기 모두 로그아웃" 이든
 * 최초 실행과 구분해 "왜 로그인 화면인지" 를 한 줄이라도 말해 준다. */
export type LoginNotice = 'denied' | 'error' | 'signed-out' | null;

export type SyncStoreState = {
  phase: GatePhase;
  /** 로그인된 계정 이메일. 오프라인에서도 표식(`SyncState.userEmail`)에서 읽으므로 항상 채워진다. */
  email: string | null;
  loginNotice: LoginNotice;
  online: boolean;
  /** 아웃박스에 남은 건수 — 계정 블록의 "○ 대기 N건"(R6). 엔진이 사이클마다, 그리고 로컬 쓰기
   * 직후(리뷰 Minor 5)에도 갱신한다. */
  pendingCount: number;
  /** R7 첫 로그인 업로드 다이얼로그를 띄울지(다이얼로그가 **열려** 있는가). */
  uploadPrompt: boolean;
  /**
   * R7 선택을 **아직 하지 않았는가**(리뷰 Major 4). `uploadPrompt` 와 다르다 — Esc·✕(`deferUpload`)
   * 로 다이얼로그를 닫아도 결정은 안 났으므로 이 값은 그대로 `true` 로 남는다. 계정 블록이 이 값을
   * 보고 "동기화됨" 을 참칭하지 않는다(`AccountBlock#statusOf`). `resolveUpload` 가 실제 선택
   * (올리기/내보내고 지우기)을 처리해야만 `false` 로 내려간다.
   */
  uploadPending: boolean;
  /** 이 계정이 다른 기기에서 삭제됐다는 안내를 띄울지(sync.md §6, ADR-0019 — 조용히 로그아웃시키지
   * 않는다). 표식·로컬 데이터는 사용자가 확인할 때까지 그대로 둔다. */
  accountDeletedNotice: boolean;
  /** 로그인된 계정이 표식의 계정과 다르다는 안내를 띄울지(sync.md R1, 리뷰 Major 2). 사용자가
   * [내보내고 지우기] 를 눌러야 실제로 내보내고 전환한다 — 배경에서 조용히 하지 않는다. */
  accountSwitchedNotice: boolean;
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
  /**
   * Esc·✕·바깥 클릭 — 선택을 **보류**한다. "안 올리겠다" 가 아니라 "지금 결정하지 않겠다" 이므로
   * (리뷰 Major 4) 엔진은 그대로 시작하고(이미 아웃박스에 있는 변경·오프라인 표시는 정상 동작해야
   * 한다), 결정하지 않은 로컬 데이터가 있다는 사실만 표식에 남겨 다음 접속에 다시 묻는다(R7).
   */
  deferUpload: () => void;
  /** 계정 삭제 안내의 [내보내고 지우기]. 실패(내보내기 취소)면 false — 안내가 다시 보인다. */
  acknowledgeAccountDeleted: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
  /** Esc·✕ — 안내를 잠시 닫는다. 로컬은 그대로라 다음 사이클에서 서버가 다시 410 을 주면
   * 되살아난다(말없이 사라지지 않는다, 아래 verifySession 이 매번 다시 켠다). */
  dismissAccountDeletedNotice: () => void;
  /** 계정 전환 안내의 [내보내고 지우기]. 실패(내보내기 취소)면 false — 안내가 다시 보인다. */
  confirmAccountSwitch: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
  /** Esc·✕ — 안내를 잠시 닫는다. 로컬은 그대로라 다음 동기화 확인이 다시 다른 `sub` 를 받으면
   * 되살아난다(`dismissAccountDeletedNotice` 와 같은 규칙). */
  dismissAccountSwitchedNotice: () => void;
  /** 성공(내보내기 확인 → 삭제까지 끝남)하면 true. 내보내기를 취소했으면 false(로그아웃하지 않는다). */
  logout: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
  /** 성공하면 true. */
  deleteAccount: (exportBackup: () => Promise<boolean>) => Promise<boolean>;
  /** "다른 기기 모두 로그아웃"(ADR-0020 §결정 5) — 이 기기의 로그인·로컬은 그대로다.
   * `'ok'`(성공 토스트)·`'offline'`(온라인이 되면 다시 시도 문구)·`'error'`(범용 재시도 문구) 는
   * 호출부(`AccountBlock`)가 토스트로 알린다. `'signed-out'` 은 이 기기 세션이 이미 죽었거나
   * 계정이 삭제됐다는 뜻이라 `performLogoutOthers` 가 이미 게이트를 넘겼다 — 호출부는 토스트를
   * 띄우지 않는다(리뷰 Major 1). */
  logoutOthers: () => Promise<'ok' | 'signed-out' | 'offline' | 'error'>;
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
  /**
   * 프로필 스토어(진입)의 두 액션(profile.md R13·R14·R15). 지연 청크가 `@/features/profile` 배럴을
   * **정적으로 import 하지 않게** 여기서 묶어 넘긴다 — 지연 청크(auth-actions·reload-views)가 그
   * 배럴을 직접 끌면 `ProfileCard` 의 `lazy(ProfileDialog)` 가 그 지연 진입점에서도 닿게 되어
   * rolldown 이 대화상자와 진입이 나눠 쓰는 Toast·Button·settings.rules 를 진입에서 떼어 별도
   * 청크로 만든다(실측 2026-09-29: 진입 폐포 +1.4 KB 가 순전히 이 분할 때문이었다).
   */
  forgetProfileLocal: () => void;
  reloadProfile: () => Promise<void>;
};

const initialState: SyncStoreState = {
  phase: 'checking',
  email: null,
  loginNotice: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  uploadPrompt: false,
  uploadPending: false,
  accountDeletedNotice: false,
  accountSwitchedNotice: false,
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
 * `AccountSyncOverlays`(진입, `ShellOverlays` 가 레이아웃과 무관하게 항상 문다 — 리뷰 Major 3)가
 * 마운트 시 `exportBackup` 을 등록해 둔다. `sync` 는 `backup` 을 import 할 수 없으므로(§D-10,
 * `sync → backup` 금지) 값을 직접 끌어오지 않고, 이미 `AppShell` → `ShellOverlays` 로 내려온 prop
 * 을 여기 등록해 지연 청크(엔진·auth-actions)가 필요할 때 `SyncRuntime.getExportBackup()` 으로
 * 읽어 쓴다.
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
    // 지난 접속에서 R7 을 보류했다면(표식의 `uploadDeferred`) 다시 묻는다 — "다음 접속에 다시
    // 묻는다" 는 R7 규칙을 실제로 지킨다(리뷰 Major 4). 그사이 데이터가 사라졌으면(다른 경로로
    // 정리됨) 표식만 지우고 조용히 넘어간다. 어느 쪽이든 엔진은 항상 시작한다.
    const { resumeIfDeferred } = await import('@/features/sync/store/auth-actions');
    await resumeIfDeferred(runtime(), state);
    void ensureEngineStarted();
  },

  resolveUpload: async (choice, exportBackup) => {
    const { resolveUploadChoice } = await import('@/features/sync/store/auth-actions');
    return resolveUploadChoice(runtime(), choice, exportBackup);
  },

  deferUpload: () => {
    set({ uploadPrompt: false }); // 다이얼로그만 닫는다 — `uploadPending` 은 그대로 참이다.
    void (async () => {
      const { deferUpload } = await import('@/features/sync/store/auth-actions');
      await deferUpload(runtime());
    })();
  },

  acknowledgeAccountDeleted: async (exportBackup) => {
    const { acknowledgeAccountDeleted } = await import('@/features/sync/store/auth-actions');
    return acknowledgeAccountDeleted(runtime(), exportBackup);
  },

  dismissAccountDeletedNotice: () => set({ accountDeletedNotice: false }),

  confirmAccountSwitch: async (exportBackup) => {
    const { confirmAccountSwitch } = await import('@/features/sync/store/auth-actions');
    const ok = await confirmAccountSwitch(runtime(), exportBackup);
    if (ok) {
      // 최대 30초 폴링을 기다리지 않고 새 계정 데이터를 바로 당긴다 — `sync-engine.ts` 는 이미
      // 돌고 있으므로(`deferUpload`/최초 로그인 배선) 시작이 아니라 **지금** 한 사이클을 당긴다.
      const { requestSyncNow } = await import('@/features/sync/store/sync-engine');
      requestSyncNow();
    }
    return ok;
  },

  dismissAccountSwitchedNotice: () => set({ accountSwitchedNotice: false }),

  logout: async (exportBackup) => {
    const { performLogout } = await import('@/features/sync/store/auth-actions');
    return performLogout(runtime(), exportBackup);
  },

  deleteAccount: async (exportBackup) => {
    const { performDeleteAccount } = await import('@/features/sync/store/auth-actions');
    return performDeleteAccount(runtime(), exportBackup);
  },

  logoutOthers: async () => {
    const { performLogoutOthers } = await import('@/features/sync/store/auth-actions');
    return performLogoutOthers(runtime());
  },
}));

function runtime(): SyncRuntime {
  return {
    getState: () => useSyncStore.getState(),
    setState: (partial) => useSyncStore.setState(partial),
    getExportBackup: () => registeredExportBackup,
    ensureEngineStarted,
    forgetProfileLocal: () => useProfileStore.getState().forgetLocal(),
    reloadProfile: () => useProfileStore.getState().reloadFromStorage(),
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
