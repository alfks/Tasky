/** 공개 읽기만 개인 로그인 게이트 밖에 둔다. 다른 주소는 기존 앱 진입으로 처리한다. */
export function isPublicRoute(pathname: string): boolean {
  return pathname === '/public' || pathname === '/public/';
}
