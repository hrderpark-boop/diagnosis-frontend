"use client";

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Search, FileDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchParticipants, downloadExcel, Paginated } from '@/lib/adminApi';

/**
 * 참여자 관리.
 *
 * [보안] 과거 이 페이지는 브라우저에서 Supabase 로 직접 질의(anon key 노출 +
 * 회사 격리 없음)했다. 해당 로직은 전면 폐기했고, 이제 모든 데이터는 인증된
 * FastAPI 엔드포인트(/admin/participants)를 통해서만 받는다. 권한에 따른
 * 회사 격리·검색·페이지네이션은 모두 서버가 수행한다.
 */

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-green-900/50 text-green-400',
  in_progress: 'bg-blue-900/50 text-blue-400',
  paused: 'bg-amber-900/50 text-amber-400',
  미시작: 'bg-gray-700/50 text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  completed: '완료',
  in_progress: '진행 중',
  paused: '일시중지',
  미시작: '미시작',
};

const ParticipantsPage = () => {
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchParticipants({ search, page, page_size: PAGE_SIZE });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  // 검색어 입력 → 디바운스 후 1페이지부터 재조회
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleExcelDownload = async () => {
    setDownloading(true);
    try {
      // 엑셀 생성도 서버가 담당한다(권한 범위 내 데이터만 포함).
      await downloadExcel();
    } catch {
      alert('엑셀 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const totalPages = data?.total_pages ?? 1;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">참여자 관리</h2>
          <p className="mt-1 text-sm text-gray-400">
            {data ? `총 ${data.total.toLocaleString()}명` : '불러오는 중...'}
          </p>
        </div>
        <button
          onClick={handleExcelDownload}
          disabled={downloading}
          className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-green-700 disabled:bg-gray-700"
        >
          {downloading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileDown size={16} className="mr-2" />}
          엑셀 다운로드
        </button>
      </div>

      {/* 검색 필터 — 이름/이메일/부서(그룹코드) */}
      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="이름, 이메일, 부서로 검색"
          className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow">
        <table className="w-full border-collapse text-left">
          <thead className="bg-gray-900 text-xs uppercase text-gray-400">
            <tr>
              <th className="border-b border-gray-700 p-4">이름</th>
              <th className="border-b border-gray-700 p-4">이메일</th>
              <th className="border-b border-gray-700 p-4">소속사</th>
              <th className="border-b border-gray-700 p-4">부서코드</th>
              <th className="border-b border-gray-700 p-4">진단 상태</th>
              <th className="border-b border-gray-700 p-4">세션(완료/전체)</th>
              <th className="border-b border-gray-700 p-4">가입일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">데이터를 불러오는 중입니다...</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                {search ? `'${search}' 검색 결과가 없습니다.` : '등록된 참여자가 없습니다.'}
              </td></tr>
            ) : (
              data.items.map((p: any) => (
                <tr key={p.id} className="text-sm text-gray-300 hover:bg-gray-700/50">
                  <td className="p-4 font-bold text-white">{p.name}</td>
                  <td className="p-4 text-gray-400">{p.email}</td>
                  <td className="p-4 text-gray-400">{p.company_name}</td>
                  <td className="p-4 text-gray-400">{p.group_code}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLE[p.last_status] || 'bg-gray-700/50 text-gray-400'}`}>
                      {STATUS_LABEL[p.last_status] || p.last_status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-blue-400">
                    {p.completed_sessions} / {p.total_sessions}
                  </td>
                  <td className="p-4 text-xs text-gray-500">
                    {p.joined_at ? new Date(p.joined_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {(data.page - 1) * data.page_size + 1}–
            {Math.min(data.page * data.page_size, data.total)} / {data.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> 이전
            </button>
            <span className="px-2 text-sm text-gray-400">{data.page} / {totalPages}</span>
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
};

export default ParticipantsPage;
