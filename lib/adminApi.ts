import axios from 'axios';

/**
 * 어드민 전용 API 클라이언트.
 *
 * 설계 원칙
 *  - 클라이언트에서 Supabase(DB)로 직접 접근하지 않는다. 모든 어드민 데이터는
 *    FastAPI 백엔드(/api/v1/admin/*)를 통해서만 오간다.
 *  - 토큰은 쿠키에 저장한다. localStorage 는 Next.js 미들웨어(Edge)에서 읽을 수
 *    없어 라우트 보호가 불가능하기 때문이다.
 */

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

export const ADMIN_TOKEN_KEY = 'admin_token';
export const ADMIN_ROLE_KEY = 'admin_role';

export type AdminRole = 'super_admin' | 'client_admin';

export interface AdminProfile {
  admin_id: string;
  name: string | null;
  email: string;
  role: AdminRole;
  company_id: string | null;
  company_name: string | null;
}

export interface Paginated<T = any> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// 쿠키 유틸 (미들웨어와 공유하기 위해 localStorage 대신 쿠키 사용)
// ---------------------------------------------------------------------------
export const setCookie = (name: string, value: string, days = 1) => {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // SameSite=Lax: 일반적인 이동은 허용하되 크로스사이트 POST 는 차단(CSRF 완화)
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
};

export const deleteCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

// ---------------------------------------------------------------------------
// axios 인스턴스
// ---------------------------------------------------------------------------
const adminApi = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

adminApi.interceptors.request.use((config) => {
  const token = getCookie(ADMIN_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 토큰 만료/무효 시 로그인 화면으로 강제 이동
adminApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      clearAdminSession();
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export const clearAdminSession = () => {
  deleteCookie(ADMIN_TOKEN_KEY);
  deleteCookie(ADMIN_ROLE_KEY);
};

// ---------------------------------------------------------------------------
// API 래퍼
// ---------------------------------------------------------------------------
export const adminLogin = async (email: string, password: string) => {
  const { data } = await adminApi.post('/admin/auth/login', { email, password });
  setCookie(ADMIN_TOKEN_KEY, data.access_token);
  setCookie(ADMIN_ROLE_KEY, data.role);
  return data;
};

export const fetchMe = async (): Promise<AdminProfile> => {
  const { data } = await adminApi.get('/admin/auth/me');
  return data;
};

export const fetchParticipants = async (params: {
  search?: string;
  page?: number;
  page_size?: number;
  company_id?: string;
}): Promise<Paginated> => {
  const { data } = await adminApi.get('/admin/participants', { params });
  return data;
};

export const fetchReports = async (params: {
  search?: string;
  page?: number;
  page_size?: number;
  company_id?: string;
}): Promise<Paginated> => {
  const { data } = await adminApi.get('/admin/reports', { params });
  return data;
};

export const fetchOverview = async (companyId?: string) => {
  const { data } = await adminApi.get('/admin/stats/overview', {
    params: companyId ? { company_id: companyId } : {},
  });
  return data;
};

export const fetchDailyStats = async (days = 7, companyId?: string) => {
  const { data } = await adminApi.get('/admin/stats/daily', {
    params: { days, ...(companyId ? { company_id: companyId } : {}) },
  });
  return data;
};

export const fetchCompetencyStats = async (companyId?: string) => {
  const { data } = await adminApi.get('/admin/stats/competencies', {
    params: companyId ? { company_id: companyId } : {},
  });
  return data;
};

export const fetchCompanies = async () => {
  const { data } = await adminApi.get('/admin/companies');
  return data;
};

export const downloadExcel = async () => {
  const res = await adminApi.get('/admin/export_excel', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnosis_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default adminApi;
