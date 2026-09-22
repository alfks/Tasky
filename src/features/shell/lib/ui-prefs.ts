// 사이드바·인사이트 접힘 상태의 기기별 저장 (app-shell.md R5). 백업에 들어가지 않는다 —
// 저장소가 아니라 localStorage 인 이유가 그것이다(R5 문면).
//
// 읽기·쓰기 전부 try/catch 다. 사생활 보호 모드·차단 설정에서는 접근 자체가 throw 하고,
// 그때 앱이 죽는 것보다 "접힘 상태를 기억하지 못한다" 가 맞는 실패다.
//
// **v1 → v2, 마이그레이션 없음(calendar-layout.md R23).** v1 의 `sidebarCollapsed`(기본 false =
// 컬럼이 기본)를 `sidebarPinned`(기본 false = **드로어가 기본**)로 뒤집었다 — 값의 *뜻*이 반대라
// v1 값을 그대로 옮기면 컬럼을 쓰던 사람이 전부 "고정"으로 시작하게 된다. 그래서 키 자체를 올려
// v1 은 그냥 버린다(잃는 것은 인사이트 접힘 선호 하나뿐, 1회성이라 안내하지 않는다).

export const UI_PREFS_KEY = 'tasky.ui.v2';

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
    if (raw === null) return DEFAULT_UI_PREFS;
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

export function writeUiPrefs(prefs: UiPrefs): void {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 저장하지 못해도 이번 세션의 화면은 그대로다. 다음 방문에 기본값으로 열릴 뿐이다.
  }
}
