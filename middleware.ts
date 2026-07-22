import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 어드민 라우트 보호 (Route Protection)
 *
 * 동작
 *  - /admin/**       : 로그인 필수 (admin_token 쿠키)
 *  - /super-admin/** : 로그인 + super_admin 권한 필수
 *  - /admin/login    : 공개. 이미 로그인 상태면 대시보드로 되돌림
 *
 * ⚠️ 보안 경계에 대한 주의
 *  미들웨어는 Edge 에서 쿠키의 '존재와 role 값'만 확인하는 1차 차단선이다.
 *  쿠키는 클라이언트가 위조할 수 있으므로 이것만으로는 충분하지 않다.
 *  실제 권한 집행은 백엔드가 매 요청마다 JWT 서명을 검증하고 회사 격리를
 *  질의에 강제하는 것으로 이루어진다(services/auth.py).
 *  즉 위조 쿠키로 화면 껍데기는 열 수 있어도 데이터는 단 한 건도 못 가져간다.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('admin_token')?.value;
  const role = request.cookies.get('admin_role')?.value;

  const isLoginPage = pathname.startsWith('/admin/login');

  // 로그인 페이지: 이미 인증된 사용자는 각자의 홈으로
  if (isLoginPage) {
    if (token) {
      const home = role === 'super_admin' ? '/super-admin/dashboard' : '/admin/dashboard';
      return NextResponse.redirect(new URL(home, request.url));
    }
    return NextResponse.next();
  }

  // 미인증 → 로그인 화면으로 (원래 목적지를 next 파라미터로 보존)
  if (!token) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 운영자 전용 구역: client_admin 접근 차단
  if (pathname.startsWith('/super-admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/super-admin/:path*'],
};
