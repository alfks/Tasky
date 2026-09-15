// 카테고리·강조색 팔레트 12색 (theme.md §3-C). 저장값은 **라이트 HEX 대문자** 하나이고,
// 다크 모드 값은 같은 프리셋에서 파생한다(저장하지 않는다 — theme R3).

/** 팔레트 프리셋 식별자. 저장되지 않는다(저장은 라이트 HEX). */
export type PaletteColorId =
  | 'coral'
  | 'peach'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'mint'
  | 'teal'
  | 'sky'
  | 'blue'
  | 'lavender'
  | 'lilac'
  | 'gray';

/** 프리셋 한 칸. `name` 은 색 선택 radiogroup 의 라벨이다(색만으로 정보를 전달하지 않는다 — theme R9). */
export type PaletteColor = {
  id: PaletteColorId;
  /** 한국어 색 이름. */
  name: string;
  /** 라이트 모드 HEX(대문자). 이 값이 `Category.color`·`Settings.accentColor` 에 저장된다. */
  light: string;
  /** 다크 모드 HEX(대문자). */
  dark: string;
};

/** theme.md §3-C 표와 1:1. 순서도 그 표의 읽기 순서(좌열 → 우열)다. */
export const PALETTE: readonly PaletteColor[] = [
  { id: 'coral', name: '코랄', light: '#FF8FA3', dark: '#E27A8E' },
  { id: 'peach', name: '피치', light: '#FFB38A', dark: '#E39A73' },
  { id: 'orange', name: '오렌지', light: '#FFC978', dark: '#E3AE63' },
  { id: 'yellow', name: '옐로', light: '#FFEB99', dark: '#E0CD7E' },
  { id: 'lime', name: '라임', light: '#CFEB8F', dark: '#B3CF76' },
  { id: 'mint', name: '민트', light: '#A8E6B0', dark: '#8CCB95' },
  { id: 'teal', name: '틸', light: '#8FDCD0', dark: '#76C1B6' },
  { id: 'sky', name: '스카이', light: '#7CC6FF', dark: '#6AAEE3' },
  { id: 'blue', name: '블루', light: '#9DB8F5', dark: '#829ED9' },
  { id: 'lavender', name: '라벤더', light: '#B5A8F0', dark: '#9B8ED6' },
  { id: 'lilac', name: '라일락', light: '#D8B8E8', dark: '#BC9ECC' },
  { id: 'gray', name: '그레이', light: '#C9CCD6', dark: '#9EA1AB' },
];

/** 기본 강조색·첫 실행 시드 카테고리 색 (theme R3, category R18). */
export const DEFAULT_ACCENT_COLOR = '#7CC6FF';

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

/** 입력 HEX 를 저장 표기(대문자 `#RRGGBB`)로 맞춘다. 형식이 아니면 `undefined`. */
export function normalizeHexColor(value: string): string | undefined {
  const upper = value.trim().toUpperCase();
  return HEX_PATTERN.test(upper) ? upper : undefined;
}

/** HEX → 프리셋. 프리셋 밖의 색이면 `undefined`(오류가 아니다 — theme R4). */
export function findPaletteColor(hex: string): PaletteColor | undefined {
  const normalized = normalizeHexColor(hex);
  return normalized === undefined ? undefined : PALETTE.find((c) => c.light === normalized);
}

/** 사용자가 고를 수 있는 색인지(생성·수정 다이얼로그의 검증 — category R3). */
export function isPaletteColor(hex: string): boolean {
  return findPaletteColor(hex) !== undefined;
}

/**
 * 저장된 라이트 HEX 를 표시 모드에 맞는 HEX 로 바꾼다.
 * 프리셋 밖의 색(가져오기 등)은 두 모드에서 그대로 쓴다 (theme R4).
 */
export function resolvePaletteColor(hex: string, mode: 'light' | 'dark'): string {
  const preset = findPaletteColor(hex);
  if (preset === undefined) {
    return normalizeHexColor(hex) ?? hex;
  }
  return mode === 'dark' ? preset.dark : preset.light;
}
