// 하단 고정 [+ 할 일] 막대가 목록의 마지막 줄을 가리지 않게, 목록 스크롤 영역에 그 높이만큼
// 빈 공간(padding-bottom)을 둔다.
//
// **왜 실측하는가(top-notice.ts 와 같은 이유).** 막대 높이는 `--space-2` 패딩·버튼
// `--control-height`·`env(safe-area-inset-bottom)`(노치 기기) 조합으로 정해지는데, 이 값을 여기에
// 다시 계산해 적으면 그중 하나만 바뀌어도 조용히 어긋난다(리뷰 Major — 실측: 360px, 카테고리
// 2개·할 일 9개, 배너를 닫은 상태에서 마지막 행 체크박스 중심이 `elementFromPoint` 로 막대에
// 잡혔다 — 스크롤 영역이 막대 높이만큼 여지를 두지 않아 목록을 끝까지 내려도 마지막 줄이 막대
// 바로 아래 경계에 붙어 있었다). 그려진 것을 그대로 재면 막대 쪽이 무엇으로 바뀌든 정확히 그만큼만
// 비운다. 막대가 없으면(≥768, `showBottomAdd=false`) 0이다.
//
// 표식의 단일 소스는 `ShellMain` 의 `BOTTOM_BAR_ATTR` 이다. 이 파일이 `ShellMain` 을 import 하면
// (컴포넌트 → lib) 순환이 생기므로, `toast-stack.ts` 가 이미 쓰는 것과 같은 방식으로 선택자 문자열을
// 다시 적는다 — **표식은 기계용 계약**이라 문구처럼 갈라지지 않고, 어긋나면 `ShellMain.test.tsx` 의
// `BOTTOM_BAR_ATTR` 배선이 죽는다.

/** `ShellMain` 이 하단 막대에 붙이는 표식(= `BOTTOM_BAR_ATTR`). */
export const BOTTOM_BAR_SELECTOR = '[data-shell-bottom-bar]';

/** 지금 하단 막대가 차지하는 세로 길이(px). 막대가 없으면 0. */
export function measureBottomBar(doc: Document): number {
  const bar = doc.querySelector(BOTTOM_BAR_SELECTOR);
  if (!(bar instanceof HTMLElement)) return 0;
  const height = bar.getBoundingClientRect().height;
  return height <= 0 ? 0 : Math.round(height);
}

/** 막대가 뜨고 지고 높이가 바뀌는 것을 보고 다시 알린다(top-notice.ts 의 `observeTopNotice` 와 같은 패턴). */
export function observeBottomBar(doc: Document, onChange: (px: number) => void): () => void {
  const update = (): void => onChange(measureBottomBar(doc));
  update();
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(update);
  observer.observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('resize', update);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', update);
  };
}
