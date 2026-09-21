// 쿠키 속성 계약(SYNC_DESIGN.md §②-4): HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age.
import { describe, expect, it } from 'vitest';

import {
  clearOauthStateCookie,
  clearSessionCookie,
  parseCookies,
  setOauthStateCookie,
  setSessionCookie,
} from './cookies';

describe('setSessionCookie', () => {
  it('HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000(30일)을 갖는다', () => {
    const value = setSessionCookie('sid.sig');
    expect(value).toMatch(/^tasky_session=/);
    expect(value).toMatch(/HttpOnly/);
    expect(value).toMatch(/Secure/);
    expect(value).toMatch(/SameSite=Lax/);
    expect(value).toMatch(/Path=\//);
    expect(value).toMatch(/Max-Age=2592000/);
  });
});

describe('setOauthStateCookie', () => {
  it('Max-Age=600(10분)', () => {
    expect(setOauthStateCookie('state')).toMatch(/Max-Age=600\b/);
  });
});

describe('clear*Cookie — Max-Age=0', () => {
  it('세션 쿠키 삭제', () => {
    expect(clearSessionCookie()).toMatch(/Max-Age=0/);
  });
  it('OAuth state 쿠키 삭제', () => {
    expect(clearOauthStateCookie()).toMatch(/Max-Age=0/);
  });
});

describe('parseCookies', () => {
  it('여러 쿠키를 이름:값으로 나눈다(값은 URL 디코드)', () => {
    expect(parseCookies('a=1; b=hello%20world')).toEqual({ a: '1', b: 'hello world' });
  });
  it('헤더가 없으면 빈 객체', () => {
    expect(parseCookies(null)).toEqual({});
  });
});
