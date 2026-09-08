"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Coach {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  character_tags: string[] | string;
}

// FindME 리뉴얼 1B / SELECT COACH — 헤더(눈썹·제목·부제) + 3열 카드(번호·사진·
// 영문/한글 이름·태그·인용 설명·버튼). 선택/재개 로직은 기존 그대로.
export default function StartPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 진행 중 세션 사전 안내(재개 시 원래 코치로 이어짐을 미리 고지).
  const [activeCoachName, setActiveCoachName] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  // 백엔드 API 주소 (.env.local 의 NEXT_PUBLIC_API_URL 로 override 가능)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

  // 진단 템플릿 ID: 템플릿 목록 라우터가 아직 마운트돼 있지 않아 동적 조회가 불가하므로
  // 시드된 유효 템플릿 ID 를 환경변수(NEXT_PUBLIC_DEFAULT_TEMPLATE_ID)로 관리한다.
  const TEMPLATE_ID = process.env.NEXT_PUBLIC_DEFAULT_TEMPLATE_ID || "10000000-0000-0000-0000-000000000008";

  // 🚨 [핵심 추가] 시작 화면 진입 시 무조건 과거 기억 완벽 삭제!
  useEffect(() => {
    localStorage.removeItem('diagnosis_id');
    localStorage.removeItem('session_id');
    sessionStorage.clear();
  }, []);

  // 진행 중 세션이 있으면 미리 안내(코치를 새로 골라도 재개 시 원래 코치 유지).
  useEffect(() => {
    const pid = localStorage.getItem('participant_id');
    if (!pid) return;
    axios.get(`${API_BASE_URL}/diagnoses/active`, { params: { participant_id: pid } })
      .then((r) => { if (r.data?.has_active) setActiveCoachName(r.data.coach_name); })
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

  const handleSelectCoach = async (coachId: string, coachName: string, coachAvatar: string) => {
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

      // 🐛 fix: 진행 중 세션이 있으면 백엔드가 그 세션을 '재개'하고 원래 코치를
      //   유지한다. 이때 화면은 방금 클릭한 코치가 아니라 '재개 세션의 코치'를
      //   보여줘야 혼란이 없다. next_action==="resume" 이면 응답의 coach_id/
      //   coach_name 으로 프로필(이름·아바타)을 덮어쓰고, 이어하기 안내를 띄운다.
      let effName = coachName;
      let effAvatar = coachAvatar;
      const isResume = res.data.next_action === "resume";
      if (isResume) {
        const rId = res.data.coach_id;
        effName = res.data.coach_name || coachName;
        const rCoach = coaches.find((c) => c.id === rId);
        if (rCoach) effAvatar = rCoach.avatar_url;
        alert(`이전에 ${effName} 코치와 진행하던 진단이 있어 이어서 시작합니다.`);
      }

      const msgStr = res.data.coach_response_message;
      const finalMsg = (msgStr && msgStr.length > 5) ? msgStr : `안녕하세요. 오늘 진단을 함께할 ${effName.split('(')[0]} 코치입니다.`;

      const encodedMsg = encodeURIComponent(finalMsg);
      const encodedImg = encodeURIComponent(effAvatar);
      const chatQuery = `diagnosis_id=${diagnosisId}&session_id=${sessionId}&coach_name=${effName}&coach_img=${encodedImg}&initial_message=${encodedMsg}`;

      // 🐛 fix: 재개 세션은 자가진단을 이미 마쳤다. 다시 self-eval 을 거치면
      //   이미 완료한 설문을 반복하게 되므로, 재개면 /chat 으로 직행한다.
      //   신규 세션만 자가진단 단계를 거친다.
      if (isResume) {
        router.push(`/chat?${chatQuery}`);
      } else {
        router.push(`/assessment/self-eval?${chatQuery}`);
      }

    } catch (error) {
      console.error(error);
      alert("서버 연결에 실패했습니다.");
      setStartingId(null);
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

        {activeCoachName && (
          <div className="mt-8 border-l-2 border-fm-gold bg-fm-panel/60 px-5 py-4 text-sm leading-[1.8] text-fm-text">
            진행 중인 진단이 있습니다. 이어서 진행하시면 처음 함께 시작하신{' '}
            <b className="text-white">{activeCoachName}</b> 코치와 계속됩니다. 다른 코치와 새로 진행하고 싶으시더라도, 기존에 진행 중이던 진단이 이어집니다.
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
              return (
                <div
                  key={coach.id}
                  className="group bg-fm-panel border border-fm-line rounded p-7 flex flex-col gap-5 transition-colors hover:border-fm-gold/60"
                >
                  <div className="fm-eyebrow text-[11px] text-fm-muted">{String(idx + 1).padStart(2, '0')}</div>

                  <div className="flex justify-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden border border-fm-line group-hover:border-fm-gold transition-colors bg-[#171717]">
                      <img
                        src={coach.avatar_url ? `/images/${coach.avatar_url.split('/').pop()}` : "/images/default.png"}
                        alt={coach.name}
                        className="w-full h-full object-cover"
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
                    onClick={() => handleSelectCoach(coach.id, coach.name, coach.avatar_url)}
                    disabled={!!startingId}
                    className="mt-auto h-[46px] rounded border border-fm-line text-white text-sm font-bold transition-colors hover:bg-white hover:text-black hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? '시작 준비 중…' : '선택 후 시작하기'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
