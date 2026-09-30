import type { CategoryVisibility } from '@/domain/category/visibility';

export const CATEGORY_AUDIENCE_LABELS: Record<CategoryVisibility, string> = {
  private: '나만 보기',
  friends: '친구만',
  public: '모두 공개',
};

type CategoryAudiencePickerProps = {
  value: CategoryVisibility;
  onChange: (value: CategoryVisibility) => void;
  disabled?: boolean;
};

export function CategoryAudiencePicker({
  value,
  onChange,
  disabled = false,
}: CategoryAudiencePickerProps) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-[var(--space-2)]">
      <legend className="mb-[var(--space-2)] text-sm text-muted">공개 범위</legend>
      {(['private', 'friends', 'public'] as const).map((audience) => (
        <label
          key={audience}
          className="flex min-h-[var(--control-height)] items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border px-[var(--space-3)] text-base text-text"
        >
          <input
            type="radio"
            name="category-audience"
            value={audience}
            checked={value === audience}
            onChange={() => onChange(audience)}
            className="accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          {CATEGORY_AUDIENCE_LABELS[audience]}
        </label>
      ))}
    </fieldset>
  );
}
