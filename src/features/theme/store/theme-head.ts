// 첫 페인트에 필요한 <head> 조각들 (theme R6·R13). `layout.tsx` 가 이 둘만 가져다 심는다.
//
// 1) THEME_INIT_SCRIPT — 동기 인라인 스크립트.
//
// 왜 문자열인가: 저장소(IndexedDB)도 React 렌더도 비동기라 첫 페인트를 따라잡지 못한다. 파서가
// 이 줄을 만나는 순간 <body> 는 아직 그려지지 않았으므로, 여기서 data-theme 을 정하면 다크 사용자가
// 흰 화면을 한 프레임도 보지 않는다. 같은 이유로 defer·module·외부 파일 어느 것도 쓸 수 없다.
//
// 2) FONT_PRELOAD — 폰트 preload 링크 속성(R13).
//
// 이 스크립트와 `theme-state.ts`/`theme-dom.ts` 는 같은 규칙을 두 언어로 적은 셈이라 드리프트가
// 유일한 위험이다 — `theme-init-script.test.ts` 가 스크립트를 실제로 실행해 두 경로의 결과를 대조한다.
import { THEME_COLOR, THEME_MIRROR_KEY } from '@/features/theme/store/theme-state';

// JSON.stringify 로 넣어 따옴표·이스케이프를 맞춘다(값은 상수지만 손으로 따옴표를 붙이지 않는다).
const KEY = JSON.stringify(THEME_MIRROR_KEY);
const LIGHT = JSON.stringify(THEME_COLOR.light);
const DARK = JSON.stringify(THEME_COLOR.dark);

/**
 * `<script>` 안에 그대로 넣을 소스. try/catch 로 감싸 **어떤 실패도 렌더를 막지 않는다** —
 * localStorage 차단(프라이빗 모드)·JSON 손상·matchMedia 부재 모두 "기본값으로 그린다"로 떨어진다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var e=document.documentElement;
var s=null;try{var r=window.localStorage.getItem(${KEY});if(r)s=JSON.parse(r)}catch(_){}
var m=s&&(s.theme==="light"||s.theme==="dark"||s.theme==="system")?s.theme:"system";
var q=window.matchMedia;
var d=m==="dark"||(m==="system"&&typeof q==="function"&&q("(prefers-color-scheme: dark)").matches);
var t=d?"dark":"light";
e.setAttribute("data-theme",t);
e.style.setProperty("color-scheme",t);
var a=s&&s.accent?s.accent[t]:null;
if(typeof a==="string"&&/^#[0-9A-Fa-f]{6}$/.test(a))e.style.setProperty("--color-accent",a);
var c=document.querySelector('meta[name="theme-color"]');
if(c)c.setAttribute("content",d?${DARK}:${LIGHT});
}catch(_){}})();`.replace(/\n/g, '');

/**
 * 폰트 preload (R13: `<head>` 에 preload 1건). **파일명의 해시는 `src/styles/fonts.css` 가 단일
 * 소스**이고(서브셋 스크립트가 둘을 함께 갱신한다 — R14), 여기 값이 그와 어긋나면 preload 가
 * 실제로 받는 파일과 달라져 폰트를 두 번 받는다. `theme-head.test.ts` 가 fonts.css 를 읽어 대조한다.
 */
export const FONT_PRELOAD = {
  rel: 'preload',
  as: 'font',
  type: 'font/woff2',
  href: '/fonts/PretendardVariable.subset-74f8c71d.woff2',
  /** 폰트는 같은 출처라도 CORS 모드로 받는다 — 빠뜨리면 preload 가 재사용되지 않고 두 번 받는다. */
  crossOrigin: 'anonymous',
} as const;
