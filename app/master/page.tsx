import { redirect } from 'next/navigation';

/** /master (루트) 진입 처리. 화면 없이 마스터 대시보드로 넘긴다. 인증은 미들웨어가 먼저 검사한다. */
export default function MasterRootPage() {
  redirect('/master/dashboard');
}
