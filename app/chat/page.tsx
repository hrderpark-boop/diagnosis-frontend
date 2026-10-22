"use client";

import { clearRestoreCandidate } from '@/lib/restoreCandidate';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { getTopicNames } from '@/lib/framework';
import { useAnalysisProgress, fetchAnalysisEstimate, AnalysisEstimate } from '@/lib/analysisProgress';
import AnalysisChecklist from '@/components/AnalysisChecklist';
import ParticipantHeader from '@/components/participant/ParticipantHeader';
import './chat.css';

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
    <div className="fm-overlay" role="dialog" aria-modal="true" aria-labelledby="fm-chat-levelup-title">
      <div className="fm-modal fm-enter">
        <div className="fm-eyebrow">Competency Unlocked</div>
        <h2 id="fm-chat-levelup-title">{data.title}</h2>
        <p className="fm-chat-modal-desc">{data.desc}</p>
        <div className="actions">
          <button type="button" onClick={onClose} className="fm-btn block">다음 여정 계속하기</button>
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
    <div className="fm-overlay" role="dialog" aria-modal="true" aria-labelledby="fm-chat-finale-title">
      <div className="fm-modal fm-enter fm-chat-modal-center">
        <div className="fm-eyebrow">Diagnosis complete</div>
        <h2 id="fm-chat-finale-title">진단 완료</h2>
        <p>
          긴 여정을 무사히 마치신 것을 축하합니다.<br/><br/>
          이제 리더님이 남겨주신 소중한 답변들을 모아,<br/>
          <strong>최첨단 HR 알고리즘</strong>으로<br/>
          맞춤형 리더십 심층 리포트를 생성합니다.
        </p>
        <div className="actions">
          <button type="button" onClick={onAnalyze} className="fm-btn block">
            최종 리포트 생성하기
          </button>
        </div>
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
  // item6: 분석(수 분) 중 단계 라벨 폴링 — 스피너만 보여 멈춘 것처럼 보이던 문제
  const analysisProgress = useAnalysisProgress(sessionId, isAnalyzing);
  // A-4: 결과 보기 클릭 시 예상 시간 + 사전분석이 끝난 챕터(✓) 표시용
  const [analysisEstimate, setAnalysisEstimate] = useState<AnalysisEstimate | null>(null);
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
  // (라이트) 모바일 바텀시트 열림 여부. 표시 전용 UI 상태
  const [sheetOpen, setSheetOpen] = useState(false);

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
      // A-4: 스피너 대신 예상 시간부터 알린다(챕터 사전분석 캐시 기준).
      const est = sessionId ? await fetchAnalysisEstimate(sessionId) : null;
      setAnalysisEstimate(est);
      const etaText = !est
        ? "리포트를 준비하고 있습니다. 잠시만 기다려 주세요."
        : est.eta_label.startsWith('약')
          ? `리포트를 준비하고 있습니다. ${est.eta_label} 걸립니다.`
          : `리포트를 준비하고 있습니다. ${est.eta_label}에 끝납니다.`;
      setMessages(prev => [...prev, { role: 'model', content: etaText }]);
      await apiClient.post(`/reports/${sessionId}/analyze`);
      router.push(`/report?session_id=${sessionId}`);
    } catch (error) {
      // item6: 이미 분석이 돌고 있으면(다른 탭·새로고침 후 재클릭) 중복 실행 대신
      //   리포트 화면으로 넘어가 그쪽에서 진행 상태를 이어서 본다.
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        router.push(`/report?session_id=${sessionId}`);
        return;
      }
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

  // 라이트 시각: 헤더 진행 캡션·상단 바 문구(진행 목록과 같은 파생값, 로직 변경 아님)
  const topicTotal = allTopics.length;
  const doneCount = allTopics.filter((t) => completedTopics.includes(t)).length;
  const lastDoneTopic = [...allTopics].reverse().find((t) => completedTopics.includes(t));
  const sessionNo = String(currentTopicIdx >= 0 ? currentTopicIdx + 1 : Math.max(topicTotal, 1)).padStart(2, '0');
  const progressCaption = topicTotal > 0
    ? `${lastDoneTopic ? `${lastDoneTopic} 완료` : `${currentTopicName} 진행 중`} · ${doneCount}/${topicTotal}`
    : '';

  // 사이드 패널 내용: 데스크톱 좌측 사이드와 모바일 바텀시트가 같은 마크업을 쓴다.
  const renderPanel = () => (
    <div className="fm-chat-panel">
      <div className="fm-chat-coach">
        <div className="fm-ph">
          <img
            src={coachImg}
            alt={coachName}
            onError={(e) => {e.currentTarget.src = "/images/default.png"}}
          />
        </div>
        <div>
          <div className="en">{coachShort}</div>
          <div className="nm">{coachKo}<span className="fm-chat-live" title="대화 진행 중" aria-label="대화 진행 중" /></div>
          <div className="role fm-caption">AI Leadership Coach</div>
        </div>
      </div>
      <hr />
      <div className="fm-chat-prog-title">진행 상황</div>
      <ol className="fm-chat-prog">
        {allTopics.map((topic, idx) => {
          const isCompleted = completedTopics.includes(topic);
          // 현재 진행 중 = 아직 완료되지 않은 첫 번째 역량 (역량은 순서대로 진행)
          const currentIdx = allTopics.findIndex((t) => !completedTopics.includes(t));
          const isCurrent = !isCompleted && idx === currentIdx;
          return (
            <li key={topic} className={isCompleted ? 'done' : isCurrent ? 'current' : 'todo'}>
              <span className="fm-num">{String(idx + 1).padStart(2, '0')}</span>
              <span className="nm">{topic}</span>
              {isCompleted ? (
                <svg className="check" viewBox="0 0 18 18" fill="none" aria-label="완료">
                  <path d="M3.5 9.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : isCurrent ? (
                <span className="fm-chip tint">진행 중</span>
              ) : (
                <span className="st">예정</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <button type="button" onClick={() => router.push('/start')} className="fm-btn secondary block sm">
          저장하고 나가기
        </button>
        <button type="button" onClick={() => { setSheetOpen(false); handleFinishDiagnosis(); }} disabled={isAnalyzing} className="fm-btn block sm">
          {isAnalyzing
            ? (analysisProgress?.stage === 'analyze'
                ? `분석 중 ${analysisProgress.done}/${analysisProgress.total}`
                : "분석 중...")
            : "진단 완료 및 결과 보기"}
        </button>
      </div>
    </div>
  );

  return (
    <main className="fm-app fm-chat-root">
      <ParticipantHeader
        step={5}
        right={
          <>
            {progressCaption && (
              <>
                <span className="fm-caption fm-chat-hcap">{progressCaption}</span>
                <span className="sep" />
              </>
            )}
            <button type="button" className="link fm-chat-exit" onClick={() => router.push('/start')}>나가기</button>
            <button
              type="button"
              className="fm-chat-menu"
              aria-label="진행 상황 열기"
              aria-expanded={sheetOpen}
              aria-controls="fm-chat-sheet"
              onClick={() => setSheetOpen((v) => !v)}
            >
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </>
        }
      />

      <div className="fm-chat-app">
        {/* 좌 사이드: 코치 112px · 라이브 점 · 진행 리스트 · 버튼 2개 (모바일에서는 바텀시트로) */}
        <aside className="fm-chat-side" aria-label="코치와 진행 상황">
          {renderPanel()}
        </aside>

        {/* 우 메인: 상단 바 / 메시지 / 상태 바 / 입력 바 */}
        <section className="fm-chat-main" aria-label="코치 대화">
          {/* 대화 영역 전체를 회색 바탕 위에 떠 있는 카드(fm-chat-frame)로 감싼다 */}
          <div className="fm-chat-frame">
          <div className="fm-chat-topbar">
            <div className="l">
              <span className="fm-chip tint">Session {sessionNo}</span>
              <span className="title">{currentTopicName || '진단 대화'}</span>
            </div>
            <div className="tb-m">
              <b>05 코치 대화</b>
              {currentTopicName ? ` · ${currentTopicName}` : ''}
              {topicTotal > 0 && currentTopicIdx >= 0 ? ` ${currentTopicIdx + 1}/${topicTotal}` : ''}
            </div>
            <span className="r fm-caption">{coachShort} 코치</span>
          </div>

          {/* 채팅 히스토리 */}
          <div className="fm-chat-msgs custom-scrollbar">
            <div className="inner">
              {resumedNotice && (
                <div className="fm-chat-sysrow">
                  <span className="fm-chip tint">
                    이어서 진행합니다. {coachName.split('(')[0].trim()} 코치와의 이전 대화에 이어집니다.
                  </span>
                </div>
              )}
              {messages.map((msg, idx) => (
                msg.role === 'user' ? (
                  <div key={idx} className="fm-chat-msg me">
                    <div className="body">
                      <div className="fm-chat-bubble">{msg.content}</div>
                    </div>
                    <div className="fm-chat-me-av" aria-hidden="true">
                      <svg viewBox="0 0 256 256" fill="currentColor"><path d="M229.19,213c-15.81-27.32-40.63-46.49-69.47-54.62a70,70,0,1,0-63.44,0C67.44,166.5,42.62,185.67,26.81,213a6,6,0,1,0,10.38,6C56.4,185.81,90.34,166,128,166s71.6,19.81,90.81,53a6,6,0,1,0,10.38-6ZM70,96a58,58,0,1,1,58,58A58.07,58.07,0,0,1,70,96Z" /></svg>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="fm-chat-msg coach">
                    <div className="fm-ph">
                      <img src={coachImg} alt="AI" onError={(e) => {e.currentTarget.src = "/images/default.png"}} />
                    </div>
                    <div className="body">
                      <span className="who fm-caption">{coachKo}</span>
                      <div className="fm-chat-bubble">{msg.content}</div>
                    </div>
                  </div>
                )
              ))}

              {/* 코치 턴 LLM 실패: 코치 말풍선 대신 시스템 행 + [다시 시도] */}
              {!connError && llmError && !llmError.paused && (
                <div className="fm-chat-sysblock">
                  <div className="fm-chat-sysrow" style={{ width: '100%' }}>
                    <span className="fm-chip tint">{llmError.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendMessage(llmError.lastMsg, { retry: true })}
                    disabled={isLoading}
                    className="fm-btn sm"
                  >
                    다시 시도
                  </button>
                </div>
              )}

              {/* A-4: 분석 중에는 챕터별 단계표(완료 / 분석 중 / 대기) + 종합 */}
              {isAnalyzing && (
                <div className="fm-chat-indent">
                  <AnalysisChecklist progress={analysisProgress} estimate={analysisEstimate} />
                  <p className="fm-caption">이 화면을 닫지 말고 기다려 주세요. 끝나면 리포트로 이동합니다.</p>
                </div>
              )}
              {isLoading && !isAnalyzing && (
                <div className="fm-chat-indent">
                  <div className="fm-chat-typing" aria-label="코치가 답변을 작성하고 있습니다">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 상태 인지 액션바: 오류(Sync) / 일시중지 / 결정 / 다음 챕터. 문구·동작 그대로, 모양만 라이트 */}
          {connError && (
            <div className="fm-chat-status danger">
              <div className="inner">
                <span>네트워크 통신 오류가 발생했어요. 대화는 안전하게 저장돼 있어요.</span>
                <div className="btns">
                  <button type="button" onClick={() => syncState()} disabled={isLoading} className="fm-btn danger sm">
                    다시 시도 (상태 동기화)
                  </button>
                </div>
              </div>
            </div>
          )}
          {!connError && sessionStatus === 'paused' && (
            <div className="fm-chat-status">
              <div className="inner">
                <span>{llmError?.paused ? llmError.message : '진단이 잠시 멈춰 있어요. 준비되시면 이어서 진행하세요.'}</span>
                <div className="btns">
                  <button type="button" onClick={resumeDiagnosis} disabled={isLoading} className="fm-btn sm">
                    진단 계속하기
                  </button>
                </div>
              </div>
            </div>
          )}
          {!connError && sessionStatus !== 'paused' && needsDecision && (
            <div className="fm-chat-status">
              <div className="inner">
                <span>코치가 오늘은 쉬어가는 것을 제안했어요. 어떻게 할까요?</span>
                <div className="btns">
                  <button
                    type="button"
                    onClick={() => { setNeedsDecision(false); sendMessage("괜찮아요, 계속 진행할게요."); }}
                    disabled={isLoading}
                    className="fm-btn sm"
                  >
                    계속 진행하기
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNeedsDecision(false); sendMessage(PAUSE_LATER_MESSAGE); }}
                    disabled={isLoading}
                    className="fm-btn secondary sm"
                  >
                    다음에 하기
                  </button>
                </div>
              </div>
            </div>
          )}
          {!connError && sessionStatus !== 'paused' && justCompletedTopic && (
            <div className="fm-chat-status">
              <div className="inner">
                <span>이 영역을 마쳤어요{nextTopic ? `. 다음은 '${nextTopic}'입니다` : ''}. 이어서 진행할 수 있어요.</span>
                <div className="btns">
                  <button type="button" onClick={goNextChapter} disabled={isLoading} className="fm-btn sm">
                    다음 챕터로 이동
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 입력 바. 세션 영구 종료(3-Strike/완료)면 잠금 */}
          <div className="fm-chat-composer">
            <div className="inner">
              {isTerminated ? (
                <div className="fm-chat-ended">
                  {sessionStatus === 'aborted'
                    ? '이 진단은 종료되었습니다. 준비가 되셨을 때 다시 접속해 주세요.'
                    : '진단이 완료되어 대화가 종료되었습니다.'}
                </div>
              ) : (
                <>
                  <div className="fm-card">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={awaitingChoice ? "위 버튼으로 다음 단계를 선택해 주세요" : "답변을 입력하세요"}
                      aria-label="메시지"
                      rows={1}
                      disabled={isTerminated || awaitingChoice}
                      className="custom-scrollbar"
                    />
                    <button type="button" onClick={() => sendMessage()} disabled={isLoading || isTerminated || awaitingChoice || !input.trim()} aria-label="보내기" className="fm-chat-send">
                      <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 14.5v-11M4.5 8l4.5-4.5L13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                  <div className="hint fm-caption">Enter 전송 · Shift+Enter 줄바꿈</div>
                </>
              )}
            </div>
          </div>
          </div>
        </section>
      </div>

      {/* 모바일 바텀시트: 사이드와 같은 내용(코치 블록 · 진행 리스트 · 버튼 2개). 데스크톱에서는 CSS 로 숨김 */}
      <div
        id="fm-chat-sheet"
        className={`fm-chat-sheet-root ${sheetOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="코치와 진행 상황"
        aria-hidden={!sheetOpen}
        onKeyDown={(e) => { if (e.key === 'Escape') setSheetOpen(false); }}
      >
        <div className="overlay" onClick={() => setSheetOpen(false)} />
        <div className="fm-chat-sheet">
          <div className="handle" aria-hidden="true" />
          {sheetOpen && renderPanel()}
        </div>
      </div>

      {/* 보상 모달 닫을 때 피날레 체크 로직 */}
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

      {/* 피날레 모달 렌더링 */}
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
    <Suspense fallback={<div className="fm-app flex h-screen items-center justify-center text-fm-gray-500">로딩 중...</div>}>
      <ChatContent />
    </Suspense>
  );
}