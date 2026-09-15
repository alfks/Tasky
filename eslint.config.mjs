// 읽기 조건: 린트 규칙이나 레이어 경계 규칙을 바꿀 때. 위반 메시지에 이 파일명이 찍히면 해당 블록만 본다.
// 레이어 경계는 docs/ARCHITECTURE.md §1 표와 1:1(허용 목록). 경계를 바꾸면 scripts/check-arch.sh 의 케이스도 같이 바꾼다.
// 구조(ADR-0006):
// - 허용 목록: 레이어마다 "import 해도 되는 src/ 하위 디렉토리"만 열거한다. 그 외 src/** 전부 금지(import/no-restricted-paths,
//   from: './src' + except: 허용 목록). 열거되지 않은 위치(src/ 직속 파일, 새 디렉토리)는 자동으로 금지된다.
// - 전수 분류: src/** 의 모든 파일은 정확히 하나의 레이어에 속한다. 어느 레이어에도 없는 파일은 그 자체가 에러(Program 셀렉터).
// - 확장자: 레이어 블록은 확장자를 열거하지 않는다(src/<layer>/**). 린트 대상 확장자는 LINTED 한 곳, src/ 에 존재 가능한
//   확장자는 scripts/arch-layers.mjs 의 SRC_EXT 한 곳에서만 정한다(레이어·허용 목록도 그 파일이 단일 소스).
// - 표기: src/ 안의 import 는 항상 '@/…' 절대 경로이고 **정규형 하나**만 쓴다(CANONICAL). 문자열로 경로를 판정하는 규칙
//   (조립 지점·lib 시계·db.ts·자기 배럴·패키지 목록)은 정규형 강제가 전제다 — 없으면 '@/app/./providers' 로 전부 우회된다.
// - 동적 import: ESLint 의 no-restricted-imports 는 import() 를 보지 않는다. importRules() 가 모든 문자열 패턴을
//   ImportExpression 셀렉터로 복제(mirror)하고, 파일 끝 가드가 복제 누락을 설정 로드 시점에 잡는다.
// - eslint-disable 우회: scripts/check-eslint-disable.sh 가 거부(ESLint 는 "쓰인" disable 을 조용히 통과시킨다).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

import { ALLOW, FEATURE_ALLOW, LAYERS, LAYERS_WITHOUT_ALLOW, PACKAGES, SRC_EXT, SRC_ROOT_FILES } from './scripts/arch-layers.mjs';

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

// --- 문자열 패턴 규칙 (no-restricted-imports). 전부 regex 한 형태로 통일한다 — group(minimatch)은 동적 import 거울을 만들 수 없다.
//     regex 안의 '/' 는 '\/' 로 쓴다: 같은 문자열이 RegExp 와 esquery 셀렉터 양쪽에서 쓰인다.
const RELATIVE = { regex: '^\\.', message: "src/ 안에서 상대 경로 금지 — 항상 '@/…' 절대 경로 (code-style.md §7 표)." };
/**
 * 정규형(canonical) 표기 강제 — 아래 모든 문자열 규칙의 전제. 한 파일을 가리키는 표기를 하나로 고정한다.
 * 거부: '.'/'..' 세그먼트 · 중복 슬래시 · 후행 슬래시 · 허용 밖 문자(백슬래시·'%' 인코딩·공백·비ASCII) · '@/' 경로의 코드 확장자와 '/index'.
 * 대소문자 변형은 no-restricted-imports 의 기본 대소문자 무시 매칭 + import/no-unresolved(caseSensitive)가 잡는다.
 * 별칭이 '@/*' 하나라는 전제 위에서만 성립한다 — 별칭을 늘리면 ADR + 이 규칙 재검토(ADR-0006 결정 9).
 */
