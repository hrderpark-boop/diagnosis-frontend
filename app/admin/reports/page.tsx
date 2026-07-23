"use client";

import React, { useState, useEffect, Fragment } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Download, TrendingUp, Users, Loader2, ChevronDown } from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { fetchCompetencyStats, fetchOverview, downloadExcel } from '@/lib/adminApi';
import {
  toKoreanCompetency, toShortCompetency, sortByCompetencyOrder,
} from '@/lib/competencyLabels';

/**
 * 종합 리포트 (조직 단위 집계).
 *
 * 모든 수치는 /admin/stats/* 가 권한 범위에 맞춰 실제 리포트에서 집계한 값이다.
 * 표본이 부족해 통계적으로 의미가 없는 지표는 임의값을 만들지 않고
 * '데이터 부족' 상태를 그대로 노출한다.
 */

// ----------------------------------------------------------------------
// 1. Radar Chart — 전사 역량 밸런스
// ----------------------------------------------------------------------
const RadarChart = ({ data }: { data: { competency: string; average: number }[] }) => {
  const stats = data.map((d) => ({ label: toShortCompetency(d.competency), value: d.average }));
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
// 2. 조직 DNA — Treemap (빈도가 높을수록 큰 사각형)
// ----------------------------------------------------------------------
const TREEMAP_COLORS = ['#1d4ed8', '#2563eb', '#4f46e5', '#6366f1', '#7c3aed', '#8b5cf6', '#0ea5e9', '#0284c7'];

const TreemapCell = (props: any) => {
  const { x, y, width, height, index, name, count } = props;
  if (width <= 0 || height <= 0) return null;

  // 사각형이 작으면 라벨이 넘쳐 깨지므로 표시 여부를 크기로 판단한다
  const showLabel = width > 54 && height > 32;
  const showCount = width > 70 && height > 50;

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        style={{
          fill: TREEMAP_COLORS[index % TREEMAP_COLORS.length],
          stroke: '#0f172a',
          strokeWidth: 3,
        }}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showCount ? 7 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={Math.min(16, Math.max(11, width / 7))}
          fontWeight="bold"
        >
          {name}
        </text>
      )}
      {showCount && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.75)"
          fontSize="11"
        >
          {count}회
        </text>
      )}
    </g>
  );
};

const KeywordTreemap = ({ keywords }: { keywords: { keyword: string; count: number }[] }) => {
  if (!keywords || keywords.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-center text-sm text-gray-500">
        아직 추출된 키워드가 없습니다.<br />리포트가 생성되면 자동으로 집계됩니다.
      </div>
    );
  }

  const data = keywords.map((k) => ({ name: k.keyword, size: k.count, count: k.count }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke="#0f172a"
          content={<TreemapCell />}
        >
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: '1px solid #374151' }}
            formatter={(value: any) => [`${value}회 언급`, '출현 빈도']}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. Gap Analysis — 자가진단 평균 vs AI 분석 평균
