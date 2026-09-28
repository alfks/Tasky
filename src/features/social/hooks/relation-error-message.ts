const ERROR_TEXT: Record<string, string> = {
  unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요.',
  'account-deleted': '계정을 사용할 수 없어요.',
  conflict: '상태가 바뀌었어요. 목록을 새로 확인한 뒤 다시 결정해 주세요.',
  'request-pending': '이미 처리 중인 요청이에요. 목록을 새로 확인해 주세요.',
  'request-expired': '요청 기간이 지났어요. 목록을 새로 확인해 주세요.',
  'idempotency-conflict': '이전 요청과 내용이 달라요. 목록을 새로 확인해 주세요.',
  'limit-reached': '상한에 도달했어요. 친구나 공유 기록을 정리한 뒤 다시 시도해 주세요.',
  'rate-limited': '요청이 많아요. 잠시 후 다시 시도해 주세요.',
  'social-disabled': '지금은 새 친구 요청과 공유를 사용할 수 없어요.',
  validation: '입력을 확인해 주세요.',
  unavailable: '사용할 수 없는 초대예요. 새 초대를 부탁해 주세요.',
  temporary: '일시적으로 처리하지 못했어요. 같은 요청으로 다시 시도해 주세요.',
};

export function relationErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return '완료 여부를 확인하고 있어요. 같은 요청으로 다시 시도해 주세요.';
  }
  const code = (error as { code?: unknown }).code;
  if (code === 'rate-limited') {
    const retryAfter = (error as { retryAfter?: unknown }).retryAfter;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
      return `요청이 많아요. ${Math.ceil(retryAfter)}초 뒤 다시 시도해 주세요.`;
    }
  }
  return typeof code === 'string'
    ? (ERROR_TEXT[code] ?? '불러오지 못했어요. 다시 시도해 주세요.')
    : '불러오지 못했어요. 다시 시도해 주세요.';
}
