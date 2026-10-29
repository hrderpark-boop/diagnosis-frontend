"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import { Download, RefreshCw, ChevronLeft, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { fetchOverview, fetchDailyStats, fetchReports, downloadExcel, fetchMe, Paginated } from '@/lib/adminApi';
import { adminPath } from '@/lib/adminRoutes';

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
  // 머리 제목 위에 소속 회사명을 보여 주기 위한 내 계정 정보
  const [companyName, setCompanyName] = useState<string | null>(null);
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
  useEffect(() => {
    let alive = true;
    fetchMe().then((me) => { if (alive) setCompanyName(me.company_name); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { loadReports(); }, [loadReports]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const scopeNote = overview?.scope === 'all' ? '전체 고객사 기준' : '자사 기준';
  const kpis = [
    { label: '누적 진단 대상자', value: overview?.total_participants ?? '-', unit: '명', detail: scopeNote },
    { label: '완료 리포트', value: overview?.total_reports ?? '-', unit: '건', detail: scopeNote },
    { label: '평균 리더십 점수', value: overview?.average_score ?? '-', unit: '점', detail: '5점 만점' },
    {
      label: '진단 완료율', value: overview?.completion_rate ?? '-', unit: '%',
      detail: typeof overview?.completion_rate === 'number'
        ? <div className="fa-bar"><i style={{ width: `${Math.min(100, overview.completion_rate)}%` }} /></div>
        : scopeNote,
    },
  ];

  const totalPages = reports?.total_pages ?? 1;

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={companyName || undefined}
        title="진단 현황"
        desc="참여·완료 현황과 최근 리포트를 한눈에 봅니다."
        actions={
          <>
            <button type="button" className="fa-btn" onClick={() => { loadStats(); loadReports(); }}>
              <RefreshCw /> 새로고침
            </button>
            <button
              type="button"
              className="fa-btn primary"
              onClick={() => downloadExcel().catch(() => alert('엑셀 다운로드에 실패했습니다.'))}
            >
              <Download /> 엑셀 다운로드
            </button>
          </>
        }
        kpis={kpis}
      />

      {error && <div className="fa-error fa-section">{error}</div>}

      {/* 최근 7일 추이 — 백엔드 /stats/daily 실측값 */}
      <div className="fa-card pad fa-section">
        <div className="fa-cap">
          <div>
            <h3>최근 7일 진단 추이</h3>
            <p>하루 단위 진단 시작 · 완료 인원</p>
          </div>
        </div>
        <div className="h-72 w-full">
          {daily.length === 0 ? (
            <div className="fa-empty">집계 데이터를 불러오는 중입니다…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E9EF" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E6E9EF', color: '#0F172A' }} itemStyle={{ color: '#334155' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px', color: '#334155' }} />
                <Line type="monotone" dataKey="진단참여" stroke="#8FB2FB" strokeWidth={3} dot={{ r: 4, fill: '#FFFFFF', strokeWidth: 2 }} activeDot={{ r: 6 }} name="진단 시작" />
                <Line type="monotone" dataKey="진단완료" stroke="#1C2B4A" strokeWidth={3} dot={{ r: 4, fill: '#FFFFFF', strokeWidth: 2 }} activeDot={{ r: 6 }} name="진단 완료" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 최근 리포트 — 실제 서버 검색 연동 */}
      <div className="fa-card pad">
        <div className="fa-cap">
          <div>
            <h3>최근 리포트</h3>
            <p>행의 [상세 · 교정]에서 AI 피드백을 확인하고 고칠 수 있습니다.</p>
          </div>
        </div>
        <div className="fa-filters">
          <input
            type="text"
            className="fa-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="이름·이메일 검색"
            aria-label="이름·이메일 검색"
          />
        </div>

        <div className="fa-tbl">
          <table className="fa-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: 56 }}>No</th>
                <th>참여자</th>
                <th>소속사</th>
                <th>총점</th>
                <th>AI 종합 요약</th>
                <th>진단 일시</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="fa-empty">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : !reports || reports.items.length === 0 ? (
                <tr><td colSpan={7} className="fa-empty">
                  {search ? `'${search}' 검색 결과가 없습니다.` : '아직 완료된 진단 데이터가 없습니다.'}
                </td></tr>
              ) : reports.items.map((r: any, idx: number) => r.report_missing ? (
                /* (2026-10-23 파일럿 전 2) 완료했지만 리포트 행이 없는 세션 — 백엔드가 1페이지 상단에 report_missing 으로 보낸다 */
                <tr key={`missing-${r.session_id}`}>
                  <td className="fa-num fa-muted">{(reports.page - 1) * reports.page_size + idx + 1}</td>
                  <td className="fa-who"><b>{r.user_name}</b></td>
                  <td className="fa-muted">{r.company_name}</td>
                  <td><span className="fa-chip danger">리포트 미생성</span></td>
                  <td className="fa-muted" style={{ fontSize: 13 }}>
                    {r.analysis_status === 'failed' ? `종합 실패 확정 (${r.fail_count ?? '-'}회${r.error_id ? `, 문의 번호 ${r.error_id}` : ''}) · 대상자 현황에서 [재분석]`
                      : r.analysis_status === 'degraded' ? `종합 실패 ${r.fail_count ?? '-'}회 · 리더 재시도 또는 [재분석] 대기`
                      : r.analysis_status === 'reset' ? '관리자 재분석 진행 중 또는 대기'
                      : '분석 중 또는 미시작'}
                  </td>
                  <td className="fa-num fa-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="fa-muted">-</td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="fa-num fa-muted">{(reports.page - 1) * reports.page_size + idx + 1}</td>
                  <td className="fa-who"><b>{r.user_name}</b></td>
                  <td className="fa-muted">{r.company_name}</td>
                  <td>
                    <span className={`fa-chip ${r.total_score >= 4.0 ? 'navy' : r.total_score >= 3.0 ? 'tint' : 'line'}`}>
                      {Number(r.total_score).toFixed(1)}점
                    </span>
                  </td>
                  <td className="fa-muted" style={{ fontSize: 13 }}>
                    <div className="line-clamp-2 max-w-md">{r.summary}</div>
                  </td>
                  <td className="fa-num fa-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      {r.is_human_edited && (
                        <span title="관리자 검수 완료" className="fa-chip tint">
                          <ShieldCheck size={12} /> 검수
                        </span>
                      )}
                      <button
                        type="button"
                        className="fa-btn sm"
                        onClick={() => router.push(adminPath(`/reports/${r.id}`))}
                        title="상세 확인 및 AI 피드백 교정"
                      >
                        상세 · 교정
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {reports && reports.total > 0 && (
          <div className="fa-pager">
            <span className="fa-num">
              {(reports.page - 1) * reports.page_size + 1}–
              {Math.min(reports.page * reports.page_size, reports.total)} / {reports.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="fa-btn sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft /> 이전
              </button>
              <span className="fa-num px-2">{reports.page} / {totalPages}</span>
              <button
                type="button"
                className="fa-btn sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                다음 <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
