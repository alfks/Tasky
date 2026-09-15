#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 레이어 경계(eslint.config.mjs)를 바꿀 때 — 경계 하나 = 아래 케이스 하나.
# 규칙: 레이어 경계 린트가 "실제로 위반을 잡는지"(부정 케이스)와 "허용해야 할 것을 허용하는지"(긍정 케이스)를
#       임시 파일로 확인한다(린트 규칙의 테스트). 그 전에 src/** 전수 분류(모든 트래킹 파일이 정확히 한 레이어)와
#       확장자 목록(SRC_EXT)을 검사한다 — 목록의 단일 소스는 scripts/arch-layers.mjs.
#       임시 파일은 src/<layer>/__arch__/ 에 만들었다가 trap 으로 반드시 지운다. 잔여물은 .gitignore(커밋 불가)와
#       eslint.config.mjs 의 ignores(pnpm lint 무해)가 막고, 여기서는 --no-ignore 로 그 ignores 를 뚫고 검사한다.
#       비정상 종료로 남았으면: rm -rf src/**/__arch__
# 사용법: bash scripts/check-arch.sh   (package.json 이 없으면 SKIP)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ESLINT=./node_modules/.bin/eslint
if [ ! -f package.json ] || [ ! -x "$ESLINT" ]; then
  echo "SKIP: package.json 또는 node_modules/.bin/eslint 없음(스캐폴딩 전) — 레이어 경계 검사는 스캐폴딩 후부터 동작합니다."
  exit 0
fi

# --- 0. 레이어·예외 파일·확장자 목록을 scripts/arch-layers.mjs 에서 읽는다(단일 소스) ---
lists="$(node --input-type=module -e '
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
console.log([m.LAYERS.join(" "), m.SRC_ROOT_FILES.join(" "), m.SRC_EXT.join(" ")].join("\n"));
' "$PWD/scripts/arch-layers.mjs")" || { echo "FAIL: scripts/arch-layers.mjs 를 읽지 못했습니다."; exit 1; }
LAYERS="$(printf '%s\n' "$lists" | sed -n 1p)"
ROOT_FILES="$(printf '%s\n' "$lists" | sed -n 2p)"
SRC_EXT="$(printf '%s\n' "$lists" | sed -n 3p)"

# --- 1. 전수 분류: src/ 의 모든 트래킹 파일은 LAYERS 중 하나 아래에 있거나 ROOT_FILES 다. 확장자는 SRC_EXT 안 ---
bad=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel="${f#src/}"
  top="${rel%%/*}"
  ext="${f##*.}"
  if [ "$top" = "$rel" ]; then # src/ 직속 파일
    case " $ROOT_FILES " in *" $rel "*) ;; *) echo "FAIL: $f — src/ 직속 파일은 ${ROOT_FILES// /, } 만 허용. 레이어 디렉토리로 옮기세요."; bad=1 ;; esac
  else
    case " $LAYERS " in *" $top "*) ;; *) echo "FAIL: $f — 'src/$top' 은 레이어가 아닙니다(LAYERS: $LAYERS). 새 레이어는 ADR + eslint.config.mjs LAYERS/ALLOW."; bad=1 ;; esac
  fi
  case " $SRC_EXT " in *" $ext "*) ;; *) echo "FAIL: $f — src/ 에 허용되지 않는 확장자 '.$ext'(허용: $SRC_EXT). .js/.jsx 는 .ts/.tsx 로."; bad=1 ;; esac
done <<EOF
$(git ls-files src)
EOF
for f in src/features/*/; do
  [ -d "$f" ] || continue
  case "$(basename "$f")" in __*) continue ;; esac
  [ -f "$f/index.ts" ] || { echo "FAIL: $f 에 index.ts(공개 API 배럴)가 없습니다."; bad=1; }
done
# 삼중슬래시 지시자(`/// <reference path|types`)는 주석이라 ESLint 셀렉터가 닿지 않는다(문법 규칙으로 못 막는다).
# @typescript-eslint/triple-slash-reference 가 잡지만 그 규칙은 disable 가능 목록에 있으므로, 여기서 한 번 더 본다.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qE '^[[:space:]]*///[[:space:]]*<reference[[:space:]]+(path|types)=' "$f" 2>/dev/null; then
    echo "FAIL: $f — 삼중슬래시 지시자(/// <reference path|types) 금지: 레이어 경계·패키지 허용 목록을 우회하는 의존 간선입니다. import 를 쓰세요."
    bad=1
  fi
