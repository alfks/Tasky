// 하단 고정 [+ 할 일] 막대가 목록의 마지막 줄을 가리지 않게, 목록 스크롤 영역에 그 높이만큼
// 빈 공간(padding-bottom)을 둔다.
//
// **왜 실측하는가(top-notice.ts 와 같은 이유).** 막대 높이는 `--space-2` 패딩·버튼
// `--control-height`·`env(safe-area-inset-bottom)`(노치 기기) 조합으로 정해지는데, 이 값을 여기에
// 다시 계산해 적으면 그중 하나만 바뀌어도 조용히 어긋난다(리뷰 Major — 실측: 360px, 카테고리
// 2개·할 일 9개, 배너를 닫은 상태에서 마지막 행 체크박스 중심이 `elementFromPoint` 로 막대에
// 잡혔다 — 스크롤 영역이 막대 높이만큼 여지를 두지 않아 목록을 끝까지 내려도 마지막 줄이 막대
// 바로 아래 경계에 붙어 있었다). 그려진 것을 그대로 재면 막대 쪽이 무엇으로 바뀌든 정확히 그만큼만
// 비운다. 막대가 없으면(≥680 — wide·mid, `showBottomAdd=false`) 0이다.
//
// **최종 리뷰가 "이 실측 자체가 불필요하지 않은가"를 물었다** — 결론은 **여전히 필요하다**다.
// `--space-3` 고정값으로 줄여서 재현해 보면(360px·`TARGET_OVERFLOW=250` 스크롤 전 상태,
// `tests/e2e/narrow-viewport.spec.ts` 의 두 번째 케이스) 실제 마지막 할 일 체크박스가 **통째로**
// 하단 막대 경계 너머로 밀려 완전히 사라졌다(`useGuardAmbiguousClip` 은 목록의 **진짜 마지막
// 조작 대상**만 보는데, 그 뒤에 다이어리 카드가 더 있어 이 체크박스는 그 훅의 보호 대상이 아니다
// — 실측으로 확인, 이 헤더 주석 아래 "무엇을 뺐는가" 참고). 그래서 이 실측(`measureBottomBar`)은
// 남긴다 — 단 `ShellMain.tsx` 쪽에서 그 위에 얹던 여분의 `--space-3` 간격은 뺐다(중복 여백이었고,
// 그 12px 을 빼도 위 회귀 테스트는 여전히 통과한다, 실측 확인).
//
// **선택자는 `toast-stack.ts` 에서 그대로 가져온다.** 예전 머리주석은 "`ShellMain` 을 import하면
// (컴포넌트 → lib) 순환이 생긴다"를 근거로 `toast-stack.ts` 와 같은 선택자 문자열을 여기 다시
// 적었는데, 그 근거는 `ShellMain` 을 두고 한 말이지 `toast-stack.ts` 에는 해당하지 않는다 —
// `toast-stack.ts` 는 이 파일과 **같은 lib/ 디렉토리·같은 레이어**라 import 해도 순환이 없다
// (최종 리뷰 Minor 지적). 표식 자체의 단일 소스는 여전히 `ShellMain` 의 `BOTTOM_BAR_ATTR` 이고,
// 두 파일 다 그 표식을 문구가 아니라 선택자 문자열로만 공유한다.
import { BOTTOM_BAR_SELECTOR } from '@/features/shell/lib/toast-stack';

export { BOTTOM_BAR_SELECTOR };

/** 지금 하단 막대가 차지하는 세로 길이(px). 막대가 없으면 0. */
export function measureBottomBar(doc: Document): number {
  const bar = doc.querySelector(BOTTOM_BAR_SELECTOR);
  if (!(bar instanceof HTMLElement)) return 0;
  const height = bar.getBoundingClientRect().height;
  return height <= 0 ? 0 : Math.round(height);
}

/**
 * 막대가 뜨고 지고 높이가 바뀌는 것을 보고 다시 알린다.
 *
 * 계산은 `toast-stack.ts` 의 `observeToastViewports` 와 같은 이유로 **다음 프레임으로 모아 한
 * 번만** 한다 — 예전에는 `document.body` 전체의 `childList` mutation 마다 매번 동기 레이아웃
 * (`getBoundingClientRect`)을 강제해, 같은 커밋(체크·추가·삭제가 한 번에 여러 DOM 변경을 낼 때)
 * 안에서 그 수만큼 강제 레이아웃이 반복됐다(최종 리뷰 Minor — 성능 지적). rAF 로 모으면 그 프레임
 * 안의 모든 mutation 을 한 번의 레이아웃으로 해소한다.
 */
export function observeBottomBar(doc: Document, onChange: (px: number) => void): () => void {
  const update = (): void => onChange(measureBottomBar(doc));
  update();
  if (typeof MutationObserver !== 'function') return () => {};

  let frame: number | null = null;
  const schedule = (): void => {
    if (frame !== null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (raf === null) {
      update();
      return;
    }
    frame = raf(() => {
      frame = null;
      update();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  };
}
