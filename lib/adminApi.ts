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
/** (2026-10-29) 마스터 '고객사로 들어가기': 대리 중인 고객사 id·이름(쿠키). /admin 화면에서만 헤더로 보낸다 */
export const ACT_COMPANY_KEY = 'fm_act_company';
export const ACT_COMPANY_NAME_KEY = 'fm_act_company_name';

export type AdminRole = 'super_admin' | 'client_admin';

export interface AdminProfile {
  admin_id: string;
  name: string | null;
  email: string;
  role: AdminRole;
  company_id: string | null;
  company_name: string | null;
  /** (2026-10-29) 마스터가 고객사로 들어간 상태. company_* 는 그 고객사 */
  acting?: boolean;
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
  // 마스터가 고객사로 들어간 상태: /admin(HR) 화면에서 보내는 요청만 그 고객사 범위로(백엔드는 super_admin 일 때만 따름)
  const act = getCookie(ACT_COMPANY_KEY);
  if (act && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    config.headers['X-Act-As-Company'] = act;
  }
  return config;
});

// 토큰 만료/무효 시 로그인 화면으로 강제 이동
adminApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      clearAdminSession();
      // 지금 보고 있는 콘솔(/admin 또는 /master)의 로그인 화면으로
      const login = window.location.pathname.startsWith('/master') ? '/master/login' : '/admin/login';
      if (window.location.pathname !== login) {
        window.location.href = login;
      }
    }
    return Promise.reject(error);
  }
);

export const clearAdminSession = () => {
  deleteCookie(ADMIN_TOKEN_KEY);
  deleteCookie(ADMIN_ROLE_KEY);
  deleteCookie(ACT_COMPANY_KEY);
  deleteCookie(ACT_COMPANY_NAME_KEY);
};

/** 마스터 → 고객사 HR 화면으로 들어가기(그 고객사 범위로 보고 고친다). 이동은 호출한 쪽에서 /admin/dashboard 로 */
export const startActing = (companyId: string, companyName: string) => {
  setCookie(ACT_COMPANY_KEY, companyId);
  setCookie(ACT_COMPANY_NAME_KEY, companyName);
};
export const stopActing = () => {
  deleteCookie(ACT_COMPANY_KEY);
  deleteCookie(ACT_COMPANY_NAME_KEY);
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

/**
 * 본인 비밀번호 변경. 대상 계정은 서버가 JWT 로 판별하므로 여기서 보내지 않는다.
 */
export const changeMyPassword = async (payload: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}) => {
  const { data } = await adminApi.patch('/admin/users/me/password', payload);
  return data;
};

export const fetchParticipants = async (params: {
  search?: string;
  page?: number;
  page_size?: number;
  company_id?: string;
  org_unit_id?: string;
  /** 진행 상태: completed · in_progress · abandoned · not_started · incomplete(완료 외 전부) */
  status?: ParticipantStatusFilter;
  /** 정렬: recent(기본) · org(조직 코드순) · name */
  sort?: 'recent' | 'org' | 'name';
}): Promise<Paginated> => {
  const { data } = await adminApi.get('/admin/participants', { params });
  return data;
};

/** 4(b) 관리자 복원: 보관(abandoned) 세션 → in_progress. 현재 진행 중 세션은 abandoned 로 */
// (2026-10-23 파일럿 전 2) 관리자 재분석 — super_admin 전용. 실패 마커 초기화 + analyze 동기 실행(수 분 걸릴 수 있음).
export const reanalyzeSession = async (sessionId: string) => {
  const { data } = await adminApi.post(`/admin/sessions/${sessionId}/reanalyze`);
  return data as { reset: { prev_status: string | null; prev_fail_count: number }; analysis: { status?: string; report_id?: string; skipped?: string } };
};

export const restoreSession = async (sessionId: string) => {
  const { data } = await adminApi.post(`/admin/sessions/${sessionId}/restore`);
  return data as { restored: boolean; already_in_progress: boolean; abandoned_others: number; coach_name: string };
};

