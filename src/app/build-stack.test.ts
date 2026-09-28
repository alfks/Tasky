// 빌드 스택 경계 검사(ADR-0013 규칙 2·4·7). `next`·`vinext` 계열이 되돌아오거나, Dexie 지연 로드·정적 자산
// 전용 배포가 조용히 원복되면 실패한다. 어느 것도 타입 체크나 기존 테스트로는 드러나지 않는다.
//
// 왜 타입 체크로는 부족한가(실측): `import type { Metadata } from 'n' + 'ext'` 를 되살려도 `tsc` 가 통과했다.
// 워크트리가 상위 디렉토리 안에 있으면 Node/TS 의 상위 탐색이 **부모 체크아웃의 node_modules** 에서 그 패키지를
// 찾아 주기 때문이다. 즉 "설치돼 있지 않으니 컴파일이 막아 준다" 는 환경에 따라 참이 아니다 — 여기서 직접 본다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

/** 문자열을 조각으로 조립한다 — 이 파일 자신이 검사에 걸리지 않게 하려는 것이 아니라, 패턴의 단일 소스를 만들려는 것. */
const BANNED = ['next', 'vinext', '@vinext', 'react-server-dom-webpack'];

/** import·export·동적 import 어느 표기든 모듈 경로 리터럴을 잡는다. */
const MODULE_PATH = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__arch__') out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const isBanned = (spec: string) => BANNED.some((p) => spec === p || spec.startsWith(`${p}/`));

