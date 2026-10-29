import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 관리자 라우트 보호 (Route Protection)
 *
 * 두 콘솔은 주소부터 분리한다. 고객사에는 /admin 만 배포하고 /master 는 운영사만 쓴다.
 *  - /admin/**  : 고객사 HR(client_admin) 전용. 로그인은 /admin/login
 *  - /master/** : 마스터(super_admin) 전용. 로그인은 /master/login
 *  - /super-admin/** : 예전 주소. 같은 화면의 /master 주소로 넘긴다
 *
 * ⚠️ 보안 경계에 대한 주의
 *  미들웨어는 Edge 에서 쿠키의 '존재와 role 값'만 확인하는 1차 차단선이다.
 *  쿠키는 클라이언트가 위조할 수 있으므로 이것만으로는 충분하지 않다.
 *  실제 권한 집행은 백엔드가 매 요청마다 JWT 서명을 검증하고 회사 격리를
 *  질의에 강제하는 것으로 이루어진다(services/auth.py).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('admin_token')?.value;
  const role = request.cookies.get('admin_role')?.value;
  const isSuper = role === 'super_admin';
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // 예전 운영자 주소 → /master
  if (pathname.startsWith('/super-admin')) {
    return to(pathname.replace(/^\/super-admin/, '/master') || '/master');
  }

  const isMaster = pathname.startsWith('/master');
  const base = isMaster ? '/master' : '/admin';
  const isLoginPage = pathname === `${base}/login`;

  if (isLoginPage) {
    // 이미 이 콘솔 권한으로 로그인했으면 홈으로. 다른 콘솔 권한이면 로그인 화면을 그대로 보여 준다.
    if (token && isSuper === isMaster) return to(`${base}/dashboard`);
    return NextResponse.next();
  }

  // 미인증 → 이 콘솔의 로그인 화면(원래 목적지는 next 로 보존)
  if (!token) {
    const loginUrl = new URL(`${base}/login`, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 다른 콘솔 권한의 토큰: 자기 콘솔 로그인 화면으로
  if (isMaster && !isSuper) return to('/master/login');
  if (!isMaster && isSuper) return to('/admin/login');

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/master/:path*', '/super-admin/:path*'],
};
