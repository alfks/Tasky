import { afterEach, describe, expect, it, vi } from 'vitest';

import { openBackupTarget } from '@/features/backup/store/browser-file';

type Picker = (options: unknown) => Promise<unknown>;

/** `showSaveFilePicker` 를 실제로 있게/없게 만든다 — 두 브라우저 계열을 한 테스트에서 대조하려고. */
function withPicker(picker: Picker | undefined): void {
  const scope = globalThis as { showSaveFilePicker?: Picker };
  if (picker === undefined) {
    delete scope.showSaveFilePicker;
    return;
  }
  scope.showSaveFilePicker = picker;
}

/** 저장까지 성공하는 피커. 받은 Blob 을 여기에 모은다(jsdom 의 Blob 은 `text()` 가 없다). */
function workingPicker(written: Blob[]): Picker {
  return () =>
    Promise.resolve({
      createWritable: () =>
        Promise.resolve({
          write: (blob: Blob) => {
            written.push(blob);
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    });
}

afterEach(() => {
  withPicker(undefined);
  vi.restoreAllMocks();
});

describe('openBackupTarget — 저장 완료를 확인할 수 있는가 (R10·R14)', () => {
  it('파일 피커가 없는 브라우저는 앵커로 내려받고 "확인 불가" 다', async () => {
    withPicker(undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const target = await openBackupTarget('tasky-backup-2026-09-15.json');

    expect(target).not.toBeNull();
    expect(target?.confirmable).toBe(false);
    await target?.save('{}');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('파일 피커가 있는 브라우저는 그것으로 쓰고 "확인됨" 이다', async () => {
    const written: Blob[] = [];
    withPicker(workingPicker(written));

    const target = await openBackupTarget('tasky-backup-2026-09-15.json');

    expect(target?.confirmable).toBe(true);
    await target?.save('{"app":"tasky"}');
    expect(written).toHaveLength(1);
    // R1: MIME `application/json`, 본문 그대로.
    expect(written[0]?.type).toBe('application/json');
    expect(written[0]?.size).toBe('{"app":"tasky"}'.length);
  });

  it('사용자가 피커를 취소하면 null 이다 — 저장할 자리가 없다', async () => {
    withPicker(() => Promise.reject(new DOMException('cancel', 'AbortError')));
    expect(await openBackupTarget('tasky-backup-2026-09-15.json')).toBeNull();
  });

  it('피커가 취소 아닌 이유로 못 뜨면 앵커로 내려간다 (권한 정책 등)', async () => {
    withPicker(() => Promise.reject(new DOMException('blocked', 'SecurityError')));
    const target = await openBackupTarget('tasky-backup-2026-09-15.json');
    expect(target?.confirmable).toBe(false);
  });

  it('쓰는 중 실패는 그대로 던진다 — 호출부가 내보내기 실패로 본다', async () => {
    withPicker(() =>
      Promise.resolve({
        createWritable: () => Promise.reject(new Error('디스크가 가득 찼다')),
      }),
    );
    const target = await openBackupTarget('tasky-backup-2026-09-15.json');
    expect(target?.confirmable).toBe(true);
    await expect(target?.save('{}')).rejects.toThrow('디스크가 가득 찼다');
  });
});
