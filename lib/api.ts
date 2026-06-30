import axios from 'axios';

// 환경 변수가 없으면 로컬 기본값 사용
const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: 저장된 토큰이 있으면 헤더에 자동 추가
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
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

export default api;