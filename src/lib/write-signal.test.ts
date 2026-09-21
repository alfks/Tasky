import { describe, expect, it, vi } from 'vitest';

import { notifyLocalWrite, onLocalWrite } from '@/lib/write-signal';

describe('write-signal', () => {
  it('구독자에게 notifyLocalWrite 호출을 동기로 전달한다', () => {
    const listener = vi.fn();
    const unsubscribe = onLocalWrite(listener);

    notifyLocalWrite();
    notifyLocalWrite();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('구독 해제 뒤에는 더 이상 불리지 않는다', () => {
    const listener = vi.fn();
    const unsubscribe = onLocalWrite(listener);
    unsubscribe();

    notifyLocalWrite();

    expect(listener).not.toHaveBeenCalled();
  });

  it('여러 구독자에게 모두 전달한다', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onLocalWrite(a);
    const unsubB = onLocalWrite(b);

    notifyLocalWrite();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});
