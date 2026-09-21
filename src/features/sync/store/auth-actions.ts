// 지연 청크(T94_LAZY_BOUNDARY.md §C-6). 로그인 판정(`/api/me` 왕복)·표식 쓰기·첫 로그인
// 올리기/내보내기·로그아웃·계정 삭제·계정 전환을 전부 여기 모은다 — `sync-store.ts`(진입)는
// 이 파일을 `await import(...)` 로만 부르고, 이 파일은 그 반대 방향 간선을 만들지 않는다
// (`SyncRuntime` 을 **타입으로만** 받는다 — 값으로 `useSyncStore` 를 import 하면
// "진입 → 동적 → 이 파일 → 정적 → 진입" 순환이 생겨 `import/no-cycle` 이 막는다, 실측).
import type { SyncState } from '@/domain/sync/wire';

import { getRepositories, getSyncTransport } from '@/repositories/container';

import type { SyncRuntime } from '@/features/sync/store/sync-store';

/** 7테이블 중 하나라도 로우가 있으면 true(R7 다이얼로그를 띄울지 판단). 툼스톤은 세지 않는다
 * (엔티티 조회 — `backup-actions.ts#refresh` 와 같은 방식). */
async function hasLocalData(): Promise<boolean> {
  const repositories = getRepositories();
  const [todos, categories, settings, ddays, diaryEntries, routines, focusSessions] =
    await Promise.all([
      repositories.todos.listAll(),
      repositories.categories.list({ includeClosed: true }),
      repositories.settings.get(),
      repositories.dday.list(),
      repositories.diaryEntries.list(),
      repositories.routines.list({ includeInactive: true }),
      repositories.focusSessions.listAll(),
    ]);
  return (
    todos.length > 0 ||
    categories.length > 0 ||
    settings !== undefined ||
    ddays.length > 0 ||
    diaryEntries.length > 0 ||
    routines.length > 0 ||
    focusSessions.length > 0
  );
}

/** 이 브라우저 프로필의 `deviceId`. 이미 있으면(로그아웃 후 재로그인) 그대로 쓴다(스펙 §4). */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getRepositories().sync.getState();
  return existing?.deviceId ?? crypto.randomUUID();
}

/**
 * 새 표식을 쓰고 게이트를 통과시킨다. 첫 로그인 + 로컬 데이터가 있으면 R7 다이얼로그를 띄우고,
 * 없으면 바로 엔진을 시작한다(R8).
 */
async function completeLogin(rt: SyncRuntime, sub: string, email: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const state: SyncState = { deviceId, userSub: sub, userEmail: email, cursor: 0 };
  await getRepositories().sync.setState(state);
  const upload = await hasLocalData();
  rt.setState({ phase: 'ready', email, loginNotice: null, uploadPrompt: upload });
  if (!upload) void rt.ensureEngineStarted();
}

/** 표식이 없을 때 배경에서 세션 유무를 확인한다(OAuth 콜백 복귀 — worker 는 `/` 로 그대로 돌아온다). */
export async function probeSession(rt: SyncRuntime): Promise<void> {
  let session;
  try {
    session = await getSyncTransport().me();
  } catch {
    return; // 오프라인/서버 오류 — 로그인 화면에 그대로 둔다
  }
  if (session === null) return;
  await completeLogin(rt, session.sub, session.email);
}

/** R7 다이얼로그의 선택. 성공하면 true(다이얼로그를 닫아도 되는지 호출부가 판단하는 신호). */
export async function resolveUploadChoice(
  rt: SyncRuntime,
  choice: 'upload' | 'export-wipe',
  exportBackup: () => Promise<boolean>,
): Promise<boolean> {
  if (choice === 'export-wipe') {
    const exported = await exportBackup();
    if (!exported) return false; // 저장 취소 — wipe 하지 않는다(사실 10, sync.md R7)
    await getRepositories().sync.wipeLocal();
    rt.setState({ uploadPrompt: false });
    void rt.ensureEngineStarted();
    return true;
  }
  // "올리기" = enqueueAll + 정상 사이클(사용자 결정 — sync.md R7 주석). 서버 LWW 가 곧 백업
  // 병합의 newer-wins 와 같은 규칙이라 결과가 같고, 코드 경로를 하나로 유지한다.
  await getRepositories().sync.enqueueAll();
  rt.setState({ uploadPrompt: false });
  void rt.ensureEngineStarted();
  return true;
}

