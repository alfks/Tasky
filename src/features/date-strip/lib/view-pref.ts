// 보기 모드(주/월)의 기기별 저장 (date-strip.md R14). 백업·동기화에 들어가지 않는다 — 셸의
// 접힘 상태(app-shell.md R5, `shell/lib/ui-prefs.ts`)와 같은 부류라 저장소가 아니라 localStorage 다.
// 같은 관용구인데 여기 따로 두는 이유: date-strip 은 shell 을 import 할 수 없다(조립되는 쪽).
//
// **선택 날짜는 여기 없다(R2).** 앱을 열면 언제나 오늘이고, 이 파일이 기억하는 것은 "어떤 모양으로
// 보고 있었나" 하나뿐이다. 선택이 언제나 오늘이면 월 격자도 언제나 오늘이 든 달이라 두 상태가
// 어긋날 일이 없다.
//
// 읽기·쓰기 전부 try/catch 다. 사생활 보호 모드·차단 설정에서는 접근 자체가 throw 하고, 그때
// 앱이 죽는 것보다 화면 폭에 맞는 기본 보기로 여는 편이 낫다.

/** 기기별 저장 키. 값은 `{ view: 'week' | 'month' }` 하나다. */
export const VIEW_PREF_KEY = 'tasky.datestrip.v1';

/** 날짜를 보여주는 두 가지 모양 (R14). `week` 는 한 줄 7칸, `month` 는 달력 격자다. */
export type DateStripView = 'week' | 'month';

/** 넓은 화면의 기본 보기. 좁은 화면은 저장된 선택이 없을 때 월 보기로 연다. */
export const DEFAULT_VIEW: DateStripView = 'week';

function defaultView(): DateStripView {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 679.98px)').matches
    ? 'month'
    : DEFAULT_VIEW;
}

function isView(value: unknown): value is DateStripView {
  return value === 'week' || value === 'month';
}

/** 저장된 보기를 우선한다. 없거나 깨졌으면 현재 화면 폭에 맞는 기본 보기다. */
export function readViewPref(): DateStripView {
  try {
    const raw = window.localStorage.getItem(VIEW_PREF_KEY);
    if (raw === null) return defaultView();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultView();
    const { view } = parsed as Record<string, unknown>;
    return isView(view) ? view : defaultView();
  } catch {
    return defaultView();
  }
}

export function writeViewPref(view: DateStripView): void {
  try {
    window.localStorage.setItem(VIEW_PREF_KEY, JSON.stringify({ view }));
  } catch {
    // 저장하지 못해도 이번 세션의 보기는 그대로다. 다음 방문엔 화면 폭의 기본 보기로 연다.
  }
}
