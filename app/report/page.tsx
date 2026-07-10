"use client";

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api';
import { getKeyToNameMap, getSubCompetenciesMap, fetchFramework, FrameworkCompetency } from '@/lib/framework';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { NOTO_SANS_KR_BASE64, hasKoreanFont } from '@/lib/notoSansKR-base64';

// ----------------------------------------------------------------------
// [ICONS]
// ----------------------------------------------------------------------
const ChevronIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ----------------------------------------------------------------------
// [MAIN RADAR CHART - 메인 역량 밸런스]
// ----------------------------------------------------------------------
const RadarChart = ({
  data,
  competencies,
  maxScore,
}: {
  data: any;
  competencies: Array<{ key: string; name: string }>;
  maxScore: number;
}) => {
  const safeData = data || {};
  const safeMax = maxScore || 5;
  const stats = competencies.map((c) => ({
    label: c.name,
    value: safeData[c.name] || safeData[c.key] || 0,  // 과거 포맷 호환 유지
  }));

  const size = 300; const center = size / 2; const radius = 85;
  const angleStep = stats.length > 0 ? (Math.PI * 2) / stats.length : 0;

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / safeMax) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const levels = Array.from({ length: safeMax }, (_, i) => i + 1);
  const points = stats.map((stat, i) => getPoint(stat.value, i)).map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex justify-center items-center py-2 w-full h-full">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <filter id="glow-light">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {levels.map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {stats.map((_, i) => {
          const p = getPoint(safeMax, i);
          return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />;
        })}
        <polygon points={points} fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2" filter="url(#glow-light)" />
        {stats.map((stat, i) => {
          const p = getPoint(stat.value, i);
          return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />;
        })}
        {stats.map((stat, i) => {
          const pLabel = getPoint(6.8, i);
          return (
            <g key={i}>
              <text x={pLabel.x} y={pLabel.y - 8} textAnchor="middle" dominantBaseline="middle" fill="#475569" fontSize="12" fontWeight="700">{stat.label}</text>
              <text x={pLabel.x} y={pLabel.y + 8} textAnchor="middle" dominantBaseline="middle" fill="#2563eb" fontSize="13" fontWeight="800">{Number(stat.value).toFixed(1)}</text>
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
  const stats = Object.entries(subScores || {}).map(([label, score]) => ({
    label,
    value: typeof score === 'number' ? score : fallbackScore
  }));

  if (stats.length === 0) return <div className="text-xs text-slate-400">데이터가 없습니다.</div>;

  const size = 160; const center = size / 2; const radius = 40;
  const angleStep = (Math.PI * 2) / stats.length;

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / safeMax) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const levels = Array.from({ length: safeMax }, (_, i) => i + 1).filter((_, i) => i === 0 || i === 2 || i === safeMax - 1);
  const points = stats.map((stat, i) => getPoint(stat.value, i)).map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex justify-center items-center w-full h-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {levels.map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {stats.map((_, i) => {
          const p = getPoint(safeMax, i);
          return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#f1f5f9" strokeWidth="1" />;
        })}
        <polygon points={points} fill="rgba(16, 185, 129, 0.1)" stroke="#10b981" strokeWidth="1.5" />
        {stats.map((stat, i) => {
          const p = getPoint(stat.value, i);
          return <circle key={i} cx={p.x} cy={p.y} r="3" fill="#10b981" />;
        })}
        {stats.map((stat, i) => {
          const pLabel = getPoint(7.5, i); 
          return (
            <g key={i}>
              <text x={pLabel.x} y={pLabel.y - 6} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="9" fontWeight="700">{stat.label}</text>
              <text x={pLabel.x} y={pLabel.y + 6} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize="9" fontWeight="800">{Number(stat.value).toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};


// ----------------------------------------------------------------------
// [COMPARISON CHART - 상대적 비교 분석]
// ----------------------------------------------------------------------
const ComparisonChart = ({ myScore, maxScore }: { myScore: number, maxScore: number }) => {
  const safeMax = maxScore || 5;
  // 시인성 높은 짙은 단색(Solid) — 흐릿한 파스텔 톤 배제
  const data = [
    { label: "나의 점수", value: myScore, color: "bg-blue-700" },
    { label: "팀 평균",   value: 3.8, color: "bg-slate-800" },
    { label: "부문 평균", value: 3.6, color: "bg-slate-600" },
    { label: "전사 평균", value: 3.5, color: "bg-slate-400" },
  ];
  return (
    <div className="w-full space-y-4 flex flex-col justify-center h-full">
      {data.map((item, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-700 font-semibold">{item.label}</span>
            <span className="text-slate-900 font-bold tabular-nums">{Number(item.value).toFixed(1)}점</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${item.color} transition-all duration-700`}
              style={{ width: `${(item.value / safeMax) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ----------------------------------------------------------------------
// [SCORE BREAKDOWN]
// ----------------------------------------------------------------------
const ScoreBreakdown = ({ breakdown, maxScore }: { breakdown: any, maxScore: number }) => {
  if (!breakdown) return null;
  const safeMax = maxScore || 5;
  const items = [
    { label: "행동 지표 평가", value: breakdown.rubric_base, max: 4.0, color: "bg-blue-400" },
    { label: "STAR 깊이",  value: breakdown.star_depth_bonus, max: 0.5, color: "bg-emerald-400", prefix: "+" },
    { label: "확신도",     value: breakdown.confidence_adj, max: 0.5, color: breakdown.confidence_adj >= 0 ? "bg-violet-400" : "bg-rose-400", prefix: breakdown.confidence_adj >= 0 ? "+" : "" },
  ];
  return (
    <div className="mt-3 p-5 bg-slate-50 rounded-2xl border border-slate-100">
      <h5 className="text-sm text-slate-900 font-bold mb-4">점수 산출 근거</h5>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 w-20 shrink-0">{item.label}</span>
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.abs(item.value / item.max) * 100}%` }} />
            </div>
            <span className="text-xs font-black text-slate-700 w-10 text-right">
              {item.prefix}{Number(item.value).toFixed(1)}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center pt-3 border-t border-slate-200 mt-2">
          <span className="text-xs font-bold text-slate-500">최종 점수</span>
          <span className="text-base font-black text-blue-600">{Number(breakdown.final).toFixed(1)} / {safeMax.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [REASONING PROCESS] — SAR 심층 평가 + 실제 대화 발췌문 + Gap Analysis
//  (기준 매핑(Rubric)·어조 분석(Tone)은 고객 혼란 방지를 위해 리포트에서 제거,
//   대신 SAR 분석 바로 아래에 평가 근거인 실제 대화 발췌문을 통합)
// ----------------------------------------------------------------------
const ReasoningProcess = ({ reasoning, gapAnalysis, evidenceList }: { reasoning: any, gapAnalysis?: string, evidenceList?: string[] }) => {
  if (!reasoning) return null;

  // 미니멀리즘: 다색 파스텔 배경 대신 선(좌측 굵은 보더)과 타이포그래피로 위계 구분
  const steps = [
    { key: "1_situation", label: "상황 (Situation)" },
    { key: "2_action",    label: "행동 (Action)" },
    { key: "3_result",    label: "결과 (Result)" },
  ];

  return (
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
      <h4 className="text-base font-black text-slate-900 mb-4 pb-3 border-b border-slate-200">심층 평가 근거</h4>

      {/* SAR 세로 1열 */}
      <div className="space-y-3 mb-4">
        {steps.map((item) =>
          reasoning[item.key] ? (
            <div key={item.key} className="p-4 rounded-lg border-l-4 border-slate-800 bg-slate-50">
              <span className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                {item.label}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{reasoning[item.key]}</p>
            </div>
          ) : null
        )}
      </div>

      {/* 실제 대화 발췌문 — SAR 분석 바로 아래, 평가의 절대적 근거 */}
      {evidenceList && evidenceList.length > 0 && (
        <div className="pt-4 border-t border-slate-200 mb-4">
          <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">실제 대화 발췌문</h5>
          <div className="space-y-3">
            {evidenceList.map((ev: string, i: number) => (
              <p key={i} className="text-slate-600 text-sm font-medium italic border-l-4 border-slate-300 pl-4 py-1">"{ev}"</p>
            ))}
          </div>
        </div>
      )}

      {/* Gap Analysis — 구분선 + 제목 + 텍스트 */}
      {gapAnalysis && (
        <div className="pt-4 border-t border-slate-200">
          <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-2">Gap Analysis</h5>
          <p className="text-sm text-slate-700 leading-relaxed">{gapAnalysis}</p>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// [SUB SCORES TABLE] — 하위 지표 점수 테이블
// ----------------------------------------------------------------------
const SubScoresTable = ({ subScores, totalScore, maxScore }: { subScores: any, totalScore: number, maxScore: number }) => {
  if (!subScores || Object.keys(subScores).length === 0) return null;

  const safeMax = maxScore || 5;
  const entries = Object.entries(subScores) as [string, number][];
  const max = Math.max(...entries.map(([, v]) => v));
  const min = Math.min(...entries.map(([, v]) => v));

  return (
    <div className="mt-4 space-y-2">
      {entries.map(([label, score]) => {
        const isHigh = score === max;
        const isLow  = score === min;
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 font-medium min-w-[120px] flex-shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-emerald-400' : isLow ? 'bg-rose-300' : 'bg-blue-300'}`}
                style={{ width: `${(score / safeMax) * 100}%` }}
              />
            </div>
            <span className={`text-xs font-black w-8 text-right ${isHigh ? 'text-emerald-600' : isLow ? 'text-rose-500' : 'text-slate-600'}`}>
              {Number(score).toFixed(1)}
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
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const [competencyLabels, setCompetencyLabels] = useState<Record<string, string>>({});
  const [subCompetencies, setSubCompetencies] = useState<Record<string, string[]>>({});
  const [maxScore, setMaxScore] = useState<number>(5.0);
  const [frameworkCompetencies, setFrameworkCompetencies] = useState<FrameworkCompetency[]>([]);

  const reportRef = useRef<HTMLDivElement>(null);

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

  const loadReport = async () => {
    try {
      const res = await apiClient.get(`/reports/${sessionId}`);
      setReport(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setStatusMsg("AI가 정밀 분석 중입니다...");
        setTimeout(loadReport, 2000);
      } else {
        setStatusMsg("오류가 발생했습니다. 다시 시도해주세요.");
      }
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    const originalOpenState = openDetail;
    setOpenDetail("ALL");
    document.body.classList.add('pdf-mode');
    // React 렌더 2사이클 대기 + pdf-mode 트랜지션 안정화
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210; const pageHeight = 297; const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      // 한글 폰트 등록 (base64 데이터가 채워진 경우에만)
      if (hasKoreanFont()) {
        pdf.addFileToVFS('NotoSansKR.ttf', NOTO_SANS_KR_BASE64);
        pdf.addFont('NotoSansKR.ttf', 'NotoSansKR', 'normal');
        pdf.setFont('NotoSansKR');
      } else {
        console.warn('한글 폰트 미등록 — PDF 한글이 □□□ 으로 표시될 수 있음');
      }

      const usableHeight = pageHeight - margin * 2;

      // 캔버스를 세로 픽셀 범위로 잘라 새 캔버스 반환
      const cropCanvas = (
        src: HTMLCanvasElement, yPx: number, hPx: number
      ): HTMLCanvasElement => {
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = hPx;
        (out.getContext('2d') as CanvasRenderingContext2D).drawImage(
          src, 0, yPx, src.width, hPx, 0, 0, src.width, hPx
        );
        return out;
      };

      const sections = reportRef.current.querySelectorAll('.print-section');
      console.log(`[PDF] 총 ${sections.length}개 섹션 발견`);
      let currentY = margin;
      let isFirstSection = true;

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        console.log(`[PDF] 섹션 ${i + 1}/${sections.length} — offsetSize: ${section.offsetWidth}×${section.offsetHeight}`);

        const canvas = await html2canvas(section, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        } as any);

        const imgData = canvas.toDataURL('image/png');
        console.log(`[PDF] 섹션 ${i + 1} canvas: ${canvas.width}×${canvas.height}, len: ${imgData.length}`);

        // 안전장치
        if (canvas.width === 0 || canvas.height === 0) {
          console.warn(`섹션 ${i + 1} 빈 canvas — 건너뜀`);
          continue;
        }
        if (!imgData.startsWith('data:image/png;base64,')) {
          console.error(`섹션 ${i + 1} 잘못된 PNG — 건너뜀`);
          continue;
        }
        if (imgData.length < 1000) {
          console.warn(`섹션 ${i + 1} imgData 짧음 — 건너뜀`);
          continue;
        }

        const imgFullHeightMM = (canvas.height * contentWidth) / canvas.width;

        if (imgFullHeightMM > usableHeight) {
          // 한 페이지보다 큰 섹션 → 새 페이지에서 슬라이스 분할
          if (!isFirstSection) {
            pdf.addPage(); currentY = margin;
          }

          const pxPerMM = canvas.height / imgFullHeightMM;
          const slicePx = Math.floor(usableHeight * pxPerMM);
          let yPx = 0;
          let firstSlice = true;

          while (yPx < canvas.height) {
            const thisPx = Math.min(slicePx, canvas.height - yPx);
            const sliceHeightMM = (thisPx * contentWidth) / canvas.width;
            const sliceData = cropCanvas(canvas, yPx, thisPx).toDataURL('image/png');

            if (!firstSlice) {
              pdf.addPage(); currentY = margin;
            }
            firstSlice = false;

            pdf.addImage(sliceData, 'PNG', margin, currentY, contentWidth, sliceHeightMM);
            currentY += sliceHeightMM + 4;
            yPx += thisPx;
          }

          // 큰 섹션 이후 다음 섹션은 새 페이지로 (어색한 잔여 공간 방지)
          currentY = pageHeight;

        } else {
          // 한 페이지 이하 섹션 → 남은 공간에 패킹, 없으면 새 페이지
          if (!isFirstSection && currentY + imgFullHeightMM > pageHeight - margin) {
            pdf.addPage(); currentY = margin;
          }
          pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgFullHeightMM);
          currentY += imgFullHeightMM + 8;
        }

        isFirstSection = false;
      }
      pdf.save('Leadership_Report.pdf');
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      alert("PDF 저장 중 오류가 발생했습니다.");
    } finally {
      setOpenDetail(originalOpenState);
      document.body.classList.remove('pdf-mode');
    }
  };

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 text-center">
        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
        <h2 className="text-lg font-bold mb-2 text-blue-600">{statusMsg}</h2>
      </div>
    );
  }

  const detailsData = report.details ?? {};

  const displayName = !report.user_name || report.user_name === "Leader" || report.user_name === "User"
                      ? "박기진"
                      : report.user_name;

  // TODO: 출시 전 백엔드 연결
  const respondentInfo = {
    company: "압닛컴퍼니",
    department: "R&D 본부",
    team: "AI 플랫폼팀",
    position: "팀장",
    diagnosisDate: report.created_at || new Date().toISOString().slice(0, 10),
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      {/* 상단 액션 바 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-700">Leadership Analytics</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all hidden md:block">인쇄</button>
          <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-md">PDF 저장</button>
        </div>
      </div>

      <div ref={reportRef} className="max-w-6xl mx-auto px-4 md:px-8 pt-28 pb-8 bg-slate-50">

        {/* ── [섹션 1] 타이틀 & 아키타입 & 응답자 정보 ── */}
        <div className="print-section mb-12">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-widest mb-4">
                Advanced Analytics Report
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 leading-tight">
                <span className="text-blue-600">{displayName} 님</span>의 리더십 역량 심층 분석 리포트
              </h1>
            </div>

            {report.archetype && (
              <div className="bg-slate-900 text-white p-6 rounded-3xl md:w-[400px] shadow-lg shrink-0 border border-slate-700">
                <p className="text-xs text-blue-400 font-black uppercase tracking-widest mb-1">Leadership Archetype</p>
                <h2 className="text-2xl font-black mb-2">{report.archetype.name}</h2>
                <p className="text-slate-300 text-sm leading-relaxed">{report.archetype.description}</p>
              </div>
            )}
          </div>

          {/* 응답자 정보 */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-500 font-semibold mb-1">소속</div>
                <div className="text-sm text-slate-800 font-bold">{respondentInfo.company}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-semibold mb-1">부서</div>
                <div className="text-sm text-slate-800 font-bold">{respondentInfo.department} / {respondentInfo.team}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-semibold mb-1">직급</div>
                <div className="text-sm text-slate-800 font-bold">{respondentInfo.position}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-semibold mb-1">진단일</div>
                <div className="text-sm text-slate-800 font-bold">{respondentInfo.diagnosisDate}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── [섹션 2] 3단 대시보드 ── */}
        <div className="print-section grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 flex flex-col justify-between">
            <h3 className="text-xl font-black text-slate-900 mb-6">종합 리더십 점수</h3>
            <div className="text-center my-auto">
              <span className="text-7xl font-black text-blue-600">{Number(report.total_score).toFixed(1)}</span>
              <span className="text-slate-400 text-2xl font-bold ml-1">/ {maxScore.toFixed(1)}</span>
            </div>
            <p className="text-center text-sm font-semibold text-slate-500 mt-6">{frameworkCompetencies.length || 5}개 역량 심층 평가 평균치</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 flex flex-col items-center">
            <h3 className="text-xl font-black text-slate-900 w-full mb-2">역량 밸런스</h3>
            <div className="w-full h-full flex-1 min-h-[220px]">
              <RadarChart data={report.radar_chart} competencies={frameworkCompetencies} maxScore={maxScore} />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 flex flex-col">
            <h3 className="text-xl font-black text-slate-900 mb-6">상대적 비교 분석</h3>
            <div className="flex-1">
              <ComparisonChart myScore={report.total_score} maxScore={maxScore} />
            </div>
          </div>
        </div>

        {/* ── [섹션 3] 종합 피드백 & 키워드 ── */}
        <div className="print-section mb-8">
          {/* 종합 피드백 — 전체 너비 */}
          <div className="bg-blue-50/50 rounded-3xl border border-blue-100 p-8 mb-4">
            <h3 className="text-xl font-black text-slate-900 mb-4 border-l-4 border-slate-900 pl-3">종합 피드백</h3>
            <p className="text-slate-700 text-base leading-relaxed">
              {report.summary || report.feedback_summary || "종합 피드백이 없습니다."}
            </p>
          </div>
          {/* 핵심 키워드 — {keyword, meaning} 구조 (구버전 문자열 배열도 호환) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3 border-l-4 border-slate-900 pl-3">핵심 키워드</h3>
            {/* 도형 UI 폐지 → '1. 키워드명: 의미' 형태의 정갈한 번호 리스트 */}
            <ol className="space-y-2.5">
              {(report.top_keywords || []).map((kw: any, i: number) => {
                const keyword = typeof kw === 'string' ? kw : kw?.keyword;
                const meaning = typeof kw === 'object' ? kw?.meaning : null;
                if (!keyword) return null;
                return (
                  <li key={i} className="text-base text-slate-700 leading-relaxed">
                    <span className="font-bold text-slate-500 tabular-nums mr-2">{i + 1}.</span>
                    <span className="font-black text-slate-900">{keyword}</span>
                    {meaning && <span className="text-slate-600">: {meaning}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* ── [섹션 4] 사각지대 & IDP ── */}
        <div className="print-section grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {report.blind_spot && report.blind_spot !== "-" && (
            <div className="bg-amber-50 rounded-3xl border border-amber-200 p-8">
              <h3 className="text-xl font-black text-slate-900 mb-4 border-l-4 border-amber-600 pl-3">사각지대 (Blind Spot)</h3>
              <p className="text-amber-900 text-base leading-relaxed">{report.blind_spot}</p>
            </div>
          )}
          
          {report.idp && report.idp.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              <h3 className="text-xl font-black text-slate-900 mb-5 border-l-4 border-slate-900 pl-3">개인 발전 계획 (IDP)</h3>
              <div className="space-y-4">
                {report.idp.map((item: string, idx: number) => (
                  <div key={idx} className="flex gap-4">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{idx + 1}</span>
                    <p className="text-slate-700 text-sm font-semibold leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── [섹션 5] 역량별 심층 진단 ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6 px-2">
            <h2 className="text-2xl font-black text-slate-900">역량별 심층 진단서</h2>
            <button onClick={() => setOpenDetail(openDetail === "ALL" ? null : "ALL")}
              className="text-sm text-slate-600 font-bold border border-slate-300 bg-white px-4 py-2 rounded-full hover:bg-slate-100 transition-colors shadow-sm">
              {openDetail === "ALL" ? "전체 닫기" : "전체 펼치기"}
            </button>
          </div>

          {Object.entries(detailsData).map(([key, value]: any, idx) => {
            const label          = competencyLabels[key] || key;
            const score          = typeof value === 'object' ? value.score : value;
            const comment        = typeof value === 'object' ? value.comment : "상세 분석 내용이 없습니다.";
            const evidenceList   = typeof value === 'object' && Array.isArray(value.evidence_list) ? value.evidence_list : [];
            const reasoning      = typeof value === 'object' ? value.reasoning_process : null;
            const scoreBreakdown = typeof value === 'object' ? value.score_breakdown : null;
            const strengthPoint  = typeof value === 'object' ? value.strength_point : null;
            const growthPoint    = typeof value === 'object' ? value.growth_point : null;
            const gapAnalysis    = typeof value === 'object' ? value.gap_analysis : null;
            const aiSubScores    = typeof value === 'object' ? value.sub_scores : null;

            const hasValidSubScores = aiSubScores && Object.keys(aiSubScores).length > 0;
            const defaultSubLabels  = subCompetencies[key] || [];
            const subScores = hasValidSubScores
              ? aiSubScores
              : defaultSubLabels.reduce((acc: any, curr: string) => ({ ...acc, [curr]: score }), {});

            const isOpen = openDetail === "ALL" || openDetail === key;

            return (
              <React.Fragment key={idx}>

                {/* ① 헤더 + 코치 피드백 + 세부 역량 */}
                <div className={`print-section bg-white rounded-3xl border transition-all duration-300 overflow-hidden ${isOpen ? 'border-blue-300 shadow-lg' : 'border-slate-200 shadow-sm hover:border-blue-100'}`}>

                  {/* 헤더 */}
                  <button onClick={() => setOpenDetail(isOpen && openDetail !== "ALL" ? null : key)}
                    className="w-full flex items-center justify-between px-8 py-6 text-left focus:outline-none">
                    <div className="flex items-center gap-6">
                      {/* 점수 도형: table-cell 수직 중앙 — flex 는 html2canvas(PDF)에서
                          텍스트가 하단으로 쏠리므로 인쇄 안전 방식 사용 */}
                      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-800 shrink-0 table table-fixed">
                        <div className="table-cell align-middle text-center text-2xl font-black text-slate-900 tabular-nums">
                          {Number(score).toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xl font-black text-slate-900 mb-1.5">{label}</span>
                        {/* 역량 요약 설명 — 시인성 극대화 (text-sm → text-lg, 톤 업) */}
                        <span className="block text-lg text-slate-700 font-semibold leading-snug">{strengthPoint || "역량 상세 분석 클릭"}</span>
                      </div>
                    </div>
                    <ChevronIcon className={`w-6 h-6 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* 펼침 Part 1: 2x2 그리드 */}
                  {isOpen && (
                    <div className="px-8 pb-8 border-t border-slate-100 pt-6 bg-slate-50/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* 좌상: 코치 피드백 */}
                        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-base font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">코치 피드백</h4>
                          <p className="text-slate-700 text-sm leading-relaxed">{comment}</p>
                        </div>

                        {/* 우상: 강점 & 개선 필요점 */}
                        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-base font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">강점 &amp; 개선 필요점</h4>
                          <div className="space-y-2">
                            {strengthPoint && (
                              <div className="flex gap-3 items-start p-3 bg-white rounded-lg border-l-4 border-emerald-700 border-y border-r border-y-slate-100 border-r-slate-100">
                                <span className="text-emerald-800 text-xs font-black shrink-0 mt-0.5 w-8">강점</span>
                                <p className="text-xs text-slate-700 leading-relaxed">{strengthPoint}</p>
                              </div>
                            )}
                            {growthPoint && (
                              <div className="flex gap-3 items-start p-3 bg-white rounded-lg border-l-4 border-orange-700 border-y border-r border-y-slate-100 border-r-slate-100">
                                <span className="text-orange-800 text-xs font-black shrink-0 mt-0.5 w-8">개선</span>
                                <p className="text-xs text-slate-700 leading-relaxed">{growthPoint}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 좌하: 점수 산출 근거 */}
                        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-base font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">점수 산출 근거</h4>
                          <ScoreBreakdown breakdown={scoreBreakdown} maxScore={maxScore} />
                        </div>

                        {/* 우하: 세부 역량 분석 */}
                        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-base font-black text-slate-900 mb-3 pb-2 border-b border-slate-200 text-center">세부 역량 분석</h4>
                          <div className="w-full flex justify-center mb-3">
                            <SubRadarChart subScores={subScores} fallbackScore={Number(score)} maxScore={maxScore} />
                          </div>
                          <SubScoresTable subScores={subScores} totalScore={Number(score)} maxScore={maxScore} />
                        </div>

                      </div>
                    </div>
                  )}
                </div>

                {/* ② 심층 평가 — SAR 분석 바로 아래에 실제 대화 발췌문 통합 */}
                {isOpen && (
                  <div className="print-section bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden mt-3">
                    <div className="px-8 py-6 bg-slate-50/30">
                      <ReasoningProcess reasoning={reasoning} gapAnalysis={gapAnalysis} evidenceList={evidenceList} />
                    </div>
                  </div>
                )}

              </React.Fragment>
            );
          })}
        </div>
      </div>
      
      {/* 홈으로 돌아가기 버튼 */}
      <div className="flex justify-center mt-16 relative z-20 pb-16">
        <button onClick={() => router.push('/')}
          className="px-8 py-4 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-700 transition-all shadow-lg text-sm flex items-center gap-2">
          홈으로 돌아가기
        </button>
      </div>
    </main>
  );
}

export default function ReportPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><ReportContent /></Suspense>;
}
