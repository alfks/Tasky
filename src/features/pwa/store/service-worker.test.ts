// 업데이트 전이와 **가드**를 검증한다. jsdom 에는 ServiceWorkerContainer 가 없으므로 컨테이너를
// 직접 만든다 — 그래서 이 파일이 검증하는 것은 "우리 코드가 어떤 이벤트에 무엇을 하는가" 까지이고,
// 실제 워커 교체(skipWaiting 이 진짜 먹는가)는 Chromium 으로 따로 확인했다(PR 본문).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateStage } from '@/features/pwa/store/pwa-state';
import { watchServiceWorker, type ServiceWorkerEnv } from '@/features/pwa/store/service-worker';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();

  moveTo(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;

  install(): FakeWorker {
    const worker = new FakeWorker();
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
    return worker;
  }
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));

  /** 새 워커가 활성화돼 이 클라이언트를 claim 했다. */
  claim() {
    this.controller = new FakeWorker();
    this.dispatchEvent(new Event('controllerchange'));
  }
}

const reload = vi.fn();
let canReloadSilently = false;
let container: FakeContainer;
let stages: UpdateStage[];

beforeEach(() => {
  vi.useFakeTimers();
  reload.mockClear();
  canReloadSilently = false;
  container = new FakeContainer();
  stages = [];
});

function env(): ServiceWorkerEnv {
  return {
    container: container as unknown as ServiceWorkerContainer,
    reload,
    canReloadSilently: () => canReloadSilently,
  };
}

function start() {
  return watchServiceWorker(env(), (stage) => stages.push(stage));
}

/** register() 의 프라미스가 풀릴 때까지. */
async function settled() {
  await vi.advanceTimersByTimeAsync(0);
}

/** 이미 이 앱을 쓰고 있던 탭(= 통제 중)으로 만든다. */
function alreadyControlled() {
  container.controller = new FakeWorker();
  container.registration.active = new FakeWorker();
}

describe('첫 설치 — 업데이트가 아니다', () => {
  it('설치가 끝나도 토스트를 띄우지 않는다', async () => {
    const watcher = start();
    await settled();
    container.registration.install().moveTo('installed');
    expect(stages).toEqual([]);
    watcher.stop();
  });

  it('clientsClaim 의 controllerchange 로 새로고침하지 않는다', async () => {
    const watcher = start();
    await settled();
    container.claim();
    expect(reload).not.toHaveBeenCalled();
    expect(stages).toEqual([]);
    watcher.stop();
  });
});

describe('업데이트 감지', () => {
  it('통제 중인 탭에서 새 워커가 installed 가 되면 waiting 이다', async () => {
    alreadyControlled();
    const watcher = start();
    await settled();
    const worker = container.registration.install();
    worker.moveTo('installing');
    expect(stages).toEqual([]);
    worker.moveTo('installed');
    expect(stages).toEqual(['waiting']);
    watcher.stop();
  });

  it('등록 시점에 이미 대기 중인 워커도 waiting 이다(지난 방문에서 무시한 업데이트)', async () => {
    alreadyControlled();
    container.registration.waiting = new FakeWorker();
    const watcher = start();
    await settled();
    expect(stages).toEqual(['waiting']);
    watcher.stop();
  });

  it('등록이 실패해도 throw 하지 않는다(오프라인만 못 쓸 뿐이다)', async () => {
    container.register = vi.fn(() => Promise.reject(new Error('등록 실패')));
    const watcher = start();
    await settled();
    expect(stages).toEqual([]);
    watcher.stop();
  });
});

describe('[새로고침] — 순서가 틀리면 옛 버전이 다시 뜬다', () => {
  async function waitingWatcher() {
    alreadyControlled();
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    const watcher = start();
    await settled();
    return { watcher, waiting };
  }

  it('skipWaiting 을 먼저 보내고, 리로드는 controllerchange 를 받은 뒤에 한다', async () => {
    const { watcher, waiting } = await waitingWatcher();
    watcher.apply();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.claim();
    expect(reload).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('controllerchange 가 오지 않으면 안전망으로 새로고침한다', async () => {
    const { watcher } = await waitingWatcher();
    watcher.apply();
    await vi.advanceTimersByTimeAsync(2999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reload).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('보낼 워커가 없으면(이미 다른 탭이 적용) 리로드만 한다', async () => {
    alreadyControlled();
    const watcher = start();
    await settled();
    watcher.apply();
    expect(reload).toHaveBeenCalledTimes(1);
    watcher.stop();
  });
});

describe('다중 탭 — 다른 탭이 적용했을 때', () => {
  async function otherTabApplied() {
    alreadyControlled();
    const watcher = start();
    await settled();
    container.claim();
    return watcher;
  }

  it('보고 있는 탭은 말없이 새로고침하지 않고 알림을 띄운다', async () => {
    canReloadSilently = false;
    const watcher = await otherTabApplied();
    expect(reload).not.toHaveBeenCalled();
    expect(stages).toEqual(['activated']);
    watcher.stop();
  });

  it('숨겨져 있고 열린 패널이 없으면 조용히 새로고침한다 — 탭마다 버전이 갈리지 않는다', async () => {
    canReloadSilently = true;
    const watcher = await otherTabApplied();
    expect(reload).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('미뤄 둔 적용은 숨겨진 뒤 다시 시도할 때 끝난다', async () => {
    const watcher = await otherTabApplied();
    watcher.applySilentlyIfPending();
    expect(reload).not.toHaveBeenCalled();
    canReloadSilently = true;
    watcher.applySilentlyIfPending();
    expect(reload).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('업데이트가 없으면 다시 시도해도 아무 일도 없다', async () => {
    alreadyControlled();
    const watcher = start();
    await settled();
    canReloadSilently = true;
    watcher.applySilentlyIfPending();
    expect(reload).not.toHaveBeenCalled();
    watcher.stop();
  });
});

describe('stop', () => {
  it('등록이 끝나기 전에 정리하면 리스너를 붙이지 않는다', async () => {
    alreadyControlled();
    container.registration.waiting = new FakeWorker();
    let resolve: (reg: FakeRegistration) => void = () => {};
    container.register = vi.fn(() => new Promise<FakeRegistration>((r) => (resolve = r)));
    const watcher = start();
    watcher.stop();
    resolve(container.registration);
    await settled();
    container.registration.install().moveTo('installed');
    expect(stages).toEqual([]);
  });

  it('정리한 뒤의 이벤트는 무시한다', async () => {
    alreadyControlled();
    const watcher = start();
    await settled();
    watcher.stop();
    container.registration.install().moveTo('installed');
    container.claim();
    expect(stages).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });
});
