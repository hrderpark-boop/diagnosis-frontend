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
export function adminTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// (2026-11-06 P5) 관리자 '고객 화면 보기' 열람 토큰 — 세션 하나에 30분, 이 탭(sessionStorage)에만 둔다. 관리자 쿠키는 fm 으로 넘기지 않는다.
const VIEWER_KEY = 'fm_report_viewer';
export function getViewerToken(sessionId: string | null | undefined): string | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = sessionStorage.getItem(VIEWER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { sid: string; token: string; exp: number };
    if (v.sid !== sessionId || v.exp <= Date.now()) return null;
    return v.token;
  } catch { return null; }
}
export function setViewerToken(sessionId: string, token: string, expiresInSec: number) {
  try { sessionStorage.setItem(VIEWER_KEY, JSON.stringify({ sid: sessionId, token, exp: Date.now() + expiresInSec * 1000 })); } catch { /* 저장 불가 환경이면 그대로 진행 */ }
}
/** URL 조각(#vt=…)의 1회용 토큰을 세션 전용 열람 토큰으로 교환해 저장한다. 성공 여부를 돌려준다. */
export async function exchangeViewToken(sessionId: string, viewToken: string): Promise<boolean> {
  try {
    const { data } = await axios.post(`${baseURL}/reports/${sessionId}/view-session`, null, { headers: { Authorization: `Bearer ${viewToken}` } });
    if (data?.viewer_token) { setViewerToken(sessionId, data.viewer_token, Number(data.expires_in) || 1800); return true; }
  } catch { /* 만료·재사용 → 호출부가 안내 */ }
  return false;
}
const _viewerSessionFromUrl = (url: string | undefined): string | null => {
  const m = (url || '').match(/\/reports\/([0-9a-fA-F-]{36})(?:\/|$|\?)/);
  return m ? m[1] : null;
};

// 요청 인터셉터: 열람 토큰(그 세션의 /reports/* 요청)이 있으면 그것을, 아니면 저장된 참여자 토큰을 헤더에 자동 추가
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined' && !config.headers.Authorization) {
      const viewer = getViewerToken(_viewerSessionFromUrl(config.url));
      const token = viewer || localStorage.getItem('accessToken');
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
