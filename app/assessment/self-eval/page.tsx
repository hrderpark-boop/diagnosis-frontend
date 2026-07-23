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
  '1': '많이 부족해요',
  '2': '조금 부족해요',
  '3': '보통이에요',
  '4': '잘하는 편이에요',
  '5': '매우 자신 있어요',
};

const scoreLabel = (v: number) => SCORE_LABELS[String(Math.round(v))] || '';

function SelfEvalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 세션 ID: 쿼리 우선, 없으면 진단 시작 시 저장해 둔 로컬 값으로 폴백
  const [sessionId, setSessionId] = useState<string>('');
  const [scores, setScores] = useState<Record<string, number>>(
    () => Object.fromEntries(COMPETENCIES.map((c) => [c.key, 3]))
  );
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fromQuery = searchParams.get('session_id');
    const fromStorage =
      typeof window !== 'undefined'
        ? localStorage.getItem('currentSessionId') || localStorage.getItem('session_id')
        : null;
    setSessionId(fromQuery || fromStorage || '');
  }, [searchParams]);

  // 자가진단을 마친 뒤 이동할 채팅 URL (진단 시작 단계에서 받은 파라미터 보존)
  const chatUrl = useMemo(() => {
    const params = new URLSearchParams();
    ['diagnosis_id', 'session_id', 'coach_name', 'coach_img', 'initial_message'].forEach((k) => {
      const v = searchParams.get(k);
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return qs ? `/chat?${qs}` : '/chat';
  }, [searchParams]);

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
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
        '자가진단 저장에 실패했습니다. 잠시 후 다시 시도해주세요.'
      );
      setSubmitting(false);
    }
  };

  // 자가진단은 진단의 부가 정보다. 저장 실패나 거부가 본 진단을 막지 않도록
  // 건너뛰기 경로를 열어 둔다.
  const handleSkip = () => router.push(chatUrl);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        {/* 헤더 */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-blue-700">
            Step 1 · 자가진단
          </div>
          <h1 className="mb-3 text-3xl font-black leading-tight text-slate-900 md:text-4xl">
            대화를 시작하기 전에,<br />
            <span className="text-blue-600">스스로를 어떻게 보고 계신가요?</span>
          </h1>
          <p className="text-base leading-relaxed text-slate-600">
            정답은 없습니다. 지금 떠오르는 대로 솔직하게 표시해주세요.<br />
            이 응답은 진단이 끝난 뒤 <strong className="text-slate-800">&lsquo;스스로 보는 나&rsquo;와 &lsquo;대화에 드러난 나&rsquo;</strong>를
            비교하는 데 쓰입니다.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 역량별 슬라이더 */}
          <div className="mb-6 space-y-4">
            {COMPETENCIES.map((c, idx) => (
              <div
                key={c.key}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-black text-white">
                        {idx + 1}
                      </span>
                      <h3 className="text-lg font-black text-slate-900">{c.name}</h3>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">{c.desc}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-black tabular-nums text-blue-600">
                      {scores[c.key].toFixed(1)}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      {scoreLabel(scores[c.key])}
                    </div>
                  </div>
                </div>

                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={scores[c.key]}
                  onChange={(e) => setScore(c.key, Number(e.target.value))}
                  aria-label={`${c.name} 자가 평가 점수`}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
                />
                <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
                  <span>1 · 많이 부족</span>
                  <span>3 · 보통</span>
                  <span>5 · 매우 자신 있음</span>
                </div>
              </div>
            ))}
          </div>

          {/* 주관식 */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label htmlFor="sw-text" className="mb-2 block text-lg font-black text-slate-900">
              본인이 생각하는 리더로서의 가장 큰 강점과 약점을 짧게 적어주세요
            </label>
            <p className="mb-4 text-sm text-slate-500">
              길게 쓰지 않아도 괜찮습니다. 떠오르는 그대로 두세 문장이면 충분합니다.
            </p>
            <textarea
              id="sw-text"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder="예) 팀원들의 이야기를 끝까지 듣는 편이라 신뢰는 두터운 것 같습니다. 다만 결정을 미루다 타이밍을 놓칠 때가 있습니다."
              className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base leading-relaxed text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
            <div className="mt-1.5 text-right text-xs text-slate-400">{text.length} / 2000</div>
          </div>

          {/* 요약 + 제출 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <span className="text-sm font-bold text-slate-600">나의 자가 평가 평균</span>
              <span className="text-2xl font-black tabular-nums text-slate-900">
                {average} <span className="text-base font-bold text-slate-400">/ 5.0</span>
              </span>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-4 text-base font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? '저장 중입니다...' : '작성 완료, 코치와 대화 시작하기'}
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="mt-3 w-full py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <SelfEvalContent />
    </Suspense>
  );
}
