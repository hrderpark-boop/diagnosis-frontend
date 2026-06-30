"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Download, Search, Calendar } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';

// Mock Data (기존 7일 통계 그래프 데이터 유지)
const CHART_DATA = [
  { name: '1/07', 방문자: 4, 진단참여: 2 },
  { name: '1/08', 방문자: 7, 진단참여: 5 },
  { name: '1/09', 방문자: 5, 진단참여: 8 },
  { name: '1/10', 방문자: 2, 진단참여: 1 },
  { name: '1/11', 방문자: 1, 진단참여: 0 },
  { name: '1/12', 방문자: 6, 진단참여: 4 },
  { name: '1/13', 방문자: 9, 진단참여: 7 },
];

export default function AdminDashboard() {
  // 🚨 상태 관리: 기존 participants 대신 reports(분석 완료된 리포트)를 저장합니다.
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 🚨 백엔드에서 생성한 새로운 전체 리포트 조회 API 호출
      const res = await axios.get('http://127.0.0.1:8000/api/v1/reports/');
      setReports(res.data);
    } catch (err) {
      console.error(err);
      alert("데이터를 불러오지 못했습니다. 서버 연결을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 🚨 프론트엔드 자체 CSV 다운로드 기능 (리포트 데이터 기준)
  const handleDownloadExcel = () => {
    if (reports.length === 0) return alert("다운로드할 데이터가 없습니다.");

    const headers = ["이름", "총점", "핵심 요약", "진단 일시"];
    const csvRows = [headers.join(",")];

    reports.forEach(r => {
      // 요약 텍스트 내부의 줄바꿈과 쉼표를 안전하게 처리
      const safeSummary = `"${r.summary.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      csvRows.push([r.user_name, r.total_score, safeSummary, r.created_at].join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leadership_Reports_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <AdminLayout>
      {/* 1. 상단 통계 카드 섹션 (디자인 유지, 리포트 데이터로 수치 연동) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: '전체 완료 리포트', value: reports.length, unit: '건', change: '+2', color: 'text-white' },
          { label: '오늘 생성된 리포트', value: reports.filter(r => r.created_at.includes(new Date().toISOString().split('T')[0])).length, unit: '건', change: '+1', color: 'text-blue-400' },
          { label: '전체 평균 점수', value: reports.length > 0 ? (reports.reduce((acc, r) => acc + r.total_score, 0) / reports.length).toFixed(1) : 0, unit: '점', change: '-', color: 'text-green-400' },
          { label: '평균 진행률', value: '42', unit: '%', change: '-', color: 'text-purple-400' }
        ].map((stat, idx) => (
          <div key={idx} className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col justify-between shadow-lg">
            <div className="flex justify-between items-start">
              <span className="text-gray-400 text-sm font-medium">{stat.label}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full border border-gray-600">TODAY</span>
            </div>
            <div className="flex items-baseline space-x-2 mt-4">
               <h3 className={`text-4xl font-bold ${stat.color}`}>{stat.value}</h3>
               <span className="text-sm text-gray-500">{stat.unit}</span>
            </div>
            <div className="mt-2 text-xs text-gray-500 flex items-center">
               <span className={stat.change.includes('+') ? 'text-green-500 mr-1' : 'text-gray-500 mr-1'}>{stat.change}</span> 전일 대비
            </div>
          </div>
        ))}
      </div>

      {/* 2. 중간 차트 영역 (기존 디자인 완벽 유지) */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg mb-8">
        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center">
          <span className="w-1 h-6 bg-blue-500 rounded mr-3"></span>
          최근 7일 통계 추이
        </h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
              <RechartsTooltip contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: '1px solid #374151', color: '#F3F4F6' }} itemStyle={{ color: '#E5E7EB' }}/>
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
              <Line type="monotone" dataKey="방문자" stroke="#3B82F6" strokeWidth={3} dot={{r: 4, fill:'#1F2937', strokeWidth:2}} activeDot={{r: 6}} name="방문자 수" />
              <Line type="monotone" dataKey="진단참여" stroke="#10B981" strokeWidth={3} dot={{r: 4, fill:'#1F2937', strokeWidth:2}} activeDot={{r: 6}} name="진단 참여자" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. 필터 및 엑셀 다운로드 바 */}
      <div className="bg-gray-800 p-4 rounded-t-xl border border-gray-700 flex flex-wrap gap-3 items-center justify-between">
         <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
            <div className="relative group">
                <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-blue-500" size={16} />
                <input type="text" placeholder="이름 검색" className="bg-gray-900 border border-gray-600 text-white pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-48 transition-all"/>
            </div>
            <button onClick={fetchData} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors text-sm">🔄 새로고침</button>
         </div>
         <button onClick={handleDownloadExcel} className="flex items-center px-4 py-2 bg-gray-700 hover:bg-green-700 hover:text-white text-gray-200 border border-gray-600 hover:border-green-600 rounded-lg text-sm font-medium transition-all duration-300">
           <Download size={16} className="mr-2" /> Excel Export
         </button>
      </div>

      {/* 4. 하단 리포트 데이터 테이블 (컬럼을 리포트에 맞게 수정) */}
      <div className="bg-gray-800 border-x border-b border-gray-700 overflow-x-auto rounded-b-xl shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase font-bold tracking-wider">
              <th className="px-4 py-4 border-b border-gray-700 text-center w-16">No</th>
              <th className="px-4 py-4 border-b border-gray-700 w-32">참여자명</th>
              <th className="px-4 py-4 border-b border-gray-700 text-center w-24">총점</th>
              <th className="px-4 py-4 border-b border-gray-700">AI 종합 요약</th>
              <th className="px-4 py-4 border-b border-gray-700 w-32">진단 일시</th>
              <th className="px-4 py-4 border-b border-gray-700 text-center w-32">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-500">데이터를 불러오는 중입니다...</td></tr>
            ) : reports.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-500">아직 완료된 진단 데이터가 없습니다.</td></tr>
            ) : reports.map((r: any, idx) => (
              <tr key={r.id} className="hover:bg-gray-700/50 transition-colors text-sm text-gray-300 group">
                <td className="px-4 py-4 text-center text-gray-500">{idx + 1}</td>
                <td className="px-4 py-4 font-bold text-white">{r.user_name}</td>
                <td className="px-4 py-4 text-center">
                   {/* 점수에 따라 색상 변경 (4점이상 파란색, 3점이상 초록색, 그외 노란색) */}
                   <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${r.total_score >= 4.0 ? 'bg-blue-900/30 text-blue-400 border-blue-800' : r.total_score >= 3.0 ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-yellow-900/30 text-yellow-400 border-yellow-800'}`}>
                      {Number(r.total_score).toFixed(1)}점
                   </span>
                </td>
                <td className="px-4 py-4 text-gray-400 text-xs">
                  <div className="line-clamp-2 max-w-md">{r.summary}</div>
                </td>
                <td className="px-4 py-4 text-gray-500 text-xs font-mono">{r.created_at.split(' ')[0]}</td>
                <td className="px-4 py-4 text-center">
                  <button 
                    onClick={() => router.push(`/report?session_id=${r.session_id}`)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition shadow-md"
                  >
                    리포트 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}