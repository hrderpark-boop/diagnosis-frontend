"use client";

import React, { useState, useEffect, Fragment } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Download, TrendingUp, Users, Loader2 } from 'lucide-react';
import { fetchCompetencyStats, fetchOverview, downloadExcel } from '@/lib/adminApi';

/**
 * 종합 리포트 (조직 단위 집계).
 *
 * 기존의 하드코딩 Mock(reportData 전사 평균, 키워드 네트워크 고정 노드,
 * 상관관계 고정 행렬, 자가진단 4.2 vs AI 3.8)은 전면 폐기했다.
 * 모든 수치는 /admin/stats/* 가 권한 범위에 맞춰 실제 리포트에서 집계한 값이다.
 * 표본이 부족해 통계적으로 의미가 없는 지표는 임의값을 만들지 않고
 * '데이터 부족' 상태를 그대로 노출한다.
 */

// ----------------------------------------------------------------------
// 1. Radar Chart — 동적 역량 목록 대응
// ----------------------------------------------------------------------
const RadarChart = ({ data }: { data: { competency: string; average: number }[] }) => {
  const stats = data.map((d) => ({ label: d.competency, value: d.average }));
  const size = 300;
  const center = size / 2;
  const radius = 90;
  const angleStep = (Math.PI * 2) / Math.max(1, stats.length);

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 5) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };
  const points = stats.map((stat, i) => getPoint(stat.value, i)).map((p) => `${p.x},${p.y}`).join(" ");

  if (stats.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-gray-500">집계할 리포트가 없습니다.</div>;
  }

  return (
    <div className="relative flex items-center justify-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        {[1, 2, 3, 4, 5].map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
        ))}
        {stats.map((_, i) => { const p = getPoint(5, i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#ffffff" strokeOpacity="0.1" />; })}
        <polygon points={points} fill="rgba(59, 130, 246, 0.4)" stroke="#60a5fa" strokeWidth="2" filter="url(#glow)" />
        {stats.map((stat, i) => { const p = getPoint(stat.value, i); return <circle key={i} cx={p.x} cy={p.y} r="3" fill="#93c5fd" />; })}
        {stats.map((stat, i) => {
          const p = getPoint(6, i);
          return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="#9ca3af" fontSize="12" fontWeight="bold">{stat.label}</text>;
        })}
        <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      </svg>
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. Keyword Network — 실제 리포트의 top_keywords 빈도 기반
// ----------------------------------------------------------------------
const KeywordNetworkChart = ({ keywords }: { keywords: { keyword: string; count: number }[] }) => {
  const nodes = keywords.slice(0, 6);
  const size = 320;
  const center = size / 2;
  const radius = 110;
  const maxCount = Math.max(1, ...nodes.map((n) => n.count));

  if (nodes.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center text-center text-sm text-gray-500">
        아직 추출된 키워드가 없습니다.<br />리포트가 생성되면 자동으로 집계됩니다.
      </div>
    );
  }

  return (
    <div className="flex h-[350px] items-center justify-center">
      <svg width={size} height={size} className="overflow-visible">
        <circle cx={center} cy={center} r="40" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="3" />
        <text x={center} y={center} dy="5" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">조직 DNA</text>

        {nodes.map((node, i) => {
          const angle = (360 / nodes.length) * i;
          const rad = (angle * Math.PI) / 180;
          const x = center + radius * Math.cos(rad);
          const y = center + radius * Math.sin(rad);
          const weight = node.count / maxCount; // 0~1 정규화
          return (
            <Fragment key={node.keyword}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth={1 + weight * 5} />
              <circle cx={x} cy={y} r={16 + weight * 12} fill="#0f172a" stroke="#a78bfa" strokeWidth="2.5" className="drop-shadow-lg" />
              <text x={x} y={y} dy="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="medium">{node.keyword}</text>
            </Fragment>
          );
        })}
      </svg>
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. Gap Analysis — 자가진단 평균(자기 인식) vs AI 분석 평균(실제 발현)
//    두 값 모두 실측이며, 자가진단 미제출 표본은 집계에서 제외된다.
// ----------------------------------------------------------------------
const GapComparisonChart = ({
  selfScore,
  aiScore,
  sampleSize,
}: {
  selfScore: number;
  aiScore: number;
  sampleSize: number;
}) => {
  if (sampleSize === 0) {
    return (
      <div className="flex h-[240px] w-full flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-400">아직 자가진단 응답이 없습니다.</p>
        <p className="mt-2 text-xs text-gray-500">
          대상자가 진단 시작 전 자가진단을 제출하면
          <br />자기 인식과 AI 분석 결과의 차이가 자동으로 산출됩니다.
        </p>
      </div>
    );
  }

  const gap = Number((selfScore - aiScore).toFixed(2));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / 5) * 100))}%`;

  return (
    <div className="flex h-full w-full flex-col justify-center px-2">
      {/* 두 개의 동심원으로 인식 차이를 직관적으로 표현 */}
      <div className="mb-6 flex justify-center">
        <div className="relative h-[150px] w-[150px]">
          <div className="absolute inset-0 rounded-full border border-dashed border-gray-700" />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500 bg-blue-500/25 transition-all duration-700"
            style={{ width: pct(aiScore), height: pct(aiScore) }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-pink-500 bg-pink-500/20 transition-all duration-700"
            style={{ width: pct(selfScore), height: pct(selfScore) }}
          />
        </div>
      </div>

      <div className="mb-4 flex justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-pink-500" />
          <span className="text-gray-400">
            자가진단 평균 <span className="font-bold text-white">{selfScore}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-gray-400">
            AI 분석 평균 <span className="font-bold text-white">{aiScore}</span>
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
          인식 격차 (자가 − AI)
        </span>
        <span
          className={`text-2xl font-black ${gap > 0 ? 'text-pink-400' : gap < 0 ? 'text-blue-400' : 'text-gray-300'}`}
        >
          {gap > 0 ? '+' : ''}{gap}
        </span>
        <span className="mt-1 block text-xs text-gray-500">
          {gap > 0.3
            ? '실제 발현보다 스스로를 높게 평가하는 경향'
            : gap < -0.3
              ? '실제 발현보다 스스로를 낮게 평가하는 경향(과소 인식)'
              : '자기 인식과 실제 발현이 대체로 일치'}
          {` · 표본 ${sampleSize}명`}
        </span>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 4. Correlation Heatmap — 실제 피어슨 상관계수
// ----------------------------------------------------------------------
const CorrelationHeatmap = ({
  competencies,
  correlations,
}: {
  competencies: string[];
  correlations: { a: string; b: string; coefficient: number }[];
}) => {
  if (competencies.length === 0 || correlations.length === 0) {
    return (
      <div className="flex h-[240px] w-full items-center justify-center text-center text-sm text-gray-500">
        상관관계 분석에는 최소 3건 이상의 리포트가 필요합니다.
      </div>
    );
  }

  const lookup = new Map<string, number>();
  correlations.forEach((c) => {
    lookup.set(`${c.a}|${c.b}`, c.coefficient);
    lookup.set(`${c.b}|${c.a}`, c.coefficient);
  });

  // 상관계수는 음수(-1)도 가능하므로 절대값으로 농도, 부호로 색상을 구분한다.
  const getColor = (v: number | undefined) => {
    if (v === undefined) return 'rgba(255,255,255,0.04)';
    const intensity = Math.min(1, Math.abs(v)) * 0.8 + 0.1;
    return v >= 0 ? `rgba(59, 130, 246, ${intensity})` : `rgba(244, 114, 182, ${intensity})`;
  };

  const short = (name: string) => name.replace('관리', '');

  return (
    <div className="flex flex-col items-center overflow-x-auto">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${competencies.length + 1}, minmax(0, 2.5rem))` }}>
        <div className="h-10 w-10" />
        {competencies.map((l) => (
          <div key={l} className="flex h-10 w-10 items-center justify-center text-xs font-bold text-gray-400">{short(l)}</div>
        ))}
        {competencies.map((rowName) => (
          <Fragment key={rowName}>
            <div className="flex h-10 w-10 items-center justify-center text-xs font-bold text-gray-400">{short(rowName)}</div>
            {competencies.map((colName) => {
              const isSelf = rowName === colName;
              const val = isSelf ? 1 : lookup.get(`${rowName}|${colName}`);
              return (
                <div
                  key={`${rowName}-${colName}`}
                  title={isSelf ? '' : `${rowName} ↔ ${colName}: ${val ?? '표본 부족'}`}
                  className="flex h-10 w-10 cursor-default items-center justify-center rounded-md text-[10px] text-white transition-all hover:scale-110"
                  style={{ backgroundColor: isSelf ? 'rgba(255,255,255,0.08)' : getColor(val) }}
                >
                  {isSelf ? '-' : (val ?? '·')}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [MAIN PAGE]
// ----------------------------------------------------------------------
const ReportsPage = () => {
  const [stats, setStats] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCompetencyStats(), fetchOverview()])
      .then(([s, o]) => { if (alive) { setStats(s); setOverview(o); } })
      .catch((err: any) => { if (alive) setError(err?.response?.data?.detail || '통계를 불러오지 못했습니다.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center text-gray-400">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> 조직 통계를 집계하는 중입니다...
        </div>
      </AdminLayout>
    );
  }

  const competencies: { competency: string; average: number }[] = stats?.competencies || [];
  const correlations = stats?.correlations || [];
  const keywords = stats?.keywords || [];
  const gapAnalysis = stats?.gap_analysis || { sample_size: 0, self_average: 0, ai_average: 0, by_competency: [] };
  const participantsCount = stats?.participants_count ?? 0;
  const totalAverage = stats?.total_average ?? 0;

  const sorted = [...competencies].sort((a, b) => b.average - a.average);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const topCorrelation = correlations[0];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl font-sans text-gray-100">

        {/* [섹션 1] 헤더 */}
        <div className="mb-10 flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <div className="mb-3 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
              Comprehensive Analysis
            </div>
            <h1 className="mb-2 text-4xl font-extrabold text-white">리더십 역량 종합 리포트</h1>
            <p className="flex items-center gap-2 text-gray-400">
              <Users size={16} />
              대상: {overview?.scope === 'all' ? '전체 고객사' : '자사'} 리더 {participantsCount}명
              {overview?.total_participants ? ` | 등록 대상자 ${overview.total_participants}명` : ''}
            </p>
          </div>
          <button
            onClick={() => downloadExcel().catch(() => alert('다운로드에 실패했습니다.'))}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition-all hover:bg-blue-500"
          >
            <Download size={16} className="mr-2" /> 데이터 내려받기
          </button>
        </div>

        {error && (
          <div className="mb-8 rounded-2xl border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">{error}</div>
        )}

        {participantsCount === 0 ? (
          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-16 text-center backdrop-blur-sm">
            <p className="text-lg font-bold text-white">아직 집계할 리포트가 없습니다.</p>
            <p className="mt-2 text-sm text-gray-400">
              진단이 완료되고 리포트가 생성되면 조직 단위 통계가 자동으로 산출됩니다.
            </p>
          </div>
        ) : (
          <>
            {/* [섹션 2] 핵심 지표 */}
            <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div className="relative flex flex-col items-center overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-sm">
                <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                <h3 className="mb-2 flex w-full items-center gap-2 self-start text-xl font-bold text-white">
                  <span className="h-6 w-1.5 rounded-full bg-blue-500"></span>
                  {overview?.scope === 'all' ? '전체' : '자사'} 역량 밸런스
                </h3>
                <RadarChart data={competencies} />
                <div className="mt-2 text-center">
                  <p className="mb-1 text-sm text-gray-400">Total Average Score</p>
                  <span className="text-4xl font-black tracking-tight text-white">
                    {totalAverage} <span className="text-lg font-normal text-gray-500">/ 5.0</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-8 shadow-2xl backdrop-blur-sm">
                <div>
                  <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
                    <TrendingUp className="text-blue-400" /> 집계 요약
                  </h3>
                  <p className="mb-6 text-lg leading-relaxed text-gray-300">
                    분석 대상 <span className="font-bold text-blue-400">{participantsCount}명</span>의
                    리더십 지수 평균은 <span className="font-bold text-blue-400">{totalAverage}점</span>입니다.
                    {best && worst && best.competency !== worst.competency && (
                      <>
                        <br /><br />
                        가장 높은 역량은 <strong className="text-white">{best.competency}({best.average})</strong>,
                        상대적으로 보강이 필요한 역량은 <strong className="text-red-300">{worst.competency}({worst.average})</strong>입니다.
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                    <span className="mb-1 block text-xs font-bold text-blue-300">BEST Strength</span>
                    <span className="text-xl font-bold text-white">
                      {best ? `${best.competency} (${best.average})` : '-'}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                    <span className="mb-1 block text-xs font-bold text-red-300">NEED Improvement</span>
                    <span className="text-xl font-bold text-white">
                      {worst ? `${worst.competency} (${worst.average})` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* [섹션 3] 조직 DNA 키워드 & 인식의 차이 */}
            <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">조직 DNA 키워드</h3>
                  <span className="rounded border border-indigo-500/30 bg-indigo-900/50 px-2 py-1 text-[10px] text-indigo-300">
                    리포트 {participantsCount}건
                  </span>
                </div>
                <KeywordNetworkChart keywords={keywords} />
                <p className="mt-4 text-center text-sm text-gray-400">
                  진단 리포트에서 추출된 핵심 키워드의 출현 빈도입니다. 원의 크기가 빈도에 비례합니다.
                </p>
              </div>

              <div className="flex flex-col rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">인식의 차이 (Gap Analysis)</h3>
                  <span className="rounded border border-pink-500/30 bg-pink-900/50 px-2 py-1 text-[10px] text-pink-300">
                    Self vs AI
                  </span>
                </div>
                <div className="flex-1">
                  <GapComparisonChart
                    selfScore={gapAnalysis.self_average ?? 0}
                    aiScore={gapAnalysis.ai_average ?? 0}
                    sampleSize={gapAnalysis.sample_size ?? 0}
                  />
                </div>
                <p className="mt-4 text-center text-sm text-gray-400">
                  진단 전 스스로 매긴 점수와 대화 분석 결과를 비교한 메타인지 지표입니다.
                </p>
              </div>
            </div>

            {/* 역량별 인식 격차 */}
            {gapAnalysis.sample_size > 0 && (
              <div className="mb-8 rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
                <h3 className="mb-6 text-lg font-bold text-white">역량별 인식 격차</h3>
                <div className="space-y-4">
                  {(gapAnalysis.by_competency || [])
                    .filter((g: any) => g.gap !== null)
                    .map((g: any) => {
                      const over = g.gap > 0;
                      return (
                        <div key={g.competency} className="flex flex-wrap items-center gap-4">
                          <span className="w-28 shrink-0 text-sm font-bold text-gray-300">
                            {g.competency}
                          </span>
                          <div className="flex flex-1 items-center gap-3 text-xs">
                            <span className="w-16 text-right text-pink-300">자가 {g.self_score}</span>
                            <div className="relative h-2 flex-1 rounded-full bg-gray-800">
                              <div
                                className="absolute inset-y-0 rounded-full bg-blue-500"
                                style={{ width: `${(g.ai_score / 5) * 100}%` }}
                              />
                              <div
                                className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-pink-400"
                                style={{ left: `${(g.self_score / 5) * 100}%` }}
                              />
                            </div>
                            <span className="w-16 text-blue-300">AI {g.ai_score}</span>
                          </div>
                          <span
                            className={`w-16 text-right text-sm font-black ${over ? 'text-pink-400' : 'text-blue-400'}`}
                          >
                            {over ? '+' : ''}{g.gap}
                          </span>
                        </div>
                      );
                    })}
                </div>
                <p className="mt-5 text-xs text-gray-500">
                  ※ 양수(+)는 실제 발현보다 스스로를 높게 평가한 역량, 음수(−)는 낮게 평가한 역량입니다.
                </p>
              </div>
            )}

            {/* [섹션 4] 역량 상관관계 */}
            <div className="mb-12 rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
              <div className="mb-8 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">역량 간 상관관계 분석</h3>
                <p className="text-sm text-gray-500">피어슨 상관계수 (파랑: 양의 상관 / 분홍: 음의 상관)</p>
              </div>
              <div className="flex flex-col items-center justify-center gap-12 md:flex-row">
                <CorrelationHeatmap
                  competencies={competencies.map((c) => c.competency)}
                  correlations={correlations}
                />
                <div className="max-w-xs text-sm text-gray-400">
                  <p className="mb-2">💡 <strong>인사이트:</strong></p>
                  {topCorrelation ? (
                    <p>
                      <strong>&apos;{topCorrelation.a}&apos;</strong>와 <strong>&apos;{topCorrelation.b}&apos;</strong>의
                      상관계수가 <span className="font-bold text-blue-400">{topCorrelation.coefficient}</span>로
                      가장 높게 나타났습니다. 두 역량이 함께 움직이는 경향이 있어, 한쪽을 개발하면
                      다른 쪽도 향상될 가능성이 큽니다.
                    </p>
                  ) : (
                    <p>표본이 3건 이상 쌓이면 역량 간 상관관계가 자동으로 산출됩니다.</p>
                  )}
                </div>
              </div>
            </div>

            {/* [섹션 5] 역량별 세부 통계 */}
            <div className="space-y-4 pb-20">
              <h3 className="mb-6 border-l-4 border-blue-500 px-2 pl-4 text-2xl font-bold text-white">역량별 상세 통계</h3>
              {sorted.map((c) => (
                <div key={c.competency} className="group flex flex-col items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:bg-white/5 md:flex-row">
                  <div className="mb-4 flex w-full items-center gap-5 md:mb-0 md:w-auto">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-gray-800 to-gray-900 text-lg font-bold shadow-lg transition-all group-hover:from-blue-600 group-hover:to-blue-700 group-hover:text-white">
                      {c.average}
                    </div>
                    <div>
                      <span className="block text-lg font-bold text-gray-200 group-hover:text-white">{c.competency}</span>
                      <span className="text-xs text-gray-500">표본 {c.average && (c as any).sample_size ? (c as any).sample_size : participantsCount}건 평균</span>
                    </div>
                  </div>

                  <div className="flex w-full items-center gap-4 md:w-1/2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.average / 5) * 100}%` }}></div>
                    </div>
                    <span className="w-12 text-right text-sm font-bold text-blue-400">{c.average}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ReportsPage;