export interface BulkDeleteResult {
  deleted_participants: number;
  deleted_sessions: number;
  deleted_messages: number;
  deleted_events: number;
  deleted_reports: number;
  skipped_protected: number;
  skipped_out_of_scope: number;
}

/** 선택한 대상자들을 연관 데이터(세션·대화·리포트)와 함께 물리 삭제 */
export const bulkDeleteParticipants = async (
  participantIds: string[],
): Promise<BulkDeleteResult> => {
  const { data } = await adminApi.post('/admin/participants/bulk-delete', {
    participant_ids: participantIds,
  });
  return data;
};

export interface TranscriptMessage {
  role: string;        // "user"(대상자) | "model"(코치)
  content: string;
  chapter: string | null;
  created_at: string | null;
}

export interface SessionTranscript {
  session_id: string;
  user_name: string;
  status: string;
  current_topic: string | null;
  messages: TranscriptMessage[];
}

/** 세션 전체 대화 원문 (대화 모달 뷰어용) */
export const fetchTranscript = async (sessionId: string): Promise<SessionTranscript> => {
  const { data } = await adminApi.get(`/admin/sessions/${sessionId}/transcript`);
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

// ---------------------------------------------------------------------------
// Human-in-the-Loop: 리포트 교정
// ---------------------------------------------------------------------------
export interface ReportDetail {
  id: string;
  session_id: string;
  user_name: string;
  user_email: string | null;
  company_name: string | null;
  total_score: number;
  summary: string;
  radar_chart: Record<string, number>;
  details: Record<string, any>;
  top_keywords: any[];
  blind_spot: string | null;
  idp: string[];
  created_at: string | null;
  is_human_edited: boolean;
  edited_at: string | null;
  edited_by: string | null;
  has_ai_original: boolean;
  /** 대상자가 진단 시작 전 직접 입력한 자가진단 (미제출 시 null) */
  self_assessment: {
    scores: Record<string, number>;
    strength_weakness_text: string | null;
    self_average: number;
    submitted_at: string;
  } | null;
}

export interface ReportEditPayload {
  summary?: string;
  blind_spot?: string;
  details?: Record<string, {
    comment?: string;
    strength_point?: string;
    growth_point?: string;
    gap_analysis?: string;
    reasoning_process?: Record<string, { description?: string }>;
  }>;
}

export const fetchReportDetail = async (reportId: string): Promise<ReportDetail> => {
  const { data } = await adminApi.get(`/admin/reports/${reportId}`);
  return data;
};

/** 교정 전 AI 원본 스냅샷 (교정 이력이 있는 리포트만 존재) */
export const fetchAiOriginal = async (reportId: string) => {
  const { data } = await adminApi.get(`/admin/reports/${reportId}/ai-original`);
  return data;
};

/** 관리자 교정 저장. 변경된 필드만 보내는 부분 갱신 방식. */
export const updateReport = async (reportId: string, payload: ReportEditPayload) => {
  const { data } = await adminApi.put(`/reports/${reportId}`, payload);
  return data;
};

export const fetchOverview = async (companyId?: string) => {
  const { data } = await adminApi.get('/admin/stats/overview', {
    params: companyId ? { company_id: companyId } : {},
  });
  return data;
};

export type ParticipantStatusFilter = 'completed' | 'in_progress' | 'abandoned' | 'not_started' | 'incomplete';
export type ProgressStatus = 'completed' | 'in_progress' | 'abandoned' | 'not_started';

/** (2026-10-29) 진단 기간 내 일별 추이(누적완료 포함). start·end 는 YYYY-MM-DD */
export const fetchDailyStatsRange = async (start: string, end: string, companyId?: string) => {
  const { data } = await adminApi.get('/admin/stats/daily', { params: { start, end, company_id: companyId } });
  return data as { date: string; name: string; 진단참여: number; 진단완료: number; 누적완료: number }[];
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

export const createCompany = async (payload: {
  name: string;
  code: string;
  contact_email?: string | null;
  /** (2026-10-15) 고객사별 LLM provider. null = 환경변수 기본값(gemini). */
  llm_provider?: 'gemini' | 'claude' | null;
}) => {
  const { data } = await adminApi.post('/admin/companies', payload);
  return data;
};

export interface IssuedAdmin {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  company_id: string | null;
  company_name: string | null;
  /** 서버가 자동 생성한 임시 비밀번호. 이 응답에서만 확인 가능하다. */
  generated_password: string | null;
}

/**
 * HR 담당자(Client Admin) 계정 발급.
 * password 를 넘기지 않으면 서버가 안전한 임시 비밀번호를 생성해 1회 반환한다.
 */
export const createAdminUser = async (payload: {
  email: string;
  company_id: string;
  name?: string;
  password?: string;
  role?: AdminRole;
}): Promise<IssuedAdmin> => {
  const { data } = await adminApi.post('/admin/users', {
    role: 'client_admin',
    ...payload,
  });
  return data;
};

export const fetchAdminUsers = async (companyId?: string) => {
  const { data } = await adminApi.get('/admin/users', {
    params: companyId ? { company_id: companyId } : {},
  });
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


// (2026-09-22) 운영 알림 — Gemini 크레딧 소진(402) 등. AdminLayout 상단 배너가 읽는다.
export interface AdminAlerts {
  gemini_credit_depleted: boolean;
  credit_depleted_at: string | null;
  last_llm_error_at: string | null;
  last_llm_error: string | null;
  // (2026-09-29) 5xx·합성 쓰기 점검
  errors_5xx_last_hour?: number;
  errors_5xx_alert?: boolean;
  errors_5xx_threshold?: number;
  recent_5xx?: { at: string; path: string; status: number; error_id: string | null }[];
  synthetic_check?: { last_run_at: string | null; ok: boolean | null; error: string | null; elapsed_ms: number | null };
  // (2026-10-16) Claude API 키 존재 여부(값 없음) · 서버 기본 provider. 구 백엔드에서는 undefined.
  anthropic_key_configured?: boolean;
  llm_provider_default?: string;
}
export const fetchAlerts = async (): Promise<AdminAlerts> => {
  const res = await adminApi.get('/admin/alerts');
  return res.data;
};

// ---------------------------------------------------------------------------
// (2026-10-29) 조직 참여 코드(AS1) — 마스터가 등록, HR 은 자사 조회만
// ---------------------------------------------------------------------------
export interface OrgTeam {
  id: string;
  parent_id: string | null;
  level: 'team';
  name: string;
  short_code: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  registered: number;
  completed: number;
}
export interface OrgOffice extends Omit<OrgTeam, 'level'> {
  level: 'office';
  teams: OrgTeam[];
  registered_total: number;
  completed_total: number;
}
export interface OrgDivision extends Omit<OrgTeam, 'level'> {
  level: 'division';
  /** 실(선택 단계)과 그 아래 팀 */
  offices: OrgOffice[];
  /** 본부 직속 팀(실 없이) */
  teams: OrgTeam[];
  registered_total: number;
  completed_total: number;
}
export interface OrgTree {
  company: { id: string; name: string; code: string; org_prefix: string | null };
  divisions: OrgDivision[];
  unassigned: { registered: number; completed: number };
}

export const fetchOrgUnits = async (companyId: string): Promise<OrgTree> => {
  const { data } = await adminApi.get(`/admin/companies/${companyId}/org-units`);
  return data;
};

export const updateCompany = async (companyId: string, payload: {
  name?: string; contact_email?: string; is_active?: boolean; org_prefix?: string;
}) => {
  const { data } = await adminApi.patch(`/admin/companies/${companyId}`, payload);
  return data;
};

export const createOrgUnit = async (companyId: string, payload: {
  level: 'division' | 'office' | 'team'; name: string; short_code?: string; parent_id?: string; number?: number;
}) => {
  const { data } = await adminApi.post(`/admin/companies/${companyId}/org-units`, payload);
  return data as { id: string; code: string; name: string; level: string; parent_id: string | null };
};

/** 엑셀 붙여넣기 일괄 등록. 행 = 본부, 본부 코드, 실(선택), 실 코드(선택), 팀(선택). 한 행이라도 틀리면 전부 되돌린다. */
export const bulkCreateOrgUnits = async (companyId: string, rows: { division: string; division_code: string; office?: string; office_code?: string; team?: string }[]) => {
  const { data } = await adminApi.post(`/admin/companies/${companyId}/org-units/bulk`, { rows });
  return data as { prefix: string; created: { code: string; name: string; level: string }[]; skipped: number };
};

export const updateOrgUnit = async (unitId: string, payload: { name?: string; is_active?: boolean; sort_order?: number }) => {
  const { data } = await adminApi.patch(`/admin/org-units/${unitId}`, payload);
  return data;
};

export const deleteOrgUnit = async (unitId: string) => {
  const { data } = await adminApi.delete(`/admin/org-units/${unitId}`);
  return data;
};

// ---------------------------------------------------------------------------
// (2026-10-29) HR 결과 → 교육: 교육 체계도·개인별 추천 과정
// ---------------------------------------------------------------------------
export interface EducationCourseRow {
  category: string;
  track: string;
  course: string;
  track_format: string | null;
  vod_url: string | null;
  growth: number;
  strength: number;
  total: number;
  cohort: boolean;
}
export interface EducationSummary {
  competencies: { key: string; name: string }[];
  participants: number;
  completed: number;
  strength: { key: string; name: string; count: number }[];
  growth: { key: string; name: string; count: number }[];
  courses: EducationCourseRow[];
  cohort_min: number;
  divisions: { id: string | null; name: string; code: string | null; n: number; averages: Record<string, number | null> }[];
}
export const fetchEducationSummary = async (params: { company_id?: string; org_unit_id?: string } = {}): Promise<EducationSummary> => {
  const { data } = await adminApi.get('/admin/education/summary', { params });
  return data;
};

export interface EducationPerson {
  id: string;
  name: string;
  email: string;
  org_code: string | null;
  org_name: string | null;
  division_name: string | null;
  completed: boolean;
  report_id: string | null;
  total_score: number | null;
  strength: string | null;
  growth: string | null;
  courses: { track: string | null; course: string; category: string | null; kind: 'growth' | 'strength'; vod_url: string | null }[];
}
export const fetchEducationPeople = async (params: {
  company_id?: string; org_unit_id?: string; search?: string; status?: 'completed' | 'not_completed'; course?: string;
  page?: number; page_size?: number;
}): Promise<Paginated<EducationPerson>> => {
  const { data } = await adminApi.get('/admin/education/people', { params });
  return data;
};


// ---------------------------------------------------------------------------
// (2026-10-29) 진단 기간 · 조직별 진행/평균 · 과정 안내서
// ---------------------------------------------------------------------------
export interface DiagnosisPeriod { company_id: string; diagnosis_start: string | null; diagnosis_end: string | null }

export const fetchPeriod = async (companyId: string): Promise<DiagnosisPeriod> => {
  const { data } = await adminApi.get(`/admin/companies/${companyId}/period`);
  return data;
};
/** 시작·종료일을 함께 정하거나(둘 다) 함께 지운다(둘 다 null). HR 은 자사만. */
export const savePeriod = async (companyId: string, start: string | null, end: string | null): Promise<DiagnosisPeriod> => {
  const { data } = await adminApi.put(`/admin/companies/${companyId}/period`, { diagnosis_start: start, diagnosis_end: end });
  return data;
};

export type OrgLevel = 'division' | 'office' | 'team';
export interface OrgStatRow {
  id: string | null;
  code: string | null;
  name: string;
  path: string;
  level: string;
  is_active?: boolean;
  registered: number;
  completed: number;
  in_progress: number;
  abandoned: number;
  not_started: number;
  completion_rate: number;
  n_reports: number;
  total_average: number | null;
  averages: Record<string, number | null>;
}
export interface OrgStats {
  level: OrgLevel;
  competencies: { key: string; name: string }[];
  total: OrgStatRow;
  unassigned: OrgStatRow;
  rows: OrgStatRow[];
}
export const fetchOrgStats = async (companyId: string, level: OrgLevel): Promise<OrgStats> => {
  const { data } = await adminApi.get(`/admin/companies/${companyId}/org-stats`, { params: { level } });
  return data;
};

export interface CatalogCourse {
  course: string;
  goal: string;
  vod_url: string | null;
  growth: number;
  strength: number;
  total: number;
  cohort: boolean;
}
export interface EducationCatalog {
  tracks: { track: string; from_level: number | null; to_level: number | string | null; format: string; format_desc: string }[];
  competencies: { key: string; name: string; subs: { name: string; courses: Record<string, CatalogCourse> }[] }[];
  completed: number;
  cohort_min: number;
}
/** 전체 과정 카탈로그(역량 → 하위역량 × 트랙 A~D) + 범위 안 추천 인원 */
export const fetchEducationCatalog = async (params: { company_id?: string; org_unit_id?: string } = {}): Promise<EducationCatalog> => {
  const { data } = await adminApi.get('/admin/education/catalog', { params });
  return data;
};

/** (2026-10-29) 고객사 전달용 참여 코드 엑셀(배포용 시트 + 전체 코드 시트). 마스터는 모든 고객사, HR 은 자사만 */
export const downloadOrgCodesExcel = async (companyId: string) => {
  const res = await adminApi.get(`/admin/companies/${companyId}/org-codes/export`, { responseType: 'blob' });
  const cd: string = res.headers['content-disposition'] || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = m ? decodeURIComponent(m[1]) : `참여코드_${new Date().toISOString().split('T')[0]}.xlsx`;
  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};


// ---------------------------------------------------------------------------
// (2026-10-29) 마스터 고객사별 현황 · 참여자 명단 업로드 · 개인 참여 코드
// ---------------------------------------------------------------------------
export interface CompanyOverviewRow {
  id: string; name: string; code: string; org_prefix: string | null; is_active: boolean;
  diagnosis_start: string | null; diagnosis_end: string | null;
  registered: number; roster: number;
  completed: number; in_progress: number; abandoned: number; not_started: number;
  completion_rate: number; report_missing: number; last_activity: string | null;
  hr_accounts: number; org_unit_count: number;
}
export const fetchCompaniesOverview = async (): Promise<CompanyOverviewRow[]> => {
  const { data } = await adminApi.get('/admin/companies/overview');
  return data.companies;
};

export interface RosterResult {
  dry_run: boolean;
  saved: boolean;
  rows: number;
  new: number;
  updated: number;
  org_units_created: { code: string; name: string; level: string }[];
  errors: { row: number; reason: string }[];
  preview: { row: number; name: string; email: string; action: string; org_code: string | null; org_path: string }[];
}
/** 명단 엑셀(이름·이메일·본부·실·팀) 업로드. dryRun=true 면 저장 없이 미리보기 */
export const importRoster = async (companyId: string, file: File, dryRun: boolean): Promise<RosterResult> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await adminApi.post(`/admin/companies/${companyId}/roster`, form, {
    params: { dry_run: dryRun },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

const saveBlob = (data: BlobPart, cd: string, fallback: string) => {
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = m ? decodeURIComponent(m[1]) : fallback;
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
/** 참여자별 개인 참여 코드 엑셀(고객사 전달용) */
export const downloadRosterExcel = async (companyId: string) => {
  const res = await adminApi.get(`/admin/companies/${companyId}/roster/export`, { responseType: 'blob' });
  saveBlob(res.data, res.headers['content-disposition'] || '', '개인참여코드.xlsx');
};
/** 명단 양식 */
export const downloadRosterTemplate = async () => {
  const res = await adminApi.get('/admin/roster/template', { responseType: 'blob' });
  saveBlob(res.data, res.headers['content-disposition'] || '', '참여자_명단_양식.xlsx');
};
