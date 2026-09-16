// 앱 셸 에러 바운더리 (T-17 핸드오프가 넘긴 필수 항목).
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShellErrorBoundary } from '@/features/shell/components/ShellErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('터졌다');
  return <p>본문</p>;
}

beforeEach(() => {
  // React 는 잡힌 오류도 콘솔에 다시 던진다 — 테스트 출력이 오염되는 것만 막는다.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShellErrorBoundary', () => {
  it('아무 일도 없으면 children 을 그대로 그린다', () => {
    render(
      <ShellErrorBoundary>
        <Boom explode={false} />
      </ShellErrorBoundary>,
    );
    expect(screen.getByText('본문')).toBeInTheDocument();
  });

  it('자식이 던지면 화면이 비지 않고 안내가 뜬다 (#root 가 통째로 사라지던 자리)', () => {
    render(
      <ShellErrorBoundary>
        <Boom explode />
      </ShellErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('화면을 그리지 못했어요');
    expect(screen.queryByText('본문')).not.toBeInTheDocument();
  });

  it('오류를 삼키지 않는다 — onError 와 콘솔로 새어 나간다', () => {
    const onError = vi.fn();
    render(
      <ShellErrorBoundary onError={onError}>
        <Boom explode />
      </ShellErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: '터졌다' });
  });

  it('[다시 시도] 로 같은 트리를 다시 그린다 — 일시적 오류에서 돌아온다', async () => {
    const user = userEvent.setup();
    // 던질지 말지를 트리 밖에서 쥔다. 컴포넌트 안에 두면 React 의 개발 모드 재시도 렌더가
    // 그 플래그를 먼저 소비해 버려 무엇을 재는지 알 수 없다.
    const fault = { active: true };
    function Flaky() {
      if (fault.active) throw new Error('일시적');
      return <p>본문</p>;
    }

    render(
      <ShellErrorBoundary>
        <Flaky />
      </ShellErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fault.active = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(screen.getByText('본문')).toBeInTheDocument();
  });
});