describe('빌드 스택: next·vinext 계열 의존이 없다(ADR-0013 규칙 2)', () => {
  it('src/** 의 어떤 파일도 그 패키지를 import 하지 않는다 — 타입 import 도 마찬가지다', () => {
    const hits: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf-8');
      for (const match of text.matchAll(MODULE_PATH)) {
        if (match[1] !== undefined && isBanned(match[1])) hits.push(`${file} → ${match[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('package.json 의 dependencies·devDependencies 에도 없다(eslint-config-next 은 별개 패키지라 허용)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((n) => BANNED.includes(n))).toEqual([]);
  });

  it('루트 설정 파일과 scripts/*.mjs 에도 없다', () => {
    // 범위를 "루트의 모든 *.config.* + scripts/*.mjs" 로 잡는다 — 이름을 열거하면 새 설정 파일이
    // 조용히 스캔 밖으로 빠진다(리뷰 Minor 8: playwright/eslint/postcss 설정이 그랬다).
    const files = [
      ...readdirSync('.').filter((f) => /^[^.].*\.config\.(ts|mts|js|mjs|cjs)$/.test(f)),
      ...readdirSync('scripts')
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => join('scripts', f)),
    ];
    expect(files.length).toBeGreaterThan(4);
    const hits: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf-8').matchAll(MODULE_PATH)) {
        if (match[1] !== undefined && isBanned(match[1])) hits.push(`${file} → ${match[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('빌드 스택: Dexie 지연 로드와 정적 자산 전용 배포(ADR-0013 규칙 4·7)', () => {
  // 바이트 예산은 `scripts/check-dist.mjs` 가 산출물에서 잰다(진입 청크 gzip · Dexie 부재).
  // 여기서는 그 앞단 — 소스 표기 — 을 잡아 `pnpm test` 에서 즉시 드러나게 한다. 정적 import 로 되돌려도
  // lint·tsc·기존 테스트·빌드가 전부 초록이었다(리뷰 변이 M16).
  it('providers.tsx 는 infra 를 동적 import 로만 불러온다', () => {
    const source = readFileSync('src/app/providers.tsx', 'utf-8');
    expect(source).toMatch(/import\(\s*['"]@\/infra\//);
    // 정적 `import … from '@/infra/…'` 이 한 줄이라도 있으면 Dexie 가 진입 청크로 돌아온다.
    expect(source).not.toMatch(/^\s*import\s[^(]*from\s*['"]@\/infra\//m);
  });

  it('wrangler.jsonc 는 정적 자산 + Worker(main) 두 패턴을 함께 쓴다(T-93, ADR-0019)', () => {
    // 주석이 있는 JSONC 라 파싱 대신 표기를 본다. SPA 정적 자산 서빙 자체는 그대로 남아 있고
    // (`not_found_handling`), 이제 `main`(Worker 스크립트)과 `run_worker_first`(그 두 경로만
    // Worker 로 먼저 보낸다) 가 함께 있어야 한다 — "main 없음" 이던 예전 단언(ADR-0013 규칙 4,
    // "서버 기능이 생기면 ADR 이 필요하다")은 ADR-0019 로 그 ADR 자체가 이미 채워졌으므로 뒤집는다.
    const source = readFileSync('wrangler.jsonc', 'utf-8').replace(/^\s*\/\/.*$/gm, '');
    expect(source).toMatch(/"not_found_handling"\s*:\s*"single-page-application"/);
    expect(source).toMatch(/"main"\s*:\s*"worker\/index\.ts"/);
    expect(source).toMatch(/"run_worker_first"\s*:\s*\[\s*"\/api\/\*"\s*,\s*"\/auth\/\*"\s*\]/);
  });
});

describe('index.html: SPA 셸 배선 — 지워도 빌드가 초록인 줄들', () => {
  // `pnpm check` 에 빌드가 없으므로 여기서도 본다. 나간 산출물 쪽 사본은 `scripts/check-dist.mjs` 가
  // 따로 본다(소스는 통과하고 빌드 변환이 지우는 경우를 가르기 위해 둘을 나눴다).
  const html = readFileSync('index.html', 'utf-8');

  it('manifest 를 가리킨다 — 설치 가능성(pwa.md R1)의 유일한 실질 배선이다', () => {
    // 파일(public/manifest.webmanifest)이 있어도 문서가 가리키지 않으면 설치되지 않는다.
    expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
  });

  it('마운트 지점과 진입 모듈이 있다 — 없으면 빌드·테스트는 초록인데 화면만 빈다', () => {
    expect(html).toMatch(/<div id="root"><\/div>/);
    expect(html).toMatch(/<script type="module" src="\/src\/app\/main\.tsx"><\/script>/);
  });

  it('<title> 이 있다', () => {
    expect(html).toMatch(/<title>Tasky<\/title>/);
  });

  it('초대 fragment를 테마 뒤·앱과 분석 앞에서 먼저 지운다', () => {
    const inviteStart = html.indexOf(
      '<script>(function(){function capture(signal){var h=location.hash;',
    );
    const inviteEnd = html.indexOf('</script>', inviteStart);
    expect(inviteStart).toBeGreaterThan(html.indexOf('tasky.theme.v1'));
    expect(inviteStart).toBeLessThan(html.indexOf('src="/src/app/main.tsx"'));
    expect(inviteStart).toBeLessThan(html.indexOf('static.cloudflareinsights.com/beacon.min.js'));
    expect(inviteEnd).toBeGreaterThan(inviteStart);

    const token = 'a'.repeat(64);
    const location = { hash: `#invite=${token}`, pathname: '/', search: '?source=friend' };
    const carrier: { __taskyIncomingInvite?: { token: string } } = {};
    const state = { previous: true };
    const replaceState = vi.fn((received: unknown, _title: string, url: string) => {
      expect(received).toBe(state);
      expect(url).toBe('/?source=friend');
      expect(carrier.__taskyIncomingInvite).toBeUndefined();
      location.hash = '';
    });
    runInNewContext(html.slice(inviteStart + '<script>'.length, inviteEnd), {
      location,
      history: { state, replaceState },
      window: carrier,
      Date,
    });
    expect(replaceState).toHaveBeenCalledOnce();
    expect(location.hash).toBe('');
    expect(carrier.__taskyIncomingInvite?.token).toBe(token);
  });

  it('잘못된 초대 원문도 제거하되 메모리에 실어 보내지 않는다', () => {
    const start = html.indexOf('<script>(function(){function capture(signal){var h=location.hash;');
    const end = html.indexOf('</script>', start);
    const location = { hash: `#invite=${'A'.repeat(64)}`, pathname: '/', search: '' };
    const carrier: { __taskyIncomingInvite?: unknown; __taskyInvalidInvite?: boolean } = {};
    const replaceState = vi.fn(() => {
      location.hash = '';
    });
    runInNewContext(html.slice(start + '<script>'.length, end), {
      location,
      history: { state: null, replaceState },
      window: carrier,
      Date,
    });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(carrier.__taskyIncomingInvite).toBeUndefined();
    expect(carrier.__taskyInvalidInvite).toBe(true);
  });

  it('비정규 초대 키·중복 값을 지우고 초대와 무관한 fragment는 보존한다', () => {
    const start = html.indexOf('<script>(function(){function capture(signal){var h=location.hash;');
    const end = html.indexOf('</script>', start);
    const source = html.slice(start + '<script>'.length, end);
    for (const hash of [
      '#x=1&invite=secret',
      '#%69nvite=secret',
      `#%69nvite=${'a'.repeat(64)}%ZZ`,
      `#%2569nvite=${'a'.repeat(64)}%ZZ`,
      '#invite=abc&invite=def',
      '#INVITE=secret',
      '#invite=',
    ]) {
      const location = { hash, pathname: '/today', search: '?a=1' };
      const carrier: { __taskyIncomingInvite?: unknown; __taskyInvalidInvite?: boolean } = {};
      const replaceState = vi.fn(() => {
        location.hash = '';
      });
      runInNewContext(source, {
        location,
        history: { state: null, replaceState },
        window: carrier,
        Date,
      });
      expect(replaceState, hash).toHaveBeenCalledWith(null, '', '/today?a=1');
      expect(carrier.__taskyIncomingInvite, hash).toBeUndefined();
      expect(carrier.__taskyInvalidInvite, hash).toBe(true);
    }
    const location = { hash: '#calendar', pathname: '/', search: '' };
    const replaceState = vi.fn();
    runInNewContext(source, { location, history: { state: null, replaceState }, window: {}, Date });
    expect(replaceState).not.toHaveBeenCalled();
    expect(location.hash).toBe('#calendar');
  });

  it('같은 문서의 hashchange도 즉시 지우고 원문 없는 신호를 한 번 보낸다', () => {
    const start = html.indexOf('<script>(function(){function capture(signal){var h=location.hash;');
    const end = html.indexOf('</script>', start);
    const location = { hash: '', pathname: '/', search: '' };
    const listeners = new Map<string, () => void>();
    const dispatched: string[] = [];
    const carrier: {
      __taskyIncomingInvite?: { token: string };
      __taskyInvalidInvite?: boolean;
      addEventListener: (name: string, listener: () => void) => void;
      dispatchEvent: (event: { type: string }) => void;
    } = {
      addEventListener: (name, listener) => listeners.set(name, listener),
      dispatchEvent: (event) => dispatched.push(event.type),
    };
    const replaceState = vi.fn(() => {
      location.hash = '';
    });
    runInNewContext(html.slice(start + '<script>'.length, end), {
      location,
      history: { state: null, replaceState },
      window: carrier,
      Date,
      Event: class {
        constructor(readonly type: string) {}
      },
    });
    expect(listeners.size).toBe(1);
    expect(replaceState).not.toHaveBeenCalled();

    location.hash = `#invite=${'a'.repeat(64)}`;
    listeners.get('hashchange')?.();
    expect(location.hash).toBe('');
    expect(carrier.__taskyIncomingInvite?.token).toBe('a'.repeat(64));
    expect(dispatched).toEqual(['tasky:social-invite']);
    listeners.get('hashchange')?.(); // replaceState가 다시 알리더라도 중복 소비하지 않는다.
    expect(dispatched).toHaveLength(1);

    location.hash = '#INVITE=bad';
    listeners.get('hashchange')?.();
    expect(carrier.__taskyIncomingInvite).toBeUndefined();
    expect(carrier.__taskyInvalidInvite).toBe(true);
    expect(dispatched).toHaveLength(2);
  });

  it('초대 페이지의 referrer 정책을 응답 헤더에 둔다', () => {
    const headers = readFileSync('public/_headers', 'utf-8');
    expect(headers).toMatch(/\/\*\s+Referrer-Policy: no-referrer/u);
  });
});
