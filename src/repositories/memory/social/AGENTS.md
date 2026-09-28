<!-- 읽기 조건: 온라인 소셜 포트의 테스트용 메모리 구현 내부를 수정할 때. -->

# src/repositories/memory/social/ — AGENTS

이 디렉터리는 테스트 전용 공유 상태와 관계·게시물 명령을 나눈다. 공개 진입은 한 단계 위의 `social-repository.ts`다. 공통 권한·관계·멱등 판정은 `src/domain/social/` 함수를 직접 호출하며, 개인 동기화·백업 저장소를 참조하지 않는다.

`cursor.ts`는 actor·목록 scope·15분 만료와 정렬 키를 묶어 앞 항목 삭제에도 다음 페이지를 건너뛰지 않는다. `model.ts` receipt는 확정 명령 오류도 재생한다. 명령 정규형과 초대 token은 SHA-256 digest로만 보관하고, 원문은 최초 발급 응답과 후속 요청 지역 변수에만 둔다.
