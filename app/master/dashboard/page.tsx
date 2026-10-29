"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { fetchOverview, fetchDailyStats, fetchCompanies } from '@/lib/adminApi';

/**
 * 마스터(Super Admin) 대시보드(/master/dashboard).
 *
 * 고객사 HR 화면(/admin/*)과 달리 전 고객사를 가로지르는 시스템 전체 지표를
 * 다룬다. 접근 자체는 미들웨어가 1차 차단하고, 데이터는 백엔드가
 * require_super_admin 으로 2차 차단한다.
 */
export default function SuperAdminDashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([fetchOverview(), fetchDailyStats(14), fetchCompanies()])
      .then(([ov, dl, cs]) => {
        if (!alive) return;
        setOverview(ov);
        setDaily(dl);
        setCompanies(cs);
      })
      .catch((err: any) => {
        if (alive) setError(err?.response?.data?.detail || '시스템 통계를 불러오지 못했습니다.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <AdminPageHead eyebrow="마스터" title="대시보드" desc="전 고객사를 아우르는 운영 지표입니다." />
        <div className="fa-empty flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> 시스템 전체 통계를 집계하는 중입니다…
        </div>
      </AdminLayout>
    );
  }

  const kpis = [
    { label: '등록 고객사', value: overview?.total_companies ?? 0, unit: '곳' },
    { label: '전체 진단 대상자', value: overview?.total_participants ?? 0, unit: '명' },
    { label: '누적 완료 리포트', value: overview?.total_reports ?? 0, unit: '건' },
    {
      label: '전체 진단 완료율', value: overview?.completion_rate ?? 0, unit: '%',
      detail: <div className="fa-bar"><i style={{ width: `${Math.min(100, Number(overview?.completion_rate) || 0)}%` }} /></div>,
    },
  ];

  // 고객사별 참여자 규모 (많은 순)
  const companyChart = [...companies]
    .sort((a, b) => b.participant_count - a.participant_count)
    .slice(0, 10)
    .map((c) => ({ name: c.name, 참여자: c.participant_count }));

  const tooltipStyle = { backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E6E9EF', color: '#0F172A' };

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow="마스터"
        title="대시보드"
        desc="전 고객사를 아우르는 운영 지표입니다."
        kpis={kpis}
      />

      {error && <div className="fa-error fa-section">{error}</div>}

      <div className="fa-grid2 even">
        {/* 최근 14일 전체 추이 */}
        <div className="fa-card pad">
          <div className="fa-cap">
            <div>
              <h3>최근 14일 진단 추이</h3>
              <p>전 고객사 합계 · 진단 시작과 완료</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6E9EF" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px', color: '#334155' }} />
                <Line type="monotone" dataKey="진단참여" stroke="#8FB2FB" strokeWidth={3} dot={{ r: 3, fill: '#FFFFFF', strokeWidth: 2 }} name="진단 시작" />
                <Line type="monotone" dataKey="진단완료" stroke="#1C2B4A" strokeWidth={3} dot={{ r: 3, fill: '#FFFFFF', strokeWidth: 2 }} name="진단 완료" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 고객사별 참여자 규모 */}
        <div className="fa-card pad">
          <div className="fa-cap">
            <div>
              <h3>고객사별 참여자</h3>
              <p>참여자가 많은 상위 10곳</p>
            </div>
          </div>
          <div className="h-72 w-full">
            {companyChart.length === 0 ? (
              <div className="fa-empty">등록된 고객사가 없습니다.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E6E9EF" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fill: '#334155', fontSize: 12 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(28,43,74,0.05)' }} />
                  <Bar dataKey="참여자" fill="#1C2B4A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
