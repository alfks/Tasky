#!/usr/bin/env bash
# 읽기 조건: 이 검사가 실패했을 때, 또는 레이어 경계(eslint.config.mjs)를 바꿀 때 — 경계 하나 = 아래 케이스 하나.
# 규칙: 레이어 경계 린트가 "실제로 위반을 잡는지"(부정 케이스)와 "허용해야 할 것을 허용하는지"(긍정 케이스)를
#       임시 파일로 확인한다(린트 규칙의 테스트). 그 전에 src/** 전수 분류(모든 트래킹 코드 파일이 정확히 한 레이어,
#       .md 는 AGENTS.md 만)와 확장자 목록(SRC_EXT)을 검사한다 — 목록의 단일 소스는 scripts/arch-layers.mjs.
#       임시 파일은 src/<layer>/__arch__/ 에 만들었다가 trap 으로 반드시 지운다. 잔여물은 .gitignore(커밋 불가)와
#       eslint.config.mjs 의 ignores(pnpm lint 무해)가 막고, 여기서는 --no-ignore 로 그 ignores 를 뚫고 검사한다.
#       또한 **2차 패스**(eslint.arch.config.mjs + --no-inline-config)를 실제 src/ 에 한 번 돌린다 — 아키텍처 규칙은
#       인라인 지시자로 끌 수 없다는 보장이 여기서 강제된다(ADR-0008). 그 패스는 arch_pass() 한 곳에만 적혀 있고
#       (g) 픽스처가 같은 함수를 호출하므로 `--no-inline-config` 를 지우면 픽스처가 실패한다. 대상 범위는
#       커버리지 검사가 본다. 예외: `-c eslint.arch.config.mjs` 만 지우면 1차 설정으로 떨어지는데,
#       아키텍처 규칙 집합이 같아 실제 위반은 그대로 잡히고 정당한 style disable 이 오분류돼 시끄럽게
#       실패한다(클린 트리에서만 통과). 조용한 구멍은 아니다 — 실측.
#       비정상 종료로 남은 잔여물은 **다음 실행이 시작할 때 스스로 지운다**(WARN 한 줄을 남긴다) — 손으로 지울 필요 없다.
#       손으로 지우려면: find src -type d -name __arch__ -prune -exec rm -rf {} +
# 사용법: bash scripts/check-arch.sh   (package.json 이 없으면 SKIP)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ESLINT=./node_modules/.bin/eslint
if [ ! -f package.json ] || [ ! -x "$ESLINT" ]; then
  echo "SKIP: package.json 또는 node_modules/.bin/eslint 없음(스캐폴딩 전) — 레이어 경계 검사는 스캐폴딩 후부터 동작합니다."
  exit 0
fi

# --- 0'. 잔여물 선청소 + 신호까지 받는 trap ---
# 픽스처는 src/<layer>/__arch__/ 에 만들었다가 trap 으로 지운다. 그러나 SIGKILL·OOM 처럼 trap 이 돌지 못하는
# 죽음이 있다. 그때 남은 파일은 .gitignore 에 걸려 `git status` 에 보이지 않으면서도 **pnpm typecheck 를 실패시킨다**
# (tsc 는 eslint ignores 도 .gitignore 도 보지 않는다). 그래서 check.sh 가 "통과 9 / 실패 1 (pnpm typecheck)" 로
# 빨개지는데 화면 어디에도 잔여물이라는 말이 없다 — T-62 실측(재현: 이 스크립트를 픽스처 생성 직후 kill -9 → 122개 잔존).
# 쓸어 담는 범위는 DIRS 가 아니라 src/** 전체다: DIRS 는 feature 를 앞의 2개만 덮으므로, 그 밖의 feature 에 떨어진
# 잔여물은 매 실행 살아남아 typecheck 를 계속 빨갛게 만든다(재현됨).
sweep_arch_dirs() { [ -d src ] && find src -type d -name __arch__ -prune -exec rm -rf {} + 2>/dev/null; return 0; }
stale_arch_dirs() { [ -d src ] || { echo 0; return 0; }; find src -type d -name __arch__ -prune 2>/dev/null | wc -l | tr -d " "; }

