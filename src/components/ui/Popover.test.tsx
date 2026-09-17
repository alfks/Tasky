import { useRef, useState } from 'react';

import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

function Harness({
  onClose,
  returnFocus,
}: {
  onClose?: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // 메뉴에서 [삭제] 를 고르면 그 행(= 앵커)이 통째로 사라지는 T-15 의 주 경로를 흉내 낸다.
  const [anchorGone, setAnchorGone] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  return (
    <>
      {anchorGone ? null : (
        <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
          설정
        </button>
      )}
      <button type="button" id="다음-행">
        다음 행
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="설정"
        returnFocus={returnFocus}
      >
        <button type="button">다크 모드</button>
        <button
          type="button"
          onClick={() => {
            setAnchorGone(true);
            close();
          }}
        >
          행 삭제
        </button>
      </Popover>
    </>
  );
}

describe('Popover', () => {
  it('열리면 내용이 보이고 첫 포커스 가능 요소로 포커스가 간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('group', { name: '설정' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다크 모드' }));
  });

  it('Esc 로 닫고 앵커로 포커스를 돌려주지만 IME 조합 중 Esc 는 무시한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const anchor = screen.getByRole('button', { name: '설정' });

    await user.click(anchor);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: '설정' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(anchor);
  });

  it('바깥을 누르면 닫히고 안쪽을 누르면 열려 있다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: '다크 모드' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('앵커 위치를 기준으로 좌표가 계산되고 패널은 body 로 포털된다', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const anchor = screen.getByRole('button', { name: '설정' });
    anchor.getBoundingClientRect = () =>
      ({ top: 100, bottom: 140, left: 60, right: 160 }) as DOMRect;

    await user.click(anchor);
    const panel = screen.getByRole('group', { name: '설정' });
    expect(panel).toHaveStyle({ top: '148px', left: '60px' });
    // transform 조상 안에 있으면 fixed 좌표가 그 조상 기준이 되어 161×262px 어긋난다(리뷰 M-1).
    expect(container.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
  });

  // 앵커가 무엇을 여는지 스크린리더가 알 수 있어야 한다(app-shell §5).
  it('앵커에 aria-haspopup·aria-expanded·aria-controls 를 붙이고 닫히면 되돌린다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const anchor = screen.getByRole('button', { name: '설정' });

    expect(anchor).toHaveAttribute('aria-haspopup', 'true');
    expect(anchor).toHaveAttribute('aria-expanded', 'false');
    expect(anchor).not.toHaveAttribute('aria-controls');

    await user.click(anchor);
    expect(anchor).toHaveAttribute('aria-expanded', 'true');
    expect(anchor.getAttribute('aria-controls')).toBe(
      screen.getByRole('group', { name: '설정' }).id,
    );

    await user.keyboard('{Escape}');
    expect(anchor).toHaveAttribute('aria-expanded', 'false');
    expect(anchor).not.toHaveAttribute('aria-controls');
  });

  // 같은 이름이 button → group → menu 로 세 번 낭독되던 문제(리뷰 M-5).
  it('label 을 생략하면 group 래퍼 없이 자식의 역할만 남는다', async () => {
    const user = userEvent.setup();
    function WithMenu() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
            장보기 메뉴
          </button>
          <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} hasPopup="menu">
            <Menu
              label="장보기 메뉴"
              items={[{ id: 'edit', label: '편집', onSelect: vi.fn() }]}
              onClose={() => setOpen(false)}
            />
          </Popover>
        </>
      );
    }
    render(<WithMenu />);
    const anchor = screen.getByRole('button', { name: '장보기 메뉴' });
    expect(anchor).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(anchor);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: '장보기 메뉴' })).toBeInTheDocument();
  });

  // app-shell R14: 포커스가 body 로 떨어지는 경우는 없다.
  it('앵커가 사라진 채 닫히면 returnFocus 가 준 요소로 간다', async () => {
    const user = userEvent.setup();
    render(<Harness returnFocus={() => document.getElementById('다음-행')} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(screen.getByRole('button', { name: '행 삭제' }));

    expect(screen.queryByRole('group', { name: '설정' })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음 행' }));
  });

  // app-shell R14 의 Enter 규칙은 Dialog 전용이 아니다. 팝오버 안의 <form> 도 한글 확정 Enter 한 번에
  // 암묵 제출돼서는 안 된다 — 실제 Chromium 에서 그대로 관통했다(리뷰 X1·X2).
  it('안에 든 폼이 Enter 로 암묵 제출되지 않는다(조합 중이든 아니든)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    function WithForm() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
            이름 바꾸기
          </button>
          <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="이름">
            <form onSubmit={onSubmit}>
              <input aria-label="새 이름" />
              {/* type 을 생략한 버튼은 submit 이다 — 암묵 제출이 이 버튼을 누른다. */}
              <button>확인</button>
            </form>
          </Popover>
        </>
      );
    }
    render(<WithForm />);
    await user.click(screen.getByRole('button', { name: '이름 바꾸기' }));
    const input = screen.getByLabelText('새 이름');
    input.focus();

    for (const init of [{ isComposing: true }, { keyCode: 229 }, {}]) {
      const event = createEvent.keyDown(input, { key: 'Enter', ...init });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(onSubmit).not.toHaveBeenCalled();

    // 버튼 위의 Enter 는 그 버튼만 실행한다(기본 동작 유지).
    const confirm = screen.getByRole('button', { name: '확인' });
    confirm.focus();
    const onButton = createEvent.keyDown(confirm, { key: 'Enter' });
    fireEvent(confirm, onButton);
    expect(onButton.defaultPrevented).toBe(false);
  });

  // T-39: 바깥 클릭으로 닫을 때 포커스가 `<body>` 로 떨어졌다(app-shell R14 위반). 복귀 로직은 정상이고,
  // 디스패치가 끝난 뒤 브라우저의 mousedown 기본 동작이 그 복귀를 덮는 것이 원인이다(T-35 Chromium 실측).
  // jsdom 자체는 그 기본 동작을 구현하지 않지만 userEvent v14 가 모사하므로 `user.click` 으로만 재현된다.
  it('포커스를 받지 못하는 바깥을 눌러 닫아도 포커스가 body 로 떨어지지 않는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const anchor = screen.getByRole('button', { name: '설정' });

    await user.click(anchor);
    await user.click(document.body);

    expect(screen.queryByRole('group', { name: '설정' })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(anchor);
  });

  // 위 테스트가 재현하는 것을 기본 동작 취소 자체로도 잰다(userEvent 의 모사에만 기대지 않는다).
  it('포커스를 받지 못하는 바깥의 mousedown 은 기본 동작을 막는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    const event = createEvent.mouseDown(document.body);
    fireEvent(document.body, event);

    expect(event.defaultPrevented).toBe(true);
  });

  // Dialog(T-35)와 갈리는 지점. 대화상자의 "바깥" 은 자기 백드롭뿐이지만 팝오버는 비모달이라
  // 바깥이 살아 있는 페이지다 — 통째로 막으면 바깥 버튼·입력칸이 포커스(캐럿)를 받지 못한다.
  it('포커스를 받을 수 있는 바깥은 기본 동작을 막지 않고 그 요소가 포커스를 가져간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const next = screen.getByRole('button', { name: '다음 행' });

    await user.click(screen.getByRole('button', { name: '설정' }));
    const event = createEvent.mouseDown(next);
    fireEvent(next, event);
    expect(event.defaultPrevented).toBe(false);

    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(next);
    expect(screen.queryByRole('group', { name: '설정' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(next);
  });

  // 항상 마운트하고 open 만 토글하는 것이 계약이다. `{open ? <Popover/> : null}` 로 쓰면 닫힌 동안
  // 앵커에 아무 ARIA 도 없어 M-4(앵커가 무엇을 여는지 모름)가 그대로 재발한다.
  it('닫혀 있어도 앵커에 ARIA 가 붙는다 — 조건부 마운트가 필요 없다', () => {
    function AlwaysMounted() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef} type="button">
            더 보기
          </button>
          <Popover open={false} onClose={vi.fn()} anchorRef={anchorRef} hasPopup="menu">
            <Menu label="행 메뉴" items={[{ id: 'del', label: '삭제', onSelect: vi.fn() }]} />
          </Popover>
        </>
      );
    }
    render(<AlwaysMounted />);
    const anchor = screen.getByRole('button', { name: '더 보기' });

    expect(anchor).toHaveAttribute('aria-haspopup', 'menu');
    expect(anchor).toHaveAttribute('aria-expanded', 'false');
    // 닫혀 있으면 패널은 렌더하지 않는다 — 항상 마운트해도 DOM 비용이 없다.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
