'use client';

// 완료 카드 — R9 의 신호 (a). 닫을 때까지 패널에 남는다.
//
// **왜 모달 `Dialog` 가 아닌가**: 스펙이 "패널 카드"라고 못 박았고(§2), 카드는 앱을 연 직후 R9-a 경로로도
// 뜬다. 사흘 전 끝난 세션 때문에 화면 전체가 잠기면 R9-a 가 막으려던 바로 그 일(예측 불가능한 주의 탈취)이
// 일어난다. 그래서 `role="alertdialog"` + `aria-modal` 없음(=false)으로 두고 Esc·초기 포커스만 직접 건다.
//
// **초기 포커스는 `signal === 'full'` 일 때만** 옮긴다. R9-a 는 (b) 소리와 (c) 탭 제목을 "지금 막 끝났다"
// 신호로 규정하고 오래된 완료에서 뺀다. 포커스 이동은 같은 성격의 **네 번째** 주의 전환 신호라 같은 기준을
// 적용한다 — 앱을 열자마자 포커스가 카드로 튀면 이유를 알 수 없는 점프가 된다. 기록(a) 자체는 항상 보인다.
import { useEffect, useId, useRef } from 'react';

import { formatRecordedDuration } from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Button } from '@/components/ui/Button';

export function TimerCompletionCard() {
  const completion = useTimerStore((state) => state.completion);
  // P3: 뽀모도로에서는 이 카드 아래에 휴식이 돌고 있다. 그 위에서 `[5분 더]`·`[다음 할 일 고르기]` 를
  // 내밀면 두 화면이 서로 다른 다음 걸음을 가리킨다 — 휴식 중에는 이 카드를 **기록만** 하게 둔다.
  const resting = useTimerStore((state) => state.breakSession !== null);
  const dismiss = useTimerStore((state) => state.dismissCompletion);
  const extend = useTimerStore((state) => state.extend);
  const selectTodo = useTimerStore((state) => state.selectTodo);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const fresh = completion?.signal === 'full';

  useEffect(() => {
    if (completion === null) {
      return undefined;
    }
    if (fresh) {
      closeRef.current?.focus();
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [completion, fresh, dismiss]);

  if (completion === null) {
    return null;
  }

  const minutes = Math.round(completion.session.plannedSeconds / 60);
  const recorded = formatRecordedDuration(completion.recordedSeconds);
  const subject = completion.todoTitle === null ? '' : `${completion.todoTitle}에 `;

  return (
    <section
      role={fresh ? 'alertdialog' : 'status'}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface-2 p-[var(--space-4)] shadow-[var(--shadow-sm)]"
    >
      <h3 id={titleId} className="text-md font-semibold text-text">
        {fresh ? `집중 ${minutes}분 끝!` : `집중 ${minutes}분이 끝나 있었어요`}
      </h3>
      <p id={bodyId} className="text-sm text-text">
        {subject}
        {recorded}을 기록했어요
      </p>
      <div className="flex flex-wrap gap-[var(--space-2)]">
        {!resting && (
          <>
            <Button size="sm" onClick={() => void extend()}>
              5분 더
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                selectTodo(null);
                dismiss();
              }}
            >
              다음 할 일 고르기
            </Button>
          </>
        )}
        <Button ref={closeRef} variant="ghost" size="sm" onClick={dismiss}>
          닫기
        </Button>
      </div>
    </section>
  );
}