const CANONICAL = {
  // 세그먼트 '.'/'..' · 중복 슬래시 · 후행 슬래시 · 허용 밖 문자(':' 는 node: 빌트인 때문에 허용) · @/ 경로의 확장자·'/index'
  regex: '(^|\\/)\\.{1,2}(\\/|$)|\\/\\/|\\/$|[^\\w.:@\\/-]|^@\\/.*(\\.[cm]?[jt]sx?|\\/index)$',
  message:
    "import 경로 표기 위반 — 파일 하나의 표기는 정규형 하나뿐이다: './' '../' 세그먼트, 중복·후행 슬래시, 백슬래시·인코딩·공백, 확장자(.ts/.tsx/.js…), '/index' 금지. 다른 표기는 문자열 기반 경계 규칙을 우회한다 (code-style.md §7).",
};
const TEST_FILE = { regex: '\\.(contract\\.|slow\\.)?test(\\.[cm]?[jt]sx?)?$', message: '테스트 파일은 테스트만 import 한다 (code-style.md §11).' };
const STORAGE = ['dexie', 'zustand'];
/** 패키지 허용 목록(regex 부정 선독): '@/' 와 allowPkgs 외 전부 금지 */
const onlyPackages = (label, allowPkgs) => ({
  regex: `^(?!@\\/${allowPkgs.map((p) => `|${p}(?:\\/|$)`).join('')})`,
  message: `[${label}] 외부 패키지 허용 목록 밖: ${allowPkgs.length ? allowPkgs.join(', ') : '(없음)'} 만 허용. ${DOC}`,
});
const denyPackages = (label, pkgs) => ({ regex: `^(${pkgs.join('|')})(\\/|$)`, message: `[${label}] 이 레이어에서 금지된 패키지입니다. ${DOC}` });

/** "이 파일은 존재하면 안 된다" — 파일 자체가 에러(no-restricted-syntax 의 Program 셀렉터) */
const forbidFile = (message) => ({ 'no-restricted-syntax': ['error', { selector: 'Program', message }] });

