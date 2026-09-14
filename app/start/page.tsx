"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { RESTORE_KEY, type RestoreCandidate } from '@/lib/restoreCandidate';

interface Coach {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  character_tags: string[] | string;
}

interface ActiveSession { session_id: string; coach_id: string; coach_name: string }

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

  return (
    <main className="fm-stage fm-rise min-h-screen text-white">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 lg:px-[88px] pt-14 md:pt-[72px] pb-16 md:pb-[88px]">

        {/* 헤더 */}
        <div className="flex flex-col gap-5 pb-10 border-b border-fm-line">
          <div className="fm-eyebrow text-xs text-fm-gold">Choose your coach</div>
          <h1 className="text-3xl md:text-[40px] font-light leading-[1.25] text-white">당신의 성장을 함께할 파트너를 선택하세요</h1>
          <p className="text-[15px] font-light leading-[1.8] text-fm-text">6명의 AI 코치가 리더십 데이터를 분석하고 맞춤형 솔루션을 제공합니다</p>
        </div>

        {active && (
          /* 재개 배너: 16px, 본문 밝게(#E8ECF1), 코치명 골드. '새로 시작' 은 ③ 확인 팝업으로 */
          <div className="mt-8 border-l-2 border-fm-gold bg-fm-panel/80 px-6 py-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <p className="flex-1 text-[16px] leading-[1.8] text-[#E8ECF1]">
              진행 중인 진단이 있습니다. <b className="font-bold text-fm-gold">{active.coach_name}</b> 코치를 다시 고르시면 바로 이어서 진행됩니다.
              다른 코치를 고르시면 이어할지 새로 시작할지 여쭙습니다.
              처음부터 다시 하시려면 <b className="text-white">새로 시작</b>을 눌러 주세요.
            </p>
            <button
              type="button"
              onClick={() => { setPendingCoach(null); setConfirmNew(true); }}
              className="shrink-0 h-11 px-5 rounded border border-fm-gold text-fm-gold text-sm font-bold hover:bg-fm-gold hover:text-black transition-colors"
            >
              새로 시작
            </button>
          </div>
        )}
        {freshStart && !active && (
          <div className="mt-8 border-l-2 border-fm-line bg-fm-panel/60 px-6 py-4 text-[15px] leading-[1.8] text-fm-text">
            이전 진단은 보관되었습니다. 이제 함께할 코치를 선택하면 새 진단이 시작됩니다.
          </div>
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border border-fm-line border-t-fm-gold rounded-full animate-spin" />
            <p className="text-sm text-fm-muted">코치 프로필을 불러오는 중입니다</p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coaches?.map((coach, idx) => {
              const { en, ko } = splitName(coach.name);
              const busy = startingId === coach.id;
              const isActiveCoach = active?.coach_id === coach.id;
              return (
                <div
                  key={coach.id}
                  className={`group bg-fm-panel border rounded p-7 flex flex-col gap-5 transition-colors hover:border-fm-gold/60 ${isActiveCoach ? 'border-fm-gold/60' : 'border-fm-line'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="fm-eyebrow text-[11px] text-fm-muted">{String(idx + 1).padStart(2, '0')}</div>
                    {isActiveCoach && <div className="fm-eyebrow text-[10px] text-fm-gold">진행 중</div>}
                  </div>

                  {/* 사진 96px → 154px(1.6배). hover 시 사진 확대 + 테두리 골드 */}
                  <div className="flex justify-center">
                    <div className="w-[154px] h-[154px] rounded-full overflow-hidden border border-fm-line group-hover:border-fm-gold transition-colors bg-[#171717]">
                      <img
                        src={coach.avatar_url ? `/images/${coach.avatar_url.split('/').pop()}` : "/images/default.png"}
                        alt={coach.name}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                        onError={(e) => { e.currentTarget.src = "/images/default.png"; }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="fm-eyebrow text-xs text-fm-gold">{en}</div>
                    <div className="text-xl font-bold text-white">{ko}</div>
                  </div>

                  <div className="text-center text-[13px] text-fm-muted">
                    {parseTags(coach.character_tags).join(' · ')}
                  </div>

                  <p className="border-l-2 border-fm-gold pl-3.5 text-sm font-light leading-[1.8] text-fm-text">
                    {getCoachDescription(coach.description)}
                  </p>

                  <button
                    onClick={() => handleSelectCoach(coach)}
                    disabled={!!startingId}
                    className="mt-auto h-[46px] rounded border border-fm-line text-white text-sm font-bold transition-colors hover:bg-white hover:text-black hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? '시작 준비 중…' : isActiveCoach ? '이어서 진행하기' : '선택 후 시작하기'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ② 다른 코치 선택 팝업 */}
      {choiceCoach && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="choice-title">
          <div className="w-full max-w-[460px] bg-fm-panel border border-fm-line rounded p-8 fm-rise">
            <div className="fm-eyebrow text-[11px] text-fm-gold">Continue or start over</div>
            <h2 id="choice-title" className="mt-3 text-xl font-bold text-white break-keep">
              {shortName(active.coach_name)} 코치와 진행 중인 진단이 있습니다.
            </h2>
            <p className="mt-3 text-[15px] leading-[1.8] text-fm-text">어떻게 하시겠어요?</p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={continueWithActive}
                className="h-12 px-5 rounded bg-white text-black text-sm font-bold hover:bg-fm-gold transition-colors"
              >
                {shortName(active.coach_name)}와 이어하기
              </button>
              <button
                type="button"
                onClick={() => { setPendingCoach(choiceCoach); setChoiceCoach(null); setConfirmNew(true); }}
                className="h-12 px-5 rounded border border-fm-gold text-fm-gold text-sm font-bold hover:bg-fm-gold hover:text-black transition-colors"
              >
                {shortName(choiceCoach.name)}로 새로 시작
              </button>
              <button
                type="button"
                onClick={() => setChoiceCoach(null)}
                className="h-10 text-sm text-fm-muted hover:text-white transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ③ '새로 시작' 확인 팝업 — 실수 방지(배너 버튼·②의 새로 시작 모두 여기를 거친다) */}
      {confirmNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="fresh-title">
          <div className="w-full max-w-[460px] bg-fm-panel border border-fm-line rounded p-8 fm-rise">
            <div className="fm-eyebrow text-[11px] text-fm-gold">Start over</div>
            <h2 id="fresh-title" className="mt-3 text-xl font-bold text-white">새로 시작하시겠습니까?</h2>
            <p className="mt-4 text-[15px] leading-[1.8] text-fm-text break-keep">
              이전에 <b className="text-white">{active ? shortName(active.coach_name) : '이전'}</b> 코치와 진행하던 진단이 있습니다.
              지금까지의 대화는 보관되지만, 새로 시작하면 처음부터 다시 진행합니다.
              {pendingCoach && <> 새 진단은 <b className="text-white">{shortName(pendingCoach.name)}</b> 코치와 시작합니다.</>}
            </p>
            <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => { setConfirmNew(false); setPendingCoach(null); }}
                disabled={abandoning}
                className="h-11 px-5 rounded border border-fm-line text-fm-text text-sm font-bold hover:text-white hover:border-white/40 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAbandon}
                disabled={abandoning}
                className="h-11 px-5 rounded border border-fm-gold text-fm-gold text-sm font-bold hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50"
              >
                {abandoning ? '보관 중…' : '새로 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
