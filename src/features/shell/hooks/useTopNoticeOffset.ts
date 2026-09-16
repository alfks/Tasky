// 상단 고정 알림이 차지하는 높이. 자세한 사정은 `lib/top-notice.ts` 머리주석.
import { useEffect, useState } from 'react';

import { observeTopNotice } from '@/features/shell/lib/top-notice';

export function useTopNoticeOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => observeTopNotice(document, setOffset), []);
  return offset;
}
