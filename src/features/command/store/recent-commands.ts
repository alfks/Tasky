/**
 * 최근 실행한 명령 5개를 기기별로 기억한다(R12, `localStorage` 키 `tasky.palette.v1`).
 *
 * 백업에 들어가지 않는 기기 취향이라 저장소가 아니라 `localStorage` 다(app-shell R5 와 같은 결).
 * 시크릿 창·저장소 차단에서는 읽기도 쓰기도 **throw** 할 수 있어 양쪽 다 감싼다 — 기억을 못 하는
 * 것은 불편이지만, 그 예외가 팔레트를 못 열게 만들면 기능이 사라진다.
 */
export const RECENT_COMMANDS_KEY = 'tasky.palette.v1';

const LIMIT = 5;

/** 저장된 목록. 깨진 값은 빈 목록으로 본다. */
export function readRecentCommands(storage: Storage | null = safeStorage()): string[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(RECENT_COMMANDS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** 목록을 저장한다. 실패는 삼키되(위 주석) 호출처에 결과를 알린다. */
export function writeRecentCommands(
  ids: readonly string[],
  storage: Storage | null = safeStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids.slice(0, LIMIT)));
    return true;
  } catch {
    return false;
  }
}

/** `localStorage` 접근 자체가 던지는 환경이 있다(차단된 서드파티 컨텍스트). */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
