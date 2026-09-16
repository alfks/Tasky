import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '@/components/ui/IconButton';

describe('IconButton', () => {
  it('label 이 접근 가능한 이름이 되고 아이콘은 이름에 섞이지 않는다', () => {
    render(
      <IconButton label="설정 열기">
        <span>⚙</span>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: '설정 열기' })).toBeInTheDocument();
  });

  it('키보드(Tab → Space)로 실행된다', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="설정 열기" onClick={onClick}>
        <span>⚙</span>
      </IconButton>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: '설정 열기' })).toHaveFocus();
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('aria-pressed 같은 상태 속성을 그대로 전달한다', () => {
    render(
      <IconButton label="다크 모드로 전환" aria-pressed={false}>
        <span>☾</span>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('ref 로 실제 button 요소를 돌려준다(메뉴 앵커가 이 ref 를 쓴다)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton ref={ref} label="장보기 메뉴">
        <span>⋯</span>
      </IconButton>,
    );

    expect(ref.current).toBe(screen.getByRole('button', { name: '장보기 메뉴' }));
  });

  // 타입 차단(컴파일)과 런타임 차단(개발 모드 throw)을 한 자리에서 확인한다. @ts-expect-error 가
  // 남아 있다는 것 자체가 "이 코드는 컴파일되지 않는다"는 검사다 — 타입 가드를 없애면 typecheck 가 깨진다.
  it('공백뿐인 label 은 컴파일에서 막히고 개발 모드에서 throw 한다', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <IconButton
          // @ts-expect-error 공백뿐인 리터럴은 NonBlank 에 걸려 컴파일되지 않는다
          label="   "
        >
          <span>⋯</span>
        </IconButton>,
      ),
    ).toThrow(/공백/);

    silence.mockRestore();
  });

  // JSX 는 하이픈 속성명을 초과 속성 검사에서 빼 주므로 타입 Omit 만으로는 이 우회가 막히지 않는다
  // (실측). 런타임에서 걷어내는 것까지가 가드다 — 걷어내기를 지우면 이름이 '다른 이름'이 되어 깨진다.
  it('aria-labelledby 로 이름을 우회할 수 없다', () => {
    render(
      <>
        <span id="other-name">다른 이름</span>
        <IconButton label="설정 열기" aria-labelledby="other-name">
          <span>⚙</span>
        </IconButton>
      </>,
    );

    expect(screen.getByRole('button', { name: '설정 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다른 이름' })).not.toBeInTheDocument();
  });
});
