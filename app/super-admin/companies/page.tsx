"use client";

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../components/layouts/AdminLayout';
import Modal from '../../../components/admin/Modal';
import {
  Building2, Plus, Loader2, RefreshCw, UserPlus, Copy, Check,
  KeyRound, AlertTriangle, Users,
} from 'lucide-react';
import adminApi, {
  fetchCompanies, createCompany, createAdminUser, fetchAdminUsers, IssuedAdmin,
} from '@/lib/adminApi';

/**
 * 고객사 관리 & 온보딩 (Super Admin 전용).
 *
 * 온보딩 흐름
 *   ① 고객사 등록 — 여기서 정한 '회사 코드'가 진단 대상자의 group_code 와
 *      매칭되어 소속이 자동 연결된다.
 *   ② HR 담당자 계정 발급 — 서버가 임시 비밀번호를 생성하고, 그 평문은
 *      발급 직후 이 화면에서 단 한 번만 확인할 수 있다(DB 에는 해시만 저장).
 */

interface Company {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  is_active: boolean;
  participant_count: number;
  created_at: string | null;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [adminCounts, setAdminCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  // 고객사 등록 모달
  const [companyModal, setCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', code: '', contact_email: '' });
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyError, setCompanyError] = useState('');

  // 담당자 계정 발급 모달
  const [adminModal, setAdminModal] = useState<Company | null>(null);
  const [adminForm, setAdminForm] = useState({ email: '', name: '' });
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [issued, setIssued] = useState<IssuedAdmin | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, admins] = await Promise.all([fetchCompanies(), fetchAdminUsers()]);
      setCompanies(list);
      // 고객사별 발급된 담당자 수 집계
      const counts: Record<string, number> = {};
      (admins || []).forEach((a: any) => {
        if (a.company_id) counts[a.company_id] = (counts[a.company_id] || 0) + 1;
      });
      setAdminCounts(counts);
    } catch (err: any) {
      setError(err?.response?.data?.detail || '고객사 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── 고객사 등록 ──
  const openCompanyModal = () => {
    setCompanyForm({ name: '', code: '', contact_email: '' });
    setCompanyError('');
    setCompanyModal(true);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanySubmitting(true);
    setCompanyError('');
    try {
      await createCompany({
        name: companyForm.name.trim(),
        code: companyForm.code.trim(),
        contact_email: companyForm.contact_email.trim() || null,
      });
      setCompanyModal(false);
      await load();
    } catch (err: any) {
      setCompanyError(err?.response?.data?.detail || '고객사 등록에 실패했습니다.');
    } finally {
      setCompanySubmitting(false);
    }
  };

  // ── 담당자 계정 발급 ──
  const openAdminModal = (company: Company) => {
    setAdminForm({ email: company.contact_email || '', name: '' });
    setAdminError('');
    setIssued(null);
    setCopied(false);
    setAdminModal(company);
  };

  const handleIssueAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminModal) return;
    setAdminSubmitting(true);
    setAdminError('');
    try {
      // password 를 보내지 않으면 서버가 임시 비밀번호를 생성해 반환한다.
      const result = await createAdminUser({
        email: adminForm.email.trim(),
        name: adminForm.name.trim() || undefined,
        company_id: adminModal.id,
      });
      setIssued(result);
      await load();
    } catch (err: any) {
      setAdminError(err?.response?.data?.detail || '계정 발급에 실패했습니다.');
    } finally {
      setAdminSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!issued) return;
    const text = `접속 주소: ${window.location.origin}/admin/login\n이메일: ${issued.email}\n임시 비밀번호: ${issued.generated_password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAdminError('클립보드 복사에 실패했습니다. 직접 선택해 복사해주세요.');
    }
  };

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
            onClick={openCompanyModal}
            className="flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500"
          >
            <Plus size={16} className="mr-2" /> 신규 고객사 등록
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-300">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow">
        <table className="w-full border-collapse text-left">
          <thead className="bg-gray-900 text-xs uppercase text-gray-400">
            <tr>
              <th className="border-b border-gray-700 p-4">고객사명</th>
              <th className="border-b border-gray-700 p-4">코드</th>
              <th className="border-b border-gray-700 p-4">담당자 이메일</th>
              <th className="border-b border-gray-700 p-4">참여자</th>
              <th className="border-b border-gray-700 p-4">발급 계정</th>
              <th className="border-b border-gray-700 p-4">등록일</th>
              <th className="border-b border-gray-700 p-4 text-right">온보딩</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                등록된 고객사가 없습니다. 상단의 &apos;신규 고객사 등록&apos; 버튼으로 추가하세요.
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
                  {adminCounts[c.id] ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-300">
                      <Users size={13} className="text-gray-500" />
                      {adminCounts[c.id]}개
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400">미발급</span>
                  )}
                </td>
                <td className="p-4 text-xs text-gray-500">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => openAdminModal(c)}
                    className="inline-flex items-center rounded-lg border border-blue-600/40 bg-blue-600/10 px-3 py-1.5 text-xs font-bold text-blue-300 transition hover:bg-blue-600 hover:text-white"
                  >
                    <UserPlus size={13} className="mr-1.5" /> HR 담당자 계정 발급
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모달 1: 신규 고객사 등록 ── */}
      <Modal
        open={companyModal}
        onClose={() => setCompanyModal(false)}
        closable={!companySubmitting}
        title="신규 고객사 등록"
        description="회사 코드는 진단 대상자가 로그인할 때 입력하는 코드와 동일해야 합니다."
      >
        <form onSubmit={handleCreateCompany} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-400">회사명 *</label>
            <input
              required
              autoFocus
              value={companyForm.name}
              onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
              placeholder="예: 커넥트앤컴퍼니"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-400">회사 코드 *</label>
            <input
              required
              value={companyForm.code}
              onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })}
              placeholder="예: CONNECTN"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 font-mono text-sm text-white outline-none transition-colors focus:border-violet-500"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              대상자가 진단 로그인 시 입력하는 group_code 와 매칭되어 소속이 자동 연결됩니다.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-400">담당자 이메일</label>
            <input
              type="email"
              value={companyForm.contact_email}
              onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })}
              placeholder="hr@company.com"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              계정 발급 시 이 주소가 기본값으로 채워집니다.
            </p>
          </div>

          {companyError && (
            <div className="rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-sm text-rose-300">
              {companyError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCompanyModal(false)}
              disabled={companySubmitting}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={companySubmitting}
              className="flex items-center rounded-lg bg-violet-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {companySubmitting && <Loader2 size={14} className="mr-2 animate-spin" />}
              등록하기
            </button>
          </div>
        </form>
      </Modal>

      {/* ── 모달 2: HR 담당자 계정 발급 ── */}
      <Modal
        open={adminModal !== null}
        onClose={() => setAdminModal(null)}
        closable={!adminSubmitting}
        title={issued ? '계정이 발급되었습니다' : 'HR 담당자 계정 발급'}
        description={
          issued
            ? '임시 비밀번호는 지금 이 화면에서만 확인할 수 있습니다.'
            : `${adminModal?.name ?? ''} 소속 Client Admin 계정을 생성합니다.`
        }
      >
        {issued ? (
          // 발급 완료 — 자격증명 1회 노출
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-sm text-amber-200">
                  비밀번호는 암호화되어 저장되므로 <strong>다시 조회할 수 없습니다.</strong>
                  지금 복사해 담당자에게 안전하게 전달하고, 첫 로그인 후 변경하도록 안내하세요.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900 p-4">
              <div>
                <span className="block text-xs font-bold text-gray-500">소속 고객사</span>
                <span className="text-sm text-white">{issued.company_name || adminModal?.name}</span>
              </div>
              <div>
                <span className="block text-xs font-bold text-gray-500">이메일 (아이디)</span>
                <span className="font-mono text-sm text-white">{issued.email}</span>
              </div>
              <div>
                <span className="block text-xs font-bold text-gray-500">임시 비밀번호</span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 select-all rounded-md border border-blue-700/40 bg-blue-950/40 px-3 py-2 font-mono text-base font-bold tracking-wider text-blue-200">
                    {issued.generated_password}
                  </code>
                  <button
                    onClick={copyCredentials}
                    className="flex shrink-0 items-center rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-xs text-gray-300 transition hover:bg-gray-700"
                  >
                    {copied ? <Check size={14} className="mr-1.5 text-green-400" /> : <Copy size={14} className="mr-1.5" />}
                    {copied ? '복사됨' : '전체 복사'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setIssued(null); setAdminForm({ email: '', name: '' }); }}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-700"
              >
                계정 추가 발급
              </button>
              <button
                onClick={() => setAdminModal(null)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                확인 (닫기)
              </button>
            </div>
          </div>
        ) : (
          // 발급 폼
          <form onSubmit={handleIssueAdmin} className="space-y-4">
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Building2 size={14} className="text-violet-400" />
                <span className="text-gray-400">소속 고객사:</span>
                <span className="font-bold text-white">{adminModal?.name}</span>
                <span className="font-mono text-xs text-violet-300">({adminModal?.code})</span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-400">담당자 이메일 *</label>
              <input
                required
                type="email"
                autoFocus
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                placeholder="hr@company.com"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-400">담당자 이름</label>
              <input
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                placeholder="예: 김담당"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3">
              <KeyRound size={15} className="mt-0.5 shrink-0 text-blue-400" />
              <p className="text-xs text-blue-200">
                비밀번호는 서버가 안전한 난수로 자동 생성하며, 발급 직후 한 번만 표시됩니다.
                이 계정은 <strong>{adminModal?.name}</strong> 데이터만 조회할 수 있습니다.
              </p>
            </div>

            {adminError && (
              <div className="rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-sm text-rose-300">
                {adminError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdminModal(null)}
                disabled={adminSubmitting}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={adminSubmitting}
                className="flex items-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {adminSubmitting && <Loader2 size={14} className="mr-2 animate-spin" />}
                계정 발급
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AdminLayout>
  );
}
