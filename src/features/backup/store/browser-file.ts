// 브라우저 파일 입출력 — 이 feature 에서 `document`·`Blob`·`URL` 을 만지는 **유일한** 파일이다.
// 스토어 액션이 여기만 부르므로 테스트는 이 두 함수만 대역으로 바꾸면 된다.
//
// `lib/` 에 두지 않은 이유: 백업 말고 쓰는 곳이 없고(부분 내보내기는 범위 밖 — §6),
// 공용 위치로 올리는 것은 두 번째 사용처가 생길 때 할 일이다.

/**
 * JSON 본문을 파일로 내려받는다 (R1: MIME `application/json`, UTF-8).
 *
 * `URL.revokeObjectURL` 을 같은 턴에서 부르지 않는다 — 일부 브라우저는 클릭으로 시작된 다운로드가
 * 실제로 시작되기 전에 URL 이 해제되면 빈 파일을 저장한다. 다음 매크로태스크로 미룬다.
 */
export function downloadJson(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 선택한 파일의 본문. 크기 검사(R9)를 통과한 뒤에만 부른다. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}
