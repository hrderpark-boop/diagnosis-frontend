"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Download, Search, RefreshCw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { fetchOverview, fetchDailyStats, fetchReports, downloadExcel, Paginated } from '@/lib/adminApi';

/**
 * 어드민 대시보드.
 *
 * 기존의 하드코딩 CHART_DATA(최근 7일 Mock)와 프론트 계산식 KPI 는 전면 폐기했다.
 * 모든 수치는 백엔드 집계 API 가 '로그인한 계정의 권한 범위'로 산출해 내려준다.
 *  - super_admin  → 전사 전체 집계
 *  - client_admin → 자사 데이터만 집계
 */

const PAGE_SIZE = 10;

export default function AdminDashboard() {
  const router = useRouter();

  const [overview, setOverview] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [reports, setReports] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // KPI·차트는 필터와 무관하게 1회 로드
  const loadStats = useCallback(async () => {
    setError('');
    try {
      const [ov, dl] = await Promise.all([fetchOverview(), fetchDailyStats(7)]);
      setOverview(ov);
      setDaily(dl);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '통계를 불러오지 못했습니다.');
    }
  }, []);

  // 리포트 목록은 검색·페이지 변화에 반응
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReports({ search, page, page_size: PAGE_SIZE });
      setReports(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '리포트 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadReports(); }, [loadReports]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const kpis = [
    { label: '누적 진단 대상자', value: overview?.total_participants ?? '-', unit: '명', color: 'text-white' },
    { label: '완료 리포트', value: overview?.total_reports ?? '-', unit: '건', color: 'text-blue-400' },
    { label: '평균 리더십 점수', value: overview?.average_score ?? '-', unit: '점', color: 'text-green-400' },
    { label: '진단 완료율', value: overview?.completion_rate ?? '-', unit: '%', color: 'text-purple-400' },
  ];

  const totalPages = reports?.total_pages ?? 1;

  return (
    <AdminLayout>
      {error && (
        <div className="mb-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* 1. KPI 카드 — 서버 집계값 */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        {kpis.map((stat, idx) => (
          <div key={idx} className="flex flex-col justify-between rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-lg">
            <span className="text-sm font-medium text-gray-400">{stat.label}</span>
            <div className="mt-4 flex items-baseline space-x-2">
              <h3 className={`text-4xl font-bold ${stat.color}`}>{stat.value}</h3>
              <span className="text-sm text-gray-500">{stat.unit}</span>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {overview?.scope === 'all' ? '전체 고객사 기준' : '자사 기준'}
            </div>
          </div>
        ))}
      </div>

      {/* 2. 최근 7일 추이 — 백엔드 /stats/daily 실측값 */}
      <div className="mb-8 rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-lg">
        <h3 className="mb-6 flex items-center text-lg font-bold text-gray-200">
          <span className="mr-3 h-6 w-1 rounded bg-blue-500"></span>
          최근 7일 진단 추이
        </h3>
        <div className="h-72 w-full">
          {daily.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              집계 데이터를 불러오는 중입니다...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: '1px solid #374151', color: '#F3F4F6' }} itemStyle={{ color: '#E5E7EB' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                <Line type="monotone" dataKey="진단참여" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#1F2937', strokeWidth: 2 }} activeDot={{ r: 6 }} name="진단 시작" />
                <Line type="monotone" dataKey="진단완료" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#1F2937', strokeWidth: 2 }} activeDot={{ r: 6 }} name="진단 완료" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 3. 필터 바 — 실제 서버 검색 연동 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-gray-700 bg-gray-800 p-4">
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <div className="group relative">
            <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-blue-500" size={16} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="이름·이메일 검색"
              className="w-56 rounded-lg border border-gray-600 bg-gray-900 py-2 pl-10 pr-4 text-sm text-white transition-all focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => { loadStats(); loadReports(); }}
            className="flex items-center rounded-lg bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600"
          >
            <RefreshCw size={14} className="mr-2" /> 새로고침
          </button>
        </div>
        <button
          onClick={() => downloadExcel().catch(() => alert('엑셀 다운로드에 실패했습니다.'))}
          className="flex items-center rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-all duration-300 hover:border-green-600 hover:bg-green-700 hover:text-white"
        >
          <Download size={16} className="mr-2" /> Excel Export
        </button>
      </div>

      {/* 4. 리포트 테이블 */}
      <div className="overflow-x-auto rounded-b-xl border-x border-b border-gray-700 bg-gray-800 shadow-lg">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-gray-900/50 text-xs font-bold uppercase tracking-wider text-gray-400">
              <th className="w-16 border-b border-gray-700 px-4 py-4 text-center">No</th>
              <th className="w-32 border-b border-gray-700 px-4 py-4">참여자명</th>
              <th className="w-32 border-b border-gray-700 px-4 py-4">소속사</th>
              <th className="w-24 border-b border-gray-700 px-4 py-4 text-center">총점</th>
              <th className="border-b border-gray-700 px-4 py-4">AI 종합 요약</th>
              <th className="w-32 border-b border-gray-700 px-4 py-4">진단 일시</th>
              <th className="w-32 border-b border-gray-700 px-4 py-4 text-center">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-500">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            ) : !reports || reports.items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-500">
                {search ? `'${search}' 검색 결과가 없습니다.` : '아직 완료된 진단 데이터가 없습니다.'}
              </td></tr>
            ) : reports.items.map((r: any, idx: number) => (
              <tr key={r.id} className="group text-sm text-gray-300 transition-colors hover:bg-gray-700/50">
                <td className="px-4 py-4 text-center text-gray-500">{(reports.page - 1) * reports.page_size + idx + 1}</td>
                <td className="px-4 py-4 font-bold text-white">{r.user_name}</td>
                <td className="px-4 py-4 text-gray-400">{r.company_name}</td>
                <td className="px-4 py-4 text-center">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    r.total_score >= 4.0 ? 'border-blue-800 bg-blue-900/30 text-blue-400'
                      : r.total_score >= 3.0 ? 'border-green-800 bg-green-900/30 text-green-400'
                      : 'border-yellow-800 bg-yellow-900/30 text-yellow-400'}`}>
                    {Number(r.total_score).toFixed(1)}점
                  </span>
                </td>
                <td className="px-4 py-4 text-xs text-gray-400">
                  <div className="line-clamp-2 max-w-md">{r.summary}</div>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-gray-500">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="px-4 py-4 text-center">
                  <button
                    onClick={() => router.push(`/report?session_id=${r.session_id}`)}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:bg-blue-500"
                  >
                    리포트 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {reports && reports.total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {(reports.page - 1) * reports.page_size + 1}–
            {Math.min(reports.page * reports.page_size, reports.total)} / {reports.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> 이전
            </button>
            <span className="px-2 text-sm text-gray-400">{reports.page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음 <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
