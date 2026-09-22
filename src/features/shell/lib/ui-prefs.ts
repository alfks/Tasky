// 사이드바·인사이트 접힘 상태의 기기별 저장 (app-shell.md R5). 백업에 들어가지 않는다 —
// 저장소가 아니라 localStorage 인 이유가 그것이다(R5 문면).
//
// 읽기·쓰기 전부 try/catch 다. 사생활 보호 모드·차단 설정에서는 접근 자체가 throw 하고,
// 그때 앱이 죽는 것보다 "접힘 상태를 기억하지 못한다" 가 맞는 실패다.
//
// **v1 → v2, 반쪽만 승계한다(리뷰 Minor — "마이그레이션 없음" 은 과했다).** v1 에는 필드가 둘뿐:
// `sidebarCollapsed`(기본 false = 컬럼이 기본)와 `insightCollapsed`(기본 false, 이름·뜻 그대로).
// **뜻이 반대인 것은 전자뿐**이라 v2 의 `sidebarPinned`(기본 false = **드로어가 기본**)로 그대로
// 옮기면 컬럼을 쓰던 사람이 전부 "고정"으로 시작한다 — 그래서 그 값은 항상 기본값에서 새로
// 시작한다. 하지만 `insightCollapsed` 는 승계하지 않을 이유가 없었다. v2 키가 아직 없을 때만
// (`migrateFromV1`) 그 값 하나를 옮기고, **옮긴 뒤에는 v1 키 자체를 지운다** — 지우지 않으면
// 아무도 다시 읽지 않는 값이 영구 쓰레기로 남는다(`ui-prefs.test.ts` 가 승계·삭제 둘 다 고정한다).

export const UI_PREFS_KEY = 'tasky.ui.v2';
/** 승계 대상 — 승계가 끝나면(또는 애초에 없었으면) 이 키에는 아무것도 남지 않는다. */
const V1_KEY = 'tasky.ui.v1';

export type UiPrefs = {
  /** 사이드바를 240px 컬럼으로 고정했는가. 기본 false — 모든 폭에서 드로어가 기본이다(§1-A). */
  sidebarPinned: boolean;
  insightCollapsed: boolean;
};

export const DEFAULT_UI_PREFS: UiPrefs = { sidebarPinned: false, insightCollapsed: false };

/** 알 수 없는 값은 기본값으로 떨어뜨린다 — 손으로 고친 localStorage 가 화면을 깨뜨리지 못하게. */
function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readUiPrefs(): UiPrefs {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (raw === null) return migrateFromV1();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_UI_PREFS;
    const record = parsed as Record<string, unknown>;
    return {
      sidebarPinned: booleanOr(record.sidebarPinned, false),
      insightCollapsed: booleanOr(record.insightCollapsed, false),
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

/**
 * v2 키가 없을 때만 불린다. `insightCollapsed` 만 승계하고(위 머리주석 근거), 끝나면 v1 키를
 * 지운다 — v1 이 아예 없었을 때는 지울 것도 없다. 깨진 v1 도 기본값(false)으로 떨어뜨리고 지운다.
 */
function migrateFromV1(): UiPrefs {
  const raw = window.localStorage.getItem(V1_KEY);
  if (raw === null) return DEFAULT_UI_PREFS;
  let insightCollapsed = false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      insightCollapsed = booleanOr((parsed as Record<string, unknown>).insightCollapsed, false);
    }
  } finally {
    window.localStorage.removeItem(V1_KEY);
  }
  return { sidebarPinned: false, insightCollapsed };
}

export function writeUiPrefs(prefs: UiPrefs): void {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 저장하지 못해도 이번 세션의 화면은 그대로다. 다음 방문에 기본값으로 열릴 뿐이다.
  }
}
