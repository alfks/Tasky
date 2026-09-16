// 빌드 스택 경계 검사(ADR-0013 규칙 2). `next`·`vinext` 계열이 소스나 package.json 으로 되돌아오면 실패한다.
//
// 왜 타입 체크로는 부족한가(실측): `import type { Metadata } from 'n' + 'ext'` 를 되살려도 `tsc` 가 통과했다.
// 워크트리가 상위 디렉토리 안에 있으면 Node/TS 의 상위 탐색이 **부모 체크아웃의 node_modules** 에서 그 패키지를
// 찾아 주기 때문이다. 즉 "설치돼 있지 않으니 컴파일이 막아 준다" 는 환경에 따라 참이 아니다 — 여기서 직접 본다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

  it('루트 설정 파일에도 없다(vite.config.ts · vitest.config.ts · serwist.config.js)', () => {
    const hits: string[] = [];
    for (const file of ['vite.config.ts', 'vitest.config.ts', 'serwist.config.js']) {
      for (const match of readFileSync(file, 'utf-8').matchAll(MODULE_PATH)) {
        if (match[1] !== undefined && isBanned(match[1])) hits.push(`${file} → ${match[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
