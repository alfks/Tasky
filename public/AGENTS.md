<!-- 읽기 조건: PWA 아이콘·manifest 관련 정적 자산을 추가·교체할 때. -->

# public/ — AGENTS

## 목적

PWA 아이콘 등 정적 자산만. 실제 web manifest는 `src/app/manifest.ts`(Next.js `MetadataRoute.Manifest`)가 생성한다 — 여기는 그 매니페스트가 참조하는 아이콘 파일만 둔다.

## 규칙

1. 코드 파일(`.ts`/`.tsx`/`.js`) 금지 — 정적 자산만. 여기 있는 파일은 그대로 `dist/client/` 로 배포된다.
2. 아이콘 크기·이름은 `src/app/manifest.ts`의 `icons` 배열과 1:1로 맞춘다(어긋나면 빌드는 통과해도 PWA 설치 아이콘이 깨진다).
3. `_headers`는 Cloudflare Workers Static Assets의 캐시 헤더다. **이 파일이 있으면 vinext 생성본을 덮어쓴다**(병합 아님, 실측) — `/_next/static/*` immutable 규칙을 지우지 않는다(ADR-0010 규칙 5).

## 검증

```bash
pnpm build 2>&1 | tail -5
```
