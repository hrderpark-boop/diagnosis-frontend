"use client";

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { AnalysisProgress, fetchAnalysisProgress, isProgressRunning } from '@/lib/analysisProgress';
import AnalysisChecklist from '@/components/AnalysisChecklist';
import ParticipantHeader, { ParticipantMobileStep } from '@/components/participant/ParticipantHeader';
import { getKeyToNameMap, getSubCompetenciesMap, fetchFramework, FrameworkCompetency } from '@/lib/framework';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './report.css';
import { useRollingScores, finishReportMotion, buildCompareLevels, OrgCompare } from './reportMotion';

// 미리보기(?demo=compare) 전용 추천 교육 예시. 실제 리포트에서는 백엔드 course_recommendation 만 쓴다.
const DEMO_COURSE_RECOMMENDATION = {
  intro: '진단 결과 점수가 낮고 대화 근거가 확인된 하위역량을 우선으로, 다음 단계로 도약하는 데 필요한 과정을 골랐습니다.',
  growth: [
    { type: '성장 집중', track: 'A', track_format: '워크숍', category: '사람관리', course: '피드백 대화 스킬', subtitle: '구체적 행동 근거로 피드백하고 합의된 다음 행동을 남긴다', sub_competency: '코칭과 피드백', level: 2, score: 2.1, reason_overview: '피드백을 미루거나 일반론으로 전달하는 패턴이 대화에서 반복되었습니다.', reason_bullets: ['저성과 팀원 면담을 분기 말까지 미룬 사례', '피드백 후 후속 점검 약속이 없었음'] },
    { type: '성장 집중', track: 'B', track_format: '온라인 4주', category: '성과관리', course: '목표 설정과 실행 점검', subtitle: '팀 목표를 측정 가능한 지표로 쪼개고 주간 점검 루틴을 만든다', sub_competency: '목표설정 및 공유', level: 2, score: 2.4, reason_overview: '목표는 공유했지만 진척을 확인하는 기준이 모호했습니다.', reason_bullets: ['분기 목표 변경 시 기준 재정의가 늦어짐'] },
    { type: '성장 집중', track: 'C', track_format: '워크숍 반일', category: '사람관리', course: '갈등 조정 실습', subtitle: '이해관계가 엇갈리는 상황에서 합의점을 구조적으로 찾는다', sub_competency: '갈등 조정', level: 2, score: 2.6, reason_overview: '갈등 상황에서 결정을 위임하거나 회피한 사례가 있었습니다.', reason_bullets: ['부서 간 일정 충돌을 상위 보고로 넘긴 사례'] },
  ],
  strength: { type: '강점 활용', is_strength: true, track: 'D', track_format: '코칭', category: '일관리', course: '우선순위 의사결정', subtitle: '기준을 먼저 세우고 설명하는 강점을 팀 운영 원칙으로 확장한다', sub_competency: '자원 배분', level: 4, score: 3.8, reason_overview: '기준을 먼저 세우고 그 기준으로 설명한 행동이 여러 번 확인되었습니다.', reason_bullets: ['보류 과제 선정 기준을 주간 회의에서 공유'] },
};

// ----------------------------------------------------------------------
// [ICONS]
// ----------------------------------------------------------------------
const ChevronIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ----------------------------------------------------------------------
// [SECTION HEAD] - 샘플 b/report.html 의 섹션 머리(.fm-num 번호 + 영문 눈썹 + 국문 제목 + 하단 괘선)
//  순수 표시용(데이터·상태 없음). 스타일은 report.css 의 .fm-report-shead.
// ----------------------------------------------------------------------
const SectionHead = ({ no, en, ko, className = '' }: { no: string; en: string; ko: string; className?: string }) => (
  <div className={`fm-report-shead ${className}`}>
    <span className="fm-num">{no}</span>
    <div>
      <div className="fm-eyebrow">{en}</div>
      <h2>{ko}</h2>
    </div>
  </div>
);

// 02 Self View 표의 한 줄 - 백엔드(/reports/{sid} → self_view.rows) 값 그대로 표시한다.
type SelfViewRow = {
  key: string;
  name: string;
  self: number | null;
  measured: number | null;
  diff: number | null;
  kind: 'self_higher' | 'self_lower' | 'match' | 'unmeasured' | 'reference';
  interpretation: string;
};

