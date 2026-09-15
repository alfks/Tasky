// 읽기 조건: 린트 규칙이나 레이어 경계 규칙을 바꿀 때. 위반 메시지에 이 파일명이 찍히면 해당 블록만 본다.
// 레이어 경계는 docs/ARCHITECTURE.md §1 표와 1:1(허용 목록). 경계를 바꾸면 scripts/check-arch.sh 의 케이스도 같이 바꾼다.
// 구조(ADR-0006):
// - 허용 목록: 레이어마다 "import 해도 되는 src/ 하위 디렉토리"만 열거한다. 그 외 src/** 전부 금지(import/no-restricted-paths,
//   from: './src' + except: 허용 목록). 열거되지 않은 위치(src/ 직속 파일, 새 디렉토리)는 자동으로 금지된다.
// - 전수 분류: src/** 의 모든 파일은 정확히 하나의 레이어에 속한다. 어느 레이어에도 없는 파일은 그 자체가 에러(Program 셀렉터).
// - 확장자: 레이어 블록은 확장자를 열거하지 않는다(src/<layer>/**). 린트 대상 확장자는 LINTED 한 곳, src/ 에 존재 가능한
//   확장자는 scripts/arch-layers.mjs 의 SRC_EXT 한 곳에서만 정한다(레이어·허용 목록도 그 파일이 단일 소스).
// - 표기: src/ 안의 import 는 항상 '@/…' 절대 경로. 상대 경로 금지(code-style.md §7 표).
// - eslint-disable 우회: scripts/check-eslint-disable.sh 가 거부(ESLint 는 "쓰인" disable 을 조용히 통과시킨다).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

import { ALLOW, FEATURE_ALLOW, LAYERS, PACKAGES, SRC_EXT, SRC_ROOT_FILES } from './scripts/arch-layers.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: ROOT });
const DOC = 'docs/ARCHITECTURE.md §1';

/** 린트 대상 확장자(단일 정의). 레이어 블록은 확장자를 다시 열거하지 않는다. */
const LINTED = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';

/** src/features/<f> 목록 — 설정 로드 시 탐색(등록 불필요). `__` 접두 디렉토리(check-arch.sh 픽스처)는 feature 가 아니다. */
const FEATURES_DIR = join(ROOT, 'src/features');
const FEATURES = existsSync(FEATURES_DIR)
  ? readdirSync(FEATURES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('__'))
      .map((d) => d.name)
  : [];

const L = (dir) => `./${dir}`; // except 는 from('./src') 기준 상대 경로
const FEATURE_INDEXES = FEATURES.map((f) => L(`features/${f}/index.ts`));

/** 허용 목록 → import/no-restricted-paths zone. target 파일은 from('./src') 중 except 만 import 할 수 있다 */
const allowOnly = (target, label, allow, extraExcept = []) => ({
  'import/no-restricted-paths': [
    'error',
    {
      basePath: ROOT,
      zones: [
        {
          target,
          from: './src',
          except: [...allow.map(L), ...extraExcept],
          message: `[${label}] 허용 목록 밖 import: 이 레이어는 ${allow.map((a) => `src/${a}`).join(', ')} 만 import 할 수 있다. ${DOC}`,
        },
      ],
    },
  ],
});

/** 표기 규칙 + 패키지 규칙(no-restricted-imports, 문자열 패턴) */
const RELATIVE = { regex: '^\\.', message: "src/ 안에서 상대 경로 금지 — 항상 '@/…' 절대 경로 (code-style.md §7 표)." };
const TEST_FILE = { regex: '\\.(contract\\.|slow\\.)?test(\\.[cm]?[jt]sx?)?$', message: '테스트 파일은 테스트만 import 한다 (code-style.md §11).' };
const STORAGE = ['dexie', 'dexie/*', 'zustand', 'zustand/*'];
/** 패키지 허용 목록(regex 부정 선독): '@/' 와 allowPkgs 외 전부 금지 */
const onlyPackages = (label, allowPkgs) => ({
  regex: `^(?!@/${allowPkgs.map((p) => `|${p}(?:/|$)`).join('')})`,
  message: `[${label}] 외부 패키지 허용 목록 밖: ${allowPkgs.length ? allowPkgs.join(', ') : '(없음)'} 만 허용. ${DOC}`,
});
const restrictedImports = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });
const denyPackages = (label, pkgs) => ({ group: pkgs, message: `[${label}] 이 레이어에서 금지된 패키지입니다. ${DOC}` });

/** "이 파일은 존재하면 안 된다" — 파일 자체가 에러(no-restricted-syntax 의 Program 셀렉터) */
const forbidFile = (message) => ({ 'no-restricted-syntax': ['error', { selector: 'Program', message }] });

