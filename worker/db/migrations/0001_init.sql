-- 동기화 D1 스키마 v1(불가역 — SYNC_DESIGN.md §②-2, docs/specs/sync.md §6, ADR-0019).
--
-- **sessions.sub 에는 REFERENCES(FK)를 걸지 않는다** — ADR-0019 §계정 삭제 타이밍 참고.
-- 계정 삭제(`POST /api/account/delete`)는 이 파일이 나간 뒤 확정된 설계대로, users/devices/entities 세
-- 테이블만 명시 DELETE 하고 **다른 기기의 sessions 행은 즉시 지우지 않는다** — 그래야 그 기기가 다음
-- 요청에서 sid → sub 를 여전히 찾아 deleted_users 조회로 "삭제됨" 을 401 과 구분해 받을 수 있다
-- (그 세션 행 자체는 그 요청을 처리하며 지연 정리된다, worker/auth/session.ts). devices·entities 는
-- 그 판정에 관여하지 않으므로 평범하게 FK CASCADE 를 걸어 둔다(PRAGMA foreign_keys 가 꺼져 있을 가능성에
-- 대비해 handler 는 항상 명시 DELETE 도 같이 실행한다 — worker/account/delete.ts).
CREATE TABLE users (
  sub        TEXT PRIMARY KEY,          -- 구글 sub (ADR-0015 §1)
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  gc_floor   INTEGER NOT NULL DEFAULT 0 -- 이 seq 이하 툼스톤은 지워도 된다(SYNC_DESIGN.md §①-3)
);

-- sub 는 의도적으로 FK 가 아니다(위 헤더 설명). 만료 청소는 세션 검증 경로(session.ts)가 지연 수행한다.
CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,          -- 256비트 난수 base64url
  sub        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_sub ON sessions(sub);

CREATE TABLE devices (
  sub        TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,             -- 클라이언트 IDB syncState 가 만든 UUID
  last_seq   INTEGER NOT NULL DEFAULT 0,
  seen_at    TEXT NOT NULL,
  PRIMARY KEY (sub, device_id)
);

CREATE TABLE entities (
  sub        TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  tbl        TEXT NOT NULL CHECK (tbl IN ('todos','categories','settings','focusSessions','ddays','diaryEntries','routines')),
  id         TEXT NOT NULL,
  seq        INTEGER NOT NULL,          -- 사용자별 단조 증가
  deleted    INTEGER NOT NULL DEFAULT 0,-- body.deletedAt 존재 여부의 사본(풀 필터·GC 용)
  device_id  TEXT NOT NULL,             -- 마지막으로 쓴 기기(풀에서 자기 것 제외)
  updated_at TEXT NOT NULL,             -- body.updatedAt 의 사본(클램프 적용 후) — LWW 판정에 SQL 이 직접 쓴다
  body       TEXT NOT NULL,             -- JSON. validate-rows 화이트리스트 통과분만
  PRIMARY KEY (sub, tbl, id)
);
CREATE UNIQUE INDEX entities_seq ON entities(sub, seq);

-- 계정 삭제 기록 — CASCADE 체인 밖(무엇도 참조하지 않고, 무엇에게도 참조되지 않는다). 다른 기기가
-- "계정이 삭제됐다" 를 판정하는 유일한 단일 소스(ADR-0019, docs/specs/sync.md §6).
CREATE TABLE deleted_users (
  sub        TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
