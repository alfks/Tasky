import { describe, expect, it } from 'vitest';

import { OVERLAY_ALWAYS_LIVE_ATTR, applyOverlayEnterRule } from '@/components/ui/overlay-rules';

/** `e.target` 은 dispatch 로만 세팅된다 — 실제 요소에 던져서 규칙이 보는 값을 만든다. */
function enterOn(el: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

describe('overlay-rules', () => {
  it('텍스트 입력의 Enter 는 막고(폼 암묵 제출 차단) 버튼·textarea 는 통과시킨다', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    const textarea = document.createElement('textarea');
    document.body.append(input, button, textarea);

    expect(applyOverlayEnterRule(enterOn(input))).toBe(true);
    expect(applyOverlayEnterRule(enterOn(button))).toBe(false);
    expect(applyOverlayEnterRule(enterOn(textarea))).toBe(false);

    input.remove();
    button.remove();
    textarea.remove();
  });

  it('조합 중이면 버튼 위에서도 막는다(한글 확정 Enter 가 파괴 버튼을 누르지 않게)', () => {
    const button = document.createElement('button');
    document.body.append(button);

    const composing = enterOn(button, { isComposing: true });
    expect(applyOverlayEnterRule(composing)).toBe(true);
    expect(composing.defaultPrevented).toBe(true);

    const byKeyCode = enterOn(button, { keyCode: 229 });
    expect(applyOverlayEnterRule(byKeyCode)).toBe(true);
    expect(byKeyCode.defaultPrevented).toBe(true);

    button.remove();
  });

  it('배경 inert 예외 표식은 data-* 속성이라 DOM 에 그대로 붙는다', () => {
    expect(OVERLAY_ALWAYS_LIVE_ATTR).toMatch(/^data-/);
  });
});
