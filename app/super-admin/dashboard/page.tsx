"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Building2, Users, FileText, Activity, Loader2, ShieldCheck } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { fetchOverview, fetchDailyStats, fetchCompanies } from '@/lib/adminApi';

/**
 * 운영자(Super Admin) 통합 대시보드.
 *
 * Client Admin 화면(/admin/*)과 달리 전 고객사를 가로지르는 시스템 전체 지표를
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
        <div className="flex h-96 items-center justify-center text-gray-400">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> 시스템 전체 통계를 집계하는 중입니다...
        </div>
      </AdminLayout>
    );
  }

  const kpis = [
    { label: '등록 고객사', value: overview?.total_companies ?? 0, unit: '개사', icon: Building2, color: 'text-violet-400' },
    { label: '전체 진단 대상자', value: overview?.total_participants ?? 0, unit: '명', icon: Users, color: 'text-white' },
    { label: '누적 완료 리포트', value: overview?.total_reports ?? 0, unit: '건', icon: FileText, color: 'text-blue-400' },
    { label: '전체 진단 완료율', value: overview?.completion_rate ?? 0, unit: '%', icon: Activity, color: 'text-green-400' },
  ];

  // 고객사별 참여자 규모 (많은 순)
  const companyChart = [...companies]
    .sort((a, b) => b.participant_count - a.participant_count)
    .slice(0, 10)
    .map((c) => ({ name: c.name, 참여자: c.participant_count }));

  return (
    <AdminLayout>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/20">
          <ShieldCheck className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">시스템 통합 대시보드</h2>
          <p className="text-sm text-gray-400">전 고객사를 아우르는 운영 지표입니다.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">{error}</div>
      )}

      {/* KPI */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">{k.label}</span>
              <k.icon size={16} className="text-gray-500" />
            </div>
            <div className="mt-4 flex items-baseline space-x-2">
              <h3 className={`text-4xl font-bold ${k.color}`}>{k.value}</h3>
              <span className="text-sm text-gray-500">{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 최근 14일 전체 추이 */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-lg">
          <h3 className="mb-6 flex items-center text-lg font-bold text-gray-200">
            <span className="mr-3 h-6 w-1 rounded bg-violet-500"></span>
            최근 14일 전체 진단 추이
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: '1px solid #374151' }} />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                <Line type="monotone" dataKey="진단참여" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 3 }} name="진단 시작" />
                <Line type="monotone" dataKey="진단완료" stroke="#10B981" strokeWidth={3} dot={{ r: 3 }} name="진단 완료" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 고객사별 참여자 규모 */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-lg">
          <h3 className="mb-6 flex items-center text-lg font-bold text-gray-200">
            <span className="mr-3 h-6 w-1 rounded bg-blue-500"></span>
            고객사별 참여자 규모 (상위 10)
          </h3>
          <div className="h-72 w-full">
            {companyChart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">등록된 고객사가 없습니다.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#374151" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1F2937', borderRadius: '8px', border: '1px solid #374151' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="참여자" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
