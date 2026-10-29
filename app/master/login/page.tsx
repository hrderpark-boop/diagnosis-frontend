import AdminLoginShell from '@/components/admin/AdminLoginShell';

/** 마스터(운영사) 로그인. 운영사 전용 주소(/master/login). 고객사 HR 계정은 받지 않는다. */
export default function MasterLoginPage() {
  return <AdminLoginShell variant="master" />;
}
