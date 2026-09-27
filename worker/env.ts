// Worker 바인딩 타입 — wrangler.jsonc 의 d1_databases·vars·assets 와 1:1(그 파일이 단일 소스,
// 이 파일은 타입만 옮겨 적는다). `.dev.vars`(로컬)·`wrangler secret put`(배포)이 GOOGLE_CLIENT_SECRET·
// SESSION_SECRET·AUTH_STUB 을 채운다 — 이 셋은 wrangler.jsonc 의 `vars` 에 커밋하지 않는다(비밀 또는
// 로컬 전용 스위치, .dev.vars.example 참고).
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  /** 비밀 — `.dev.vars`/`wrangler secret put` 에서만 채운다. */
  GOOGLE_CLIENT_SECRET: string;
  /** 세션 쿠키 HMAC 서명 비밀. */
  SESSION_SECRET: string;
  /** `'1'` 이고 요청 호스트가 localhost/127.0.0.1 일 때만 `/auth/stub-login` 이 동작한다(worker/auth/stub.ts). */
  AUTH_STUB?: string;
  /** 서버 소셜 스위치. 누락·잘못된 값은 off. */
  SOCIAL_MODE?: string;
  /** 내부 sub의 JSON 문자열 배열. 누락·잘못된 값은 빈 목록. */
  SOCIAL_ALLOWLIST?: string;
};
