/**
 * 4(a) 즉시 되돌리기 — '새로 시작' 으로 방금 보관(abandoned)한 세션을 기억해 두는 곳.
 *
 * 코치 선택(/start)에서 /abandon 직후 저장하고, 새 세션이 만들어지면 new_session_id 를 붙인다.
 * 자가진단 화면은 new_session_id 가 현재 세션과 같을 때만 "[이전 진단으로 돌아가기]" 배너를
 * 띄우고, 채팅에서 첫 메시지를 보내면 지운다(새 세션이 실질적으로 시작됨).
 * sessionStorage 라 탭을 닫으면 사라진다 — 그 뒤의 복원은 관리자 [복원] 버튼(4-b)으로만.
 */
export const RESTORE_KEY = 'fm_restore_candidate';

export interface RestoreCandidate {
  session_id: string;      // 보관된(abandoned) 이전 세션
  coach_id: string;
  coach_name: string;
  new_session_id?: string; // 새로 시작으로 만들어진 세션 — 이 세션에서만 되돌리기 배너
}

export const readRestoreCandidate = (): RestoreCandidate | null => {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    return raw ? (JSON.parse(raw) as RestoreCandidate) : null;
  } catch {
    return null;
  }
};

export const clearRestoreCandidate = () => {
  try { sessionStorage.removeItem(RESTORE_KEY); } catch { /* noop */ }
};
