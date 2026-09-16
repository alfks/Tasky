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
// - 거울(mirror): ESLint 의 no-restricted-imports 는 import 선언과 export … from 만 본다. 나머지 모듈 경로 구문
//   (동적 import() · typeof import()/import().Q 의 TSImportType · vi/jest 모킹)에는 importRules() 가 같은 문자열 패턴을
//   셀렉터로 복제하고(MIRROR_NODES), 파일 끝 가드 2 가 복제 누락을 설정 로드 시점에 잡는다.
// - 허용 목록의 두 표현: import/no-restricted-paths(해석 경로)는 위 거울 구문을 보지 못하므로, 같은 except 배열에서
//   문자열 패턴(allowPattern)도 만들어 함께 건다. 두 표현은 layerRules() 한 곳에서 나오고 가드 3 이 대조한다.
// - require 계열: require()·require.resolve()·import x = require()·createRequire()·import.meta.resolve 는 경로 판정을
//   받을 수 없으므로 구문 자체를 금지한다(NO_REQUIRE·NO_IMPORT_EQUALS).
// - eslint-disable 우회: 이 설정(1차 패스)은 스타일 규칙의 정당한 disable 을 허용한다. 아키텍처 규칙(arch-layers.mjs 의
//   ARCH_RULES)은 eslint.arch.config.mjs 로 도는 2차 패스가 --no-inline-config 로 다시 검사하므로, 어떤 지시자 문법을
//   써도 판정이 남는다(ADR-0008). 두 목록이 갈라지지 않게 파일 끝 가드 4 와 2차 설정의 가드 5 가 맞물린다.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

import {
  ALLOW,
  ARCH_RULES,
  ARCH_RULES_COMMON,
  FEATURE_ALLOW,
  LAYERS,
  LAYERS_WITHOUT_ALLOW,
  PACKAGES,
  SRC_EXT,
  SRC_ROOT_FILES,
} from './scripts/arch-layers.mjs';

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
/** feature 가 밖에 노출하는 유일한 파일(배럴). zone 의 except 와 문자열 패턴이 이 한 목록에서 나온다 */
const FEATURE_PATHS = FEATURES.map((f) => `features/${f}`);

/** 허용 목록 → except: 디렉토리는 접두 허용, feature 는 그 배럴 파일 하나만 */
const exceptOf = (allow, exact) => [...allow.map(L), ...exact.map((e) => L(`${e}/index.ts`))];
const allowMessage = (label, except) =>
  `[${label}] 허용 목록 밖 import: 이 레이어는 ${except.map((e) => `src/${e.slice(2)}`).join(', ') || '(src/ 안의 무엇도)'} 만 import 할 수 있다. ${DOC}`;

/**
 * except 와 같은 판정을 하는 문자열 패턴. import/no-restricted-paths 는 해석된 경로로 판정하지만
 * typeof import()(TSImportType)·모듈 모킹 같은 구문은 아예 보지 않으므로, 그 구문들에도 같은 허용 목록을
 * 걸려면 문자열 형태가 필요하다(표기 정규형 강제가 전제 — CANONICAL). 같은 except 배열에서 파생되므로
 * zone 과 갈라질 수 없고, 가드 3 이 zone 에서 다시 계산해 대조한다.
 */
