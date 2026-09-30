// 지연 청크(T94_LAZY_BOUNDARY.md §C-6). 로그인 판정(`/api/me` 왕복)·표식 쓰기·첫 로그인
// 올리기/내보내기·로그아웃·계정 삭제·계정 전환을 전부 여기 모은다 — `sync-store.ts`(진입)는
// 이 파일을 `await import(...)` 로만 부르고, 이 파일은 그 반대 방향 간선을 만들지 않는다
// (`SyncRuntime` 을 **타입으로만** 받는다 — 값으로 `useSyncStore` 를 import 하면
// "진입 → 동적 → 이 파일 → 정적 → 진입" 순환이 생겨 `import/no-cycle` 이 막는다, 실측).
import type { SyncState } from '@/domain/sync/wire';

import { getRepositories, getSyncTransport } from '@/repositories/container';
import { isTransportError } from '@/repositories/sync-transport';

import type { SyncRuntime } from '@/features/sync/store/sync-store';

/**
 * 로컬 전량 삭제의 **유일한 통로**(profile.md R13·R14). 저장소 계층의 `wipeLocal()` 은 localStorage 를
 * 모르므로, 프로필의 첫 페인트 미러(`tasky.profile.v1`)는 여기서 함께 지운다 — 공용 PC 에 이름·사진이
 * 남지 않게. 첫 로그인 "내보내고 지우기"·로그아웃·계정 전환(두 갈래)·계정 삭제·삭제 안내, 여섯 호출이
 * 전부 이 함수를 타고 직접 `wipeLocal()` 호출은 이 파일에 남지 않는다(`auth-actions.test.ts` 가 소스를
 * 읽어 고정한다). 테마 미러는 지우지 않는다 — 개인정보가 아니다(theme R8). 프로필 스토어는
 * `rt.forgetProfileLocal` 로 받는다 — 이 지연 청크가 `@/features/profile` 을 정적으로 끌지 않게
 * (`SyncRuntime` 의 그 필드 주석).
 */
async function wipeLocalAndMirrors(rt: SyncRuntime): Promise<void> {
  await getRepositories().sync.wipeLocal();
  rt.forgetProfileLocal();
}

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
  rt.setState({
    phase: 'ready',
    email,
    loginNotice: null,
    uploadPrompt: upload,
    uploadPending: upload,
  });
  if (!upload) void rt.ensureEngineStarted();
}

/**
 * 지난 접속에서 R7 을 보류했다면(`SyncState.uploadDeferred`) 다시 묻는다 — 리뷰 Major 4, R7 스펙
 * "선택을 보류하고 다음 접속 때 다시 묻는다" 를 실제로 지킨다. 그사이 로컬 데이터가 없어졌으면
 * (백업 가져오기로 지워졌다거나) 표식만 정리하고 조용히 넘어간다 — 없는 데이터를 올릴지 묻지 않는다.
 */
export async function resumeIfDeferred(rt: SyncRuntime, state: SyncState): Promise<void> {
  if (state.uploadDeferred !== true) return;
  const upload = await hasLocalData();
  if (!upload) {
    await getRepositories().sync.setState({ ...state, uploadDeferred: false });
    return;
  }
  rt.setState({ uploadPrompt: true, uploadPending: true });
}

/**
 * R7 다이얼로그를 Esc·✕·바깥 클릭으로 보류했을 때(리뷰 Major 4). 보류는 "올리지 않겠다" 가 아니라
 * "지금 결정하지 않겠다" 다 — 그래서 엔진은 그대로 시작한다(이미 아웃박스에 있는 변경·오프라인
 * 표시는 결정과 무관하게 정상 동작해야 한다). 결정하지 않은 로컬 데이터가 있다는 사실만 표식에
 * 남겨(`uploadDeferred`) 다음 접속에서 `resumeIfDeferred` 가 다시 묻는다. `uploadPending` 은
 * 여기서 건드리지 않는다 — 다이얼로그만 닫힐 뿐 결정은 여전히 안 났다(`AccountBlock#statusOf`).
 */
