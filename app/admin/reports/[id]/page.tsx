"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../../components/layouts/AdminLayout';
import {
  Pencil, Save, X, Loader2, ArrowLeft, ExternalLink, History, MessageSquare,
} from 'lucide-react';
import TranscriptModal from '../../../../components/admin/TranscriptModal';
import {
  fetchReportDetail, updateReport, fetchAiOriginal,
  ReportDetail, ReportEditPayload,
} from '@/lib/adminApi';
import { toKoreanCompetency } from '@/lib/competencyLabels';

/**
 * 리포트 상세 + AI 피드백 교정 (Human-in-the-Loop).
 *
 * 교정 대상
 *   - 코치 피드백(comment), 강점/개선점, Gap Analysis
 *   - 심층 평가 근거(STAR)의 각 단계 description
 * 교정 제외
 *   - STAR 의 evidence(대화 원문 발췌). 리더의 실제 발화이므로 사람이
 *     고쳐 쓰면 근거가 훼손된다 → 읽기 전용으로만 보여준다.
 * 화면은 관리자 콘솔 라이트 디자인(fa- 클래스, 딥 네이비 + 파랑 3단)을 따른다.
 */

const STAR_STEPS = [
  { key: '1_situation', label: 'S · 상황 (Situation)' },
  { key: '2_action', label: 'A · 행동 (Action)' },
  { key: '3_result', label: 'R · 결과 (Result)' },
];

type Draft = Record<string, {
  comment: string;
  strength_point: string;
  growth_point: string;
  gap_analysis: string;
  reasoning: Record<string, string>;
}>;

// 역량별 상세(details[역량]) 중 이 화면이 쓰는 필드
type DetailValue = {
  score?: number | null;
  comment?: string;
  strength_point?: string;
  growth_point?: string;
  gap_analysis?: unknown;
  reasoning_process?: unknown;
  consistency_flags?: string[];
};
type StepValue = string | { description?: string; evidence?: string[] } | null | undefined;
type OriginalView = { summary?: string; details?: Record<string, DetailValue> } | null;

const stepOf = (rp: unknown, key: string): StepValue =>
  rp && typeof rp === 'object' ? (rp as Record<string, StepValue>)[key] : undefined;

const stepDescription = (rp: unknown, key: string): string => {
  const step = stepOf(rp, key);
  if (!step) return '';
  if (typeof step === 'string') return step;         // 구버전 포맷
  return step.description || '';
};

const stepEvidence = (rp: unknown, key: string): string[] => {
  const step = stepOf(rp, key);
  if (!step || typeof step === 'string') return [];
  return Array.isArray(step.evidence) ? step.evidence : [];
};

const errorDetail = (err: unknown) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

/** AI 원본(교정 전) 비교 상자 */
const OriginalBox = ({ text, small }: { text: string; small?: boolean }) => (
  <div className="mt-3" style={{ background: 'var(--fa-tint)', borderRadius: 8, padding: '12px 14px' }}>
    <span className="mb-1 block" style={{ fontSize: 12, fontWeight: 700, color: 'var(--fa-mid)' }}>AI 원본</span>
    <p className="whitespace-pre-wrap" style={{ fontSize: small ? 13 : 14, lineHeight: 1.7, color: 'var(--fa-navy)' }}>{text}</p>
  </div>
);

/** 섹션 안 항목 라벨 */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-2 block" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fa-gray)' }}>{children}</span>
);

const bodyText: React.CSSProperties = { fontSize: 14.5, lineHeight: 1.8, color: 'var(--fa-body)' };

