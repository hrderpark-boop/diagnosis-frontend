"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { COMPETENCY_ORDER, toKoreanCompetency } from '@/lib/competencyLabels';
import { clearRestoreCandidate, readRestoreCandidate, type RestoreCandidate } from '@/lib/restoreCandidate';
import ParticipantHeader, { ParticipantMobileStep } from '@/components/participant/ParticipantHeader';
import ParticipantFooter from '@/components/participant/ParticipantFooter';
import './self-eval.css';

/**
 * 자가진단(Self-Assessment) — AI 코칭 대화 시작 직전 단계.
 *
 * 여기서 받은 '스스로 매긴 점수'와 AI 분석 결과를 대조해 대상자의
 * 메타인지(자기 객관화) 격차를 산출한다. 그래서 반드시 대화 '이전'에
 * 받아야 하며, 코칭 대화에 영향을 주지 않도록 결과는 노출하지 않는다.
 *
 * 시각: 라이트 리디자인 B (design/light-sample/b/self-eval.html). 문항 카드 + 1~5 세그먼트 버튼.
 * 유지: 초기값 3, 언제든 제출 가능, PATCH 페이로드, 되돌리기 배너 로직. 건너뛰기 버튼은 2026-10-22 사용자 요청으로 제거.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

// 백엔드 COMPETENCY_FRAMEWORK 와 동일한 영문 키를 사용해야
// AI 점수(radar_chart)와 역량 단위로 정렬 비교가 가능하다.
const COMPETENCY_DESCRIPTIONS: Record<string, string> = {
  organization_management: '조직의 방향을 세우고 체계를 만드는 역량',
  performance_management: '목표를 설정하고 성과를 이끌어내는 역량',
  people_management: '구성원을 육성하고 동기를 부여하는 역량',
  work_management: '업무를 효율적으로 설계하고 실행하는 역량',
  self_management: '스스로를 성찰하고 지속 성장하는 역량',
};

const COMPETENCIES = COMPETENCY_ORDER.map((key) => ({
  key,
  name: toKoreanCompetency(key),
  desc: COMPETENCY_DESCRIPTIONS[key],
}));

const SCORE_LABELS: Record<string, string> = {
  '1': '매우 부족',
  '2': '부족',
  '3': '보통',
  '4': '자신 있음',
  '5': '매우 자신 있음',
};

const scoreLabel = (v: number) => SCORE_LABELS[String(Math.round(v))] || '';

function SelfEvalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 세션 ID: 쿼리 우선, 없으면 진단 시작 시 저장해 둔 로컬 값으로 폴백
  //   (state+effect 대신 파생값 — effect 안 setState lint 해소. 렌더에 직접 쓰이지 않음)
  const sessionId = useMemo(() => {
    const fromQuery = searchParams.get('session_id');
    const fromStorage =
      typeof window !== 'undefined'
        ? localStorage.getItem('currentSessionId') || localStorage.getItem('session_id')
        : null;
    return fromQuery || fromStorage || '';
  }, [searchParams]);
  const [scores, setScores] = useState<Record<string, number>>(
    () => Object.fromEntries(COMPETENCIES.map((c) => [c.key, 3]))
  );
  // 헤더 표시 전용: 참여 확인 단계에서 저장한 이름을 읽기만 한다.
  const [participantName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('participant_name') || '' : ''
  );
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 4(a) 즉시 되돌리기: '새로 시작' 직후(첫 메시지 전)에만 뜨는 배너. 후보의 new_session_id 가
  //   지금 세션과 같을 때만 — 다른 경로로 들어온 자가진단에는 뜨지 않는다.
  const [restoreCand, setRestoreCand] = useState<RestoreCandidate | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const c = readRestoreCandidate();
    setRestoreCand(c && sessionId && c.new_session_id === sessionId ? c : null);
  }, [sessionId]);

  // 보관된 세션을 in_progress 로 복원하고(방금 만든 빈 세션은 abandoned), 그 코치의 채팅으로 간다.
  const handleRestore = async () => {
    if (!restoreCand || restoring) return;
    const pid = localStorage.getItem('participant_id');
    if (!pid) return;
    setRestoring(true);
    try {
      const r = await axios.post(`${API_BASE_URL}/diagnoses/restore`, { session_id: restoreCand.session_id });
      clearRestoreCandidate();
      // 복원된 세션으로 /start → 재개 응답(마지막 코치 메시지·코치) → 채팅
      const TEMPLATE_ID = process.env.NEXT_PUBLIC_DEFAULT_TEMPLATE_ID || '10000000-0000-0000-0000-000000000008';
      const st = await axios.post(`${API_BASE_URL}/diagnoses/start`, {
        coach_id: r.data.coach_id, participant_id: pid, template_id: TEMPLATE_ID,
      });
      let avatar = '';
      try {
        const cs = await axios.get(`${API_BASE_URL}/coaches`);
        avatar = (cs.data as Array<{ id: string; avatar_url: string }>).find((c) => c.id === r.data.coach_id)?.avatar_url || '';
      } catch { /* 아바타는 기본 이미지로 */ }
      const name = st.data.coach_name || r.data.coach_name;
      const msg = st.data.coach_response_message || '';
      const q = `diagnosis_id=${st.data.diagnosis_id || st.data.session_id}&session_id=${st.data.session_id}&coach_name=${name}&coach_img=${encodeURIComponent(avatar)}&initial_message=${encodeURIComponent(msg)}&resumed=1`;
      router.push(`/chat?${q}`);
    } catch (err) {
      console.error(err);
      setRestoring(false);
      setError('이전 진단을 되돌리지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.');
    }
  };

  // 자가진단을 마친 뒤 이동할 채팅 URL (진단 시작 단계에서 받은 파라미터 보존)
  //   ※ 아래 게이트 effect 보다 먼저 선언(선언 전 접근 lint 해소).
  const chatUrl = useMemo(() => {
    const params = new URLSearchParams();
    ['diagnosis_id', 'session_id', 'coach_name', 'coach_img', 'initial_message'].forEach((k) => {
      const v = searchParams.get(k);
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return qs ? `/chat?${qs}` : '/chat';
  }, [searchParams]);

  // 🐛 백업 게이트: 재개 등으로 이미 자가진단을 제출한 세션이면 설문을 다시
  //   보여주지 않고 곧바로 채팅으로 넘긴다(직접 URL 진입·start 우회 대비).
  useEffect(() => {
    if (!sessionId) return;
    axios.get(`${API_BASE_URL}/sessions/${sessionId}/self-eval`)
      .then((r) => { if (r.data?.submitted) router.replace(chatUrl); })
      .catch(() => {});
  }, [sessionId, chatUrl, router]);

  const average = useMemo(() => {
    const values = Object.values(scores);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  }, [scores]);

  const setScore = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setError('진단 세션 정보를 찾을 수 없습니다. 코치 선택 화면부터 다시 시작해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await axios.patch(`${API_BASE_URL}/sessions/${sessionId}/self-eval`, {
        scores,
        strength_weakness_text: text.trim() || null,
      });
      router.push(chatUrl);
    } catch (err: unknown) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      setError(
        (typeof detail === 'string' && detail) ||
        '자가진단 저장에 실패했습니다. 잠시 후 다시 시도해주세요.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="fm-app">
      <ParticipantHeader
        step={4}
        right={
          <>
            {participantName && <span className="user">{participantName} 님</span>}
            {participantName && <span className="sep" />}
            <Link href="/">나가기</Link>
          </>
        }
      />
      <main className="fm-self-page fm-enter">
        <div className="fm-wrap">
          <ParticipantMobileStep step={4} />

          {/* 4(a) 되돌리기 배너: 새로 시작 직후, 첫 메시지 전까지만 */}
          {restoreCand && (
            <div className="fm-card fm-self-restore">
              <p>
                <b>{restoreCand.coach_name.split('(')[0].trim()}</b> 코치와의 이전 진단을 보관했습니다.
                실수라면 이전 진단으로 돌아갈 수 있습니다.
              </p>
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoring}
                className="fm-btn secondary sm"
              >
                {restoring ? '되돌리는 중…' : '이전 진단으로 돌아가기'}
              </button>
            </div>
          )}

          {/* 섹션 머리 */}
          <div className="fm-sec-head">
            <div className="fm-eyebrow">Step 04 · Self assessment</div>
            <h1>
              대화를 시작하기 전에,
              <br />
              지금 나는 어디에 있을까요?
            </h1>
            <p className="fm-self-lead">
              정답은 없습니다. 지금 떠오르는 대로 솔직하게 표시해 주세요.{' '}
              <br />
              이 응답은 진단이 끝난 뒤 &lsquo;스스로 생각한 나&rsquo;와 &lsquo;대화에 드러난 나&rsquo;를 비교하는 데 쓰입니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="fm-self-col">
            {/* 진행 행: 응답 추적 로직이 없으므로 문항 수와 평균만 정적으로 보여 준다 */}
            <div className="fm-self-progress">
              <div className="row">
                <div className="left">
                  역량 <span>5</span>문항
                </div>
                <div className="avg">
                  <span className="k">자가 평가 평균</span>
                  <b>{average}</b>
                  <span className="max">/ 5.0</span>
                </div>
              </div>
            </div>

            {/* 문항 카드: 1~5, 0.5 단위 세그먼트 버튼 */}
            <div className="fm-self-qs">
              {COMPETENCIES.map((c, idx) => {
                const v = scores[c.key];
                return (
                  <article key={c.key} className="fm-card fm-self-q">
                    <div className="head">
                      <span className="fm-num">{String(idx + 1).padStart(2, '0')}</span>
                      <div>
                        <h2>{c.name}</h2>
                        <p>{c.desc}</p>
                      </div>
                    </div>
                    <div className="fm-self-seg" role="group" aria-label={`${c.name} 자가 평가 점수`}>
                      {/* 기존 슬라이더와 같은 0.5 단위: 정수 칸은 넓게, 0.5 칸은 좁게 */}
                      {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((t) => {
                        const half = t % 1 !== 0;
                        return (
                          <button
                            key={t}
                            type="button"
                            className={half ? 'half' : undefined}
                            aria-pressed={v === t}
                            aria-label={`${t} ${scoreLabel(t)}`}
                            onClick={() => setScore(c.key, t)}
                          >
                            {half ? t.toFixed(1) : t}
                          </button>
                        );
                      })}
                    </div>
                    <div className="fm-self-ends">
                      <span>매우 부족</span>
                      <span>매우 자신 있음</span>
                    </div>
                    <div className="fm-self-val">
                      <span className="k">현재 선택</span>
                      <span className="fm-num">{Number(v).toFixed(1)}</span>
                      <span>{scoreLabel(v)}</span>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* 자유응답 */}
            <section className="fm-card fm-self-open">
              <div className="fm-eyebrow">Open response <span className="opt">선택</span></div>
              <div className="fm-field">
                <label htmlFor="sw-text">본인이 생각하는 리더로서의 가장 큰 강점과 약점을 짧게 적어주세요</label>
                <p className="help">선택 항목입니다. 비워 두어도 대화를 시작할 수 있고, 적는다면 두세 문장이면 충분합니다.</p>
                <textarea
                  id="sw-text"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  placeholder="예) 팀원들의 이야기를 끝까지 듣는 편이라 신뢰는 두터운 것 같습니다. 다만 결정을 미루다 타이밍을 놓칠 때가 있습니다."
                />
              </div>
              <div className="fm-caption count">{text.length} / 2000</div>
            </section>

            {error && <div className="fm-self-error" role="alert">{error}</div>}

            {/* 제출 */}
            <div className="fm-self-submit">
              <button type="submit" disabled={submitting} className="fm-btn block">
                {submitting ? '저장 중입니다...' : '대화 시작하기'}
              </button>
            </div>
          </form>
        </div>
      </main>
      <ParticipantFooter />
    </div>
  );
}

export default function SelfEvalPage() {
  return (
    <Suspense fallback={<div className="fm-app min-h-screen" />}>
      <SelfEvalContent />
    </Suspense>
  );
}
