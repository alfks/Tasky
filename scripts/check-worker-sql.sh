#!/usr/bin/env bash
# 읽기 조건: worker/db/** 의 SQL 을 고치거나, 이 검사가 실패했을 때.
# SYNC_DESIGN.md §②-5 항목 2 그대로: worker/db/** 의 모든 SQL 문(sql`…` 태그로 감싼 문자열,
# worker/db/sql.ts 참고)에 `WHERE` 가 있으면 `sub = ?` 바인딩이 있어야 한다 — 사용자 격리를
# 코드 리뷰가 아니라 이 스크립트가 강제한다. `sessions` 테이블 조회는 구조적으로 sub 없이
# 시작하므로(sid → sub 를 알아내는 바로 그 조회) worker/db/** 밖(worker/auth/session.ts)에
# 있고, 이 스크립트의 대상이 아니다(worker/AGENTS.md 규칙 3).
#
# 사용법: bash scripts/check-worker-sql.sh   (worker/db 없으면 SKIP)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ ! -d worker/db ]; then
  echo "SKIP: worker/db 가 없습니다."
  exit 0
fi

bad=0
files="$(find worker/db -maxdepth 1 -name '*.ts' ! -name '*.test.ts' ! -name 'sql.ts')"
if [ -z "$files" ]; then
  echo "SKIP: worker/db/*.ts 가 없습니다(sql.ts 제외)."
  exit 0
fi

for f in $files; do
  # sql`...` 리터럴 블록만 추출한다(node — 백틱 안 줄바꿈까지 다루려면 정규식보다 상태기계가 안전).
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

if [ "$bad" -eq 1 ]; then
  echo "FAIL: worker/db/** 의 SQL 문 중 sub = ? 바인딩 없이 WHERE 를 쓰는 문장이 있습니다(SYNC_DESIGN.md §②-5)."
  exit 1
fi
echo "PASS: worker/db/** 의 모든 sql\`\` 문에 WHERE 가 있으면 sub = ? 가 바인딩돼 있습니다."
