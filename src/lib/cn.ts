// Tailwind 클래스 병합 유틸. 조건부 클래스(clsx)와 유틸 충돌 해소(tailwind-merge)를 한 번에 한다.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 클래스 이름을 합친다. 뒤에 온 Tailwind 유틸이 같은 속성의 앞 유틸을 이긴다 — 컴포넌트의 기본 클래스를
 * props 의 className 으로 덮어쓰는 것이 이 함수 하나로 된다.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