covjson=""; json=""; HELD_LOCK=""
cleanup() {
  sweep_arch_dirs
  [ -z "$covjson" ] || rm -f "$covjson" "$covjson.err"
  [ -z "$json" ] || rm -f "$json" "$json.err"
  [ -z "$HELD_LOCK" ] || rm -rf "$HELD_LOCK"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# --- 0''. 워크트리 단위 락 ---
# 같은 워크트리에서 이 스크립트가 둘 이상 겹치면 서로의 __arch__ 픽스처를 지운다. 그러면 뒤늦게 읽으러 간 쪽의
# eslint 가 `No files matching the pattern "src/features/<f>/__arch__/infra.ts" were found` 로 rc=2 에 죽고,
# 화면에는 "레이어 경계 린트 검증" 실패로 보인다 — 아키텍처와 아무 상관없는 거짓 빨간불이다.
# T-62 실측: 한 실행이 픽스처를 다 만든 직후 두 번째 실행을 띄우면 **5회 중 5회** 한쪽이 이렇게 죽었다.
# 겹치는 일은 드물지 않다 — 첫 실행을 Ctrl-C 하고 다시 돌리면 죽은 쪽의 EXIT trap 이 새 실행의 픽스처를 지우고,
# 부하가 걸리면 한 번의 실행이 17초에서 31초로 늘어 겹칠 창이 넓어진다(실측).
# 락은 레포 안이 아니라 TMPDIR 에 워크트리 경로로 키를 만들어 둔다(레포에 파일을 남기지 않는다).
# flock 은 쓰지 않는다 — scripts/AGENTS.md 규칙 4(없을 때의 대체 경로) 대로 mkdir 스핀락 하나로 통일한다.
LOCK="${TMPDIR:-/tmp}/tasky-check-arch-$(printf '%s' "$PWD" | cksum | awk '{print $1}').lock"
LOCK_TIMEOUT=300   # 한 번의 실행은 무부하 17초·부하 31초(실측). 10배 가까운 여유 — 여기 걸리면 진짜로 멈춘 것이다.
waited=0
while ! mkdir "$LOCK" 2>/dev/null; do
  # 죽은 락 회수: 락을 쥔 PID 가 이미 없으면(SIGKILL 로 죽어 trap 이 못 돌았다) 지우고 다시 시도한다.
  lockpid="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -z "$lockpid" ]; then
    # 상대가 막 mkdir 하고 아직 pid 를 못 쓴 찰나일 수 있다 — 한 박자 쉬고 다시 본다(여기서 바로 지우면
    # 살아 있는 락을 뺏는다). 쉬고도 비어 있으면 죽은 락이다. 이 sleep 이 스핀도 함께 막는다.
    sleep 1
    waited=$((waited + 1))
    lockpid="$(cat "$LOCK/pid" 2>/dev/null || true)"
  fi
  if [ -z "$lockpid" ] || ! kill -0 "$lockpid" 2>/dev/null; then
    rm -rf "$LOCK"
    continue
  fi
  [ "$waited" -eq 0 ] && echo "WARN: 같은 워크트리에서 check-arch.sh(pid $lockpid)가 이미 돌고 있습니다 — 끝날 때까지 기다립니다."
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge "$LOCK_TIMEOUT" ]; then
    echo "FAIL: 다른 check-arch.sh 가 ${LOCK_TIMEOUT}초 넘게 락을 쥐고 있습니다(pid $lockpid)."
    echo "      **아키텍처 위반이 아닙니다** — 그 프로세스를 끝내거나 락을 지우세요: rm -rf $LOCK"
    exit 1
  fi
done
printf '%s\n' "$$" > "$LOCK/pid"
HELD_LOCK="$LOCK"

stale="$(stale_arch_dirs)"
if [ "$stale" -gt 0 ]; then
  echo "WARN: 이전 실행의 __arch__ 잔여물 ${stale}개 디렉토리를 지웁니다(직전 실행이 trap 없이 죽었다는 뜻 — OOM·SIGKILL)."
  echo "      아래 판정과는 무관합니다. 이 줄이 자주 보이면 동시에 도는 빌드/테스트를 줄이세요."
  sweep_arch_dirs
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

