import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// 환경 변수가 없으면 로컬 기본값 사용
const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** 관리자 콘솔이 남긴 토큰 쿠키(lib/adminApi 의 ADMIN_TOKEN_KEY). */
function adminTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 요청 인터셉터: 저장된 참여자 토큰이 있으면 헤더에 자동 추가
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined' && !config.headers.Authorization) {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// (2026-10-29 보안) 백엔드가 참여자 API 에서 '본인 세션만' 허용한다.
// 관리자 콘솔의 '고객 화면 보기'(새 탭의 /report)는 참여자 토큰이 없거나 다른 사람 것이므로,
// 401·403 이 나면 관리자 토큰으로 한 번만 다시 요청한다(마스터는 전부, 고객사 HR 은 자사 참여자만 통과).
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _adminRetry?: boolean }) | undefined;
    const status = error.response?.status;
    const adminToken = adminTokenFromCookie();
    if (config && !config._adminRetry && adminToken && (status === 401 || status === 403)) {
      config._adminRetry = true;
      config.headers.Authorization = `Bearer ${adminToken}`;
      return api.request(config);
    }
    return Promise.reject(error);
  }
);

export default api;
