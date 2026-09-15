import type { ReactNode } from 'react';

import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const onConfirm = vi.fn();
const onCancel = vi.fn();

function renderDialog(description: ReactNode = '완료한 할 일은 남지 않아요.') {
  return render(
    <ConfirmDialog
      open
      title="'장보기'를 삭제할까요?"
      description={description}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}

beforeEach(() => {
  onConfirm.mockClear();
  onCancel.mockClear();
});

describe('ConfirmDialog', () => {
  it('alertdialog 역할과 제목·본문 연결을 갖는다', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName("'장보기'를 삭제할까요?");
    expect(dialog).toHaveAccessibleDescription('완료한 할 일은 남지 않아요.');
  });

  it('초기 포커스는 파괴 버튼이 아니라 취소에 간다', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
  });

  it('열자마자 Enter 를 눌러도 삭제가 아니라 취소가 실행된다(암묵 제출 없음)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('IME 조합 중 Enter 는 기본 동작이 막혀 버튼을 실행하지 않는다', () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: '삭제' });
    confirm.focus();

    const composingByKeyCode = createEvent.keyDown(confirm, { key: 'Enter', keyCode: 229 });
    fireEvent(confirm, composingByKeyCode);
    expect(composingByKeyCode.defaultPrevented).toBe(true);

    const composing = createEvent.keyDown(confirm, { key: 'Enter', isComposing: true });
    fireEvent(confirm, composing);
    expect(composing.defaultPrevented).toBe(true);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('조합이 아닌 Enter 는 포커스한 버튼의 기본 동작으로 넘어간다', () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: '삭제' });
    confirm.focus();

    const plain = createEvent.keyDown(confirm, { key: 'Enter' });
    fireEvent(confirm, plain);
    expect(plain.defaultPrevented).toBe(false);
  });

  it('버튼이 아닌 곳(텍스트 입력)의 Enter 는 무시된다', () => {
    renderDialog(<input aria-label="확인 문구" />);
    const input = screen.getByLabelText('확인 문구');
    input.focus();

    const enter = createEvent.keyDown(input, { key: 'Enter' });
    fireEvent(input, enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Esc·✕·삭제 버튼이 각각 취소와 확인으로 이어진다', async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onCancel).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