const allowPattern = (label, except) => {
  const seg = (e) => e.replace(/^\.\//, '').replaceAll('/', '\\/');
  const dirs = except.filter((e) => !e.endsWith('.ts')).map(seg);
  const barrels = except
    .filter((e) => e.endsWith('.ts'))
    .map((e) => seg(e.replace(/\/index\.ts$/, '')));
  const alts = [
    ...(dirs.length ? [`(?:${dirs.join('|')})(?:\\/|$)`] : []),
    ...(barrels.length ? [`(?:${barrels.join('|')})$`] : []),
  ];
  return {
    regex: alts.length ? `^@\\/(?!${alts.join('|')})` : '^@\\/',
    message: allowMessage(label, except),
  };
};
/** 허용 목록 → import/no-restricted-paths zone. target 파일은 from('./src') 중 except 만 import 할 수 있다 */
const allowZone = (target, label, except) => ({
  'import/no-restricted-paths': [
    'error',
    {
      basePath: ROOT,
      zones: [{ target, from: './src', except, message: allowMessage(label, except) }],
    },
  ],
});

// --- 문자열 패턴 규칙 (no-restricted-imports). 전부 regex 한 형태로 통일한다 — group(minimatch)은 동적 import 거울을 만들 수 없다.
//     regex 안의 '/' 는 '\/' 로 쓴다: 같은 문자열이 RegExp 와 esquery 셀렉터 양쪽에서 쓰인다.
const RELATIVE = {
  regex: '^\\.',
  message: "src/ 안에서 상대 경로 금지 — 항상 '@/…' 절대 경로 (code-style.md §7 표).",
};
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
const TEST_FILE = {
  regex: '\\.(contract\\.|slow\\.)?test(\\.[cm]?[jt]sx?)?$',
  message: '테스트 파일은 테스트만 import 한다 (code-style.md §11).',
};
const STORAGE = ['dexie', 'zustand'];
/** 패키지 허용 목록(regex 부정 선독): '@/' 와 allowPkgs 외 전부 금지 */
const onlyPackages = (label, allowPkgs) => ({
  regex: `^(?!@\\/${allowPkgs.map((p) => `|${p}(?:\\/|$)`).join('')})`,
  message: `[${label}] 외부 패키지 허용 목록 밖: ${allowPkgs.length ? allowPkgs.join(', ') : '(없음)'} 만 허용. ${DOC}`,
});
const denyPackages = (label, pkgs) => ({
  regex: `^(${pkgs.join('|')})(\\/|$)`,
  message: `[${label}] 이 레이어에서 금지된 패키지입니다. ${DOC}`,
});

/** "이 파일은 존재하면 안 된다" — 파일 자체가 에러(no-restricted-syntax 의 Program 셀렉터) */
const forbidFile = (message) => ({
  'no-restricted-syntax': ['error', { selector: 'Program', message }],
});

const NO_REACT_FC = {
  selector: "TSTypeReference[typeName.left.name='React'][typeName.right.name='FC']",
  message: 'React.FC 금지. function 선언 + Props 타입을 사용하세요 (code-style.md §3).',
};
const NO_EXPORT_ALL = {
  selector: 'ExportAllDeclaration',
  message: "'export *' 금지 — 배럴은 명시 export 만 (code-style.md §2).",
};
/** 경로 판정을 받을 수 없는 모듈 참조는 구문 자체를 막는다: require()·require.resolve()·createRequire()(별칭 우회)·import.meta.resolve */
const NO_REQUIRE = {
  selector:
    "CallExpression[callee.name='require'], CallExpression[callee.object.name='require'], CallExpression[callee.name='createRequire'], CallExpression[callee.property.name='createRequire'], CallExpression[callee.object.type='MetaProperty'][callee.property.name='resolve']",
  message:
    'require()·require.resolve()·createRequire()·import.meta.resolve 금지 — 레이어 경계 검사를 우회한다. import 를 쓴다.',
};
/** `import x = require('…')`(TSImportEqualsDeclaration): no-restricted-imports 도 import/no-restricted-paths 도 보지 못한다 */
const NO_IMPORT_EQUALS = {
  selector: 'TSImportEqualsDeclaration',
  message:
    "`import x = require('…')` 금지 — 경계 규칙이 보지 못하는 구문이다. `import … from '@/…'` 를 쓴다.",
};
/** Meta 갱신은 src/domain/meta.ts 한 곳(ADR-0007). 그 외에서 rev·updatedAt·createdAt·deletedAt 을 "쓰면"(객체 리터럴·대입) 에러. 읽기(todo.rev, 구조분해)는 허용 */
const NO_META_WRITE = ['rev', 'updatedAt', 'createdAt', 'deletedAt'].map((k) => ({
  selector: `ObjectExpression > Property[key.name='${k}'], ObjectExpression > Property[key.value='${k}'], AssignmentExpression[left.property.name='${k}'], AssignmentExpression[left.property.value='${k}']`,
  message: `'${k}' 는 src/domain/meta.ts 의 createMeta()/touch()/markDeleted() 만 쓴다 (ADR-0007). 엔티티 변경은 도메인 함수 → touch() 경유.`,
}));
/** Persistable 브랜드는 meta.ts 의 함수만 만든다 — 'as Persistable<…>' 캐스팅으로 위조 금지 */
const NO_BRAND_CAST = {
  selector:
    ":matches(TSAsExpression, TSTypeAssertion) > TSTypeReference[typeName.name='Persistable']",
  message:
    "'as Persistable<…>' 금지 — 브랜드는 createMeta()/touch()/markDeleted()(+ADR-0009 adopt()) 만 만든다 (ADR-0007).",
};
/**
 * Object.* 조립·변형 API 금지. 두 가지를 동시에 우회하기 때문이다:
 * (a) Meta 필드를 리터럴 키 없이 덮어쓰므로 NO_META_WRITE 가 보지 못하고,
 * (b) `Object.assign(x, y)` 의 반환 타입이 교차 타입 `X & Y` 라 Persistable 브랜드가 다른 엔티티로 옮겨붙는다.
 * (b) 는 브랜드를 T 에 대해 불변으로 바꿔(ADR-0007 결정 1) 타입 단계에서도 막았지만, 이미 브랜드가 붙은 값을
 * 출발점으로 삼는 변형(`Object.assign(touch(e, now), stale)`)은 타입으로 구분할 수 없어 여기서 구문째 막는다.
 * 병합은 스프레드로, 엔티티 생성·변경은 createMeta()/touch()/markDeleted() 로 한다(meta.ts 는 예외 블록).
 */
const NO_OBJECT_MUTATE = {
  selector:
    "CallExpression[callee.object.name='Object'][callee.property.name=/^(assign|create|defineProperty|defineProperties|setPrototypeOf)$/]",
  message:
    'Object.assign()·create()·defineProperty()·defineProperties()·setPrototypeOf() 금지 — Meta 필드를 리터럴 키 없이 덮어써 NO_META_WRITE 를 우회하고, 교차 타입으로 Persistable 브랜드를 위조한다 (ADR-0007). 새 엔티티는 createMeta(), 변경은 touch()/markDeleted(), 그 밖의 병합은 스프레드.',
};
/** `as never` 는 어떤 파라미터에도 대입되는 만능 캐스팅이라 브랜드·경계 타입을 통째로 무력화한다 */
const NO_NEVER_CAST = {
  selector: ':matches(TSAsExpression, TSTypeAssertion) > TSNeverKeyword',
  message:
    "'as never' 금지 — 어떤 타입에도 대입되므로 Persistable 브랜드를 포함한 모든 타입 검사를 우회한다 (ADR-0007).",
};
/** 동적 import() 는 인자가 문자열 리터럴일 때만 경계 판정을 받는다 — 변수·템플릿 리터럴은 해석 불가 = 검사 우회 */
const NO_DYNAMIC_NONLITERAL = {
  selector: "ImportExpression:not([source.type='Literal'])",
  message:
    '동적 import() 의 인자는 문자열 리터럴만 — 변수·템플릿 리터럴은 레이어 경계 검사를 우회한다 (code-style.md §7).',
};
/** 모든 src 블록이 반드시 갖는 문법 규칙(파일 끝 가드가 강제) */
const SYNTAX_BASE = [
  NO_REACT_FC,
  NO_EXPORT_ALL,
  NO_REQUIRE,
  NO_IMPORT_EQUALS,
  NO_DYNAMIC_NONLITERAL,
];
const SRC_SYNTAX = [
  ...SYNTAX_BASE,
  NO_BRAND_CAST,
  NO_NEVER_CAST,
  NO_OBJECT_MUTATE,
  ...NO_META_WRITE,
];
/** 도메인 결정성(ADR-0005 규칙 2). meta.ts 예외 블록도 반드시 이 배열을 그대로 쓴다 — flat config 는 규칙 단위 덮어쓰기라 빠뜨리면 통째로 사라진다 */
const DOMAIN_DETERMINISM = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: '시간은 deps.now() 로 주입받습니다 (ADR-0005).',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: '난수·ID 는 deps.id() 로 주입받습니다 (ADR-0005).',
  },
  {
    selector: "MemberExpression[object.name='crypto']",
    message: 'ID 는 deps.id() 로 주입받습니다 (ADR-0005).',
  },
];
/** domain 은 시계·ID 의 런타임 구현을 직접 import 해서도 안 된다 — 한 단계 건너가면 위 셀렉터가 보지 못한다 */
const NO_LIB_CLOCK = {
  regex: '^@\\/lib\\/(date|id)$',
  message:
    '[domain] 시계·ID 구현을 직접 import 하지 않는다 — deps = { now, id } 로 주입 (ADR-0005 규칙 2).',
};
/** Dexie 테이블(db.ts)에 닿는 파일은 query.ts 하나 — 툼스톤 필터·쓰기 경로가 그 한 곳에 있다(ADR-0007) */
const NO_DB_IMPORT = {
  regex: '^@\\/infra\\/indexeddb\\/db$',
  message:
    '[infra] db.ts 는 src/infra/indexeddb/query.ts 만 import 한다. 조회·쓰기는 query.ts 의 헬퍼로 (ADR-0007).',
};
/** 조립 지점을 경유지로 쓰지 않는다: @/app/providers 를 import 할 수 있는 파일은 main.tsx 하나 (ADR-0006 규칙 6) */
const NO_PROVIDERS_IMPORT = {
  regex: '^@\\/app\\/(__arch__\\/)?providers$',
  message:
    '[app] 조립 지점(app/providers)은 main.tsx 만 import 한다 — 다른 app 파일이 경유하면 infra 에 2홉으로 닿는다 (ADR-0006 규칙 6).',
};
/** 조립 지점의 재export 금지 — `export { db } from '@/infra/…'` 한 줄이면 허용 목록 밖 레이어가 그대로 새어나간다 */
const NO_REEXPORT = {
  selector: 'ExportNamedDeclaration[source]',
  message:
    '[app/providers] 재export(`export … from`) 금지 — 조립 지점이 경유지가 된다. 필요한 값은 이 파일 안에서 조립해 컴포넌트로만 내보낸다 (ADR-0006 규칙 6).',
};

