// 대기 화면의 **체크 컨트롤**(프리셋 라디오 3개 + 소리 토글)이 앱 컨트롤과 같은 것을 주는지.
//
// 여기서 재는 것은 클래스 문자열이 아니라 **네이티브 라디오가 공짜로 주던 동작**이다 —
// 화살표 키로 그룹 안을 돌고, 그룹 전체가 탭 정지점 1개이며, 선택 상태가 스토어와 맞물린다.
// 커스텀 `role="radio"` 로 갈아타면 조용히 사라지는 것들이라 여기에 못을 박아 둔다.
// (시각 표현 — 32px 히트/22px 원형·앱 포커스 링 — 은 jsdom 이 재지 못한다. 실브라우저로 쟀다.)
//
// **jsdom 의 한계 하나를 적어 둔다.** 아래 탭 정지점 테스트는 `role="radio"` 버튼으로 갈아타면 죽지만
// (실측: 음성 대조에서 4건 실패), 네이티브 라디오에 `tabIndex={0}` 을 억지로 붙이면 죽지 않는다.
// 네이티브 라디오는 원래 `tabIndex` 가 0 이고 브라우저가 name 그룹·checked 로 건너뛰기 때문이라
// 그 변이는 실제 회귀가 아니다(실브라우저에서도 정지점은 그대로 1개였다).
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { TimerSetup } from '@/features/timer/components/TimerSetup';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';
import { useTodoStore } from '@/features/todo';

const SOUND = '끝났을 때 소리로 알리기';

beforeEach(() => {
  localStorage.clear();
  act(() => {
    useTimerStore.setState(initialTimerState(new Date().toISOString()));
    useTodoStore.setState({ byId: {} });
  });
});

const radio = (name: string) => screen.getByRole('radio', { name });
const soundBox = () => screen.getByRole('checkbox', { name: SOUND });

describe('집중 시간 라디오 그룹', () => {
  it('화살표 키가 그룹 안에서 선택을 옮긴다 (25분 → 50분 → 직접)', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    radio('25분').focus();
    expect(radio('25분')).toBeChecked();

    await user.keyboard('{ArrowRight}');
    expect(radio('50분')).toBeChecked();
    expect(radio('50분')).toHaveFocus();
    expect(radio('25분')).not.toBeChecked();
    expect(useTimerStore.getState().minutes).toBe(50);

    await user.keyboard('{ArrowRight}');
    expect(radio('직접')).toBeChecked();
    expect(radio('직접')).toHaveFocus();
    // "직접" 이 실제로 선택된 결과 — 분 입력이 열린다. 선택 표시만 바뀐 것이 아니다.
    expect(screen.getByRole('spinbutton', { name: '분 단위로 입력' })).toBeInTheDocument();
  });

  it('반대 방향 화살표와 되감기도 그룹 안에 머문다', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    radio('25분').focus();
    await user.keyboard('{ArrowLeft}');
    // 그룹의 처음에서 왼쪽 = 마지막으로 감긴다. 그룹 밖으로 나가지 않는다.
    expect(radio('직접')).toBeChecked();
    expect(radio('직접')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(radio('25분')).toBeChecked();
    expect(useTimerStore.getState().minutes).toBe(25);
  });

  it('그룹 전체가 탭 정지점 1개다 — 선택된 칸만 받고 다음 Tab 은 그룹을 벗어난다', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    await user.tab(); // 집중할 할 일 select
    expect(screen.getByLabelText('집중할 할 일')).toHaveFocus();

    await user.tab();
    expect(radio('25분')).toHaveFocus();

    await user.tab();
    // 50분·직접은 탭에서 건너뛴다. 여기서 라디오에 머무르면 정지점이 3개라는 뜻이다.
    expect(radio('50분')).not.toHaveFocus();
    expect(radio('직접')).not.toHaveFocus();
    expect(soundBox()).toHaveFocus();
  });

  it('탭 정지점은 선택을 따라 움직인다 — 50분을 고르면 50분이 진입점이 된다', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    await user.click(radio('50분'));
    soundBox().focus();
    await user.tab({ shift: true });

    expect(radio('50분')).toHaveFocus();
    expect(radio('25분')).not.toHaveFocus();
  });

  it('스토어의 길이가 선택 상태로 드러난다', () => {
    useTimerStore.setState({ minutes: 50 });
    render(<TimerSetup />);

    expect(radio('50분')).toBeChecked();
    expect(radio('25분')).not.toBeChecked();
    expect(radio('직접')).not.toBeChecked();
  });
});

describe('소리 알림 토글', () => {
  it('보이는 문구를 눌러도 토글되고 스토어에 반영된다', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    expect(soundBox()).toBeChecked(); // soundOff 기본값 false = 소리 켬
    await user.click(screen.getByText(SOUND));

    expect(useTimerStore.getState().soundOff).toBe(true);
    expect(soundBox()).not.toBeChecked();
  });

  it('Space 로 토글된다', async () => {
    const user = userEvent.setup();
    render(<TimerSetup />);

    soundBox().focus();
    await user.keyboard(' ');

    expect(useTimerStore.getState().soundOff).toBe(true);
    expect(soundBox()).not.toBeChecked();
  });

  it('스토어의 soundOff 가 체크 해제로 드러난다', () => {
    useTimerStore.setState({ soundOff: true });
    render(<TimerSetup />);

    expect(soundBox()).not.toBeChecked();
  });
});