// ----------------------------------------------------------------------
// [MAIN RADAR CHART - 메인 역량 밸런스]
// ----------------------------------------------------------------------
const RadarChart = ({
  data,
  competencies,
  maxScore,
  selfScores,
  groupAverages,
  displayData,
}: {
  data: any;
  /** 등장 효과 중 표시할 값(굴러가는 점수). 없으면 data 그대로 */
  displayData?: Record<string, number | null> | null;
  competencies: Array<{ key: string; name: string }>;
  maxScore: number;
  /** 자가진단 대역량 점수(같은 1~5 축). null 이면 자가 폴리곤을 그리지 않는다. */
  selfScores?: Record<string, number | null> | null;
  /** 그룹 평균(available 일 때만 전달). 값이 null 인 축은 건너뛴다(0 처리 금지). */
  groupAverages?: Record<string, number | null> | null;
}) => {
  const safeData = data || {};
  const safeMax = maxScore || 5;
  // 겹침 폴리곤용 값 추출 - 백엔드 값 그대로(계산 없음). 숫자가 아니면 null.
  const overlayValues = (src?: Record<string, number | null> | null): Array<number | null> | null =>
    src ? competencies.map((c) => { const v = src[c.key] ?? src[c.name]; return typeof v === 'number' ? v : null; }) : null;
  const selfVals = overlayValues(selfScores);
  const groupVals = overlayValues(groupAverages);
  // B: 미측정(null) 역량은 0점이 아니라 '빈 점 + 회색 점선 축'으로 그려 빈칸이 보이게 한다.
  const stats = competencies.map((c) => {
    const raw = safeData[c.name] ?? safeData[c.key];  // 과거 포맷 호환 유지
    const shown = displayData ? displayData[c.name] : undefined;
    const value = typeof raw === 'number' ? (typeof shown === 'number' ? shown : raw) : null;
    return { label: c.name, value };
  });

  const size = 300; const center = size / 2; const radius = 85;
  const angleStep = stats.length > 0 ? (Math.PI * 2) / stats.length : 0;

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / safeMax) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const levels = Array.from({ length: safeMax }, (_, i) => i + 1);
  const measuredPts = stats
    .map((stat, i) => (stat.value === null ? null : getPoint(stat.value, i)))
    .filter((p): p is { x: number; y: number } => p !== null);
  const points = measuredPts.map(p => `${p.x},${p.y}`).join(" ");

  // 겹침 폴리곤(채움 없음): 인접한 두 축에 모두 값이 있을 때만 선분으로 잇는다.
  //  값이 없는 축은 0 으로 내리지 않고 건너뛴다 → 그 축 양옆 선분이 비어 빈칸이 보인다.
  const renderOverlay = (vals: Array<number | null>, stroke: string, dash: string | undefined, keyPrefix: string) => {
    const n = vals.length;
    return (
      <g>
        {vals.map((v, i) => {
          const j = (i + 1) % n;
          const w = vals[j];
          if (v === null || w === null || n < 2) return null;
          const a = getPoint(v, i); const b = getPoint(w, j);
          return <line key={`${keyPrefix}-l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />;
        })}
        {vals.map((v, i) => {
          if (v === null) return null;
          const p = getPoint(v, i);
          return <circle key={`${keyPrefix}-c${i}`} cx={p.x} cy={p.y} r="2.6" fill="white" stroke={stroke} strokeWidth="1.4" />;
        })}
      </g>
    );
  };

  return (
    <div className="flex justify-center items-center py-2 w-full h-full">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {levels.map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#D9D9D9" strokeWidth="1" />
        ))}
        {stats.map((stat, i) => {
          const p = getPoint(safeMax, i);
          return stat.value === null
            ? <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#A6A6A6" strokeWidth="1.2" strokeDasharray="4 3" />
            : <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#D9D9D9" strokeWidth="1" />;
        })}
        {measuredPts.length >= 3 && (
          <polygon points={points} fill="#E9EDF4" fillOpacity="0.75" stroke="#1C2B4A" strokeWidth="2" />
        )}
        {measuredPts.length === 2 && (
          <polyline points={points} fill="none" stroke="#1C2B4A" strokeWidth="2" />
        )}
        {/* 그룹 평균(진회색 실선) → 스스로 보는 나(회색 점선) 순으로 측정 폴리곤 위에 겹친다 */}
        {groupVals && renderOverlay(groupVals, '#7F7F7F', undefined, 'grp')}
        {selfVals && renderOverlay(selfVals, '#A6A6A6', '5 4', 'self')}
        {stats.map((stat, i) => {
          if (stat.value === null) {
            const p = getPoint(safeMax, i);
            return <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="white" stroke="#A6A6A6" strokeWidth="1.5" strokeDasharray="2 2" />;
          }
          const p = getPoint(stat.value, i);
          return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#1C2B4A" stroke="white" strokeWidth="2" />;
        })}
        {stats.map((stat, i) => {
          const pLabel = getPoint(6.8, i);
          const unmeasured = stat.value === null;
          return (
            <g key={i}>
              <text x={pLabel.x} y={pLabel.y - 8} textAnchor="middle" dominantBaseline="middle" fill={unmeasured ? '#A6A6A6' : '#000000'} fontSize="12" fontWeight="600">{stat.label}</text>
              <text x={pLabel.x} y={pLabel.y + 8} textAnchor="middle" dominantBaseline="middle" fill={unmeasured ? '#A6A6A6' : '#1C2B4A'} fontSize={unmeasured ? '11' : '13'} fontWeight="700">{unmeasured ? '미측정' : Number(stat.value).toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ----------------------------------------------------------------------
// [SUB RADAR CHART - 세부 역량 스파이더맵]
// ----------------------------------------------------------------------
const SubRadarChart = ({ subScores, fallbackScore, maxScore }: { subScores: any, fallbackScore: number, maxScore: number }) => {
  const safeMax = maxScore || 5;
  // B: 미측정(null) 하위역량도 축으로 남기고 '빈 점 + 회색 점선'으로 그려 빈칸을 드러낸다
  //   (P0-1: 값은 0 이 아니라 미측정 - 다각형에는 넣지 않는다).
  const stats = Object.entries(subScores || {})
    .map(([label, score]) => ({ label, value: typeof score === 'number' ? score : null }));
  if (stats.length < 3) return null;  // 축이 3개 미만이면 레이더 생략

  // 반경 80→62: 라벨이 viewBox 밖으로 벗어나 잘리던 현상 복구.
  // 확대된 폰트(13px)는 유지하되, 라벨이 온전히 보이도록 내부 여백 확보
  const size = 220; const center = size / 2; const radius = 62;
  const angleStep = (Math.PI * 2) / stats.length;

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / safeMax) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const levels = Array.from({ length: safeMax }, (_, i) => i + 1).filter((_, i) => i === 0 || i === 2 || i === safeMax - 1);
  const measuredPts = stats
    .map((stat, i) => (stat.value === null ? null : getPoint(stat.value, i)))
    .filter((p): p is { x: number; y: number } => p !== null);
  const points = measuredPts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex justify-center items-center w-full h-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {levels.map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#D9D9D9" strokeWidth="1" />
        ))}
        {stats.map((stat, i) => {
          const p = getPoint(safeMax, i);
          return stat.value === null
            ? <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#A6A6A6" strokeWidth="1" strokeDasharray="3 3" />
            : <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#D9D9D9" strokeWidth="1" />;
        })}
        {measuredPts.length >= 3 && (
          <polygon points={points} fill="#E9EDF4" fillOpacity="0.75" stroke="#1C2B4A" strokeWidth="2" />
        )}
        {measuredPts.length === 2 && (
          <polyline points={points} fill="none" stroke="#1C2B4A" strokeWidth="2" />
        )}
        {stats.map((stat, i) => {
          if (stat.value === null) {
            const p = getPoint(safeMax, i);
            return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="white" stroke="#A6A6A6" strokeWidth="1.2" strokeDasharray="2 2" />;
          }
          const p = getPoint(stat.value, i);
          return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#1C2B4A" />;
        })}
        {stats.map((stat, i) => {
          // 라벨 배율 6.8: 다각형 모서리(5.0 지점)와 22px 가량 간격을 두면서도
          // viewBox 경계(반폭 110) 안에 라벨·점수가 온전히 들어오는 위치
          const pLabel = getPoint(6.8, i);
          const unmeasured = stat.value === null;
          return (
            <g key={i}>
              <text x={pLabel.x} y={pLabel.y - 8} textAnchor="middle" dominantBaseline="middle" fill={unmeasured ? '#A6A6A6' : '#000000'} fontSize="13" fontWeight="600">{stat.label}</text>
              <text x={pLabel.x} y={pLabel.y + 8} textAnchor="middle" dominantBaseline="middle" fill={unmeasured ? '#A6A6A6' : '#1C2B4A'} fontSize="12" fontWeight="700">{unmeasured ? '–' : Number(stat.value).toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};


// ----------------------------------------------------------------------
// [SCORE BREAKDOWN]
// ----------------------------------------------------------------------
const ScoreBreakdown = ({ breakdown, maxScore }: { breakdown: any, maxScore: number }) => {
  // P0-1: 미측정 대역량(final null)은 산출 근거를 표시하지 않는다.
  if (!breakdown || breakdown.final === null || breakdown.final === undefined) return null;
  const safeMax = maxScore || 5;
  // 항목별 스케일 분리: 각 막대는 '해당 항목의 실제 최대치' 기준으로 채워진다.
  // (예: STAR 깊이 +0.3 은 0.5 만점 기준 60% - 5.0 만점 기준이 아님)
  // → 숫자 범위와 시각적 비율의 인지 부조화 해소
  const fillRatio = (value: number, itemMax: number) =>
    Math.min(100, Math.max(0, (Math.abs(value) / itemMax) * 100));
  const items = [
    { label: "행동 지표 평가", value: breakdown.rubric_base, max: 4.0, color: "bg-fm-accent" },
    { label: "STAR 깊이",  value: breakdown.star_depth_bonus, max: 0.5, color: "bg-fm-accent", prefix: "+" },
    { label: "확신도",     value: breakdown.confidence_adj, max: 0.5, color: breakdown.confidence_adj >= 0 ? "bg-fm-blue-mid" : "bg-fm-gray-300", prefix: breakdown.confidence_adj >= 0 ? "+" : "" },
  ];
  return (
    <div className="print:break-inside-avoid mt-3 p-5 bg-fm-paper-soft rounded-lg border border-fm-gray-100">
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-fm-gray-500 w-20 shrink-0">{item.label}</span>
            <div className="flex-1 h-1.5 bg-fm-paper-mute rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${fillRatio(item.value, item.max)}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-fm-ink w-10 text-right">
              {item.prefix}{Number(item.value).toFixed(1)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-baseline pt-3 border-t border-fm-gray-100 mt-2">
          <span className="fm-eyebrow text-fm-gray-500">Final Score</span>
          <span className="text-xl fm-report-fig">{Number(breakdown.final).toFixed(1)} <span className="text-xs text-fm-gray-500">/ {safeMax.toFixed(1)}</span></span>
        </div>
      </div>
      {/* 주석(Footnote): 각 산출 항목의 의미 - 막대는 항목별 최대치 기준 비율 */}
      <div className="mt-4 pt-3 border-t border-fm-gray-100 space-y-1.5">
        <p className="text-[13px] text-fm-gray-500 leading-relaxed">
          <span className="font-semibold text-fm-ink">행동 지표 평가</span> : 진단을 통해 분석한 해당 역량의 발현이 행동으로 증명된 정도를 나타냅니다. (점수 범위 : 1.0~4.0)
        </p>
        <p className="text-[13px] text-fm-gray-500 leading-relaxed">
          <span className="font-semibold text-fm-ink">STAR 깊이</span> : 답변의 구조적 완성도에 따라 부여되는 가점을 나타냅니다. (최대 +0.5)
        </p>
        <p className="text-[13px] text-fm-gray-500 leading-relaxed">
          <span className="font-semibold text-fm-ink">확신도</span> : AI의 평가 신뢰도에 따라 부여되는 가점을 나타냅니다. (최대 +0.5)
        </p>
        <p className="text-[13px] text-fm-gray-300 leading-relaxed pt-1">
          ※ 각 막대는 5.0 만점이 아닌 해당 항목의 최대치를 기준으로 표시됩니다.
        </p>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [REASONING PROCESS] - SAR 심층 평가 + 실제 대화 발췌문 + Gap Analysis
//  (기준 매핑(Rubric)·어조 분석(Tone)은 고객 혼란 방지를 위해 리포트에서 제거,
//   대신 SAR 분석 바로 아래에 평가 근거인 실제 대화 발췌문을 통합)
// ----------------------------------------------------------------------
// gapAnalysis 방어 정규화: 배열/문자열화된 배열("['a','b']")이 내려와도
// 대괄호·따옴표 노출 없이 자연스러운 줄글로 변환
const normalizeGapText = (g: any): string => {
  if (!g) return "";
  if (Array.isArray(g)) return g.filter(Boolean).map(String).join(" ");
  if (typeof g === "string") {
    const s = g.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s.replace(/'/g, '"'));
        if (Array.isArray(arr)) return arr.filter(Boolean).map(String).join(" ");
      } catch { /* 파싱 실패 시 원문 유지 */ }
    }
    return s;
  }
  return String(g);
};

const ReasoningProcess = ({ reasoning, gapAnalysis, evidenceList }: { reasoning: any, gapAnalysis?: any, evidenceList?: string[] }) => {
  if (!reasoning) return null;
  const gapText = normalizeGapText(gapAnalysis);

  // 미니멀리즘: 다색 파스텔 배경 대신 선(좌측 굵은 보더)과 타이포그래피로 위계 구분
  const steps = [
    { key: "1_situation", label: "상황 (Situation)" },
    { key: "2_action",    label: "행동 (Action)" },
    { key: "3_result",    label: "결과 (Result)" },
  ];

  // 신규 포맷: 각 단계가 {description, evidence[]} 객체 (S/A/R ↔ 발췌문 1:1 매칭)
  // 구 포맷(문자열)은 하단의 통합 발췌문 섹션으로 폴백
  const isLegacyFormat = typeof reasoning["1_situation"] === "string";
  const getStep = (key: string) => {
    const raw = reasoning[key];
    if (!raw) return null;
    if (typeof raw === "string") return { description: raw, evidence: [] as string[] };
    // quotes(신규 스키마) 우선, evidence(구 필드) 폴백
    const ev = (raw.quotes || raw.evidence || []) as string[];
    return { description: raw.description || "", evidence: ev };
  };

  return (
    <div className="print:break-inside-avoid">
      <div className="mb-6 pb-4 border-b border-fm-gray-100">
        <div className="fm-eyebrow">Evidence</div>
        <h4 className="mt-1.5 text-lg font-bold text-fm-ink">심층 평가 근거</h4>
      </div>

      {/* SAR 세로 1열 - 각 블록 바로 아래에 매칭 발췌문 즉시 렌더
          [역량 블록 2 전용 페이지] 텍스트 확대(text-base)·줄간격 확장(leading-loose)으로
          A4 한 페이지를 텍스트만으로 시원하게 채우는 구성 */}
      <div className="space-y-6 mb-6">
        {steps.map((item) => {
          const step = getStep(item.key);
          if (!step || !step.description) return null;
          return (
            <div key={item.key} className="print:break-inside-avoid p-6 rounded-lg border border-fm-gray-100 bg-fm-paper-soft">
              <span className="block fm-eyebrow mb-3">
                {item.label}
              </span>
              <p className="text-base text-fm-ink font-light leading-[1.9]">{step.description}</p>
              {step.evidence.length > 0 && (
                <div className="mt-4 rounded-md bg-fm-paper border border-fm-gray-100 p-4 space-y-2.5">
                  <span className="flex items-center gap-1.5 fm-eyebrow text-fm-gray-500">
                    <span className="inline-block h-3 w-0.5 rounded-sm bg-fm-accent" />
                    관련 대화 발췌
                  </span>
                  {step.evidence.map((ev: string, i: number) => (
                    <p key={i} className="text-fm-gray-500 text-sm italic leading-relaxed border-l-2 border-fm-gray-100 pl-3">&ldquo;{ev}&rdquo;</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* (구버전 리포트 전용) 통합 발췌문 - 신규 포맷은 단계별로 렌더되므로 생략 */}
      {isLegacyFormat && evidenceList && evidenceList.length > 0 && (
        <div className="pt-4 border-t border-fm-gray-100 mb-4">
          <h5 className="fm-eyebrow text-fm-gray-500 mb-3">실제 대화 발췌문</h5>
          <div className="space-y-3">
            {evidenceList.map((ev: string, i: number) => (
              <p key={i} className="text-fm-gray-500 text-sm italic border-l-2 border-fm-gray-100 pl-4 py-1">"{ev}"</p>
            ))}
          </div>
        </div>
      )}

      {/* Gap Analysis - 구분선 + 제목 + 텍스트 */}
      {gapText && (
        <div className="pt-5 border-t border-fm-gray-100">
          <h5 className="fm-eyebrow mb-2">Gap Analysis</h5>
          <p className="text-base text-fm-ink font-light leading-[1.9]">{gapText}</p>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// [SUB SCORES TABLE] - 하위 지표 점수 테이블
// ----------------------------------------------------------------------
const SubScoresTable = ({ subScores, subLedger, totalScore, maxScore }: { subScores: any, subLedger?: any, totalScore: number, maxScore: number }) => {
  if (!subScores || Object.keys(subScores).length === 0) return null;

  const safeMax = maxScore || 5;
  const entries = Object.entries(subScores) as [string, number | null][];
  // P0-1: 측정된 하위역량만 min/max 계산 (미측정은 상태별로 표기)
  const nums = entries
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number');
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;

  // 🧭 T3 2-tier + 게이트 상태. 표시 우선순위:
  //   gate_status='pending'(검증 미완료, 도구 상태) > status(대상자 응답 상태:
  //   측정 / 근거미확보 / 미탐색). 셋은 서로 다른 의미다.
  //   G: not_explored = 원장엔 대상으로 잡혔지만 앵커 질문이 실제로 전달되지 않음(미탐색).
  const dispStateOf = (label: string): 'measured' | 'gate_pending' | 'evidence_missing' | 'unexplored' | 'not_explored' => {
    const row = subLedger?.[label];
    if (row?.gate_status === 'pending') return 'gate_pending';
    const st = row?.status;
    if (st === 'measured' || st === 'evidence_missing' || st === 'unexplored' || st === 'not_explored') return st;
    return 'unexplored'; // ledger 없으면 보수적으로 미탐색
  };

  return (
    // A4 한 페이지를 채우는 여유로운 구성: 세로 간격 대폭 확대 + 역량명 폰트 상향
    <div className="mt-4 space-y-6">
      {entries.map(([label, score]) => {
        const scored = typeof score === 'number';
        const ds = scored ? 'measured' : dispStateOf(label);
        const measured = ds === 'measured' && scored;
        const isHigh = measured && score === max;
        const isLow  = measured && score === min;
        const isEvMissing = ds === 'evidence_missing';
        const isPending   = ds === 'gate_pending';
        // 검증 미완료(네이비 틴트): 도구 상태. 근거 미확보(회색): 대상자 응답 상태.
        const stLabel = isPending ? '검증 미완료' : isEvMissing ? '근거 미확보' : '미탐색';
        const stTip = isPending
          ? '역량 판정 검증(레벨 게이트)이 완료되지 않아 점수를 보류했습니다. 대상자 역량과 무관한 도구 상태입니다 - 재생성 시 해소됩니다.'
          : isEvMissing
          ? '질문은 드렸으나 구체 사례가 확인되지 않아 점수를 산출하지 않았습니다.'
          : ds === 'not_explored'
          ? '이번 진단에서 이 하위역량에 대한 질문이 실제로 전달되지 않아 다루지 못했습니다(미탐색). 근거 미확보와 다릅니다.'
          : '이 하위역량은 이번 진단에서 다루지 않았습니다(미탐색).';
        // 측정 = ink, 검증 미완료(도구 상태) = 네이비, 근거 미확보·미탐색 = 보조 회색
        const labelColor = measured ? 'text-fm-ink' : isPending ? 'text-fm-accent' : isEvMissing ? 'text-fm-gray-500' : 'text-fm-gray-300';
        // 상태 배지: 검증 미완료만 네이비 틴트, 나머지는 회색 칩
        const valColor = isPending ? 'border-fm-accent-tint bg-fm-accent-tint text-fm-accent' : isEvMissing ? 'border-fm-gray-100 bg-fm-paper-mute text-fm-gray-500' : 'border-fm-gray-100 bg-fm-paper-mute text-fm-gray-500';
        return (
          <div key={label} className="flex items-center gap-4">
            <span className={`text-[15px] font-semibold min-w-[150px] flex-shrink-0 break-keep ${labelColor}`}>{label}</span>
            <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${measured ? 'bg-fm-paper-mute' : 'border border-dashed border-fm-gray-300'}`}>
              {measured && (
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-fm-accent' : isLow ? 'bg-fm-blue-mid' : 'bg-fm-accent'}`}
                  style={{ width: `${((score as number) / safeMax) * 100}%` }}
                />
              )}
            </div>
            <span
              title={measured ? undefined : stTip}
              className={`text-right ${measured ? `w-14 text-lg fm-report-fig ${isHigh ? 'text-fm-accent' : isLow ? 'text-fm-gray-500' : 'text-fm-ink'}` : `w-24 inline-flex justify-end`}`}>
              {measured ? Number(score).toFixed(1) : <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold cursor-help ${valColor}`}>{stLabel}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ----------------------------------------------------------------------
// [MAIN REPORT CONTENT]
// ----------------------------------------------------------------------
function ReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');

  const [report, setReport] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState("데이터 분석 중...");
  const [canRetry, setCanRetry] = useState(false);  // item4: 지연/실패 재시도
  const [retryCount, setRetryCount] = useState(0);  // B: 재시도 상한(3)
  // item6: 서버가 분석 중이면 진행 단계(라벨·경과)를 보여준다.
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const _MAX_POLLS = 30;   // 2초 × 30 = 60초 (분석 중 대기 상한)
  const _MAX_RETRY = 3;
  // 기본 상태 '항상 펼침(Always Expanded)': 리포트 진입 즉시 5개 역량 상세가
  // 모두 열려 있어야 인쇄·PDF 저장 시 내용 누락 없이 전체가 출력된다.
  const [openDetail, setOpenDetail] = useState<string | null>("ALL");

  const [competencyLabels, setCompetencyLabels] = useState<Record<string, string>>({});
  const [subCompetencies, setSubCompetencies] = useState<Record<string, string[]>>({});
  const [maxScore, setMaxScore] = useState<number>(5.0);
  const [frameworkCompetencies, setFrameworkCompetencies] = useState<FrameworkCompetency[]>([]);

  const reportRef = useRef<HTMLDivElement>(null);

  // 등장 효과: 종합 점수 → 대역량 점수(레이더와 같은 값)가 1~5 를 돌다 멈추고, 멈춘 뒤 막대가 채워진다.
  const compScoreTargets: Array<number | null> = frameworkCompetencies.map((c) => {
    const raw = report?.radar_chart?.[c.name] ?? report?.radar_chart?.[c.key];
    return typeof raw === 'number' ? raw : null;
  });
  const totalTarget: Array<number | null> = [typeof report?.total_score === 'number' ? report.total_score : null];
  const totalRoll = useRollingScores(report ? totalTarget : [], { delay: 150, duration: 1800, loops: 3 });
  const compRoll = useRollingScores(report ? compScoreTargets : [], { delay: 450, duration: 1700, stagger: 160, loops: 2 });
  const rolledByName: Record<string, number | null> = Object.fromEntries(
    frameworkCompetencies.map((c, i) => [c.name, compRoll.values[i] ?? null]),
  );
  // 미리보기용 예시 데이터: /report?...&demo=compare (조직 비교 · 추천 교육이 비어 있을 때만 예시로 채움)
  const compareDemo = searchParams.get('demo') === 'compare';
  const courseIsDemo = !report?.course_recommendation && compareDemo;
  const courseRec = report?.course_recommendation || (courseIsDemo ? DEMO_COURSE_RECOMMENDATION : null);

  useEffect(() => {
    if (!sessionId) return setStatusMsg("세션 정보가 없습니다.");
    loadReport();
  }, [sessionId]);

  useEffect(() => {
    Promise.all([
      getKeyToNameMap(),
      getSubCompetenciesMap(),
      fetchFramework(),
    ]).then(([labels, subs, framework]) => {
      setCompetencyLabels(labels);
      setSubCompetencies(subs);
      setMaxScore(framework.scoring.max_score);
      setFrameworkCompetencies(framework.competencies);
    }).catch((err) => {
      console.error("Failed to load framework:", err);
    });
  }, []);

  // B: 리포트 부재 404의 두 상황을 구분한다.
  //   · analyzing → 기다리면 나옴 → 계속 폴링(상한 60초).
  //   · degraded  → 기다려도 안 나옴 → 폴링 중단 + 재시도 유도.
  //   재시도 상한 3(크레딧 소진처럼 즉시 회복 안 되는 원인의 무한 재시도 방지).
  const loadReport = async (attempt = 0) => {
    try {
      const res = await apiClient.get(`/reports/${sessionId}`);
      setReport(res.data);
    } catch (err: any) {
      const st = err.response?.status;
      const status = err.response?.data?.detail?.analysis_status;
      if (st === 404 && status === "degraded") {
        // 오염: 기다려도 안 나옴 → 폴링 중단, 재시도 유도.
        setStatusMsg("리포트 생성이 일시적으로 실패했습니다. 다시 시도해 주세요. (대화 내용은 저장되어 있어 이어서 진행할 수 있습니다)");
        setCanRetry(true);
      } else if (st === 404) {
        // item6: 서버 진행 상태로 분기 - 분석(수 분)이 실제로 돌고 있으면 60초
        //   상한과 무관하게 계속 기다린다(상한에 걸려 '지연 → 재시도'로 같은
        //   분석을 한 번 더 돌리던 문제). 상태가 없으면(시작 전·서버 재시작)
        //   기존처럼 60초 폴링 후 재시도 유도.
        const p = sessionId ? await fetchAnalysisProgress(sessionId) : null;
        setProgress(p);
        if (p?.stage === 'failed') {
          setStatusMsg("리포트 생성 중 오류가 발생했습니다. 다시 시도해 주세요. (대화 내용은 저장되어 있어 이어서 진행할 수 있습니다)");
          setCanRetry(true);
        } else if (isProgressRunning(p)) {
          setStatusMsg("AI가 정밀 분석 중입니다...");
          setTimeout(() => loadReport(attempt), 2000);
        } else if (attempt < _MAX_POLLS) {
          setStatusMsg("AI가 정밀 분석 중입니다...");
          setTimeout(() => loadReport(attempt + 1), 2000);
        } else {
          setStatusMsg("리포트 생성이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
          setCanRetry(true);
        }
      } else {
        setStatusMsg("오류가 발생했습니다. 다시 시도해주세요.");
        setCanRetry(true);
      }
    }
  };

  // B: 재시도 = 재분석(analyze) 트리거 후 폴링. 상한 초과 시 안내로 전환.
  const handleRetry = async () => {
    if (retryCount >= _MAX_RETRY) {
      setStatusMsg("잠시 후 다시 시도해 주세요. 대화 내용은 저장되어 있어 이어서 진행할 수 있습니다.");
      return;  // 버튼은 비활성 유지
    }
    setRetryCount((c) => c + 1);
    setCanRetry(false);
    setStatusMsg("AI가 다시 분석 중입니다...");
    setProgress(null);
    // item6: 분석 완료(수 분)를 기다리지 않고 바로 폴링 - 폴링이 진행 단계를
    //   보여주고, 끝나면 리포트를 띄운다. 실패는 서버 진행 상태(failed)나
    //   degraded 마커로 폴링이 판정한다. 409(이미 분석 중)도 폴링으로 합류.
    apiClient.post(`/reports/${sessionId}/analyze`)
      .catch(() => { /* 폴링이 상태를 다시 판정 */ });
    setTimeout(() => loadReport(0), 1500);
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    // 등장 효과가 진행 중이어도 PDF 는 마무리된 상태로: 즉시 최종 값으로 맞추고 두 프레임 기다린다
    finishReportMotion();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      // 블록 단위 독립 캡처(Block-by-Block Capture):
      // 거대 캔버스를 297mm 씩 기계적으로 자르던 방식은 중간 잘림·억지 여백을
      // 유발하므로 폐기. 문서에 배치된 '.pdf-page-block' 래퍼들을 각각 독립
      // 캡처해 1블록 = 1페이지(A4)로 담는다 → 페이지 경계가 항상 블록 경계.
      // 페이지 채우기(Flow Packing): 리포트를 의미 단위(.pdf-unit)로 나눠 각각 캡처한 뒤,
      // A4 폭에 맞춰 위에서부터 차곡차곡 쌓는다. 남은 공간에 다음 단위가 들어가지 않으면
      // 새 페이지로 넘긴다. 한 단위가 한 장보다 크면 그 단위만 비율을 유지한 채 축소한다.
      // → 페이지 중간에서 잘리지 않으면서, 예전처럼 반쪽씩 비는 페이지가 생기지 않는다.
      const units = Array.from(reportRef.current.querySelectorAll<HTMLElement>('.pdf-unit'))
        .filter((el) => el.offsetParent !== null && !el.parentElement?.closest('.pdf-unit'));
      if (units.length === 0) {
        throw new Error('pdf-unit 요소를 찾을 수 없습니다.');
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const gap = 4;
      const contentWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      let y = margin;
      let pageHasContent = false;

      // 1) 모든 단위를 먼저 캡처(제목 줄은 다음 단위와 같은 페이지에 붙이기 위해 높이를 미리 안다)
      reportRef.current.classList.add('fm-pdf-capturing');
      const shots: { img: string; w: number; h: number; keepNext: boolean; group: string }[] = [];
      try {
        for (const unit of units) {
          const canvas = await html2canvas(unit, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
          } as any);
          if (canvas.width === 0 || canvas.height === 0) continue;
          let w = contentWidth;
          let h = (canvas.height * contentWidth) / canvas.width;
          if (h > maxHeight) { w = contentWidth * (maxHeight / h); h = maxHeight; }
          shots.push({ img: canvas.toDataURL('image/jpeg', 0.85), w, h, keepNext: unit.dataset.pdfKeepNext === '1', group: unit.dataset.pdfGroup || '' });
        }
      } finally {
        reportRef.current.classList.remove('fm-pdf-capturing');
      }

      // 2) 같은 그룹(역량 상세 + 평가 근거)은 한 덩어리로 묶는다. 한 장을 넘으면 덩어리 전체를
      //    같은 비율로 줄여 한 장에 담는다 → 역량 하나 = 한 페이지.
      const items: { parts: typeof shots; h: number; keepNext: boolean }[] = [];
      for (const sh of shots) {
        const last = items[items.length - 1];
        // 같은 그룹이거나, 바로 앞이 '다음과 붙여 둘' 섹션 제목이면 한 덩어리로 합친다
        if (last && ((sh.group && last.parts[last.parts.length - 1].group === sh.group) || last.keepNext)) {
          last.parts.push(sh);
          last.keepNext = sh.keepNext;
        } else {
          items.push({ parts: [sh], h: 0, keepNext: sh.keepNext });
        }
      }
      for (const it of items) {
        let total = it.parts.reduce((a, p) => a + p.h, 0) + gap * (it.parts.length - 1);
        if (total > maxHeight) {
          const k = maxHeight / total;
          it.parts = it.parts.map((p) => ({ ...p, w: p.w * k, h: p.h * k }));
          total = maxHeight;
        }
        it.h = total;
      }

      // 3) 위에서부터 차곡차곡. 남은 공간에 안 들어가면 새 페이지.
      //    keepNext(섹션 제목)는 다음 덩어리 일부까지 함께 들어갈 공간이 없으면 같이 다음 페이지로.
      items.forEach((it, i) => {
        const need = it.keepNext && items[i + 1] ? it.h + gap + Math.min(items[i + 1].h, maxHeight / 3) : it.h;
        if (pageHasContent && y + need > pageHeight - margin) {
          pdf.addPage();
          y = margin;
          pageHasContent = false;
        }
        for (const p of it.parts) {
          pdf.addImage(p.img, 'JPEG', margin + (contentWidth - p.w) / 2, y, p.w, p.h);
          y += p.h + gap;
        }
        pageHasContent = true;
      });

      pdf.save('Leadership_Report.pdf');
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      alert("PDF 저장 중 오류가 발생했습니다.");
    }
  };

  if (!report) {
    return (
      <div className="fm-app fm-report">
        <ParticipantHeader step={6} />
        <div className="fm-report-wait fm-wrap-narrow">
          {!canRetry && !isProgressRunning(progress) && (
            <div className="fm-report-spinner" aria-hidden="true"></div>
          )}
          <div className="fm-eyebrow">Leadership Diagnosis Report</div>
          <h2 className={`mt-3 text-base font-semibold mb-2 break-keep ${canRetry ? 'text-fm-ink' : 'text-fm-ink-body'}`}>{statusMsg}</h2>
          {/* A-4: 서버가 분석 중이면 챕터별 단계표(✓/분석 중…/대기) + 종합 */}
          {!canRetry && isProgressRunning(progress) && progress && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <AnalysisChecklist progress={progress} estimate={null} />
              <p className="fm-caption">이 화면을 닫지 말고 기다려 주세요.</p>
            </div>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retryCount >= _MAX_RETRY}
              className="fm-btn sm mt-4">
              {retryCount >= _MAX_RETRY ? '잠시 후 다시 시도' : '다시 시도'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const detailsData = report.details ?? {};

  // H6: 가짜 인적사항 금지 - 이름은 실제 참가자명, 없으면 중립 호칭 '리더'.
  const displayName = !report.user_name || report.user_name === "Leader" || report.user_name === "User"
                      ? "리더"
                      : report.user_name;

  // H6: 응답자 정보는 백엔드(/reports/{sid} → participant)에서 온 값만 표시하고,
  //   없는 항목은 칸 자체를 숨긴다(소속/부서/직급 하드코딩 제거).
  const participant = report.participant ?? {};
  const respondentRows: Array<{ label: string; value: string }> = [
    participant.company_name ? { label: '소속', value: String(participant.company_name) } : null,
    participant.group_code ? { label: '그룹 코드', value: String(participant.group_code) } : null,
    participant.email ? { label: '이메일', value: String(participant.email) } : null,
    { label: '진단일', value: String(report.created_at || new Date().toISOString().slice(0, 10)) },
  ].filter((r): r is { label: string; value: string } => r !== null);

  // IDP - 있으면 번호 01/02/03, 없으면 04 추천 교육으로 잇는 한 줄(자가진단 제출 여부와 무관하게 표시)
  const renderIdp = () => (
Array.isArray(report.idp) && report.idp.length > 0 ? (
                  <div className="print:break-inside-avoid mt-4 fm-card">
                    <p className="fm-eyebrow">Individual Development Plan</p>
                    <h3 className="mt-1 text-lg font-bold text-fm-ink mb-5">개인 발전 계획 (IDP)</h3>
                    <div className="divide-y divide-fm-gray-100">
                      {report.idp.map((item: string, idx: number) => (
                        <div key={idx} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                          <span className="fm-eyebrow shrink-0 pt-1 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                          <p className="text-fm-ink text-[15px] font-light leading-[1.8] break-keep">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 px-1 text-sm font-light text-fm-gray-500 break-keep">구체적인 다음 걸음은 04 추천 교육에서 이어집니다.</p>
                )
  );

  return (
    <main className="fm-app fm-report">
      {/* 상단 헤더 - 인쇄물(print:hidden, ParticipantHeader 기본)·PDF 캡처(data-html2canvas-ignore)에서 제외 */}
      <div data-html2canvas-ignore="true">
        <ParticipantHeader
          step={6}
          right={
            <>
              <span className="user">{displayName} 님</span>
              <span className="sep" />
              <button type="button" onClick={() => window.print()} className="fm-btn sm secondary">인쇄</button>
              <button type="button" onClick={handleDownloadPDF} className="fm-btn sm">
                PDF 저장
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.5v8M4.5 7l3.5 3.5L11.5 7M3 13.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          }
        />
      </div>
      <div data-html2canvas-ignore="true" className="fm-wrap-narrow print:hidden">
        <ParticipantMobileStep step={6} className="fm-report-mstep" />
      </div>

      <div ref={reportRef} className="fm-wrap-narrow fm-report-body">

        {/* ══ [PDF 페이지 1] 타이틀 & 응답자 정보 & 3단 대시보드 ══ */}
        <div className="print:break-after-page">

        {/* ── [섹션 1] 타이틀 & 아키타입 & 응답자 정보 - 샘플 타이틀 블록(눈썹 + 제목 + 메타 / 아키타입 카드) ── */}
        <section className="print-section fm-report-title pdf-unit">
          <div className="min-w-0">
            <div className="fm-eyebrow">Leadership Diagnosis Report</div>
            <h1 className="break-keep">{displayName} 님의 리더십 역량 심층 분석 리포트</h1>
            {/* 응답자 정보 - 제목 아래 한 줄 메타 */}
            <div className="meta fm-caption">
              {respondentRows.map((row) => (
                <span key={row.label} className="break-all">{row.label} {row.value}</span>
              ))}
            </div>
          </div>

        </section>

        {/* 🚧 T-A fail-closed: 레벨 게이트 검증 미완료 경고 (상단). 도구 상태이며
            대상자 역량과 무관 - 재생성 시 해소. 조용한 fail-open 을 막는 신호. */}
        {report.coverage?.gate_incomplete && (
          <div className="print:break-inside-avoid mb-6 rounded-lg border border-fm-gray-100 bg-fm-accent-tint p-5">
            <div className="flex items-start gap-3">
              <span className="text-fm-accent text-lg font-bold">⚠</span>
              <div>
                <p className="text-sm font-bold text-fm-accent">역량 판정 검증 미완료 {report.coverage.gate_pending}건</p>
                <p className="mt-1 text-xs text-fm-ink-body leading-relaxed">
                  일부 하위역량의 레벨 판정 검증(레벨 게이트)이 완료되지 않아 해당 항목의 점수를 보류했습니다.
                  이는 <b>도구 처리 상태</b>이며 대상자의 역량 수준과 무관합니다. 잠시 후 리포트를 재생성하면 해소됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {(() => {
          /* B(2026-09-29): 종합 점수는 항상 보인다. composite_mode(과거 리포트는
             composite_shown)로 '정식/참고치'만 구분 - 숨기지 않는다. */
          const cov = report.coverage;
          const official = cov ? (cov.composite_mode ? cov.composite_mode === 'official' : !!cov.composite_shown) : true;
          const measuredCnt = cov?.measured_total ?? cov?.measured ?? 0;
          const hasScore = typeof report.total_score === 'number' && (!cov || measuredCnt > 0);
          const note = cov?.composite_note
            || `${cov?.total ?? 26}개 지표 중 ${measuredCnt}개 확인`;
          return (
            <>
              {/* ── 핵심 지표 한 줄: 종합 점수 · 강화 역량 · 개선 필요 역량 · 리더십 아키타입 ── */}
              {(() => {
                // 강화/개선 필요 역량: 측정된 대역량 점수(레이더와 같은 값) 중 최고·최저. 모두 같으면 '고르게 분포'.
                const measuredComps = frameworkCompetencies
                  .map((c) => { const raw = report.radar_chart?.[c.name] ?? report.radar_chart?.[c.key]; return { name: c.name, v: typeof raw === 'number' ? raw : null }; })
                  .filter((x): x is { name: string; v: number } => x.v !== null);
                const hi = measuredComps.length ? measuredComps.reduce((a, b) => (b.v > a.v ? b : a)) : null;
                const lo = measuredComps.length ? measuredComps.reduce((a, b) => (b.v < a.v ? b : a)) : null;
                const flat = !!hi && !!lo && hi.v === lo.v;
                return (
                  <section className="print-section fm-report-kpis pdf-unit" aria-label="핵심 지표">
                    <div className="fm-card fm-report-kpi print:break-inside-avoid">
                      <div className="kk">종합 점수</div>
                      <div className={`v fm-report-fig ${official ? '' : 'ref'}`}>
                        {hasScore ? Number(totalRoll.values[0] ?? report.total_score).toFixed(1) : '—'}<small>/ {maxScore.toFixed(1)}</small>
                      </div>
                      <div className="k fm-caption">
                        측정된 역량의 심층 평가 평균
                        {!official && <span className="fm-chip tint ml-2 align-middle">{cov?.composite_badge || '참고치'}</span>}
                        {cov && typeof cov.asked === 'number' && <span className="block mt-1">탐색 {cov.asked}/{cov.total} · 측정 {cov.measured}/{cov.total} 하위역량</span>}
                      </div>
                    </div>
                    <div className="fm-card fm-report-kpi print:break-inside-avoid">
                      <div className="kk">강화 역량</div>
                      {hi && !flat ? (
                        <>
                          <div className="nmv">{hi.name}</div>
                          <div className="k fm-caption">가장 높게 나타난 역량 · <b className="fm-report-fig">{hi.v.toFixed(1)}</b></div>
                        </>
                      ) : (
                        <>
                          <div className="nmv off">{flat ? '고르게 분포' : '—'}</div>
                          <div className="k fm-caption">{flat ? '역량 간 점수 차이가 없습니다' : '측정된 역량이 없습니다'}</div>
                        </>
                      )}
                    </div>
                    <div className="fm-card fm-report-kpi print:break-inside-avoid">
                      <div className="kk">개선 필요 역량</div>
                      {lo && !flat ? (
                        <>
                          <div className="nmv">{lo.name}</div>
                          <div className="k fm-caption">가장 낮게 나타난 역량 · <b className="fm-report-fig">{lo.v.toFixed(1)}</b></div>
                        </>
                      ) : (
                        <>
                          <div className="nmv off">{flat ? '고르게 분포' : '—'}</div>
                          <div className="k fm-caption">{flat ? '역량 간 점수 차이가 없습니다' : '측정된 역량이 없습니다'}</div>
                        </>
                      )}
                    </div>
                    {report.archetype && (
                      <aside className="fm-card fm-report-kpi fm-report-arch print:break-inside-avoid">
                        <div className="kk">리더십 아키타입</div>
                        <h2 className="break-keep">{report.archetype.name}</h2>
                        <p className="break-keep">{report.archetype.description}</p>
                      </aside>
                    )}
                  </section>
                );
              })()}

              {/* 01 OVERALL SUMMARY - 역량 밸런스 · 대역량별 점수 · 종합 피드백 · 키워드 */}
              {/* ── [섹션 2] 대시보드 - 좌: 역량 밸런스 레이더 / 우: 대역량별 점수 ── */}
              <div className="pdf-unit">
              <SectionHead no="01" en="Overview" ko="종합 요약" className="fm-report-sec" />
              <div className="print-section fm-report-ov mb-6">
                {/* B: 레이더도 항상 표시 - 미측정 역량은 빈 점·회색 점선으로 빈칸을 드러낸다. */}
                <div className="fm-card print:break-inside-avoid">
                  <div className="cap-head">
                    <div>
                      <div className="fm-eyebrow">Competency balance</div>
                      <h3>역량 밸런스</h3>
                    </div>
                    <span className="fm-caption">{maxScore.toFixed(1)} 만점</span>
                  </div>
                  <div className="w-full flex-1 min-h-[220px]">
                    <RadarChart
                      data={report.radar_chart}
                      competencies={frameworkCompetencies}
                      maxScore={maxScore}
                      selfScores={report.self_assessment?.scores ?? null}
                      groupAverages={report.group_comparison?.available ? (report.group_comparison.averages ?? null) : null}
                      displayData={rolledByName}
                    />
                  </div>
                  {/* 범례 - 실선: 대화에 드러난 나 / 점선: 스스로 보는 나 / (조건부) 진회색 실선: 그룹 평균 */}
                  <div className="fm-report-legend">
                    <span>
                      <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#1C2B4A" strokeWidth="2" /></svg>
                      대화에 드러난 나
                    </span>
                    {report.self_assessment?.scores && (
                      <span>
                        <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#A6A6A6" strokeWidth="1.6" strokeDasharray="5 4" /></svg>
                        스스로 보는 나
                      </span>
                    )}
                    {report.group_comparison?.available && report.group_comparison.averages && (
                      <span>
                        <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#7F7F7F" strokeWidth="1.6" /></svg>
                        {report.group_comparison.label || '그룹 평균'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 대역량 5개 점수 막대 - 레이더와 같은 값(report.radar_chart). 계산 없음. */}
                <div className="fm-card fm-report-scores print:break-inside-avoid">
                  <div className="cap-head">
                    <div>
                      <div className="fm-eyebrow">Scores</div>
                      <h3>대역량별 점수</h3>
                    </div>
                    {hasScore && <span className="fm-caption">종합 {Number(report.total_score).toFixed(1)}</span>}
                  </div>
                  {frameworkCompetencies.length > 0 && (
                    <div>
                      {frameworkCompetencies.map((c, ci) => {
                        const raw = report.radar_chart?.[c.name] ?? report.radar_chart?.[c.key];
                        const v = typeof raw === 'number' ? raw : null;
                        const shownV = compRoll.values[ci] ?? v;   // 굴러가는 표시 값
                        const settled = compRoll.done[ci] ?? false;  // 숫자가 멈춘 뒤에 막대를 채운다
                        return (
                          <div key={c.key} className="srow">
                            <div className="top">
                              <span className={`nm break-keep ${v === null ? 'off' : ''}`}>{c.name}</span>
                              <span
                                title={v === null ? '이번 세션에서 확인되지 않은 영역입니다(미측정).' : undefined}
                                className={`fm-report-fig ${v === null ? 'off' : ''}`}>
                                {v === null ? '—' : Number(shownV).toFixed(1)}<small>/{(maxScore || 5).toFixed(1)}</small>
                              </span>
                            </div>
                            {c.description && <div className="d fm-caption break-keep">{c.description}</div>}
                            <div className={`fm-bar ${v === null ? 'fm-report-bar-off' : ''}`}>
                              {v !== null && (
                                <i className="fm-report-fill" style={{ width: settled ? `${Math.min(100, Math.max(0, (v / (maxScore || 5)) * 100))}%` : '0%' }} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 맨 아래 한 줄 - 확인된 지표 수(백엔드 composite_note 우선). */}
                  {cov && (
                    <p className="fm-caption mt-5 break-keep">{note}</p>
                  )}
                </div>
              </div>
              </div>
            </>
          );
        })()}

        {/* 조직 내 위치 비교 - 전체 · 본부 · 팀. 데이터가 없는 단계는 안내만(가짜 숫자 금지).
            demo=compare 일 때만 '예시 데이터' 로 채운 미리보기. */}
        {(() => {
          const names = frameworkCompetencies.map((c) => c.name);
          const { levels, demo } = buildCompareLevels(report, names, compareDemo);
          const mine: Record<string, number | null> = Object.fromEntries(frameworkCompetencies.map((c) => {
            const raw = report.radar_chart?.[c.name] ?? report.radar_chart?.[c.key];
            return [c.name, typeof raw === 'number' ? raw : null];
          }));
          return (
            <div className="print-section mb-6 pdf-unit">
              <OrgCompare competencies={frameworkCompetencies} myScores={mine} maxScore={maxScore} levels={levels} demo={demo} />
            </div>
          );
        })()}

        {/* ── [섹션 3] 종합 피드백 & 키워드 - 요구사항: 점수/차트/피드백/
              키워드를 여백 없이 '단일 1페이지'에 모두 압축. 별도 페이지 블록을
              해제하고 상단 대시보드와 같은 pdf-page-block 안에 병합한다. ── */}
        <div className="print-section mb-4">
          {/* 종합 피드백 - 전체 너비 */}
          <div className="fm-card mb-4 pdf-unit">
            <p className="fm-eyebrow">Summary</p>
            <h3 className="mt-1 text-lg font-bold text-fm-ink mb-4">종합 피드백</h3>
            <p className="text-fm-ink text-base font-light leading-[1.9] break-keep">
              {report.summary || report.feedback_summary || "종합 피드백이 없습니다."}
            </p>
          </div>
          {/* 핵심 키워드 - {keyword, meaning} 구조 (구버전 문자열 배열도 호환) */}
          <div className="print:break-inside-avoid fm-card pdf-unit">
            <p className="fm-eyebrow">Keywords</p>
            <h3 className="mt-1 text-lg font-bold text-fm-ink mb-5">핵심 키워드</h3>
            {/* 2단 격자 카드 - 상단 배지(키워드) + 하단 설명 */}
            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4">
              {(report.top_keywords || []).map((kw: any, i: number) => {
                const keyword = typeof kw === 'string' ? kw : kw?.keyword;
                const meaning = typeof kw === 'object' ? kw?.meaning : null;
                if (!keyword) return null;
                return (
                  <div key={i} className="print:break-inside-avoid p-5 bg-fm-paper-soft rounded-lg border border-fm-gray-100">
                    <span className="inline-block px-3 py-1 rounded-md bg-fm-accent text-white text-[13px] font-semibold tracking-wide mb-3">
                      {keyword}
                    </span>
                    {meaning && (
                      <p className="text-sm text-fm-gray-500 leading-relaxed break-keep">{meaning}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        </div>
        {/* ══ [PDF 페이지 1] 끝 - 점수·차트·피드백·키워드 1페이지 압축 ══ */}

        {/* ══ [PDF 페이지 2] 스스로 보는 나 · 대화에 드러난 나 & IDP ══ */}
        {/* ── [섹션 4] 자가진단 비교(Self View) & IDP - 문구·차이·해석은 전부 백엔드 값 그대로 ── */}
        <div className="print:break-after-page print-section mb-16 pdf-unit">
          <SectionHead no="02" en="Self View & Discovery" ko="스스로 보는 나와 대화에 드러난 나" className="fm-report-sec" />
          {(() => {
            const sv = report.self_view;
            // 자가진단 미제출: 섹션 전체를 안내 한 줄 카드로.
            if (sv && sv.submitted === false) {
              return (
                <>
                  <div className="fm-card">
                    <p className="text-[15px] font-light leading-[1.8] text-fm-gray-500 break-keep">{sv.message}</p>
                  </div>
                  {renderIdp()}
                </>
              );
            }
            const rows: SelfViewRow[] = Array.isArray(sv?.rows) ? sv.rows : [];
            const num = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : '—');
            // 차이 표기: 부호 포함(+2.0 / −1.1). 값 자체는 백엔드 diff 그대로.
            const diffText = (d: unknown) => (typeof d === 'number' ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}` : '—');
            const badgeCls = (kind: string) =>
              kind === 'self_higher' || kind === 'self_lower'
                ? 'border-fm-gray-100 bg-fm-accent-tint text-fm-accent'
                : kind === 'reference'   // 참고치 챕터: 수치는 보이되 단정하지 않음 - 네이비 점선
                ? 'border-dashed border-fm-gray-100 bg-fm-paper text-fm-accent'
                : kind === 'unmeasured'
                ? 'border-dashed border-fm-gray-300 bg-fm-paper text-fm-gray-300'
                : 'border-fm-gray-100 bg-fm-paper-soft text-fm-gray-500';
            const diffBadge = (row: SelfViewRow) => (
              <span className={`inline-block min-w-[52px] rounded-md border px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${badgeCls(row.kind)}`}>{diffText(row.diff)}</span>
            );
            return (
              <>
                {rows.length > 0 && (
                  <div className="fm-card fm-report-flush">
                    {/* 표(768px 초과·인쇄) */}
                    <table className="hidden lg:table print:table w-full text-left">
                      <thead>
                        <tr className="border-b border-fm-gray-100 bg-fm-paper-soft text-xs font-semibold text-fm-gray-500">
                          <th className="px-7 py-3.5 font-semibold w-[13%]">영역</th>
                          <th className="px-3 py-3.5 font-semibold text-right w-[14%] whitespace-nowrap">스스로 보는 나</th>
                          <th className="px-3 py-3.5 font-semibold text-right w-[15%] whitespace-nowrap">대화에 드러난 나</th>
                          <th className="px-3 py-3.5 font-semibold text-center w-[11%]">차이</th>
                          <th className="px-7 py-3.5 font-semibold">해석</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-fm-gray-100">
                        {rows.map((row) => (
                          <tr key={row.key}>
                            <td className="px-7 py-4 text-[15px] font-semibold text-fm-ink whitespace-nowrap">{row.name}</td>
                            <td className="px-3 py-4 text-right text-lg fm-report-fig text-fm-gray-500">{num(row.self)}</td>
                            <td className={`px-3 py-4 text-right text-lg tabular-nums ${typeof row.measured === 'number' ? 'fm-report-fig text-fm-ink' : 'font-light text-fm-gray-300'}`}>{num(row.measured)}</td>
                            <td className="px-3 py-4 text-center">{diffBadge(row)}</td>
                            <td className={`px-7 py-4 text-sm font-light leading-relaxed break-keep ${row.kind === 'unmeasured' ? 'text-fm-gray-300' : row.kind === 'reference' ? 'text-fm-accent' : 'text-fm-ink'}`}>{row.interpretation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* 카드 목록(1024px 미만) - 좁은 화면에서 표가 깨지지 않게 접는다 */}
                    <div className="lg:hidden print:hidden divide-y divide-fm-gray-100">
                      {rows.map((row) => (
                        <div key={row.key} className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[15px] font-semibold text-fm-ink">{row.name}</span>
                            <span className="inline-flex items-center gap-2 text-[11px] text-fm-gray-500">차이 {diffBadge(row)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-md bg-fm-paper-soft px-4 py-3">
                              <div className="text-[11px] text-fm-gray-500">스스로 보는 나</div>
                              <div className="mt-0.5 text-xl fm-report-fig text-fm-gray-500">{num(row.self)}</div>
                            </div>
                            <div className="rounded-md bg-fm-paper-soft px-4 py-3">
                              <div className="text-[11px] text-fm-gray-500">대화에 드러난 나</div>
                              <div className={`mt-0.5 text-xl tabular-nums ${typeof row.measured === 'number' ? 'fm-report-fig text-fm-ink' : 'font-light text-fm-gray-300'}`}>{num(row.measured)}</div>
                            </div>
                          </div>
                          <p className={`mt-3 text-sm font-light leading-relaxed break-keep ${row.kind === 'unmeasured' ? 'text-fm-gray-300' : row.kind === 'reference' ? 'text-fm-accent' : 'text-fm-ink'}`}>{row.interpretation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 요약 한 단락 - 백엔드 self_view.summary */}
                {sv?.summary && (
                  <div className="mt-4 fm-card">
                    <p className="fm-eyebrow mb-3">Discovery</p>
                    <p className="text-fm-ink text-base font-light leading-[1.9] break-keep">{sv.summary}</p>
                  </div>
                )}

                {renderIdp()}
              </>
            );
          })()}
        </div>

        {/* ── [섹션 5] 역량별 심층 진단 ── */}
        <div className="space-y-4">
          {/* 03 COMPETENCY DEEP DIVE */}
          <div className="fm-report-sec fm-report-sec-row pdf-unit" data-pdf-keep-next="1">
            <SectionHead no="03" en="Competency Deep Dive" ko="역량별 상세" className="flex-1" />
            <button type="button" onClick={() => setOpenDetail(openDetail === "ALL" ? null : "ALL")}
              data-html2canvas-ignore="true"
              className="print:hidden fm-btn sm secondary">
              {openDetail === "ALL" ? "전체 닫기" : "전체 펼치기"}
            </button>
          </div>

          {Object.entries(detailsData).map(([key, value]: any, idx) => {
            const label          = competencyLabels[key] || key;
            const score          = typeof value === 'object' ? value.score : value;
            const measured       = score !== null && score !== undefined;  // P0-1
            const isReference    = typeof value === 'object' ? value.is_reference : false;
            const comment        = typeof value === 'object' ? value.comment : "상세 분석 내용이 없습니다.";
            const evidenceList   = typeof value === 'object' && Array.isArray(value.evidence_list) ? value.evidence_list : [];
            const reasoning      = typeof value === 'object' ? value.reasoning_process : null;
            const scoreBreakdown = typeof value === 'object' ? value.score_breakdown : null;
            const strengthPoint  = typeof value === 'object' ? value.strength_point : null;
            const growthPoint    = typeof value === 'object' ? value.growth_point : null;
            const gapAnalysis    = typeof value === 'object' ? value.gap_analysis : null;
            const aiSubScores    = typeof value === 'object' ? value.sub_scores : null;
            const aiSubLedger    = typeof value === 'object' ? value.sub_ledger : null;

            const hasValidSubScores = aiSubScores && Object.keys(aiSubScores).length > 0;
            const defaultSubLabels  = subCompetencies[key] || [];
            const subScores = hasValidSubScores
              ? aiSubScores
              : defaultSubLabels.reduce((acc: any, curr: string) => ({ ...acc, [curr]: score }), {});

            const isOpen = openDetail === "ALL" || openDetail === key;

            return (
              <React.Fragment key={idx}>

                {/* ① [역량 블록 1: 요약 및 차트] 헤더 + 코치 피드백 + 세부 역량 + 산출 근거 */}
                <div data-pdf-group={`comp-${idx}`} className={`pdf-unit print:break-after-page print-section print:break-inside-avoid fm-card fm-report-flush transition-colors duration-300 overflow-hidden ${isOpen ? '' : 'hover:border-fm-gray-300'}`}>

                  {/* 헤더 - 샘플 .dhead(번호 + 제목·요약 + 점수 + 펼침 화살표) */}
                  <button type="button" onClick={() => setOpenDetail(isOpen && openDetail !== "ALL" ? null : key)}
                    className="fm-report-dhead">
                    <span className="fm-num">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="ttl">
                      <span className="h">
                        {label}
                        {measured && isReference && (
                          <span className="fm-chip tint ml-2 align-middle">참고치</span>
                        )}
                      </span>
                      {/* 역량 요약 설명 */}
                      <span className={`sum break-keep ${measured ? '' : 'off'}`}>
                        {/* F: 측정 0 역량엔 평가 문장을 쓰지 않는다(과거 리포트 포함). */}
                        {measured ? (strengthPoint || <span className="fm-click-hint">역량 상세 분석 클릭</span>) : "이번 세션에서 확인되지 않았습니다."}
                      </span>
                    </span>
                    <span className="score">
                      {measured
                        ? <><span className="fm-report-fig">{Number(score).toFixed(1)}</span><span className="fm-caption">/{maxScore.toFixed(1)}</span></>
                        : <span className="fm-chip mute">미측정</span>}
                    </span>
                    <ChevronIcon className={`chev transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* C-2: measured 0 대역량은 상세 분석을 렌더링하지 않고
                      '이번 세션 미확인'으로만 표기 (근거 없는 분석 오해 방지). */}
                  {isOpen && !measured && (
                    <div className="px-6 md:px-8 pb-8 border-t border-fm-gray-100 pt-6">
                      <p className="text-sm text-fm-gray-500">
                        이 역량은 이번 세션에서 확인되지 않았습니다. 다음 세션에서 이어서 살펴봅니다.
                      </p>
                    </div>
                  )}

                  {/* 펼침 Part 1: 2x2 그리드 (measured 대역량만) */}
                  {isOpen && measured && (
                    <div className="px-6 md:px-8 pb-8 border-t border-fm-gray-100 pt-6 bg-fm-paper-soft">
                      <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4">

                        {/* 좌상: 코치 피드백 */}
                        <div className="print:break-inside-avoid fm-card fm-report-inner">
                          <p className="fm-eyebrow">Coach Feedback</p>
                          <h4 className="mt-1 text-base font-bold text-fm-ink mb-3 pb-3 border-b border-fm-gray-100">코치 피드백</h4>
                          <p className="text-fm-ink text-[15px] font-light leading-[1.8] break-keep">{comment}</p>
                        </div>

                        {/* 우상: 강점 & 개선 필요점 - 좌측 '코치 피드백'과 시각적 무게감 균형 */}
                        <div className="print:break-inside-avoid fm-card fm-report-inner">
                          <p className="fm-eyebrow">Strength &amp; Growth</p>
                          <h4 className="mt-1 text-base font-bold text-fm-ink mb-3 pb-3 border-b border-fm-gray-100">강점 &amp; 개선 필요점</h4>
                          <div className="space-y-3">
                            {strengthPoint && (
                              <div className="flex gap-3 items-start p-4 bg-fm-paper-soft rounded-md border border-fm-gray-100 border-l-2 border-l-fm-accent">
                                <span className="text-fm-accent text-sm font-bold shrink-0 mt-0.5 w-8">강점</span>
                                <p className="text-[15px] text-fm-ink font-light leading-[1.8] break-keep">{strengthPoint}</p>
                              </div>
                            )}
                            {growthPoint && (
                              <div className="flex gap-3 items-start p-4 bg-fm-paper-soft rounded-md border border-fm-gray-100 border-l-2 border-l-fm-ink">
                                <span className="text-fm-ink text-sm font-bold shrink-0 mt-0.5 w-8">개선</span>
                                <p className="text-[15px] text-fm-ink font-light leading-[1.8] break-keep">{growthPoint}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 하단(전폭): 세부 역량 분석 - 좌: 방사형 차트 / 우: 가로 막대
                            2단 그리드로 시각적 균형, 그 아래 '점수 산출 근거' 통합 */}
                        <div className="print:break-inside-avoid fm-card fm-report-inner md:col-span-2 print:col-span-full print:w-full">
                          <div className="mb-3 pb-3 border-b border-fm-gray-100">
                            <p className="fm-eyebrow">Sub-competencies</p>
                            <h4 className="mt-1 text-base font-bold text-fm-ink">세부 역량 분석</h4>
                          </div>
                          {/* 좌: 방사형(Radar) / 우: 가로 막대 - order 로 배치 확정 */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-6 items-center">
                            <div className="w-full flex justify-center lg:order-1">
                              <SubRadarChart subScores={subScores} fallbackScore={Number(score)} maxScore={maxScore} />
                            </div>
                            <div className="w-full lg:order-2">
                              <SubScoresTable subScores={subScores} subLedger={aiSubLedger} totalScore={Number(score)} maxScore={maxScore} />
                            </div>
                          </div>

                          {/* 점수 산출 근거 - 세부 역량 분석 영역 바로 아래 */}
                          <div className="mt-6 pt-5 border-t border-fm-gray-100">
                            <p className="fm-eyebrow">Score Breakdown</p>
                            <h4 className="mt-1 text-base font-bold text-fm-ink">점수 산출 근거</h4>
                            <ScoreBreakdown breakdown={scoreBreakdown} maxScore={maxScore} />
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>

                {/* ② [역량 블록 2: 심층 평가 근거] - measured 대역량만(C-2) */}
                {isOpen && measured && (
                  <div data-pdf-group={`comp-${idx}`} className="pdf-unit print:break-after-page print-section print:break-inside-avoid fm-card fm-report-flush overflow-hidden mt-3">
                    <div className="px-6 md:px-8 py-7">
                      <ReasoningProcess reasoning={reasoning} gapAnalysis={gapAnalysis} evidenceList={evidenceList} />
                    </div>
                  </div>
                )}

              </React.Fragment>
            );
          })}
        </div>

        {/* ── [섹션 6] 리더십 향상을 위한 추천 교육 - 리포트 최하단 ── */}
        {courseRec && (
          <div className="pdf-unit print:break-after-page print-section mt-14 fm-report-courses">
            {/* 04 RECOMMENDED COURSES */}
            <SectionHead no="04" en="Recommended Courses" ko="추천 교육" className="fm-report-sec" />
            <div className="fm-card print:break-inside-avoid">
              <h2 className="text-xl font-bold text-fm-ink">
                리더십 향상을 위한 추천 교육
                {courseIsDemo && <span className="fm-chip tint ml-3 align-middle">예시 데이터</span>}
              </h2>
              <p className="mt-3 mb-8 text-[15px] font-light leading-[1.8] text-fm-gray-500 max-w-3xl break-keep">
                {courseRec.intro}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6">
                {[
                  ...(courseRec.growth || []),
                  courseRec.strength,
                ]
                  .filter(Boolean)
                  .map((c: any, i: number) => {
                    const strength = c.is_strength || c.type === "강점 활용";
                    return (
                      <div
                        key={i}
                        className={`print:break-inside-avoid rounded-lg border p-6 md:p-7 ${
                          strength
                            ? "border-fm-gray-100 bg-fm-accent-tint/50"
                            : "border-fm-gray-100 bg-fm-paper-soft"
                        }`}
                      >
                        {/* [구분] + [트랙/학습형식] - 배지 아닌 소제목 라벨 */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={`fm-eyebrow text-[11px] ${
                              strength ? "text-fm-blue-mid" : "text-fm-accent"
                            }`}
                          >
                            {c.type}
                          </span>
                          <span className="text-[11px] text-fm-gray-300">
                            {c.track}트랙 · {c.track_format}
                          </span>
                        </div>

                        {/* [과정명] [대역량명] 과정명 - 클릭 시 VOD 이동 */}
                        <a
                          href={c.vod_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-lg font-bold leading-snug text-fm-ink underline-offset-4 hover:text-fm-accent hover:underline transition-colors break-keep"
                        >
                          <span className="text-fm-gray-500 font-semibold">[{c.category}]</span>{" "}
                          {c.course}
                        </a>
                        {/* 수료 시 도달 행동 (Next Level Behavior) */}
                        {c.subtitle && (
                          <div className="mt-1 text-sm font-light text-fm-gray-500 break-keep">
                            → {c.subtitle}
                          </div>
                        )}

                        {/* [하위역량] - 진단 레벨 표기 */}
                        <div className="mt-2 text-xs text-fm-gray-500 tabular-nums">
                          진단 결과: {c.sub_competency} · Lv.{c.level} ({Number(c.score).toFixed(1)}점)
                        </div>

                        {/* [추천 이유] - 도약 총평 + 개조식 */}
                        <div className="mt-5 border-t border-fm-gray-100 pt-4">
                          <div className="fm-eyebrow text-fm-gray-500 mb-2">
                            {strength ? "제안 이유" : "추천 이유"}
                          </div>
                          {c.reason_overview && (
                            <p className="text-sm font-semibold leading-relaxed text-fm-ink break-keep">
                              {c.reason_overview}
                            </p>
                          )}
                          {Array.isArray(c.reason_bullets) && c.reason_bullets.length > 0 && (
                            <ul className="mt-2.5 list-disc pl-5 space-y-1.5 text-sm font-light leading-relaxed text-fm-gray-500 marker:text-fm-accent break-keep">
                              {c.reason_bullets.map((b: string, j: number) => (
                                <li key={j}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* BEI 분석 인용 - 리더의 딜레마/발화 한 줄 */}
                        {c.bei_citation && (
                          <div className="mt-4 rounded-md bg-fm-paper border border-fm-gray-100 px-3.5 py-2.5">
                            <div className="fm-eyebrow text-fm-gray-500 mb-1">
                              진단 대화 근거
                            </div>
                            <p className="text-xs italic leading-relaxed text-fm-gray-500 border-l-2 border-fm-gray-100 pl-2.5 break-keep">
                              &ldquo;{c.bei_citation}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 홈으로 돌아가기 버튼 - 인쇄물·PDF 캡처에서 완전 제외 */}
      <div data-html2canvas-ignore="true" className="print:hidden flex justify-center mt-16 relative z-20 pb-16">
        <button type="button" onClick={() => router.push('/')}
          className="fm-btn">
          홈으로 돌아가기
        </button>
      </div>
    </main>
  );
}

export default function ReportPage() {
  return <Suspense fallback={<div className="fm-app fm-report" />}><ReportContent /></Suspense>;
}