/**
 * 거울 대상: no-restricted-imports 가 보지 않는 "문자열로 모듈 경로를 쓰는 구문" 전부(라운드 4 전수 실측).
 * 여기에서 빠진 구문이 곧 다음 우회 구멍이다 — 구문을 추가하면 check-arch.sh 픽스처도 같이 추가한다.
 * (import·export … from·import type·export type … from 은 no-restricted-imports 가 직접 본다.
 *  require 계열은 NO_REQUIRE·NO_IMPORT_EQUALS 가 구문째 금지한다. `/// <reference path|types|lib>` 는 주석이라
 *  셀렉터가 닿지 않고 @typescript-eslint/triple-slash-reference(ARCH_RULES_COMMON 이 셋 다 'never')가 막는다.
 *  JSDoc `@type {import('@/…')}` 도 주석이지만 src/ 는 .ts/.tsx 만 허용되므로 타입이 적용되지 않는다 — 대상 아님.)
 */
const MIRROR_NODES = [
  (re) => `ImportExpression[source.value=${re}]`, // 동적 import('…')
  (re) => `TSImportType[source.value=${re}]`, // typeof import('…') · import('…').Q — 타입 경유
  (re) =>
    `NewExpression[callee.name='URL'][arguments.1.object.type='MetaProperty'][arguments.1.property.name='url'] > Literal[value=${re}]`, // new URL('…', import.meta.url) — 워커·자산 모듈 참조
  (re) =>
    `CallExpression[callee.object.name=/^(vi|jest)$/][callee.property.name=/^(mock|doMock|unmock|doUnmock|importActual|importMock|requireActual|requireMock)$/] > Literal[value=${re}]`, // 모듈 모킹
];
// --- 설정 자체의 가드 0: 거울 목록에서 노드 종류가 사라지면 그 구문이 즉시 우회로가 된다(TSImportType 이 그렇게 뚫렸다).
//     목록을 줄이려면 이 이름도 같이 지워야 한다 — 두 곳을 고치게 해서 "모르고 빠뜨리는" 경우를 없앤다.
const REQUIRED_MIRROR_NODES = [
  'ImportExpression',
  'TSImportType',
  'NewExpression',
  'CallExpression',
];
const MIRROR_SELECTORS = MIRROR_NODES.map((node) => node('/x/'));
const missingNodes = REQUIRED_MIRROR_NODES.filter(
  (name) => !MIRROR_SELECTORS.some((sel) => sel.startsWith(name)),
);
if (missingNodes.length) {
  throw new Error(
    `eslint.config.mjs: MIRROR_NODES 에 ${missingNodes.join(', ')} 거울이 없습니다 — 그 구문은 문자열 규칙·허용 목록을 전부 우회합니다 (ADR-0006 결정 9).`,
  );
}