export default function ReportEditPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = String(params?.id || '');

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [summaryDraft, setSummaryDraft] = useState('');

  const [originalView, setOriginalView] = useState<OriginalView>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // 현재 리포트 값으로 편집 초안을 만든다.
  const buildDraft = useCallback((data: ReportDetail): Draft => {
    const d: Draft = {};
    Object.entries(data.details || {}).forEach(([key, raw]) => {
      if (!raw || typeof raw !== 'object') return;
      const value = raw as DetailValue;
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
      const data = await fetchReportDetail(reportId);
      setReport(data);
      setDraft(buildDraft(data));
      setSummaryDraft(data.summary || '');
    } catch (err: unknown) {
      setError(errorDetail(err) || '리포트를 불러오지 못했습니다.');
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
      const source: DetailValue = report.details?.[compKey] || {};
      const entry: NonNullable<ReportEditPayload['details']>[string] = {};

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
    } catch (err: unknown) {
      setError(errorDetail(err) || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOriginal = async () => {
    if (originalView) { setOriginalView(null); return; }
    setLoadingOriginal(true);
    try {
      setOriginalView(await fetchAiOriginal(reportId));
    } catch (err: unknown) {
      setError(errorDetail(err) || 'AI 원본을 불러오지 못했습니다.');
    } finally {
      setLoadingOriginal(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <AdminPageHead eyebrow="개인 리포트" title="리포트" />
        <div className="fa-empty flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> 리포트를 불러오는 중입니다…
        </div>
      </AdminLayout>
    );
  }

  if (!report) {
    return (
      <AdminLayout>
        <AdminPageHead
          eyebrow="개인 리포트"
          title="리포트"
          actions={<button type="button" className="fa-btn" onClick={() => router.back()}><ArrowLeft /> 목록으로</button>}
        />
        <div className="fa-error">{error || '리포트를 찾을 수 없습니다.'}</div>
      </AdminLayout>
    );
  }

  const meta = [
    report.company_name || '소속 미지정',
    `종합 ${Number(report.total_score).toFixed(1)}점`,
    report.created_at ? new Date(report.created_at).toLocaleDateString('ko-KR') : null,
  ].filter(Boolean).join(' · ');

  return (
    <AdminLayout>
      {/* 머리: 네이비 면 + 이름 */}
      <AdminPageHead
        eyebrow={
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
            <ArrowLeft size={14} /> 목록으로
          </button>
        }
        title={`${report.user_name} 님 리포트`}
        desc={
          <>
            {meta}
            {report.is_human_edited && report.edited_by && (
              <span className="block" style={{ marginTop: 4, fontSize: 13 }}>
                최종 교정: {report.edited_by}
                {report.edited_at && ` · ${new Date(report.edited_at).toLocaleString('ko-KR')}`}
              </span>
            )}
          </>
        }
        actions={
          <>
            {report.is_human_edited && (
              <span className="fa-chip" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>검수 완료</span>
            )}
            <button type="button" className="fa-btn" onClick={() => setTranscriptOpen(true)}>
              <MessageSquare /> 전체 대화 기록
            </button>
            <a href={`/report?session_id=${report.session_id}`} target="_blank" rel="noreferrer" className="fa-btn" style={{ textDecoration: 'none' }}>
              <ExternalLink /> 고객 화면 보기
            </a>
            {report.has_ai_original && (
              <button type="button" className="fa-btn" onClick={toggleOriginal} disabled={loadingOriginal}>
                {loadingOriginal ? <Loader2 className="animate-spin" /> : <History />}
                {originalView ? 'AI 원본 숨기기' : 'AI 원본 비교'}
              </button>
            )}
            {editing ? (
              <>
                <button type="button" className="fa-btn" onClick={cancelEdit} disabled={saving}>
                  <X /> 취소
                </button>
                <button type="button" className="fa-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />} 저장 및 확정
                </button>
              </>
            ) : (
              <button type="button" className="fa-btn primary" onClick={startEdit}>
                <Pencil /> AI 피드백 교정
              </button>
            )}
          </>
        }
      />

      {/* 알림 */}
      {error && <div className="fa-error fa-section" role="alert">{error}</div>}
      {success && <div className="fa-note fa-section" role="status">{success}</div>}
      {editing && (
        <div className="fa-note fa-section">
          교정 모드입니다. 수정한 내용은 <strong>[저장 및 확정]</strong>을 눌러야 반영되며,
          최초 저장 시 AI 원본이 자동 보관되어 학습 데이터로 활용됩니다.
          <span className="mt-1 block" style={{ fontSize: 12.5, opacity: 0.8 }}>
            ※ &apos;관련 대화 발췌&apos;는 리더의 실제 발화라 교정 대상이 아닙니다.
          </span>
        </div>
      )}

      {/* 대상자 자가진단: 대화 시작 전 본인이 직접 입력한 내용 */}
      <section className="fa-card pad fa-section">
        <div className="fa-cap">
          <div><h3>대상자 자가진단</h3><p>대화 시작 전 본인이 직접 입력한 점수와 서술</p></div>
          {report.self_assessment && (
            <span className="fa-chip tint">
              자가 평균 {report.self_assessment.self_average}점 · AI {Number(report.total_score).toFixed(1)}점
            </span>
          )}
        </div>

        {!report.self_assessment ? (
          <p className="fa-muted" style={{ fontSize: 14 }}>
            이 대상자는 자가진단을 제출하지 않았습니다. (진단 시작 전 단계에서 건너뛴 경우)
          </p>
        ) : (
          <div className="space-y-6">
            {/* 역량별 자가 점수 vs AI 점수 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(report.self_assessment.scores).map(([key, selfScore]) => {
                const aiScore = report.radar_chart?.[key];
                const gap = typeof aiScore === 'number' ? Number((selfScore - aiScore).toFixed(1)) : null;
                return (
                  <div key={key} style={{ background: 'var(--fa-soft)', border: '1px solid var(--fa-line)', borderRadius: 10, padding: '14px 16px' }}>
                    <div className="mb-2" style={{ fontSize: 13, fontWeight: 600 }}>{toKoreanCompetency(key)}</div>
                    <div className="fa-num flex items-baseline gap-2" style={{ fontSize: 14 }}>
                      <span style={{ color: 'var(--fa-bright)', fontWeight: 600 }}>자가 {selfScore}</span>
                      <span className="fa-muted">/</span>
                      <span style={{ color: 'var(--fa-navy)', fontWeight: 600 }}>
                        AI {typeof aiScore === 'number' ? aiScore.toFixed(1) : '-'}
                      </span>
                      {gap !== null && (
                        <span className="ml-auto" style={{ fontSize: 13, fontWeight: 700, color: gap > 0 ? 'var(--fa-bright)' : gap < 0 ? 'var(--fa-navy)' : 'var(--fa-gray3)' }}>
                          {gap > 0 ? '+' : ''}{gap}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 주관식 강약점: 대상자 본인의 문장 */}
            <div>
              <FieldLabel>본인이 서술한 강점 &amp; 약점</FieldLabel>
              {report.self_assessment.strength_weakness_text ? (
                <blockquote style={{ ...bodyText, margin: 0, padding: '14px 18px', borderLeft: '3px solid var(--fa-bright)', background: 'var(--fa-soft)', borderRadius: '0 8px 8px 0' }}>
                  {report.self_assessment.strength_weakness_text}
                </blockquote>
              ) : (
                <p className="fa-muted" style={{ fontSize: 14 }}>주관식 응답 없음</p>
              )}
              <p className="fa-muted mt-2" style={{ fontSize: 12 }}>
                ※ 대상자가 직접 작성한 원문입니다. 교정 대상이 아닙니다.
                {report.self_assessment.submitted_at &&
                  ` · 제출 ${new Date(report.self_assessment.submitted_at).toLocaleString('ko-KR')}`}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 종합 피드백 */}
      <section className="fa-card pad fa-section">
        <div className="fa-cap"><div><h3>종합 피드백</h3></div></div>
        {editing ? (
          <textarea rows={5} value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} className="fa-textarea" />
        ) : (
          <p className="whitespace-pre-wrap" style={bodyText}>{report.summary || '-'}</p>
        )}
        {originalView?.summary && originalView.summary !== report.summary && (
          <OriginalBox text={originalView.summary} />
        )}
      </section>

      {/* 역량별 상세 */}
      <div className="space-y-6">
        {Object.entries(report.details || {}).map(([compKey, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const value = raw as DetailValue;
          const label = toKoreanCompetency(compKey);
          const d = draft[compKey];
          const orig = originalView?.details?.[compKey];

          return (
            <section key={compKey} className="fa-card pad">
              <div className="mb-6 flex items-end justify-between gap-3 pb-3" style={{ borderBottom: '1px solid var(--fa-ink)' }}>
                <h3>{label}</h3>
                <span className="fa-num" style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, color: 'var(--fa-navy)' }}>
                  {Number(value.score ?? 0).toFixed(1)}<span className="fa-muted" style={{ fontSize: 13, marginLeft: 4 }}>점</span>
                </span>
              </div>
              {/* 2026-09-17 직무 일관성 참고 플래그(관리자 뷰 전용, 점수 무관): 온보딩에서 말한 담당 업무와
                  명백히 무관한 직무 사례가 근거로 쓰인 하위역량 */}
              {Array.isArray(value.consistency_flags) && value.consistency_flags.length > 0 && (
                <div className="fa-note mb-5" style={{ fontSize: 13 }}>
                  직무 일관성 확인 필요: 담당 업무와 무관해 보이는 사례가 근거로 쓰였습니다.{' '}
                  <strong>{value.consistency_flags.join(', ')}</strong>
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>(점수에는 반영되지 않음)</span>
                </div>
              )}

              {/* 코치 피드백 */}
              <div className="mb-6">
                <FieldLabel>코치 피드백</FieldLabel>
                {editing && d ? (
                  <textarea rows={4} value={d.comment} onChange={(e) => setField(compKey, 'comment', e.target.value)} className="fa-textarea" />
                ) : (
                  <p className="whitespace-pre-wrap" style={bodyText}>{value.comment || '-'}</p>
                )}
                {orig?.comment && orig.comment !== value.comment && <OriginalBox text={orig.comment} />}
              </div>

              {/* 강점 / 개선점 */}
              <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <span className="fa-chip tint mb-2">강점</span>
                  {editing && d ? (
                    <textarea rows={3} value={d.strength_point} onChange={(e) => setField(compKey, 'strength_point', e.target.value)} className="fa-textarea" />
                  ) : (
                    <p style={bodyText}>{value.strength_point || '-'}</p>
                  )}
                </div>
                <div>
                  <span className="fa-chip line mb-2">개선 필요점</span>
                  {editing && d ? (
                    <textarea rows={3} value={d.growth_point} onChange={(e) => setField(compKey, 'growth_point', e.target.value)} className="fa-textarea" />
                  ) : (
                    <p style={bodyText}>{value.growth_point || '-'}</p>
                  )}
                </div>
              </div>

              {/* 심층 평가 근거 (STAR) */}
              <div style={{ background: 'var(--fa-soft)', borderRadius: 10, padding: '22px 24px' }}>
                <h4 className="mb-4" style={{ fontSize: 14.5, fontWeight: 700 }}>심층 평가 근거 (STAR)</h4>
                <div className="space-y-5">
                  {STAR_STEPS.map((step) => {
                    const desc = stepDescription(value.reasoning_process, step.key);
                    const evidence = stepEvidence(value.reasoning_process, step.key);
                    const origDesc = orig ? stepDescription(orig.reasoning_process, step.key) : '';
                    if (!desc && !editing) return null;

                    return (
                      <div key={step.key} className="pl-4" style={{ borderLeft: '3px solid var(--fa-navy)' }}>
                        <span className="mb-2 block" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fa-mid)' }}>{step.label}</span>
                        {editing && d ? (
                          <textarea rows={5} value={d.reasoning[step.key]} onChange={(e) => setReasoning(compKey, step.key, e.target.value)} className="fa-textarea" />
                        ) : (
                          <p className="whitespace-pre-wrap" style={bodyText}>{desc || '-'}</p>
                        )}

                        {/* 발췌문: 교정 불가(읽기 전용) */}
                        {evidence.length > 0 && (
                          <div className="mt-3 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--fa-line)' }}>
                            <span className="block" style={{ fontSize: 12, fontWeight: 600, color: 'var(--fa-gray3)' }}>
                              관련 대화 발췌 (읽기 전용)
                            </span>
                            {evidence.map((ev, i) => (
                              <p key={i} className="pl-3 italic" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--fa-gray)', borderLeft: '2px solid var(--fa-line)' }}>
                                &quot;{ev}&quot;
                              </p>
                            ))}
                          </div>
                        )}

                        {origDesc && origDesc !== desc && <OriginalBox text={origDesc} small />}
                      </div>
                    );
                  })}
                </div>

                {/* Gap Analysis */}
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--fa-line)' }}>
                  <FieldLabel>Gap Analysis</FieldLabel>
                  {editing && d ? (
                    <textarea rows={3} value={d.gap_analysis} onChange={(e) => setField(compKey, 'gap_analysis', e.target.value)} className="fa-textarea" />
                  ) : (
                    <p className="whitespace-pre-wrap" style={bodyText}>
                      {typeof value.gap_analysis === 'string' ? value.gap_analysis : '-'}
                    </p>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* 전체 대화 기록 모달 */}
      <TranscriptModal
        sessionId={report.session_id}
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
      />
    </AdminLayout>
  );
}
