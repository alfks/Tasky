// HMAC 서명 원시함수 — 위조 감지(돌연변이 4 의 더 낮은 층 테스트, session.test.ts 는 D1 을 겸한 계약 테스트).
import { describe, expect, it } from 'vitest';

import { randomToken, signValue, verifySignedValue } from './hmac';

describe('signValue / verifySignedValue', () => {
  it('서명한 값을 검증하면 원래 payload 를 돌려준다', async () => {
    const signed = await signValue('hello', 'secret');
    expect(await verifySignedValue(signed, 'secret')).toBe('hello');
  });

  it('payload 를 바꾸면(서명은 그대로) 검증 실패', async () => {
    const signed = await signValue('hello', 'secret');
    const [, sig] = signed.split('.');
    expect(await verifySignedValue(`tampered.${sig}`, 'secret')).toBeNull();
  });

  it('서명을 바꾸면 검증 실패', async () => {
    const signed = await signValue('hello', 'secret');
    const [payload] = signed.split('.');
    expect(await verifySignedValue(`${payload}.wrongsig`, 'secret')).toBeNull();
  });

  it('다른 비밀로 서명한 값은 검증 실패', async () => {
    const signed = await signValue('hello', 'secret-a');
    expect(await verifySignedValue(signed, 'secret-b')).toBeNull();
  });

  it('점이 없는 값은 검증 실패', async () => {
    expect(await verifySignedValue('no-dot-here', 'secret')).toBeNull();
  });

  it('payload 에 점이 있어도(lastIndexOf 사용) 올바르게 분리한다', async () => {
    const signed = await signValue('a.b.c', 'secret');
    expect(await verifySignedValue(signed, 'secret')).toBe('a.b.c');
  });
});

describe('randomToken', () => {
  it('호출마다 다른 값을 준다', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});