const NO_REACT_FC = { selector: "TSTypeReference[typeName.left.name='React'][typeName.right.name='FC']", message: 'React.FC 금지. function 선언 + Props 타입을 사용하세요 (code-style.md §3).' };
const NO_EXPORT_ALL = { selector: 'ExportAllDeclaration', message: "'export *' 금지 — 배럴은 명시 export 만 (code-style.md §2)." };
const NO_REQUIRE = { selector: "CallExpression[callee.name='require']", message: 'require() 금지 — 레이어 경계 검사를 우회한다. import 를 쓴다.' };
/** Meta 갱신은 src/domain/meta.ts 한 곳(ADR-0007). 그 외에서 rev·updatedAt·createdAt·deletedAt 을 "쓰면"(객체 리터럴·대입) 에러. 읽기(todo.rev, 구조분해)는 허용 */
const NO_META_WRITE = ['rev', 'updatedAt', 'createdAt', 'deletedAt'].map((k) => ({
  selector: `ObjectExpression > Property[key.name='${k}'], ObjectExpression > Property[key.value='${k}'], AssignmentExpression[left.property.name='${k}'], AssignmentExpression[left.property.value='${k}']`,
  message: `'${k}' 는 src/domain/meta.ts 의 createMeta()/touch()/markDeleted() 만 쓴다 (ADR-0007). 엔티티 변경은 도메인 함수 → touch() 경유.`,
}));
/** Persistable 브랜드는 meta.ts 의 함수만 만든다 — 'as Persistable<…>' 캐스팅으로 위조 금지 */
const NO_BRAND_CAST = { selector: ":matches(TSAsExpression, TSTypeAssertion) > TSTypeReference[typeName.name='Persistable']", message: "'as Persistable<…>' 금지 — 브랜드는 createMeta()/touch()/markDeleted() 만 만든다 (ADR-0007)." };
const SRC_SYNTAX = [NO_REACT_FC, NO_EXPORT_ALL, NO_REQUIRE, NO_BRAND_CAST, ...NO_META_WRITE];

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.worktrees/**',
      'public/sw.js',
      'next-env.d.ts',
      'src/**/__arch__/**', // scripts/check-arch.sh 의 임시 픽스처(잔여물이 있어도 pnpm lint 는 무해)
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // --- 공통 규칙 ---
  {
    files: [LINTED],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import/no-default-export': 'error',
      'import/no-cycle': ['error', { maxDepth: 4 }],
      // @/ 별칭이 해석되지 않으면 no-restricted-paths 가 조용히 무력화된다 — @/ import 만 반드시 해석되게 강제(카나리)
      'import/no-unresolved': ['error', { ignore: ['^(?!@/)'] }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'react-dom', group: 'external', position: 'before' },
            { pattern: 'next', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@/domain/**', group: 'internal', position: 'before' },
            { pattern: '@/repositories/**', group: 'internal', position: 'before' },
            { pattern: '@/infra/**', group: 'internal', position: 'before' },
            { pattern: '@/features/**', group: 'internal' },
            { pattern: '@/components/**', group: 'internal', position: 'after' },
            { pattern: '@/lib/**', group: 'internal', position: 'after' },
            { pattern: '@/styles/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-syntax': ['error', NO_REACT_FC],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/no-array-index-key': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
    },
  },

  // --- src/ 공통: 표기·문법 (레이어 블록은 files 에 확장자를 쓰지 않는다 — LINTED 가 정한 모든 파일에 적용) ---
  {
    files: ['src/**'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE]),
      'no-restricted-syntax': ['error', ...SRC_SYNTAX],
    },
  },

  // --- 레이어 허용 목록 (docs/ARCHITECTURE.md §1 표와 1:1) ---
  {
    files: ['src/domain/**'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, onlyPackages('domain', PACKAGES.domain)]),
      ...allowOnly('./src/domain', 'domain', ALLOW.domain),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator'],
      'no-restricted-syntax': [
        'error',
        ...SRC_SYNTAX,
        { selector: "NewExpression[callee.name='Date']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: '난수·ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
        { selector: "MemberExpression[object.name='crypto']", message: 'ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
      ],
    },
  },
  {
    // Meta 를 쓰는 유일한 파일 — NO_META_WRITE 만 해제
    files: ['src/domain/meta.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_REACT_FC, NO_EXPORT_ALL, NO_REQUIRE] },
  },
  {
    files: ['src/repositories/**'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, onlyPackages('repositories', PACKAGES.repositories)]),
      ...allowOnly('./src/repositories', 'repositories', ALLOW.repositories),
    },
  },
  {
    files: ['src/infra/**'],
    rules: {
      ...restrictedImports([
        RELATIVE,
        TEST_FILE,
        onlyPackages('infra', PACKAGES.infra),
        // Dexie 테이블(db.ts)에 닿는 파일은 query.ts 하나 — 툼스톤 필터·쓰기 경로가 그 한 곳에 있다(ADR-0007)
        { group: ['@/infra/indexeddb/db'], message: '[infra] db.ts 는 src/infra/indexeddb/query.ts 만 import 한다. 조회·쓰기는 query.ts 의 헬퍼로 (ADR-0007).' },
      ]),
      ...allowOnly('./src/infra', 'infra', ALLOW.infra),
    },
  },
  {
    files: ['src/infra/indexeddb/query.ts'],
    rules: restrictedImports([RELATIVE, TEST_FILE, onlyPackages('infra', PACKAGES.infra)]),
  },
  {
    files: ['src/lib/**'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, onlyPackages('lib', PACKAGES.lib)]),
      ...allowOnly('./src/lib', 'lib', ALLOW.lib),
    },
  },
  {
    files: ['src/components/**'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, denyPackages('components', STORAGE)]),
      ...allowOnly('./src/components', 'components', ALLOW.components),
    },
  },
  ...FEATURES.map((f) => ({
    files: [`src/features/${f}/**`],
    rules: {
      ...restrictedImports([
        RELATIVE,
        TEST_FILE,
        denyPackages(`features/${f}`, ['dexie', 'dexie/*']),
        { regex: `^@/features/${f}(/index)?$`, message: `[features/${f}] 자기 배럴 import 금지(순환). 내부 파일은 '@/features/${f}/<path>' 로 직접.` },
      ]),
      ...allowOnly(
        `./src/features/${f}`,
        `features/${f}`,
        [...FEATURE_ALLOW, `features/${f}`],
        FEATURE_INDEXES.filter((p) => p !== L(`features/${f}/index.ts`)), // 다른 feature 는 index.ts 만
      ),
    },
  })),
  {
    files: ['src/app/**'],
    ignores: ['src/app/providers.tsx'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, denyPackages('app', STORAGE)]),
      ...allowOnly('./src/app', 'app', ALLOW.app, FEATURE_INDEXES), // feature 는 index.ts 만
    },
  },
  {
    files: ['src/app/providers.tsx'],
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE, denyPackages('app/providers', STORAGE)]),
      ...allowOnly('./src/app/providers.tsx', 'app/providers', ALLOW.providers),
    },
  },
  {
    files: SRC_ROOT_FILES.map((f) => `src/${f}`),
    rules: {
      ...restrictedImports([RELATIVE, TEST_FILE]),
      ...allowOnly('./src', 'src 직속', ALLOW.root),
    },
  },

  // --- 예외 ---
  {
    files: ['src/app/**', '*.config.{ts,mjs,js}', 'next.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // 테스트는 경계를 넘어도 된다(계약 테스트가 infra 구현을 직접 돌린다). src/test 는 조립 지점(setup.ts)이자 픽스처.
    // 표기 규칙(RELATIVE)만 유지. Meta 필드 리터럴은 픽스처에 필요하므로 허용.
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'max-lines': 'off',
      'no-restricted-globals': 'off',
      'import/no-restricted-paths': 'off',
      ...restrictedImports([RELATIVE]),
      'no-restricted-syntax': ['error', NO_REACT_FC, NO_EXPORT_ALL, NO_REQUIRE],
    },
  },

  // --- 전수 분류: 어느 레이어에도 속하지 않는 파일은 존재 자체가 에러 ---
  // 반드시 마지막에 둔다: flat config 는 규칙 단위로 나중 블록이 덮어쓰므로, 앞에 두면 레이어 블록의 no-restricted-syntax 가 이를 지운다.
  {
    files: ['src/**'],
    ignores: [...LAYERS.map((l) => `src/${l}/**`), ...SRC_ROOT_FILES.map((f) => `src/${f}`)],
    rules: forbidFile(`src/ 직속 파일·미등록 디렉토리 금지: 모든 파일은 ${LAYERS.join('/')} 중 하나에 속한다(예외: ${SRC_ROOT_FILES.join(', ')}). ${DOC}`),
  },
  {
    files: ['src/features/**'],
    ignores: FEATURES.map((f) => `src/features/${f}/**`),
    rules: forbidFile('src/features 직속 파일 금지: 모든 파일은 src/features/<feature>/ 안에 둔다.'),
  },
  {
    files: ['src/**/index.*'],
    ignores: ['src/features/*/index.ts'],
    rules: forbidFile('배럴(index.ts)은 src/features/<feature>/index.ts 에만 둔다 (code-style.md §2).'),
  },
  {
    files: ['src/styles/**'],
    rules: forbidFile('src/styles 는 .css 만 둔다(토큰·전역 스타일). 코드는 lib 또는 features 로.'),
  },
  {
    files: ['src/**/*.{js,jsx,mjs,cjs,mts,cts}'],
    rules: forbidFile(`src/ 는 .${SRC_EXT.join('/.')} 만 허용한다(scripts/arch-layers.mjs SRC_EXT).`),
  },

  eslintConfigPrettier,
];

export default config;
