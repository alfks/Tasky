#!/usr/bin/env bash
# 읽기 조건: worker/** 의 SQL 을 고치거나, 이 검사가 실패했을 때.
#
# 세 검사를 한다:
#
# 1) worker/db/** 전용(SYNC_DESIGN.md §②-5 항목 2 그대로): `sql`…`` 태그로 감싼 문장(worker/db/sql.ts
#    참고)에 `WHERE` 가 있으면 `sub = ?` 바인딩이 있어야 한다 — 사용자 격리를 코드 리뷰가 아니라 이
#    스크립트가 강제한다. `sessions` 테이블 조회는 구조적으로 sub 없이 시작하므로(sid → sub 를
#    알아내는 바로 그 조회) worker/db/** 밖(worker/auth/session.ts)에 있고, 이 검사의 대상이 아니다
#    (worker/AGENTS.md 규칙 3).
#
# 2) worker/** 전체(테스트·worker/test/** 제외): `.prepare(...)` 인자가 `sql`…`` 태그·따옴표(' 또는 ")
#    문자열 리터럴·식별자(파일 스코프 const, 예: entities.ts 의 CREATE_SQL/UPDATE_SQL/stmt) 중
#    하나여야 한다. **태그 없는 백틱 템플릿 리터럴**(`` `...${x}...` ``)은 실패 — `${}` 보간이
#    가능한 유일한 통로이자 SQLi 통로다(`sql()` 자체는 `TemplateStringsArray` 하나만 받아 보간 값을
#    받지 않으므로 보간을 쓰려면 태그를 벗어나야 한다, worker/db/sql.ts). 이전 판은 검사 대상이
#    worker/db/** 의 `sql`…`` 블록뿐이라 그 밖(worker/auth/**·worker/account/**)에 태그 없이 짜 넣은
#    SQL 은 검사 자체가 못 봤다(T-93 리뷰 라운드 2 실측 — 템플릿 보간으로 진짜 SQLi 를 주입해도
#    통과했다). 지금 코드는 전부 `.bind()` 를 쓰므로 실제 취약점은 0건이고, 이 검사는 미래 회귀만
#    막는다.
# 3) worker/social/** production은 모든 prepare 인자를 보간 없는 sql 태그로 제한한다.
#    social actor 경로에 동적 문자열 SQL을 새로 넣으면 이 좁은 검사가 실패한다.
#
# 명시 허용목록: WORKER_SQL_ALLOWLIST 에 "파일경로:그 줄에 포함된 부분 문자열"을 한 줄씩 추가하면
# 그 줄만 검사 2)에서 건너뛴다(지금은 비어 있다 — 새 예외가 필요할 때만 채운다).
#
# 사용법: bash scripts/check-worker-sql.sh   (worker 없으면 SKIP)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

WORKER_SQL_ALLOWLIST=(
  # "worker/example.ts:일부 문자열"
)

if [ ! -d worker ]; then
  echo "SKIP: worker 가 없습니다."
  exit 0
fi

bad=0

# --- 검사 3: worker/social/** 는 정적 sql`` 리터럴만 허용 ---
if [ -d worker/social ]; then
  social_files="$(find worker/social -name '*.ts' ! -name '*.test.ts')"
  for f in $social_files; do
    node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
