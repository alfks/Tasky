# Tasky

감성 투두 · 일정 관리 데스크탑 웹앱. 날짜 스트립에서 하루를 고르고, 색깔 있는 카테고리 아래 할 일을 적고, 체크할수록 달성률이 차오릅니다. 데이터는 브라우저에 로컬로 저장되며(오프라인 우선), PWA로 설치할 수 있습니다.

## 기술 스택

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Zustand · Dexie(IndexedDB) · Vitest · Playwright · pnpm

## 시작하기

```bash
bash scripts/setup.sh   # git 설정 + 훅 + 의존성
pnpm dev                # http://localhost:3000
pnpm check              # lint + typecheck + test
```

## 문서

- 프로젝트 규칙: [CLAUDE.md](./CLAUDE.md) · 협업 프로토콜: [AGENTS.md](./AGENTS.md)
- 아키텍처: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) · 디렉토리 맵: [docs/DIRECTORY_MAP.md](./docs/DIRECTORY_MAP.md)
- 결정 기록: [docs/DECISIONS.md](./docs/DECISIONS.md)

## 로드맵

- Phase 1 (MVP): 날짜 스트립, 카테고리별 투두 CRUD, 체크·달성률, 테마/색상
- Phase 2: 클라우드 동기화, 친구·피드·반응
