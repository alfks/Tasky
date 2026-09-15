// 읽기 조건: 린트 규칙이나 레이어 경계 규칙을 바꿀 때. 위반 메시지에 이 파일명이 찍히면 해당 files 블록만 본다.
// 레이어 경계는 docs/ARCHITECTURE.md §1 표와 1:1. 경계를 바꾸면 scripts/check-arch.sh 의 케이스도 같이 바꾼다.
// - 레이어 간 import: import/no-restricted-paths (해석된 실제 경로 기준 → @/ 별칭·상대 경로·배럴 모두 같은 판정)
// - 외부 패키지·경로 표기 스타일: no-restricted-imports (문자열 패턴)
// - eslint-disable 우회: scripts/check-eslint-disable.sh 가 거부(ESLint 는 "쓰인" disable 을 조용히 통과시킨다)
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

const ROOT = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: ROOT });

/** src/features/<f> 디렉토리 목록 — 설정 로드 시 탐색하므로 새 feature 를 여기 등록할 필요가 없다 */
const FEATURES_DIR = join(ROOT, 'src/features');
const FEATURES = existsSync(FEATURES_DIR)
  ? readdirSync(FEATURES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const DOC = 'docs/ARCHITECTURE.md §1';
const FRAMEWORK = ['react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*'];
const STORAGE = ['dexie', 'dexie/*', 'zustand', 'zustand/*'];
const L = (layer) => `./src/${layer}`;

/**
 * no-restricted-imports 생성.
 * @param {string} label   메시지 접두(레이어명)
 * @param {string} self    이 디렉토리의 @/ 접두(예: '@/domain', '@/features/todo') — 내부는 상대 경로만 (code-style.md §7)
 * @param {string[]} pkgs  금지 패키지 패턴
 */
const restrictedImports = (label, self, pkgs) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...(pkgs.length ? [{ group: pkgs, message: `[${label}] 이 레이어에서 금지된 패키지입니다. ${DOC}` }] : []),
        { group: [self, `${self}/*`], message: `[${label}] 같은 디렉토리 안에서는 상대 경로(./, ../)로 import 합니다 (code-style.md §7).` },
        { regex: '^(\\.\\./){2,}', message: '두 단계 이상 상대 경로 금지. 경계를 넘는 import 는 @/ 별칭 (code-style.md §7).' },
      ],
    },
  ],
});

/** import/no-restricted-paths 생성. target 의 파일은 from 디렉토리(해석된 경로)를 import 할 수 없다 */
const restrictedPaths = (zones) => ({
  'import/no-restricted-paths': ['error', { basePath: ROOT, zones: zones.map((z) => ({ ...z, message: `${z.message} ${DOC}` })) }],
});

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
    files: ['**/*.{ts,tsx,js,mjs}'],
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
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSTypeReference[typeName.left.name='React'][typeName.right.name='FC']",
          message: 'React.FC 금지. function 선언 + Props 타입을 사용하세요 (code-style.md §3).',
        },
      ],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/no-array-index-key': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
    },
  },

  // --- 레이어 경계 (docs/ARCHITECTURE.md §1 표와 1:1) ---
  // domain / repositories / infra / lib 는 인라인 설정·disable 주석 자체를 무효화한다(noInlineConfig → 경고로 보고, --max-warnings=0 이 실패시킴).
  {
    files: ['src/domain/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      ...restrictedImports('domain', '@/domain', [...FRAMEWORK, ...STORAGE]),
      ...restrictedPaths([{ target: L('domain'), from: [L('app'), L('components'), L('features'), L('repositories'), L('infra'), L('styles'), L('test')], message: '[domain] lib 외 다른 레이어 import 금지.' }]),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator'],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: '난수·ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
        { selector: "MemberExpression[object.name='crypto']", message: 'ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
      ],
    },
  },
  {
    files: ['src/repositories/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      ...restrictedImports('repositories', '@/repositories', [...FRAMEWORK, ...STORAGE]),
      ...restrictedPaths([{ target: L('repositories'), from: [L('app'), L('components'), L('features'), L('infra'), L('styles'), L('test')], message: '[repositories] domain 만 import 가능.' }]),
    },
  },
  {
    files: ['src/infra/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      ...restrictedImports('infra', '@/infra', [...FRAMEWORK, 'zustand', 'zustand/*']),
      ...restrictedPaths([{ target: L('infra'), from: [L('app'), L('components'), L('features'), L('styles'), L('test')], message: '[infra] domain·repositories 만 import 가능.' }]),
    },
  },
  {
    files: ['src/lib/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      ...restrictedImports('lib', '@/lib', [...FRAMEWORK, ...STORAGE]),
      ...restrictedPaths([{ target: L('lib'), from: [L('app'), L('components'), L('features'), L('domain'), L('repositories'), L('infra'), L('styles'), L('test')], message: '[lib] src 내부 import 금지(순수 유틸).' }]),
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      ...restrictedImports('components', '@/components', STORAGE),
      ...restrictedPaths([{ target: L('components'), from: [L('app'), L('features'), L('domain'), L('repositories'), L('infra'), L('test')], message: '[components] lib·styles 만 import 가능(무상태 프리미티브).' }]),
    },
  },
  ...FEATURES.map((f) => ({
    files: [`src/features/${f}/**/*.{ts,tsx}`],
    rules: {
      ...restrictedImports(`features/${f}`, `@/features/${f}`, ['dexie', 'dexie/*']),
      ...restrictedPaths([
        { target: `./src/features/${f}`, from: [L('app'), L('infra'), L('test')], message: '[features] app·infra import 금지.' },
        {
          target: `./src/features/${f}`,
          from: L('features'),
          except: [`./${f}`, ...FEATURES.filter((o) => o !== f).map((o) => `./${o}/index.ts`)],
          message: "[features] 다른 feature 는 '@/features/<name>'(index.ts) 만 import.",
        },
      ]),
    },
  })),
  {
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/providers.tsx'],
    rules: {
      ...restrictedImports('app', '@/app', []),
      ...restrictedPaths([{ target: L('app'), from: [L('domain'), L('repositories'), L('infra'), L('test')], message: '[app] domain·repositories·infra 직접 import 금지(조립 지점 providers.tsx 만 예외).' }]),
    },
  },
  {
    files: ['src/app/providers.tsx'],
    rules: {
      ...restrictedImports('app/providers', '@/app', []),
      ...restrictedPaths([{ target: './src/app/providers.tsx', from: [L('domain'), L('test')], message: '[app/providers] 조립 지점은 repositories·infra·features·components 만 import.' }]),
    },
  },

  // --- 예외 ---
  {
    files: ['src/app/**/*.{ts,tsx}', '*.config.{ts,mjs,js}', 'next.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'src/app/manifest.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // 테스트는 경계를 넘어도 된다(계약 테스트가 infra 구현을 직접 돌린다). src/test 는 조립 지점(setup.ts)이자 픽스처.
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { 'max-lines': 'off', 'no-restricted-imports': 'off', 'no-restricted-globals': 'off', 'import/no-restricted-paths': 'off' },
  },

  eslintConfigPrettier,
];

export default config;
