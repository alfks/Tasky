'use client';

// 앱 셸 에러 바운더리 (T-17 핸드오프가 T-20 에 넘긴 필수 항목).
//
// **왜 필요한가.** 이 레포에는 `componentDidCatch` 가 한 건도 없었다. 그 상태에서 렌더나 `useEffect`
// 안의 예외 하나가 React 19 의 기본 동작대로 루트를 통째로 언마운트해 `#root` 가 빈 화면이 된다.
// 사용자는 "앱이 사라졌다" 를 보고, 무엇이 잘못됐는지도 다시 시도할 방법도 없다.
//
// **클래스인 이유**: 렌더 에러를 잡는 React API(`getDerivedStateFromError`·`componentDidCatch`)는
// 클래스에만 있다. 이 레포에서 클래스 컴포넌트는 여기 하나다.
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';

type ShellErrorBoundaryProps = {
  children: ReactNode;
  /** 테스트·상위 계층이 관찰할 훅. 기본 동작(콘솔)은 그대로 둔다. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ShellErrorBoundaryState = { error: Error | null };

export class ShellErrorBoundary extends Component<
  ShellErrorBoundaryProps,
  ShellErrorBoundaryState
> {
  state: ShellErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ShellErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 로그는 남긴다 — 화면은 복구되지만 원인은 사라지면 안 된다.
    console.error('앱 셸에서 처리되지 않은 오류가 발생했습니다.', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-[760px] flex-col items-start gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-6)] text-text"
      >
        <h2 className="text-lg font-semibold">화면을 그리지 못했어요</h2>
        <p className="text-base text-muted">
          적어 둔 내용은 그대로 저장돼 있어요. 다시 시도하거나 새로고침해 주세요.
        </p>
        <div className="flex gap-[var(--space-2)]">
          {/* 다시 그리기: 일시적인 오류라면 이것만으로 돌아온다. */}
          <Button onClick={() => this.setState({ error: null })}>다시 시도</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            새로고침
          </Button>
        </div>
      </div>
    );
  }
}