/** 로그아웃 = 내보낸 뒤 삭제(sync.md §6). 내보내기가 실패/취소되면 아무것도 지우지 않는다. */
export async function performLogout(
  rt: SyncRuntime,
  exportBackup: () => Promise<boolean>,
): Promise<boolean> {
  const exported = await exportBackup();
  if (!exported) return false;
  await getRepositories().sync.wipeLocal();
  try {
    await getSyncTransport().logout();
  } catch {
    // 서버 로그아웃 실패는 로컬 정리를 막지 않는다 — 세션 쿠키는 만료되면 어차피 무효화된다.
  }
  rt.setState({ phase: 'login', email: null, pendingCount: 0, uploadPrompt: false });
  return true;
}

/** 계정 삭제 = 내보낸 뒤 서버·로컬 모두 삭제(R14). */
export async function performDeleteAccount(
  rt: SyncRuntime,
  exportBackup: () => Promise<boolean>,
): Promise<boolean> {
  const exported = await exportBackup();
  if (!exported) return false;
  try {
    await getSyncTransport().deleteAccount();
  } catch {
    return false; // 서버가 못 지웠으면 로컬도 지우지 않는다 — 부활 위험(sync.md §6)보다 재시도가 낫다
  }
  await getRepositories().sync.wipeLocal();
  rt.setState({ phase: 'login', email: null, pendingCount: 0, uploadPrompt: false });
  return true;
}

/**
 * 엔진이 사이클을 시작하기 전에 부른다(표식 있는 상태의 401/계정 전환 처리, R1).
 *
 * **알려진 한계**: `/api/account/delete` 로 삭제된 계정을 **다른** 기기가 만나면 worker 는 410 을
 * 주지만(worker/auth/session.ts), `src/infra/sync/http-transport.ts`(T-92 owns, 이 티켓 밖)는
 * 401 이 아닌 모든 실패를 `'server'` 로 뭉뚱그려 `'account-deleted'` 를 구분하지 못한다 — 그래서
 * 여기서는 sync.md §6 의 "안내 다이얼로그" 대신 **R1 그대로**(401 → 표식 삭제, 안내 없이 로그인
 * 화면)로 처리한다. E-3 옵션 2 를 온전히 구현하려면 `TransportFailure` 에 셋째 값이 필요하다.
 */
export async function verifySession(
  rt: SyncRuntime,
): Promise<'ok' | 'signed-out' | 'switched' | 'offline'> {
  const state = await getRepositories().sync.getState();
  if (state?.userSub === undefined) return 'signed-out';
  let session;
  try {
    session = await getSyncTransport().me();
  } catch {
    return 'offline';
  }
  if (session === null) {
    await getRepositories().sync.setState({ deviceId: state.deviceId, cursor: 0 });
    rt.setState({ phase: 'login', email: null, pendingCount: 0 });
    return 'signed-out';
  }
  if (session.sub !== state.userSub) {
    // sync.md R1: 다른 계정으로 로그인 — 이전 계정 로컬을 내보내고 지운 뒤 새 계정을 전량 받는다.
    // "올리기" 선택지는 없다(다른 계정 데이터를 합치는 것은 항상 틀린 동작).
    const exportBackup = rt.getExportBackup();
    const exported = exportBackup === null ? false : await exportBackup();
    if (!exported) {
      // 내보내기를 아직 등록 전이거나 취소했으면 전환을 미룬다 — 다음 사이클에서 다시 묻는다.
      return 'offline';
    }
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({
      deviceId: state.deviceId,
      userSub: session.sub,
      userEmail: session.email,
      cursor: 0,
    });
    rt.setState((prev) => ({ email: session.email, dataRevision: prev.dataRevision + 1 }));
    return 'switched';
  }
  if (session.email !== state.userEmail) {
    await getRepositories().sync.setState({ ...state, userEmail: session.email });
    rt.setState({ email: session.email });
  }
  return 'ok';
}
