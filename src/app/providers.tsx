// 조립 지점(ADR-0006 규칙 6). 이 파일만 infra 를 import 할 수 있고, 이 파일을 import 할 수 있는 파일은
// main.tsx 하나다. 재export 는 금지 — 레포지토리 주입 외의 일을 하면 경계가 새어나간다.
import { useEffect, useState, type ReactNode } from 'react';

import {
  getRepositories,
  getSyncTransport,
  setRepositories,
  setSocialRepository,
  setSyncTransport,
} from '@/repositories/container';
import { createLazySocialRepository } from '@/repositories/lazy-social-repository';
import { isRepositoryError } from '@/repositories/repository-error';

import {
  activateSocialSession,
  captureSocialDispatch,
  configureSocialVerifier,
  invalidateSocialSession,
  isSocialSessionActive,
  onSocialInvalidation,
} from '@/features/social';
import { useSyncStore } from '@/features/sync';

import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Dexie 지연 로드(ADR-0013). **정적** import 였을 때 Dexie(gzip 32.6 kB)가 첫 로드 청크에 들어가 첫 페인트를
 * 막았다. 동적 import 로 바꾸면 rolldown 이 infra + dexie 를 별도 청크로 떼고, 그 청크는 진입 청크 평가와
 * **동시에** 받아지므로 첫 페인트는 기다리지 않는다.
 *
 * 모듈 스코프에서 한 번만 시작한다(컴포넌트가 여러 번 마운트돼도 요청은 1회).
 *
 * **주입 직후 `openIndexedDb()` 로 스키마를 명시적으로 연다** (TECH_PLAN §5 규칙 4). 이 한 줄이 없으면
 * Dexie 의 지연 오픈 때문에 업그레이드 실패가 **아무 조회에서나** raw Dexie 에러로 터지고, 화면은
 * "할 일을 불러오지 못했어요" 를 띄우지만 실제로는 그 기기에서 아무것도 저장할 수 없는 상태다.
 * 여기서 한 번 열어 두면 그 실패가 `RepositoryError('SCHEMA_UPGRADE_FAILED')` 로 **여기서** 잡힌다.
 * 첫 페인트 비용은 늘지 않는다 — 어차피 첫 조회가 같은 열기를 유발하고 Dexie 의 `open()` 은 멱등이다.
 */
const injection: Promise<void> = Promise.all([
  import('@/infra/indexeddb/repositories'),
  import('@/infra/sync/http-transport'),
]).then(async ([{ createIndexedDbRepositories, openIndexedDb }, { createHttpSyncTransport }]) => {
  setRepositories(createIndexedDbRepositories());
  setSyncTransport(createHttpSyncTransport());
  setSocialRepository(
    createLazySocialRepository(async () => {
      const { createHttpSocialRepository } = await import('@/infra/social/http-repository');
      return createHttpSocialRepository();
    }, captureSocialDispatch),
  );
  await openIndexedDb();
});

let socialNonce = 0;

/** 개인 로그인 표식과 실제 세션이 일치할 때만 소셜 세대를 연다. sub는 이 함수 밖으로 나가지 않는다. */
async function verifySocialIdentity(): Promise<string | null> {
  const before = useSyncStore.getState();
  if (
    before.phase !== 'ready' ||
    !before.online ||
    before.accountDeletedNotice ||
    before.accountSwitchedNotice ||
    document.hidden
  )
    return null;
  const local = await getRepositories().sync.getState();
  if (local?.userSub === undefined) return null;
  const remote = await getSyncTransport().me();
  const after = useSyncStore.getState();
  if (
    remote?.sub !== local.userSub ||
    after.phase !== 'ready' ||
    !after.online ||
    after.accountDeletedNotice ||
    after.accountSwitchedNotice ||
    document.hidden
  )
    return null;
  socialNonce += 1;
  return `scope-${String(socialNonce)}`;
}