// ----------------------------------------------------------------------
const GapComparisonChart = ({
  selfScore, aiScore, sampleSize,
}: { selfScore: number; aiScore: number; sampleSize: number }) => {
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
          <span className="text-gray-400">자가진단 평균 <span className="font-bold text-white">{selfScore}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-gray-400">AI 분석 평균 <span className="font-bold text-white">{aiScore}</span></span>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
          인식 격차 (자가 − AI)
        </span>
        <span className={`text-2xl font-black ${gap > 0 ? 'text-pink-400' : gap < 0 ? 'text-blue-400' : 'text-gray-300'}`}>
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
  competencies, correlations,
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

  const getColor = (v: number | undefined) => {
    if (v === undefined) return 'rgba(255,255,255,0.04)';
    const intensity = Math.min(1, Math.abs(v)) * 0.8 + 0.1;
    return v >= 0 ? `rgba(59, 130, 246, ${intensity})` : `rgba(244, 114, 182, ${intensity})`;
  };

  return (
    <div className="overflow-x-auto">
      {/* 셀 크기 확대(2.5rem → 4rem)로 가독성 확보 */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `5rem repeat(${competencies.length}, minmax(0, 4rem))` }}
      >
        <div className="h-16 w-20" />
        {competencies.map((l) => (
          <div key={l} className="flex h-16 items-center justify-center text-xs font-bold text-gray-400">
            {toShortCompetency(l)}
          </div>
        ))}
        {competencies.map((rowName) => (
          <Fragment key={rowName}>
            <div className="flex h-16 w-20 items-center justify-end pr-2 text-xs font-bold text-gray-400">
              {toShortCompetency(rowName)}
            </div>
            {competencies.map((colName) => {
              const isSelf = rowName === colName;
              const val = isSelf ? 1 : lookup.get(`${rowName}|${colName}`);
              return (
                <div
                  key={`${rowName}-${colName}`}
                  title={isSelf ? '' : `${toKoreanCompetency(rowName)} ↔ ${toKoreanCompetency(colName)}: ${val ?? '표본 부족'}`}
                  className="flex h-16 cursor-default items-center justify-center rounded-lg text-sm font-bold text-white transition-all hover:scale-105"
                  style={{ backgroundColor: isSelf ? 'rgba(255,255,255,0.08)' : getColor(val) }}
                >
                  {isSelf ? '–' : (val ?? '·')}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

/** 상관계수 강도에 따른 실무 해석 문구 생성 */
const correlationInsight = (c: { a: string; b: string; coefficient: number } | undefined) => {
  if (!c) return null;
  const a = toKoreanCompetency(c.a);
  const b = toKoreanCompetency(c.b);
  const v = c.coefficient;
  const abs = Math.abs(v);

  if (v >= 0.8) {
    return {
      tone: 'text-blue-300',
      title: `${a} · ${b} — 강한 시너지 (r=${v})`,
      body: `두 역량이 사실상 함께 성장하는 구조입니다. 한쪽을 집중 개발하면 다른 쪽도 동반 상승할 가능성이 큽니다. 교육 예산을 두 과정에 나누기보다 ${a} 중심의 통합 프로그램으로 묶고, 리더 선발 시에도 두 역량을 하나의 지표로 평가하는 편이 효율적입니다.`,
    };
  }
  if (v >= 0.5) {
    return {
      tone: 'text-blue-300',
      title: `${a} · ${b} — 뚜렷한 양의 상관 (r=${v})`,
      body: `상당수 리더에게서 두 역량이 함께 나타납니다. ${b}가 취약한 리더는 ${a}에서도 어려움을 겪을 확률이 높으므로, 개별 코칭 시 두 영역을 함께 진단하는 것이 좋습니다.`,
    };
  }
  if (v <= -0.5) {
    return {
      tone: 'text-pink-300',
      title: `${a} · ${b} — 상충 관계 (r=${v})`,
      body: `한쪽이 높을수록 다른 쪽이 낮아지는 경향입니다. 조직이 ${a}에 과도한 압력을 주면서 ${b}가 희생되고 있지는 않은지 점검이 필요합니다. 두 역량을 동시에 요구하는 평가 체계라면 리더에게 상충 신호를 주고 있을 수 있습니다.`,
    };
  }
  if (abs < 0.3) {
    return {
      tone: 'text-gray-300',
      title: `${a} · ${b} — 독립적 (r=${v})`,
      body: `두 역량 사이에 뚜렷한 연관이 없습니다. 각각 별도의 개발 접근이 필요하며, 하나를 키운다고 다른 하나가 따라오지 않습니다.`,
    };
  }
  return {
    tone: 'text-gray-300',
    title: `${a} · ${b} — 약한 상관 (r=${v})`,
    body: `약한 연관성이 관찰되지만 단독으로 의사결정 근거로 삼기에는 부족합니다. 표본이 더 쌓이면 경향이 뚜렷해질 수 있습니다.`,
  };
};

// ----------------------------------------------------------------------
// 5. 역량별 상세 아코디언 (전사 평균 기준)
// ----------------------------------------------------------------------
const SubRadar = ({ subScores }: { subScores: Record<string, number | null> }) => {
  const stats = Object.entries(subScores || {})
    .filter(([, v]) => typeof v === 'number')
    .map(([label, value]) => ({ label, value: value as number }));

  if (stats.length < 3) {
    return <div className="flex h-[220px] items-center justify-center text-xs text-gray-500">세부 역량 데이터가 부족합니다.</div>;
  }

  const size = 220;
  const center = size / 2;
  const radius = 62;
  const angleStep = (Math.PI * 2) / stats.length;
  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 5) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };
  const points = stats.map((s, i) => getPoint(s.value, i)).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} className="overflow-visible">
        {[1, 3, 5].map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(' ')} fill="none" stroke="#ffffff" strokeOpacity="0.08" />
        ))}
        {stats.map((_, i) => { const p = getPoint(5, i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#ffffff" strokeOpacity="0.08" />; })}
        <polygon points={points} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="2" />
        {stats.map((s, i) => { const p = getPoint(s.value, i); return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#10b981" />; })}
        {stats.map((s, i) => {
          const p = getPoint(6.8, i);
          return (
            <g key={i}>
              <text x={p.x} y={p.y - 8} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize="11" fontWeight="700">{s.label}</text>
              <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize="11" fontWeight="800">{s.value.toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const BreakdownBars = ({ breakdown }: { breakdown: any }) => {
  if (!breakdown) return null;
  const items = [
    { label: '행동 지표 평가', value: breakdown.rubric_base, max: 4.0, color: 'bg-blue-400' },
    { label: 'STAR 깊이', value: breakdown.star_depth_bonus, max: 0.5, color: 'bg-emerald-400', prefix: '+' },
    { label: '확신도', value: breakdown.confidence_adj, max: 0.5, color: (breakdown.confidence_adj ?? 0) >= 0 ? 'bg-violet-400' : 'bg-rose-400', prefix: (breakdown.confidence_adj ?? 0) >= 0 ? '+' : '' },
  ].filter((i) => typeof i.value === 'number');

  if (items.length === 0) {
    return <p className="text-xs text-gray-500">점수 산출 근거 데이터가 없습니다.</p>;
  }

  const ratio = (v: number, max: number) => Math.max(0, Math.min(100, (Math.abs(v) / max) * 100));

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs font-semibold text-gray-400">{item.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${ratio(item.value, item.max)}%` }} />
          </div>
          <span className="w-14 text-right text-xs font-bold text-gray-300 tabular-nums">
            {item.prefix || ''}{Number(item.value).toFixed(2)}
          </span>
        </div>
      ))}
      {typeof breakdown.final === 'number' && (
        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-xs font-bold text-gray-400">전사 평균 최종 점수</span>
          <span className="text-base font-black text-blue-400">{Number(breakdown.final).toFixed(2)} / 5.0</span>
        </div>
      )}
      <p className="pt-1 text-[11px] leading-relaxed text-gray-600">
        행동 지표 평가 : 역량 발현이 행동으로 증명된 정도 (1.0~4.0) · STAR 깊이 : 사례의 구체성 가산 (0~+0.5) ·
        확신도 : 근거 일관성에 따른 조정 (±0.5)
        <br />※ 각 막대는 5.0 만점이 아닌 해당 항목의 최대치를 기준으로 표시됩니다.
      </p>
    </div>
  );
};

const CompetencyAccordion = ({
  item, isOpen, onToggle,
}: { item: any; isOpen: boolean; onToggle: () => void }) => {
  const dist = item.distribution || { high: 0, mid: 0, low: 0 };
  const total = dist.high + dist.mid + dist.low;
  const subScores: Record<string, number | null> = item.sub_scores || {};
  const subEntries = Object.entries(subScores).filter(([, v]) => typeof v === 'number') as [string, number][];

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all ${isOpen ? 'border-blue-500/40 bg-white/[0.05]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="flex items-center gap-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-white/20 bg-gray-900">
            <span className="text-lg font-black tabular-nums text-white">{item.average}</span>
          </div>
          <div>
            <span className="block text-lg font-black text-white">{toKoreanCompetency(item.competency)}</span>
            <span className="block text-sm text-gray-400">
              표본 {item.sample_size}명 · 세부 역량 {subEntries.length}개
              {total > 0 && ` · 우수 ${dist.high}명 / 보통 ${dist.mid}명 / 보완 ${dist.low}명`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden w-40 md:block">
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(item.average / 5) * 100}%` }} />
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-white/10 bg-black/20 px-6 py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 점수 분포 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="mb-4 border-b border-white/10 pb-2 text-sm font-black text-white">조직 내 점수 분포</h4>
              {total === 0 ? (
                <p className="text-xs text-gray-500">분포 데이터가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: '우수 (4.0 이상)', value: dist.high, color: 'bg-emerald-500' },
                    { label: '보통 (3.0~3.9)', value: dist.mid, color: 'bg-blue-500' },
                    { label: '보완 필요 (3.0 미만)', value: dist.low, color: 'bg-rose-500' },
                  ].map((d) => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-xs text-gray-400">{d.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                        <div className={`h-full rounded-full ${d.color}`} style={{ width: `${(d.value / total) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs font-bold text-gray-300">{d.value}명</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 점수 산출 근거 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="mb-4 border-b border-white/10 pb-2 text-sm font-black text-white">점수 산출 근거 (전사 평균)</h4>
              <BreakdownBars breakdown={item.score_breakdown} />
            </div>

            {/* 세부 역량 분석 — 좌 스파이더 / 우 막대 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:col-span-2">
              <h4 className="mb-4 border-b border-white/10 pb-2 text-center text-sm font-black text-white">세부 역량 분석 (전사 평균)</h4>
              {subEntries.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">세부 역량 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
                  <SubRadar subScores={subScores} />
                  <div className="space-y-4">
                    {subEntries.map(([name, value]) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 text-sm font-semibold text-gray-300">{name}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(value / 5) * 100}%` }} />
                        </div>
                        <span className="w-10 text-right text-sm font-black text-emerald-400 tabular-nums">{value.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 강점 / 개선 필요점 발췌 */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="mb-3 border-b border-white/10 pb-2 text-sm font-black text-emerald-400">강점 (구성원 리포트 발췌)</h4>
              {(item.strength_samples || []).length === 0 ? (
                <p className="text-xs text-gray-500">발췌할 내용이 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {item.strength_samples.map((s: string, i: number) => (
                    <li key={i} className="border-l-2 border-emerald-600/50 pl-3 text-xs leading-relaxed text-gray-300">{s}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h4 className="mb-3 border-b border-white/10 pb-2 text-sm font-black text-orange-400">개선 필요점 (구성원 리포트 발췌)</h4>
              {(item.growth_samples || []).length === 0 ? (
                <p className="text-xs text-gray-500">발췌할 내용이 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {item.growth_samples.map((s: string, i: number) => (
                    <li key={i} className="border-l-2 border-orange-600/50 pl-3 text-xs leading-relaxed text-gray-300">{s}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="mt-4 text-[11px] text-gray-600">
            ※ 강점·개선점은 개인별 서술이라 평균을 낼 수 없어, 구성원 리포트에서 익명으로 발췌한 예시입니다.
          </p>
        </div>
      )}
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
  const [openKey, setOpenKey] = useState<string | null>(null);

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

  const competencies: any[] = sortByCompetencyOrder(stats?.competencies || []);
  const correlations = stats?.correlations || [];
  const keywords = stats?.keywords || [];
  const gapAnalysis = stats?.gap_analysis || { sample_size: 0, self_average: 0, ai_average: 0, by_competency: [] };
  const participantsCount = stats?.participants_count ?? 0;
  const totalAverage = stats?.total_average ?? 0;

  const sorted = [...competencies].sort((a, b) => b.average - a.average);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const insight = correlationInsight(correlations[0]);

  // 조직 평균 대비 편차가 큰 역량 (서술형 요약 보강용)
  const spread = best && worst ? Number((best.average - worst.average).toFixed(2)) : 0;

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

              {/* 역량 진단 결과 요약 — 경영진용 서술형 */}
              <div className="flex flex-col justify-between rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-8 shadow-2xl backdrop-blur-sm">
                <div>
                  <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
                    <TrendingUp className="text-blue-400" /> 역량 진단 결과 요약
                  </h3>
                  <div className="space-y-4 text-lg leading-relaxed text-gray-300">
                    {best && worst && best.competency !== worst.competency ? (
                      <>
                        <p>
                          가장 뛰어난 역량은 <strong className="text-blue-300">{toKoreanCompetency(best.competency)}({best.average}점)</strong>으로
                          조직의 강점이나, <strong className="text-red-300">{toKoreanCompetency(worst.competency)}({worst.average}점)</strong> 부문은
                          상대적으로 보완이 시급합니다.
                        </p>
                        <p className="text-base text-gray-400">
                          분석 대상 {participantsCount}명의 종합 평균은 {totalAverage}점이며, 최고·최저 역량 간
                          격차는 {spread}점입니다.
                          {spread >= 1.0
                            ? ' 역량 간 편차가 커 특정 영역에 집중된 성장 지원이 필요합니다.'
                            : spread >= 0.5
                              ? ' 역량 간 편차가 완만해 균형 잡힌 리더십 구조를 보이고 있습니다.'
                              : ' 역량 전반이 고르게 분포해 있어, 조직 차원의 공통 과제 설정이 유효합니다.'}
                        </p>
                        {worst.distribution?.low > 0 && (
                          <p className="text-base text-gray-400">
                            특히 {toKoreanCompetency(worst.competency)}에서 3.0점 미만인 리더가 {worst.distribution.low}명 확인되어,
                            해당 인원에 대한 우선 코칭을 권고합니다.
                          </p>
                        )}
                      </>
                    ) : (
                      <p>
                        분석 대상 {participantsCount}명의 종합 평균은 {totalAverage}점입니다.
                        역량 간 유의미한 편차를 판단하려면 표본이 더 필요합니다.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                    <span className="mb-1 block text-xs font-bold text-blue-300">최고 강점 역량</span>
                    <span className="text-xl font-bold text-white">
                      {best ? `${toKoreanCompetency(best.competency)} (${best.average})` : '-'}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                    <span className="mb-1 block text-xs font-bold text-red-300">보완 시급 역량</span>
                    <span className="text-xl font-bold text-white">
                      {worst ? `${toKoreanCompetency(worst.competency)} (${worst.average})` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* [섹션 3] 조직 DNA 트리맵 & 인식의 차이 */}
            <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">조직 DNA 키워드</h3>
                  <span className="rounded border border-indigo-500/30 bg-indigo-900/50 px-2 py-1 text-[10px] text-indigo-300">
                    리포트 {participantsCount}건
                  </span>
                </div>
                <KeywordTreemap keywords={keywords} />
                <p className="mt-4 text-center text-sm text-gray-400">
                  리포트에서 추출된 행동·성향 키워드입니다. 사각형이 클수록 자주 언급된 특성입니다.
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
                          <span className="w-24 shrink-0 text-sm font-bold text-gray-300">
                            {toKoreanCompetency(g.competency)}
                          </span>
                          <div className="flex flex-1 items-center gap-3 text-xs">
                            <span className="w-16 text-right text-pink-300">자가 {g.self_score}</span>
                            <div className="relative h-2 flex-1 rounded-full bg-gray-800">
                              <div className="absolute inset-y-0 rounded-full bg-blue-500" style={{ width: `${(g.ai_score / 5) * 100}%` }} />
                              <div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-pink-400" style={{ left: `${(g.self_score / 5) * 100}%` }} />
                            </div>
                            <span className="w-16 text-blue-300">AI {g.ai_score}</span>
                          </div>
                          <span className={`w-16 text-right text-sm font-black ${over ? 'text-pink-400' : 'text-blue-400'}`}>
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

            {/* [섹션 4] 역량 상관관계 — 차트 좌측 정렬 + 인사이트 확대 */}
            <div className="mb-12 rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-white">역량 간 상관관계 분석</h3>
                <p className="text-sm text-gray-500">피어슨 상관계수 (파랑: 양의 상관 / 분홍: 음의 상관)</p>
              </div>
              {/* 좌: 매트릭스(좌측 정렬) / 우: 인사이트(넓게) */}
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                <div className="flex justify-start lg:col-span-6">
                  <CorrelationHeatmap
                    competencies={competencies.map((c) => c.competency)}
                    correlations={correlations}
                  />
                </div>
                <div className="lg:col-span-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="mb-3 flex items-center gap-2 text-base font-bold text-white">
                      💡 인사이트
                    </p>
                    {insight ? (
                      <>
                        <p className={`mb-2 text-sm font-bold ${insight.tone}`}>{insight.title}</p>
                        <p className="text-sm leading-relaxed text-gray-300">{insight.body}</p>

                        {correlations.length > 1 && (
                          <div className="mt-5 border-t border-white/10 pt-4">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                              그 밖의 주요 관계
                            </p>
                            <ul className="space-y-1.5">
                              {correlations.slice(1, 4).map((c: any) => (
                                <li key={`${c.a}-${c.b}`} className="flex items-center justify-between text-xs text-gray-400">
                                  <span>{toKoreanCompetency(c.a)} ↔ {toKoreanCompetency(c.b)}</span>
                                  <span className={`font-bold ${c.coefficient >= 0 ? 'text-blue-300' : 'text-pink-300'}`}>
                                    r = {c.coefficient}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="mt-4 text-[11px] leading-relaxed text-gray-600">
                          ※ 상관계수는 인과관계가 아닌 동반 변동 경향을 의미합니다. 표본({participantsCount}명)이
                          커질수록 해석의 신뢰도가 높아집니다.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">
                        표본이 3건 이상 쌓이면 역량 간 상관관계와 실무 해석이 자동으로 산출됩니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* [섹션 5] 역량별 상세 — 아코디언 */}
            <div className="space-y-3 pb-20">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="border-l-4 border-blue-500 pl-4 text-2xl font-bold text-white">역량별 상세 분석</h3>
                <button
                  onClick={() => setOpenKey(openKey === 'ALL' ? null : 'ALL')}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold text-gray-300 transition hover:bg-white/10"
                >
                  {openKey === 'ALL' ? '전체 닫기' : '전체 펼치기'}
                </button>
              </div>

              {competencies.map((item) => (
                <CompetencyAccordion
                  key={item.competency}
                  item={item}
                  isOpen={openKey === 'ALL' || openKey === item.competency}
                  onToggle={() =>
                    setOpenKey(
                      openKey === item.competency || openKey === 'ALL' ? null : item.competency
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ReportsPage;
