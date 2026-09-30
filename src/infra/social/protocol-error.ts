/** 잘못된 서버 DTO는 typed temporary로 처리하고 원본 응답을 보관하지 않는다. */
export class SocialProtocolError extends Error {
  constructor() {
    super('소셜 응답 형식이 올바르지 않습니다.');
    this.name = 'SocialProtocolError';
  }
}
