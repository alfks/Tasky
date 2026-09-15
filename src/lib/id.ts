// crypto.randomUUID() 래퍼 — ID 생성의 유일한 진입점. ADR-0005: UUID v4, nanoid 는 기각.
//
// 폴백 없음: 이 앱은 PWA(서비스워커)라 이미 보안 컨텍스트(HTTPS 또는 localhost)를 요구하고,
// randomUUID 는 그 기준선의 모든 주류 런타임(Chrome 92+·Firefox 95+·Safari 15.4+·Node 22)에 있다.
// 없는 환경은 애초에 서비스워커도 못 띄우므로 지원 대상이 아니다 — Math.random 기반 자체 구현으로
// 조용히 저품질 ID를 만드는 대신, 없으면 즉시 에러를 던진다.
export function newId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID 를 사용할 수 없는 환경입니다(보안 컨텍스트 필요).');
  }
  return crypto.randomUUID();
}
