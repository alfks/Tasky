/**
 * IME 조합 중에 생긴 키 이벤트인지.
 *
 * 한글·일본어·중국어 입력에서 조합을 확정하거나 취소하는 `Enter`·`Escape` 는 **조합을 끝내는
 * 동작일 뿐**이라, 대화상자를 닫거나 버튼을 실행하거나 목록의 선택을 옮겨서는 안 된다
 * (app-shell R14). 브라우저·조합기에 따라 `isComposing` 또는 `keyCode 229` 중 하나로만
 * 알려 주므로 둘 다 본다.
 *
 * 오버레이 프리미티브(Dialog·Popover·Menu·ColorSwatchGroup)와 **기능 전용 대화상자**
 * (category R10 = T-12b 처럼 Dialog 위에 직접 짓는 화면)가 같은 판정을 쓰도록 여기 둔다.
 * 컴포넌트 안에 private 으로 두면 기능 쪽이 같은 규칙을 손으로 다시 구현하게 되고,
 * 그 복제가 어긋나는 순간 한글 사용자에게만 보이는 사고가 된다.
 */
export function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
