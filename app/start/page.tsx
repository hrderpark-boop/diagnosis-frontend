"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { RESTORE_KEY, type RestoreCandidate } from '@/lib/restoreCandidate';
import ParticipantHeader, { ParticipantMobileStep } from '@/components/participant/ParticipantHeader';
import ParticipantFooter from '@/components/participant/ParticipantFooter';
import './start.css';

interface Coach {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  character_tags: string[] | string;
}

interface ActiveSession { session_id: string; coach_id: string; coach_name: string }

// 코치 유형 한 단어·"이런 분께 추천" 문구·소개 문단(API 에 없음). 키는 코치 영문 이름 대문자.
// 매핑이 없는 코치는 유형·추천 줄을 숨기고, 소개는 API 의 description 으로 대신한다.
const COACH_PROFILE: Record<string, { type: string; fit: string; intro: string }> = {
  ELLA: { type: '경청형', fit: '말로 풀어내며 생각을 정리하는 편인 분', intro: '이야기를 끝까지 들으며 생각이 정리될 때까지 기다려 주는 코치입니다. 편안하게 말하다 보면 스스로 놓치고 있던 행동과 감정을 함께 찾아냅니다.' },
  JESSICA: { type: '분석형', fit: '근거와 숫자로 짚어 주길 원하는 분', intro: '말씀하신 사례를 근거와 숫자로 하나씩 짚어 보는 코치입니다. 무엇을 기준으로 판단했고 결과가 어땠는지 논리적으로 정리해 줍니다.' },
  OLIVIA: { type: '탐색형', fit: '익숙한 방식 바깥의 관점이 필요한 분', intro: '익숙한 방식에서 한 걸음 떨어져 다른 각도로 묻는 코치입니다. 당연하게 여기던 선택을 새롭게 보게 하며 숨은 가능성을 끌어냅니다.' },
  DANIEL: { type: '멘토형', fit: '경험 많은 선배의 조언을 원하는 분', intro: '현장 경험이 많은 선배처럼 차분하게 이끌어 주는 코치입니다. 비슷한 상황에서의 고민을 함께 짚으며 든든한 시각을 더해 줍니다.' },
  MICHAEL: { type: '추진형', fit: '밀어붙이는 에너지가 필요한 분', intro: '밝은 에너지로 대화를 힘 있게 이끄는 코치입니다. 망설이던 경험도 자신 있게 꺼낼 수 있도록 응원하며 실행 의지를 높여 줍니다.' },
  LUCAS: { type: '해결형', fit: '빠르게 핵심만 짚고 싶은 분', intro: '군더더기 없이 핵심만 묻는 코치입니다. 짧은 시간 안에 상황과 행동, 결과를 빠르게 정리하고 다음 단계로 넘어갑니다.' },
};

