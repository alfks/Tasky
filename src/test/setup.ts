// Vitest 전역 셋업. jsdom + fake-indexeddb + jest-dom 매처 + memory 레포지토리 주입.
//
// 레포지토리를 여기서 주입하는 이유: 스토어·컴포넌트 테스트가 `getRepositories()` 를 부르는데,
// 컨테이너에는 기본값이 없어(조립 누락을 조기에 드러내려고) 주입이 없으면 전부 throw 한다.
// 주입은 **파일마다** 일어난다(vitest 는 테스트 파일별로 모듈을 새로 읽는다) — 파일 사이로 상태가 새지 않는다.
// 한 파일 안에서 격리가 필요하면 그 테스트가 `setRepositories(createMemoryRepositories())` 를 다시 부른다.
// 계약 테스트는 이 전역 묶음을 쓰지 않고 `ContractTarget.create()` 로 매번 새 묶음을 만든다.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

setRepositories(createMemoryRepositories());