done <<EOF
$(git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx')
EOF
[ "$bad" -eq 0 ] || { echo "FAIL: src/** 전수 분류 실패 — 위 파일을 옮기거나 ADR 로 레이어를 추가하세요."; exit 1; }
echo "PASS: src/** 전수 분류(레이어 $(git ls-files src | wc -l | tr -d ' ')개 파일, 확장자 $SRC_EXT)"

# --- 2. 린트 픽스처 ---
features=""
for d in src/features/*/; do
  [ -d "$d" ] || continue
  b="$(basename "$d")"
  case "$b" in __*) continue ;; esac
  features="$features $b"
done
set -- $features
[ "$#" -ge 1 ] || { echo "FAIL: src/features 에 feature 디렉토리가 없습니다(스캐폴딩 완료 조건 1)."; exit 1; }
FA="$1"; FB="${2:-}"
[ -n "$FB" ] || echo "WARN: feature 가 1개뿐 — 교차 feature 케이스 3건은 건너뜁니다."

DIRS="src src/domain src/repositories src/infra src/components src/lib src/app src/test src/styles src/features src/features/$FA"
[ -n "$FB" ] && DIRS="$DIRS src/features/$FB"
cleanup() { for d in $DIRS; do rm -rf "$d/__arch__"; done; }
trap cleanup EXIT
for d in $DIRS; do
  rm -rf "$d/__arch__"; mkdir -p "$d/__arch__"
  printf '// 아키텍처 검사 임시 파일 — scripts/check-arch.sh 가 만들고 지운다. 남아 있으면 rm -rf src/**/__arch__\nexport const a = 1;\n' > "$d/__arch__/a.ts"
done
# 경유지(2홉 세탁) 후보: 금지된 곳(infra)을 재export 하는 파일을 여러 위치에 둔다. 세탁이 막히는 방식은 둘 중 하나 —
# importer 가 경유지를 import 하지 못하거나(허용 목록 밖), 경유지 파일 자체가 자기 레이어 규칙에 걸린다(전수 분류).
LAUNDER='export { a } from "@/infra/__arch__/a";'
for d in src src/styles src/test src/lib; do printf '%s\n' "$LAUNDER" > "$d/__arch__/launder.ts"; done
printf '%s\n' "$LAUNDER" > "src/features/$FA/__arch__/launder.test.ts"

CASES=""; FILES=""
add() { # $1 파일  $2 기대 ruleId('-' = 위반 0건, '!<rule>' = 그 규칙은 보고되지 않아야 함)  $3 본문
  printf '%s\n' "$3" > "$1"
  CASES="$CASES $1|$2"
  FILES="$FILES $1"
}
FT="src/features/$FA/__arch__"
I='import { a } from'
# (a) 직접 위반 — 허용 목록 밖 레이어
add "$FT/infra.ts"     import/no-restricted-paths "$I '@/infra/__arch__/a'; export const x = a;"
add "$FT/app.ts"       import/no-restricted-paths "$I '@/app/__arch__/a'; export const x = a;"
add "$FT/test.ts"      import/no-restricted-paths "$I '@/test/__arch__/a'; export const x = a;"
add src/domain/__arch__/repo.ts        import/no-restricted-paths "$I '@/repositories/__arch__/a'; export const x = a;"
add src/domain/__arch__/infra.ts       import/no-restricted-paths "$I '@/infra/__arch__/a'; export const x = a;"
add src/repositories/__arch__/infra.ts import/no-restricted-paths "$I '@/infra/__arch__/a'; export const x = a;"
add src/infra/__arch__/feature.ts      import/no-restricted-paths "$I '@/features/$FA/__arch__/a'; export const x = a;"
add src/components/__arch__/domain.ts  import/no-restricted-paths "$I '@/domain/__arch__/a'; export const x = a;"
add src/lib/__arch__/domain.ts         import/no-restricted-paths "$I '@/domain/__arch__/a'; export const x = a;"
add src/app/__arch__/repo.ts           import/no-restricted-paths "$I '@/repositories/__arch__/a'; export const x = a;"
add src/app/__arch__/infra.ts          import/no-restricted-paths "$I '@/infra/__arch__/a'; export const x = a;"
add src/app/__arch__/domain.ts         import/no-restricted-paths "$I '@/domain/__arch__/a'; export const x = a;"
# (b) 경유지 2홉 — 열거되지 않은 위치를 거쳐도 막힌다(라운드 2 Blocker 재현). importer 또는 경유지 중 최소 한쪽이 에러
add src/domain/__arch__/via-root.ts    import/no-restricted-paths "$I '@/__arch__/launder'; export const x = a;"   # importer: src 직속은 허용 목록 밖
add src/__arch__/launder.ts            no-restricted-syntax       "$LAUNDER"                                          # 경유지: 미분류 파일
add "$FT/via-styles.ts"                -                          "$I '@/styles/__arch__/launder'; export const x = a;" # importer 는 합법(styles 허용) —
add src/styles/__arch__/launder.ts     no-restricted-syntax       "$LAUNDER"                                          # 경유지: styles 에 코드 금지
add src/domain/__arch__/via-lib.ts     -                          "$I '@/lib/__arch__/launder'; export const x = a;"    # importer 는 합법(lib 허용) —
add src/lib/__arch__/launder.ts        import/no-restricted-paths "$LAUNDER"                                          # 경유지: lib 은 src 내부 import 금지
add "$FT/via-test.ts"                  no-restricted-imports      "$I '@/features/$FA/__arch__/launder.test'; export const x = a;" # importer: 테스트 파일 import 금지
add src/test/__arch__/launder.ts       -                          "$LAUNDER"                                          # 경유지 test 는 합법이지만 —
add "$FT/via-testdir.ts"               import/no-restricted-paths "$I '@/test/__arch__/launder'; export const x = a;"  # importer: test 는 허용 목록 밖
# 조립 지점(app/providers) 경유 — 예외 블록이 살아 있는지 검증(ADR-0006 규칙 6). __arch__ 경로가 실제 파일 대신 판정을 받는다
add src/app/__arch__/providers.ts      no-restricted-syntax       'export { a } from "@/infra/__arch__/a";'             # 조립 지점: 재export 금지
add src/app/__arch__/providers-ok.ts   -                          "$I '@/infra/__arch__/a'; export const x = a;"        # 조립 지점: infra 직접 import 은 합법
add src/app/__arch__/via-providers.ts  no-restricted-imports      "$I '@/app/__arch__/providers'; export const x = a;"   # importer: app 파일은 조립 지점을 경유할 수 없다
add src/app/__arch__/layout.ts         -                          "$I '@/app/__arch__/providers'; export const x = a;"   # 예외: layout 만 조립 지점을 import 한다
# (c) 표기 우회 — 상대 경로·require·동적 import
add "$FT/rel.ts"       no-restricted-imports      "$I '../../../infra/__arch__/a'; export const x = a;"
add "$FT/rel1.ts"      no-restricted-imports      "$I './a'; export const x = a;"
add "$FT/req.ts"       no-restricted-syntax       "export const x = require('@/infra/__arch__/a');"
add "$FT/dyn.ts"       import/no-restricted-paths "export const x = import('@/infra/__arch__/a');"
add "$FT/dyn-tpl.ts"   no-restricted-syntax       'export const x = import(`@/infra/__arch__/a`);'   # 리터럴이 아니면 경계 검사를 못 받으므로 문법 단계에서 금지
# (c2) 경로 표기 정규형(CANONICAL) — 같은 파일을 다른 문자열로 써서 문자열 기반 규칙을 우회하는 경로를 막는다.
#      아래가 뚫리면 조립 지점·lib 시계·db.ts·자기 배럴·패키지 목록이 전부 함께 뚫린다(라운드 3 검증 4-b).
printf '// 아키텍처 검사 임시 파일\nexport const a = 1;\n' > src/domain/__arch__/a.rules.ts
add "$FT/note-dot.ts"       no-restricted-imports "$I '@/infra/__arch__/./a'; export const x = a;"
add "$FT/note-dotdot.ts"    no-restricted-imports "$I '@/infra/__arch__/../__arch__/a'; export const x = a;"
add "$FT/note-slash2.ts"    no-restricted-imports "$I '@/infra//__arch__/a'; export const x = a;"
add "$FT/note-trail.ts"     no-restricted-imports "$I '@/infra/__arch__/a/'; export const x = a;"
add "$FT/note-ext.ts"       no-restricted-imports "$I '@/infra/__arch__/a.ts'; export const x = a;"
add "$FT/note-pct.ts"       no-restricted-imports "$I '@/infra/%2e/__arch__/a'; export const x = a;"
add "$FT/note-backslash.ts" no-restricted-imports "$I '@/infra\\\\__arch__/a'; export const x = a;"   # 값에 백슬래시가 남는 표기
add "$FT/note-barrel-index.ts" no-restricted-imports "$I '@/features/$FA/index'; export const x = a;"
add src/domain/__arch__/note-lib-clock.ts no-restricted-imports "$I '@/lib/./date'; export const x = a;"
add src/app/__arch__/note-providers.ts    no-restricted-imports "$I '@/app/__arch__/./providers'; export const x = a;"
add src/app/__arch__/note-providers-ext.ts no-restricted-imports "$I '@/app/__arch__/providers.ts'; export const x = a;"
add "$FT/note-ok-dotted.ts" -             "$I '@/domain/__arch__/a.rules'; export const x = a;"   # 긍정: 이름 속 '.'(todo.rules)은 정규형이다
# (c3) 동적 import() 거울 — no-restricted-imports 는 import() 를 검사하지 않는다. 거울이 빠지면 한 줄로 전부 우회된다
add src/app/__arch__/dyn-providers.ts  no-restricted-syntax "export const x = import('@/app/__arch__/providers');"
add src/infra/__arch__/dyn-db.ts       no-restricted-syntax "export const x = import('@/infra/indexeddb/db');"
add src/domain/__arch__/dyn-pkg.ts     no-restricted-syntax "export const x = import('zustand');"
add src/domain/__arch__/dyn-lib-clock.ts no-restricted-syntax "export const x = import('@/lib/date');"
add "$FT/dyn-self-barrel.ts"           no-restricted-syntax "export const x = import('@/features/$FA');"
add "$FT/dyn-rel.ts"                   no-restricted-syntax "export const x = import('./a');"
add src/test/__arch__/dyn-note.ts      no-restricted-syntax "export const x = import('@/infra/__arch__/./a');" # 테스트도 표기 규칙은 받는다
add src/domain/__arch__/meta-dyn.ts     no-restricted-syntax "export const x = import('@/lib/date');"            # meta.ts 예외 블록도 거울을 갖는다
# (c4) 타입 경유·require 계열·모킹 거울 — no-restricted-imports 도 import/no-restricted-paths 도 보지 못하는 구문들.
#      하나라도 거울이 빠지면 그 구문 한 줄로 허용 목록 자체가 뚫린다(라운드 4 실측: typeof import() 가 그랬다).
add "$FT/typeof-infra.ts"      no-restricted-syntax "export type T = typeof import('@/infra/__arch__/a');"      # 허용 목록 밖 — 타입 경유
add "$FT/typeof-qualifier.ts"  no-restricted-syntax "export type T = import('@/infra/__arch__/a').a;"           # typeof 없는 형태도 같은 노드
add "$FT/typeof-note.ts"       no-restricted-syntax "export type T = typeof import('@/domain/__arch__/./a');"   # 표기 정규형도 그대로
add src/app/__arch__/typeof-providers.ts no-restricted-syntax "export type T = typeof import('@/app/__arch__/providers');"
add src/domain/__arch__/typeof-lib-clock.ts no-restricted-syntax "export type T = typeof import('@/lib/date');"
add "$FT/typeof-ok-self.ts"    '!no-restricted-syntax' "export type T = typeof import('@/domain/__arch__/a');" # 긍정: 허용 목록 안이면 경계 규칙은 침묵한다
add "$FT/import-equals.ts"     no-restricted-syntax "import a = require('@/infra/__arch__/a'); export const x = a;"
add "$FT/create-require.ts"    no-restricted-syntax "export const x = createRequire(import.meta.url)('@/infra/__arch__/a');"
add "$FT/meta-resolve.ts"      no-restricted-syntax "export const x = import.meta.resolve('@/infra/__arch__/a');"
add "$FT/mock-infra.ts"        no-restricted-syntax "declare const vi: { mock: (p: string) => void }; vi.mock('@/infra/__arch__/a'); export const x = 1;"
add src/test/__arch__/mock-note.ts no-restricted-syntax "declare const vi: { mock: (p: string) => void }; vi.mock('@/infra/__arch__/./a'); export const x = 1;" # 테스트도 표기 규칙은 받는다
# (d) 미분류 파일·잘못된 확장자·배럴 위치 — 파일 자체가 에러
add src/__arch__/stray.ts              no-restricted-syntax       "export const x = 1;"
add src/features/__arch__/stray.ts     no-restricted-syntax       "export const x = 1;"
add src/styles/__arch__/code.ts        no-restricted-syntax       "export const x = 1;"
add "$FT/ext.js"                       no-restricted-syntax       "$I '@/infra/__arch__/a'; export const x = a;"
add "$FT/ext.jsx"                      no-restricted-syntax       "$I '@/infra/__arch__/a'; export const x = a;"
add "$FT/ext.mts"                      no-restricted-syntax       "$I '@/infra/__arch__/a'; export const x = a;"
add src/domain/__arch__/index.ts       no-restricted-syntax       "export { a } from '@/domain/__arch__/a';"
add "$FT/star.ts"                      no-restricted-syntax       "export * from '@/domain/__arch__/a';"
# (e) 배럴·자기참조·패키지·도메인 결정성·Meta 쓰기
add "$FT/self-barrel.ts" no-restricted-imports    "$I '@/features/$FA'; export const x = a;"
add "$FT/dexie.ts"     no-restricted-imports      "import Dexie from 'dexie'; export const x = Dexie;"
add "$FT/rev.ts"       no-restricted-syntax       "export const t = { rev: 2 };"
add "$FT/updated.ts"   no-restricted-syntax       "export const t = { updatedAt: 'x' };"
add "$FT/deleted.ts"   no-restricted-syntax       "export const t = { deletedAt: 'x' };"
add "$FT/assign.ts"    no-restricted-syntax       "export const f = (t: { rev: number }) => { t.rev = 1; return t; };"
add "$FT/cast.ts"      no-restricted-syntax       "type Persistable<T> = T & { __b: true }; export const f = (t: object) => t as Persistable<object>;"
add "$FT/ok-read.ts"   -                          "export const f = (t: { rev: number; updatedAt: string }) => { const { rev } = t; return rev + t.updatedAt.length; };"
add src/domain/__arch__/react.ts       no-restricted-imports      "import { useState } from 'react'; export const x = useState;"
add src/domain/__arch__/clock.ts       no-restricted-syntax       "export const n = Date.now();"
add src/domain/__arch__/win.ts         no-restricted-globals      "export const w = window;"
add src/domain/__arch__/lib-clock.ts   no-restricted-imports      "$I '@/lib/date'; export const x = a;"
# meta.ts 예외 블록 — 결정성 규칙은 유지되고(부정), Meta 필드 쓰기만 풀린다(긍정). 두 경로는 eslint.config.mjs 의 meta 블록에 등록돼 있다
add src/domain/__arch__/meta-clock.ts  no-restricted-syntax       "export const n = Date.now();"
add src/domain/__arch__/meta-write.ts  -                          "export const t = { rev: 2 };"
add src/lib/__arch__/pkg.ts            no-restricted-imports      "import { z } from 'zustand'; export const x = z;"
add src/infra/__arch__/db.ts           no-restricted-imports      "import { db } from '@/infra/indexeddb/db'; export const x = db;"
add "$FT/unres.ts"     import/no-unresolved       "$I '@/nope/__arch__/a'; export const x = a;"
if [ -n "$FB" ]; then
  add "$FT/other-internal.ts" import/no-restricted-paths "$I '@/features/$FB/__arch__/a'; export const x = a;"
  add src/app/__arch__/feat-internal.ts import/no-restricted-paths "$I '@/features/$FA/__arch__/a'; export const x = a;"
fi
# (f) 긍정 케이스 — 허용돼야 하는 것이 허용된다(except 설정이 깨지면 여기서 잡힌다)
add "$FT/ok-self-deep.ts"  - "$I '@/features/$FA/__arch__/a'; export const x = a;"
add "$FT/ok-domain.ts"     - "$I '@/domain/__arch__/a'; export const x = a;"
add "$FT/ok-repo.ts"       - "$I '@/repositories/__arch__/a'; export const x = a;"
add "$FT/ok-components.ts" - "$I '@/components/__arch__/a'; export const x = a;"
add src/app/__arch__/ok-feature.ts   - "$I '@/features/$FA'; export const x = a;"
add src/app/__arch__/ok-components.ts - "$I '@/components/__arch__/a'; export const x = a;"
add src/domain/__arch__/ok-lib.ts    - "$I '@/lib/__arch__/a'; export const x = a;"
add src/infra/__arch__/ok-repo.ts    - "$I '@/repositories/__arch__/a'; export const x = a;"
add src/infra/__arch__/ok-dexie.ts   - "import Dexie from 'dexie'; export const x = Dexie;"
add src/test/__arch__/ok-infra.ts    - "$I '@/infra/__arch__/a'; export const x = a;"
add "$FT/ok.test.ts"       - "$I '@/infra/__arch__/a'; export const x = a;"
[ -n "$FB" ] && add "$FT/ok-other.ts" - "$I '@/features/$FB'; export const x = a;"

json="$(mktemp)"
trap 'cleanup; rm -f "$json"' EXIT
"$ESLINT" --no-ignore --format json $FILES > "$json" 2>/dev/null || true   # 위반이 있으면 eslint 는 exit 1 — 정상

node -e '
const fs = require("fs"), path = require("path");
const [jsonPath, ...cases] = process.argv.slice(1);
let results;
try { results = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch { console.log("FAIL: eslint JSON 출력을 읽지 못했습니다(설정 오류?). 직접 실행: ./node_modules/.bin/eslint --no-ignore src/domain/__arch__"); process.exit(1); }
const byFile = new Map(results.map((r) => [path.relative(process.cwd(), r.filePath), r.messages.filter((m) => m.severity === 2).map((m) => m.ruleId || "(fatal)")]));
let fail = 0, n = 0;
for (const c of cases) {
  const [file, rule] = c.split("|");
  const got = byFile.get(file) || [];
  const ok = rule === "-" ? got.length === 0 : rule.startsWith("!") ? !got.includes(rule.slice(1)) : got.includes(rule);
  if (!ok) fail = 1; n++;
  const want = rule === "-" ? "허용" : rule.startsWith("!") ? `${rule.slice(1)} 보고 없음` : rule;
  console.log(`${ok ? "PASS" : "FAIL"}: ${file} → ${want}${ok ? "" : ` (실제: ${got.join(", ") || "보고 없음"})`}`);
}
console.log(`픽스처 ${n}건`);
if (fail) { console.log("FAIL: 레이어 경계 린트가 위와 다르게 판정합니다 — eslint.config.mjs 의 해당 레이어 블록을 확인하세요."); process.exit(1); }
' "$json" $CASES

# (g) eslint-disable 우회 — 린트가 아니라 check-eslint-disable.sh 가 잡아야 한다(일반 공백 + NBSP 구분자)
printf '%s\n' "// eslint-disable-next-line import/no-restricted-paths" "$I '@/infra/__arch__/a'; export const x = a;" > "$FT/disable.ts"
printf '// eslint-disable-next-line\xc2\xa0import/no-restricted-paths -- x\n%s\n' "$I '@/infra/__arch__/a'; export const x = a;" > "$FT/disable-nbsp.ts"
for f in "$FT/disable.ts" "$FT/disable-nbsp.ts"; do
  if bash scripts/check-eslint-disable.sh "$f" >/dev/null 2>&1; then
    echo "FAIL: check-eslint-disable.sh 가 $f 의 'eslint-disable-next-line import/no-restricted-paths' 를 통과시켰습니다."
    exit 1
  fi
  echo "PASS: $f → check-eslint-disable.sh 가 거부"
done
echo "OK: 레이어 경계 린트 검증 통과"