/** 헤더·토큰·본문 없이 다른 탭에 철회만 알린다. 소셜 화면이 닫혀 있으면 왕복을 시작하지 않는다. */
function SocialSessionBridge() {
  useEffect(() => {
    const stopVerify = configureSocialVerifier(verifySocialIdentity);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tasky-social-session');
    const stopBroadcast = onSocialInvalidation((reason) => {
      if (reason === 'auth' || reason === 'account' || reason === 'revoked') {
        channel?.postMessage({ kind: 'invalidate' });
      }
    });
    const resume = () => {
      if (isSocialSessionActive()) void activateSocialSession();
    };
    const stopSync = useSyncStore.subscribe((next, previous) => {
      const wasBlocked =
        previous.phase !== 'ready' ||
        !previous.online ||
        previous.accountDeletedNotice ||
        previous.accountSwitchedNotice;
      const isBlocked =
        next.phase !== 'ready' ||
        !next.online ||
        next.accountDeletedNotice ||
        next.accountSwitchedNotice;
      if (
        (next.phase !== previous.phase && next.phase !== 'ready') ||
        (next.accountDeletedNotice && !previous.accountDeletedNotice) ||
        (next.accountSwitchedNotice && !previous.accountSwitchedNotice)
      ) {
        invalidateSocialSession(
          next.accountDeletedNotice || next.accountSwitchedNotice ? 'account' : 'auth',
        );
      } else if (!next.online && previous.online) {
        invalidateSocialSession('offline');
      }
      if (!isBlocked && wasBlocked) {
        resume();
      }
    });
    const visibility = () => {
      if (document.hidden) invalidateSocialSession('hidden');
      else resume();
    };
    const focus = () => {
      if (isSocialSessionActive()) {
        invalidateSocialSession('recheck');
        resume();
      }
    };
    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (
        typeof event.data !== 'object' ||
        event.data === null ||
        !('kind' in event.data) ||
        event.data.kind !== 'invalidate'
      )
        return;
      invalidateSocialSession('cross-tab');
      resume();
    });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
      stopSync();
      stopBroadcast();
      channel?.close();
      stopVerify();
    };
  }, []);
  return null;
}

/** 스키마가 못 올라갔을 때 (TECH_PLAN §5 규칙 4). 데이터는 그대로 있고 쓰기만 막힌다. */
const SCHEMA_FAILED_MESSAGE =
  '저장소를 열지 못했어요. 저장된 내용은 그대로 있지만 지금은 새로 저장할 수 없어요. 앱을 다시 열어도 같으면 백업 내보내기로 자료를 먼저 챙겨 주세요.';
/** 그 밖의 조립 실패 — 청크 로드 실패, IndexedDB 차단(사생활 보호 모드) 등. */
const LOAD_FAILED_MESSAGE =
  '앱을 불러오지 못했어요. 새로고침해 주세요. 계속되면 브라우저의 사생활 보호 모드를 끄거나 다른 브라우저로 열어 주세요.';

type ProvidersProps = {
  /** 앱 트리 전체. */
  children: ReactNode;
};

/** 주입이 끝나기 전 / 끝난 뒤 / 실패. 실패는 문구까지 들고 있어 렌더가 분기를 다시 판단하지 않는다. */
type Injection = { phase: 'pending' } | { phase: 'ready' } | { phase: 'failed'; message: string };

function failureOf(error: unknown): Injection {
  const schemaFailed = isRepositoryError(error) && error.code === 'SCHEMA_UPGRADE_FAILED';
  return { phase: 'failed', message: schemaFailed ? SCHEMA_FAILED_MESSAGE : LOAD_FAILED_MESSAGE };
}

/**
 * 레포지토리 주입이 끝난 뒤에만 children 을 렌더한다.
 *
 * 왜 막는가: `getRepositories()` 에는 기본값이 없다(조립 누락을 조기에 드러내려고). 주입 전에 children 이
 * 돌면 스토어가 그 자리에서 throw 한다 — 즉 **호출처 계약은 지연 로드 전과 똑같이 동기로 유지되고**,
 * 비동기가 된 구간은 이 한 곳으로 갇힌다. 그동안 보이는 것은 `Skeleton` 이다(T-27 B).
 *
 * 실패하면 스켈레톤 대신 **읽을 수 있는 안내**를 남긴다. 예전에는 스켈레톤이 영원히 남고 콘솔에만 오류가
 * 찍혔다 — 사용자에게는 "멈춘 앱" 과 구분되지 않는다. 여기 있는 것은 최소한의 안내이며, 앱 셸의
 * 오류 카드(app-shell §2-C)가 붙으면 그쪽이 문구와 [백업 내보내기] 버튼을 가져간다.
 */
export function Providers({ children }: ProvidersProps) {
  const [injected, setInjected] = useState<Injection>({ phase: 'pending' });

  useEffect(() => {
    let alive = true;
    injection.then(
      () => {
        if (alive) setInjected({ phase: 'ready' });
      },
      (error: unknown) => {
        console.error('레포지토리를 준비하지 못했습니다.', error);
        if (alive) setInjected(failureOf(error));
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (injected.phase === 'failed') {
    return (
      <div role="alert" className="p-[var(--space-4)] text-text">
        <p className="max-w-[40rem]">{injected.message}</p>
      </div>
    );
  }

  if (injected.phase === 'pending') {
    return (
      <div aria-busy="true" className="p-[var(--space-4)]">
        <Skeleton className="h-[var(--space-6)] w-[8rem]" />
      </div>
    );
  }

  return (
    <>
      <SocialSessionBridge />
      {children}
    </>
  );
}
