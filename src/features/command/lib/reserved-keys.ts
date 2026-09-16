/**
 * OS·브라우저가 먼저 가져가는 조합(R4). 여기 걸리는 조합은 **등록 자체가 거절된다**.
 *
 * 왜 경고가 아니라 거절인가: `Mod+W` 를 등록하면 사용자는 탭이 닫히는 것을 막을 수 없고(브라우저가
 * `preventDefault` 를 무시한다) 적어 둔 할 일을 잃는다. 되돌릴 수 없는 손해라 빌드·테스트 단계에서
 * 멈추는 편이 싸다. 목록은 "우리 코드가 막을 수 없는 것" 만 담는다 — `Mod+K`(Firefox 검색창)처럼
 * `preventDefault` 로 실제로 막히는 것은 여기 넣지 않고 디스패처가 기본 동작을 막는다.
 */
import { chordId, parseChord, type Chord } from '@/features/command/lib/key-chord';

const RESERVED_SPECS = [
  'Mod+W', // 탭 닫기
  'Mod+Shift+W', // 창 닫기
  'Mod+T', // 새 탭
  'Mod+Shift+T', // 닫은 탭 복원
  'Mod+N', // 새 창
  'Mod+Shift+N', // 시크릿 창
  'Mod+Q', // 종료(macOS)
  'Mod+R', // 새로고침
  'Mod+L', // 주소창
  'Mod+P', // 인쇄
  'Mod+S', // 저장
  'Mod+D', // 북마크
  'Mod+O', // 파일 열기
  'Mod+Tab', // 탭 전환
  'Alt+ArrowLeft', // 뒤로 (R4 가 명시적으로 금지)
  'Alt+ArrowRight', // 앞으로
  'F5', // 새로고침
  'F6', // 브라우저 UI 포커스 이동
  'F11', // 전체 화면
] as const;

const RESERVED_IDS = new Map<string, string>(
  RESERVED_SPECS.map((spec) => [chordId(parseChord(spec)), spec]),
);

/** 예약 조합이면 그 표기를, 아니면 `null`. */
export function reservedConflict(chord: Chord): string | null {
  return RESERVED_IDS.get(chordId(chord)) ?? null;
}

/** 테스트·문서용 — 예약 목록 전체. */
export function reservedChordSpecs(): readonly string[] {
  return RESERVED_SPECS;
}
