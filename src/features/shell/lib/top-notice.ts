// 상단 고정 알림이 본문을 가리지 않게 자리를 비운다.
//
// **왜 아직 남아 있는가(T-30 판단).** 옳은 해법은 배너를 문서 흐름에 넣는 것인데, 그러려면 셸이
// 배너를 받을 슬롯을 내주고 `AppShell`/`ShellMain` 의 세로 흐름을 바꿔야 한다 — 두 파일 다 T-30 의
// `owns` 밖이다. 그래서 이 티켓은 **결합만 끊었다**: 아래 선택자가 더 이상 사람이 읽는 문구
// (`aria-label="저장 공간 알림"`)에 걸려 있지 않고, `PwaNotices` 가 내놓는 기계용 표식을 본다.
//
// `PwaNotices` 의 저장 공간 배너(pwa.md R6)는 `position: fixed; top` 이라 문서 흐름에 자리를 만들지
// 않는다. 셸이 아무것도 하지 않으면 그 배너가 **날짜 스트립 위에 그대로 얹힌다** — 1440px 에서는 월
// 표시를, 400px 에서는 ☰·타이머 칩·달성률 줄을 통째로 덮었다(실 Chromium 스크린샷).
//
// 조건을 다시 계산하지 않고 **그려진 것을 잰다**: 배너를 띄울지 말지는 pwa feature 의 규칙이고
// (`needsStorageNotice`), 그 판정을 여기에 베껴 두면 한쪽만 바뀌는 날 조용히 어긋난다. 높이를 재면
// 무엇이 뜨든 정확히 그만큼만 비운다. 배너가 없으면 0 이다.
//
// 표식의 단일 소스는 `PwaNotices` 의 `TOP_NOTICE_ATTR` 이다. 레이어 규칙상 이 파일이 pwa feature 를
// import 할 수는 없으므로(shell → pwa 는 배럴만, 게다가 순환) 문자열은 여기에도 한 벌 있다. 다만
// **표식은 기계용 계약**이라 문구처럼 바뀌지 않고, 어긋나면 `ShellToasts.test.tsx` 의 배선 테스트가
// 죽는다 — `ShellMain.BOTTOM_BAR_ATTR` ↔ `toast-stack.BOTTOM_BAR_SELECTOR` 와 같은 방식이다.

/** `PwaNotices` 가 상단 알림 영역에 붙이는 표식(= `TOP_NOTICE_ATTR`). */
export const TOP_NOTICE_SELECTOR = '[data-top-notice]';

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
