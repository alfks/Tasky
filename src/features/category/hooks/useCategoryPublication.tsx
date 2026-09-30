import { createContext, useContext, type ReactNode } from 'react';

import type { Category } from '@/domain/category/category';

export type CategoryPublicationBridge = {
  pendingCategoryIds?: readonly string[];
  openManager?: () => void;
  registerPendingCategories?: (
    readIds: () => readonly string[] | null,
    subscribe: (listener: () => void) => () => void,
  ) => void;
  openVisibility: (category: Category) => void;
  beforeMetadataChange: (
    category: Category,
    next: { name: string; color: string; emoji?: string },
  ) => Promise<boolean>;
  beforeRemove: (category: Category) => Promise<boolean>;
};

// 개인 전용 카테고리는 기존대로 편집한다. 조립이 빠진 공개 연결은 조용히 수정하지 않는다.
const personalOnly = async (category: Category) => category.socialCategoryId === undefined;
const SAFE_DEFAULT: CategoryPublicationBridge = {
  openVisibility: () => undefined,
  beforeMetadataChange: personalOnly,
  beforeRemove: personalOnly,
};
const PublicationContext = createContext<CategoryPublicationBridge>(SAFE_DEFAULT);

export function CategoryPublicationProvider({
  bridge,
  children,
}: {
  bridge: CategoryPublicationBridge;
  children: ReactNode;
}) {
  return <PublicationContext.Provider value={bridge}>{children}</PublicationContext.Provider>;
}

export function useCategoryPublication(): CategoryPublicationBridge {
  return useContext(PublicationContext);
}
