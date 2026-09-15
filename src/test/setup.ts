// Vitest 전역 셋업. jsdom + fake-indexeddb + jest-dom 매처.
// 레포지토리 주입(setRepositories(memory))은 memory 구현 티켓에서 여기에 추가한다.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