let bad = 0;
const re = /\.prepare\(\s*/g;
let match;
while ((match = re.exec(source))) {
  const rest = source.slice(match.index + match[0].length);
  const line = source.slice(0, match.index).split("\n").length;
  if (!rest.startsWith("sql`")) {
    console.log(`FAIL: ${process.argv[1]}:${line} — social prepare에는 sql 태그 리터럴만 허용`);
    bad = 1;
    continue;
  }
  const end = rest.indexOf("`", 4);
  if (end < 0 || rest.slice(4, end).includes("${")) {
    console.log(`FAIL: ${process.argv[1]}:${line} — social SQL 보간 금지`);
    bad = 1;
  }
}
process.exit(bad);
' "$f" || bad=1
  done
fi

# --- 검사 1: worker/db/** sql`` 블록의 sub = ? 바인딩 ---
if [ -d worker/db ]; then
  db_files="$(find worker/db -maxdepth 1 -name '*.ts' ! -name '*.test.ts' ! -name 'sql.ts')"
  if [ -n "$db_files" ]; then
    for f in $db_files; do
      node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const re = /\bsql`([^`]*)`/g;
let m, n = 0, bad = 0;
while ((m = re.exec(text))) {
  n++;
  const stmt = m[1];
  if (/\bWHERE\b/i.test(stmt) && !/sub\s*=\s*\?\d*/.test(stmt)) {
    console.log(`FAIL: ${process.argv[1]} — WHERE 가 있는데 sub = ? 바인딩이 없는 sql 블록:\n  ${stmt.trim().replace(/\n/g, "\n  ")}`);
    bad = 1;
  }
}
console.log(`  (${process.argv[1]}: sql\`\` 블록 ${n}건)`);
process.exit(bad);
' "$f" || bad=1
    done
  fi
fi

# --- 검사 2: worker/** 전체의 .prepare() 인자 형태 ---
worker_files="$(find worker -name '*.ts' ! -name '*.test.ts' ! -path 'worker/test/*' ! -name 'sql.ts')"
if [ -n "$worker_files" ]; then
  allowlist_json="$(printf '%s\n' "${WORKER_SQL_ALLOWLIST[@]}" | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
process.stdout.write(JSON.stringify(lines));
')"
  for f in $worker_files; do
    node -e '
const fs = require("fs");
const path = process.argv[1];
const allowlist = JSON.parse(process.argv[2]);
const text = fs.readFileSync(path, "utf8");
const lineOf = (idx) => text.slice(0, idx).split("\n").length;
const re = /\.prepare\(\s*/g;
let m, n = 0, bad = 0;
while ((m = re.exec(text))) {
  n++;
  const rest = text.slice(m.index + m[0].length);
  const line = lineOf(m.index);
  const allowed = allowlist.some((entry) => {
    const [entryPath, needle] = entry.split(/:(.*)/s);
    return entryPath === path && needle && text.split("\n")[line - 1]?.includes(needle);
  });
  if (allowed) continue;
  if (/^sql`/.test(rest)) continue; // OK — sql`` 태그(보간 불가, worker/db/sql.ts)
  if (/^["\x27]/.test(rest)) continue; // OK — 따옴표 문자열 리터럴
  if (/^`/.test(rest)) {
    console.log(`FAIL: ${path}:${line} — .prepare() 에 태그 없는 백틱 템플릿 리터럴이 직접 쓰였다(SQLi 통로 — sql\`\` 태그나 문자열 리터럴을 쓴다).`);
    bad = 1;
    continue;
  }
  if (/^[A-Za-z_$][\w$]*/.test(rest)) continue; // OK — 식별자(파일 스코프 const 를 신뢰)
  console.log(`FAIL: ${path}:${line} — .prepare() 인자를 판별할 수 없다(허용: sql\`\`·문자열 리터럴·식별자): ${rest.slice(0, 60).replace(/\n/g, " ")}`);
  bad = 1;
}
console.log(`  (${path}: .prepare() 호출 ${n}건)`);
process.exit(bad);
' "$f" "$allowlist_json" || bad=1
  done
fi

if [ "$bad" -eq 1 ]; then
  echo "FAIL: worker/** 의 SQL 문 중 격리·인젝션 규칙을 어기는 곳이 있습니다(위 FAIL 줄 참고, SYNC_DESIGN.md §②-5)."
  exit 1
fi
echo "PASS: worker/db/** 의 sql\`\` 문은 sub = ? 를 바인딩하고, worker/** 의 .prepare() 인자는 전부 태그/리터럴/식별자입니다."
