// 읽기 조건: 레이어를 추가·삭제하거나 허용 목록(의존 방향)을 바꿀 때 — docs/ARCHITECTURE.md §1 표와 1:1(ADR 필수).
// 단일 소스: eslint.config.mjs(규칙 생성)와 scripts/check-arch.sh(전수 분류 검사)가 둘 다 여기서 읽는다.
// eslint.config.mjs 는 eslint-config-next 패치 때문에 ESLint 밖에서 import 할 수 없어 데이터만 이 파일로 분리했다.

/** src/ 최상위 레이어. 이 목록 밖의 디렉토리·파일은 미분류 = 에러 */
export const LAYERS = [
  'app',
  'components',
  'features',
  'domain',
  'repositories',
  'infra',
  'lib',
  'styles',
  'test',
];

/** src/ 직속에 둘 수 있는 유일한 파일(Next.js 가 위치를 강제). lib 만 import 가능(ALLOW.root) */
export const SRC_ROOT_FILES = ['middleware.ts', 'instrumentation.ts'];

/** src/ 안에 존재할 수 있는 확장자. 늘릴 때는 ADR */
export const SRC_EXT = ['ts', 'tsx', 'css', 'md'];

/**
 * 허용 목록: 레이어 → import 해도 되는 src/ 하위 경로(자기 자신 포함). 여기 없는 src/** 경로는 전부 금지.
 * features: 각 feature 는 FEATURE_ALLOW + 자기 디렉토리 + 다른 feature 의 index.ts 만.
 * styles: .css 만 존재(코드 금지) · test: 전부 허용 · providers: src/app/providers.tsx 조립 지점 · root: SRC_ROOT_FILES
 */
export const ALLOW = {
  app: ['app', 'components', 'lib', 'styles'], // + features/<f>/index.ts
  components: ['components', 'lib', 'styles'],
  domain: ['domain', 'lib'],
  repositories: ['repositories', 'domain', 'lib'],
  infra: ['infra', 'domain', 'repositories', 'lib'],
  lib: ['lib'],
  providers: ['app', 'features', 'components', 'repositories', 'infra', 'lib', 'styles'],
  root: ['lib'],
};
export const FEATURE_ALLOW = ['domain', 'repositories', 'components', 'lib', 'styles'];

/** 외부 패키지 허용 목록(하위 레이어만 — UI 레이어는 dexie/zustand 금지 목록으로 관리) */
export const PACKAGES = {
  domain: [],
  repositories: [],
  infra: ['dexie'],
  lib: ['clsx', 'tailwind-merge'],
};

/**
 * ALLOW 항목이 없는 레이어와 그 이유. 레이어를 추가하면 ALLOW 에 넣거나 여기에 이유를 적어야 한다
 * — 아래 가드가 강제한다(이름만 추가하면 아무 규칙도 받지 않는 무제약 영역이 생기던 구멍을 막는다).
 */
export const LAYERS_WITHOUT_ALLOW = {
  features: 'feature 마다 별도 허용 목록(FEATURE_ALLOW + 자기 디렉토리 + 다른 feature 의 index.ts)',
  styles: '.css 만 존재 — 코드 파일은 그 자체가 에러',
  test: '경계 제한 없음(계약 테스트가 infra 구현을 직접 돌린다)',
};
for (const l of LAYERS) {
  if (!ALLOW[l] && !(l in LAYERS_WITHOUT_ALLOW)) {
    throw new Error(
      `arch-layers.mjs: 레이어 '${l}' 에 ALLOW 항목이 없습니다 — 허용 목록을 같은 PR 에서 추가하거나 LAYERS_WITHOUT_ALLOW 에 이유를 적으세요 (ADR-0006 규칙 1).`,
    );
  }
}

/**
 * 아키텍처 규칙 = 인라인 지시자로 끌 수 없는 규칙. 2차 패스(eslint.arch.config.mjs + --no-inline-config)가
 * 이 목록만 남겨 다시 검사하므로, 어떤 disable 문법을 쓰든 아키텍처 판정은 그대로 남는다(ADR-0008).
 * 목록이 갈라지지 않게 하는 두 가드: eslint.config.mjs 의 가드 4(경계 헬퍼가 만드는 규칙 ⊆ ARCH_RULES)와
 * eslint.arch.config.mjs 의 가드 5(ARCH_RULES 가 eslint.config.mjs 에서 실제로 그 설정으로 켜져 있는지).
 */
/** 공통 블록에서 켜는 아키텍처 규칙 — 설정값까지 여기가 단일 소스다(eslint.config.mjs 가 그대로 펼친다) */
export const ARCH_RULES_COMMON = {
  'import/no-cycle': ['error', { maxDepth: 4 }],
  // @/ 별칭이 해석되지 않으면 no-restricted-paths 가 조용히 무력화된다 — @/ import 만 반드시 해석되게 강제(카나리).
  // caseSensitive: 대소문자만 다른 표기('@/app/Providers')는 대소문자 무시 파일시스템(macOS/Windows)에서도 여기서 막힌다.
  'import/no-unresolved': ['error', { ignore: ['^(?!@/)'], caseSensitive: true }],
  'import/no-default-export': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  // 삼중슬래시 지시자는 주석이라 셀렉터가 닿지 않는다. 기본값(types: 'prefer-import', lib: 'always')은
  // `/// <reference types = "…" />` 를 통과시키므로 셋 다 'never' 로 고정한다(라운드 3 우회 m14·m16·m17).
  '@typescript-eslint/triple-slash-reference': [
    'error',
    { lib: 'never', path: 'never', types: 'never' },
  ],
};
/** 레이어 블록이 레이어마다 생성하는 경계 규칙(설정은 eslint.config.mjs 의 layerRules()/importRules() 가 만든다) */
export const ARCH_RULES_LAYER = [
  'no-restricted-imports',
  'no-restricted-syntax',
  'import/no-restricted-paths',
  'no-restricted-globals',
];
/** 2차 패스가 남기는 규칙 전체 */
export const ARCH_RULES = [...Object.keys(ARCH_RULES_COMMON), ...ARCH_RULES_LAYER];
