"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { COMPETENCY_ORDER, toKoreanCompetency } from '@/lib/competencyLabels';

/**
 * 자가진단(Self-Assessment) — AI 코칭 대화 시작 직전 단계.
 *
 * 여기서 받은 '스스로 매긴 점수'와 AI 분석 결과를 대조해 대상자의
 * 메타인지(자기 객관화) 격차를 산출한다. 그래서 반드시 대화 '이전'에
 * 받아야 하며, 코칭 대화에 영향을 주지 않도록 결과는 노출하지 않는다.
 *
 * 시각: FindME 리뉴얼 1C / SELF ASSESSMENT (STEP 01 눈썹 · 36px 라이트 2행 제목 ·
 * 역량 행: 번호+이름+설명 / 2px 트랙 슬라이더 / 우측 큰 숫자 · 주관식 · 평균 · 흰 CTA).
 * 유지: step 0.5, 눈금 1~5, 헤드라인 "지금 나는 어느 정도일까요?", 로직 전부.
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
  '1': '많이 부족',
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
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  // 자가진단은 진단의 부가 정보다. 저장 실패나 거부가 본 진단을 막지 않도록
  // 건너뛰기 경로를 열어 둔다.
  const handleSkip = () => router.push(chatUrl);

  return (
    <main className="fm-stage fm-rise min-h-screen text-white">
      <div className="mx-auto max-w-[1040px] px-6 md:px-12 pt-14 md:pt-[72px] pb-16 md:pb-[88px]">
        {/* 헤더 */}
        <div className="fm-eyebrow text-xs text-fm-gold">Step 01 · 자가진단</div>
        <h1 className="mt-6 text-[28px] md:text-4xl font-light leading-[1.35]">
          <span className="block text-white">대화를 시작하기 전에,</span>
          <span className="block text-fm-gold">지금 나는 어느 정도일까요?</span>
        </h1>
        <p className="mt-5 text-sm font-light leading-[1.8] text-fm-muted">
          정답은 없습니다. 지금 떠오르는 대로 솔직하게 표시해주세요.<br className="hidden md:block" />
          이 응답은 진단이 끝난 뒤 <span className="text-fm-text">&lsquo;스스로 보는 나&rsquo;와 &lsquo;대화에 드러난 나&rsquo;</span>를 비교하는 데 쓰입니다.
        </p>

        <form onSubmit={handleSubmit}>
          {/* 역량별 슬라이더 — 행 단위(구분선) */}
          <div className="mt-14 border-t border-fm-line">
            {COMPETENCIES.map((c, idx) => {
              const v = scores[c.key];
              const pct = ((v - 1) / 4) * 100;
              return (
                <div
                  key={c.key}
                  className="py-8 md:py-9 border-b border-fm-line flex flex-col md:flex-row gap-6 md:gap-12 md:items-start"
                >
                  <div className="md:w-[300px] shrink-0">
                    <div className="flex items-baseline gap-3">
                      <span className="fm-eyebrow text-xs text-fm-gold">{String(idx + 1).padStart(2, '0')}</span>
                      <h3 className="text-lg font-bold text-white">{c.name}</h3>
                    </div>
                    <p className="mt-2.5 text-[13px] font-light leading-[1.7] text-fm-muted">{c.desc}</p>
                  </div>

                  <div className="flex-1 md:pt-1.5 flex gap-6 items-start">
                    <div className="flex-1 min-w-0">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={0.5}
                        value={v}
                        onChange={(e) => setScore(c.key, Number(e.target.value))}
                        aria-label={`${c.name} 자가 평가 점수`}
                        className="fm-range"
                        style={{
                          // 값까지 골드, 나머지 라인 색 — 트랙 배경으로 주입
                          ['--fm-range-bg' as string]: `linear-gradient(to right, #B08D5C 0%, #B08D5C ${pct}%, #2C3037 ${pct}%, #2C3037 100%)`,
                        }}
                      />
                      {/* 눈금 1~5: 썸 반폭(6px)만큼 안쪽에서 (v-1)/4 위치에 중심 정렬 */}
                      <div className="relative mx-1.5 mt-3 h-4 text-[11px] text-fm-muted">
                        {[1, 2, 3, 4, 5].map((t) => (
                          <span
                            key={t}
                            className={`absolute -translate-x-1/2 ${t <= v ? 'text-fm-text' : ''}`}
                            style={{ left: `${((t - 1) / 4) * 100}%` }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-fm-muted">
                        <span>많이 부족</span><span>매우 자신 있음</span>
                      </div>
                    </div>

                    <div className="w-[72px] md:w-24 shrink-0 text-right">
                      <div className="text-[28px] md:text-[32px] font-light leading-none tabular-nums text-white">
                        {Number(v).toFixed(1)}
                      </div>
                      <div className="mt-2 text-[11px] text-fm-muted">{scoreLabel(v)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 주관식 */}
          <div className="mt-14">
            <div className="fm-eyebrow text-[11px] text-fm-muted">Open response</div>
            <label htmlFor="sw-text" className="mt-3 block text-base font-bold text-white">
              본인이 생각하는 리더로서의 가장 큰 강점과 약점을 짧게 적어주세요
            </label>
            <p className="mt-2 text-[13px] font-light leading-[1.7] text-fm-muted">
              길게 쓰지 않아도 괜찮습니다. 떠오르는 그대로 두세 문장이면 충분합니다.
            </p>
            <div className="mt-5 border-t border-b border-fm-line py-6">
              <textarea
                id="sw-text"
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                placeholder="예) 팀원들의 이야기를 끝까지 듣는 편이라 신뢰는 두터운 것 같습니다. 다만 결정을 미루다 타이밍을 놓칠 때가 있습니다."
                className="w-full resize-none bg-transparent text-[15px] font-light leading-[1.9] text-fm-text placeholder:text-fm-dim outline-none"
              />
              <div className="mt-4 text-right text-[11px] text-fm-muted tabular-nums">{text.length} / 2000</div>
            </div>
          </div>

          {/* 평균 */}
          <div className="mt-12 pt-8 border-t border-fm-line flex items-end justify-between">
            <span className="text-[13px] text-fm-text">나의 자가 평가 평균</span>
            <span className="flex items-baseline gap-2">
              <span className="text-[32px] font-light leading-none tabular-nums text-white">{average}</span>
              <span className="text-[13px] text-fm-muted">/ 5.0</span>
            </span>
          </div>

          {error && (
            <div className="mt-6 border-l-2 border-rose-400 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {/* 제출 / 건너뛰기 */}
          <div className="mt-10 flex flex-col items-center gap-5">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[52px] rounded bg-white text-black text-[15px] font-bold hover:bg-fm-gold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '저장 중입니다...' : '작성 완료, 코치와 대화 시작하기'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="text-[13px] text-fm-muted underline underline-offset-4 hover:text-white transition-colors disabled:opacity-50"
            >
              건너뛰고 바로 시작하기
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function SelfEvalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen fm-stage" />}>
      <SelfEvalContent />
    </Suspense>
  );
}
