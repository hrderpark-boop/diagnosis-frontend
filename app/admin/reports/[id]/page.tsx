"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '../../../../components/layouts/AdminLayout';
import {
  Pencil, Save, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft,
  ExternalLink, ShieldCheck, History,
} from 'lucide-react';
import {
  fetchReportDetail, updateReport, fetchAiOriginal,
  ReportDetail, ReportEditPayload,
} from '@/lib/adminApi';
import { getKeyToNameMap } from '@/lib/framework';

/**
 * 리포트 상세 + AI 피드백 교정 (Human-in-the-Loop).
 *
 * 교정 대상
 *   - 코치 피드백(comment), 강점/개선점, Gap Analysis
 *   - 심층 평가 근거(STAR)의 각 단계 description
 * 교정 제외
 *   - STAR 의 evidence(대화 원문 발췌). 리더의 실제 발화이므로 사람이
 *     고쳐 쓰면 근거가 훼손된다 → 읽기 전용으로만 보여준다.
 */

const STAR_STEPS = [
  { key: '1_situation', label: 'S — 상황 (Situation)' },
  { key: '2_action', label: 'A — 행동 (Action)' },
  { key: '3_result', label: 'R — 결과 (Result)' },
];

type Draft = Record<string, {
  comment: string;
  strength_point: string;
  growth_point: string;
  gap_analysis: string;
  reasoning: Record<string, string>;
}>;

const stepDescription = (rp: any, key: string): string => {
  const step = rp?.[key];
  if (!step) return '';
  if (typeof step === 'string') return step;         // 구버전 포맷
  return step.description || '';
};

const stepEvidence = (rp: any, key: string): string[] => {
  const step = rp?.[key];
  if (!step || typeof step === 'string') return [];
  return Array.isArray(step.evidence) ? step.evidence : [];
};

const textareaClass =
  'w-full rounded-lg border border-blue-600/50 bg-gray-900 px-3 py-2.5 text-sm leading-relaxed text-white outline-none transition-colors focus:border-blue-400';

