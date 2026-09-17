/**
 * 문서 전역 `keydown` 하나로 등록된 단축키를 실행한다. `<CommandLayer/>` 만 부른다.
 *
 * ## 오버레이와 싸우지 않는 방법
 * 스택(`overlay-stack.ts`)이 **비어 있는가**만 본다 — 대화상자·팝오버·메뉴가 하나도 열려 있지
 * 않을 때만 전역 단축키가 돈다.
 *
 * 예전에는 디스패처가 **자기 자신을 맨 아래 레이어로 밀어 넣고** "내가 맨 위인가" 로 같은 판정을
 * 했다. 결과는 같았지만, 그 레이어는 DOM 도 포커스도 없는 **가짜 오버레이**라 스택의 뜻("열려 있는
 * 오버레이", `overlay-rules.ts` 가 규정하는 그 오버레이)을 깼다. 앱이 살아 있는 내내 스택 크기가
 * 최소 1 이었고, "오버레이가 전부 닫히면" 을 기다리던 PWA 업데이트 토스트가 **영영 뜨지 않았다**
 * (T-44 실측: 조립된 앱에서 `overlayLayerCount()` 가 상수 1). 스택에는 화면에 실제로 떠 있는
 * 것만 들어간다 — 여기서는 읽기만 한다.
 *
 * ## 버블 단계인 이유
 * 캡처로 받으면 포커스가 날짜 스트립 안에 있을 때 스트립보다 **먼저** `←` 를 먹는다. 그러면 스트립의
 * 로빙 포커스와 전역 이동이 둘 다 돌아 날짜가 두 칸 움직인다. 버블로 받고 `defaultPrevented` 를
 * 존중하면, 가까운 처리기가 있으면 그쪽이 이기고 없을 때만 전역이 움직인다.
 */
import { useEffect } from 'react';

import { shortcutBlockReason } from '@/features/command/lib/event-guards';
import { isMacPlatform } from '@/features/command/lib/key-label';
import { useCommandStore } from '@/features/command/store/command-store';
import { shortcutDefinition } from '@/features/command/store/shortcut-catalog';
import { findShortcutFor } from '@/features/command/store/shortcut-registry';

import { overlayLayerCount } from '@/components/ui/overlay-stack';

export function useShortcutDispatch(): void {
  useEffect(() => {
    const isMac = isMacPlatform();

    const handleKeyDown = (e: KeyboardEvent) => {
      const entry = findShortcutFor(useCommandStore.getState().shortcuts, e, isMac);
      if (entry === undefined) return;
      const blocked = shortcutBlockReason(e, {
        isOverlayOpen: overlayLayerCount() > 0,
        allowInEditable: shortcutDefinition(entry.id).allowInEditable === true,
      });
      if (blocked !== null) return;
      // 화살표의 페이지 스크롤, Firefox 의 Mod+K 검색창(R4) 같은 기본 동작을 막는다.
      e.preventDefault();
      entry.run?.(e);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
