// 삭제 대화상자와 되돌리기 토스트가 **같이 쓰는 문구** (category §2-C, R11·R15).
//
// 왜 한곳에 모으는가: 제목("'공부'를 삭제할까요?")과 토스트("'공부'를 삭제했어요")는 같은 조사 규칙을
// 쓰는 한 쌍인데, 하나는 컴포넌트가 다른 하나는 훅이 만든다. 각자 쓰면 이름이 바뀌었을 때 한쪽만
// 고쳐져 "'운동'를 삭제했어요" 같은 문장이 남는다. 조사 규칙 자체(`objectParticle`)는
// `@/lib/korean` 이다 — todo 의 삭제 확인 문구도 같은 규칙을 쓴다(T-87, `features/AGENTS.md` 규칙 5).
import type { ReactNode } from 'react';

import { objectParticle } from '@/lib/korean';

/** 대화상자 제목 (§2-C). */
export function removalTitle(name: string): string {
  return `'${name}'${objectParticle(name)} 삭제할까요?`;
}

/** 되돌리기 토스트 문구 (R15). */
export function removalToastMessage(name: string): string {
  return `'${name}'${objectParticle(name)} 삭제했어요`;
}

/**
 * 본문 문구 (R11 축약): N>0 이면 "기록으로 남아요", M>0 이면 "어떻게 할까요?",
 * 둘 다 0 이면 "할 일이 없는 카테고리예요."
 */
export function removalDescription({
  done,
  incomplete,
}: {
  done: number;
  incomplete: number;
}): ReactNode {
  if (done === 0 && incomplete === 0) {
    return '할 일이 없는 카테고리예요.';
  }
  return (
    <>
      {done === 0 ? null : <span className="block">완료한 할 일 {done}개는 기록으로 남아요.</span>}
      {incomplete === 0 ? null : (
        <span className="block">아직 안 한 할 일 {incomplete}개는 어떻게 할까요?</span>
      )}
    </>
  );
}
