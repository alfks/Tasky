// 읽기 조건: 2차 패스가 실패했을 때, 또는 아키텍처 규칙 목록(scripts/arch-layers.mjs 의 ARCH_RULES)을 바꿀 때.
// 무엇인가: eslint.config.mjs(1차 패스)에서 **아키텍처 규칙만 남긴** 파생 설정. 이것으로만
//   `eslint --no-inline-config -c eslint.arch.config.mjs src` 를 한 번 더 돌린다(2차 패스, ADR-0008).
//   --no-inline-config 는 파일 안의 모든 인라인 지시자(eslint-disable 계열·/* eslint … */·/* eslint-env */·/* global */)를
//   무시하므로, 어떤 문법 변형으로 지시자를 써도 아키텍처 판정이 남는다. 지시자 문법을 셸이나 정규식으로 다시 구현하지
//   않는다 — 파싱을 ESLint 가 하므로 재현 오류가 생길 자리가 없다.
// 왜 전체 설정에 --no-inline-config 를 걸지 않는가: 그러면 스타일 규칙의 **정당한** disable
//   (`// eslint-disable-next-line react/jsx-key -- 사유`)까지 무력화되어 개발이 막힌다. 1차 패스는 그대로 둔다.
// 규칙 목록을 여기 다시 적지 않는다: 이 파일은 1차 설정을 읽어 ARCH_RULES 만 남긴다. 그래서 규칙의 내용·옵션·
//   레이어별 생성 결과가 1차와 어긋날 수 없다(어긋나면 그게 곧 구멍이었다).
// 사용법: bash scripts/check-arch.sh (2차 패스를 포함한다) — 직접 돌리려면 위 eslint 명령.
import base from './eslint.config.mjs';
import { ARCH_RULES, ARCH_RULES_COMMON, ARCH_RULES_LAYER } from './scripts/arch-layers.mjs';

const ARCH = new Set(ARCH_RULES);
const value = (v) => JSON.stringify(Array.isArray(v) ? v : [v]);

// --- 가드 5: ARCH_RULES 가 1차 설정에서 "실제로 그 설정으로" 켜져 있는지 ---
// (a) 공통 규칙은 옵션까지 대조한다. eslint-config-next 프리셋도 같은 규칙 이름을 켜므로 "존재하는가" 만 보면
//     ARCH_RULES_COMMON 스프레드를 지워도 통과해 버린다(triple-slash-reference 가 기본 옵션으로 되돌아가 우회 부활 —
//     `/// <reference types = "…" />` 가 기본값에서는 보고되지 않는다). 그래서 목록 전체를 한 블록에서 펼치는
//     공통 블록을 찾아 값을 대조한다. 뒤쪽 예외 블록이 files 로 좁혀 'off' 하는 것은 설계대로이며 그대로 보존한다.
// (b) 레이어 규칙은 레이어마다 값이 다르므로, 'off' 가 아닌 할당이 최소 한 곳에 있는지만 본다.
const commonBlock = base.find(
  (b) => b.rules && Object.keys(ARCH_RULES_COMMON).every((id) => id in b.rules),
);
if (!commonBlock) {
  throw new Error(
    "eslint.arch.config.mjs: ARCH_RULES_COMMON 을 통째로 펼치는 공통 블록이 eslint.config.mjs 에 없습니다 — '...ARCH_RULES_COMMON' 스프레드를 확인하세요 (ADR-0008).",
  );
}
for (const [id, want] of Object.entries(ARCH_RULES_COMMON)) {
  if (value(commonBlock.rules[id]) !== value(want)) {
    throw new Error(
      `eslint.arch.config.mjs: '${id}' 의 공통 블록 설정이 arch-layers.mjs 의 ARCH_RULES_COMMON 과 다릅니다 — 설정은 arch-layers.mjs 한 곳에서만 바꿉니다 (ADR-0008).`,
    );
  }
}
const notEnabled = ARCH_RULES_LAYER.filter(
  (id) => !base.some((b) => b.rules && id in b.rules && b.rules[id] !== 'off'),
);
if (notEnabled.length) {
  throw new Error(
    `eslint.arch.config.mjs: 경계 규칙 ${notEnabled.join(', ')} 를 켜는 블록이 eslint.config.mjs 에 없습니다 (ADR-0008).`,
  );
}

// --- 파생: 규칙만 걸러내고 files/ignores/plugins/parser/settings 는 1차와 동일하게 쓴다 ---
// reportUnusedDisableDirectives 는 끈다 — 지시자를 무시하는 패스에서는 모든 지시자가 "미사용" 으로 보인다.
const config = base.map((block) => {
  const derived = { ...block };
  if (block.rules)
    derived.rules = Object.fromEntries(Object.entries(block.rules).filter(([id]) => ARCH.has(id)));
  if (block.linterOptions)
    derived.linterOptions = { ...block.linterOptions, reportUnusedDisableDirectives: 'off' };
  return derived;
});

// --- 가드 6: 파생 결과가 비면(규칙 이름이 전부 바뀌는 등) 2차 패스가 조용히 아무것도 검사하지 않는다 ---
if (!config.some((b) => Object.keys(b.rules ?? {}).length > 0)) {
  throw new Error(
    'eslint.arch.config.mjs: 파생 결과에 아키텍처 규칙이 하나도 없습니다 — ARCH_RULES 와 eslint.config.mjs 의 규칙 이름을 대조하세요 (ADR-0008).',
  );
}

export default config;
