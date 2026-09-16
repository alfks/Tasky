// 브라우저 파일 입출력 — 이 feature 에서 `document`·`Blob`·`URL`·파일 피커를 만지는 **유일한** 파일이다.
// 스토어 액션이 여기만 부르므로 테스트는 이 함수들만 대역으로 바꾸면 된다.
//
// `lib/` 에 두지 않은 이유: 백업 말고 쓰는 곳이 없고(부분 내보내기는 범위 밖 — §6),
// 공용 위치로 올리는 것은 두 번째 사용처가 생길 때 할 일이다.
//
// **왜 "저장을 확인할 수 있는가" 를 타입으로 들고 다니는가** (R10·R14, 리뷰 라운드 1 Major-2):
// `anchor.click()` 은 사용자가 저장 대화상자를 취소하거나 정책·확장·디스크가 막아도 **아무것도 알려주지
// 않는다**. 그 경로에서 `lastBackupAt` 을 찍으면 백업하지 않은 사용자에게 "백업했다" 고 표시되고
// 경고 점이 꺼진다 — R14 가 금지한 "끄는 행동이 백업보다 싼" 경로가 저장 대화상자 Esc 하나로 생긴다.
// 그래서 저장 완료를 **관측할 수 있는 경로**(File System Access API)와 그렇지 못한 경로를 구분하고,
// 관측할 수 없으면 `lastBackupAt` 을 갱신하지 않는다(점이 남는 쪽이 안전한 실패다).

/** 파일을 쓸 수 있는 자리 하나. `confirmable` 이 거짓이면 저장 완료를 확인할 수 없다. */
export type BackupTarget = {
  /**
   * 저장이 끝난 것을 **관측했는가**. 참이면 `save()` 가 resolve 된 시점에 파일이 디스크에 있다.
   * 거짓이면 브라우저에 넘겼다는 것까지만 안다(앵커 내려받기).
   */
  confirmable: boolean;
  /** 본문을 쓴다. 실패는 던진다 — 호출부는 그것을 내보내기 실패로 본다. */
  save: (text: string) => Promise<void>;
};

/** File System Access API 중 우리가 쓰는 부분만. `lib.dom` 에 아직 없는 환경이 있어 여기서 좁게 선언한다. */
type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: readonly { description: string; accept: Record<string, readonly string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

const JSON_MIME = 'application/json';

/** 사용자가 피커를 닫은 것(취소)인가. 그 밖의 실패는 앵커로 떨어진다. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function anchorTarget(fileName: string): BackupTarget {
  return {
    confirmable: false,
    save: (text) => {
      downloadJson(fileName, text);
      return Promise.resolve();
    },
  };
}

/**
 * 저장할 자리를 **사용자 제스처 안에서** 먼저 확보한다. 취소하면 `null`(실패가 아니다).
 *
 * 본문을 만들기 전에 부르는 이유는 두 가지다. (1) `showSaveFilePicker` 는 일시적 사용자 활성화를
 * 요구하므로 전량 읽기·직렬화를 기다린 뒤에 부르면 거부될 수 있다. (2) 사용자가 취소하면 16MB 를
 * 만들 이유가 없다.
 */
export async function openBackupTarget(fileName: string): Promise<BackupTarget | null> {
  const picker = (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== 'function') {
    return anchorTarget(fileName);
  }
  let handle: Awaited<ReturnType<SaveFilePicker>>;
  try {
    handle = await picker({
      suggestedName: fileName,
      types: [{ description: 'Tasky 백업', accept: { [JSON_MIME]: ['.json'] } }],
    });
  } catch (error) {
    // 취소는 "아무 일도 일어나지 않았다". 그 밖의 거부(권한 정책·비보안 컨텍스트)는 앵커로 내려간다.
    return isAbort(error) ? null : anchorTarget(fileName);
  }
  return {
    confirmable: true,
    save: async (text) => {
      const writable = await handle.createWritable();
      await writable.write(new Blob([text], { type: JSON_MIME }));
      await writable.close();
    },
  };
}

/**
 * JSON 본문을 파일로 내려받는다 (R1: MIME `application/json`, UTF-8).
 *
 * `URL.revokeObjectURL` 을 같은 턴에서 부르지 않는다 — 일부 브라우저는 클릭으로 시작된 다운로드가
 * 실제로 시작되기 전에 URL 이 해제되면 빈 파일을 저장한다. 다음 매크로태스크로 미룬다.
 */
export function downloadJson(fileName: string, text: string): void {
  const blob = new Blob([text], { type: JSON_MIME });
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
