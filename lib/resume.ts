/**
 * (2026-11-02 P2-B) 재접속·재개 공용 헬퍼.
 *  - 코치 사진은 항상 Vercel 의 /images/<파일명> 을 쓴다(백엔드 avatar_url 은 Render 정적 경로라 인스턴스가 잠들어 있으면
 *    첫 요청이 수십 초 걸린다).
 *  - 로그인 직후 진입 분기: 진행 중 세션이 있고 자가진단까지 끝났으면 채팅으로 직행, 자가진단 전이면 코치 선택으로(소개 생략),
 *    진행 중이 없고 완주 세션이 있으면 리포트, 그 외 소개.
 */
import apiClient from '@/lib/api';

export const COACH_IMAGE_FILES: Record<string, string> = {
  ella: 'female1.png', jessica: 'female2.png', olivia: 'female3.png',
  daniel: 'male1.png', michael: 'male2.png', lucas: 'male3.png',
};
export const COACH_IMAGE_PATHS = Object.values(COACH_IMAGE_FILES).map((f) => `/images/${f}`);

/** 백엔드 avatar_url(…/coaches/female2.png) → /images/female2.png. 코치 이름으로도 찾는다. */
export const localCoachImage = (avatarUrl?: string | null, coachName?: string | null): string => {
  const file = (avatarUrl || '').split('/').pop();
  if (file && /\.(png|jpg|jpeg|webp)$/i.test(file)) return `/images/${file}`;
  const key = (coachName || '').split('(')[0].trim().toLowerCase();
  return COACH_IMAGE_FILES[key] ? `/images/${COACH_IMAGE_FILES[key]}` : '/images/default.png';
};

/** 코치 사진 6장을 미리 받아 둔다(코치 선택·채팅 진입 시 깜빡임 방지). 실패는 무시. */
export const preloadCoachImages = () => {
  if (typeof window === 'undefined') return;
  COACH_IMAGE_PATHS.forEach((src) => { const im = new Image(); im.src = src; });
};

export const buildChatQuery = (p: { diagnosisId: string; sessionId: string; coachName: string; coachImg: string; message: string }) =>
  `diagnosis_id=${p.diagnosisId}&session_id=${p.sessionId}&coach_name=${encodeURIComponent(p.coachName)}` +
  `&coach_img=${encodeURIComponent(p.coachImg)}&initial_message=${encodeURIComponent(p.message)}`;

export type EntryDecision =
  | { kind: 'chat'; query: string }
  | { kind: 'select-coach' }
  | { kind: 'report'; sessionId: string }
  | { kind: 'intro' };

/**
 * 로그인 직후 어디로 갈지 정한다. 네트워크 실패는 'intro'(기존 흐름)로 떨어진다.
 * 채팅 직행은 /diagnoses/start(=resume) 로 세션을 열어 첫 메시지·코치 이름을 받아 온다.
 */
export const decideEntryAfterLogin = async (participantId: string, templateId: string): Promise<EntryDecision> => {
  try {
    const act = await apiClient.get('/diagnoses/active', { params: { participant_id: participantId } });
    if (act.data?.has_active) {
      const sid: string = act.data.session_id;
      let submitted = false;
      try {
        const se = await apiClient.get(`/sessions/${sid}/self-eval`);
        submitted = !!se.data?.submitted;
      } catch { submitted = false; }
      if (!submitted) return { kind: 'select-coach' };
      // 자가진단 완료 → 같은 코치로 재개(resume) → 채팅
      const st = await apiClient.post('/diagnoses/start', {
        coach_id: act.data.coach_id, participant_id: participantId, template_id: templateId,
      });
      const coachName: string = st.data.coach_name || act.data.coach_name || '';
      const msg: string = st.data.coach_response_message || `안녕하세요. 오늘 진단을 함께할 ${coachName.split('(')[0]} 코치입니다.`;
      return {
        kind: 'chat',
        query: buildChatQuery({
          diagnosisId: st.data.diagnosis_id || st.data.id || st.data.session_id,
          sessionId: st.data.session_id || sid,
          coachName, coachImg: localCoachImage(null, coachName), message: msg,
        }) + '&resumed=1',
      };
    }
    const done = act.data?.completed;
    if (done?.session_id) return { kind: 'report', sessionId: done.session_id };
    return { kind: 'intro' };
  } catch {
    return { kind: 'intro' };
  }
};
