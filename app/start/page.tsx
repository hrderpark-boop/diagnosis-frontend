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

export default function StartPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      
      const msgStr = res.data.coach_response_message;
      const finalMsg = (msgStr && msgStr.length > 5) ? msgStr : `안녕하세요. 오늘 진단을 함께할 ${coachName.split('(')[0]} 코치입니다.`;

      const encodedMsg = encodeURIComponent(finalMsg);
      const encodedImg = encodeURIComponent(coachAvatar);

      // 채팅 직전에 자가진단 단계를 거친다. 대화 파라미터는 그대로 넘겨,
      // 자가진단 제출(또는 건너뛰기) 후 동일한 채팅 화면으로 이어지게 한다.
      router.push(`/assessment/self-eval?diagnosis_id=${diagnosisId}&session_id=${sessionId}&coach_name=${coachName}&coach_img=${encodedImg}&initial_message=${encodedMsg}`);

    } catch (error) {
      console.error(error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const parseTags = (tags: string | string[]) => {
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') {
      return tags.split(',').map(t => t.trim()).filter(t => t.startsWith('#'));
    }
    return [];
  };

  const getCoachDescription = (name: string, desc: string) => {
    if (desc && desc.trim().length > 5 && desc !== 'string') return `"${desc}"`;

    if (name.includes("Ella") || name.includes("엘라")) {
        return '"따뜻한 공감과 경청으로\n당신의 고민을 함께 나누고 치유합니다."';
    }
    if (name.includes("Jessica") || name.includes("제시카")) {
        return '"냉철한 데이터 분석과 직설적인 피드백으로\n확실한 성장의 길을 제시합니다."';
    }
    if (name.includes("David") || name.includes("데이비드")) {
        return '"풍부한 현장 경험과 통찰력으로\n실질적이고 전략적인 로드맵을 그립니다."';
    }
    if (name.includes("Sarah") || name.includes("사라")) {
        return '"긍정적인 에너지와 동기부여로\n당신의 잠재력을 최대한 끌어올립니다."';
    }
    return '"당신의 리더십 데이터를 분석하여\n가장 개인화된 솔루션을 제공합니다."';
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0a0a0c] text-white">
      {/* 배경 장식 */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-20 z-10">
        
        <div className="text-center mb-20 space-y-4">
          <h2 className="text-blue-500 font-bold tracking-widest text-sm uppercase animate-pulse">
            AI Leadership Coaching
          </h2>
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 pb-2 leading-tight">
            당신의 성장을 함께할<br /> 
            최고의 파트너를 선택하세요
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mt-6 font-light">
            6명의 전문 AI 코치가 당신의 리더십 데이터를 분석하고, 
            <span className="text-white font-medium"> 맞춤형 최적의 솔루션</span>을 제공합니다.
          </p>
        </div>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 text-sm">AI 코치 프로필 로딩 중...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
            {coaches?.map((coach) => (
              <div 
                key={coach.id} 
                className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] overflow-hidden flex flex-col items-center"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 w-full flex flex-col items-center">
                  <div className="w-36 h-36 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 to-purple-500 mb-6 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                    <div className="w-full h-full rounded-full overflow-hidden bg-gray-900">
                      <img 
                        src={coach.avatar_url ? `/images/${coach.avatar_url.split('/').pop()}` : "/images/default.png"}
                        alt={coach.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => {e.currentTarget.src = "/images/default.png"}} 
                      />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-3">
                    {coach.name}
                  </h3>
                  
                  <div className="flex flex-wrap justify-center gap-2 mb-6 min-h-[24px]">
                    {parseTags(coach.character_tags).map((tag, idx) => (
                      <span key={idx} className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="w-full bg-black/30 rounded-xl p-5 mb-8 border border-white/5 min-h-[100px] flex items-center justify-center">
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line text-center italic">
                      {getCoachDescription(coach.name, coach.description)}
                    </p>
                  </div>

                  <button 
                    onClick={() => handleSelectCoach(coach.id, coach.name, coach.avatar_url)}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg hover:from-blue-500 hover:to-blue-600 transition-all active:scale-95"
                  >
                    이 코치와 시작하기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}