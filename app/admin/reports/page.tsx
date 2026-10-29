"use client";

import React, { Suspense, useState, useEffect, Fragment } from 'react';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import ScopeFilter, { useScope } from '../../../components/admin/ScopeFilter';
import { Download, Loader2, ChevronDown } from 'lucide-react';
import {
  Treemap, ResponsiveContainer, Tooltip as RechartsTooltip,
  RadarChart as ReRadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import {
  fetchCompetencyStats, fetchOverview, downloadExcel, fetchOrgStats,
  OrgLevel, OrgStats, OrgStatRow,
} from '@/lib/adminApi';
import './reports-org.css';
import { toKoreanCompetency, sortByCompetencyOrder } from '@/lib/competencyLabels';

/**
 * 종합 리포트 (조직 단위 집계).
 *
 * 모든 수치는 /admin/stats/* 가 권한 범위에 맞춰 실제 리포트에서 집계한 값이다.
 * 표본이 부족해 통계적으로 의미가 없는 지표는 임의값을 만들지 않고
 * '데이터 부족' 상태를 그대로 노출한다.
 * 화면은 관리자 콘솔 라이트 디자인(fa- 클래스, 딥 네이비 + 파랑 3단)을 따른다.
 */

// ----------------------------------------------------------------------
// 응답 형태 (/admin/stats/competencies · /admin/stats/overview)
// ----------------------------------------------------------------------
type Distribution = { high: number; mid: number; low: number };
type Breakdown = {
  rubric_base?: number | null;
  star_depth_bonus?: number | null;
  confidence_adj?: number | null;
  final?: number | null;
};
type CompetencyItem = {
  competency: string;
  average: number;
  sample_size: number;
  distribution?: Distribution;
  sub_scores?: Record<string, number | null>;
  score_breakdown?: Breakdown | null;
  strength_samples?: string[];
  growth_samples?: string[];
};
type Correlation = { a: string; b: string; coefficient: number };
type GapRow = { competency: string; self_score: number; ai_score: number; gap: number | null };
type GapAnalysis = { sample_size: number; self_average: number; ai_average: number; by_competency: GapRow[] };
type CompetencyStats = {
  competencies?: CompetencyItem[];
  correlations?: Correlation[];
  keywords?: { keyword: string; count: number }[];
  gap_analysis?: GapAnalysis;
  participants_count?: number;
  total_average?: number;
};
type Overview = { scope?: string; total_participants?: number };

// 콘솔 색: 네이비 → 파랑 3단 + 회색
const NAVY = '#1C2B4A';
const MID = '#2E4A85';
const BRIGHT = '#4F86F7';
const LIGHT = '#8FB2FB';
const GRID = '#E6E9EF';
const INK = '#0F172A';
const GRAY = '#64748B';

const errorDetail = (err: unknown) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

// ----------------------------------------------------------------------
// 1. Radar Chart — 역량 밸런스
// ----------------------------------------------------------------------
const RadarChart = ({ data }: { data: { competency: string; average: number }[] }) => {
  // 축약형('조직') 대신 풀네임('조직 관리')으로 표기
  const stats = data.map((d) => ({ label: toKoreanCompetency(d.competency), value: d.average }));
  const size = 380;
  const center = size / 2;
  const radius = 118;
  const angleStep = (Math.PI * 2) / Math.max(1, stats.length);

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 5) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };
  const points = stats.map((stat, i) => getPoint(stat.value, i)).map((p) => `${p.x},${p.y}`).join(" ");

  if (stats.length === 0) {
    return <div className="fa-empty">집계할 리포트가 없습니다.</div>;
  }

  return (
    <div className="flex w-full items-center justify-center py-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[420px] overflow-visible">
        {[1, 2, 3, 4, 5].map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={GRID} strokeWidth="1" />
        ))}
        {stats.map((_, i) => { const p = getPoint(5, i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke={GRID} />; })}
        <polygon points={points} fill="rgba(28,43,74,0.10)" stroke={NAVY} strokeWidth="2.5" />
        {stats.map((stat, i) => { const p = getPoint(stat.value, i); return <circle key={i} cx={p.x} cy={p.y} r="4" fill={NAVY} />; })}
        {stats.map((stat, i) => {
          // 풀네임이 길어진 만큼 라벨을 살짝 바깥으로 밀어 도형과 겹치지 않게 한다
          const p = getPoint(5.9, i);
          return (
            <g key={i}>
              <text x={p.x} y={p.y - 8} textAnchor="middle" dominantBaseline="middle" fill={INK} fontSize="14" fontWeight="700">
                {stat.label}
              </text>
              <text x={p.x} y={p.y + 9} textAnchor="middle" dominantBaseline="middle" fill={MID} fontSize="13" fontWeight="700">
                {stat.value.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. 조직 DNA — Treemap (빈도가 높을수록 큰 사각형)
// ----------------------------------------------------------------------
/**
 * 트리맵 셀 색상: 네이비(최다) → 연한 파랑(최소) 한 계열의 '농도'로만 순위를 표현한다.
 * (여러 색을 섞으면 색상 자체가 범주를 뜻하는 것처럼 오해되고 시인성도 떨어진다)
 */
const mix = (from: string, to: string, t: number) => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * t));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};
const cellRatio = (rank: number, total: number) => (total <= 1 ? 0 : rank / (total - 1)); // 0(최다) → 1(최소)
const cellColor = (rank: number, total: number) => {
  const r = cellRatio(rank, total);
  return r < 0.5 ? mix(NAVY, MID, r * 2) : mix(MID, LIGHT, (r - 0.5) * 2);
};
// 연한 칸에서는 흰 글자가 묻히므로 네이비 글자로 바꾼다
const cellText = (rank: number, total: number) => (cellRatio(rank, total) > 0.72 ? NAVY : '#ffffff');

type TreemapCellProps = {
  x?: number; y?: number; width?: number; height?: number;
  index?: number; name?: string; count?: number; total?: number;
};

const TreemapCell = (props: TreemapCellProps) => {
  const { x = 0, y = 0, width = 0, height = 0, index, name, count, total } = props;
  if (!width || !height || width <= 0 || height <= 0) return null;

  // 텍스트는 SVG <text> 가 아닌 foreignObject 안의 HTML 로 렌더링한다.
  // 말줄임(...) 대신 여러 줄로 자연스럽게 줄바꿈(overflow-wrap: break-word)해
  // 좁은 칸에서도 키워드 전체가 보이도록 한다.

  // 반응형 방어: 너무 작은 칸은 텍스트를 숨긴다(UI 깨짐 방지).
  const showText = width > 30 && height > 20;

  // 폰트는 셀의 '짧은 변'에 비례시켜, 좁고 긴 칸에서 글자가 넘치지 않게 한다.
  const base = Math.min(width, height);
  const fontSize = Math.round(Math.min(15, Math.max(9, base * 0.24)));
  // 줄바꿈되며 세로로 늘어나므로, 세로 여유가 넉넉할 때만 '횟수'를 병기한다.
  const showCount = height > 54 && width > 44;
  // 아주 작은 칸에서는 라벨을 한 줄로만(2줄이면 넘칠 수 있어) 제한한다.
  const maxLines = height < 40 ? 1 : height < 70 ? 2 : 3;
  const color = cellText(index ?? 0, total ?? 1);

  return (
    <g>
      {/* 칸 구분선: 흰 바탕과 같은 색의 얇은 stroke = 여백처럼 보임 */}
      <rect
        x={x} y={y} width={width} height={height}
        style={{ fill: cellColor(index ?? 0, total ?? 1), stroke: '#ffffff', strokeWidth: 2 }}
      />
      {showText && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              padding: '4px', boxSizing: 'border-box', overflow: 'hidden', lineHeight: 1.15,
            }}
          >
            <span
              style={{
                fontSize, fontWeight: 700, color,
                // 상자 밖으로 삐져나가지 않도록 강제 줄바꿈
                overflowWrap: 'break-word', wordBreak: 'break-word',
                // 최대 줄 수를 넘으면 말줄임(최후의 방어선)
                display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: maxLines, overflow: 'hidden',
              }}
            >
              {name}
            </span>
            {showCount && (
              <span style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color, opacity: 0.75 }}>
                {count}회
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

const KeywordTreemap = ({ keywords }: { keywords: { keyword: string; count: number }[] }) => {
  if (!keywords || keywords.length === 0) {
    return (
      <div className="fa-empty">
        아직 추출된 키워드가 없습니다.<br />리포트가 생성되면 자동으로 집계됩니다.
      </div>
    );
  }

  // 빈도 내림차순으로 정렬해야 농도(진함→옅음)가 순위와 일치한다
  const sorted = [...keywords].sort((a, b) => b.count - a.count);
  const data = sorted.map((k) => ({ name: k.keyword, size: k.count, count: k.count }));

  return (
    <>
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#ffffff"
            content={<TreemapCell total={data.length} />}
          >
            <RechartsTooltip
              contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: `1px solid ${GRID}` }}
              itemStyle={{ color: INK }}
              labelStyle={{ color: GRAY }}
              formatter={(value) => [`${value}회 언급`, '출현 빈도']}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* 칸이 작아 라벨이 생략된 키워드도 확인할 수 있도록 목록을 함께 제공 */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {sorted.map((k) => (
          <span key={k.keyword} className="fa-chip">
            {k.keyword} <span className="fa-num fa-muted">{k.count}</span>
          </span>
        ))}
      </div>
    </>
  );
};

// ----------------------------------------------------------------------
// 3. Gap Analysis — 자가진단 평균 vs AI 분석 평균
// ----------------------------------------------------------------------
const gapText = (gap: number) =>
  gap > 0.3
    ? '실제 발현보다 스스로를 높게 평가하는 경향'
    : gap < -0.3
      ? '실제 발현보다 스스로를 낮게 평가하는 경향(과소 인식)'
      : '자기 인식과 실제 발현이 대체로 일치';

const GapComparisonChart = ({
  selfScore, aiScore, sampleSize,
}: { selfScore: number; aiScore: number; sampleSize: number }) => {
  if (sampleSize === 0) {
    return (
      <div className="fa-empty">
        아직 자가진단 응답이 없습니다.
        <br />대상자가 진단 시작 전 자가진단을 제출하면 자기 인식과 AI 분석 결과의 차이가 자동으로 산출됩니다.
      </div>
    );
  }

  const gap = Number((selfScore - aiScore).toFixed(2));
  const rows = [
    { label: '자가진단 평균', value: selfScore, color: BRIGHT },
    { label: 'AI 분석 평균', value: aiScore, color: NAVY },
  ];

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="fa-num" style={{ fontSize: 48, fontWeight: 500, lineHeight: 1, letterSpacing: '-.03em', color: gap > 0 ? BRIGHT : NAVY }}>
          {gap > 0 ? '+' : ''}{gap}
        </span>
        <span className="fa-muted" style={{ fontSize: 13 }}>인식 격차 (자가 − AI)</span>
      </div>
      <p className="mt-2" style={{ fontSize: 14, color: 'var(--fa-body)' }}>
        {gapText(gap)} · 표본 {sampleSize}명
      </p>
      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex justify-between" style={{ fontSize: 13.5 }}>
              <span>{r.label}</span>
              <span className="fa-num" style={{ fontWeight: 600 }}>{r.value} <span className="fa-muted">/ 5.0</span></span>
            </div>
            <div className="fa-bar" style={{ height: 10, borderRadius: 5 }}>
              <i style={{ width: `${Math.max(0, Math.min(100, (r.value / 5) * 100))}%`, background: r.color, borderRadius: 5 }} />
            </div>
          </div>
        ))}
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
  correlations: Correlation[];
}) => {
  if (competencies.length === 0 || correlations.length === 0) {
    return <div className="fa-empty">상관관계 분석에는 최소 3건 이상의 리포트가 필요합니다.</div>;
  }

  const lookup = new Map<string, number>();
  correlations.forEach((c) => {
    lookup.set(`${c.a}|${c.b}`, c.coefficient);
    lookup.set(`${c.b}|${c.a}`, c.coefficient);
  });

  // 양의 상관은 네이비, 음의 상관은 파랑. 절댓값이 클수록 진하다(히트맵과 같은 농도 규칙)
  const cellStyle = (v: number | undefined): React.CSSProperties => {
    if (v === undefined) return { background: 'var(--fa-mute)', color: 'var(--fa-gray3)' };
    const a = Math.min(1, Math.abs(v)) * 0.9 + 0.06;
    const rgb = v >= 0 ? '28,43,74' : '79,134,247';
    return { background: `rgba(${rgb},${a})`, color: a > 0.45 ? '#ffffff' : NAVY };
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1" style={{ gridTemplateColumns: `5.5rem repeat(${competencies.length}, minmax(3.6rem, 1fr))` }}>
        <div />
        {competencies.map((l) => (
          <div key={l} className="flex items-end justify-center px-0.5 pb-1.5 text-center" style={{ fontSize: 12, fontWeight: 500, color: GRAY, lineHeight: 1.25 }}>
            {toKoreanCompetency(l)}
          </div>
        ))}
        {competencies.map((rowName) => (
          <Fragment key={rowName}>
            <div className="flex items-center justify-end pr-2 text-right" style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>
              {toKoreanCompetency(rowName)}
            </div>
            {competencies.map((colName) => {
              const isSelf = rowName === colName;
              const val = isSelf ? 1 : lookup.get(`${rowName}|${colName}`);
              return (
                <div
                  key={`${rowName}-${colName}`}
                  title={isSelf ? '' : `${toKoreanCompetency(rowName)} ↔ ${toKoreanCompetency(colName)}: ${val ?? '표본 부족'}`}
                  className="fa-num flex h-12 cursor-default items-center justify-center"
                  style={{ borderRadius: 4, fontSize: 14, fontWeight: 500, ...(isSelf ? { background: 'var(--fa-soft)', color: 'var(--fa-gray3)' } : cellStyle(val)) }}
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
const correlationInsight = (c: Correlation | undefined) => {
  if (!c) return null;
  const a = toKoreanCompetency(c.a);
  const b = toKoreanCompetency(c.b);
  const v = c.coefficient;
  const abs = Math.abs(v);

  if (v >= 0.8) {
    return {
      tone: NAVY,
      title: `${a} · ${b}: 강한 시너지 (r=${v})`,
      body: `두 역량이 사실상 함께 성장하는 구조입니다. 한쪽을 집중 개발하면 다른 쪽도 동반 상승할 가능성이 큽니다. 교육 예산을 두 과정에 나누기보다 ${a} 중심의 통합 프로그램으로 묶고, 리더 선발 시에도 두 역량을 하나의 지표로 평가하는 편이 효율적입니다.`,
    };
  }
  if (v >= 0.5) {
    return {
      tone: NAVY,
      title: `${a} · ${b}: 뚜렷한 양의 상관 (r=${v})`,
      body: `상당수 리더에게서 두 역량이 함께 나타납니다. ${b}가 취약한 리더는 ${a}에서도 어려움을 겪을 확률이 높으므로, 개별 코칭 시 두 영역을 함께 진단하는 것이 좋습니다.`,
    };
  }
  if (v <= -0.5) {
    return {
      tone: BRIGHT,
      title: `${a} · ${b}: 상충 관계 (r=${v})`,
      body: `한쪽이 높을수록 다른 쪽이 낮아지는 경향입니다. 조직이 ${a}에 과도한 압력을 주면서 ${b}가 희생되고 있지는 않은지 점검이 필요합니다. 두 역량을 동시에 요구하는 평가 체계라면 리더에게 상충 신호를 주고 있을 수 있습니다.`,
    };
  }
  if (abs < 0.3) {
    return {
      tone: GRAY,
      title: `${a} · ${b}: 독립적 (r=${v})`,
      body: `두 역량 사이에 뚜렷한 연관이 없습니다. 각각 별도의 개발 접근이 필요하며, 하나를 키운다고 다른 하나가 따라오지 않습니다.`,
    };
  }
  return {
    tone: GRAY,
    title: `${a} · ${b}: 약한 상관 (r=${v})`,
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
    return <div className="fa-empty">세부 역량 데이터가 부족합니다.</div>;
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
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(' ')} fill="none" stroke={GRID} />
        ))}
        {stats.map((_, i) => { const p = getPoint(5, i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke={GRID} />; })}
        <polygon points={points} fill="rgba(46,74,133,0.12)" stroke={MID} strokeWidth="2" />
        {stats.map((s, i) => { const p = getPoint(s.value, i); return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={MID} />; })}
        {stats.map((s, i) => {
          const p = getPoint(6.8, i);
          return (
            <g key={i}>
              <text x={p.x} y={p.y - 8} textAnchor="middle" dominantBaseline="middle" fill={INK} fontSize="11" fontWeight="600">{s.label}</text>
              <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="middle" fill={MID} fontSize="11" fontWeight="700">{s.value.toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const BreakdownBars = ({ breakdown }: { breakdown: Breakdown | null | undefined }) => {
  if (!breakdown) return null;
  const items = [
    { label: '행동 지표 평가', value: breakdown.rubric_base, max: 4.0, color: NAVY, prefix: '' },
    { label: 'STAR 깊이', value: breakdown.star_depth_bonus, max: 0.5, color: MID, prefix: '+' },
    { label: '확신도', value: breakdown.confidence_adj, max: 0.5, color: BRIGHT, prefix: (breakdown.confidence_adj ?? 0) >= 0 ? '+' : '' },
  ].filter((i): i is { label: string; value: number; max: number; color: string; prefix: string } => typeof i.value === 'number');

  if (items.length === 0) {
    return <p className="fa-muted" style={{ fontSize: 13 }}>점수 산출 근거 데이터가 없습니다.</p>;
  }

  const ratio = (v: number, max: number) => Math.max(0, Math.min(100, (Math.abs(v) / max) * 100));

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0" style={{ fontSize: 13, color: 'var(--fa-body)' }}>{item.label}</span>
          <div className="fa-bar flex-1"><i style={{ width: `${ratio(item.value, item.max)}%`, background: item.color }} /></div>
          <span className="fa-num w-14 text-right" style={{ fontSize: 13, fontWeight: 600 }}>
            {item.prefix}{Number(item.value).toFixed(2)}
          </span>
        </div>
      ))}
      {typeof breakdown.final === 'number' && (
        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--fa-line)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>전사 평균 최종 점수</span>
          <span className="fa-num" style={{ fontSize: 17, fontWeight: 600, color: NAVY }}>{Number(breakdown.final).toFixed(2)} <span className="fa-muted" style={{ fontSize: 13 }}>/ 5.0</span></span>
        </div>
      )}
      <p className="fa-muted pt-1" style={{ fontSize: 12, lineHeight: 1.7 }}>
        행동 지표 평가: 역량 발현이 행동으로 증명된 정도 (1.0~4.0) · STAR 깊이: 사례의 구체성 가산 (0~+0.5) ·
        확신도: 근거 일관성에 따른 조정 (±0.5)
        <br />※ 각 막대는 5.0 만점이 아닌 해당 항목의 최대치를 기준으로 표시됩니다.
      </p>
    </div>
  );
};

const SubHead = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-4 pb-2" style={{ fontSize: 14.5, fontWeight: 700, borderBottom: '1px solid var(--fa-ink)' }}>{children}</h4>
);

const CompetencyAccordion = ({
  item, isOpen, onToggle,
}: { item: CompetencyItem; isOpen: boolean; onToggle: () => void }) => {
  const dist = item.distribution || { high: 0, mid: 0, low: 0 };
  const total = dist.high + dist.mid + dist.low;
  const subScores: Record<string, number | null> = item.sub_scores || {};
  const subEntries = Object.entries(subScores).filter(([, v]) => typeof v === 'number') as [string, number][];

  return (
    <div className="fa-card" style={{ overflow: 'hidden', borderColor: isOpen ? NAVY : undefined }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 text-left"
        style={{ padding: '20px 26px', background: 'transparent', border: 0, cursor: 'pointer' }}
      >
        <div className="flex items-center gap-5">
          <span className="fa-num" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1, letterSpacing: '-.03em', color: NAVY, minWidth: 64 }}>
            {item.average}
          </span>
          <div>
            <span className="block" style={{ fontSize: 18, fontWeight: 700 }}>{toKoreanCompetency(item.competency)}</span>
            <span className="fa-muted block" style={{ fontSize: 13 }}>
              표본 {item.sample_size}명 · 세부 역량 {subEntries.length}개
              {total > 0 && ` · 우수 ${dist.high}명 / 보통 ${dist.mid}명 / 보완 ${dist.low}명`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden w-40 md:block">
            <div className="fa-bar"><i style={{ width: `${(item.average / 5) * 100}%` }} /></div>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: GRAY }} />
        </div>
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--fa-line)', background: 'var(--fa-soft)', padding: '26px' }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 점수 분포 */}
            <div className="fa-card pad">
              <SubHead>조직 내 점수 분포</SubHead>
              {total === 0 ? (
                <p className="fa-muted" style={{ fontSize: 13 }}>분포 데이터가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: '우수 (4.0 이상)', value: dist.high, color: NAVY },
                    { label: '보통 (3.0~3.9)', value: dist.mid, color: MID },
                    { label: '보완 필요 (3.0 미만)', value: dist.low, color: LIGHT },
                  ].map((d) => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-32 shrink-0" style={{ fontSize: 13, color: 'var(--fa-body)' }}>{d.label}</span>
                      <div className="fa-bar flex-1" style={{ height: 8 }}><i style={{ width: `${(d.value / total) * 100}%`, background: d.color }} /></div>
                      <span className="fa-num w-12 text-right" style={{ fontSize: 13, fontWeight: 600 }}>{d.value}명</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 점수 산출 근거 */}
            <div className="fa-card pad">
              <SubHead>점수 산출 근거 (전사 평균)</SubHead>
              <BreakdownBars breakdown={item.score_breakdown} />
            </div>

            {/* 세부 역량 분석: 좌 스파이더 / 우 막대 */}
            <div className="fa-card pad md:col-span-2">
              <SubHead>세부 역량 분석 (전사 평균)</SubHead>
              {subEntries.length === 0 ? (
                <p className="fa-empty">세부 역량 데이터가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
                  <SubRadar subScores={subScores} />
                  <div className="space-y-4">
                    {subEntries.map(([name, value]) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-32 shrink-0" style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                        <div className="fa-bar flex-1" style={{ height: 8 }}><i style={{ width: `${(value / 5) * 100}%`, background: MID }} /></div>
                        <span className="fa-num w-10 text-right" style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{value.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 강점 / 개선 필요점 발췌 */}
            {[
              { title: '강점', chip: 'tint', samples: item.strength_samples || [], bar: MID },
              { title: '개선 필요점', chip: 'line', samples: item.growth_samples || [], bar: LIGHT },
            ].map((block) => (
              <div key={block.title} className="fa-card pad">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`fa-chip ${block.chip}`}>{block.title}</span>
                  <span className="fa-muted" style={{ fontSize: 12.5 }}>구성원 리포트 발췌</span>
                </div>
                {block.samples.length === 0 ? (
                  <p className="fa-muted" style={{ fontSize: 13 }}>발췌할 내용이 없습니다.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {block.samples.map((s, i) => (
                      <li key={i} className="pl-3" style={{ borderLeft: `2px solid ${block.bar}`, fontSize: 13.5, lineHeight: 1.7, color: 'var(--fa-body)' }}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="fa-muted mt-4" style={{ fontSize: 12 }}>
            ※ 강점·개선점은 개인별 서술이라 평균을 낼 수 없어, 구성원 리포트에서 익명으로 발췌한 예시입니다.
          </p>
        </div>
      )}
    </div>
  );
};


// ----------------------------------------------------------------------
// (2026-10-29) 조직별 비교 — 전체 대비 본부·실·팀 평균
//   /admin/companies/{id}/org-stats 의 실제 집계값만 쓴다. 측정이 없으면 '–'.
// ----------------------------------------------------------------------
const LEVEL_TABS: { key: OrgLevel; label: string }[] = [
  { key: 'division', label: '본부' },
  { key: 'office', label: '실' },
  { key: 'team', label: '팀' },
];

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toFixed(1));

/** 전체 대비 차이. +는 네이비, -는 밝은 파랑. 비교할 값이 없으면 표시하지 않는다. */
const Diff = ({ v, base }: { v: number | null; base: number | null }) => {
  if (v === null || base === null) return null;
  const d = Math.round((v - base) * 10) / 10;
  if (d === 0) return <span className="fa-rorg-diff zero">±0.0</span>;
  return <span className={`fa-rorg-diff ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>;
};

/**
 * 회사·초점은 페이지 위 범위 선택 줄(ScopeFilter)을 따른다.
 * focus: 선택 줄에서 고른 가장 깊은 조직(본부·실·팀). 고르면 그 단계 표를 열고 그 행을 강조한다.
 */
const OrgCompareSection = ({ companyId, resolved, focus }: {
  companyId: string | null;
  resolved: boolean;
  focus: { level: OrgLevel; id: string } | null;
}) => {
  const [level, setLevel] = useState<OrgLevel>(focus?.level ?? 'division');
  // 조회 결과는 '어느 회사·단계'에 대한 것인지 key 로 묶는다. key 가 지금 선택과 다르면 로딩 중.
  const [result, setResult] = useState<{ key: string; data: OrgStats | null; error: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focus?.id ?? null);

  // 선택 줄에서 조직을 고르면 그 단계로 바꾸고 그 조직을 강조한다(렌더 중 비교, 이펙트 없이)
  const focusKey = focus ? `${focus.level}:${focus.id}` : '';
  const [prevFocus, setPrevFocus] = useState(focusKey);
  if (prevFocus !== focusKey) {
    setPrevFocus(focusKey);
    if (focus) { setLevel(focus.level); setSelectedId(focus.id); }
  }
  const focusId = focus?.id ?? null;

  const key = companyId ? `${companyId}:${level}` : null;
  useEffect(() => {
    if (!companyId || !key) return;
    let alive = true;
    fetchOrgStats(companyId, level)
      .then((d) => {
        if (!alive) return;
        setResult({ key, data: d, error: '' });
        // 기본 선택: 선택 줄에서 고른 조직(이 단계에 있으면), 아니면 리포트가 있는 첫 단위
        setSelectedId(d.rows.some((r) => r.id === focusId) ? focusId : d.rows.find((r) => r.n_reports > 0)?.id ?? null);
      })
      .catch((err: unknown) => {
        if (alive) setResult({ key, data: null, error: errorDetail(err) || '조직별 통계를 불러오지 못했습니다.' });
      });
    return () => { alive = false; };
  }, [companyId, level, key, focusId]);

  const loading = !resolved || (key !== null && result?.key !== key);
  const data = result?.key === key ? result.data : null;
  const error = result?.key === key ? result.error : '';

  const comps = data?.competencies || [];
  const total = data?.total;
  const rows = data?.rows || [];
  const selected: OrgStatRow | null = rows.find((r) => r.id === selectedId) || null;

  const radarData = selected && total
    ? comps.map((c) => ({ name: c.name, 전체: total.averages[c.key] ?? 0, [selected.name]: selected.averages[c.key] ?? 0 }))
    : [];

  return (
    <div className="fa-card pad fa-section">
      <div className="fa-cap">
        <div>
          <h3>조직별 비교</h3>
          <p>회사 전체 평균과 본부·실·팀 평균을 나란히 봅니다. 숫자 옆은 전체 대비 차이입니다.</p>
        </div>
        <div className="fa-actions">
          <div className="fa-rorg-tabs" role="tablist" aria-label="조직 단계">
            {LEVEL_TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={level === t.key}
                className={level === t.key ? 'on' : ''} onClick={() => setLevel(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="fa-error" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="fa-empty flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> 조직별로 집계하는 중입니다…</div>
      ) : !companyId ? (
        <div className="fa-note">소속 고객사가 정해진 계정에서 조직별 비교를 볼 수 있습니다.</div>
      ) : !data || (rows.length === 0 && level === 'division') ? (
        <div className="fa-note">조직 코드(본부·실·팀)가 등록되면 조직별 비교가 표시됩니다. 조직 코드는 마스터 콘솔에서 등록합니다.</div>
      ) : rows.length === 0 ? (
        <div className="fa-note">이 회사에는 {LEVEL_TABS.find((t) => t.key === level)?.label} 단위가 없습니다. 다른 단계를 골라 보세요.</div>
      ) : (total?.n_reports ?? 0) === 0 ? (
        <div className="fa-note">아직 진단을 마친 사람이 없어 비교할 평균이 없습니다. 리포트가 생기면 자동으로 채워집니다.</div>
      ) : (
        <div className="fa-rorg-body">
          <div className="fa-tbl">
            <table className="fa-table fa-rorg-table">
              <thead>
                <tr>
                  <th>조직</th>
                  {comps.map((c) => <th key={c.key} className="num">{c.name}</th>)}
                  <th className="num">종합 평균</th>
                  <th className="num">완료 / 등록</th>
                </tr>
              </thead>
              <tbody>
                {total && (
                  <tr className="total">
                    <td><b>전체</b></td>
                    {comps.map((c) => <td key={c.key} className="num"><b className="fa-num">{fmt(total.averages[c.key])}</b></td>)}
                    <td className="num"><b className="fa-num">{fmt(total.total_average)}</b></td>
                    <td className="num fa-num">{total.n_reports} / {total.registered}</td>
                  </tr>
                )}
                {rows.map((r) => {
                  const on = r.id === selectedId;
                  const empty = r.n_reports === 0;
                  // 선택 줄에서 고른 조직은 리포트가 없어도 강조(어디를 보고 있는지 표시)
                  const focused = r.id === focusId;
                  return (
                    <tr key={r.id ?? r.name} className={`click${on || focused ? ' on' : ''}${empty ? ' empty' : ''}`}
                      onClick={() => !empty && setSelectedId(r.id)} aria-selected={on}>
                      <td>
                        <div className="fa-rorg-name">
                          <b>{r.name}</b>
                          {r.code && <span className="fa-code">{r.code}</span>}
                          {r.is_active === false && <span className="fa-chip off">사용 중지</span>}
                        </div>
                        {r.path !== r.name && <div className="fa-rorg-path">{r.path}</div>}
                      </td>
                      {comps.map((c) => (
                        <td key={c.key} className="num">
                          <span className="fa-num">{fmt(r.averages[c.key])}</span>
                          <Diff v={r.averages[c.key]} base={total?.averages[c.key] ?? null} />
                        </td>
                      ))}
                      <td className="num">
                        <span className="fa-num">{fmt(r.total_average)}</span>
                        <Diff v={r.total_average} base={total?.total_average ?? null} />
                      </td>
                      <td className="num fa-num">{r.n_reports} / {r.registered}</td>
                    </tr>
                  );
                })}
                {data.unassigned.registered > 0 && (
                  <tr className="empty">
                    <td><div className="fa-rorg-path">미분류(조직 코드 없이 참여)</div></td>
                    {comps.map((c) => <td key={c.key} className="num fa-num">{fmt(data.unassigned.averages[c.key])}</td>)}
                    <td className="num fa-num">{fmt(data.unassigned.total_average)}</td>
                    <td className="num fa-num">{data.unassigned.n_reports} / {data.unassigned.registered}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="fa-rorg-radar">
            {selected ? (
              <>
                <div className="fa-rorg-radar-cap"><b>{selected.name}</b> vs 전체</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ReRadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke={GRID} />
                    <PolarAngleAxis dataKey="name" tick={{ fill: GRAY, fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
                    <Radar name="전체" dataKey="전체" stroke={LIGHT} fill={LIGHT} fillOpacity={0.25} strokeWidth={2} />
                    <Radar name={selected.name} dataKey={selected.name} stroke={NAVY} fill={NAVY} fillOpacity={0.18} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 12, color: GRAY }} />
                    <RechartsTooltip formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : String(v))} />
                  </ReRadarChart>
                </ResponsiveContainer>
                <p className="fa-rorg-hint">표에서 다른 조직을 누르면 바뀝니다. 측정이 없는 역량은 0으로 그립니다.</p>
              </>
            ) : (
              <div className="fa-empty">완료자가 있는 조직을 표에서 고르면 전체와 비교한 그래프가 나옵니다.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// [MAIN PAGE]
// ----------------------------------------------------------------------
const ReportsPage = () => {
  // 범위 선택(공용): 마스터는 고객사 하나 → 본부 → 실 → 팀, HR 은 자사 본부부터
  const scope = useScope({ allowAllCompanies: false });
  const isMaster = scope.isMaster;
  // 응답은 '어느 고객사'에 대한 것인지 key 로 묶는다. key 가 지금 선택과 다르면 로딩 중
  const [statsResult, setStatsResult] = useState<{ key: string; stats: CompetencyStats | null; overview: Overview | null; error: string } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // 고객사가 바뀌면 펼친 역량 상세를 닫는다
  const [prevCompany, setPrevCompany] = useState(scope.companyId);
  if (prevCompany !== scope.companyId) {
    setPrevCompany(scope.companyId);
    setOpenKey(null);
  }

  // 통계: HR 은 자사(백엔드가 정함), 마스터는 고른 고객사 하나. 본부·실·팀으로는 거르지 않는다(백엔드가 회사 단위 집계)
  const statsKey = isMaster ? scope.companyId : 'self';
  useEffect(() => {
    if (statsKey === null) return;
    let alive = true;
    const cid = isMaster ? (statsKey || undefined) : undefined;
    Promise.all([fetchCompetencyStats(cid), fetchOverview(cid)])
      .then(([s, o]) => { if (alive) setStatsResult({ key: statsKey, stats: s, overview: o, error: '' }); })
      .catch((err: unknown) => {
        if (alive) setStatsResult({ key: statsKey, stats: null, overview: null, error: errorDetail(err) || '통계를 불러오지 못했습니다.' });
      });
    return () => { alive = false; };
  }, [isMaster, statsKey]);
  // 마스터인데 등록된 고객사가 하나도 없으면 기다리지 않는다
  const noCompany = isMaster && !scope.loading && !scope.companyId;
  const current = statsKey !== null && statsResult?.key === statsKey ? statsResult : null;
  const loading = !current && !noCompany;
  const stats = current?.stats ?? null;
  const overview = current?.overview ?? null;
  const error = current?.error || '';

  const title = isMaster ? '전체 리포트' : '종합 리포트';
  const eyebrow = isMaster ? '마스터' : '리더십 역량 종합 분석';
  // 선택 줄에서 고른 가장 깊은 조직(조직별 비교의 초점)
  const focus: { level: OrgLevel; id: string } | null = scope.teamId ? { level: 'team', id: scope.teamId }
    : scope.officeId ? { level: 'office', id: scope.officeId }
    : scope.divisionId ? { level: 'division', id: scope.divisionId } : null;
  const scopeBar = <ScopeFilter scope={scope} />;

  if (loading) {
    return (
      <AdminLayout>
        <AdminPageHead eyebrow={eyebrow} title={title} desc={scope.label || undefined} />
        {scopeBar}
        <div className="fa-empty flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> 조직 통계를 집계하는 중입니다…
        </div>
      </AdminLayout>
    );
  }

  const competencies: CompetencyItem[] = sortByCompetencyOrder(stats?.competencies || []);
  const correlations = stats?.correlations || [];
  const keywords = stats?.keywords || [];
  const gapAnalysis: GapAnalysis = stats?.gap_analysis || { sample_size: 0, self_average: 0, ai_average: 0, by_competency: [] };
  const participantsCount = stats?.participants_count ?? 0;
  const totalAverage = stats?.total_average ?? 0;

  const sorted = [...competencies].sort((a, b) => b.average - a.average);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const insight = correlationInsight(correlations[0]);

  // 조직 평균 대비 편차가 큰 역량 (서술형 요약 보강용)
  const spread = best && worst ? Number((best.average - worst.average).toFixed(2)) : 0;
  const scopeLabel = isMaster ? (scope.companyName || '선택한 고객사') : overview?.scope === 'all' ? '전체 고객사' : (scope.companyName || '자사');

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={eyebrow}
        title={title}
        desc={`${scope.label ? `${scope.label} · ` : ''}리더 ${participantsCount}명${overview?.total_participants ? ` · 등록 대상자 ${overview.total_participants}명` : ''}`}
        actions={<>
          <button type="button" className="fa-btn primary" onClick={() => downloadExcel().catch(() => alert('다운로드에 실패했습니다.'))}>
            <Download /> 데이터 내려받기
          </button>
        </>}
        kpis={participantsCount > 0 ? [
          { label: '분석 리더', value: participantsCount, unit: '명', detail: `${scopeLabel} 리포트 기준` },
          { label: '종합 평균', value: totalAverage, unit: '/ 5.0', detail: best && worst ? `최고·최저 격차 ${spread}점` : undefined },
          { label: '최고 강점 역량', value: best ? toKoreanCompetency(best.competency) : '-', detail: best ? <><b>{best.average}</b>점</> : undefined },
          { label: '보완 시급 역량', value: worst ? toKoreanCompetency(worst.competency) : '-', detail: worst ? <><b>{worst.average}</b>점</> : undefined },
        ] : undefined}
      />

      {/* 범위 선택 줄: [고객사] › 본부 › 실 › 팀 */}
      {scopeBar}

      {error && <div className="fa-error fa-section">{error}</div>}
      {noCompany && <div className="fa-note fa-section">등록된 고객사가 없습니다. 고객사를 먼저 등록해 주세요.</div>}
      {/* 위 통계는 회사 단위 집계다. 본부·실·팀을 골랐으면 그 사실을 알리고 아래 조직별 비교로 안내(숫자를 지어내지 않음) */}
      {scope.orgUnitId && (
        <div className="fa-note fa-section">회사 전체 통계입니다. 조직별 비교는 아래 표에서 확인하세요.</div>
      )}

      {/* (2026-10-29) 회사 전체와 별도로 본부·실·팀별 결과 비교. 전사 리포트 유무와 상관없이 따로 집계 */}
      <OrgCompareSection companyId={scope.companyId} resolved={!scope.loading} focus={focus} />

      {participantsCount === 0 ? (
        <div className="fa-card pad fa-empty">
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--fa-ink)' }}>아직 집계할 리포트가 없습니다.</p>
          <p className="mt-2">진단이 완료되고 리포트가 생성되면 조직 단위 통계가 자동으로 산출됩니다.</p>
        </div>
      ) : (
        <>
          {/* [섹션 1] 역량 밸런스 + 결과 요약 */}
          <div className="fa-grid2 even">
            <div className="fa-card pad">
              <div className="fa-cap">
                <div><h3>{scopeLabel} 역량 밸런스</h3><p>역량별 평균 점수 (5.0 만점)</p></div>
              </div>
              <RadarChart data={competencies} />
            </div>

            {/* 역량 진단 결과 요약: 경영진용 서술형 */}
            <div className="fa-card pad flex flex-col">
              <div className="fa-cap"><div><h3>역량 진단 결과 요약</h3><p>강점·보완 영역과 편차</p></div></div>
              <div className="space-y-4" style={{ fontSize: 15.5, lineHeight: 1.85, color: 'var(--fa-body)' }}>
                {best && worst && best.competency !== worst.competency ? (
                  <>
                    <p>
                      가장 뛰어난 역량은 <strong style={{ color: NAVY }}>{toKoreanCompetency(best.competency)}({best.average}점)</strong>으로
                      조직의 강점이나, <strong style={{ color: BRIGHT }}>{toKoreanCompetency(worst.competency)}({worst.average}점)</strong> 부문은
                      상대적으로 보완이 시급합니다.
                    </p>
                    <p className="fa-muted" style={{ fontSize: 14.5 }}>
                      분석 대상 {participantsCount}명의 종합 평균은 {totalAverage}점이며, 최고·최저 역량 간
                      격차는 {spread}점입니다.
                      {spread >= 1.0
                        ? ' 역량 간 편차가 커 특정 영역에 집중된 성장 지원이 필요합니다.'
                        : spread >= 0.5
                          ? ' 역량 간 편차가 완만해 균형 잡힌 리더십 구조를 보이고 있습니다.'
                          : ' 역량 전반이 고르게 분포해 있어, 조직 차원의 공통 과제 설정이 유효합니다.'}
                    </p>
                    {(worst.distribution?.low ?? 0) > 0 && (
                      <p className="fa-muted" style={{ fontSize: 14.5 }}>
                        특히 {toKoreanCompetency(worst.competency)}에서 3.0점 미만인 리더가 {worst.distribution?.low}명 확인되어,
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
              <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                <div style={{ background: 'var(--fa-navy)', color: '#fff', borderRadius: 10, padding: '16px 18px' }}>
                  <span className="block" style={{ fontSize: 12.5, color: LIGHT, fontWeight: 600 }}>최고 강점 역량</span>
                  <span className="mt-1 block" style={{ fontSize: 18, fontWeight: 700 }}>
                    {best ? `${toKoreanCompetency(best.competency)} (${best.average})` : '-'}
                  </span>
                </div>
                <div style={{ background: 'var(--fa-tint)', borderRadius: 10, padding: '16px 18px' }}>
                  <span className="block" style={{ fontSize: 12.5, color: MID, fontWeight: 600 }}>보완 시급 역량</span>
                  <span className="mt-1 block" style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>
                    {worst ? `${toKoreanCompetency(worst.competency)} (${worst.average})` : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* [섹션 2] 조직 DNA 트리맵 & 인식의 차이 */}
          <div className="fa-grid2 even">
            <div className="fa-card pad">
              <div className="fa-cap">
                <div><h3>조직 DNA 키워드</h3><p>사각형이 클수록 자주 언급된 행동·성향입니다.</p></div>
                <span className="fa-chip tint">리포트 {participantsCount}건</span>
              </div>
              <KeywordTreemap keywords={keywords} />
            </div>

            <div className="fa-card pad">
              <div className="fa-cap">
                <div><h3>인식의 차이</h3><p>진단 전 스스로 매긴 점수와 대화 분석 결과를 비교한 메타인지 지표</p></div>
                <span className="fa-chip">자가 vs AI</span>
              </div>
              <GapComparisonChart
                selfScore={gapAnalysis.self_average ?? 0}
                aiScore={gapAnalysis.ai_average ?? 0}
                sampleSize={gapAnalysis.sample_size ?? 0}
              />

              {/* 역량별 인식 격차 */}
              {gapAnalysis.sample_size > 0 && (
                <div className="mt-8">
                  <SubHead>역량별 인식 격차</SubHead>
                  <div className="space-y-3.5">
                    {(gapAnalysis.by_competency || [])
                      .filter((g): g is GapRow & { gap: number } => g.gap !== null)
                      .map((g) => {
                        const over = g.gap > 0;
                        return (
                          <div key={g.competency} className="flex flex-wrap items-center gap-3">
                            <span className="w-20 shrink-0" style={{ fontSize: 13.5, fontWeight: 600 }}>
                              {toKoreanCompetency(g.competency)}
                            </span>
                            <div className="relative flex-1 fa-bar" style={{ height: 8, overflow: 'visible' }}>
                              <i style={{ width: `${(g.ai_score / 5) * 100}%` }} />
                              <span
                                className="absolute top-1/2 -translate-y-1/2"
                                style={{ left: `${(g.self_score / 5) * 100}%`, width: 2, height: 16, background: BRIGHT }}
                                aria-hidden="true"
                              />
                            </div>
                            <span className="fa-num w-12 text-right" style={{ fontSize: 14, fontWeight: 600, color: over ? BRIGHT : NAVY }}>
                              {over ? '+' : ''}{g.gap}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="fa-muted mt-4" style={{ fontSize: 12, lineHeight: 1.7 }}>
                    막대는 AI 점수, 파란 세로선은 자가 점수입니다. 양수(+)는 실제 발현보다 스스로를 높게 평가한 역량,
                    음수(−)는 낮게 평가한 역량입니다.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* [섹션 3] 역량 상관관계: 매트릭스 + 인사이트 */}
          <div className="fa-card pad fa-section">
            <div className="fa-cap">
              <div><h3>역량 간 상관관계</h3><p>피어슨 상관계수 · 네이비: 양의 상관 / 파랑: 음의 상관 · 진할수록 강함</p></div>
            </div>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <CorrelationHeatmap
                  competencies={competencies.map((c) => c.competency)}
                  correlations={correlations}
                />
              </div>
              <div className="lg:col-span-6">
                <div style={{ background: 'var(--fa-soft)', borderRadius: 10, padding: '22px 24px' }}>
                  <p className="mb-3" style={{ fontSize: 13, fontWeight: 600, color: MID }}>인사이트</p>
                  {insight ? (
                    <>
                      <p className="mb-2" style={{ fontSize: 16, fontWeight: 700, color: insight.tone }}>{insight.title}</p>
                      <p style={{ fontSize: 14.5, lineHeight: 1.8, color: 'var(--fa-body)' }}>{insight.body}</p>

                      {correlations.length > 1 && (
                        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--fa-line)' }}>
                          <p className="fa-muted mb-2" style={{ fontSize: 12.5, fontWeight: 600 }}>그 밖의 주요 관계</p>
                          <ul className="space-y-1.5">
                            {correlations.slice(1, 4).map((c) => (
                              <li key={`${c.a}-${c.b}`} className="flex items-center justify-between" style={{ fontSize: 13.5 }}>
                                <span>{toKoreanCompetency(c.a)} ↔ {toKoreanCompetency(c.b)}</span>
                                <span className="fa-num" style={{ fontWeight: 600, color: c.coefficient >= 0 ? NAVY : BRIGHT }}>
                                  r = {c.coefficient}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="fa-muted mt-4" style={{ fontSize: 12, lineHeight: 1.7 }}>
                        ※ 상관계수는 인과관계가 아닌 동반 변동 경향을 의미합니다. 표본({participantsCount}명)이
                        커질수록 해석의 신뢰도가 높아집니다.
                      </p>
                    </>
                  ) : (
                    <p className="fa-muted" style={{ fontSize: 14 }}>
                      표본이 3건 이상 쌓이면 역량 간 상관관계와 실무 해석이 자동으로 산출됩니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* [섹션 4] 역량별 상세: 아코디언 */}
          <div className="space-y-3 pb-8">
            <div className="mb-4 flex items-end justify-between gap-3 pb-3" style={{ borderBottom: '1px solid var(--fa-ink)' }}>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>역량별 상세 분석</h3>
              <button
                type="button"
                className="fa-btn sm"
                onClick={() => setOpenKey(openKey === 'ALL' ? null : 'ALL')}
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
    </AdminLayout>
  );
};

// useScope 가 주소(?company=)를 읽으므로 Suspense 안에서 그린다
export default function ReportsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ReportsPage />
    </Suspense>
  );
}
