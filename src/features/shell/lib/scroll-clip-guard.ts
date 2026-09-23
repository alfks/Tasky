// 하단 고정 [+ 할 일] 막대가 있는 화면(<768, compact)에서, **손대지 않은 첫 화면**(scrollTop=0)의
// 마지막 조작 대상(체크박스·손잡이·⋯ 메뉴 등)이 "거의 다 보이는데 살짝만 잘린" 애매한 상태로
// 뜨는 것을 막는다.
//
// **왜 필요한가(리뷰 Major 실측).** 목록 스크롤 영역과 막대는 flex 배치라 서로 절대 겹치지 않는다
// (`ShellMain.test.tsx`) — 하지만 목록 안의 **마지막 조작 대상**이 스크롤 영역의 보이는 경계보다
// 살짝만(한 컨트롤 높이 미만) 더 아래 있으면, 그 대상이 70~95% 쯤 보이는 채로 멈춘다. 사람 눈에는
// "다 보인다"로 읽히지만 실제로는 잘려 있어, `elementFromPoint` 로 찍으면 그 지점이 하단 막대에
// 잡힌다(패딩만으로는 못 고친다 — padding-bottom 은 스크롤 **끝에** 여유를 더할 뿐, 손대지 않은
// scrollTop=0 상태에서 이미 그려진 콘텐츠의 위치는 옮기지 않는다).
//
// **왜 "스크롤 영역 전체의 넘친 양"이 아니라 "마지막 조작 대상 하나"를 본다.** 목록 아래에는
// 다이어리 카드처럼 체크박스가 아닌 다른 콘텐츠가 더 있을 수 있다 — 스크롤 영역 전체가 훨씬 더
// 많이 넘쳐도(그 뒤 콘텐츠 때문에) 정작 마지막 체크박스 자신은 이미 100% 보이는 경우가 흔하다.
// 전체 넘친 양으로 판정하면 진짜 위험한 경우(대상 자신이 잘림)를 놓치고, 안전한 경우(대상은
// 멀쩡한데 그 뒤 콘텐츠만 넘침)에 불필요하게 스크롤을 밀 수 있다 — 그래서 **대상 하나의 경계**만
// 잰다.
//
// **왜 "특정 기능(todo)의 체크박스"가 아니라 "마지막 상호작용 가능 요소"로 찾는가.** 이 파일은
// `shell` 소관이고 `todo` 의 DOM 구조(클래스·역할 이름)를 알거나 import 할 수 없다(레이어 경계).
// 대신 **역할에 무관하게** "이 스크롤 영역 안에서 가장 마지막에 있는, 손댈 수 있는 것"을 찾는다 —
// 그것이 체크박스든 버튼이든 다이어리의 `+ 기록하기` 링크든, 애매하게 잘려 있으면 똑같이 문제다.
//
// **왜 이 정도만 보정하는가.** "안 보이면 끝까지 스크롤한다" 처럼 크게 밀면 목록이 원래 5개든
// 50개든 항상 맨 위 대신 맨 아래부터 보이게 되어, 훨씬 흔한 "위에서부터 읽는" 경로를 깨뜨린다.
// 그래서 **잘린 양이 컨트롤 하나 높이(`--control-height`) 미만일 때만** — 즉 "마지막 대상 하나가
// 살짝 잘렸다"고 읽을 수 있는 딱 그만큼만 — 그 애매함을 없앨 만큼만 밀어 넣는다. 그보다 많이
// 잘리면(목록이 실제로 스크롤이 필요한 길이면) 손대지 않는다 — 그건 결함이 아니라 평범한 목록
// 스크롤이다(사용자가 스크롤해서 보면 그만이다).
//
// `--control-height`(`tokens.css`)를 쓰는 이유: 하드코딩 리터럴 대신 셸도 이미 쓰는 **전역** 컨트롤
// 치수 토큰을 "행 하나만큼"의 근사값으로 쓴다.

const CONTROL_HEIGHT_VAR = '--control-height';

/** 상호작용 가능한 요소로 볼 것들 — 특정 기능의 마크업이 아니라 **역할**로 고른다. */
const INTERACTIVE_SELECTOR =
  'button, input, a[href], [role="button"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';

/** `doc.documentElement` 에 걸린 `--control-height` 값(px). 읽을 수 없으면 0(보정 안 함). */
function controlHeightPx(doc: Document): number {
  const raw = doc.defaultView
    ?.getComputedStyle(doc.documentElement)
    .getPropertyValue(CONTROL_HEIGHT_VAR)
    .trim();
  const parsed = raw === undefined || raw === '' ? NaN : parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 스크롤 영역 안에서 DOM 순서상 마지막 상호작용 가능 요소. 없으면 null. */
function lastInteractive(scrollArea: HTMLElement): HTMLElement | null {
  const all = scrollArea.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * 지금 마지막 상호작용 대상이 "애매하게 잘린" 상태면 그 잘린 만큼(px)을, 아니면 0을 돌려준다.
 * 손대지 않은 경우(`scrollTop === 0`)에만 판정한다 — 사용자가 스스로 스크롤해 둔 자리는
 * 절대 건드리지 않는다.
 */
export function ambiguousClipPx(scrollArea: HTMLElement, doc: Document = document): number {
  if (scrollArea.scrollTop !== 0) return 0;
  const target = lastInteractive(scrollArea);
  if (target === null) return 0;
  const containerBottom = scrollArea.getBoundingClientRect().bottom;
  const targetBottom = target.getBoundingClientRect().bottom;
  const clipped = targetBottom - containerBottom;
  if (clipped <= 0) return 0; // 이미 다 보인다.
  const threshold = controlHeightPx(doc);
  return clipped <= threshold ? clipped : 0;
}

/** 애매하면 그만큼만 밀어 넣는다. 아니면 아무 일도 하지 않는다(멱등 — 여러 번 불러도 안전). */
export function guardAmbiguousClip(scrollArea: HTMLElement, doc: Document = document): void {
  const clip = ambiguousClipPx(scrollArea, doc);
  if (clip > 0) scrollArea.scrollTop = clip;
}
