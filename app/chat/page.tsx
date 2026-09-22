"use client";

import { clearRestoreCandidate } from '@/lib/restoreCandidate';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { getTopicNames } from '@/lib/framework';
import { User } from 'lucide-react';

// ----------------------------------------------------------------------
// [상수] 일시중지 요청 문구 — 백엔드 PAUSE 전용 키워드("잠시 쉬"/"쉴게")만 포함.
//   ⚠️ "오늘은 여기까지 하고 …", "다음에 이어서 …" 류는 이탈(refusal) 패턴과
//   겹쳐 ABORT_CONFIRM → aborted_disengaged 체인을 탔다(H4). 여기 문구를 바꿀 땐
//   백엔드 tests/test_abort.py::test_pause_intent_is_not_refusal 과 맞출 것.
// ----------------------------------------------------------------------
// (2026-09-21) 채팅 영역 배경 — 밝은 회색. 순백 비교는 '#FFFFFF'
const CHAT_BG = '#F5F6F8';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 animate-[fadeIn_0.3s_ease-out]">
      <div className="relative w-full max-w-[440px] bg-fm-panel border border-fm-line rounded p-8 fm-rise">
        <div className="fm-eyebrow text-[11px] text-fm-gold">Competency Unlocked</div>
        <h1 className="mt-3 text-xl font-bold text-white leading-tight break-keep">{data.title}</h1>
        <div className="w-10 h-px bg-fm-line my-5"></div>
        <p className="text-[15px] text-fm-text leading-[1.8] font-light whitespace-pre-wrap break-keep">{data.desc}</p>
        <div className="mt-8">
          <button onClick={onClose} className="w-full h-11 bg-white hover:bg-fm-gold text-black text-sm font-bold rounded transition-colors">다음 여정 계속하기</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 animate-[fadeIn_0.5s_ease-out]">
      <div className="relative w-full max-w-[460px] bg-fm-panel border border-fm-line rounded p-10 text-center fm-rise">
        <div className="fm-eyebrow text-[11px] text-fm-gold">Diagnosis complete</div>
        <h2 className="mt-4 text-3xl font-light text-white">진단 완료</h2>
        <div className="w-10 h-px bg-fm-line mx-auto my-6"></div>
        <p className="text-fm-text text-[15px] leading-[1.8] font-light break-keep">
          긴 여정을 무사히 마치신 것을 축하합니다.<br/><br/>
          이제 리더님이 남겨주신 소중한 답변들을 모아,<br/>
          <strong className="font-bold text-white">최첨단 HR 알고리즘</strong>으로<br/>
          맞춤형 리더십 심층 리포트를 생성합니다.
        </p>

        <button onClick={onAnalyze} className="mt-8 w-full h-12 rounded bg-white text-black font-bold text-[15px] hover:bg-fm-gold transition-colors">
          최종 리포트 생성하기
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
  // ① 재개로 들어온 화면: 상단 한 줄 "이어서 진행합니다"(팝업 대신). 첫 메시지를 보내면 사라진다.
  const [resumedNotice, setResumedNotice] = useState(searchParams.get('resumed') === '1');
  // (2026-09-22) 코치 턴 LLM 실패: 코치 말풍선 대신 시스템 안내 + [다시 시도]. 실패한 사용자 문장을 보관해 재전송한다.
  const [llmError, setLlmError] = useState<{ message: string; lastMsg: string; paused: boolean } | null>(null);

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
  const sendMessage = async (override?: string, opts?: { retry?: boolean }) => {
    const userMsg = (override ?? input).trim();
    // 영구 종료(3-Strike/완료) 후에는 어떤 경로(엔터·버튼·override)로도 전송 차단.
    if (!userMsg || isLoading || isTerminated) return;
    // 재시도는 이미 화면에 있는 사용자 말풍선을 다시 붙이지 않는다(서버에는 저장되지 않았던 문장).
    if (!opts?.retry) setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLlmError(null);
    if (override === undefined) setInput("");
    // 첫 메시지 = 새 세션이 실질적으로 시작됨 → 되돌리기 후보·재개 안내 정리
    setResumedNotice(false);
    clearRestoreCandidate();
    setIsLoading(true);
    setConnError(false);
    setJustCompletedTopic(false);
    setNeedsDecision(false);

    try {
      const res = await apiClient.post(`/diagnoses/submit_message`, {
        session_id: sessionId,
        diagnosis_id: diagnosisId,
        content: userMsg
      });

      // (2026-09-22) LLM 실패 턴: 서버가 이 턴을 통째로 되돌렸다(상태 전진 없음). 코치 말풍선 없이 시스템 안내만.
      if (res.data.llm_error === true) {
        const pausedNow = res.data.is_session_paused === true;
        setLlmError({ message: res.data.coach_response_message, lastMsg: userMsg, paused: pausedNow });
        if (pausedNow) setSessionStatus('paused');
        return;
      }
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
  // (2026-09-17) 챕터 경계 '계속/휴식' 배너와 takeBreak 삭제 — 백엔드가 그 대기 마커를 어디서도
  //   세우지 않던 죽은 경로. PAUSE_MESSAGE 상수는 그대로 둔다(잠시 쉬기 문구의 단일 정의).
  void PAUSE_MESSAGE;

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

  // 2(2026-09-16) 챕터 종료 대기 중 입력 잠금: 전환 팝업('다음 챕터로 이동' / '계속·휴식')이 떠 있는 동안은
  //   채팅창에 "네"를 치는 대신 버튼으로만 선택하게 한다(백엔드는 텍스트가 와도 안내만 돌려주는 이중 방어).
  //   버튼들은 sendMessage(override) 로 보내므로 잠금과 무관하게 동작한다.
  const awaitingChoice = !connError && sessionStatus !== 'paused' && justCompletedTopic;

  // 1D 시각: 현재 챕터 번호/이름(진행 목록과 같은 파생값 — 로직 변경 아님)
  const currentTopicIdx = allTopics.findIndex((t) => !completedTopics.includes(t));
  const currentTopicName = currentTopicIdx >= 0 ? allTopics[currentTopicIdx] : (allTopics.length ? '완료' : '');
  const coachShort = coachName.split('(')[0].trim();
  const coachKo = (coachName.match(/\(([^)]+)\)/) || [])[1] || coachShort;

  return (
    <main className="fm-stage h-screen text-fm-text flex relative font-sans overflow-hidden">
      <div className="flex w-full h-full relative z-10">
        {/* 왼쪽 패널 — 1D: 280px, line 테두리, 사진 104px, 골드 눈썹 이름, PROGRESS 목록, 하단 버튼 2개
            (Option A) xl(≥1280)에서는 200px 로 줄이고 코치 프로필 블록은 숨김 — 프로필은 오른쪽 240px 컬럼으로 이동 */}
        <section className="hidden md:flex w-[280px] xl:w-[200px] shrink-0 flex-col h-full border-r border-fm-line bg-black/10 px-7 xl:px-5 pt-10 pb-8 overflow-y-auto custom-scrollbar">
          {/* 코치 프로필 — xl 미만 전용(xl 이상은 오른쪽 컬럼) */}
          <div className="flex flex-col xl:hidden">
            <div className="w-[104px] h-[104px] rounded-full overflow-hidden border border-fm-line bg-[#171717]">
              <img
                src={coachImg}
                alt={coachName}
                className="w-full h-full object-cover"
                onError={(e) => {e.currentTarget.src = "/images/default.png"}}
              />
            </div>
            <div className="mt-5 fm-eyebrow text-xs text-fm-gold">{coachShort}</div>
            <h1 className="mt-1 text-xl font-bold text-white">{coachKo}</h1>
            <p className="mt-3 fm-eyebrow text-[11px] text-fm-muted">AI Leadership Coach</p>
            <div className="mt-[18px] flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-fm-gold" />
              <span className="text-[11px] text-fm-muted">세션 진행 중</span>
            </div>
          </div>

          {/* 진행 상황 — 역량 순서 목록 (완료: 골드 체크 / 진행 중: 골드 점·골드 이름 / 대기: muted) */}
          <div className="mt-10 pt-7 border-t border-fm-line xl:mt-0 xl:pt-0 xl:border-t-0 flex flex-col">
            <p className="fm-eyebrow text-[11px] text-fm-muted">Progress</p>
            <h3 className="mt-1 text-sm font-bold text-white">진행 상황</h3>
            <ol className="mt-5 w-full">
              {allTopics.map((topic, idx) => {
                const isCompleted = completedTopics.includes(topic);
                // 현재 진행 중 = 아직 완료되지 않은 첫 번째 역량 (역량은 순서대로 진행)
                const currentIdx = allTopics.findIndex((t) => !completedTopics.includes(t));
                const isCurrent = !isCompleted && idx === currentIdx;
                return (
                  <li
                    key={topic}
                    className="flex items-center justify-between py-3.5 border-b border-fm-line last:border-b-0"
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className={`fm-eyebrow text-[11px] ${isCurrent ? 'text-fm-gold' : 'text-fm-muted'}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className={`text-sm transition-colors duration-500 ${
                        isCompleted ? 'text-white'
                          : isCurrent ? 'text-fm-gold font-bold'
                          : 'text-fm-muted'
                      }`}>
                        {topic}
                      </span>
                    </div>
                    {isCompleted ? (
                      <svg aria-label="완료" viewBox="0 0 16 16" className="w-3.5 h-3.5 text-fm-gold" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                    ) : (
                      <span
                        aria-label={isCurrent ? '진행 중' : '대기'}
                        className={`inline-block w-2 h-2 rounded-full transition-all duration-500 ${
                          isCurrent ? 'bg-fm-gold shadow-[0_0_8px_rgba(176,141,92,0.6)]' : 'bg-fm-line'
                        }`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* 하단 버튼 — 1A 패널 버튼과 같은 스타일(아웃라인 / 흰색 채움). mt-auto 로 패널 바닥에 */}
          <div className="flex flex-col gap-3 w-full mt-auto pt-8">
            <button onClick={() => router.push('/start')} className="w-full h-11 rounded border border-fm-line text-white text-[13px] font-bold hover:border-white/40 transition-colors">
              저장하고 나가기
            </button>
            <button onClick={handleFinishDiagnosis} disabled={isAnalyzing} className="w-full h-11 rounded bg-white text-black text-[13px] font-bold hover:bg-fm-gold transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {isAnalyzing ? "분석 중..." : "진단 완료 및 결과 보기"}
            </button>
          </div>
        </section>

        {/* 오른쪽 채팅 — 1D: 세션 헤더 바 / 메시지 영역 / 상태 배너 / border-top 입력 바 */}
        {/* (2026-09-21) 채팅 영역은 밝은 배경(CHAT_BG) + ink 텍스트, 좌측 패널은 어두운 톤 유지 — 대비로 구분 */}
        <section className="flex-1 min-w-0 h-full flex flex-col text-[#1B1F24]" style={{ backgroundColor: CHAT_BG }}>
          {/* 세션 헤더 바 */}
          <div className="shrink-0 px-5 md:px-8 xl:px-12 py-4 md:py-6 border-b border-[#E3E6EA] flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="fm-eyebrow text-[11px] text-fm-gold whitespace-nowrap">
                Session {String(currentTopicIdx >= 0 ? currentTopicIdx + 1 : Math.max(allTopics.length, 1)).padStart(2, '0')}
              </span>
              <span className="text-sm text-[#1B1F24] truncate">{currentTopicName || '진단 대화'}</span>
            </div>
            <div className="md:hidden flex items-center gap-2 shrink-0">
              <img src={coachImg} alt={coachName} className="w-6 h-6 rounded-full object-cover border border-[#E3E6EA]" onError={(e) => {e.currentTarget.src = "/images/default.png"}} />
              <span className="text-[11px] text-[#6B727C]">{coachShort}</span>
            </div>
            <div className="hidden md:block text-[11px] text-[#6B727C] shrink-0">{coachShort} 코치</div>
          </div>

          {/* 채팅 히스토리 */}
          <div className="flex-1 min-h-0 px-5 md:px-8 xl:px-12 py-8 md:py-10 space-y-8 md:space-y-10 overflow-y-auto custom-scrollbar">
            {resumedNotice && (
              <div className="flex justify-center animate-[fadeIn_0.3s]">
                <span className="rounded-full border border-fm-gold/50 bg-[#FBF7F0] px-4 py-1.5 text-xs text-[#5C4A2E] break-keep">
                  이어서 진행합니다 — {coachName.split('(')[0].trim()} 코치와의 이전 대화에 이어집니다.
                </span>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.3s]`}>
                {msg.role === 'model' && (
                  <div className="w-8 h-8 rounded-full overflow-hidden mr-3 border border-[#E3E6EA] bg-[#171717] flex-shrink-0">
                    <img src={coachImg} alt="AI" className="w-full h-full object-cover" onError={(e) => {e.currentTarget.src = "/images/default.png"}} />
                  </div>
                )}
                {/* 1D 말풍선: 코치 = panel 배경 + line 테두리, 사용자 = 한 단계 밝은 회색 + 골드 아웃라인.
                    크기는 4a784be 이전 값으로 복원(max-w 92%/md 88%, px-6 py-4, 기본 16px) — 색·테두리·모서리 4px 만 1D 토큰.
                    break-keep(한국어 단어 중간 줄바꿈 방지) */}
                <div className={`max-w-[92%] md:max-w-[88%] px-6 py-4 rounded-2xl whitespace-pre-wrap break-keep ${
                  msg.role === 'user'
                    ? 'bg-[#F3EBDD] border border-[#E6D7BC] text-[#1B1F24]'
                    : 'bg-white border border-[#E3E6EA] text-[#1B1F24]'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  /* 사용자 아바타: 코치 아바타와 같은 32px 원형. panel 보다 한 단계 밝은 회색 + line 테두리, User 아이콘 muted */
                  <div className="w-8 h-8 rounded-full ml-3 border border-[#E6D7BC] bg-[#F3EBDD] flex-shrink-0 flex items-center justify-center" aria-hidden="true">
                    <User size={16} className="text-[#8A6C3F]" strokeWidth={1.75} />
                  </div>
                )}
              </div>
            ))}

            {/* 물결 wave 애니메이션 — 1D 타이핑 점 3개 */}
            {(isLoading || isAnalyzing) && (
              <div className="flex justify-start pl-11">
                <div className="bg-white px-4 py-3 rounded-2xl flex gap-1.5 items-center border border-[#E3E6EA] w-fit">
                  <span className="w-[5px] h-[5px] bg-[#9BA2AC] rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0s' }}></span>
                  <span className="w-[5px] h-[5px] bg-[#9BA2AC] rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0.2s' }}></span>
                  <span className="w-[5px] h-[5px] bg-[#9BA2AC] rounded-full" style={{ animation: 'wave 1.4s ease-in-out infinite', animationDelay: '0.4s' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 상태 인지 액션바 — 오류(Sync) / 일시중지 / 다음 챕터 (항상 활성). 문구·동작 그대로, 색만 토큰 */}
          {!connError && llmError && !llmError.paused && (
            <div className="mx-5 md:mx-8 xl:mx-12 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E6D7BC] border-l-2 border-l-fm-gold bg-white px-5 py-3">
              <span className="text-sm text-[#1B1F24] break-keep">{llmError.message}</span>
              <button
                onClick={() => sendMessage(llmError.lastMsg, { retry: true })}
                disabled={isLoading}
                className="shrink-0 h-9 rounded-xl bg-[#1B1F24] px-4 text-sm font-bold text-white hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50"
              >
                다시 시도
              </button>
            </div>
          )}
          {connError && (
            <div className="mx-5 md:mx-8 xl:mx-12 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-3">
              <span className="text-sm text-red-700 break-keep">네트워크 통신 오류가 발생했어요. 대화는 안전하게 저장돼 있어요.</span>
              <button
                onClick={() => syncState()}
                disabled={isLoading}
                className="shrink-0 h-9 rounded-xl border border-red-400 px-4 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                다시 시도 (상태 동기화)
              </button>
            </div>
          )}
          {!connError && sessionStatus === 'paused' && (
            <div className="mx-5 md:mx-8 xl:mx-12 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E6D7BC] border-l-2 border-l-fm-gold bg-white px-5 py-3">
              <span className="text-sm text-[#1B1F24] break-keep">{llmError?.paused ? llmError.message : '진단이 잠시 멈춰 있어요. 준비되시면 이어서 진행하세요.'}</span>
              <button
                onClick={resumeDiagnosis}
                disabled={isLoading}
                className="shrink-0 h-9 rounded-xl bg-[#1B1F24] px-4 text-sm font-bold text-white hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50"
              >
                진단 계속하기
              </button>
            </div>
          )}
          {!connError && sessionStatus !== 'paused' && needsDecision && (
            <div className="mx-5 md:mx-8 xl:mx-12 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6D7BC] border-l-2 border-l-fm-gold bg-white px-5 py-3">
              <span className="text-sm text-[#1B1F24] break-keep">
                코치가 오늘은 쉬어가는 것을 제안했어요. 어떻게 할까요?
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { setNeedsDecision(false); sendMessage("괜찮아요, 계속 진행할게요."); }}
                  disabled={isLoading}
                  className="h-9 rounded-xl bg-[#1B1F24] px-4 text-sm font-bold text-white hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50"
                >
                  계속 진행하기
                </button>
                <button
                  onClick={() => { setNeedsDecision(false); sendMessage(PAUSE_LATER_MESSAGE); }}
                  disabled={isLoading}
                  className="h-9 rounded-xl border border-[#D5D9DF] px-4 text-sm font-bold text-[#1B1F24] hover:border-fm-gold transition-colors disabled:opacity-50"
                >
                  다음에 하기
                </button>
              </div>
            </div>
          )}
          {!connError && sessionStatus !== 'paused' && justCompletedTopic && (
            <div className="mx-5 md:mx-8 xl:mx-12 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E6D7BC] border-l-2 border-l-fm-gold bg-white px-5 py-3">
              <span className="text-sm text-[#1B1F24] break-keep">
                이 영역을 마쳤어요{nextTopic ? ` — 다음은 '${nextTopic}'` : ''}. 이어서 진행할 수 있어요.
              </span>
              <button
                onClick={goNextChapter}
                disabled={isLoading}
                className="shrink-0 h-9 rounded-xl bg-[#1B1F24] px-4 text-sm font-bold text-white hover:bg-fm-gold hover:text-black transition-colors disabled:opacity-50"
              >
                다음 챕터로 이동
              </button>
            </div>
          )}

          {/* 입력창 — 1D: border-top 입력 바, panel 배경 + line 테두리, 포커스 골드, 전송 아이콘 골드. 세션 영구 종료(3-Strike/완료)면 잠금 */}
          <div className="shrink-0 px-5 md:px-8 xl:px-12 pt-4 pb-5 md:pb-7 border-t border-[#E3E6EA]">
            {isTerminated ? (
              <div className="rounded-2xl border border-[#E3E6EA] bg-white px-6 py-4 text-center text-sm font-semibold text-[#6B727C] break-keep">
                {sessionStatus === 'aborted'
                  ? '이 진단은 종료되었습니다. 준비가 되셨을 때 다시 접속해 주세요.'
                  : '진단이 완료되어 대화가 종료되었습니다.'}
              </div>
            ) : (
              <div className="relative bg-white border border-[#E3E6EA] rounded-2xl flex items-end transition-colors focus-within:border-fm-gold">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={awaitingChoice ? "위 버튼으로 다음 단계를 선택해 주세요" : "답변을 입력하세요"}
                  rows={1}
                  disabled={isTerminated || awaitingChoice}
                  className="w-full bg-transparent text-[#1B1F24] placeholder:text-[#9BA2AC] text-[15px] leading-[1.7] px-5 py-3.5 focus:outline-none resize-none max-h-[150px] custom-scrollbar disabled:cursor-not-allowed"
                />
                <button onClick={() => sendMessage()} disabled={isLoading || isTerminated || awaitingChoice || !input.trim()} aria-label="보내기" className="mb-2 mr-2 p-2 rounded text-fm-gold hover:bg-fm-gold/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* (Option A) 오른쪽 코치 프로필 컬럼 — xl(≥1280) 전용 240px, panel 배경 + line 왼쪽 테두리. 1280 미만은 왼쪽 패널 상단 블록이 대신 표시 */}
        <aside className="hidden xl:flex w-[240px] shrink-0 flex-col items-center h-full border-l border-fm-line bg-fm-panel px-6 pt-12 pb-8 overflow-y-auto custom-scrollbar">
          <div className="w-[180px] h-[180px] shrink-0 rounded-full overflow-hidden border border-fm-line bg-[#171717]">
            <img
              src={coachImg}
              alt={coachName}
              className="w-full h-full object-cover"
              onError={(e) => {e.currentTarget.src = "/images/default.png"}}
            />
          </div>
          <div className="mt-7 fm-eyebrow text-xs text-fm-gold text-center">{coachShort}</div>
          <h1 className="mt-1.5 text-[22px] font-bold text-white text-center break-keep">{coachKo}</h1>
          <p className="mt-3 fm-eyebrow text-[10px] text-fm-muted text-center">AI Leadership Coach</p>
          <div className="mt-5 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-fm-gold" />
            <span className="text-[11px] text-fm-muted">세션 진행 중</span>
          </div>
        </aside>
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