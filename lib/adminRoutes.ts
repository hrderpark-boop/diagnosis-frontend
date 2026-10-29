/**
 * 관리자 화면 경로 규칙.
 *
 *  - 고객사 HR(client_admin) : /admin/*   (고객사에 따로 배포하는 주소)
 *  - 마스터(super_admin)      : /master/*  (운영사 전용 주소)
 *
 * 참여자·리포트·설정 화면은 두 콘솔이 같은 컴포넌트를 쓰므로, 화면 안의 링크는
 * 이 함수로 현재 콘솔의 접두어를 붙인다.
 */
import type { AdminRole } from './adminApi';

export const HR_BASE = '/admin';
export const MASTER_BASE = '/master';

export const baseForRole = (role: AdminRole | string | null | undefined) =>
  role === 'super_admin' ? MASTER_BASE : HR_BASE;

export const loginPathForRole = (role: AdminRole | string | null | undefined) =>
  `${baseForRole(role)}/login`;

/** 지금 보고 있는 콘솔의 접두어. 서버 렌더링 중에는 HR 로 가정한다. */
export const currentBase = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith(MASTER_BASE) ? MASTER_BASE : HR_BASE;

/** 현재 콘솔 기준 경로. 예) adminPath('/reports/abc') → /master/reports/abc */
export const adminPath = (path: string) => `${currentBase()}${path.startsWith('/') ? path : `/${path}`}`;
