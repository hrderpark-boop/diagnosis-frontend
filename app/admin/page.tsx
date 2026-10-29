import { redirect } from 'next/navigation';

/**
 * /admin (루트) 진입 처리. 화면 없이 HR 대시보드로 넘긴다.
 * 인증·권한 검사는 미들웨어가 먼저 수행한다(미인증 → /admin/login, 마스터 토큰 → /admin/login).
 */
export default function AdminRootPage() {
  redirect('/admin/dashboard');
}