export async function deferUpload(rt: SyncRuntime): Promise<void> {
  const state = await getRepositories().sync.getState();
  if (state !== undefined) {
    await getRepositories().sync.setState({ ...state, uploadDeferred: true });
  }
  void rt.ensureEngineStarted();
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
    await wipeLocalAndMirrors(rt);
    rt.setState({ uploadPrompt: false, uploadPending: false });
    void rt.ensureEngineStarted();
    return true;
  }
  // "올리기" = enqueueAll + 정상 사이클(사용자 결정 — sync.md R7 주석). 서버 LWW 가 곧 백업
  // 병합의 newer-wins 와 같은 규칙이라 결과가 같고, 코드 경로를 하나로 유지한다.
  await getRepositories().sync.enqueueAll();
  rt.setState({ uploadPrompt: false, uploadPending: false });
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
  await wipeLocalAndMirrors(rt);
  // 승인된 로컬 정리 뒤에만 제출 중인 공유 명령도 로그아웃 경계를 알린다.
  window.dispatchEvent(new Event('tasky-social-logout'));
  try {
    await getSyncTransport().logout();
  } catch {
    // 서버 로그아웃 실패는 로컬 정리를 막지 않는다 — 세션 쿠키는 만료되면 어차피 무효화된다.
  }
  // 리뷰 Nit — `loginNotice` 도 함께 비운다. `bootstrap` 이 URL(`?auth=denied|error`)에서 남긴
  // 안내는 `phase: 'ready'` 로도 저장될 수 있어(같은 탭에서 이미 로그인된 채 그 쿼리로 돌아온
  // 경우), 그 뒤 사용자가 의도적으로 로그아웃해도 여기서 지우지 않으면 다음 로그인 화면에
  // "로그인이 취소됐어요" 같은 낡은 문구가 엉뚱하게 뜬다.
  rt.setState({
    phase: 'login',
    email: null,
    pendingCount: 0,
    uploadPrompt: false,
    loginNotice: null,
  });
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
  await wipeLocalAndMirrors(rt);
  rt.setState({ phase: 'login', email: null, pendingCount: 0, uploadPrompt: false });
  return true;
}

/**
 * "다른 기기 모두 로그아웃"(ADR-0020 §결정 5) — 이 기기의 로그인 상태·로컬 데이터는 그대로 두고,
 * 서버에 남은 이 계정의 나머지 세션만 지운다. `exportBackup` 이 필요 없다(이 기기 데이터는
 * 손대지 않는다).
 *
 * **리뷰 Major 1** — 실패를 갈래별로 다룬다(전에는 전부 `false` 로 뭉개 범용 재시도 토스트만
 * 띄웠다). `unauthorized`(이 기기 세션이 이미 죽음)는 다음 엔진 사이클(최대 30초, 탭 숨김이면
 * 그마저 없음)을 기다리지 않고 `verifySession` 으로 게이트를 바로 넘긴다.
 *
 * **`account-deleted`(계정이 다른 기기에서 삭제됨, 410)는 `verifySession` 을 다시 부르지
 * 않는다(리뷰 재확인, 2차 라운드 Major) — 1회성**: `requireSession` 이 이 첫 410 에서 이미 세션
 * 행을 지우고 `sessionErrorResponse` 가 쿠키까지 지운다(`worker/auth/handlers.ts`). 그래서 여기서
 * `verifySession` 을 불러 `/api/me` 를 한 번 더 왕복하면 그 요청은 410 이 아니라 **평범한 401**
 * 을 받고, `verifySession` 은 `session === null` 갈래로 빠져 `AccountDeletedNotice` 대신 로그인
 * 화면(`loginNotice: 'signed-out'`)을 띄운다 — 안내가 뜰 기회를 재확인 한 번으로 날려버린다(실측,
 * 410 을 한 번만 흉내낸 이전 mock 은 두 번째 호출도 같은 410 을 돌려줘 이 문제를 가렸다). 그래서
 * `verifySession` 의 410 처리(`accountDeletedNotice: true`)와 같은 모양으로 여기서 **직접**
 * 안내를 켠다 — 다시 왕복하지 않는다. `offline`은 서버가 아니라 네트워크 문제임을 그대로 말한다.
 * 그 밖(5xx 등)만 범용 재시도 문구.
 */
