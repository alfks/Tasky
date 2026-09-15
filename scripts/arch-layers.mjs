// 읽기 조건: 레이어를 추가·삭제하거나 허용 목록(의존 방향)을 바꿀 때 — docs/ARCHITECTURE.md §1 표와 1:1(ADR 필수).
// 단일 소스: eslint.config.mjs(규칙 생성)와 scripts/check-arch.sh(전수 분류 검사)가 둘 다 여기서 읽는다.
// eslint.config.mjs 는 eslint-config-next 패치 때문에 ESLint 밖에서 import 할 수 없어 데이터만 이 파일로 분리했다.

/** src/ 최상위 레이어. 이 목록 밖의 디렉토리·파일은 미분류 = 에러 */
export const LAYERS = ['app', 'components', 'features', 'domain', 'repositories', 'infra', 'lib', 'styles', 'test'];

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
export const PACKAGES = { domain: [], repositories: [], infra: ['dexie'], lib: ['clsx', 'tailwind-merge'] };

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
