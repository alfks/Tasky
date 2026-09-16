import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShortcut } from '@/features/command/hooks/useShortcut';
import { useShortcutDispatch } from '@/features/command/hooks/useShortcutDispatch';
import { useCommandStore } from '@/features/command/store/command-store';

import { Dialog } from '@/components/ui/Dialog';
import { overlayLayerCount } from '@/components/ui/overlay-stack';

/** jsdom 의 `navigator.platform` 은 비어 있다 — 두 플랫폼을 모두 밟으려면 갈아 끼운다. */
function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
}

type HarnessProps = { onNext?: () => void; onPalette?: () => void; withDialog?: boolean };

function Harness({ onNext = () => {}, onPalette = () => {}, withDialog = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  useShortcutDispatch();
  useShortcut('date.next', onNext);
  useShortcut('palette.open', onPalette);
  return (
    <div>
      <input aria-label="제목" />
      <textarea aria-label="메모" />
      <div aria-label="리치" contentEditable suppressContentEditableWarning />
      <button onClick={() => setOpen(true)}>열기</button>
      {withDialog ? (
        <Dialog open={open} onClose={() => setOpen(false)} title="확인">
          <button>안쪽</button>
        </Dialog>
      ) : null}
    </div>
  );
}

/** 실제 요소에서 실제 키 이벤트를 쏜다(포커스도 실제로 옮긴다). */
function press(target: Element, init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  useCommandStore.setState({ shortcuts: [], commands: [], helpOpen: false, paletteOpen: false });
  setPlatform('Linux x86_64');
});

describe('전역 디스패치 — 통과 경로', () => {
  it('아무 데도 포커스가 없으면 실행된다', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('버튼에 포커스가 있어도 실행된다(입력 요소가 아니다)', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(screen.getByRole('button', { name: '열기' }), { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('기본 동작을 막는다(화살표의 페이지 스크롤 등 — R4)', () => {
    render(<Harness />);
    expect(press(document.body, { key: 'ArrowRight' }).defaultPrevented).toBe(true);
  });

  it('등록되지 않은 키는 기본 동작을 막지 않는다', () => {
    render(<Harness />);
    expect(press(document.body, { key: 'ArrowLeft' }).defaultPrevented).toBe(false);
  });

  it('언마운트하면 오버레이 스택에 레이어를 남기지 않는다', () => {
    // 디스패처는 자기 자신을 맨 아래 레이어로 밀어 넣는다 — 정리에서 빼지 않으면 마운트마다 쌓인다.
    const before = overlayLayerCount();
    const { unmount } = render(<Harness />);
    expect(overlayLayerCount()).toBe(before + 1);
    unmount();
    expect(overlayLayerCount()).toBe(before);
  });

  it('언마운트하면 더 이상 반응하지 않는다', () => {
    const onNext = vi.fn();
    const { unmount } = render(<Harness onNext={onNext} />);
    unmount();
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('가드 — 입력 중(R1)', () => {
  it('input·textarea·contenteditable 안에서는 실행되지 않는다', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    for (const label of ['제목', '메모', '리치']) {
      press(screen.getByLabelText(label), { key: 'ArrowRight' });
    }
    expect(onNext).not.toHaveBeenCalled();
    // 같은 세션에서 입력 밖은 여전히 동작한다 — 리스너가 죽은 게 아니다.
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('Mod+K 는 입력 중에도 동작한다(R1)', () => {
    const onPalette = vi.fn();
    const onNext = vi.fn();
    render(<Harness onNext={onNext} onPalette={onPalette} />);
    const input = screen.getByLabelText('제목');
    press(input, { key: 'k', ctrlKey: true });
    press(input, { key: 'ArrowRight' });
    expect(onPalette).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('가드 — IME 조합 중(R6)', () => {
  it('isComposing 인 키는 무시한다', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(document.body, { key: 'ArrowRight', isComposing: true });
    expect(onNext).not.toHaveBeenCalled();
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keyCode 229 로만 알려 오는 조합기도 무시한다', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(document.body, { key: 'ArrowRight', keyCode: 229 });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('조합 중에도 Mod+K 는 동작한다 — 한글을 치다가 첫 Mod+K 를 잃지 않는다(R1)', () => {
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} />);
    const input = screen.getByLabelText('제목');
    input.focus();
    press(input, { key: 'k', ctrlKey: true, isComposing: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  it('조합 중 단일 키는 여전히 무시한다 — 예외는 Mod+K 하나뿐이다(R6)', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(document.body, { key: 'ArrowRight', isComposing: true });
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('가드 — 오버레이(R1)', () => {
  it('대화상자가 열려 있으면 실행되지 않고, 닫으면 다시 동작한다', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Harness onNext={onNext} withDialog />);

    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    press(screen.getByRole('button', { name: '안쪽' }), { key: 'ArrowRight' });
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('대화상자가 열려 있으면 Mod+K 도 막힌다 — 팔레트가 모달 위에 겹치지 않는다', async () => {
    const user = userEvent.setup();
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} withDialog />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(onPalette).not.toHaveBeenCalled();
  });
});

describe('가드 — 이미 처리된 키', () => {
  it('가까운 처리기가 preventDefault 하면 전역은 비켜 준다', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    const strip = document.createElement('div');
    strip.addEventListener('keydown', (e) => e.preventDefault());
    document.body.append(strip);
    const cell = document.createElement('button');
    strip.append(cell);

    press(cell, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
    // 스트립 밖에서는 전역이 움직인다.
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('플랫폼(R3)', () => {
  it('macOS 에서는 ⌘K 가 동작하고 Ctrl+K 는 동작하지 않는다', () => {
    setPlatform('MacIntel');
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} />);
    press(document.body, { key: 'k', ctrlKey: true });
    expect(onPalette).not.toHaveBeenCalled();
    press(document.body, { key: 'k', metaKey: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  it('반대쪽 수식키가 눌린 단일 키는 무시한다(macOS 의 Ctrl+T = 글자 자리 바꾸기)', () => {
    setPlatform('MacIntel');
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    press(document.body, { key: 'ArrowRight', ctrlKey: true });
    expect(onNext).not.toHaveBeenCalled();
    press(document.body, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('macOS 가 아니면 Ctrl+K 가 동작하고 ⌘K 는 동작하지 않는다', () => {
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} />);
    press(document.body, { key: 'k', metaKey: true });
    expect(onPalette).not.toHaveBeenCalled();
    press(document.body, { key: 'k', ctrlKey: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });
});
