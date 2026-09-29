const CHEVRON_PATH = {
  left: 'M10 3 5 8l5 5',
  right: 'M6 3l5 5-5 5',
  down: 'M3 6l5 5 5-5',
} as const;

/**
 * 방향 표시 아이콘. 장식이므로 부모 버튼이 이름을 책임진다. 스트립 헤더(‹ › ▾)와 일 피커
 * (‹ 이전 달 · 다음 달 ›)가 같은 모양을 쓴다 — 한 화면에 두 종류의 화살표가 있으면 안 된다.
 */
export function Chevron({ direction }: { direction: keyof typeof CHEVRON_PATH }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[var(--space-4)] shrink-0">
      <path
        d={CHEVRON_PATH[direction]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
