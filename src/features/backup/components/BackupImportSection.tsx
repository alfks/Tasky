// 다이얼로그의 "가져오기" 절 (backup.md §2·R6·R7·R8·§5).
//
// 파일 선택은 **진짜 `input[type=file]`** 이고(§5) 라벨이 그 입력을 가리키므로 키보드로 열 수 있다.
// 모드는 네이티브 라디오 + 명시적 `role="radiogroup"`, 교체 확인은 공용 `Checkbox` 다.
//
// 교체 모드에서는 **무엇을 잃는지**를 확인 체크박스 위에 숫자로 보여준다 — 체크박스는 "읽었다" 는
// 서명일 뿐이고, 서명할 내용이 화면에 없으면 확인 절차가 형식만 남는다.
import { useId } from 'react';

import type { BackupCounts } from '@/domain/backup/export-backup';
import type { ImportMode } from '@/domain/backup/plan-import';

import type { BackupSelection } from '@/features/backup/store/backup-state';

import { Checkbox } from '@/components/ui/Checkbox';

type BackupImportSectionProps = {
  fileName: string | null;
  selection: BackupSelection | null;
  /** 지금 저장소에 있는 개수 — 교체 모드에서 "사라지는 것" 을 보여주는 데 쓴다. */
  current: BackupCounts | null;
  /** 파일 형식 오류 문구 (R8). 없으면 `null`. */
  errorMessage: string | null;
  mode: ImportMode;
  acknowledged: boolean;
  busy: boolean;
  /** 로그인(동기화 켜짐) 상태에서 "교체" 를 비활성화한다(sync.md R7-a). 이유는 `replaceDisabledReason`. */
  replaceDisabled?: boolean;
  replaceDisabledReason?: string;
  onSelect: (file: File | null) => void;
  onModeChange: (mode: ImportMode) => void;
  onAcknowledgedChange: (acknowledged: boolean) => void;
};

const MODES: readonly { value: ImportMode; label: string }[] = [
  { value: 'merge', label: '병합 — 같은 항목은 더 최근 것을 남겨요' },
  { value: 'replace', label: '교체 — 지금 데이터를 모두 지우고 파일로 바꿔요' },
];

export function BackupImportSection({
  fileName,
  selection,
  current,
  errorMessage,
  mode,
  acknowledged,
  busy,
  replaceDisabled = false,
  replaceDisabledReason,
  onSelect,
  onModeChange,
  onAcknowledgedChange,
}: BackupImportSectionProps) {
  const inputId = useId();
  const radioName = useId();
  const acknowledgeId = useId();

  return (
    <section aria-labelledby="backup-import-heading" className="flex flex-col gap-[var(--space-3)]">
      <h3 id="backup-import-heading" className="text-base font-semibold">
        가져오기
      </h3>
      <p className="text-sm text-muted">
        가져오기는 서버 공개 상태를 바꾸지 않아요. 공유 연결 없음으로 표시되어도 이전 서버 공유가
        비공개가 된 것은 아니에요. 친구 화면의 공유 카테고리 관리에서 이전 공유 상태를 직접 확인해
        주세요.
      </p>

      <div className="flex flex-wrap items-center gap-[var(--space-3)]">
        <label htmlFor={inputId} className="text-sm font-medium">
          백업 파일 선택
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {fileName === null ? null : <span className="text-sm text-muted">{fileName}</span>}
      </div>

      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {selection === null ? null : (
        <p className="text-sm text-muted">
          파일에 카테고리 {selection.counts.categories}개 · 할 일 {selection.counts.todos}개가
          있어요
        </p>
      )}

      <fieldset
        role="radiogroup"
        aria-label="가져오기 방식"
        className="flex flex-col gap-[var(--space-2)] border-0 p-0"
      >
        {MODES.map((option) => {
          const optionDisabled = option.value === 'replace' && replaceDisabled;
          return (
            <label
              key={option.value}
              aria-disabled={optionDisabled ? true : undefined}
              title={optionDisabled ? replaceDisabledReason : undefined}
              className="flex items-center gap-[var(--space-2)] text-sm aria-disabled:text-muted"
            >
              <input
                type="radio"
                name={radioName}
                value={option.value}
                checked={mode === option.value}
                disabled={busy || optionDisabled}
                onChange={() => onModeChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>

      {mode === 'replace' ? (
        <div className="flex flex-col gap-[var(--space-2)]">
          {current === null ? null : (
            <p className="text-sm text-danger">
              지금 있는 카테고리 {current.categories}개 · 할 일 {current.todos}개가 사라져요
            </p>
          )}
          <div className="flex items-center gap-[var(--space-2)] text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={onAcknowledgedChange}
              disabled={busy}
              labelledBy={acknowledgeId}
            />
            <span id={acknowledgeId}>지금 데이터가 사라지는 것을 이해했어요</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