export async function performLogoutOthers(
  rt: SyncRuntime,
): Promise<'ok' | 'signed-out' | 'offline' | 'error'> {
  try {
    await getSyncTransport().logoutOthers();
    return 'ok';
  } catch (error) {
    if (isTransportError(error)) {
      if (error.kind === 'account-deleted') {
        rt.setState({ accountDeletedNotice: true });
        return 'signed-out';
      }
      if (error.kind === 'unauthorized') {
        await verifySession(rt);
        return 'signed-out';
      }
      if (error.kind === 'offline') return 'offline';
    }
    return 'error';
  }
}

/**
 * 계정 삭제 안내를 확인했을 때(sync.md §6, ADR-0019) — [내보내고 지우기] 하나뿐이다. 서버가 이미
 * 410 응답에 `Set-Cookie` 로 세션 쿠키를 지웠으므로(`worker/auth/handlers.ts#handleMe`) 여기서
 * 따로 `transport.logout()` 을 부르지 않는다(이미 무효한 세션에 로그아웃을 또 요청할 이유가 없다).
 */
export async function acknowledgeAccountDeleted(
  rt: SyncRuntime,
  exportBackup: () => Promise<boolean>,
): Promise<boolean> {
  const exported = await exportBackup();
  if (!exported) return false; // 내보내기를 취소했으면 안내를 다시 보여준다(호출부가 유지)
  await wipeLocalAndMirrors(rt);
  rt.setState({
    phase: 'login',
    email: null,
    pendingCount: 0,
    uploadPrompt: false,
    accountDeletedNotice: false,
  });
  return true;
}

/**
 * 엔진이 사이클을 시작하기 전에 부른다(표식 있는 상태의 401/계정 전환/계정 삭제 처리, R1·§6).
 */
