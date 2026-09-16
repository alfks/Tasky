// 저장소 지속성·용량·기기별 기억의 브라우저 배선 (specs/pwa.md R6·R7).
//
// **왜 DI 인가**: jsdom 에는 `navigator.storage` 도 `StorageManager` 도 없다. 목으로 심으면 있는 척만
// 하게 되므로, "없을 때" 와 "거부될 때" 를 **둘 다 인자로 만들어** 각각을 테스트한다. 실제 브라우저의
// 값이 정확한지는 이 코드가 보장할 수 없다 — 그래서 부정확한 값이 와도 UI 가 깨지지 않게 접는다.
import {
  EMPTY_MEMORY,
  PWA_MEMORY_KEY,
  parseMemory,
  serializeMemory,
  type PersistState,
  type PwaMemory,
  type StorageEstimate,
} from '@/features/pwa/store/pwa-state';

export type StorageEnv = {
  /** `navigator.storage`. 없는 브라우저에서는 `null`. */
  manager: StorageManager | null;
  /** `localStorage`. 사생활 보호 모드·차단 설정에서는 접근 자체가 throw 하므로 `null` 일 수 있다. */
  memory: Storage | null;
};

/** 실제 브라우저 환경. 어느 쪽이든 없거나 막혀 있으면 `null` 이 들어간다. */
export function getStorageEnv(): StorageEnv {
  let manager: StorageManager | null = null;
  let memory: Storage | null = null;
  try {
    manager = typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : null;
  } catch {
    manager = null;
  }
  try {
    memory = typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    memory = null;
  }
  return { manager, memory };
}

/**
 * 지속성을 1회 요청한다 (R6). **거부는 정상 경로다** — 조용히 삼키지 않고 `denied` 로 돌려준다.
 *
 * 예외(`persist()` 가 throw)는 `unsupported` 로 접는다: 어느 쪽이든 "보장을 못 받았다" 가 결론이고
 * 사용자에게 보이는 배너도 같지만, 상태를 보면 원인은 구분된다.
 */
export async function requestPersistence(env: StorageEnv): Promise<PersistState> {
  const manager = env.manager;
  if (manager === null || typeof manager.persist !== 'function') return 'unsupported';
  try {
    return (await manager.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * 사용량을 읽는다 (R7). 브라우저마다 정확도가 다르고 아예 없기도 하다 —
 * 못 읽으면 `null` 이고, 호출한 쪽은 경고를 띄우지 않는다(값이 0 이어도 마찬가지).
 */
export async function readEstimate(env: StorageEnv): Promise<StorageEstimate> {
  const manager = env.manager;
  if (manager === null || typeof manager.estimate !== 'function') return null;
  try {
    const { usage, quota } = await manager.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number') return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** 기기별 기억을 읽는다. 읽을 수 없으면 "아무것도 하지 않은 상태" 로 본다. */
export function readMemory(env: StorageEnv): PwaMemory {
  if (env.memory === null) return EMPTY_MEMORY;
  try {
    return parseMemory(env.memory.getItem(PWA_MEMORY_KEY));
  } catch {
    return EMPTY_MEMORY;
  }
}

/**
 * 기기별 기억을 쓴다. 실패는 무시한다 — 쓰지 못하면 다음 방문에 한 번 더 묻게 될 뿐이고,
 * 여기서 throw 하면 투두 저장 직후 앱이 멈춘다.
 */
export function writeMemory(env: StorageEnv, memory: PwaMemory): void {
  if (env.memory === null) return;
  try {
    env.memory.setItem(PWA_MEMORY_KEY, serializeMemory(memory));
  } catch {
    // 용량 초과·차단. 기억하지 못할 뿐이다.
  }
}
