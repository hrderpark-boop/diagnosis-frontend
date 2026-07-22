"use client";

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import { Building2, Plus, Loader2, RefreshCw, X } from 'lucide-react';
import adminApi, { fetchCompanies } from '@/lib/adminApi';

/**
 * 고객사 관리 (Super Admin 전용).
 * 고객사 등록 시 지정한 '코드'는 진단 대상자가 로그인할 때 입력하는
 * group_code 와 매칭되어 소속 회사가 자동으로 연결된다.
 */
export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', contact_email: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCompanies(await fetchCompanies());
    } catch (err: any) {
      setError(err?.response?.data?.detail || '고객사 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await adminApi.post('/admin/companies', {
        name: form.name.trim(),
        code: form.code.trim(),
        contact_email: form.contact_email.trim() || null,
      });
      setForm({ name: '', code: '', contact_email: '' });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '고객사 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // RBAC 도입 이전 데이터의 소속사를 group_code 기준으로 소급 연결
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await adminApi.post('/admin/companies/sync-participants');
      alert(`소속 미지정 ${data.scanned}건 중 ${data.updated}건을 고객사에 연결했습니다.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">고객사 관리</h2>
          <p className="mt-1 text-sm text-gray-400">총 {companies.length}개사</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-200 transition hover:bg-gray-600 disabled:opacity-50"
            title="소속이 비어있는 기존 참여자를 group_code 기준으로 고객사에 연결합니다"
          >
            {syncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            소속 동기화
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500"
          >
            {showForm ? <X size={16} className="mr-2" /> : <Plus size={16} className="mr-2" />}
            {showForm ? '취소' : '고객사 등록'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-400">고객사명 *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 커넥트앤컴퍼니"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-400">고객사 코드 *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="예: CONNECTN (로그인 시 입력하는 코드)"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-400">담당자 이메일</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="hr@company.com"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 rounded-lg bg-violet-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {submitting ? '등록 중...' : '등록하기'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow">
        <table className="w-full border-collapse text-left">
          <thead className="bg-gray-900 text-xs uppercase text-gray-400">
            <tr>
              <th className="border-b border-gray-700 p-4">고객사명</th>
              <th className="border-b border-gray-700 p-4">코드</th>
              <th className="border-b border-gray-700 p-4">담당자</th>
              <th className="border-b border-gray-700 p-4">참여자 수</th>
              <th className="border-b border-gray-700 p-4">상태</th>
              <th className="border-b border-gray-700 p-4">등록일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                등록된 고객사가 없습니다. 상단의 &apos;고객사 등록&apos; 버튼으로 추가하세요.
              </td></tr>
            ) : companies.map((c) => (
              <tr key={c.id} className="text-sm text-gray-300 hover:bg-gray-700/50">
                <td className="p-4 font-bold text-white">
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-violet-400" />
                    {c.name}
                  </div>
                </td>
                <td className="p-4 font-mono text-xs text-violet-300">{c.code}</td>
                <td className="p-4 text-gray-400">{c.contact_email || '-'}</td>
                <td className="p-4 font-bold text-blue-400">{c.participant_count}명</td>
                <td className="p-4">
                  <span className={`rounded-full px-2 py-1 text-xs ${c.is_active ? 'bg-green-900/50 text-green-400' : 'bg-gray-700/50 text-gray-400'}`}>
                    {c.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="p-4 text-xs text-gray-500">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
