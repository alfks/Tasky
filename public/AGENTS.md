<!-- 읽기 조건: PWA 아이콘·manifest, 셀프 호스팅 폰트 등 정적 자산을 추가·교체할 때. -->

# public/ — AGENTS

## 목적

PWA 아이콘, 셀프 호스팅 폰트 등 정적 자산만. 실제 web manifest는 `src/app/manifest.ts`(Next.js `MetadataRoute.Manifest`)가 생성한다 — 여기는 그 매니페스트가 참조하는 아이콘 파일과, `fonts/`(Pretendard 서브셋 woff2 + `OFL.txt` 라이선스, `docs/specs/theme.md` §3-F)만 둔다.

## 규칙

1. 코드 파일(`.ts`/`.tsx`/`.js`) 금지 — 정적 자산만.
2. 아이콘 크기·이름은 `src/app/manifest.ts`의 `icons` 배열과 1:1로 맞춘다(어긋나면 빌드는 통과해도 PWA 설치 아이콘이 깨진다).
3. `fonts/`는 `scripts/subset-font.sh`로만 갱신(손으로 고치지 않는다), woff2 1개 + `OFL.txt`만. 관할: fonts/

## 검증

```bash
pnpm build 2>&1 | tail -5
```