const NO_REACT_FC = { selector: "TSTypeReference[typeName.left.name='React'][typeName.right.name='FC']", message: 'React.FC 금지. function 선언 + Props 타입을 사용하세요 (code-style.md §3).' };
const NO_EXPORT_ALL = { selector: 'ExportAllDeclaration', message: "'export *' 금지 — 배럴은 명시 export 만 (code-style.md §2)." };
const NO_REQUIRE = { selector: "CallExpression[callee.name='require'], CallExpression[callee.object.name='require']", message: 'require()·require.resolve() 금지 — 레이어 경계 검사를 우회한다. import 를 쓴다.' };
/** Meta 갱신은 src/domain/meta.ts 한 곳(ADR-0007). 그 외에서 rev·updatedAt·createdAt·deletedAt 을 "쓰면"(객체 리터럴·대입) 에러. 읽기(todo.rev, 구조분해)는 허용 */
const NO_META_WRITE = ['rev', 'updatedAt', 'createdAt', 'deletedAt'].map((k) => ({
  selector: `ObjectExpression > Property[key.name='${k}'], ObjectExpression > Property[key.value='${k}'], AssignmentExpression[left.property.name='${k}'], AssignmentExpression[left.property.value='${k}']`,
  message: `'${k}' 는 src/domain/meta.ts 의 createMeta()/touch()/markDeleted() 만 쓴다 (ADR-0007). 엔티티 변경은 도메인 함수 → touch() 경유.`,
}));
/** Persistable 브랜드는 meta.ts 의 함수만 만든다 — 'as Persistable<…>' 캐스팅으로 위조 금지 */
const NO_BRAND_CAST = { selector: ":matches(TSAsExpression, TSTypeAssertion) > TSTypeReference[typeName.name='Persistable']", message: "'as Persistable<…>' 금지 — 브랜드는 createMeta()/touch()/markDeleted() 만 만든다 (ADR-0007)." };
/** 동적 import() 는 인자가 문자열 리터럴일 때만 경계 판정을 받는다 — 변수·템플릿 리터럴은 해석 불가 = 검사 우회 */
const NO_DYNAMIC_NONLITERAL = { selector: "ImportExpression:not([source.type='Literal'])", message: '동적 import() 의 인자는 문자열 리터럴만 — 변수·템플릿 리터럴은 레이어 경계 검사를 우회한다 (code-style.md §7).' };
/** 모든 src 블록이 반드시 갖는 문법 규칙(파일 끝 가드가 강제) */
const SYNTAX_BASE = [NO_REACT_FC, NO_EXPORT_ALL, NO_REQUIRE, NO_DYNAMIC_NONLITERAL];
const SRC_SYNTAX = [...SYNTAX_BASE, NO_BRAND_CAST, ...NO_META_WRITE];
/** 도메인 결정성(ADR-0005 규칙 2). meta.ts 예외 블록도 반드시 이 배열을 그대로 쓴다 — flat config 는 규칙 단위 덮어쓰기라 빠뜨리면 통째로 사라진다 */
const DOMAIN_DETERMINISM = [
  { selector: "NewExpression[callee.name='Date']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).' },
  { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: '난수·ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
  { selector: "MemberExpression[object.name='crypto']", message: 'ID 는 deps.id() 로 주입받습니다 (ADR-0005).' },
];
/** domain 은 시계·ID 의 런타임 구현을 직접 import 해서도 안 된다 — 한 단계 건너가면 위 셀렉터가 보지 못한다 */
const NO_LIB_CLOCK = { regex: '^@\\/lib\\/(date|id)$', message: '[domain] 시계·ID 구현을 직접 import 하지 않는다 — deps = { now, id } 로 주입 (ADR-0005 규칙 2).' };
/** Dexie 테이블(db.ts)에 닿는 파일은 query.ts 하나 — 툼스톤 필터·쓰기 경로가 그 한 곳에 있다(ADR-0007) */
const NO_DB_IMPORT = { regex: '^@\\/infra\\/indexeddb\\/db$', message: '[infra] db.ts 는 src/infra/indexeddb/query.ts 만 import 한다. 조회·쓰기는 query.ts 의 헬퍼로 (ADR-0007).' };
/** 조립 지점을 경유지로 쓰지 않는다: @/app/providers 를 import 할 수 있는 파일은 layout.tsx 하나 (ADR-0006 규칙 6) */
const NO_PROVIDERS_IMPORT = { regex: '^@\\/app\\/(__arch__\\/)?providers$', message: '[app] 조립 지점(app/providers)은 layout.tsx 만 import 한다 — 다른 app 파일이 경유하면 infra 에 2홉으로 닿는다 (ADR-0006 규칙 6).' };
/** 조립 지점의 재export 금지 — `export { db } from '@/infra/…'` 한 줄이면 허용 목록 밖 레이어가 그대로 새어나간다 */
const NO_REEXPORT = { selector: 'ExportNamedDeclaration[source]', message: "[app/providers] 재export(`export … from`) 금지 — 조립 지점이 경유지가 된다. 필요한 값은 이 파일 안에서 조립해 컴포넌트로만 내보낸다 (ADR-0006 규칙 6)." };

/** 문자열 패턴 하나 → 동적 import() 거울. no-restricted-imports 는 ImportExpression 을 검사하지 않는다(ESLint 9 실측) */
const mirror = (p) => ({ selector: `ImportExpression[source.value=/${p.regex}/i]`, message: `${p.message} [동적 import() 도 같은 판정]` });
/**
 * import 관련 두 규칙을 한 번에 만든다 — 문자열 패턴과 그 동적 import 거울이 같은 블록에서 절대 갈라지지 않게.
 * patterns: 이 블록에서 추가로 금지할 문자열 패턴 · syntax: 이 블록의 no-restricted-syntax 항목(거울은 자동 추가).
 */
const importRules = (patterns, syntax) => {
  const all = [RELATIVE, CANONICAL, ...patterns];
  return {
    'no-restricted-imports': ['error', { patterns: all }],
    'no-restricted-syntax': ['error', ...syntax, ...all.map(mirror)],
  };
};
/** domain 과 meta.ts 예외 블록이 공유하는 문자열 패턴(예외 블록이 푸는 것은 문법 규칙 둘뿐이다) */
const DOMAIN_PATTERNS = [TEST_FILE, NO_LIB_CLOCK, onlyPackages('domain', PACKAGES.domain)];

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
      // @/ 별칭이 해석되지 않으면 no-restricted-paths 가 조용히 무력화된다 — @/ import 만 반드시 해석되게 강제(카나리).
      // caseSensitive: 대소문자만 다른 표기('@/app/Providers')는 대소문자 무시 파일시스템(macOS/Windows)에서도 여기서 막힌다.
      'import/no-unresolved': ['error', { ignore: ['^(?!@/)'], caseSensitive: true }],
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
    rules: importRules([TEST_FILE], SRC_SYNTAX),
  },

  // --- 레이어 허용 목록 (docs/ARCHITECTURE.md §1 표와 1:1) ---
  {
    files: ['src/domain/**'],
    rules: {
      ...importRules(DOMAIN_PATTERNS, [...SRC_SYNTAX, ...DOMAIN_DETERMINISM]),
      ...allowOnly('./src/domain', 'domain', ALLOW.domain),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator'],
    },
  },
  {
    // Meta·브랜드를 만드는 유일한 파일 — 해제하는 것은 NO_META_WRITE 와 NO_BRAND_CAST 둘뿐이다.
    // 결정성 셀렉터는 그대로 유지한다: meta.ts 도 시각·ID 를 deps 로 받으므로 Date·crypto 가 필요 없고,
    // 여기서 풀리면 시각·ID 진입점이 무검사가 된다. import 규칙은 domain 과 같은 것을 다시 만든다
    // (no-restricted-syntax 를 덮어쓰는 블록은 동적 import 거울도 같이 만들어야 한다 — 파일 끝 가드가 강제).
    // __arch__ 경로는 check-arch.sh 픽스처 전용(레포에 존재하지 않음).
    files: ['src/domain/meta.ts', 'src/domain/__arch__/meta-clock.ts', 'src/domain/__arch__/meta-write.ts', 'src/domain/__arch__/meta-dyn.ts'],
    rules: importRules(DOMAIN_PATTERNS, [...SYNTAX_BASE, ...DOMAIN_DETERMINISM]),
  },
  {
    files: ['src/repositories/**'],
    rules: {
      ...importRules([TEST_FILE, onlyPackages('repositories', PACKAGES.repositories)], SRC_SYNTAX),
      ...allowOnly('./src/repositories', 'repositories', ALLOW.repositories),
    },
  },
  {
    files: ['src/infra/**'],
    rules: {
      ...importRules([TEST_FILE, onlyPackages('infra', PACKAGES.infra), NO_DB_IMPORT], SRC_SYNTAX),
      ...allowOnly('./src/infra', 'infra', ALLOW.infra),
    },
  },
  {
    files: ['src/infra/indexeddb/query.ts'],
    rules: importRules([TEST_FILE, onlyPackages('infra', PACKAGES.infra)], SRC_SYNTAX),
  },
  {
    files: ['src/lib/**'],
    rules: {
      ...importRules([TEST_FILE, onlyPackages('lib', PACKAGES.lib)], SRC_SYNTAX),
      ...allowOnly('./src/lib', 'lib', ALLOW.lib),
    },
  },
  {
    files: ['src/components/**'],
    rules: {
      ...importRules([TEST_FILE, denyPackages('components', STORAGE)], SRC_SYNTAX),
      ...allowOnly('./src/components', 'components', ALLOW.components),
    },
  },
  ...FEATURES.map((f) => ({
    files: [`src/features/${f}/**`],
    rules: {
      ...importRules(
        [
          TEST_FILE,
          denyPackages(`features/${f}`, ['dexie']),
          { regex: `^@\\/features\\/${f}$`, message: `[features/${f}] 자기 배럴 import 금지(순환). 내부 파일은 '@/features/${f}/<path>' 로 직접.` },
        ],
        SRC_SYNTAX,
      ),
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
    ignores: ['src/app/providers.tsx', 'src/app/__arch__/providers.ts', 'src/app/__arch__/providers-ok.ts'],
    rules: {
      ...importRules([TEST_FILE, NO_PROVIDERS_IMPORT, denyPackages('app', STORAGE)], SRC_SYNTAX),
      ...allowOnly('./src/app', 'app', ALLOW.app, FEATURE_INDEXES), // feature 는 index.ts 만
    },
  },
  {
    // 조립 지점을 import 할 수 있는 유일한 파일(NO_PROVIDERS_IMPORT 해제). __arch__ 경로는 check-arch.sh 픽스처 전용.
    files: ['src/app/layout.tsx', 'src/app/__arch__/layout.ts'],
    rules: importRules([TEST_FILE, denyPackages('app', STORAGE)], SRC_SYNTAX),
  },
  {
    files: ['src/app/providers.tsx', 'src/app/__arch__/providers.ts', 'src/app/__arch__/providers-ok.ts'],
    rules: {
      ...importRules([TEST_FILE, denyPackages('app/providers', STORAGE)], [...SRC_SYNTAX, NO_REEXPORT]),
      ...allowOnly(['./src/app/providers.tsx', './src/app/__arch__/providers.ts', './src/app/__arch__/providers-ok.ts'], 'app/providers', ALLOW.providers),
    },
  },
  {
    files: SRC_ROOT_FILES.map((f) => `src/${f}`),
    rules: {
      ...importRules([TEST_FILE], SRC_SYNTAX),
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
    // 표기 규칙(RELATIVE·CANONICAL)만 유지. Meta 필드 리터럴과 'as Persistable' 은 픽스처에 필요하므로 허용.
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'max-lines': 'off',
      'no-restricted-globals': 'off',
      'import/no-restricted-paths': 'off',
      ...importRules([], SYNTAX_BASE),
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

// --- 설정 자체의 가드 1: 레이어를 추가하고 규칙 블록을 빠뜨리면 아무 규칙도 받지 않는 영역이 생긴다(전수 분류 블록의 ignores 가 면제해 버린다) ---
const TARGETED = new Set(config.flatMap((b) => b.files ?? []));
const uncovered = LAYERS.filter((l) => !(l in LAYERS_WITHOUT_ALLOW) && !TARGETED.has(`src/${l}/**`));
if (uncovered.length) {
  throw new Error(`eslint.config.mjs: 레이어 ${uncovered.join(', ')} 에 규칙 블록(files: 'src/<layer>/**')이 없습니다 — 레이어를 추가하면 같은 PR 에서 블록도 추가하세요 (ADR-0006 규칙 1).`);
}

// --- 설정 자체의 가드 2: 문자열 패턴 ↔ 동적 import 거울 ↔ 공통 문법 규칙이 블록마다 함께 있는지 ---
// no-restricted-imports 는 import() 를 보지 않으므로, 거울이 빠진 블록에서는 import('@/app/providers') 한 줄로
// 그 블록의 문자열 규칙 전부가 무력해진다. 두 규칙 중 하나만 덮어쓰는 블록도 같은 이유로 금지한다(importRules() 를 쓸 것).
for (const block of config) {
  const patterns = block.rules?.['no-restricted-imports']?.[1]?.patterns;
  const syntax = block.rules?.['no-restricted-syntax']?.slice(1);
  const files = (block.files ?? []).flat(Infinity).filter((f) => typeof f === 'string'); // files 는 중첩 배열이 허용된다
  const where = files.join(', ');
  const isSrcBlock = files.some((f) => f.startsWith('src/') || f.includes('*.test.'));
  if (!isSrcBlock || (!patterns && !syntax)) continue;
  if (syntax?.length === 1 && syntax[0].selector === 'Program') continue; // forbidFile: 파일 자체가 에러
  if (!patterns || !syntax) {
    throw new Error(`eslint.config.mjs: [${where}] 블록은 no-restricted-imports 와 no-restricted-syntax 를 함께 설정해야 합니다 — importRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`);
  }
  const selectors = new Set(syntax.map((s) => s.selector));
  const unmirrored = patterns.filter((p) => !selectors.has(mirror(p).selector)).map((p) => p.regex);
  if (unmirrored.length) {
    throw new Error(`eslint.config.mjs: [${where}] 문자열 패턴 ${unmirrored.join(' , ')} 의 동적 import() 거울이 없습니다 — importRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`);
  }
  const missingBase = SYNTAX_BASE.filter((s) => !syntax.includes(s)).map((s) => s.selector);
  if (missingBase.length) {
    throw new Error(`eslint.config.mjs: [${where}] 블록에 공통 문법 규칙 ${missingBase.join(' , ')} 가 빠졌습니다 — SYNTAX_BASE 를 포함하세요 (ADR-0006 결정 9).`);
  }
}

export default config;