export async function verifySession(
  rt: SyncRuntime,
): Promise<'ok' | 'signed-out' | 'switch-pending' | 'offline' | 'account-deleted'> {
  const state = await getRepositories().sync.getState();
  if (state?.userSub === undefined) return 'signed-out';
  let session;
  try {
    session = await getSyncTransport().me();
  } catch (error) {
    if (isTransportError(error) && error.kind === 'account-deleted') {
      // sync.md §6: 조용히 로그아웃시키지 않는다 — 로컬 표식·데이터는 그대로 두고 안내만 띄운다.
      // 사용자가 [내보내고 지우기] 를 확인해야 비로소 지워진다(acknowledgeAccountDeleted).
      rt.setState({ accountDeletedNotice: true });
      return 'account-deleted';
    }
    return 'offline';
  }
  if (session === null) {
    // 리뷰 재확인(2차 라운드 Major, 같은 근본 원인) — 계정 삭제 안내가 이미 떠 있으면(직전
    // 사이클이 410 을 받아 `accountDeletedNotice: true` 를 켰다) 이 갈래로 덮어쓰지 않는다.
    // 안내가 뜬 뒤의 `/api/me` 는 세션 행·쿠키가 이미 지워진 채라 410 이 아니라 평범한 401(=null)
    // 이라, 여기서 그대로 진행하면 30초마다 도는 다음 사이클이 안내를 로그인 화면으로 갈아치운다
    // (사용자가 [내보내고 지우기] 를 누르기도 전에, 실측: 엔진 e2e). 표식·로컬은 그대로 두고
    // 사용자가 `acknowledgeAccountDeleted` 로 확인할 때까지 기다린다 — "말없이 버리지 않는다"
    // (ADR-0015 §5) 는 최초 감지뿐 아니라 안내가 떠 있는 동안 내내 지켜야 하는 약속이다.
    if (rt.getState().accountDeletedNotice) return 'account-deleted';
    await getRepositories().sync.setState({ deviceId: state.deviceId, cursor: 0 });
    // 리뷰 Major 3(user) — 표식이 있었는데(위에서 이미 걸러졌다) 세션만 없어졌다는 건 만료됐거나
    // 다른 기기에서("다른 기기 모두 로그아웃") 끊겼다는 뜻이다. 로그인 화면이 "왜" 를 한 줄이라도
    // 말하게 `loginNotice` 를 남긴다 — 최초 실행(표식 자체가 없던 경우, `sync-store.ts#bootstrap`)
    // 과 달리 이 경로만 지나간다.
    rt.setState({ phase: 'login', email: null, pendingCount: 0, loginNotice: 'signed-out' });
    return 'signed-out';
  }
  if (session.sub !== state.userSub) {
    // sync.md R1: 다른 계정으로 로그인 — 안내만 띄우고 아무것도 건드리지 않는다(리뷰 Major 2).
    // 예전엔 여기서 곧장 사용자 활성화 없이 `exportBackup()` 을 불렀는데, 그 경로는 대부분
    // 브라우저에서 `showSaveFilePicker` 가 거부돼 앵커 다운로드로 떨어지고(`browser-file.ts`),
    // 그 경로는 저장 완료를 확인하지 못해도 곧장 성공을 보고해 파일이 실제로 없어도 로컬을
    // 지울 수 있었다(실측). `confirmAccountSwitch` 의 사용자 클릭이 그 저장에 필요한 제스처를
    // 공급한다 — "올리기" 선택지는 여전히 없다(다른 계정 데이터를 합치는 것은 항상 틀린 동작).
    rt.setState({ accountSwitchedNotice: true });
    return 'switch-pending';
  }
  if (session.email !== state.userEmail) {
    await getRepositories().sync.setState({ ...state, userEmail: session.email });
    rt.setState({ email: session.email });
  }
  return 'ok';
}

/**
 * 계정 전환 안내의 [내보내고 지우기](리뷰 Major 2). 이전 계정 로컬을 내보내고 지운 뒤 표식을 새
 * 계정으로 연다 — cursor 0 이라 다음 엔진 사이클이 그 계정의 데이터를 전량 받는다(예전
 * `verifySession` 의 `pullAll` 특수 처리와 같은 효과를 일반 사이클이 그대로 낸다).
 */
export async function confirmAccountSwitch(
  rt: SyncRuntime,
  exportBackup: () => Promise<boolean>,
): Promise<boolean> {
  const exported = await exportBackup();
  if (!exported) return false; // 저장 취소/실패 — 안내를 다시 보여준다(호출부가 유지)
  let session;
  try {
    session = await getSyncTransport().me();
  } catch {
    return false; // 재확인 왕복 실패 — 안내를 유지하고 다음에 다시 시도한다
  }
  const state = await getRepositories().sync.getState();
  if (state === undefined) return false;
  if (session === null) {
    // 그사이 로그아웃됨 — 전환이 아니라 로그아웃으로 정리한다.
    await wipeLocalAndMirrors(rt);
    await getRepositories().sync.setState({ deviceId: state.deviceId, cursor: 0 });
    rt.setState({ phase: 'login', email: null, pendingCount: 0, accountSwitchedNotice: false });
    return true;
  }
  await wipeLocalAndMirrors(rt);
  await getRepositories().sync.setState({
    deviceId: state.deviceId,
    userSub: session.sub,
    userEmail: session.email,
    cursor: 0,
  });
  rt.setState((prev) => ({
    email: session.email,
    dataRevision: prev.dataRevision + 1,
    accountSwitchedNotice: false,
  }));
  return true;
}
