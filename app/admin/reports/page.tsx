"use client";

import React, { useState, Fragment } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { FileText, Download, Share2, TrendingUp, Users } from 'lucide-react';

// ----------------------------------------------------------------------
// [COMPONENTS] 개별 리포트의 디자인 자산 (Admin용으로 데이터만 매핑)
// ----------------------------------------------------------------------

// 1. Radar Chart (SVG 방식 - 개별 리포트와 동일 디자인)
const RadarChart = ({ data }: { data: any }) => {
  const stats = [
    { label: "조직관리", value: data["조직관리"] || 0 },
    { label: "성과관리", value: data["성과관리"] || 0 },
    { label: "사람관리", value: data["사람관리"] || 0 },
    { label: "일관리", value: data["일관리"] || 0 },
    { label: "자기관리", value: data["자기관리"] || 0 },
  ];
  const size = 300; const center = size / 2; const radius = 90; const angleStep = (Math.PI * 2) / 5;
  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 5) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };
  const points = stats.map((stat, i) => getPoint(stat.value, i)).map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="relative flex justify-center items-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        {/* 배경 그리드 */}
        {[1, 2, 3, 4, 5].map((level) => (
          <polygon key={level} points={stats.map((_, i) => { const p = getPoint(level, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
        ))}
        {stats.map((_, i) => { const p = getPoint(5, i); return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#ffffff" strokeOpacity="0.1" />; })}
        {/* 데이터 영역 */}
        <polygon points={points} fill="rgba(59, 130, 246, 0.4)" stroke="#60a5fa" strokeWidth="2" filter="url(#glow)" />
        {stats.map((stat, i) => { const p = getPoint(stat.value, i); return <circle key={i} cx={p.x} cy={p.y} r="3" fill="#93c5fd" /> })}
        {/* 라벨 */}
        {stats.map((stat, i) => {
          const p = getPoint(6, i);
          return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="#9ca3af" fontSize="12" fontWeight="bold">{stat.label}</text>;
        })}
        <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      </svg>
    </div>
  );
};

// 2. Keyword Network Chart (크기 확대 버전)
const KeywordNetworkChart = () => {
  const nodes = [
    { text: "실행력", weight: 5, angle: 0 },
    { text: "공정성", weight: 3, angle: 72 },
    { text: "피드백", weight: 2, angle: 144 },
    { text: "협업", weight: 4, angle: 216 },
    { text: "성장", weight: 3, angle: 288 },
  ];

  // ✅ [수정] 전체적인 크기 및 비율 조정
  const size = 320;          // SVG 캔버스 크기 (200 -> 320)
  const center = size / 2;   // 중심점 (100 -> 160)
  const radius = 110;        // 노드 확산 반지름 (60 -> 110) - 훨씬 넓게 퍼짐

  return (
    // ✅ [수정] 컨테이너 높이 증가 (h-[200px] -> h-[350px])
    <div className="flex justify-center items-center h-[350px]">
      <svg width={size} height={size} className="overflow-visible">
        {/* 중앙 원 (Organizational DNA) */}
        {/* ✅ [수정] 반지름(r)과 폰트 크기 증가 */}
        <circle cx={center} cy={center} r="40" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="3" />
        <text x={center} y={center} dy="5" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">Organizational{"\n"}DNA</text>
        
        {/* 연결선 (Lines) */}
        {nodes.map((node, i) => {
          const rad = (node.angle * Math.PI) / 180;
          const x = center + radius * Math.cos(rad);
          const y = center + radius * Math.sin(rad);
          // ✅ [수정] 선 두께(strokeWidth) 약간 증가
          return <line key={`line-${i}`} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth={node.weight * 1.2} />;
        })}
        
        {/* 주변 노드 (Nodes) */}
        {nodes.map((node, i) => {
          const rad = (node.angle * Math.PI) / 180;
          const x = center + radius * Math.cos(rad);
          const y = center + radius * Math.sin(rad);
          return (
            <g key={`node-${i}`}>
              {/* ✅ [수정] 노드 원 크기(r)와 폰트 크기 증가 */}
              <circle cx={x} cy={y} r={14 + node.weight * 3} fill="#0f172a" stroke="#a78bfa" strokeWidth="2.5" className="drop-shadow-lg" />
              <text x={x} y={y} dy="4" textAnchor="middle" fill="white" fontSize="12" fontWeight="medium">{node.text}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// 3. Correlation Heatmap (역량 간 상관관계)
const CorrelationHeatmap = () => {
  const matrix = [
    [1.0, 0.7, 0.3, 0.5, 0.2],
    [0.7, 1.0, 0.4, 0.6, 0.3],
    [0.3, 0.4, 1.0, 0.2, 0.8],
    [0.5, 0.6, 0.2, 1.0, 0.4],
    [0.2, 0.3, 0.8, 0.4, 1.0],
  ];
  const labels = ["조직", "성과", "사람", "일", "자기"];
  const getColor = (value: number) => `rgba(59, 130, 246, ${value * 0.8 + 0.1})`;

  return (
    <div className="flex flex-col items-center">
      <div className="grid grid-cols-6 gap-1">
        <div className="w-10 h-10"></div>
        {labels.map((l, i) => <div key={i} className="w-10 h-10 flex items-center justify-center text-xs text-gray-400 font-bold">{l}</div>)}
        {matrix.map((row, i) => (
          <Fragment key={i}>
            <div className="w-10 h-10 flex items-center justify-center text-xs text-gray-400 font-bold">{labels[i]}</div>
            {row.map((val, j) => (
              <div key={`${i}-${j}`} className="w-10 h-10 rounded-md flex items-center justify-center text-[10px] text-white transition-all hover:scale-110 cursor-pointer" style={{ backgroundColor: getColor(val) }}>
                {val === 1 ? '-' : val}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

// 4. Gap Analysis (조직의 인식 vs 실제 AI 진단)
const GapComparisonChart = ({ explicit, implicit }: { explicit: number, implicit: number }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[200px] w-full px-4">
      <div className="relative w-[140px] h-[140px] mb-4 group">
        <div className="absolute inset-0 rounded-full border border-dashed border-gray-700 animate-spin-slow"></div>
        {/* Implicit (AI 진단) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500/30 border border-blue-500 rounded-full flex items-center justify-center transition-all duration-1000 group-hover:bg-blue-500/40" style={{ width: `${(implicit/5)*100}%`, height: `${(implicit/5)*100}%` }}></div>
        {/* Explicit (자가 진단) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-pink-500/30 border border-pink-500 rounded-full border-dashed flex items-center justify-center transition-all duration-1000 group-hover:bg-pink-500/40" style={{ width: `${(explicit/5)*100}%`, height: `${(explicit/5)*100}%` }}></div>
      </div>
      <div className="flex gap-6 text-xs w-full justify-center">
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-pink-500"></div><span className="text-gray-400">자가 진단 평균: <span className="text-white font-bold">{explicit}</span></span></div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-gray-400">AI 분석 평균: <span className="text-white font-bold">{implicit}</span></span></div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// [MAIN PAGE] 종합 리포트 페이지
// ----------------------------------------------------------------------

const ReportsPage = () => {
  // ✅ Mock Data: 전사 평균 데이터 (5점 만점 기준)
  const reportData = {
    total_score: 3.88,
    scores: { "조직관리": 4.1, "성과관리": 3.2, "사람관리": 3.9, "일관리": 4.6, "자기관리": 3.6 },
    participants_count: 133,
    period: "2024.01.01 ~ 2024.01.14"
  };

  return (
    <AdminLayout>
      {/* AdminLayout 내부는 기본적으로 padding이 적용되어 있으므로 
         개별 리포트의 스타일(검정 배경, glassmorphism)을 유지하기 위해 
         별도의 컨테이너로 감쌉니다.
      */}
      <div className="max-w-6xl mx-auto text-gray-100 font-sans">
        
        {/* [섹션 1] 헤더 */}
        <div className="flex justify-between items-end mb-10 pb-6 border-b border-white/10">
          <div>
            <div className="inline-block px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-bold tracking-widest uppercase mb-3 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
              Comprehensive Analysis
            </div>
            <h1 className="text-4xl font-extrabold text-white mb-2">리더십 역량 종합 리포트</h1>
            <p className="text-gray-400 flex items-center gap-2">
              <Users size={16} /> 대상: 전사 리더 {reportData.participants_count}명 | 기간: {reportData.period}
            </p>
          </div>
          <div className="flex gap-3">
             <button className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-lg border border-white/10 flex items-center text-sm transition-all">
                <Share2 size={16} className="mr-2"/> 공유하기
             </button>
             <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center text-sm font-bold transition-all">
                <Download size={16} className="mr-2"/> PDF 다운로드
             </button>
          </div>
        </div>

        {/* [섹션 2] 핵심 지표 (Radar & Total Score) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Radar Chart Card */}
          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
            <h3 className="text-xl font-bold text-white mb-2 self-start flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>전사 역량 밸런스
            </h3>
            <RadarChart data={reportData.scores} />
            <div className="mt-2 text-center">
              <p className="text-sm text-gray-400 mb-1">Total Average Score</p>
              <span className="text-4xl font-black text-white tracking-tight">{reportData.total_score} <span className="text-lg text-gray-500 font-normal">/ 5.0</span></span>
            </div>
          </div>

          {/* Insight Text Card */}
          <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-white/10 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-2xl backdrop-blur-sm">
            <div>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <TrendingUp className="text-blue-400" /> AI 종합 진단 총평
                </h3>
                <p className="text-gray-300 leading-relaxed text-lg mb-6">
                    이번 차수 조직 전체의 리더십 지수는 <span className="text-blue-400 font-bold">{reportData.total_score}점</span>으로, 
                    안정적인 리더십 파이프라인을 보유하고 있습니다.
                    <br/><br/>
                    데이터 분석 결과, <strong className="text-white">"실행력 중심의 성과 창출"</strong> 문화가 정착되어 있으나,
                    구성원 개개인의 성장을 돕는 <strong className="text-red-300">"피드백 및 코칭"</strong> 역량은 상대적으로 부족합니다.
                </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-xs text-blue-300 font-bold block mb-1">BEST Strength</span>
                    <span className="text-xl font-bold text-white">일관리 (4.6)</span>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-xs text-red-300 font-bold block mb-1">NEED Improvement</span>
                    <span className="text-xl font-bold text-white">성과관리 (3.2)</span>
                </div>
            </div>
          </div>
        </div>

        {/* [섹션 3] 심층 분석 (Network & Gap) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 flex flex-col backdrop-blur-sm">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-xl">🧬</span> 조직 DNA 키워드
                </h3>
                <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30">Keyword Net</span>
             </div>
             <KeywordNetworkChart />
             <p className="mt-4 text-sm text-gray-400 text-center">
               조직 내 커뮤니케이션에서 가장 빈번하게 등장하고 연결된 키워드입니다.
             </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 flex flex-col backdrop-blur-sm">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-xl">⚖️</span> 인식의 차이 (Gap Analysis)
                </h3>
                <span className="text-[10px] bg-pink-900/50 text-pink-300 px-2 py-1 rounded border border-pink-500/30">Explicit vs Implicit</span>
             </div>
             <GapComparisonChart explicit={4.2} implicit={3.8} />
             <p className="mt-4 text-sm text-gray-400 text-center">
               리더들은 스스로를 <span className="text-pink-400 font-bold">4.2점</span>으로 평가했으나, 
               AI 진단 결과 실제 역량은 <span className="text-blue-400 font-bold">3.8점</span>으로 분석되었습니다.
             </p>
          </div>
        </div>

        {/* [섹션 4] 역량 상관관계 히트맵 */}
        <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 mb-12 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-xl">🔗</span> 역량 간 상관관계 분석
                </h3>
                <p className="text-sm text-gray-500">어떤 역량이 서로 영향을 주고받는지 분석합니다.</p>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-12">
                <CorrelationHeatmap />
                <div className="max-w-xs text-sm text-gray-400">
                    <p className="mb-2">💡 <strong>인사이트:</strong></p>
                    <p>
                        <strong>'사람관리'</strong>와 <strong>'자기관리'</strong>의 상관계수가 <span className="text-blue-400 font-bold">0.8</span>로 매우 높게 나타났습니다. 
                        이는 자기 성찰 능력이 뛰어난 리더가 팀원 관리도 잘한다는 것을 의미합니다.
                    </p>
                </div>
            </div>
        </div>

        {/* [섹션 5] 역량별 세부 통계 (Aggregation List) */}
        <div className="space-y-4 pb-20">
          <h3 className="text-2xl font-bold text-white mb-6 px-2 border-l-4 border-blue-500 pl-4">역량별 상세 통계</h3>
          {Object.entries(reportData.scores).map(([key, value]: any, idx) => (
            <div key={idx} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-5 w-full md:w-auto mb-4 md:mb-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center font-bold text-lg shadow-lg group-hover:from-blue-600 group-hover:to-blue-700 group-hover:text-white transition-all">
                  {value}
                </div>
                <div>
                    <span className="block text-lg font-bold text-gray-200 group-hover:text-white">{key}</span>
                    <span className="text-xs text-gray-500">전사 평균 점수</span>
                </div>
              </div>
              
              {/* Progress Bar Visual */}
              <div className="w-full md:w-1/2 flex items-center gap-4">
                 <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(value/5)*100}%` }}></div>
                 </div>
                 <span className="text-sm font-bold text-blue-400 w-12 text-right">{value}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </AdminLayout>
  );
};

export default ReportsPage;