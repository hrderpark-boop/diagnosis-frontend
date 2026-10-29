import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 관리자 라우트 보호 (Route Protection)
 *
 * 두 콘솔은 주소부터 분리한다. 고객사에는 /admin 만 배포하고 /master 는 운영사만 쓴다.
 *  - /admin/**  : 고객사 HR(client_admin) 전용. 로그인은 /admin/login
 *  - /master/** : 마스터(super_admin) 전용. 로그인은 /master/login
 *  - /super-admin/** : 예전 주소. 같은 화면의 /master 주소로 넘긴다
 *  - 마스터가 '고객사로 들어가기'를 한 상태(fm_act_company 쿠키)면 /admin/** 도 연다(유지보수·대리 수정).
 *    데이터 범위는 백엔드가 X-Act-As-Company 헤더와 super_admin 권한을 함께 확인해 그 고객사로 고정한다.
 *
 * (2026-10-29) 도메인 분리
 *  - fm-hr.connectn.co.kr  : 고객사 HR 전용. / 는 /admin 으로, /master 는 막는다(HR 로그인으로)
 *  - fm-ops.connectn.co.kr : 마스터 전용. / 는 /master 로, /admin 은 고객사로 들어간 마스터만
 *  - 그 밖의 주소(fm.connectn.co.kr·로컬·미리보기): 지금처럼 경로로만 나눈다
 *
 * ⚠️ 보안 경계에 대한 주의
 *  미들웨어는 Edge 에서 쿠키의 '존재와 role 값'만 확인하는 1차 차단선이다.
 *  쿠키는 클라이언트가 위조할 수 있으므로 이것만으로는 충분하지 않다.
 *  실제 권한 집행은 백엔드가 매 요청마다 JWT 서명을 검증하고 회사 격리를
 *  질의에 강제하는 것으로 이루어진다(services/auth.py).
 */
const HR_HOST = 'fm-hr.connectn.co.kr';
const OPS_HOST = 'fm-ops.connectn.co.kr';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const token = request.cookies.get('admin_token')?.value;
  const role = request.cookies.get('admin_role')?.value;
  const isSuper = role === 'super_admin';
  const acting = isSuper && !!request.cookies.get('fm_act_company')?.value;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isMasterPath = pathname === '/master' || pathname.startsWith('/master/') || pathname.startsWith('/super-admin');

  // ── 도메인별 입구 ──
  if (host === HR_HOST) {
    // 고객사 HR 주소: 관리자 화면 밖(참여자 화면 등)과 마스터 화면은 HR 콘솔로 돌린다
    if (!isAdminPath) return to('/admin');
  } else if (host === OPS_HOST) {
    // 마스터 주소: 참여자 화면은 마스터 콘솔로. /admin 은 아래 규칙대로 대리 중인 마스터만 통과
    if (!isAdminPath && !isMasterPath) return to('/master');
    if (isAdminPath && !acting) return to('/master/login');
  } else if (!isAdminPath && !isMasterPath) {
    // 참여자 주소의 일반 화면은 손대지 않는다
    return NextResponse.next();
  }

  // 예전 운영자 주소 → /master
  if (pathname.startsWith('/super-admin')) {
    return to(pathname.replace(/^\/super-admin/, '/master') || '/master');
  }

  const isMaster = pathname.startsWith('/master');
  const base = isMaster ? '/master' : '/admin';
  const isLoginPage = pathname === `${base}/login`;

  if (isLoginPage) {
    // 이미 이 콘솔 권한으로 로그인했으면 홈으로. 다른 콘솔 권한이면 로그인 화면을 그대로 보여 준다.
    if (token && (isSuper === isMaster || (!isMaster && acting))) return to(`${base}/dashboard`);
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
  if (!isMaster && isSuper && !acting) return to('/admin/login');

  return NextResponse.next();
}

export const config = {
  // 도메인별 입구를 처리하려고 정적 파일·API·Next 내부 경로를 뺀 모든 경로에서 돈다
  matcher: ['/((?!_next/|api/|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|.*\\.[a-zA-Z0-9]+$).*)'],
};
