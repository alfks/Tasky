// 서비스워커 등록과 업데이트 배선 (specs/pwa.md R4·R5·R8).
//
// **왜 DI 인가**: `ServiceWorkerContainer` 는 jsdom 에 없고, 있어도 실제 설치/대기/활성 전이를 낼 수
// 없다. 그래서 컨테이너·리로드·"지금 조용히 새로고침해도 되는가" 를 인자로 받는다. 목 테스트는 전이
// 순서와 가드를 검증하고, **실제 두 버전의 교체는 Chromium 으로 따로 확인한다**(PR 본문 절차).
//
// **[새로고침] 이 실제로 새 버전을 띄우는 이유**: `src/sw.ts` 는 `skipWaiting: false` 라, serwist 가
// `{type:'SKIP_WAITING'}` 메시지 리스너를 대신 심어 둔다(빌드 산출물 `dist/client/sw.js` 에서 실측).
// 그래서 순서가 **메시지 → controllerchange → reload** 여야 한다. 먼저 리로드하면 대기 중인 워커는
// 그대로 대기라서 옛 번들이 다시 뜬다(이 순서를 뒤집으면 service-worker.test.ts 가 깨진다).
import type { UpdateStage } from '@/features/pwa/store/pwa-state';

/** 등록 대상. `src/sw.ts` 의 빌드 산출물 경로(serwist.config.js 의 `swDest`). */
export const SW_URL = '/sw.js';

/** `skipWaiting` 을 보냈는데 `controllerchange` 가 오지 않을 때의 안전망. */
const APPLY_FALLBACK_MS = 3000;

export type ServiceWorkerEnv = {
  container: ServiceWorkerContainer;
  /** 기본값 `SW_URL`. */
  scriptUrl?: string;
  reload: () => void;
  /**
   * 이 탭을 **묻지 않고** 새로고침해도 잃을 것이 없는가.
   * 편집 패널·대화상자가 열려 있거나 화면에 보이는 중이면 false 여야 한다 — 다른 탭의 업데이트가
   * 사용자가 입력하던 화면을 날려 버리는 경로다.
   */
  canReloadSilently: () => boolean;
};

export type UpdateWatcher = {
  /** 토스트의 [새로고침]. 단계에 따라 `skipWaiting` 을 보내거나 바로 리로드한다. */
  apply: () => void;
  /** 조용히 새로고침해도 되는 상황이 되었을 때 다시 시도한다(탭이 숨겨졌을 때 등). */
  applySilentlyIfPending: () => void;
  /** 리스너 정리. */
  stop: () => void;
};

/** 프로덕션 빌드에서만 등록한다 (R5). `process` 가 없는 런타임에서는 등록하지 않는다. */
export function isProductionRuntime(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/** 이 브라우저가 서비스워커를 지원하는가. 지원하지 않으면 조용히 아무것도 하지 않는다(§2 에러). */
export function getServiceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined') return null;
  return 'serviceWorker' in navigator ? navigator.serviceWorker : null;
}

/**
 * 등록하고 새 워커를 지켜본다. 돌려주는 `apply()` 는 등록이 끝나기 전에 눌려도 안전하다.
 *
 * 등록 실패는 조용히 무시한다(§2 에러 — 오프라인만 못 쓸 뿐 앱은 전부 동작한다).
 */
export function watchServiceWorker(
  env: ServiceWorkerEnv,
  onStage: (stage: UpdateStage) => void,
): UpdateWatcher {
  const { container } = env;
  // **첫 설치 판별의 핵심**: clientsClaim 때문에 첫 설치도 controllerchange 를 낸다. 등록 시점에
  // controller 가 없었다면 그 이벤트는 업데이트가 아니라 첫 장악이다 — 토스트를 띄우면 안 된다.
  const hadController = container.controller !== null;
  const cleanups: (() => void)[] = [];
  let registration: ServiceWorkerRegistration | null = null;
  let stage: UpdateStage = 'idle';
  let applying = false;
  let stopped = false;

  const setStage = (next: UpdateStage) => {
    if (stage === next) return;
    stage = next;
    onStage(next);
  };

  const listen = (target: EventTarget, type: string, handler: () => void) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  listen(container, 'controllerchange', () => {
    if (!hadController) return; // 첫 장악 — 업데이트가 아니다
    if (applying || env.canReloadSilently()) {
      env.reload();
      return;
    }
    // 다른 탭이 적용했다. 이 탭의 JS 는 아직 옛 번들이므로 사용자에게 알리고 새로고침을 받는다.
    setStage('activated');
  });

  void container
    .register(env.scriptUrl ?? SW_URL)
    .then((reg) => {
      // 정리된 뒤에 등록이 풀릴 수 있다 — 여기서 막지 않으면 리스너가 다시 붙어 영영 떨어지지 않는다.
      if (stopped) return;
      registration = reg;
      // 이미 대기 중인 워커(이전 방문에서 설치만 되고 무시된 것)도 업데이트다.
      if (reg.waiting !== null && reg.active !== null) setStage('waiting');
      listen(reg, 'updatefound', () => {
        const installing = reg.installing;
        if (installing === null) return;
        listen(installing, 'statechange', () => {
          // `installed` + 이미 통제 중 = 교체 대기. 통제 중이 아니면 첫 설치다.
          if (installing.state === 'installed' && container.controller !== null)
            setStage('waiting');
        });
      });
    })
    .catch(() => {
      // 등록 실패는 무시한다(R5 §2). 개발 모드에서는 애초에 여기까지 오지 않는다.
    });

  const reloadAfterApply = () => {
    applying = true;
    const timer = globalThis.setTimeout(() => env.reload(), APPLY_FALLBACK_MS);
    cleanups.push(() => globalThis.clearTimeout(timer));
  };

  return {
    apply: () => {
      const waiting = registration?.waiting ?? null;
      if (waiting === null) {
        // 'activated' 이거나 등록이 아직 안 끝났다 — 보낼 메시지가 없으니 리로드만 한다.
        env.reload();
        return;
      }
      reloadAfterApply();
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    applySilentlyIfPending: () => {
      if (stage === 'activated' && env.canReloadSilently()) env.reload();
    },
    stop: () => {
      stopped = true;
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
    },
  };
}
