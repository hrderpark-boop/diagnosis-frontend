import { redirect } from 'next/navigation';

/**
 * /super-admin (루트) 진입 처리.
 *
 * 이 경로에는 렌더링할 화면이 없어 그동안 404 가 발생했다.
 * 운영자용 기본 진입점인 고객사 관리로 즉시 넘긴다.
 *
 * 서버 컴포넌트에서 redirect() 를 호출하므로 클라이언트 렌더링·깜빡임 없이
 * 서버 응답 단계에서 곧바로 이동한다. 인증 검사는 그대로 미들웨어가
 * 먼저 수행하므로(matcher: '/super-admin/:path*'), 미인증 사용자는
 * 여기까지 오지 않고 로그인 화면으로 보내진다.
 */
export default function SuperAdminRootPage() {
  redirect('/super-admin/companies');
}
