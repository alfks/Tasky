// 보이는 날짜 범위가 바뀔 때마다 알리는 leading + trailing 디바운스 (routine.md R6 무기한 루틴 지연 생성의
// 배선 지점 — `DateStrip` 의 `onVisibleRange` prop). 스트립 본문에서 떼어 낸 이유는 하나다: 이 묶음은
// 렌더와 무관한 시간 논리라 컴포넌트 안에 두면 200줄 상한을 넘기고(code-style), 여기 두면 그 자체로 읽힌다.
//
// 버스트의 **첫** 범위 변화는 즉시 부른다(leading) — trailing 만 쓰면 한 걸음짜리 이동도
// `VISIBLE_RANGE_DEBOUNCE_MS` 를 기다려, 그사이 "아직 비어 있어요" 빈 상태가 잠깐 떴다 사라지는 깜빡임이
// 실측됐다(리뷰 Minor 1). 쿨다운 중에 이어지는 변화(연타)만 trailing 으로 미뤄 마지막 범위로 한 번 부른다
// (리뷰 Major 2 실측: 100연타 → put 426·tx 938·7.4초) — 낭비 방지 캐시(`materializeRoutines`)가 이미
// 중복 조회를 막아 주므로 leading 이 더해도 실질 비용은 거의 늘지 않는다.
import { useEffect, useRef } from 'react';

import type { DateKey } from '@/domain/date/date-key';

/**
 * 디바운스 폭. leading 호출은 이 값과 무관하게 즉시 나가고, 이 값은 "연타가 끝났다"고 판단해 trailing 을
 * 쏘기까지 기다리는 조용한 시간이다.
 */
export const VISIBLE_RANGE_DEBOUNCE_MS = 250;

/** `[from, to]`(양끝 포함)가 바뀔 때마다 `onVisibleRange` 를 위 규칙으로 부른다. 콜백이 없으면 아무 일도 없다. */
export function useVisibleRangeNotifier(
  from: DateKey,
  to: DateKey,
  onVisibleRange: ((from: DateKey, to: DateKey) => void) | undefined,
): void {
  // 콜백 정체성이 바뀌어도 재실행하지 않게 ref 로 받는다(`useRangeSummaries` 의 `onError` 와 같은 이유).
  const onVisibleRangeRef = useRef(onVisibleRange);
  onVisibleRangeRef.current = onVisibleRange;
  const coolingDownRef = useRef(false);
  const trailingPendingRef = useRef(false);
  const debounceTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!coolingDownRef.current) {
      coolingDownRef.current = true;
      trailingPendingRef.current = false;
      onVisibleRangeRef.current?.(from, to);
    } else {
      trailingPendingRef.current = true;
    }
    window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      coolingDownRef.current = false;
      if (trailingPendingRef.current) {
        trailingPendingRef.current = false;
        onVisibleRangeRef.current?.(from, to);
      }
    }, VISIBLE_RANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(debounceTimerRef.current);
  }, [from, to]);
}
