<!-- 읽기 조건: PWA 아이콘·manifest, 셀프 호스팅 폰트, 정적 자산 캐시 헤더를 추가·교체할 때. -->

# public/ — AGENTS

## 목적

빌드 파이프라인을 거치지 않고 그대로 서빙되는 정적 자산과 그 배포 헤더만 둔다 — PWA 아이콘, 셀프 호스팅 폰트(`fonts/`), `_headers`. web manifest 자체는 `src/app/manifest.ts`(`MetadataRoute.Manifest`)가 만드는 라우트라 여기 파일이 아니다 — 여기에는 그 매니페스트가 참조하는 아이콘 파일만 있다.

## 규칙

1. 코드 파일(`.ts`/`.tsx`/`.js`) 금지 — 정적 자산만.
2. 아이콘 크기·이름은 `src/app/manifest.ts`의 `icons` 배열과 1:1로 맞춘다(어긋나면 빌드는 통과해도 PWA 설치 아이콘이 깨진다).
3. `_headers` — Cloudflare Workers Static Assets 가 읽는 캐시 헤더. 이 파일이 있으면 vinext 가 만드는 `dist/client/_headers` 를 **병합이 아니라 덮어쓴다**(실측). 그래서 vinext 생성본의 `/_next/static/*` 1년 immutable 규칙도 여기서 직접 유지해야 한다 — 지우면 해시 붙은 자산이 캐시를 잃는다. Worker 가 동적으로 만드는 응답(`/manifest.webmanifest` 등 metadata 라우트)에는 적용되지 않으니 그런 경로 규칙은 적지 않는다.
4. `fonts/`는 `scripts/subset-font.sh`로만 갱신(손으로 고치지 않는다), woff2 1개 + `OFL.txt`만. 파일명의 내용 해시와 `_headers` 의 `/fonts/*` 1년 immutable 은 **한 쌍**이다 — 해시 없는 이름으로 되돌리면 1년 동안 낡은 폰트가 나간다(`docs/specs/theme.md` R14). 관할: fonts/

## 검증

```bash
pnpm build 2>&1 | tail -5
```
