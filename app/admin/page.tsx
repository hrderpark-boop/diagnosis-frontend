import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * /admin (루트) 진입 처리.
 *
 * 이 경로에는 렌더링할 화면이 없어 404 가 발생했다(미들웨어가 로그인으로
 * 보내더라도 로그인 뒤 next=/admin 으로 되돌아오면 다시 404).
 * 화면 없이 리다이렉트만 수행한다.
 *
 *  - 로그인 상태(admin_token 쿠키) : 역할별 홈
 *      super_admin → /super-admin/dashboard, 그 외 → /admin/dashboard
 *  - 미인증                      : /admin/login
 *
 * 역할별 홈 판정은 app/admin/login/page.tsx · middleware.ts 와 동일 규칙이다.
 * 쿠키는 위조 가능하므로 여기서는 이동 경로만 정하며, 실제 권한 집행은
 * 백엔드가 매 요청마다 JWT 를 검증하는 것으로 이루어진다.
 */
export default async function AdminRootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const role = cookieStore.get('admin_role')?.value;

  if (!token) redirect('/admin/login');
  redirect(role === 'super_admin' ? '/super-admin/dashboard' : '/admin/dashboard');
}
