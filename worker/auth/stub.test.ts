// `AUTH_STUB` 2중 가드 부정 테스트(T-93 완료 조건, docs/specs/sync.md 선행 조건). 하나만 참이어도
// 스텁 로그인이 동작하면 안 된다 — 돌연변이 6(가드의 hostname 조건 삭제)이 이 둘을 빨갛게 만든다.
import { describe, expect, it } from 'vitest';

import { isStubAllowed } from './stub';

import type { Env } from '../env';

function envWith(auth_stub: string | undefined): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'x',
    AUTH_STUB: auth_stub,
  };
}

describe('isStubAllowed — 2중 가드(둘 다 참이어야 한다)', () => {
  it('AUTH_STUB=1 이고 호스트가 localhost 면 허용', () => {
    const req = new Request('http://localhost:8787/auth/stub-login?sub=a&email=a@x.com');
    expect(isStubAllowed(envWith('1'), req)).toBe(true);
  });

  it('AUTH_STUB=1 이고 호스트가 127.0.0.1 이면 허용', () => {
    const req = new Request('http://127.0.0.1:8787/auth/stub-login?sub=a&email=a@x.com');
    expect(isStubAllowed(envWith('1'), req)).toBe(true);
  });

  it('부정 1: AUTH_STUB 이 없으면(호스트는 localhost) 거부', () => {
    const req = new Request('http://localhost:8787/auth/stub-login?sub=a&email=a@x.com');
    expect(isStubAllowed(envWith(undefined), req)).toBe(false);
  });

  it("부정 1b: AUTH_STUB 이 '1' 이 아닌 다른 문자열이어도(호스트는 localhost) 거부", () => {
    const req = new Request('http://localhost:8787/auth/stub-login?sub=a&email=a@x.com');
    expect(isStubAllowed(envWith('true'), req)).toBe(false);
  });

  it('부정 2: AUTH_STUB=1 이어도 호스트가 배포 도메인이면 거부', () => {
    const req = new Request(
      'https://tasky.example.workers.dev/auth/stub-login?sub=a&email=a@x.com',
    );
    expect(isStubAllowed(envWith('1'), req)).toBe(false);
  });
});
