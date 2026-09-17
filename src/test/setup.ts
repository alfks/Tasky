// Vitest 전역 셋업. jsdom + fake-indexeddb + jest-dom 매처 + memory 레포지토리 주입 + 토스트 허브 비우기.
//
// 레포지토리를 여기서 주입하는 이유: 스토어·컴포넌트 테스트가 `getRepositories()` 를 부르는데,
// 컨테이너에는 기본값이 없어(조립 누락을 조기에 드러내려고) 주입이 없으면 전부 throw 한다.
// 주입은 **파일마다** 일어난다(vitest 는 테스트 파일별로 모듈을 새로 읽는다) — 파일 사이로 상태가 새지 않는다.
// 한 파일 안에서 격리가 필요하면 그 테스트가 `setRepositories(createMemoryRepositories())` 를 다시 부른다.
// 계약 테스트는 이 전역 묶음을 쓰지 않고 `ContractTarget.create()` 로 매번 새 묶음을 만든다.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { overlayLayerCount } from '@/components/ui/overlay-stack';
import { clearToasts } from '@/components/ui/Toast';

setRepositories(createMemoryRepositories());

/**
 * 토스트 허브(`components/ui/Toast.tsx` 의 `hubToasts`)를 **매 테스트 앞에서** 비운다 (T-49).
 *
 * 허브는 zustand 가 아니라 모듈 전역 배열이라 컴포넌트를 언마운트해도 남는다. `MAX_VISIBLE_TOASTS`
 * 가 1 이라 한 장뿐이지만, 그 한 장이 **다음 테스트의 첫 페인트부터 화면에 있다** — 뷰포트를
 * 렌더하는 테스트는 아무것도 하지 않은 상태에서 이미 토스트를 하나 보고 시작한다.
 *
 * 그래서 `getByText('…했어요')` 류의 단언이 조용히 무의미해진다. 실측(T-49, 이 커밋 직전):
 * `TodoList.keyboard.test.tsx` 의 `확인하면 지우고 토스트를 띄운다` 는 기본 순서에서는 도착 시점에
 * `삭제했어요` 가 0개지만, `--sequence.shuffle.tests --sequence.seed=1`(앞선 describe 가 먼저 도는
 * 순서)에서는 **1개**다. 그 순서에서 이 테스트의 `getByText('삭제했어요')` 는 자기가 만든 토스트가
 * 아니라 앞 테스트가 남긴 토스트를 읽는다 — 제품에서 삭제 토스트를 통째로 걷어내도 초록일 수 있다
 * (걷어낸 상태로 단독 실행하면 `Unable to find an element with the text: 삭제했어요` 로 죽는다).
 *
 * 파일마다 `clearToasts()` 를 적는 대신 여기 한 줄로 두는 이유: 잊는 것이 기본값이면 안 되는
 * 종류의 정리이고(위 실측 기준 8개 파일 중 4개가 잊고 있었다), 비용이 없다(전체 3회 중앙값
 * 기준 차이가 머신 노이즈 아래다).
 *
 * zustand 스토어 11개까지 여기서 되돌리는 안은 **채택하지 않았다** — 근거는 핸드오프 문서
 * (`.worktrees/handoffs/T-49.md`)의 "재발 방지" 절.
 */
beforeEach(() => {
  clearToasts();
});

/**
 * 오버레이 스택(`components/ui/overlay-stack.ts`)이 비어 있는 채로 테스트가 끝나는지 본다 (T-49).
 *
 * 비우지 않고 **고발만** 하는 이유: 이 스택은 `pushOverlayLayer` 의 정리 함수로만 내려가고, 그
 * 정리 함수는 오버레이 컴포넌트의 언마운트가 부른다. 여기서 몰래 비우면 "정리가 안 붙은 레이어" 를
 * 감출 뿐이다. 그리고 그 사고는 실제로 났다 — T-44 에서 DOM 없는 레이어 하나가 스택에 눌러앉아
 * `overlayLayerCount()` 가 영원히 1 이상이 됐고, 그 값을 보는 전역 단축키와 PWA 업데이트 토스트가
 * **조용히 죽은 채로 전 스위트가 초록**이었다.
 *
 * 실측(T-49): 2010건 전부 0 으로 끝난다. 즉 지금은 공짜로 켤 수 있는 그물이다. RTL 의 자동
 * `cleanup` 은 테스트 파일이 나중에 등록하므로 vitest 의 기본 `stack` 순서에서 이 훅보다 **먼저**
 * 돈다 — 언마운트가 끝난 뒤의 값을 본다.
 */
afterEach(() => {
  expect(overlayLayerCount(), '오버레이 레이어가 남은 채 테스트가 끝났다').toBe(0);
});
