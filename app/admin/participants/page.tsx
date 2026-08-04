"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../../../components/layouts/AdminLayout';
import TranscriptModal from '../../../components/admin/TranscriptModal';
import {
  Search, FileDown, ChevronLeft, ChevronRight, Loader2, MessageSquare, FileText,
} from 'lucide-react';
import { fetchParticipants, downloadExcel, Paginated } from '@/lib/adminApi';

/**
 * 대상자 진단 현황 (구 '참여자 관리').
 *
 * 리포트 목록(list_reports)은 '완료된 리포트'만 담아 진행 중/미시작을 표현할
 * 수 없다. 따라서 완료+진행중+미시작을 모두 가진 이 목록을 진단 현황판으로
 * 고도화한다: 행동 태그 뱃지 + 유형 필터 + 진행률 프로그레스 바 + 대화 원문.
 *
 * [보안] 모든 데이터는 인증된 FastAPI(/admin/participants)를 통해서만 받는다.
 */

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-green-900/50 text-green-400',
  in_progress: 'bg-blue-900/50 text-blue-400',
  paused: 'bg-amber-900/50 text-amber-400',
  incomplete: 'bg-rose-900/50 text-rose-300',
  aborted: 'bg-rose-900/50 text-rose-300',
  미시작: 'bg-gray-700/50 text-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  completed: '완료',
  in_progress: '진행 중',
  paused: '일시중지',
  incomplete: '미완료',
  aborted: '중단됨',
  미시작: '미시작',
};

// 행동 태그 → 뱃지 색상 (유형별 구분)
const BEHAVIOR_STYLE: Record<string, string> = {
  투머치토커: 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  단답형: 'bg-slate-700/50 text-slate-300 border border-slate-600/50',
  표준형: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
  협조적: 'bg-sky-900/50 text-sky-300 border border-sky-700/50',
  방어적: 'bg-orange-900/50 text-orange-300 border border-orange-700/50',
  불신형: 'bg-rose-900/50 text-rose-300 border border-rose-700/50',
};

// 필터 토글 대상 (상태 + 행동 태그)
const STATUS_FILTERS = [
  { key: 'completed', label: '완료' },
  { key: 'in_progress', label: '진행 중' },
  { key: '미시작', label: '미시작' },
];
const BEHAVIOR_FILTERS = ['투머치토커', '단답형', '표준형'];

// 진행률 색상 (구간별)
const progressColor = (pct: number, status: string) => {
  if (status === 'completed' || pct >= 100) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-blue-500';
  if (pct >= 20) return 'bg-sky-500';
  return 'bg-gray-500';
};

