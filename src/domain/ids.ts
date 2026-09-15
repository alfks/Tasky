// 엔티티 식별자 별칭. 시그니처(TECH_PLAN §6)가 `TodoId`·`CategoryId`·`FocusSessionId` 를 쓰므로
// 한 곳에서 선언해 서로 다른 파일이 각자 정의하는 것을 막는다.
//
// 브랜드 타입(nominal)이 아니라 `string` 별칭인 이유: `Meta.id` 가 `string` 이라
// `Todo['id']` 는 구조적으로 `string` 이다. 브랜드를 씌우면 `todo.id` 를 `TodoId` 로 받는 곳마다
// 캐스팅이 필요해지고, 그 캐스팅이 `Persistable` 브랜드 우회 습관을 부른다(ADR-0007).
// 여기서 별칭이 하는 일은 **시그니처의 의미 표시**뿐이다.

/** `Todo.id`. */
export type TodoId = string;

/** `Category.id`. */
export type CategoryId = string;

/** `FocusSession.id`. */
export type FocusSessionId = string;