/** 문자열 패턴 하나 → 거울 셀렉터들. no-restricted-imports 는 이 구문들을 검사하지 않는다(ESLint 9 실측) */
const mirrors = (p) =>
  MIRROR_NODES.map((node) => ({
    selector: node(`/${p.regex}/i`),
    message: `${p.message} [import()·typeof import()·모킹도 같은 판정]`,
  }));
/**
 * import 관련 두 규칙을 한 번에 만든다 — 문자열 패턴과 그 거울이 같은 블록에서 절대 갈라지지 않게.
 * patterns: 이 블록에서 추가로 금지할 문자열 패턴 · syntax: 이 블록의 no-restricted-syntax 항목(거울은 자동 추가).
 */
const importRules = (patterns, syntax) => {
  const all = [RELATIVE, CANONICAL, ...patterns];
  return {
    'no-restricted-imports': ['error', { patterns: all }],
    'no-restricted-syntax': ['error', ...syntax, ...all.flatMap(mirrors)],
  };
};
/**
 * 레이어 블록의 import 규칙 셋(문자열 패턴 + 거울 + 해석 경로 zone)을 한 번에 만든다.
 * 허용 목록은 exceptOf() 한 번만 계산해 zone 과 문자열 패턴 양쪽에 쓴다 — 둘이 갈라질 수 없다(가드 3).
 */
