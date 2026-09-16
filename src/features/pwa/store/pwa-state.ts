// PWA 상태의 **모양과 순수 판정**만 모았다 (specs/pwa.md R4·R6·R7).
// 브라우저 API·React·zustand 를 전혀 모른다 — 그래서 이 파일의 테스트는 목이 하나도 없다.
// 브라우저 API 배선은 `service-worker.ts`(업데이트)·`storage.ts`(지속성·용량)가 맡는다.

/**
 * 새 서비스워커의 단계. 토스트를 띄울지, [새로고침] 이 무엇을 해야 하는지가 여기서 갈린다.
 *
 * - `idle`: 새 버전 없음(첫 설치 포함 — 첫 설치는 업데이트가 아니다).
 * - `waiting`: 새 워커가 `waiting` 이다. [새로고침] 은 `skipWaiting` 을 보낸 **뒤** 리로드해야 한다.
 *   먼저 리로드하면 대기 중인 워커는 그대로 대기 상태라 **옛 버전이 다시 뜬다**.
 * - `activated`: 다른 탭이 이미 적용해 새 워커가 이 탭까지 `claim` 했다. 보낼 메시지가 없고
 *   리로드만 하면 된다. 이 탭의 JS 는 아직 옛 번들이므로 방치하면 탭마다 버전이 갈린다.
 */
export type UpdateStage = 'idle' | 'waiting' | 'activated';

/**
 * `navigator.storage.persist()` 의 결과. **거부(`denied`)와 미지원(`unsupported`)을 가른다** —
 * 둘 다 "저장 공간이 보장되지 않는다" 라서 같은 배너를 띄우지만, 원인이 다르면 다음에 할 일이
 * 다르다(거부는 사용자 설치·상호작용으로 뒤집힐 수 있고, 미지원은 브라우저를 바꿔야 한다).
 * 어느 쪽도 조용히 삼키지 않는다.
 */
export type PersistState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** `navigator.storage.estimate()` 결과. 값을 못 얻었으면 `null`. */
export type StorageEstimate = { readonly usage: number; readonly quota: number } | null;

/** 용량 경고 임계치 (R7). */
export const QUOTA_WARN_RATIO = 0.8;

/** 배너·토스트가 쓰는 문구. 세 곳 이상에서 쓰이므로 상수로 둔다(code-style §3). */
export const STORAGE_NOTICE_TEXT = '이 브라우저가 저장 공간을 보장하지 않아요. 백업을 권해요';
export const UPDATE_NOTICE_TEXT = '새 버전이 준비됐어요';
/** R7 — 백업 다이얼로그 상단에 그대로 붙는다(백업 티켓이 `selectIsStorageTight` 와 함께 쓴다). */
export const STORAGE_TIGHT_TEXT = '저장 공간이 거의 찼어요. 지금 백업해 두는 것을 권해요';

/**
 * 사용률(0~1). **못 믿을 값은 전부 `null`** 로 접는다 — 브라우저마다 `estimate()` 의 정확도가
 * 다르고 아예 0 을 주기도 한다(Safari 는 `quota` 를 임의 상한으로 깎는다). `quota` 가 0 이면
 * 나눗셈이 `Infinity`/`NaN` 이 되어 "100% 이상" 경고가 상시로 뜬다 — 그 경로를 여기서 끊는다.
 */
export function usageRatio(estimate: StorageEstimate): number | null {
  if (estimate === null) return null;
  const { usage, quota } = estimate;
  if (!Number.isFinite(usage) || !Number.isFinite(quota)) return null;
  if (quota <= 0 || usage < 0) return null;
  return usage / quota;
}

/** 용량 경고를 띄울 때인가 (R7). 값을 못 얻었으면 경고하지 않는다. */
export function isQuotaTight(estimate: StorageEstimate): boolean {
  const ratio = usageRatio(estimate);
  return ratio !== null && ratio > QUOTA_WARN_RATIO;
}

/** 지속성 배너를 띄워야 하는 결과인가 (R6). `unknown` 은 아직 묻지 않은 것이라 띄우지 않는다. */
export function needsStorageNotice(persist: PersistState): boolean {
  return persist === 'denied' || persist === 'unsupported';
}

/** 기기별 기억의 키 (R6). 저장소 데이터가 아니라 localStorage 다. */
export const PWA_MEMORY_KEY = 'tasky.pwa.v1';

/**
 * 기기별 기억. `persistAsked` 가 true 면 `persist()` 를 **다시 묻지 않는다**(R6),
 * `noticeDismissed` 가 true 면 배너를 다시 띄우지 않는다(1회성 알림 — backup R14 의 상시 경고 점과 다르다).
 */
export type PwaMemory = {
  readonly persistAsked: boolean;
  readonly noticeDismissed: boolean;
};

export const EMPTY_MEMORY: PwaMemory = { persistAsked: false, noticeDismissed: false };

/**
 * 저장된 문자열 → 기억. 남의 값·깨진 JSON·구버전 모양이 들어와도 기본값으로 접는다 —
 * 여기서 throw 하면 앱 시작이 통째로 막힌다.
 */
export function parseMemory(raw: string | null): PwaMemory {
  if (raw === null) return EMPTY_MEMORY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_MEMORY;
    const record = parsed as Record<string, unknown>;
    return {
      persistAsked: record.persistAsked === true,
      noticeDismissed: record.noticeDismissed === true,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

/** 기억 → 저장할 문자열. */
export function serializeMemory(memory: PwaMemory): string {
  return JSON.stringify(memory);
}
