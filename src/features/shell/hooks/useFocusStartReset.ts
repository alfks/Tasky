// 첫 `Tab` 이 "본문으로 건너뛰기" 로 가게 만든다 (app-shell.md R10).
//
// **왜 필요한가.** Chromium 은 다음 `Tab` 이 어디서 출발할지를 "sequential focus navigation starting
// point" 로 기억하는데, 포커스만이 아니라 **`scrollIntoView` 도 그 지점을 옮긴다.** 날짜 스트립은
// 마운트하면서 선택 셀을 가운데로 보내고(date-strip §2-B), 그 한 줄 때문에 앱을 열고 처음 누른
// `Tab` 이 건너뛰기 링크·사이드바·스트립을 통째로 지나쳐 본문 한가운데(`+ 할 일 추가`)로 갔다.
// 접근성 리뷰가 인과까지 실측했다 — `scrollIntoView` 를 no-op 로 덮으면 같은 Tab 이 정상으로 간다.
//
// 근본 해법은 그 스크롤이 시작점을 옮기지 않게 하는 것이고 `DateStrip` 은 이 티켓의 `owns` 밖이다.
// 그동안 셸에서 할 수 있는 것은 **시작점을 문서 앞으로 되돌리는 것** 하나다: `body` 에 잠깐
// `tabindex=-1` 을 주고 포커스를 줬다 빼면 시작점이 문서 처음으로 리셋된다(실측: 첫 Tab 이
// `A:본문으로 건너뛰기`).
//
// **아무도 아직 아무것도 만지지 않았을 때만** 한다 — `document.activeElement` 가 `body` 인 순간에만.
// 사용자가 이미 어딘가를 눌렀거나 포커스했으면 그 자리가 곧 시작점이어야 하고, 그것을 뺏으면
// 오히려 R10 보다 나쁜 일이 된다. 한 번만 돌고 다시는 돌지 않는다.
import { useEffect } from 'react';

export function useFocusStartReset(): void {
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    // 스트립의 스크롤은 자식 effect 에서 일어난다. 부모인 여기가 나중이지만, 부드러운 스크롤이
    // 한 프레임 뒤에 시작점을 옮기는 경우까지 덮으려고 다음 프레임에 되돌린다.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const body = document.body;
      const hadTabIndex = body.hasAttribute('tabindex');
      body.tabIndex = -1;
      body.focus();
      body.blur();
      if (!hadTabIndex) body.removeAttribute('tabindex');
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}