export default function ReportEditPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = String(params?.id || '');

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [summaryDraft, setSummaryDraft] = useState('');

  const [originalView, setOriginalView] = useState<any>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  // 현재 리포트 값으로 편집 초안을 만든다.
  const buildDraft = useCallback((data: ReportDetail): Draft => {
    const d: Draft = {};
    Object.entries(data.details || {}).forEach(([key, value]: [string, any]) => {
      if (!value || typeof value !== 'object') return;
      const reasoning: Record<string, string> = {};
      STAR_STEPS.forEach((s) => {
        reasoning[s.key] = stepDescription(value.reasoning_process, s.key);
      });
      d[key] = {
        comment: value.comment || '',
        strength_point: value.strength_point || '',
        growth_point: value.growth_point || '',
        gap_analysis: typeof value.gap_analysis === 'string' ? value.gap_analysis : '',
        reasoning,
      };
    });
    return d;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, labelMap] = await Promise.all([
        fetchReportDetail(reportId),
        getKeyToNameMap().catch(() => ({} as Record<string, string>)),
      ]);
      setReport(data);
      setLabels(labelMap);
      setDraft(buildDraft(data));
      setSummaryDraft(data.summary || '');
    } catch (err: any) {
      setError(err?.response?.data?.detail || '리포트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [reportId, buildDraft]);

  useEffect(() => { if (reportId) load(); }, [reportId, load]);

  const startEdit = () => {
    if (report) {
      setDraft(buildDraft(report));
      setSummaryDraft(report.summary || '');
    }
    setSuccess('');
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    if (report) {
      setDraft(buildDraft(report));
      setSummaryDraft(report.summary || '');
    }
    setEditing(false);
  };

  const setField = (compKey: string, field: keyof Draft[string], value: string) => {
    setDraft((prev) => ({ ...prev, [compKey]: { ...prev[compKey], [field]: value } }));
  };

  const setReasoning = (compKey: string, stepKey: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [compKey]: {
        ...prev[compKey],
        reasoning: { ...prev[compKey].reasoning, [stepKey]: value },
      },
    }));
  };

  // 실제 변경된 값만 골라 전송한다(부분 갱신).
  const buildPayload = (): ReportEditPayload => {
    if (!report) return {};
    const payload: ReportEditPayload = {};

    if (summaryDraft.trim() !== (report.summary || '')) {
      payload.summary = summaryDraft;
    }

    const details: NonNullable<ReportEditPayload['details']> = {};
    Object.entries(draft).forEach(([compKey, d]) => {
      const source: any = report.details?.[compKey] || {};
      const entry: any = {};

      if (d.comment !== (source.comment || '')) entry.comment = d.comment;
      if (d.strength_point !== (source.strength_point || '')) entry.strength_point = d.strength_point;
      if (d.growth_point !== (source.growth_point || '')) entry.growth_point = d.growth_point;
      const srcGap = typeof source.gap_analysis === 'string' ? source.gap_analysis : '';
      if (d.gap_analysis !== srcGap) entry.gap_analysis = d.gap_analysis;

      const rp: Record<string, { description: string }> = {};
      STAR_STEPS.forEach((s) => {
        if (d.reasoning[s.key] !== stepDescription(source.reasoning_process, s.key)) {
          rp[s.key] = { description: d.reasoning[s.key] };
        }
      });
      if (Object.keys(rp).length > 0) entry.reasoning_process = rp;

      if (Object.keys(entry).length > 0) details[compKey] = entry;
    });

    if (Object.keys(details).length > 0) payload.details = details;
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = buildPayload();
      if (Object.keys(payload).length === 0) {
        setSuccess('변경된 내용이 없습니다.');
        setEditing(false);
        return;
      }
      const res = await updateReport(reportId, payload);
      setSuccess(`${res.message} (${res.changed_fields?.length ?? 0}개 항목)`);
      setEditing(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOriginal = async () => {
    if (originalView) { setOriginalView(null); return; }
    setLoadingOriginal(true);
    try {
      setOriginalView(await fetchAiOriginal(reportId));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'AI 원본을 불러오지 못했습니다.');
    } finally {
      setLoadingOriginal(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center text-gray-400">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> 리포트를 불러오는 중입니다...
        </div>
      </AdminLayout>
    );
  }

  if (!report) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/40 p-6 text-sm text-rose-300">
          {error || '리포트를 찾을 수 없습니다.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* 헤더 */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center text-sm text-gray-400 transition hover:text-white"
        >
          <ArrowLeft size={14} className="mr-1.5" /> 목록으로
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{report.user_name} 님 리포트</h2>
              {report.is_human_edited && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/20 px-2 py-1 text-[11px] font-bold text-emerald-300">
                  <ShieldCheck size={12} /> 검수 완료
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {report.company_name || '소속 미지정'} · 종합 {Number(report.total_score).toFixed(1)}점
              {report.created_at && ` · ${new Date(report.created_at).toLocaleDateString('ko-KR')}`}
            </p>
            {report.is_human_edited && report.edited_by && (
              <p className="mt-1 text-xs text-emerald-400/80">
                최종 교정: {report.edited_by}
                {report.edited_at && ` · ${new Date(report.edited_at).toLocaleString('ko-KR')}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/report?session_id=${report.session_id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-600"
            >
              <ExternalLink size={14} className="mr-1.5" /> 고객 화면 보기
            </a>

            {report.has_ai_original && (
              <button
                onClick={toggleOriginal}
                disabled={loadingOriginal}
                className="flex items-center rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-600 disabled:opacity-50"
              >
                {loadingOriginal ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <History size={14} className="mr-1.5" />}
                {originalView ? 'AI 원본 숨기기' : 'AI 원본 비교'}
              </button>
            )}

            {editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex items-center rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:opacity-50"
                >
                  <X size={14} className="mr-1.5" /> 취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                  저장 및 확정
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                <Pencil size={14} className="mr-1.5" /> ✏️ AI 피드백 교정
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 알림 */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-900/50 bg-green-950/40 p-4">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" />
          <p className="text-sm text-green-300">{success}</p>
        </div>
      )}
      {editing && (
        <div className="mb-6 rounded-lg border border-blue-900/50 bg-blue-950/30 p-4 text-sm text-blue-200">
          교정 모드입니다. 수정한 내용은 <strong>[저장 및 확정]</strong>을 눌러야 반영되며,
          최초 저장 시 AI 원본이 자동 보관되어 학습 데이터로 활용됩니다.
          <span className="mt-1 block text-xs text-blue-300/70">
            ※ &apos;관련 대화 발췌&apos;는 리더의 실제 발화라 교정 대상이 아닙니다.
          </span>
        </div>
      )}

      {/* 종합 피드백 */}
      <section className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-bold text-gray-200">종합 피드백</h3>
        {editing ? (
          <textarea
            rows={5}
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            className={textareaClass}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {report.summary || '-'}
          </p>
        )}
        {originalView?.summary && originalView.summary !== report.summary && (
          <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
            <span className="mb-1 block text-[11px] font-bold uppercase text-amber-400">AI 원본</span>
            <p className="whitespace-pre-wrap text-sm text-amber-100/80">{originalView.summary}</p>
          </div>
        )}
      </section>

      {/* 역량별 상세 */}
      <div className="space-y-6">
        {Object.entries(report.details || {}).map(([compKey, value]: [string, any]) => {
          if (!value || typeof value !== 'object') return null;
          const label = labels[compKey] || compKey;
          const d = draft[compKey];
          const orig = originalView?.details?.[compKey];

          return (
            <section key={compKey} className="rounded-xl border border-gray-700 bg-gray-800 p-6">
              <div className="mb-5 flex items-center justify-between border-b border-gray-700 pb-3">
                <h3 className="text-lg font-bold text-white">{label}</h3>
                <span className="rounded-md bg-blue-600/20 px-2.5 py-1 text-sm font-bold text-blue-300">
                  {Number(value.score ?? 0).toFixed(1)}점
                </span>
              </div>

              {/* 코치 피드백 */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                  코치 피드백
                </label>
                {editing && d ? (
                  <textarea
                    rows={4}
                    value={d.comment}
                    onChange={(e) => setField(compKey, 'comment', e.target.value)}
                    className={textareaClass}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                    {value.comment || '-'}
                  </p>
                )}
                {orig?.comment && orig.comment !== value.comment && (
                  <div className="mt-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
                    <span className="mb-1 block text-[11px] font-bold uppercase text-amber-400">AI 원본</span>
                    <p className="whitespace-pre-wrap text-sm text-amber-100/80">{orig.comment}</p>
                  </div>
                )}
              </div>

              {/* 강점 / 개선점 */}
              <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-emerald-500">강점</label>
                  {editing && d ? (
                    <textarea
                      rows={3}
                      value={d.strength_point}
                      onChange={(e) => setField(compKey, 'strength_point', e.target.value)}
                      className={textareaClass}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-300">{value.strength_point || '-'}</p>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-orange-500">개선 필요점</label>
                  {editing && d ? (
                    <textarea
                      rows={3}
                      value={d.growth_point}
                      onChange={(e) => setField(compKey, 'growth_point', e.target.value)}
                      className={textareaClass}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-gray-300">{value.growth_point || '-'}</p>
                  )}
                </div>
              </div>

              {/* 심층 평가 근거 (STAR) */}
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-5">
                <h4 className="mb-4 text-sm font-black uppercase tracking-wider text-gray-400">
                  심층 평가 근거 (STAR)
                </h4>
                <div className="space-y-5">
                  {STAR_STEPS.map((step) => {
                    const desc = stepDescription(value.reasoning_process, step.key);
                    const evidence = stepEvidence(value.reasoning_process, step.key);
                    const origDesc = orig ? stepDescription(orig.reasoning_process, step.key) : '';
                    if (!desc && !editing) return null;

                    return (
                      <div key={step.key} className="border-l-4 border-slate-600 pl-4">
                        <span className="mb-2 block text-xs font-black text-slate-400">{step.label}</span>
                        {editing && d ? (
                          <textarea
                            rows={5}
                            value={d.reasoning[step.key]}
                            onChange={(e) => setReasoning(compKey, step.key, e.target.value)}
                            className={textareaClass}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{desc || '-'}</p>
                        )}

                        {/* 발췌문 — 교정 불가(읽기 전용) */}
                        {evidence.length > 0 && (
                          <div className="mt-3 space-y-1.5 border-t border-gray-700 pt-3">
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">
                              관련 대화 발췌 (읽기 전용)
                            </span>
                            {evidence.map((ev: string, i: number) => (
                              <p key={i} className="border-l-2 border-gray-600 pl-3 text-xs italic text-gray-500">
                                &quot;{ev}&quot;
                              </p>
                            ))}
                          </div>
                        )}

                        {origDesc && origDesc !== desc && (
                          <div className="mt-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
                            <span className="mb-1 block text-[11px] font-bold uppercase text-amber-400">AI 원본</span>
                            <p className="whitespace-pre-wrap text-xs text-amber-100/80">{origDesc}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Gap Analysis */}
                <div className="mt-5 border-t border-gray-700 pt-4">
                  <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500">
                    Gap Analysis
                  </label>
                  {editing && d ? (
                    <textarea
                      rows={3}
                      value={d.gap_analysis}
                      onChange={(e) => setField(compKey, 'gap_analysis', e.target.value)}
                      className={textareaClass}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {typeof value.gap_analysis === 'string' ? value.gap_analysis : '-'}
                    </p>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </AdminLayout>
  );
}
