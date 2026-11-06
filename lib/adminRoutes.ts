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

/**
 * (2026-10-29) 공식 주소. 참여자 · 고객사 HR · 마스터를 도메인으로 나눈다.
 *  - 참여자: fm.connectn.co.kr
 *  - 고객사 HR: fm-hr.connectn.co.kr  (들어오면 /admin 만 열림)
 *  - 마스터: fm-ops.connectn.co.kr   (들어오면 /master 만 열림, 고객사로 들어가기 중에는 /admin 도)
 * 안내 메일·엑셀에 들어가는 주소도 여기서 가져온다.
 */
export const PARTICIPANT_URL = 'https://fm.connectn.co.kr';
export const HR_URL = 'https://fm-hr.connectn.co.kr';
export const OPS_URL = 'https://fm-ops.connectn.co.kr';
export const HR_HOST = 'fm-hr.connectn.co.kr';
export const OPS_HOST = 'fm-ops.connectn.co.kr';

/** (2026-11-06) 공식 도메인(fm·fm-hr·fm-ops.connectn.co.kr)에서만 true. 로컬·Vercel 미리보기는 false. */
export const onOfficialHost = () =>
  typeof window !== 'undefined' && window.location.hostname.toLowerCase().endsWith('connectn.co.kr');

/** 관리자 쿠키(admin_token 등)를 세 도메인이 함께 읽도록 하는 Domain 속성. '고객 화면 보기' 새 탭(fm)에서 관리자 토큰 재시도가 되려면 필요하다. */
export const ADMIN_COOKIE_DOMAIN = '.connectn.co.kr';

/**
 * '고객 화면 보기' 링크. 관리자 도메인(fm-hr·fm-ops)에서 상대 경로 /report 를 열면 미들웨어가 콘솔 홈(/admin·/master)으로 돌려보낸다
 * (2026-11-06 버그: 마스터 대리 보기에서 fm-ops.connectn.co.kr/master/dashboard 로 이동). 공식 도메인에서는 참여자 도메인 절대 주소로 연다.
 */
export const participantReportUrl = (sessionId: string) =>
  `${onOfficialHost() ? PARTICIPANT_URL : ''}/report?session_id=${encodeURIComponent(sessionId)}`;
