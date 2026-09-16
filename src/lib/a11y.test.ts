import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertAccessibleName } from '@/lib/a11y';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertAccessibleName', () => {
  it('개발 모드에서 공백뿐인 이름을 throw 로 막는다', () => {
    expect(() => assertAccessibleName('IconButton', 'label', '')).toThrow(/공백/);
    expect(() => assertAccessibleName('IconButton', 'label', '   ')).toThrow(/공백/);
    expect(() => assertAccessibleName('IconButton', 'label', '\n\t')).toThrow(/공백/);
  });

  it('내용이 있으면 통과하고, 프로덕션에서는 공백도 throw 하지 않는다(문서화된 한계)', () => {
    expect(() => assertAccessibleName('IconButton', 'label', '설정 열기')).not.toThrow();

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertAccessibleName('IconButton', 'label', '')).not.toThrow();
  });
});
