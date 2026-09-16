// 상단 고정 알림이 본문을 가리지 않게 자리를 비운다.
//
// `PwaNotices` 의 저장 공간 배너(pwa.md R6)는 `position: fixed; top` 이라 문서 흐름에 자리를 만들지
// 않는다. 셸이 아무것도 하지 않으면 그 배너가 **날짜 스트립 위에 그대로 얹힌다** — 1440px 에서는 월
// 표시를, 400px 에서는 ☰·타이머 칩·달성률 줄을 통째로 덮었다(실 Chromium 스크린샷).
//
// 조건을 다시 계산하지 않고 **그려진 것을 잰다**: 배너를 띄울지 말지는 pwa feature 의 규칙이고
// (`needsStorageNotice`), 그 판정을 여기에 베껴 두면 한쪽만 바뀌는 날 조용히 어긋난다. 높이를 재면
// 무엇이 뜨든 정확히 그만큼만 비운다. 배너가 없으면 0 이다.
//
// 알림 영역을 이름으로 찾는다 — `PwaNotices` 가 `aria-label` 로 붙여 둔 그 이름이다. 그 파일은 이
// 티켓의 `owns` 밖이라 전용 표식을 달 수 없었다(핸드오프에 남긴다).

/** `PwaNotices` 가 상단 알림 영역에 붙이는 접근 이름. */
export const TOP_NOTICE_SELECTOR = '[aria-label="저장 공간 알림"]';

/** 배너 아래로 두는 숨 — `--space-2`. */
export const TOP_NOTICE_GAP_PX = 8;

/** 지금 상단 알림이 차지하는 세로 길이(px). 아무것도 안 떠 있으면 0. */
export function measureTopNotice(doc: Document): number {
  const region = doc.querySelector(TOP_NOTICE_SELECTOR);
  const banner = region?.firstElementChild;
  if (!(banner instanceof HTMLElement)) return 0;
  const height = banner.getBoundingClientRect().bottom;
  return height <= 0 ? 0 : Math.round(height) + TOP_NOTICE_GAP_PX;
}

/** 알림이 뜨고 지고 접히는 것을 보고 높이를 다시 알린다. */
export function observeTopNotice(doc: Document, onChange: (px: number) => void): () => void {
  const update = (): void => onChange(measureTopNotice(doc));
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