# --- 1. 전수 분류: src/ 의 모든 트래킹 코드 파일은 LAYERS 중 하나 아래에 있거나 ROOT_FILES 다. 확장자는 SRC_EXT 안 ---
# .md 는 레이어가 아니라 디렉토리 규칙 문서다(ESLint 도 .md 를 린트하지 않는다) — 레이어로 분류하면
# CLAUDE.md §1-4(트래킹 파일이 있는 모든 디렉토리에 AGENTS.md)와 서로 배제한다: src/middleware.ts 가 생기는
# 순간 src/AGENTS.md 가 필수가 되는데 그 파일이 src/ 직속 허용 목록에 없어 여기서 거부되기 때문이다.
# 대신 src/ 안의 .md 는 이름을 AGENTS.md 로 고정한다(그 밖의 문서는 docs/ 로 — 코드 옆 문서 난립 금지).
bad=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel="${f#src/}"
  top="${rel%%/*}"
  ext="${f##*.}"
  if [ "$ext" = "md" ]; then
    case "${f##*/}" in AGENTS.md) ;; *) echo "FAIL: $f — src/ 안의 .md 는 AGENTS.md(디렉토리 규칙 문서)만 허용. 그 밖의 문서는 docs/ 로 옮기세요."; bad=1 ;; esac
  elif [ "$top" = "$rel" ]; then # src/ 직속 파일
    case " $ROOT_FILES " in *" $rel "*) ;; *) echo "FAIL: $f — src/ 직속 파일은 ${ROOT_FILES// /, } 만 허용(AGENTS.md 는 예외). 레이어 디렉토리로 옮기세요."; bad=1 ;; esac
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
# 삼중슬래시 지시자(`/// <reference path|types|lib`)는 주석이라 ESLint 셀렉터가 닿지 않는다(문법 규칙으로 못 막는다).
# 주 방어선은 @typescript-eslint/triple-slash-reference(ARCH_RULES_COMMON 이 셋 다 'never' → 2차 패스가 강제)이고,
# 이 grep 은 그 규칙이 꺼지거나 옵션이 되돌아간 경우를 위한 보조다. '=' 양옆 공백 변형까지 본다(라운드 3 우회 m14·m17).
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qE '^[[:space:]]*///[[:space:]]*<reference[[:space:]]+(path|types|lib)[[:space:]]*=' "$f" 2>/dev/null; then
    echo "FAIL: $f — 삼중슬래시 지시자(/// <reference path|types|lib) 금지: 레이어 경계·패키지 허용 목록을 우회하는 의존 간선입니다. import 를 쓰세요."
    bad=1
  fi
