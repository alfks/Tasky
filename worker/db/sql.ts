// SQL 리터럴 태그 — 실제 값 보간은 하지 않는다(바인딩은 항상 `.bind()`). 이 태그로 감싼
// 문자열만 `scripts/check-worker-sql.sh` 가 "SQL 문"으로 인식해 `sub = ?` 바인딩을 검사한다
// (worker/db/** 전용, SYNC_DESIGN.md §②-5). 순수 표기 장치 — 런타임에는 문자열을 그대로 돌려준다.
export function sql(strings: TemplateStringsArray): string {
  return strings.join('');
}
