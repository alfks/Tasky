// 읽기 조건: 린트 규칙이나 레이어 경계 규칙을 바꿀 때. 위반 메시지에 이 파일명이 찍히면 해당 files 블록만 본다.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/** 레이어 경계: 해당 디렉토리에서 import를 금지할 패턴 → no-restricted-imports 설정 생성 */
const forbid = (patterns, layer) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: patterns.map((group) => ({
        group: [group],
        message: `[${layer}] 레이어 경계 위반: '${group}' 를 import할 수 없습니다. docs/ARCHITECTURE.md §1 참조.`,
      })),
    },
  ],
});

const FRAMEWORK = ['react', 'react-dom', 'react/*', 'next', 'next/*'];
const STORAGE = ['dexie', 'dexie/*', 'zustand', 'zustand/*'];

export default [
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
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // --- 공통 규칙 ---
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import/no-default-export': 'error',
      'import/no-cycle': ['error', { maxDepth: 4 }],
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
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      ...forbid([...FRAMEWORK, ...STORAGE, '@/features/*', '@/repositories/*', '@/infra/*', '@/app/*', '@/components/*', '@/styles/*'], 'domain'),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator'],
    },
  },
  {
    files: ['src/repositories/**/*.ts'],
    rules: forbid([...FRAMEWORK, ...STORAGE, '@/features/*', '@/infra/*', '@/app/*', '@/components/*', '@/styles/*'], 'repositories'),
  },
  {
    files: ['src/infra/**/*.ts'],
    rules: forbid([...FRAMEWORK, 'zustand', 'zustand/*', '@/features/*', '@/components/*', '@/app/*', '@/styles/*'], 'infra'),
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: forbid([...STORAGE, '@/features/*', '@/domain/*', '@/repositories/*', '@/infra/*', '@/app/*'], 'components'),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: forbid(['dexie', 'dexie/*', '@/infra/*', '@/app/*', '@/features/*/*'], 'features'),
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/providers.tsx'],
    rules: forbid(['@/domain/*', '@/repositories/*', '@/infra/*'], 'app'),
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: forbid([...FRAMEWORK, ...STORAGE, '@/domain/*', '@/repositories/*', '@/infra/*', '@/features/*', '@/components/*', '@/app/*'], 'lib'),
  },

  // --- 예외 ---
  {
    files: ['src/app/**/*.{ts,tsx}', '*.config.{ts,mjs,js}', 'next.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'src/app/manifest.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'tests/**'],
    rules: { 'max-lines': 'off', 'no-restricted-imports': 'off', 'no-restricted-globals': 'off' },
  },

  eslintConfigPrettier,
];
