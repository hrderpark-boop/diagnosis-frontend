import AdminLoginShell from '@/components/admin/AdminLoginShell';

/** 고객사 HR 관리자 로그인. 고객사에 배포하는 주소(/admin/login). 마스터 계정은 받지 않는다. */
export default function AdminLoginPage() {
  return <AdminLoginShell variant="hr" />;
}
