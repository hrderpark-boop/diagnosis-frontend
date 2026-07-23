/**
 * 역량 키 → 한글 표시명 매핑 (어드민 화면 공통).
 *
 * 백엔드는 저장·집계 전 구간에서 영문 키(organization_management 등)를 쓴다.
 * 표기가 바뀌어도 데이터가 깨지지 않도록 키는 영문으로 두고,
 * 화면에 보여줄 때만 이 맵을 거쳐 한글로 렌더링한다.
 */
export const COMPETENCY_LABELS: Record<string, string> = {
  organization_management: '조직 관리',
  performance_management: '성과 관리',
  people_management: '사람 관리',
  work_management: '일 관리',
  self_management: '자기 관리',
};

/** 화면 표시 순서 (리포트·차트 전반에서 동일하게 유지) */
export const COMPETENCY_ORDER = [
  'organization_management',
  'performance_management',
  'people_management',
  'work_management',
  'self_management',
];

/**
 * 역량 키를 한글명으로 변환한다.
 * 매핑에 없으면(구버전 리포트가 한글 키로 저장된 경우 등) 원본을 그대로 돌려준다.
 */
export const toKoreanCompetency = (key: string): string =>
  COMPETENCY_LABELS[key] || key;

/** 차트 축 등 좁은 영역용 축약명 ('조직 관리' → '조직') */
export const toShortCompetency = (key: string): string =>
  toKoreanCompetency(key).replace(/\s*관리$/, '');

/** 정의된 순서대로 정렬 (미정의 키는 뒤로) */
export const sortByCompetencyOrder = <T extends { competency: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const ia = COMPETENCY_ORDER.indexOf(a.competency);
    const ib = COMPETENCY_ORDER.indexOf(b.competency);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
