'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

interface Coach {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  character_tags: string[]; // 백엔드(/coaches)는 배열로 반환
}

// 시딩된 템플릿 ID (고정)
const TEMPLATE_ID = "10000000-0000-0000-0000-000000000008";

// (요구사항 1) @st.cache_data 대응:
// 모듈 스코프 캐시 — 페이지 재진입/리렌더 시 백엔드 반복 호출을 막는다.
let coachesCache: Coach[] | null = null;

async function fetchCoachesCached(): Promise<Coach[]> {
  if (coachesCache) return coachesCache;
  const res = await api.get('/coaches');
  // 응답이 배열이거나 {items:[...]} / {coaches:[...]} 형태 모두 방어적으로 처리
  const data: Coach[] = Array.isArray(res.data)
    ? res.data
    : (res.data.items ?? res.data.coaches ?? []);
  coachesCache = data;
  return data;
}

export default function SelectCoachPage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedCoachName, setSelectedCoachName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchCoachesCached();
        console.log("불러온 코치 목록:", data); // 디버깅용 로그
        setCoaches(data);
      } catch (err) {
        console.error("코치 목록 로딩 실패:", err);
        alert("코치 목록을 불러올 수 없습니다. 백엔드 서버를 확인해주세요.");
      }
    })();
  }, []);

  // (요구사항 5) 카드 버튼 클릭 → 선택 상태(id+name) 저장 + 성공 알림
  const handleSelect = (coach: Coach) => {
    setSelectedCoachId(coach.id);
    setSelectedCoachName(coach.name);
    // st.session_state 대응: 새로고침/페이지 이동에도 유지되도록 저장
    localStorage.setItem('selected_coach_id', coach.id);
    localStorage.setItem('selected_coach_name', coach.name);
  };

  const handleStart = async () => {
    if (!selectedCoachId) {
        alert("먼저 함께할 코치를 선택해주세요.");
        return;
    }

    console.log("선택된 코치 ID:", selectedCoachId); // 디버깅용 로그
    setLoading(true);

    try {
      // [THE FIX] seed.py의 ID와 정확히 일치하는 매핑 테이블
      // 백엔드 seed.py의 ID 규칙을 그대로 따릅니다.
      const mapping: {[key: string]: string} = {
          // 여자 코치
          "10000000-0000-0000-0000-000000000010": "10000000-0000-0000-0000-000000000110", // Ella
          "10000000-0000-0000-0000-000000000011": "10000000-0000-0000-0000-000000000111", // Jessica
          "10000000-0000-0000-0000-000000000012": "10000000-0000-0000-0000-000000000112", // Olivia
          // 남자 코치
          "10000000-0000-0000-0000-000000000020": "10000000-0000-0000-0000-000000000120", // Daniel
          "10000000-0000-0000-0000-000000000021": "10000000-0000-0000-0000-000000000121", // Michael
          "10000000-0000-0000-0000-000000000022": "10000000-0000-0000-0000-000000000122", // Lucas
      };

      const personaId = mapping[selectedCoachId];

      // 매핑 실패 시 예외 처리 강화
      if (!personaId) {
          console.error("ID 매핑 실패. 선택된 ID:", selectedCoachId);
          alert("선택한 코치 정보를 찾을 수 없습니다. (ID 불일치)\nseed.py를 다시 실행했는지 확인해주세요.");
          setLoading(false);
          return;
      }

      // 사용자 정보 조회 (로그인 세션 확인)
      let userId;
      try {
        const userRes = await api.get('/participants/me');
        userId = userRes.data.id;
      } catch (e: any) {
        if (e.response && e.response.status === 401) {
            alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
            localStorage.removeItem('accessToken');
            router.push('/login');
            return;
        }
        throw e;
      }

      console.log("진단 시작 요청 보냄...");

      // 진단 시작 API 호출
      const response = await api.post('/diagnoses/start', {
        template_id: TEMPLATE_ID,
        participant_id: userId,
        coach_persona_id: personaId
      });

      console.log("진단 시작 성공:", response.data);

      const { session_id, diagnosis_id, first_message } = response.data;

      // 세션 정보 저장
      localStorage.setItem('currentSessionId', session_id);
      localStorage.setItem('currentDiagnosisId', diagnosis_id);
      localStorage.setItem('currentCoachId', selectedCoachId);
      localStorage.setItem('chatHistory', JSON.stringify([first_message]));

      // 채팅 페이지로 이동
      router.push('/chat');

    } catch (error: any) {
      console.error("진단 시작 오류:", error);
      alert("진단을 시작하는 중 문제가 발생했습니다.\n" + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 pb-32">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">함께할 코치를 선택하세요</h1>
        <p className="text-gray-600">당신의 성향과 가장 잘 맞는 파트너는 누구인가요?</p>
      </div>

      {/* (요구사항 5) st.success 대응: 선택 완료 성공 알림 */}
      {selectedCoachName && (
        <div className="mb-8 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-800 px-5 py-3 shadow-sm">
          <CheckCircle size={20} className="text-green-600" />
          <span className="font-medium">
            {selectedCoachName} 코치 선택이 완료되었습니다.
          </span>
        </div>
      )}

      {/* (요구사항 2) st.columns 대응: 가로 3열 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full">
        {coaches.map((coach) => {
          const isSelected = selectedCoachId === coach.id;

          // (요구사항 3) character_tags 배열 → 한 줄 해시태그 텍스트
          const tagText = Array.isArray(coach.character_tags)
            ? coach.character_tags.join(' ')
            : coach.character_tags;

          return (
            <div
              key={coach.id}
              className={`
                relative rounded-2xl p-6 transition-all duration-300 bg-white border-2
                ${isSelected
                  ? 'border-blue-600 shadow-xl ring-4 ring-blue-100'
                  : 'border-transparent shadow-md hover:shadow-lg'}
              `}
            >
              {isSelected && (
                <div className="absolute top-4 right-4 text-blue-600 bg-white rounded-full">
                  <CheckCircle size={28} fill="currentColor" className="text-blue-600" />
                </div>
              )}

              <div className="flex flex-col items-center text-center space-y-4">
                {/* (요구사항 3) 아바타: 이미지 실패 시 대체 이모지로 폴백 */}
                <div className={`
                  relative w-32 h-32 rounded-full overflow-hidden border-4 flex items-center justify-center bg-gray-50 text-5xl
                  ${isSelected ? 'border-blue-100' : 'border-gray-100'}
                `}>
                  <img
                    src={coach.avatar_url}
                    alt={coach.name}
                    className="object-cover w-full h-full"
                    onError={(e) => {
                      // 이미지가 깨지면 img 를 숨기고 부모의 이모지(🧑‍🏫)가 보이도록 처리
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      if (img.parentElement) img.parentElement.textContent = '🧑‍🏫';
                    }}
                  />
                </div>

                {/* (요구사항 3) 이름 = st.subheader */}
                <h3 className="text-xl font-bold text-gray-900">{coach.name}</h3>

                {/* (요구사항 3) 성향 태그 = st.caption (해시태그 한 줄) */}
                <p className="text-sm text-blue-600 font-medium">{tagText}</p>

                {/* (요구사항 3) 설명 = st.write */}
                <p className="text-gray-500 text-sm leading-relaxed min-h-[3rem] whitespace-pre-line">
                  {coach.description}
                </p>

                {/* (요구사항 4) 코치별 '[이름] 선택하기' 버튼 */}
                <button
                  onClick={() => handleSelect(coach)}
                  className={`
                    w-full py-3 rounded-lg text-sm font-bold transition-colors mt-2
                    ${isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'}
                  `}
                >
                  {isSelected ? '선택됨 ✓' : `${coach.name} 선택하기`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 고정 버튼 (Sticky Footer) — 선택 후 진단 시작 */}
      <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex justify-center z-50 transition-transform duration-300">
        <div className="max-w-4xl w-full flex justify-between items-center px-4">
            <div className="hidden md:block text-gray-600">
                {selectedCoachName ? `${selectedCoachName} 코치와 함께 시작할까요?` : "코치를 선택해주세요"}
            </div>
            <button
            onClick={handleStart}
            disabled={!selectedCoachId || loading}
            className={`
                flex items-center justify-center gap-2 px-12 py-4 rounded-full text-lg font-bold text-white shadow-lg transition-all w-full md:w-auto
                ${!selectedCoachId || loading
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 hover:shadow-xl'}
            `}
            >
            {loading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>진단 센터 생성 중...</span>
                </>
            ) : (
                <>
                    <span>진단 시작하기</span>
                    <ArrowRight size={20} />
                </>
            )}
            </button>
        </div>
      </div>
    </div>
  );
}
