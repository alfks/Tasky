/**
 * 접근 가능한 이름(accessible name)이 비어 버리는 사고를 막는 보조 도구.
 *
 * 무엇을 막고 무엇을 못 막는지(실측 기준 — `a11y.test.ts` + `tsc --noEmit` 로 확인):
 *
 * | 경로                                        | 막히는가 | 무엇이 막는가 |
 * |---------------------------------------------|----------|----------------|
 * | prop 자체를 빠뜨림                          | 막힘     | 필수 prop(타입) |
 * | `label=""` · `label="   "` · `label="\n"`   | 막힘     | `NonBlank`(타입, TS2345/TS2322) |
 * | `aria-label` 로 덮어쓰기                     | 막힘     | props 에서 `Omit` + 스프레드 순서 |
 * | `aria-labelledby` 로 덮어쓰기                | 막힘     | **런타임 제거**(JSX 는 하이픈 속성을 타입으로 막지 못한다 — 실측) |
 * | 변수·계산값이 런타임에 공백(`name.trim()`)   | 개발에서만 막힘 | `assertAccessibleName`(개발 모드 throw) |
 * | `'a' \| ''` 처럼 공백 멤버가 섞인 유니온     | **안 막힘**(컴파일 통과 실측) | 런타임 가드로 넘어간다 |
 * | 프로덕션 번들에서 런타임 공백               | **안 막힘**(이름 없는 버튼이 그대로 렌더된다) | — |
 * | `labelledBy` 가 없는 id·빈 요소를 가리킴     | **안 막힘**(id 해석은 DOM 시점 문제다) | — |
 *
 * 즉 "빈 이름을 전수 차단"하지 않는다. 리터럴과 개발 중 실행 경로만 차단한다.
 */

/** 공백으로 치는 문자. `String.prototype.trim` 이 지우는 것 중 라벨에 실제로 섞이는 것만 본다. */
type Whitespace = ' ' | '\t' | '\n' | '\r';

/** 앞뒤 공백을 걷어낸 리터럴 타입. 리터럴이 아닌 `string` 은 그대로 `string` 이 된다. */
type Trim<S extends string> = S extends `${Whitespace}${infer Rest}`
  ? Trim<Rest>
  : S extends `${infer Rest}${Whitespace}`
    ? Trim<Rest>
    : S;

/**
 * 공백뿐인 **문자열 리터럴**을 `never` 로 바꿔 컴파일을 막는다.
 * 쓰는 쪽은 `label: L & NonBlank<L>` 형태로 제네릭 `L` 을 함께 둔다 — 조건부 타입 자리에서는
 * 추론이 일어나지 않으므로, 교차(`&`)로 `L` 을 추론 가능한 위치에 남겨야 실제로 걸린다.
 */
export type NonBlank<S extends string> = Trim<S> extends '' ? never : S;

/**
 * 번들러가 `process.env.NODE_ENV` 를 문자열로 치환하지 않은 런타임(순수 브라우저 ESM 등)에서는
 * `process` 참조가 ReferenceError 를 던진다. 그 경우 가드를 끄고 렌더는 계속한다.
 */
function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/**
 * 개발 모드에서 공백뿐인 접근 이름을 **즉시 실패**로 만든다(프로덕션에서는 아무것도 하지 않는다).
 * 경고가 아니라 throw 인 이유: `console` 경고는 테스트·CI 에서 통과하므로 이름 없는 버튼이
 * 그대로 배포된다. 테스트가 이 throw 를 검사하므로 가드를 지우면 테스트가 깨진다.
 */
export function assertAccessibleName(component: string, prop: string, value: string): void {
  if (value.trim() !== '') return;
  if (!isDevelopment()) return;
  throw new Error(
    `${component}: ${prop} 이(가) 공백뿐입니다. 접근 가능한 이름 없이 렌더할 수 없습니다.`,
  );
}