// FindME 리뉴얼 1B / SELECT COACH — 헤더(눈썹·제목·부제) + 3열 카드(번호·사진·
// 영문/한글 이름·태그·인용 설명·버튼).
//
// 재개·새로 시작 흐름(세 갈래, docs/session_state_transitions.md):
//   ① 같은 코치 선택 → 팝업 없이 곧바로 /chat(자가진단 건너뜀). 채팅 상단 한 줄 "이어서 진행합니다".
//   ② 다른 코치 선택 → 선택 팝업 [기존 코치와 이어하기] [새 코치로 새로 시작]. 닫기도 가능.
//   ③ 새로 시작 확인 팝업(배너 버튼·②의 새로 시작 모두 여기를 거침) → /abandon → 새 세션 → 자가진단.
//      되돌리기용으로 방금 보관한 세션을 sessionStorage 에 남긴다(자가진단 상단 배너, 첫 메시지 전까지).
export default function StartPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 진행 중 세션(재개 대상) — 코치 id 로 같은/다른 코치를 가른다.
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  // ② 다른 코치를 눌렀을 때의 선택 팝업 대상
  const [choiceCoach, setChoiceCoach] = useState<Coach | null>(null);
  // ③ 새로 시작 확인 팝업. pendingCoach 가 있으면 확인 뒤 그 코치로 곧장 새 세션.
  const [confirmNew, setConfirmNew] = useState(false);
  const [pendingCoach, setPendingCoach] = useState<Coach | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [freshStart, setFreshStart] = useState(false);
  // 헤더 표시용 참가자 이름(로그인 시 저장된 값을 읽기만 한다)
  const [participantName, setParticipantName] = useState('');
  useEffect(() => {
    setParticipantName(localStorage.getItem('participant_name') || '');
  }, []);

  // 백엔드 API 주소 (.env.local 의 NEXT_PUBLIC_API_URL 로 override 가능)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  // 진단 템플릿 ID: 템플릿 목록 라우터가 아직 마운트돼 있지 않아 동적 조회가 불가하므로
  // 시드된 유효 템플릿 ID 를 환경변수(NEXT_PUBLIC_DEFAULT_TEMPLATE_ID)로 관리한다.
  const TEMPLATE_ID = process.env.NEXT_PUBLIC_DEFAULT_TEMPLATE_ID || "10000000-0000-0000-0000-000000000008";

  // 🚨 [핵심 추가] 시작 화면 진입 시 무조건 과거 기억 완벽 삭제!
  //   (되돌리기 후보 RESTORE_KEY 는 자가진단 배너가 써야 하므로 남긴다)
  useEffect(() => {
    localStorage.removeItem('diagnosis_id');
    localStorage.removeItem('session_id');
    const keep = sessionStorage.getItem(RESTORE_KEY);
    sessionStorage.clear();
    if (keep) sessionStorage.setItem(RESTORE_KEY, keep);
  }, []);

  // 진행 중 세션이 있으면 미리 안내(코치를 새로 골라도 재개 시 원래 코치 유지).
  useEffect(() => {
    const pid = localStorage.getItem('participant_id');
    if (!pid) return;
    axios.get(`${API_BASE_URL}/diagnoses/active`, { params: { participant_id: pid } })
      .then((r) => {
        if (r.data?.has_active) {
          setActive({ session_id: r.data.session_id, coach_id: r.data.coach_id, coach_name: r.data.coach_name });
        }
      })
      .catch(() => {});
  }, []);

  // 코치 목록 불러오기
  useEffect(() => {
    axios.get(`${API_BASE_URL}/coaches`)
      .then(res => {
        setCoaches(res.data);
      })
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  const avatarOf = (coachId: string, fallback = '') =>
    coaches.find((c) => c.id === coachId)?.avatar_url || fallback;

  // /start 호출 — 재개(next_action==="resume")면 /chat 으로, 새 세션이면 자가진단으로.
  const startWith = async (coachId: string, coachName: string, coachAvatar: string) => {
    if (startingId) return;
    setStartingId(coachId);
    try {
      // 로그인 시 저장한 '실제' 사용자 ID 사용 (하드코딩 제거 → FK 위반 해결)
      const participantId = localStorage.getItem('participant_id');
      if (!participantId) {
        alert("로그인 정보가 없습니다. 다시 로그인해주세요.");
        router.push('/');
        return;
      }

      // 진단 시작 요청 (coach_persona_id 는 백엔드가 coach_id 로 직접 해석하므로 생략)
      const res = await axios.post(`${API_BASE_URL}/diagnoses/start`, {
        coach_id: coachId,
        participant_id: participantId,
        template_id: TEMPLATE_ID,
      });

      const diagnosisId = res.data.diagnosis_id || res.data.id;
      const sessionId = res.data.session_id;

      // 재개면 백엔드가 그 세션의 '원래 코치'를 돌려준다 — 프로필도 그 코치로.
      let effName = coachName;
      let effAvatar = coachAvatar;
      const isResume = res.data.next_action === "resume";
      if (isResume) {
        effName = res.data.coach_name || coachName;
        effAvatar = avatarOf(res.data.coach_id, coachAvatar);
      }

      const msgStr = res.data.coach_response_message;
      const finalMsg = (msgStr && msgStr.length > 5) ? msgStr : `안녕하세요. 오늘 진단을 함께할 ${effName.split('(')[0]} 코치입니다.`;

      const encodedMsg = encodeURIComponent(finalMsg);
      const encodedImg = encodeURIComponent(effAvatar);
      const chatQuery = `diagnosis_id=${diagnosisId}&session_id=${sessionId}&coach_name=${effName}&coach_img=${encodedImg}&initial_message=${encodedMsg}`;

      if (isResume) {
        // ① 팝업(alert) 없이 곧바로 채팅. 재개 표시는 채팅 상단 한 줄이 맡는다.
        router.push(`/chat?${chatQuery}&resumed=1`);
      } else {
        // 새 세션: 방금 보관한 세션이 있으면 되돌리기 후보에 새 세션 id 를 붙인다(자가진단 배너 조건).
        try {
          const raw = sessionStorage.getItem(RESTORE_KEY);
          if (raw) {
            const cand = JSON.parse(raw) as RestoreCandidate;
            if (!cand.new_session_id) {
              cand.new_session_id = sessionId;
              sessionStorage.setItem(RESTORE_KEY, JSON.stringify(cand));
            }
          }
        } catch { /* 후보가 깨져 있으면 배너만 안 뜬다 */ }
        router.push(`/assessment/self-eval?${chatQuery}`);
      }

    } catch (error) {
      console.error(error);
      alert("서버 연결에 실패했습니다.");
      setStartingId(null);
    }
  };

  // 카드 버튼: 진행 중 세션 유무와 코치 일치 여부로 세 갈래를 가른다.
  const handleSelectCoach = (coach: Coach) => {
    if (startingId) return;
    if (!active) { startWith(coach.id, coach.name, coach.avatar_url); return; }
    if (active.coach_id === coach.id) {
      // ① 같은 코치 → 팝업 없이 바로 이어하기
      startWith(coach.id, coach.name, coach.avatar_url);
      return;
    }
    // ② 다른 코치 → 선택 팝업
    setChoiceCoach(coach);
  };

  // ② "기존 코치와 이어하기" — 재개 세션의 코치로 /start(=resume) → /chat
  const continueWithActive = () => {
    if (!active) return;
    setChoiceCoach(null);
    startWith(active.coach_id, active.coach_name, avatarOf(active.coach_id));
  };

  // ③ 확인 후: /abandon → 되돌리기 후보 저장 → (pendingCoach 가 있으면) 새 세션 시작
  const handleAbandon = async () => {
    const pid = localStorage.getItem('participant_id');
    if (!pid) { setConfirmNew(false); return; }
    setAbandoning(true);
    try {
      const r = await axios.post(`${API_BASE_URL}/diagnoses/abandon`, { participant_id: pid });
      const first = r.data?.sessions?.[0];
      const cand: RestoreCandidate | null = first
        ? { session_id: first.session_id, coach_id: first.coach_id, coach_name: first.coach_name }
        : active ? { session_id: active.session_id, coach_id: active.coach_id, coach_name: active.coach_name } : null;
      if (cand) sessionStorage.setItem(RESTORE_KEY, JSON.stringify(cand));
      setActive(null);
      setConfirmNew(false);
      const next = pendingCoach;
      setPendingCoach(null);
      if (next) {
        await startWith(next.id, next.name, next.avatar_url);
      } else {
        setFreshStart(true);
      }
    } catch (e) {
      console.error(e);
      alert("기존 진단을 보관하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setAbandoning(false);
    }
  };

  const parseTags = (tags: string | string[]) => {
    const arr = Array.isArray(tags)
      ? tags
      : typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : [];
    return arr.map(t => t.replace(/^#/, '')).filter(Boolean);
  };

  // "Ella (엘라)" → { en: "ELLA", ko: "엘라" }
  const splitName = (name: string) => {
    const m = name.match(/^([^(]+)\(([^)]+)\)/);
    if (m) return { en: m[1].trim().toUpperCase(), ko: m[2].trim() };
    return { en: name.toUpperCase(), ko: name };
  };
  const shortName = (name: string) => name.split('(')[0].trim();

  const getCoachDescription = (desc: string) => {
    if (desc && desc.trim().length > 5 && desc !== 'string') return desc.replace(/\n/g, ' ');
    return '당신의 리더십 데이터를 분석하여 가장 개인화된 솔루션을 제공합니다.';
  };

  // 코치 사진 경로(기존 규칙 그대로: 파일명만 떼어 /images 아래에서 찾는다)
  const photoOf = (avatarUrl: string) => (avatarUrl ? `/images/${avatarUrl.split('/').pop()}` : "/images/default.png");

  return (
    <div className="fm-app">
      <ParticipantHeader
        step={3}
        right={
          <>
            {participantName && <span className="user">{participantName} 님</span>}
            {participantName && <span className="sep" />}
            <Link href="/">나가기</Link>
          </>
        }
      />

      <main className="fm-start-main fm-enter">
        <div className="fm-wrap">
          <ParticipantMobileStep step={3} />

          {/* 섹션 머리 */}
          <div className="fm-sec-head">
            <div className="fm-eyebrow">Choose your coach</div>
            <h1>함께할 코치를 선택하세요</h1>
            <p>6명 모두 같은 역량을 같은 기준으로 진단합니다. 질문하는 방식만 다릅니다.</p>
          </div>

          {active && (
            /* 재개 배너: '새로 시작' 은 ③ 확인 팝업으로 */
            <div className="fm-card fm-start-resume" role="status">
              <div className="fm-ph">
                <img
                  src={photoOf(avatarOf(active.coach_id))}
                  alt={`AI 코치 ${shortName(active.coach_name)}`}
                  onError={(e) => { e.currentTarget.src = "/images/default.png"; }}
                />
              </div>
              <p className="txt">
                <strong>{active.coach_name} 코치</strong>와 진행 중인 진단이 있습니다. 같은 코치를 고르면 바로 이어서 진행됩니다.
                다른 코치를 고르시면 이어할지 새로 시작할지 여쭙습니다.
              </p>
              <div className="acts">
                <button
                  type="button"
                  onClick={() => { setPendingCoach(null); setConfirmNew(true); }}
                  className="fm-btn sm secondary"
                >
                  새로 시작
                </button>
              </div>
            </div>
          )}
          {freshStart && !active && (
            <div className="fm-card fm-start-resume" role="status">
              <p className="txt">이전 진단은 보관되었습니다. 이제 함께할 코치를 선택하면 새 진단이 시작됩니다.</p>
            </div>
          )}

          {isLoading ? (
            <div className="fm-start-loading">
              <div className="fm-start-spin" />
              <p>코치 프로필을 불러오는 중입니다</p>
            </div>
          ) : (
            <div className="fm-start-grid">
              {coaches?.map((coach, idx) => {
                const { en, ko } = splitName(coach.name);
                const busy = startingId === coach.id;
                const isActiveCoach = active?.coach_id === coach.id;
                const profile = COACH_PROFILE[en];
                const tags = parseTags(coach.character_tags);
                // 선택 상태 테두리: 시작 중인 코치, 시작 전이면 진행 중 세션의 코치
                const selected = busy || (!startingId && isActiveCoach);
                return (
                  <article key={coach.id} className={`fm-card fm-coach-card${selected ? ' selected' : ''}`} style={{ '--i': idx } as React.CSSProperties}>
                    {isActiveCoach && <span className="fm-chip tint picked">진행 중</span>}
                    <div className="top">
                      <div className="fm-ph">
                        <img
                          src={photoOf(coach.avatar_url)}
                          alt={coach.name}
                          onError={(e) => { e.currentTarget.src = "/images/default.png"; }}
                        />
                      </div>
                      <div className="who">
                        <div className="en">{en}</div>
                        <div className="nm">
                          <b>{ko}</b>
                          {profile && <span className="fm-chip tint">{profile.type}</span>}
                        </div>
                      </div>
                    </div>
                    {profile && (
                      <div className="fit">
                        <div className="k">이런 분께 추천</div>
                        <div className="v">{profile.fit}</div>
                      </div>
                    )}
                    <p className="intro">{profile?.intro ?? getCoachDescription(coach.description)}</p>
                    {tags.length > 0 && (
                      <div className="traits">
                        {tags.map((t) => <span key={t} className="fm-chip">{t}</span>)}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectCoach(coach)}
                      disabled={!!startingId}
                      className={`fm-btn block go${isActiveCoach ? '' : ' secondary'}`}
                    >
                      {busy ? '시작 준비 중…' : isActiveCoach ? '이어서 진행하기' : '선택 후 시작하기'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <div className="fm-start-bottom" />
      </main>

      <ParticipantFooter />

      {/* ② 다른 코치 선택 팝업 */}
      {choiceCoach && active && (
        <div className="fm-overlay" role="dialog" aria-modal="true" aria-labelledby="choice-title">
          <div className="fm-modal fm-enter">
            <div className="fm-eyebrow">Continue or start over</div>
            <h2 id="choice-title">{shortName(active.coach_name)} 코치와 진행 중인 진단이 있습니다.</h2>
            <p>어떻게 하시겠어요?</p>
            <div className="actions">
              <button type="button" onClick={continueWithActive} className="fm-btn block">
                {shortName(active.coach_name)}와 이어하기
              </button>
              <button
                type="button"
                onClick={() => { setPendingCoach(choiceCoach); setChoiceCoach(null); setConfirmNew(true); }}
                className="fm-btn block secondary"
              >
                {shortName(choiceCoach.name)}로 새로 시작
              </button>
              <button type="button" onClick={() => setChoiceCoach(null)} className="fm-btn block ghost sm">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ③ '새로 시작' 확인 팝업 (실수 방지: 배너 버튼·②의 새로 시작 모두 여기를 거친다) */}
      {confirmNew && (
        <div className="fm-overlay" role="dialog" aria-modal="true" aria-labelledby="fresh-title">
          <div className="fm-modal fm-enter">
            <div className="fm-eyebrow">Start over</div>
            <h2 id="fresh-title">새로 시작하시겠습니까?</h2>
            <p>
              이전에 <b>{active ? shortName(active.coach_name) : '이전'}</b> 코치와 진행하던 진단이 있습니다.
              지금까지의 대화는 보관되지만, 새로 시작하면 처음부터 다시 진행합니다.
              {pendingCoach && <> 새 진단은 <b>{shortName(pendingCoach.name)}</b> 코치와 시작합니다.</>}
            </p>
            <div className="actions">
              <button type="button" onClick={handleAbandon} disabled={abandoning} className="fm-btn block">
                {abandoning ? '보관 중…' : '새로 시작'}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmNew(false); setPendingCoach(null); }}
                disabled={abandoning}
                className="fm-btn block secondary"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
