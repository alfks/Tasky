/**
 * 문서 전역 `keydown` 하나로 등록된 단축키를 실행한다. `<CommandLayer/>` 만 부른다.
 *
 * ## 오버레이와 싸우지 않는 방법
 * 스택 API(`overlay-stack.ts`)는 "내가 맨 위인가" 만 알려 준다. 그래서 디스패처가 **자기 자신을
 * 맨 아래 레이어로 밀어 넣는다**: 아무 오버레이도 열려 있지 않으면 이 레이어가 맨 위이고, 대화상자·
 * 팝오버·메뉴가 하나라도 열리면 그 위로 쌓여 더 이상 맨 위가 아니다. 즉 "오버레이가 열려 있는가" 를
 * 별도 카운터 없이, 오버레이들이 이미 쓰는 바로 그 사실로 판정한다 — 두 개의 진실이 생기지 않는다.
 * 이 레이어는 DOM 이 없고(`contains` 는 항상 거짓) 포커스를 가두지 않아, 위 레이어들의 Esc·Tab·
 * 바깥 클릭 판정에 전혀 끼어들지 않는다.
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

import { isTopOverlayLayer, pushOverlayLayer } from '@/components/ui/overlay-stack';
import type { OverlayLayer } from '@/components/ui/overlay-stack';

export function useShortcutDispatch(): void {
  useEffect(() => {
    const layer: OverlayLayer = {
      contains: () => false,
      traps: false,
      element: () => null,
    };
    const pop = pushOverlayLayer(layer);
    const isMac = isMacPlatform();

    const handleKeyDown = (e: KeyboardEvent) => {
      const entry = findShortcutFor(useCommandStore.getState().shortcuts, e, isMac);
      if (entry === undefined) return;
      const blocked = shortcutBlockReason(e, {
        isTopLayer: isTopOverlayLayer(layer),
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
      pop();
    };
  }, []);
}