const ParticipantsPage = () => {
  const router = useRouter();
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  // 필터 (클라이언트 사이드: behavior_tag 는 런타임 휴리스틱이라 서버 정렬 불가)
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [behaviorFilter, setBehaviorFilter] = useState<string | null>(null);

  // 대화 원문 모달
  const [transcriptSid, setTranscriptSid] = useState<string | null>(null);

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

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleExcelDownload = async () => {
    setDownloading(true);
    try {
      await downloadExcel();
    } catch {
      alert('엑셀 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  // 현재 페이지 항목에 클라이언트 필터 적용
  const visibleItems = useMemo(() => {
    let items = data?.items || [];
    if (statusFilter) items = items.filter((p: any) => p.last_status === statusFilter);
    if (behaviorFilter) items = items.filter((p: any) => p.behavior_tag === behaviorFilter);
    return items;
  }, [data, statusFilter, behaviorFilter]);

  const totalPages = data?.total_pages ?? 1;
  const anyFilter = statusFilter || behaviorFilter;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">대상자 진단 현황</h2>
          <p className="mt-1 text-sm text-gray-400">
            {data ? `총 ${data.total.toLocaleString()}명` : '불러오는 중...'}
            {anyFilter && data && ` · 현재 페이지 ${visibleItems.length}명 표시`}
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

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="이름, 이메일, 부서로 검색"
          className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-blue-500"
        />
      </div>

      {/* 필터 토글 (상태 + 행동 유형) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">진행 상태</span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(statusFilter === f.key ? null : f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                statusFilter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">행동 유형</span>
          {BEHAVIOR_FILTERS.map((b) => (
            <button
              key={b}
              onClick={() => setBehaviorFilter(behaviorFilter === b ? null : b)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                behaviorFilter === b
                  ? 'bg-purple-600 text-white'
                  : 'border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        {anyFilter && (
          <button
            onClick={() => { setStatusFilter(null); setBehaviorFilter(null); }}
            className="text-xs text-gray-500 underline hover:text-gray-300"
          >
            필터 초기화
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-800 shadow">
        <table className="w-full border-collapse text-left">
          <thead className="bg-gray-900 text-xs uppercase text-gray-400">
            <tr>
              <th className="border-b border-gray-700 p-4">이름</th>
              <th className="border-b border-gray-700 p-4">소속사</th>
              <th className="border-b border-gray-700 p-4">진단 상태</th>
              <th className="border-b border-gray-700 p-4 w-52">진행률</th>
              <th className="border-b border-gray-700 p-4">행동 태그</th>
              <th className="border-b border-gray-700 p-4 text-right">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                {anyFilter ? '이 필터에 해당하는 대상자가 현재 페이지에 없습니다.'
                  : search ? `'${search}' 검색 결과가 없습니다.`
                  : '등록된 대상자가 없습니다.'}
              </td></tr>
            ) : (
              visibleItems.map((p: any) => {
                const pct = p.progress_pct ?? 0;
                const done = p.last_status === 'completed';
                return (
                  <tr key={p.id} className="text-sm text-gray-300 hover:bg-gray-700/50">
                    <td className="p-4">
                      <div className="font-bold text-white">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.email}</div>
                    </td>
                    <td className="p-4 text-gray-400">{p.company_name}</td>
                    <td className="p-4">
                      <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLE[p.last_status] || 'bg-gray-700/50 text-gray-400'}`}>
                        {STATUS_LABEL[p.last_status] || p.last_status}
                      </span>
                    </td>
                    {/* 진행률 프로그레스 바 */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${progressColor(pct, p.last_status)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-gray-400">
                          {pct}%
                        </span>
                      </div>
                      {p.current_topic && !done && (
                        <span className="mt-1 block text-[11px] text-gray-500">진행: {p.current_topic}</span>
                      )}
                    </td>
                    {/* 행동 태그 뱃지 */}
                    <td className="p-4">
                      {p.behavior_tag ? (
                        <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${BEHAVIOR_STYLE[p.behavior_tag] || 'bg-gray-700/50 text-gray-300'}`}>
                          {p.behavior_tag}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    {/* 액션: 대화 원문 / 리포트 */}
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.last_session_id && (
                          <button
                            onClick={() => setTranscriptSid(p.last_session_id)}
                            title="전체 대화 기록 보기"
                            className="flex items-center rounded-lg border border-gray-600 bg-gray-700 px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-gray-600"
                          >
                            <MessageSquare size={13} className="mr-1" /> 대화
                          </button>
                        )}
                        {p.report_id && (
                          <button
                            onClick={() => router.push(`/admin/reports/${p.report_id}`)}
                            title="리포트 상세"
                            className="flex items-center rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                          >
                            <FileText size={13} className="mr-1" /> 리포트
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 (필터는 현재 페이지 기준이라 서버 페이지는 그대로) */}
      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {(data.page - 1) * data.page_size + 1}–
            {Math.min(data.page * data.page_size, data.total)} / {data.total.toLocaleString()}
            {anyFilter && <span className="ml-2 text-gray-600">(필터는 현재 페이지 내 적용)</span>}
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

      {/* 대화 원문 모달 */}
      <TranscriptModal
        sessionId={transcriptSid || ''}
        open={transcriptSid !== null}
        onClose={() => setTranscriptSid(null)}
      />
    </AdminLayout>
  );
};

export default ParticipantsPage;
