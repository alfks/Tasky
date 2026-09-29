// 격자 페이드인(calendar-layout.md R19·R19-a) — React·컴포넌트를 모르는 순수 헬퍼. 두 피커
// (`YearMonthPicker`·`DayPicker`)가 같은 것을 쓴다. 컴포넌트 파일에서 export 하면 lazy 청크가 서로를
// 끌어와 "첫 열림에 자기 청크 하나"(§7)가 깨진다(리뷰 라운드2 Minor) — 그래서 lib 에 둔다.

/**
 * 페이드 중 / 끝난 뒤의 격자 클래스. 진짜 0 → 1 이 되려면 **0 은 전환 없이 그려져야 한다** —
 * 페이드 중에는 `transition-none` + `opacity-0`, 끝나면 `transition-opacity` + `opacity-100`.
 * 전환을 항상 켜 두면 `opacity-0` 가 붙는 순간 1 → 0 으로 *내려가기 시작*해 0.47 까지 갔다 되돌아오는
 * 반투명 딥이 된다(라운드2 실측). `motion-safe:` 로 가둬 reduced-motion 에서는 어느 클래스도 매치되지
 * 않아 값이 1 에 머문다(깜빡임 0ms).
 */
export function fadeInClass(fading: boolean): string {
  return fading
    ? 'motion-safe:transition-none motion-safe:opacity-0'
    : 'opacity-100 motion-safe:transition-opacity motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]';
}

/**
 * 페이드의 끝을 **두 번째 프레임**에 건다. 첫 rAF 는 아직 그 프레임의 페인트 전이라 그 안에서 되돌리면
 * 브라우저가 0 을 본 적이 없어 transition 이 시작되지 않는다 — 한 프레임을 더 기다려야 0 이 실제로
 * 그려진 뒤 0 → 1 이 `--motion-xfast` 동안 올라온다. 돌려주는 함수로 취소한다(언마운트·연타).
 */
export function scheduleFadeEnd(end: () => void): () => void {
  let inner = 0;
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(end);
  });
  return () => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
  };
}