done <<EOF
$(git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx')
EOF
[ "$bad" -eq 0 ] || { echo "FAIL: src/** 전수 분류 실패 — 위 파일을 옮기거나 ADR 로 레이어를 추가하세요."; exit 1; }
echo "PASS: src/** 전수 분류(레이어 $(git ls-files src | wc -l | tr -d ' ')개 파일, 확장자 $SRC_EXT)"

# --- 1.5. 2차 패스: 아키텍처 규칙만 남긴 설정으로 인라인 지시자를 전부 무시하고 실제 src/ 를 다시 검사한다(ADR-0008).
#      1차 패스(pnpm lint)는 스타일 규칙의 정당한 disable 을 허용하므로 그것만으로는 아키텍처 판정이 남지 않는다.
#      2차 패스의 명령은 이 함수 한 곳에만 적는다 — 아래 (g) 픽스처가 같은 함수를 호출하므로, --no-inline-config 나
#      --config eslint.arch.config.mjs 를 지우면 픽스처가 곧바로 FAIL 한다(지우고 돌려보면 재현된다).
arch_pass() { "$ESLINT" --no-inline-config --config eslint.arch.config.mjs "$@"; }

# eslint 는 "위반 있음" 을 rc=1 로 알린다 — 그건 정상 결과다. rc>=2 는 판정이 아예 없다는 뜻이고 원인은 둘로 갈린다:
#   rc=2        ESLint 자신의 치명적 오류(설정·CLI 오류)
#   rc>2        프로세스가 죽었다(134=SIGABRT: V8 heap OOM, 137=SIGKILL: 커널 OOM killer …) — 부하에서 나는 실패다.
# 예전에는 두 경우 모두 `|| true` 로 삼켜 JSON 이 빈 채로 넘어갔고, 화면에는 "설정 로드 실패?" 만 남았다
# (T-62 실측: `ulimit -v 1200000` 로 돌리면 2차 패스 eslint 가 SIGABRT 로 죽고 정확히 그 문구가 나온다 —
#  자원 문제를 설정 문제로 오진한다). 이제 rc 를 보존해 메시지를 가르고, **죽은 경우에만** 한 번 재시도한다.
# 재시도가 위반을 숨길 수는 없다: 위반은 rc<=1 이라 애초에 재시도 대상이 아니다.
eslint_json() { # $1 출력 파일, $2 패스(1|2), 나머지 eslint 인자
  local out="$1" pass="$2"; shift 2
  local rc attempt
  for attempt in 1 2; do
    rc=0
    if [ "$pass" = 2 ]; then
      arch_pass "$@" > "$out" 2> "$out.err" || rc=$?
    else
      "$ESLINT" "$@" > "$out" 2> "$out.err" || rc=$?
    fi
    if [ "$rc" -le 1 ] && [ -s "$out" ]; then return 0; fi
    if [ "$attempt" = 1 ] && [ "$rc" -gt 2 ]; then
      echo "WARN: eslint(${pass}차 패스)가 rc=$rc 로 비정상 종료 — 자원 부족으로 보고 1회만 재시도합니다."
      continue
    fi
    break
  done
  if [ "$rc" -gt 2 ]; then
    echo "FAIL: eslint(${pass}차 패스)가 rc=$rc 로 비정상 종료했습니다 — **아키텍처 위반이 아니라 실행 실패**입니다(OOM·시그널)."
    echo "      동시에 도는 빌드/테스트를 줄이고 다시 실행하세요. 마지막 stderr:"
  else
    echo "FAIL: eslint(${pass}차 패스)가 rc=$rc 로 끝났습니다 — **위반 판정이 아니라** 설정/CLI 오류입니다."
    if [ "$pass" = 2 ]; then
      echo "      직접 실행해 원인을 보세요: ./node_modules/.bin/eslint --no-inline-config --config eslint.arch.config.mjs src"
    else
      echo "      직접 실행해 원인을 보세요: ./node_modules/.bin/eslint --no-ignore src/domain/__arch__"
    fi
  fi
  # stderr 는 **앞부분**을 보여 준다 — ESLint 는 실제 원인 문장을 먼저 찍고 스택을 뒤에 붙인다(tail 이면 스택만 남는다).
  sed -n '1,15p' "$out.err" 2>/dev/null | sed 's/^/      /'
  return 1
}

if [ -d src ]; then
  # --format json 으로 받는 이유: 위반 보고와 함께 "이 패스가 실제로 어떤 파일을 봤는지"를 같은 한 번의 실행에서
  # 확인하기 위해서다. 트래킹된 src 코드 파일이 하나라도 결과에 없으면 대상 경로가 좁혀졌거나 전역 ignores 가
  # 그 파일을 먹은 것이므로(둘 다 2차 패스를 조용히 무력화한다) 실패로 본다.
  covjson="$(mktemp)"
  eslint_json "$covjson" 2 --format json src || exit 1
  covfiles="$(git ls-files src | grep -E '\.tsx?$' || true)"
  if ! node -e '
const fs = require("fs"), path = require("path");
const [jsonPath, ...expected] = process.argv.slice(1);
let results;
try { results = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch {
  console.log("FAIL: 2차 패스가 결과를 내지 못했습니다(설정 로드 실패?). 직접 실행: ./node_modules/.bin/eslint --no-inline-config --config eslint.arch.config.mjs src");
  process.exit(1);
}
let fail = 0;
const linted = new Set();
for (const r of results) {
  const rel = path.relative(process.cwd(), r.filePath);
  linted.add(rel);
  for (const m of r.messages.filter((m) => m.severity === 2)) {
    console.log(`FAIL: ${rel}:${m.line}:${m.column}  ${m.ruleId || "(fatal)"}  ${m.message}`);
    fail = 1;
  }
}
if (fail) {
  console.log("FAIL: 아키텍처 규칙 위반(2차 패스). 이 패스는 eslint-disable·/* eslint … */ 등 인라인 지시자를 전부 무시합니다");
  console.log("      — 지시자로는 끌 수 없습니다. 경계를 지키도록 코드를 옮기거나 ADR 로 경계를 바꾸세요(docs/ARCHITECTURE.md §1).");
}
const missing = expected.filter((f) => !linted.has(f));
if (missing.length) {
  console.log(`FAIL: 2차 패스가 트래킹된 src 코드 파일 ${missing.length}개를 검사하지 않았습니다: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}`);
  console.log("      — 2차 패스의 대상 경로나 eslint.config.mjs 의 전역 ignores 를 확인하세요(ADR-0008: 2차 패스는 src/ 전부를 본다).");
  fail = 1;
}
process.exit(fail);
' "$covjson" $covfiles; then
    exit 1
  fi
  rm -f "$covjson"; covjson=""
  echo "PASS: 2차 패스(--no-inline-config) — 아키텍처 규칙 위반 없음, src 코드 파일 $(printf '%s\n' "$covfiles" | grep -c . || true)개 전부 검사됨"
fi

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
# 정리는 위 cleanup(trap) 이 src/** 전체를 쓸어서 한다 — 이 목록에 의존하지 않는다(목록 밖 잔여물이 실제로 남았다).
for d in $DIRS; do
  rm -rf "$d/__arch__"; mkdir -p "$d/__arch__"
  printf '// 아키텍처 검사 임시 파일 — scripts/check-arch.sh 가 만들고 지운다. 남아 있으면 다음 실행이 지운다.\nexport const a = 1;\n' > "$d/__arch__/a.ts"
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
add "$FT/new-url.ts"           no-restricted-syntax "export const w = new URL('@/infra/__arch__/a', import.meta.url);"   # 워커·자산 모듈 참조 구문
add "$FT/new-url-ok.ts"        -                    "export const w = new URL('https://example.com/a?b=1');"              # 긍정: 진짜 URL 은 모듈 참조가 아니다
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
add "$FT/never-cast.ts" no-restricted-syntax      "export const f = (t: object) => t as never;"
add "$FT/obj-assign.ts" no-restricted-syntax      "export const f = (a: object, b: object) => Object.assign(a, b);"
add "$FT/obj-define.ts" no-restricted-syntax      "export const f = (a: object) => Object.defineProperty(a, 'x', { writable: false });"
add "$FT/obj-proto.ts"  no-restricted-syntax      "export const f = (a: object, b: object) => Object.setPrototypeOf(a, b);"
add "$FT/obj-ok.ts"     -                         "export const f = (a: { k: string }) => Object.keys(a).length + Object.entries(a).length;"
add "$FT/ok-read.ts"   -                          "export const f = (t: { rev: number; updatedAt: string }) => { const { rev } = t; return rev + t.updatedAt.length; };"
add src/domain/__arch__/react.ts       no-restricted-imports      "import { useState } from 'react'; export const x = useState;"
add src/domain/__arch__/clock.ts       no-restricted-syntax       "export const n = Date.now();"
add src/domain/__arch__/win.ts         no-restricted-globals      "export const w = window;"
add src/domain/__arch__/lib-clock.ts   no-restricted-imports      "$I '@/lib/date'; export const x = a;"
# meta.ts 예외 블록 — 결정성 규칙은 유지되고(부정), Meta 필드 쓰기만 풀린다(긍정). 두 경로는 eslint.config.mjs 의 meta 블록에 등록돼 있다
add src/domain/__arch__/meta-clock.ts  no-restricted-syntax       "export const n = Date.now();"
add src/domain/__arch__/meta-write.ts  -                          "export const t = { rev: 2 };"
add src/domain/__arch__/meta-assign.ts -                          "export const f = (a: object, b: object) => Object.assign(a, b);"
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
eslint_json "$json" 1 --no-ignore --format json $FILES || exit 1   # 위반이 있으면 eslint 는 rc=1 — 정상. rc>=2 만 실패다

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

# (g) 인라인 지시자 우회 — 1차 패스에서는 지시자가 실제로 먹히지만(음성 대조), 2차 패스가 그대로 잡는다.
#     여기 있는 문법은 라운드 3 검증이 셸 검사기를 뚫었던 계열이다: 빈 규칙 목록(`,` 한 글자 = ESLint 에겐 "전부 끄기"),
#     규칙명 없는 disable, 제한 규칙 명시 disable, NBSP 를 구분자로 쓴 인라인 설정 주석, 삼중슬래시 + 그 규칙의 disable.
#     문법을 다시 구현하지 않고 ESLint 두 번으로 판정하므로 새 변형이 나와도 같은 결과다.
DIS="$FT/dis-empty.ts"
printf '/* eslint-disable , -- 사유 */\n%s\n' "$I '@/infra/__arch__/a'; export const x = a;" > "$DIS"
DIS2="$FT/dis-bare.ts"
printf '/* eslint-disable */\n%s\n' "$I '@/infra/__arch__/a'; export const x = a;" > "$DIS2"
DIS3="$FT/dis-named.ts"
printf '// eslint-disable-next-line import/no-restricted-paths, no-restricted-imports -- 사유\n%s\n' "$I '@/infra/__arch__/a'; export const x = a;" > "$DIS3"
DIS4="$FT/dis-conf-nbsp.ts"
printf '/*eslint\xc2\xa0import/no-restricted-paths: off, no-restricted-imports: off*/\n%s\n' "$I '@/infra/__arch__/a'; export const x = a;" > "$DIS4"
DIS5="$FT/dis-triple-slash.ts"
printf '// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- 사유\n/// <reference types = "node" />\nexport const x = 1;\n' > "$DIS5"
DISABLES="$DIS $DIS2 $DIS3 $DIS4 $DIS5"

count_errors() { # $1 = 패스(1|2), 나머지 = 파일 → "파일 에러수" 줄.
  # 2차는 반드시 arch_pass(1.5 에서 실제 src/ 를 검사하는 그 함수)로 돌린다 — 픽스처가 자기 명령을 따로 조립하면
  # 그 함수의 플래그를 지워도 픽스처는 통과해 버린다(검증이 실제 실행 줄과 끊긴다).
  local pass="$1"; shift
  # 이 함수는 명령 치환($( )) 안에서 불린다 — 거기서의 exit 는 서브셸만 죽인다. 그래서 진단은 stderr 로 내보내고
  # (치환에 먹히지 않게) rc 로 호출부에 올린다.
  eslint_json "$json" "$pass" --no-ignore --format json "$@" >&2 || return 1
  node -e '
const fs = require("fs"), path = require("path");
for (const r of JSON.parse(fs.readFileSync(process.argv[1], "utf8"))) {
  console.log(path.relative(process.cwd(), r.filePath) + " " + r.messages.filter((m) => m.severity === 2).length);
}' "$json"
}
first="$(count_errors 1 $DISABLES)" || exit 1
second="$(count_errors 2 $DISABLES)" || exit 1
gfail=0
for f in $DISABLES; do
  n1="$(printf '%s\n' "$first"  | awk -v f="$f" '$1 == f { print $2 }')"
  n2="$(printf '%s\n' "$second" | awk -v f="$f" '$1 == f { print $2 }')"
  [ -n "$n1" ] && [ -n "$n2" ] || { echo "FAIL: $f — eslint 결과에 이 파일이 없습니다(설정 오류?)."; gfail=1; continue; }
  if [ "$n1" -ne 0 ]; then
    echo "FAIL: $f — 1차 패스가 이미 잡았습니다(음성 대조 실패: 이 픽스처는 지시자가 먹히는 문법이어야 2차 패스를 검증한다)."
    gfail=1
  elif [ "$n2" -eq 0 ]; then
    echo "FAIL: $f — 2차 패스(--no-inline-config)가 아키텍처 위반을 잡지 못했습니다. eslint.arch.config.mjs 와 ARCH_RULES 를 확인하세요."
    gfail=1
  else
    echo "PASS: $f → 1차 0건(지시자가 먹힘) / 2차 ${n2}건(지시자 무시)"
  fi
done
[ "$gfail" -eq 0 ] || { echo "FAIL: 인라인 지시자 우회 검증 실패 (ADR-0008)."; exit 1; }
echo "OK: 레이어 경계 린트 검증 통과"
