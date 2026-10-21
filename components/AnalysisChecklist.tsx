'use client';

import { AnalysisEstimate, AnalysisProgress, StepStatus, formatElapsed } from '@/lib/analysisProgress';

// A-4: 리포트 준비 단계표 — 5개 챕터 + 종합. 스피너 대신 '무엇이 끝났고 무엇을
//   하는 중인지'를 보여준다. 진행 상태(progress)가 오기 전에는 estimate 의 캐시
//   정보로 사전분석이 끝난 챕터를 곧바로 ✓ 로 표시한다.
const STEP_TEXT: Record<StepStatus, string> = {
  done: '분석 완료',
  running: '분석 중…',
  pending: '대기',
  failed: '실패',
};

function Mark({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return <span className="w-4 text-center text-fm-accent font-bold" aria-hidden="true">✓</span>;
  }
  if (status === 'running') {
    return (
      <span className="w-4 flex justify-center" aria-hidden="true">
        <span className="w-2 h-2 rounded-full bg-fm-accent" style={{ animation: 'wave 1.4s ease-in-out infinite' }} />
      </span>
    );
  }
  if (status === 'failed') {
    return <span className="w-4 text-center text-fm-danger" aria-hidden="true">!</span>;
  }
  return <span className="w-4 flex justify-center" aria-hidden="true"><span className="w-2 h-2 rounded-full border border-fm-gray-300" /></span>;
}

export default function AnalysisChecklist({
  progress,
  estimate,
}: {
  progress: AnalysisProgress | null;
  estimate: AnalysisEstimate | null;
}) {
  const rows: { key: string; name: string; status: StepStatus }[] =
    progress?.chapters?.length
      ? progress.chapters.map((c) => ({ key: c.key, name: c.name, status: c.status }))
      : (estimate?.chapters ?? []).map((c) => ({
          key: c.key,
          name: c.name,
          status: (c.cached ? 'done' : 'running') as StepStatus,
        }));
  const summaryStatus: StepStatus = progress?.summary_status ?? 'pending';
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return (
    <div className="w-full max-w-[360px] rounded-lg border border-fm-gray-100 bg-fm-paper shadow-[var(--fm-shadow-sm)] px-5 py-4 text-left" aria-live="polite">
      <ol className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5 text-[13px]">
            <Mark status={r.status} />
            <span className={r.status === 'pending' ? 'text-fm-gray-300' : 'text-fm-ink'}>
              {r.name} {STEP_TEXT[r.status]}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 text-[13px] pt-1 mt-1 border-t border-fm-gray-100">
          <Mark status={summaryStatus} />
          <span className={summaryStatus === 'pending' ? 'text-fm-gray-300' : 'text-fm-ink'}>
            종합 리포트 {summaryStatus === 'done' ? '작성 완료' : summaryStatus === 'running' ? '작성 중…' : summaryStatus === 'failed' ? '실패' : '대기'}
          </span>
        </li>
      </ol>
      <div className="mt-3 h-1 w-full rounded-full bg-fm-paper-mute overflow-hidden" aria-hidden="true">
        <div className="h-full bg-fm-accent transition-all duration-700" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-fm-gray-500">
        {progress ? `${percent}% · ${formatElapsed(progress.elapsed_s)} 경과` : '분석을 시작하고 있어요'}
        {estimate ? ` · 예상 ${estimate.eta_label}` : ''}
      </p>
    </div>
  );
}
