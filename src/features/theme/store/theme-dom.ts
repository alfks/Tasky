// 테마의 **DOM·브라우저 저장소 경계**. 스토어는 여기 함수만 부르고 DOM 을 직접 만지지 않는다.
//
// 첫 페인트 스크립트(`theme-init-script.ts`)가 하는 일과 **같은 결과**를 내야 한다 — 다른 결과를
// 내면 새로고침 때 화면이 한 번 튄다. 두 경로의 대조는 `theme-init-script.test.ts` 가 맡는다.
import {
  parseMirror,
  THEME_COLOR,
  THEME_MIRROR_KEY,
  type AppliedTheme,
  type ThemeMirror,
} from '@/features/theme/store/theme-state';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** 서버 렌더·프리렌더에서는 `undefined`. 호출처는 "아무것도 하지 않음" 으로 떨어진다. */
function browserWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function darkMediaQuery(): MediaQueryList | undefined {
  const win = browserWindow();
  if (win === undefined || typeof win.matchMedia !== 'function') return undefined;
  return win.matchMedia(DARK_QUERY);
}

/** `prefers-color-scheme: dark` 의 현재 값. 물어볼 수 없는 환경(SSR·구형)에서는 라이트로 본다. */
export function readSystemDark(): boolean {
  return darkMediaQuery()?.matches ?? false;
}

/** OS 테마 변경 구독 (R7). 해지 함수를 돌려준다. */
export function watchSystemDark(onChange: (dark: boolean) => void): () => void {
  const query = darkMediaQuery();
  if (query === undefined) return () => {};
  const handle = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener('change', handle);
  return () => query.removeEventListener('change', handle);
}

/**
 * 적용값을 문서에 쓴다 (R6). `data-theme` 은 tokens.css 의 다크 블록을 켜고, `color-scheme` 은
 * 스크롤바·기본 폼 컨트롤을, `--color-accent` 는 강조색을 덮는다(토큰 기본값 위에 얹는 인라인 값).
 * `theme-color` 메타는 현재 배경색을 따라간다(pwa R9).
 */
export function applyTheme(applied: AppliedTheme): void {
  if (browserWindow() === undefined) return;
  const el = document.documentElement;
  el.setAttribute('data-theme', applied.resolved);
  el.style.setProperty('color-scheme', applied.resolved);
  el.style.setProperty('--color-accent', applied.accent);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[applied.resolved]);
}

/** 미러 읽기 (R6). 차단·손상은 전부 `undefined` — 미러는 캐시라 없으면 기본값으로 시작한다. */
export function readMirror(): ThemeMirror | undefined {
  const win = browserWindow();
  if (win === undefined) return undefined;
  try {
    return parseMirror(win.localStorage.getItem(THEME_MIRROR_KEY));
  } catch {
    return undefined;
  }
}

/**
 * 미러 쓰기 (R8). **저장소에 성공적으로 쓴 값만** 넣는다 — 저장이 실패했는데 미러를 갱신하면
 * 새로고침 때 "이전 값" 대신 저장되지 않은 값이 살아난다(theme §2 의 에러 동작).
 * 실패(용량 초과·차단)는 삼킨다: 캐시가 없을 뿐 앱은 그대로 동작한다.
 */
export function writeMirror(mirror: ThemeMirror): void {
  const win = browserWindow();
  if (win === undefined) return;
  try {
    win.localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify(mirror));
  } catch {
    /* 미러는 캐시다 — 쓰지 못해도 저장소 값이 진실이라 사용자에게 알리지 않는다. */
  }
}
