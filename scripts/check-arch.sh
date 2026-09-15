#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 레이어 경계(eslint.config.mjs)를 바꿀 때 — 경계 하나 = 아래 케이스 하나.
# 규칙: 레이어 경계 린트가 "실제로 위반을 잡는지"를 일부러 위반하는 임시 파일로 확인한다(린트 규칙의 테스트).
#       임시 파일은 src/<layer>/__arch__/ 에 만들었다가 trap 으로 반드시 지운다. 잔여물은 .gitignore(커밋 불가)와
#       eslint.config.mjs 의 ignores(pnpm lint 무해)가 막고, 여기서는 --no-ignore 로 그 ignores 를 뚫고 검사한다.
# 사용법: bash scripts/check-arch.sh   (package.json 이 없으면 SKIP)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ESLINT=./node_modules/.bin/eslint
if [ ! -f package.json ] || [ ! -x "$ESLINT" ]; then
  echo "SKIP: package.json 또는 node_modules/.bin/eslint 없음(스캐폴딩 전) — 레이어 경계 검사는 스캐폴딩 후부터 동작합니다."
  exit 0
fi

# feature 디렉토리 2개(서로 다른 feature 간 규칙을 검사하기 위해)
features=""
for d in src/features/*/; do
  [ -d "$d" ] || continue
  b="$(basename "$d")"
  case "$b" in __*) continue ;; esac
  features="$features $b"
done
set -- $features
if [ "$#" -lt 2 ]; then
  echo "FAIL: src/features 에 feature 디렉토리가 2개 이상 있어야 합니다(현재 $#개). 스캐폴딩 티켓은 MVP feature 5개 디렉토리를 만든다."
  exit 1
fi
FA="$1"; FB="$2"

DIRS="src/domain src/repositories src/infra src/components src/lib src/app src/test src/features/$FA src/features/$FB"
cleanup() { for d in $DIRS; do rm -rf "$d/__arch__"; done; }
trap cleanup EXIT
for d in $DIRS; do
  rm -rf "$d/__arch__"; mkdir -p "$d/__arch__"
  printf '// 아키텍처 검사 임시 파일 — scripts/check-arch.sh 가 만들고 지운다. 남아 있으면 rm -rf src/**/__arch__\nexport const a = 1;\n' > "$d/__arch__/index.ts"
done

CASES=""
FILES=""
add() { # $1 파일  $2 기대 ruleId  $3 본문
  printf '%s\n' "$3" > "$1"
  CASES="$CASES $1|$2"
  FILES="$FILES $1"
}
FT="src/features/$FA/__arch__"
# (a) 상대 경로 우회 · (b) 배럴/디렉토리 import 우회 — 둘 다 해석된 경로 기준으로 잡혀야 한다
add "$FT/rel.ts"       import/no-restricted-paths "import { a } from '../../../infra/__arch__'; export const x = a;"
add "$FT/barrel.ts"    import/no-restricted-paths "import { a } from '@/infra/__arch__'; export const x = a;"
add "$FT/app.ts"       import/no-restricted-paths "import { a } from '@/app/__arch__'; export const x = a;"
add "$FT/test.ts"      import/no-restricted-paths "import { a } from '@/test/__arch__'; export const x = a;"
add "$FT/other.ts"     import/no-restricted-paths "import { a } from '@/features/$FB/__arch__'; export const x = a;"
add "$FT/self.ts"      no-restricted-imports      "import { a } from '@/features/$FA/__arch__'; export const x = a;"
add "$FT/depth.ts"     no-restricted-imports      "import { a } from '../../../lib/__arch__'; export const x = a;"
add "$FT/dexie.ts"     no-restricted-imports      "import Dexie from 'dexie'; export const x = Dexie;"
add "$FT/unres.ts"     import/no-unresolved       "import { a } from '@/nope/__arch__'; export const x = a;"
add src/domain/__arch__/repo.ts        import/no-restricted-paths "import { a } from '@/repositories/__arch__'; export const x = a;"
add src/domain/__arch__/react.ts       no-restricted-imports      "import { useState } from 'react'; export const x = useState;"
add src/domain/__arch__/clock.ts       no-restricted-syntax       "export const n = Date.now();"
add src/domain/__arch__/win.ts         no-restricted-globals      "export const w = window;"
add src/repositories/__arch__/infra.ts import/no-restricted-paths "import { a } from '@/infra/__arch__'; export const x = a;"
add src/infra/__arch__/feature.ts      import/no-restricted-paths "import { a } from '@/features/$FA/__arch__'; export const x = a;"
add src/components/__arch__/domain.ts  import/no-restricted-paths "import { a } from '@/domain/__arch__'; export const x = a;"
add src/lib/__arch__/domain.ts         import/no-restricted-paths "import { a } from '@/domain/__arch__'; export const x = a;"
add src/app/__arch__/repo.ts           import/no-restricted-paths "import { a } from '@/repositories/__arch__'; export const x = a;"
add src/app/__arch__/infra.ts          import/no-restricted-paths "import { a } from '@/infra/__arch__'; export const x = a;"

json="$(mktemp)"
trap 'cleanup; rm -f "$json"' EXIT
"$ESLINT" --no-ignore --format json $FILES > "$json" 2>/dev/null || true   # 위반이 있으면 eslint 는 exit 1 — 정상

node -e '
const fs = require("fs"), path = require("path");
const [jsonPath, ...cases] = process.argv.slice(1);
let results;
try { results = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch { console.log("FAIL: eslint JSON 출력을 읽지 못했습니다(설정 오류?). 직접 실행: ./node_modules/.bin/eslint --no-ignore src/domain/__arch__"); process.exit(1); }
const byFile = new Map(results.map((r) => [path.relative(process.cwd(), r.filePath), r.messages.map((m) => m.ruleId)]));
let fail = 0;
for (const c of cases) {
  const [file, rule] = c.split("|");
  const got = byFile.get(file) || [];
  const ok = got.includes(rule);
  if (!ok) fail = 1;
  console.log(`${ok ? "PASS" : "FAIL"}: ${file} → ${rule}${ok ? "" : ` (실제: ${got.filter(Boolean).join(", ") || "보고 없음"})`}`);
}
if (fail) { console.log("FAIL: 레이어 경계 린트가 위 위반을 잡지 못합니다 — eslint.config.mjs 의 해당 레이어 블록을 확인하세요."); process.exit(1); }
' "$json" $CASES

# (c) eslint-disable 우회 — 린트가 아니라 check-eslint-disable.sh 가 잡아야 한다
printf '%s\n' "// eslint-disable-next-line import/no-restricted-paths" "import { a } from '@/infra/__arch__'; export const x = a;" > "$FT/disable.ts"
if bash scripts/check-eslint-disable.sh "$FT/disable.ts" >/dev/null 2>&1; then
  echo "FAIL: check-eslint-disable.sh 가 'eslint-disable-next-line import/no-restricted-paths' 를 통과시켰습니다."
  exit 1
fi
echo "PASS: $FT/disable.ts → check-eslint-disable.sh 가 거부"
echo "OK: 레이어 경계 린트 검증 통과"
