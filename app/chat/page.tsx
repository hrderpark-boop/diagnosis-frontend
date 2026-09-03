"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { getTopicNames } from '@/lib/framework';

// ----------------------------------------------------------------------
// [상수] 일시중지 요청 문구 — 백엔드 PAUSE 전용 키워드("잠시 쉬"/"쉴게")만 포함.
//   ⚠️ "오늘은 여기까지 하고 …", "다음에 이어서 …" 류는 이탈(refusal) 패턴과
//   겹쳐 ABORT_CONFIRM → aborted_disengaged 체인을 탔다(H4). 여기 문구를 바꿀 땐
//   백엔드 tests/test_abort.py::test_pause_intent_is_not_refusal 과 맞출 것.
// ----------------------------------------------------------------------
const PAUSE_MESSAGE = "잠시 쉬었다가 다시 할게요.";
const PAUSE_LATER_MESSAGE = "오늘은 여기서 잠시 쉴게요.";

// ----------------------------------------------------------------------
// [타입 정의]
// ----------------------------------------------------------------------
interface Message {
  role: 'user' | 'model';
  content: string;
}

// ----------------------------------------------------------------------
// [컴포넌트] 레벨업 모달
// ----------------------------------------------------------------------
const LevelUpModal = ({ data, onClose }: { data: { title: string, desc: string }, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]">
      <div className="relative w-full max-w-sm bg-[#121214] border border-white/10 rounded-[32px] p-8 shadow-2xl overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent blur-sm"></div>
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-32 h-32 bg-yellow-500/10 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16 bg-gradient-to-b from-[#2a2a2d] to-[#1a1a1d] border border-white/5 rounded-2xl flex items-center justify-center shadow-lg group">
            <div className="absolute inset-0 bg-yellow-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-yellow-400 drop-shadow-md">
              <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 6.97a.75.75 0 00-1.06 0l-.478.477a.75.75 0 01-1.06-1.06l.477-.478a.75.75 0 000-1.06l-.477-.478a.75.75 0 111.06-1.06l.478.477a.75.75 0 001.06 0l.477-.477a.75.75 0 111.06 1.06l-.477.478a.75.75 0 000 1.06l.477.478a.75.75 0 11-1.06 1.06l-.478-.477z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-[11px] font-bold text-yellow-600/80 tracking-[0.2em] uppercase">Competency Unlocked</h3>
          <h1 className="text-2xl font-bold text-white leading-tight">{data.title}</h1>
          <div className="w-10 h-[1px] bg-white/10 mx-auto my-4"></div>
          <p className="text-sm text-gray-400 leading-relaxed font-light px-2 whitespace-pre-wrap">{data.desc}</p>
        </div>
        <div className="mt-8">
          <button onClick={onClose} className="w-full py-4 bg-white hover:bg-gray-100 text-black text-sm font-bold rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.1)]">다음 여정 계속하기</button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [컴포넌트] 피날레 모달 (5개 역량 완료 시 등장)
// ----------------------------------------------------------------------
const FinaleModal = ({ onAnalyze }: { onAnalyze: () => void }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-md animate-[fadeIn_0.5s_ease-out]">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#1a1a2e] to-[#0f0f16] border border-blue-500/30 rounded-[32px] p-10 shadow-[0_0_80px_rgba(59,130,246,0.3)] overflow-hidden text-center animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.5)] animate-[bounce_3s_infinite]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-white">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-4 tracking-tight">진단 완료!</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-8 break-keep">
          긴 여정을 무사히 마치신 것을 축하합니다.<br/><br/>
          이제 리더님이 남겨주신 소중한 답변들을 모아,<br/>
          <strong>최첨단 HR 알고리즘</strong>으로<br/>
          맞춤형 리더십 심층 리포트를 생성합니다.
        </p>

        <button onClick={onAnalyze} className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg shadow-lg hover:shadow-blue-500/50 transition-all active:scale-95">
          🚀 최종 리포트 생성하기
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [메인 컴포넌트] ChatPage
// ----------------------------------------------------------------------
function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const diagnosisId = searchParams.get('diagnosis_id');
  const sessionId = searchParams.get('session_id');
  const coachName = searchParams.get('coach_name') || "AI 코치";
  // 🐛 fix: useSearchParams()가 이미 1회 디코드한 값을 다시 decodeURIComponent 하면
  //   '50%' 처럼 %가 포함된 코치 문구에서 'URI malformed'가 렌더 중 던져져
  //   화면 전체가 client-side exception 으로 죽었다(배포 전용 증상). 재디코드 제거.
  const initialMsg = searchParams.get('initial_message') || "";

  const rawCoachImg = searchParams.get('coach_img');
  const coachImg = rawCoachImg
    ? `/images/${(rawCoachImg.split('/').pop() || 'default.png')}`
    : "/images/default.png";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reward, setReward] = useState<{title: string, desc: string} | null>(null);
  
  // 🚨 [수정] 피날레 모달을 띄우기 위한 상태 추가
  const [showFinale, setShowFinale] = useState(false);
  
  const [completedTopics, setCompletedTopics] = useState<string[]>([]);

  // 세션 상태 재동기화(Sync) / 단계 인지용
  const [sessionStatus, setSessionStatus] = useState<string>('in_progress');
  // 3-Strike 강제 종료 등 '영구 종료' 상태 — 입력창을 잠근다(재개 불가).
  const [isTerminated, setIsTerminated] = useState(false);
  const [hasNextChapter, setHasNextChapter] = useState(false);
  const [nextTopic, setNextTopic] = useState<string | null>(null);
  const [justCompletedTopic, setJustCompletedTopic] = useState(false);
  const [awaitingContinue, setAwaitingContinue] = useState(false); // 챕터 경계 '계속/휴식' 대기
  const [needsDecision, setNeedsDecision] = useState(false); // 코치의 조기 종료 '제안' — 선택 버튼
  const [connError, setConnError] = useState(false); // 네트워크 오류 → '다시 시도(Sync)'

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [allTopics, setAllTopics] = useState<string[]>([]);

  useEffect(() => {
    getTopicNames().then(setAllTopics).catch((err) => {
      console.error("Failed to load framework topics:", err);
    });
  }, []);

  // 서버에서 세션 상태를 한 번에 다시 불러오는 동기화(Sync) 함수.
  //  - 세션 복구 시, 그리고 네트워크 오류 후 '다시 시도' 버튼에서 재사용.
  //  - status/paused/다음역량 정보까지 받아 현재 단계를 명확히 반영한다.
  const syncState = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!sessionId) return false;
    if (!opts?.silent) setIsLoading(true);
    try {
      const res = await apiClient.get(`/diagnoses/${sessionId}/state`);
      const d = res.data;

      if (d.messages && d.messages.length > 0) {
        setMessages(d.messages);
      } else if (initialMsg) {
        setMessages([{ role: 'model', content: initialMsg }]);
      }
      // 배지는 합집합으로 누적 (덮어쓰기로 사라지는 것 방지)
      setCompletedTopics(prev => Array.from(new Set([...prev, ...(d.completed_topics || [])])));
      setSessionStatus(d.status || 'in_progress');
      setHasNextChapter(!!d.has_next_chapter);
      setNextTopic(d.next_topic || null);
      setAwaitingContinue(!!d.is_awaiting_continue);
      setNeedsDecision(!!d.needs_user_decision);
      setConnError(false); // 동기화 성공 → 오류 상태 해제
      return true;
    } catch (error: any) {
      console.error("Failed to sync session:", error);
      if (error.response && error.response.status === 404) {
        alert("존재하지 않거나 만료된 대화입니다. 처음부터 다시 시작합니다.");
        localStorage.removeItem('diagnosis_id');
        localStorage.removeItem('session_id');
        router.push('/start');
        return false;
      }
      // 네트워크/서버 오류 → '다시 시도(Sync)' 버튼 노출
      setConnError(true);
      if (initialMsg && messages.length === 0) {
        setMessages([{ role: 'model', content: initialMsg }]);
      }
      return false;
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  };

  // 1. 세션 복구 및 초기 메시지 설정
  useEffect(() => {
    if (!sessionId) return;
    syncState({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 2. 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 3. 입력창 자동 높이 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; 
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // 4. 메시지 전송 (override 를 주면 입력창 대신 그 텍스트로 전송 — 계속하기/다음챕터 버튼용)
  const sendMessage = async (override?: string) => {
    const userMsg = (override ?? input).trim();
    // 영구 종료(3-Strike/완료) 후에는 어떤 경로(엔터·버튼·override)로도 전송 차단.
    if (!userMsg || isLoading || isTerminated) return;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    if (override === undefined) setInput("");
    setIsLoading(true);
    setConnError(false);
    setJustCompletedTopic(false);
    setAwaitingContinue(false);
    setNeedsDecision(false);

    try {
      const res = await apiClient.post(`/diagnoses/submit_message`, {
        session_id: sessionId,
        diagnosis_id: diagnosisId,
        content: userMsg
      });

      const aiText = res.data.coach_response_message;
      const rewardData = res.data.reward;
      const completedList = res.data.completed_topics || [];
      // 백엔드의 명시적 진단 종료 신호 (마지막 챕터 Grand Wrap-up 시 true)
      const sessionCompleted = res.data.is_session_completed === true;
      // 세션 단계 신호 (일시중지 / 남은 역량) — 버튼 노출 판단에 사용
      const isPaused = res.data.is_session_paused === true;
      const nextExists = res.data.has_next_chapter === true;
      const topicDone = res.data.is_topic_completed === true;

      setMessages(prev => [...prev, { role: 'model', content: aiText }]);
      // 배지는 절대 사라지면 안 됨 — 기존 획득분과 합집합으로 누적 유지
      setCompletedTopics(prev => Array.from(new Set([...prev, ...completedList])));

      // 3-Strike 강제 종료 / 완료 → 영구 종료(입력창 잠금).
      const terminated =
        res.data.is_terminated === true ||
        res.data.session_status === 'aborted' ||
        sessionCompleted;
      if (terminated) setIsTerminated(true);

      // 현재 단계 반영
      // M16: 참여 이탈 중단(aborted_disengaged)은 3-Strike(aborted)와 달리 '원장
      //   보존·재개 가능' 상태 — 입력을 잠그지 않고 일시중지와 같은 재개 배너를
      //   띄운다(다음 발화에서 백엔드 1-b 가 in_progress 로 복원).
      const disengaged =
        res.data.is_aborted_disengaged === true ||
        res.data.session_status === 'aborted_disengaged';
      setSessionStatus(
        res.data.session_status === 'aborted' ? 'aborted'
          : (isPaused || disengaged) ? 'paused'
          : (sessionCompleted ? 'completed' : 'in_progress')
      );
      setHasNextChapter(nextExists);
      setNextTopic(res.data.next_topic || null);
      // 챕터 경계 '계속/휴식' 선택 대기 — 선택 버튼 노출
      setAwaitingContinue(res.data.is_awaiting_continue === true);
      // 코치의 조기 종료 '제안' — '다음에 하기/계속 진행하기' 버튼 노출
      setNeedsDecision(res.data.needs_user_decision === true);
      // 챕터를 방금 마쳤고(=전진 지점) 다음 역량이 남았으면 '다음 챕터로 이동' 노출
      setJustCompletedTopic(topicDone && nextExists && !sessionCompleted);

      // 진단 종료 판정: 명시적 완료 플래그 OR 모든 역량 배지 충족.
      // 🛡️ 단, 남은 역량(has_next_chapter)이 있으면 절대 피날레를 띄우지 않는다
      //    ('끝난 거 아니야?' 오판 방어 — 백엔드 조기종료 차단과 정합).
      const allDone =
        !nextExists &&
        (sessionCompleted ||
          (allTopics.length > 0 && completedList.length === allTopics.length));

      if (rewardData) {
        setTimeout(() => setReward(rewardData), 1200);
      } else if (allDone) {
        setTimeout(() => setShowFinale(true), 1200);
      }

    } catch (error: any) {
      console.error("Chat Error:", error);
      if (error.response?.status === 500) {
        setMessages(prev => [...prev, { role: 'model', content: "서버 내부 오류가 발생했습니다. 잠시 후 아래 '다시 시도'로 상태를 동기화해 주세요." }]);
      }
      // 네트워크 통신 오류 → 상태 동기화(Sync)를 유도하는 '다시 시도' 배너 노출
      setConnError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // '진단 계속하기' / '다음 챕터로 이동' — 계속 진행 의사를 전송해 흐름 재개
  const resumeDiagnosis = () => {
    setSessionStatus('in_progress');
    setJustCompletedTopic(false);
    sendMessage("네, 계속 진행할게요.");
  };
  const goNextChapter = () => {
    setJustCompletedTopic(false);
    sendMessage("네, 다음으로 이어가 주세요.");
  };
  // 챕터 경계에서 '잠시 쉬기' 선택 — 백엔드 PAUSE 전용 키워드("잠시 쉬"/"쉴게")만
  // 포함하는 문구를 보낸다. ⚠️ "오늘은 여기까지 하고…" 류는 이탈(refusal) 패턴과
  // 겹쳐 ABORT_CONFIRM 체인을 탔다(H4) — pause 문구는 refusal 표지를 피한다.
  const takeBreak = () => {
    setAwaitingContinue(false);
    sendMessage(PAUSE_MESSAGE);
  };

  // 5. 진단 종료
  const handleFinishDiagnosis = async () => {
    if (allTopics.length > 0 && completedTopics.length < allTopics.length) {
      alert("모든 역량의 진단이 마무리되어야 결과 보고서가 작성됩니다.\n코치와의 대화를 끝까지 진행해 주세요!");
      return;
    }

    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      setMessages(prev => [...prev, { role: 'model', content: "진단을 종료하고 결과를 분석 중입니다..." }]);
      await apiClient.post(`/reports/${sessionId}/analyze`);
      router.push(`/report?session_id=${sessionId}`);
    } catch (error) {
      console.error("Analysis failed:", error);
      // 딱딱한 alert 대신 대화 안에서 친절히 안내 + 버튼 재시도 유도
      setMessages(prev => [...prev, {
        role: 'model',
        content: "리포트를 생성하는 중에 문제가 발생했어요. 대화 내용은 안전하게 저장돼 있으니, 잠시 후 '진단 완료 및 결과 보기' 버튼을 다시 눌러주세요."
      }]);
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      sendMessage();
    }
  };

  return (
    <main className="h-screen bg-[#050508] text-gray-100 flex relative font-sans overflow-hidden">
      {/* 배경 장식 */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-blue-900/20 rounded-full blur-[180px] pointer-events-none opacity-50" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full blur-[180px] pointer-events-none opacity-50" />
      
      <div className="flex w-full h-full max-w-[1600px] mx-auto relative z-10">
        {/* 왼쪽 패널 */}
        <section className="hidden md:flex w-[400px] flex-col h-full relative border-r border-white/5 bg-black/20 backdrop-blur-sm">
          {/* 오른쪽 채팅창(mt-24 + p-8 = 128px 오프셋, 높이 92vh)과 위·아래 선을 맞춘다.
              프로필 상단 = 채팅창 상단, 마지막 버튼 하단 = 채팅창 하단(mt-auto). */}
          {/* 상단은 채팅창 상단선보다 72px 아래, 하단은 채팅창 하단선 유지(높이에서 72px 차감). */}
          <div className="flex flex-col items-center w-full px-8 gap-10 mt-[200px] h-[calc(92vh-72px)] shrink-0">
            {/* 코치 프로필 */}
            <div className="flex flex-col items-center space-y-6">
              <div className="relative group">
                <div className="absolute -inset-6 bg-gradient-to-t from-blue-600/30 to-purple-600/30 rounded-full blur-2xl opacity-60 animate-pulse-slow"></div>
                <div className="relative w-44 h-44 rounded-full p-1.5 bg-gradient-to-b from-white/20 to-white/5 shadow-2xl backdrop-blur-sm">
                  <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0a0c]">
                    <img 
                      src={coachImg} 
                      alt={coachName} 
                      className="w-full h-full object-cover scale-110 group-hover:scale-105 transition-transform duration-1000" 
                      onError={(e) => {e.currentTarget.src = "/images/default.png"}} 
                    />
                  </div>
                </div>
              </div>
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-white tracking-tight">{coachName}</h1>
                <p className="text-xs text-blue-400 font-semibold tracking-widest uppercase">AI Leadership Coach</p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-green-400 tracking-wider">세션 진행 중</span>
                </div>
              </div>
            </div>

            {/* 진행 상황 — 역량 순서 목록 (완료: 금색 점 / 진행 중: 흰 링 / 대기: 흐림) */}
            <div className="w-full max-w-[300px] flex flex-col my-auto">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.25em]">Progress</p>
              <h3 className="text-sm font-bold text-white mt-1 mb-4">진행 상황</h3>
              <ol className="w-full">
                {allTopics.map((topic, idx) => {
                  const isCompleted = completedTopics.includes(topic);
                  // 현재 진행 중 = 아직 완료되지 않은 첫 번째 역량 (역량은 순서대로 진행)
                  const currentIdx = allTopics.findIndex((t) => !completedTopics.includes(t));
                  const isCurrent = !isCompleted && idx === currentIdx;
                  const isUpcoming = !isCompleted && !isCurrent;
                  return (
                    <li
                      key={topic}
                      className="flex items-center justify-between py-3.5 border-b border-white/[0.06] last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] font-mono tabular-nums ${isUpcoming ? 'text-gray-600' : 'text-gray-500'}`}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className={`text-sm transition-colors duration-500 ${
                          isCompleted ? 'text-gray-200 font-medium'
                            : isCurrent ? 'text-white font-semibold'
                            : 'text-gray-600'
                        }`}>
                          {topic}
                        </span>
                      </div>
                      <span
                        aria-label={isCompleted ? '완료' : isCurrent ? '진행 중' : '대기'}
                        className={`inline-block rounded-full transition-all duration-500 ${
                          isCompleted ? 'w-2 h-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                            : isCurrent ? 'w-2 h-2 border-[1.5px] border-white bg-transparent'
                            : 'w-1.5 h-1.5 bg-white/10'
                        }`}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* 하단 버튼 — mt-auto 로 패널 바닥(=채팅창 하단선)에 붙인다 */}
            <div className="flex flex-col gap-3 w-full max-w-[300px] mt-auto">
              <button onClick={() => router.push('/start')} className="w-full py-3.5 rounded-xl border border-white/10 bg-transparent hover:bg-white/5 text-gray-200 transition-all text-sm font-medium">
                저장하고 나가기
              </button>
              <button onClick={handleFinishDiagnosis} disabled={isAnalyzing} className="w-full py-3.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-100 transition-all disabled:opacity-60">
                {isAnalyzing ? "분석 중..." : "진단 완료 및 결과 보기"}
              </button>
            </div>
          </div>
        </section>

        {/* 오른쪽 채팅창 */}
        <section className="flex-1 h-full p-4 md:p-8 flex items-start justify-center">
          <div className="w-full max-w-4xl h-[92vh] mt-24 bg-white/[0.09] backdrop-blur-3xl border border-white/10 rounded-[2.5rem] flex flex-col overflow-hidden relative shadow-2xl">
            {/* 채팅 히스토리 */}
            <div className="flex-1 px-6 md:px-10 py-6 space-y-8 overflow-y-auto custom-scrollbar">
              <div className="h-8"></div>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.3s]`}>
                  {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded-full overflow-hidden mr-3 border border-white/10 bg-black flex-shrink-0">
                      <img src={coachImg} alt="AI" className="w-full h-full object-cover" onError={(e) => {e.currentTarget.src = "/images/default.png"}} />
                    </div>
                  )}
                  <div className={`max-w-[85%] px-6 py-4 rounded-2xl whitespace-pre-wrap shadow-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[#1a1a1d]/60 text-gray-100 border border-white/10'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              
              {/* 물결 wave 애니메이션 */}
              {(isLoading || isAnalyzing) && (
                <div className="flex justify-start pl-11">
                  <div className="bg-white/5 px-4 py-3 rounded-full flex gap-1.5 items-center border border-white/5 w-fit">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0s' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0.2s' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0.4s' }}></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* 상태 인지 액션바 — 오류(Sync) / 일시중지 / 다음 챕터 (항상 활성) */}
            {connError && (
              <div className="mx-6 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3">
                <span className="text-sm text-red-300">⚠️ 네트워크 통신 오류가 발생했어요. 대화는 안전하게 저장돼 있어요.</span>
                <button
                  onClick={() => syncState()}
                  disabled={isLoading}
                  className="shrink-0 rounded-xl bg-red-500 hover:bg-red-400 px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50"
                >
                  🔄 다시 시도 (상태 동기화)
                </button>
              </div>
            )}
            {!connError && sessionStatus === 'paused' && (
              <div className="mx-6 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3">
                <span className="text-sm text-amber-200">⏸ 진단이 잠시 멈춰 있어요. 준비되시면 이어서 진행하세요.</span>
                <button
                  onClick={resumeDiagnosis}
                  disabled={isLoading}
                  className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-sm font-bold text-black transition-colors disabled:opacity-50"
                >
                  ▶ 진단 계속하기
                </button>
              </div>
            )}
            {!connError && sessionStatus !== 'paused' && needsDecision && (
              <div className="mx-6 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-5 py-3">
                <span className="text-sm text-purple-200">
                  💜 코치가 오늘은 쉬어가는 것을 제안했어요. 어떻게 할까요?
                </span>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { setNeedsDecision(false); sendMessage("괜찮아요, 계속 진행할게요."); }}
                    disabled={isLoading}
                    className="rounded-xl bg-purple-500 hover:bg-purple-400 px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50"
                  >
                    ▶ 계속 진행하기
                  </button>
                  <button
                    onClick={() => { setNeedsDecision(false); sendMessage(PAUSE_LATER_MESSAGE); }}
                    disabled={isLoading}
                    className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-bold text-gray-200 transition-colors disabled:opacity-50"
                  >
                    🌙 다음에 하기
                  </button>
                </div>
              </div>
            )}
            {!connError && sessionStatus !== 'paused' && !needsDecision && awaitingContinue && (
              <div className="mx-6 mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
                <span className="text-sm text-emerald-200">
                  🌿 이 영역을 마쳤어요. 어떻게 할까요?{nextTopic ? ` (다음: '${nextTopic}')` : ''}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={resumeDiagnosis}
                    disabled={isLoading}
                    className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-bold text-black transition-colors disabled:opacity-50"
                  >
                    ▶ 계속 진행
                  </button>
                  <button
                    onClick={takeBreak}
                    disabled={isLoading}
                    className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-bold text-gray-200 transition-colors disabled:opacity-50"
                  >
                    ⏸ 잠시 쉬기
                  </button>
                </div>
              </div>
            )}
            {!connError && sessionStatus !== 'paused' && !awaitingContinue && justCompletedTopic && (
              <div className="mx-6 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-5 py-3">
                <span className="text-sm text-blue-200">
                  ✅ 이 영역을 마쳤어요{nextTopic ? ` — 다음은 '${nextTopic}'` : ''}. 이어서 진행할 수 있어요.
                </span>
                <button
                  onClick={goNextChapter}
                  disabled={isLoading}
                  className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50"
                >
                  ➡ 다음 챕터로 이동
                </button>
              </div>
            )}

            {/* 입력창 — 세션이 영구 종료(3-Strike/완료)되면 잠금 */}
            <div className="p-6 pt-2">
              {isTerminated ? (
                <div className="rounded-[24px] border border-gray-200 bg-gray-100 px-6 py-4 text-center text-sm font-semibold text-gray-500">
                  {sessionStatus === 'aborted'
                    ? '이 진단은 종료되었습니다. 준비가 되셨을 때 다시 접속해 주세요.'
                    : '진단이 완료되어 대화가 종료되었습니다.'}
                </div>
              ) : (
                <div className="relative group bg-white border border-gray-200 rounded-[24px] flex items-end shadow-xl">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="대화를 입력하세요..."
                    rows={1}
                    disabled={isTerminated}
                    className="w-full bg-transparent text-gray-900 px-6 py-4 focus:outline-none resize-none max-h-[150px] custom-scrollbar disabled:cursor-not-allowed"
                  />
                  <button onClick={() => sendMessage()} disabled={isLoading || isTerminated || !input.trim()} className="mb-2 mr-2 p-2.5 bg-blue-600 rounded-full disabled:opacity-50">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      
      {/* 🚨 [수정] 보상 모달 닫을 때 피날레 체크 로직 추가 */}
      {reward && (
        <LevelUpModal
          data={reward}
          onClose={() => {
            setReward(null);
            if (allTopics.length > 0 && completedTopics.length === allTopics.length) {
              setShowFinale(true);
            }
          }}
        />
      )}

      {/* 🚨 [수정] 피날레 모달 렌더링 */}
      {showFinale && (
        <FinaleModal 
          onAnalyze={() => {
            setShowFinale(false);
            handleFinishDiagnosis(); // 진짜 분석 시작
          }} 
        />
      )}
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-white">로딩 중...</div>}>
      <ChatContent />
    </Suspense>
  );
}