const layerRules = ({ target, label, allow, exact = [], patterns = [], syntax = SRC_SYNTAX }) => {
  const except = exceptOf(allow, exact);
  return {
    ...importRules([allowPattern(label, except), ...patterns], syntax),
    ...allowZone(target, label, except),
  };
};
/** domain 과 meta.ts 예외 블록이 공유하는 문자열 패턴(예외 블록이 푸는 것은 문법 규칙 둘뿐이다) */
const DOMAIN_PATTERNS = [TEST_FILE, NO_LIB_CLOCK, onlyPackages('domain', PACKAGES.domain)];

const config = [
  {
    ignores: [
      'dist/**', // Vite 빌드 산출물
      '.wrangler/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.worktrees/**',
      'public/sw.js',
      'src/**/__arch__/**', // scripts/check-arch.sh 의 임시 픽스처(잔여물이 있어도 pnpm lint 는 무해)
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // --- 공통 규칙 ---
  {
    files: [LINTED],
    // import 플러그인을 **여기서 직접** 등록한다(직접 devDependency). 예전에는 위 next 프리셋이 딸려 오는 것에
    // 얹혀 있었는데, 순환 검출(import/no-cycle)이 무관한 죽은 의존(eslint-config-next, ADR-0013)에 매달려
    // 있다는 뜻이었다 — 그 프리셋을 걷어내는 순간 가드가 같이 사라진다(T-33). 같은 모듈 인스턴스이므로
    // 프리셋이 등록하는 것과 충돌하지 않고, 프리셋이 사라져도 import/* 규칙은 그대로 돈다.
    plugins: { import: importPlugin },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      ...ARCH_RULES_COMMON, // 아키텍처 규칙(2차 패스가 다시 검사) — 설정의 단일 소스는 scripts/arch-layers.mjs
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'react-dom', group: 'external', position: 'before' },
            { pattern: '@/domain/**', group: 'internal', position: 'before' },
            { pattern: '@/repositories/**', group: 'internal', position: 'before' },
            { pattern: '@/infra/**', group: 'internal', position: 'before' },
            { pattern: '@/features/**', group: 'internal' },
            { pattern: '@/components/**', group: 'internal', position: 'after' },
            { pattern: '@/lib/**', group: 'internal', position: 'after' },
            { pattern: '@/styles/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
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
  // 허용 목록의 기본값은 "src/ 안의 무엇도 import 할 수 없다"(fail-closed) — 레이어 블록이 자기 몫만 연다.
  {
    files: ['src/**'],
    rules: layerRules({ target: './src', label: 'src', allow: [], patterns: [TEST_FILE] }),
  },

  // --- 레이어 허용 목록 (docs/ARCHITECTURE.md §1 표와 1:1) ---
  {
    files: ['src/domain/**'],
    rules: {
      ...layerRules({
        target: './src/domain',
        label: 'domain',
        allow: ALLOW.domain,
        patterns: DOMAIN_PATTERNS,
        syntax: [...SRC_SYNTAX, ...DOMAIN_DETERMINISM],
      }),
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'navigator',
      ],
    },
  },
  {
    // Meta·브랜드를 만드는 유일한 파일 — 해제하는 것은 NO_META_WRITE·NO_BRAND_CAST·NO_NEVER_CAST·NO_OBJECT_MUTATE 다.
    // 결정성 셀렉터는 그대로 유지한다: meta.ts 도 시각·ID 를 deps 로 받으므로 Date·crypto 가 필요 없고,
    // 여기서 풀리면 시각·ID 진입점이 무검사가 된다. import 규칙은 domain 과 같은 것을 다시 만든다
    // (no-restricted-syntax 를 덮어쓰는 블록은 구문 거울과 허용 목록 문자열 패턴도 같이 만들어야 한다 — 파일 끝 가드 2·3 이 강제).
    // __arch__ 경로는 check-arch.sh 픽스처 전용(레포에 존재하지 않음).
    files: [
      'src/domain/meta.ts',
      'src/domain/__arch__/meta-clock.ts',
      'src/domain/__arch__/meta-write.ts',
      'src/domain/__arch__/meta-dyn.ts',
      'src/domain/__arch__/meta-assign.ts',
    ],
    rules: layerRules({
      target: './src/domain',
      label: 'domain',
      allow: ALLOW.domain,
      patterns: DOMAIN_PATTERNS,
      syntax: [...SYNTAX_BASE, ...DOMAIN_DETERMINISM],
    }),
  },
  {
    files: ['src/repositories/**'],
    rules: layerRules({
      target: './src/repositories',
      label: 'repositories',
      allow: ALLOW.repositories,
      patterns: [TEST_FILE, onlyPackages('repositories', PACKAGES.repositories)],
    }),
  },
  {
    files: ['src/infra/**'],
    rules: layerRules({
      target: './src/infra',
      label: 'infra',
      allow: ALLOW.infra,
      patterns: [TEST_FILE, onlyPackages('infra', PACKAGES.infra), NO_DB_IMPORT],
    }),
  },
  {
    files: ['src/infra/indexeddb/query.ts'],
    rules: layerRules({
      target: './src/infra',
      label: 'infra',
      allow: ALLOW.infra,
      patterns: [TEST_FILE, onlyPackages('infra', PACKAGES.infra)],
    }),
  },
  {
    files: ['src/lib/**'],
    rules: layerRules({
      target: './src/lib',
      label: 'lib',
      allow: ALLOW.lib,
      patterns: [TEST_FILE, onlyPackages('lib', PACKAGES.lib)],
    }),
  },
  {
    files: ['src/components/**'],
    rules: layerRules({
      target: './src/components',
      label: 'components',
      allow: ALLOW.components,
      patterns: [TEST_FILE, denyPackages('components', STORAGE)],
    }),
  },
  ...FEATURES.map((f) => ({
    files: [`src/features/${f}/**`],
    rules: layerRules({
      target: `./src/features/${f}`,
      label: `features/${f}`,
      allow: [...FEATURE_ALLOW, `features/${f}`],
      exact: FEATURE_PATHS.filter((p) => p !== `features/${f}`), // 다른 feature 는 index.ts 만
      patterns: [
        TEST_FILE,
        denyPackages(`features/${f}`, ['dexie']),
        {
          regex: `^@\\/features\\/${f}$`,
          message: `[features/${f}] 자기 배럴 import 금지(순환). 내부 파일은 '@/features/${f}/<path>' 로 직접.`,
        },
      ],
    }),
  })),
  {
    files: ['src/app/**'],
    ignores: [
      'src/app/providers.tsx',
      'src/app/__arch__/providers.ts',
      'src/app/__arch__/providers-ok.ts',
    ],
    rules: layerRules({
      target: './src/app',
      label: 'app',
      allow: ALLOW.app,
      exact: FEATURE_PATHS, // feature 는 index.ts 만
      patterns: [TEST_FILE, NO_PROVIDERS_IMPORT, denyPackages('app', STORAGE)],
    }),
  },
  {
    // 조립 지점을 import 할 수 있는 유일한 파일(NO_PROVIDERS_IMPORT 해제). __arch__ 경로는 check-arch.sh
    // 픽스처 전용이고 그 파일명은 scripts/check-arch.sh 와 한 쌍이다 — 바꾸려면 두 파일을 같이 바꾼다.
    files: ['src/app/main.tsx', 'src/app/__arch__/layout.ts'],
    rules: layerRules({
      target: './src/app',
      label: 'app',
      allow: ALLOW.app,
      exact: FEATURE_PATHS,
      patterns: [TEST_FILE, denyPackages('app', STORAGE)],
    }),
  },
  {
    files: [
      'src/app/providers.tsx',
      'src/app/__arch__/providers.ts',
      'src/app/__arch__/providers-ok.ts',
    ],
    rules: layerRules({
      target: [
        './src/app/providers.tsx',
        './src/app/__arch__/providers.ts',
        './src/app/__arch__/providers-ok.ts',
      ],
      label: 'app/providers',
      allow: ALLOW.providers,
      patterns: [TEST_FILE, denyPackages('app/providers', STORAGE)],
      syntax: [...SRC_SYNTAX, NO_REEXPORT],
    }),
  },
  {
    files: SRC_ROOT_FILES.map((f) => `src/${f}`),
    rules: layerRules({
      target: './src',
      label: 'src 직속',
      allow: ALLOW.root,
      patterns: [TEST_FILE],
    }),
  },

  // --- 예외 ---
  {
    // 설정 파일만 default export 를 쓴다. src/app/** 은 더 이상 예외가 아니다 — App Router 가 강제하던
    // default export 규약이 사라졌으므로(ADR-0013) 앱 코드는 전부 named export 다(code-style §3).
    files: ['*.config.{ts,mjs,js}', 'vitest.config.ts', 'playwright.config.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // 이 레포의 린트 설정 자체. 규칙 생성 헬퍼·거울·가드가 한 파일에 모여 있어야 서로 갈라지지 않으므로
    // 분할하지 않는다 — 300줄 상한은 적용하지 않는다(src/** 의 상한은 그대로다).
    files: ['eslint.config.mjs', 'eslint.arch.config.mjs'],
    rules: { 'max-lines': 'off' },
  },
  {
    // 테스트는 경계를 넘어도 된다(계약 테스트가 infra 구현을 직접 돌린다). src/test 는 조립 지점(setup.ts)이자 픽스처.
    // 표기 규칙(RELATIVE·CANONICAL)만 유지. Meta 필드 리터럴·'as Persistable'·Object.assign 은 픽스처와
    // 위조 시도 테스트(meta.test.ts)에 필요하므로 허용 — 브랜드 위조는 그 테스트에서 tsc 가 판정한다.
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
    rules: forbidFile(
      `src/ 직속 파일·미등록 디렉토리 금지: 모든 파일은 ${LAYERS.join('/')} 중 하나에 속한다(예외: ${SRC_ROOT_FILES.join(', ')}). ${DOC}`,
    ),
  },
  {
    files: ['src/features/**'],
    ignores: FEATURES.map((f) => `src/features/${f}/**`),
    rules: forbidFile(
      'src/features 직속 파일 금지: 모든 파일은 src/features/<feature>/ 안에 둔다.',
    ),
  },
  {
    files: ['src/**/index.*'],
    ignores: ['src/features/*/index.ts'],
    rules: forbidFile(
      '배럴(index.ts)은 src/features/<feature>/index.ts 에만 둔다 (code-style.md §2).',
    ),
  },
  {
    files: ['src/styles/**'],
    rules: forbidFile('src/styles 는 .css 만 둔다(토큰·전역 스타일). 코드는 lib 또는 features 로.'),
  },
  {
    files: ['src/**/*.{js,jsx,mjs,cjs,mts,cts}'],
    rules: forbidFile(
      `src/ 는 .${SRC_EXT.join('/.')} 만 허용한다(scripts/arch-layers.mjs SRC_EXT).`,
    ),
  },

  eslintConfigPrettier,
];

// --- 설정 자체의 가드 1: 레이어를 추가하고 규칙 블록을 빠뜨리면 아무 규칙도 받지 않는 영역이 생긴다(전수 분류 블록의 ignores 가 면제해 버린다) ---
const TARGETED = new Set(config.flatMap((b) => b.files ?? []));
const uncovered = LAYERS.filter(
  (l) => !(l in LAYERS_WITHOUT_ALLOW) && !TARGETED.has(`src/${l}/**`),
);
if (uncovered.length) {
  throw new Error(
    `eslint.config.mjs: 레이어 ${uncovered.join(', ')} 에 규칙 블록(files: 'src/<layer>/**')이 없습니다 — 레이어를 추가하면 같은 PR 에서 블록도 추가하세요 (ADR-0006 규칙 1).`,
  );
}

// --- 설정 자체의 가드 2: 문자열 패턴 ↔ 거울 ↔ 공통 문법 규칙 ↔ 허용 목록이 블록마다 함께 있는지 ---
// no-restricted-imports 는 import()·typeof import()·모킹을 보지 않으므로, 거울이 빠진 블록에서는 그 구문 한 줄로
// 그 블록의 문자열 규칙 전부가 무력해진다(라운드 3: 동적 import, 라운드 4: typeof import()). 두 규칙 중 하나만
// 덮어쓰는 블록도 같은 이유로 금지한다(importRules()/layerRules() 를 쓸 것).
for (const block of config) {
  const patterns = block.rules?.['no-restricted-imports']?.[1]?.patterns;
  const syntax = block.rules?.['no-restricted-syntax']?.slice(1);
  const files = (block.files ?? []).flat(Infinity).filter((f) => typeof f === 'string'); // files 는 중첩 배열이 허용된다
  const where = files.join(', ');
  const isSrcBlock = files.some((f) => f.startsWith('src/') || f.includes('*.test.'));
  if (!isSrcBlock || (!patterns && !syntax)) continue;
  if (syntax?.length === 1 && syntax[0].selector === 'Program') continue; // forbidFile: 파일 자체가 에러
  if (!patterns || !syntax) {
    throw new Error(
      `eslint.config.mjs: [${where}] 블록은 no-restricted-imports 와 no-restricted-syntax 를 함께 설정해야 합니다 — importRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`,
    );
  }
  const selectors = new Set(syntax.map((s) => s.selector));
  const unmirrored = patterns
    .filter((p) => mirrors(p).some((m) => !selectors.has(m.selector)))
    .map((p) => p.regex);
  if (unmirrored.length) {
    throw new Error(
      `eslint.config.mjs: [${where}] 문자열 패턴 ${unmirrored.join(' , ')} 의 거울(${REQUIRED_MIRROR_NODES.join('·')})이 없습니다 — importRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`,
    );
  }
  const missingBase = SYNTAX_BASE.filter((s) => !syntax.includes(s)).map((s) => s.selector);
  if (missingBase.length) {
    throw new Error(
      `eslint.config.mjs: [${where}] 블록에 공통 문법 규칙 ${missingBase.join(' , ')} 가 빠졌습니다 — SYNTAX_BASE 를 포함하세요 (ADR-0006 결정 9).`,
    );
  }
  // --- 가드 3: 허용 목록의 두 표현(해석 경로 zone ↔ 문자열 패턴)이 같은 except 에서 나왔는지 ---
  // zone 은 typeof import()·모킹을 보지 못하므로 문자열 패턴이 빠지면 그 구문으로 레이어 경계 자체가 뚫린다(라운드 4 실측).
  const paths = block.rules?.['import/no-restricted-paths'];
  if (!paths) {
    throw new Error(
      `eslint.config.mjs: [${where}] 블록은 import/no-restricted-paths 를 (zone 또는 'off' 로) 명시해야 합니다 — layerRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`,
    );
  }
  if (paths !== 'off') {
    const missingAllow = paths[1].zones
      .map((z) => allowPattern('', z.except).regex)
      .filter((re) => !patterns.some((p) => p.regex === re));
    if (missingAllow.length) {
      throw new Error(
        `eslint.config.mjs: [${where}] zone 의 허용 목록에 대응하는 문자열 패턴 ${missingAllow.join(' , ')} 이 없습니다 — layerRules() 헬퍼를 쓰세요 (ADR-0006 결정 9).`,
      );
    }
  }
}

// --- 설정 자체의 가드 4: 경계 강제에 쓰는 규칙이 전부 ARCH_RULES 안에 있는지 ---
// 새 경계 규칙을 헬퍼에 추가하고 ARCH_RULES 에 넣지 않으면 2차 패스가 그 규칙을 검사하지 않는다 = 지시자 한 줄로 다시 꺼진다.
// 목록을 줄이려면 ARCH_RULES 와 헬퍼 양쪽을 고쳐야 한다(가드 0 과 같은 "두 곳" 패턴).
const HELPER_RULES = [
  ...Object.keys(importRules([], [])),
  ...Object.keys(allowZone('./src', '', [])),
  'no-restricted-globals',
];
const notArch = HELPER_RULES.filter((id) => !ARCH_RULES.includes(id));
if (notArch.length) {
  throw new Error(
    `eslint.config.mjs: 경계 규칙 ${notArch.join(', ')} 가 scripts/arch-layers.mjs 의 ARCH_RULES 에 없습니다 — 2차 패스가 검사하지 않아 eslint-disable 로 꺼집니다 (ADR-0008).`,
  );
}

// --- 설정 자체의 가드 7: 아키텍처 규칙이 쓰는 import/* 규칙이 등록된 플러그인에 실제로 있는지 ---
// import/no-cycle 은 이 레포의 유일한 순환 가드다. 플러그인이 빠지거나 규칙 이름이 바뀌면 ESLint 가
// "Could not find plugin" 으로 죽기도 하지만, 프리셋이 같은 이름을 다시 등록해 주는 동안에는 조용히
// **다른 구현**을 쓸 수도 있다. 설정 로드 시점에 규칙 존재를 확인해 둔다(T-33).
const importRuleIds = ARCH_RULES.filter((id) => id.startsWith('import/')).map((id) => id.slice(7));
const missingImportRules = importRuleIds.filter((id) => !(id in (importPlugin.rules ?? {})));
if (missingImportRules.length) {
  throw new Error(
    `eslint.config.mjs: eslint-plugin-import 에 규칙 ${missingImportRules.join(', ')} 가 없습니다 — 아키텍처 가드(순환 검출 포함)가 조용히 무력화됩니다 (T-33).`,
  );
}

export default config;
