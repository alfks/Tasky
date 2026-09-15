import { cn } from '@/lib/cn';

type ProgressRingProps = {
  /**
   * 0~1 달성률. `null` 은 투두 0개(비율이 정의되지 않음, completion-rate.md R1)를 뜻하고
   * 트랙만 그린다. 범위 밖 값은 잘라낸다.
   */
  value: number | null;
  /** 지름 px. 헤더 40, 인사이트 패널 120(completion-rate.md R7). */
  size: number;
  /** 링 굵기 px. 헤더 4, 패널 10(같은 규칙). */
  thickness: number;
  /** 링 전체를 읽는 문구(예: "오늘 달성률 60퍼센트, 5개 중 3개 완료"). */
  label: string;
  className?: string;
};

/** 달성률 링. 각도는 반올림 전 비율 그대로 그린다(completion-rate.md R3). */
export function ProgressRing({ value, size, thickness, label, className }: ProgressRingProps) {
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = value === null ? 0 : Math.min(1, Math.max(0, value));

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0', className)}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        className="stroke-surface-2"
      />
      {ratio > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${center} ${center})`}
          className="stroke-accent transition-[stroke-dashoffset] duration-[var(--motion-base)] ease-[var(--motion-ease)]"
        />
      )}
    </svg>
  );
}
