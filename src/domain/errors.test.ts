import { describe, expect, it } from 'vitest';

import { DomainError, domainErrorMessage, isDomainError } from '@/domain/errors';

describe('DomainError', () => {
  it('코드에 대응하는 스펙 문구를 message 로 갖는다', () => {
    const error = new DomainError('TODO_TITLE_REQUIRED');
    expect(error.message).toBe('할 일을 입력해 주세요');
    expect(error.code).toBe('TODO_TITLE_REQUIRED');
    expect(error.name).toBe('DomainError');
    expect(error).toBeInstanceOf(Error);
  });

  it('detail 은 디버깅용 부가 정보이고 message 를 바꾸지 않는다', () => {
    const error = new DomainError('CATEGORY_NAME_TOO_LONG', '25');
    expect(error.detail).toBe('25');
    expect(error.message).toBe('20자까지 쓸 수 있어요');
  });

  it('isDomainError 로 저장소·인프라 에러와 구분한다', () => {
    expect(isDomainError(new DomainError('META_FORMAT_INVALID'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(isDomainError('boom')).toBe(false);
  });

  it('domainErrorMessage 는 던지지 않고 문구만 준다(인라인 검증 표시용)', () => {
    expect(domainErrorMessage('CATEGORY_NAME_DUPLICATE')).toBe('같은 이름이 이미 있어요');
  });
});
