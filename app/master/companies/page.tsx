"use client";

import { HR_URL } from '@/lib/adminRoutes';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import Modal from '../../../components/admin/Modal';
import { Plus, Loader2, RefreshCw, UserPlus, Copy, Check, CalendarDays, Network, Download, Upload, LogIn, Play } from 'lucide-react';
import RosterImport from '../../../components/admin/RosterImport';
import adminApi, {
  fetchCompanies, createCompany, createAdminUser, fetchAdminUsers, IssuedAdmin, savePeriod,
  downloadOrgCodesExcel, downloadRosterExcel, startActing,
} from '@/lib/adminApi';

/**
 * 고객사 관리 & 온보딩 (Super Admin 전용).
 *
 * 온보딩 흐름
 *   ① 고객사 등록 — 여기서 정한 '회사 코드'가 진단 대상자의 group_code 와
 *      매칭되어 소속이 자동 연결된다.
 *   ② HR 담당자 계정 발급 — 서버가 임시 비밀번호를 생성하고, 그 평문은
 *      발급 직후 이 화면에서 단 한 번만 확인할 수 있다(DB 에는 해시만 저장).
 *   ③ 참여자 명단 업로드 — 엑셀의 본부·실·팀 이름으로 조직이 자동으로 세팅되고 참여자마다 개인 참여 코드가 생긴다.
 *      (조직만 따로 만들 때는 조직 코드 화면 /master/org)
 *   ④ 개인 코드 엑셀 — 고객사에 전달할 참여자별 코드 엑셀을 내려받는다.
 *   ⑤ 진단 기간 설정.
 * 'HR 화면 들어가기'는 그 고객사 HR 화면을 마스터 권한으로 열어 보고 고친다(유지보수).
 * 표의 '준비 상태'는 ②③⑤가 됐는지 한눈에 보여 준다.
 */

/** 고객사 준비 순서(화면 위 안내 카드) */
const STEPS: { title: string; desc: string }[] = [
  { title: '고객사 등록', desc: '회사명과 회사 코드를 등록합니다.' },
  { title: 'HR 계정 발급', desc: '담당자 이메일로 계정과 임시 비밀번호를 만듭니다.' },
  { title: '참여자 명단 업로드', desc: '엑셀을 올리면 조직과 개인 참여 코드가 자동으로 만들어집니다.' },
  { title: '개인 코드 엑셀 전달', desc: '참여자별 코드 엑셀을 내려받아 고객사에 전달합니다.' },
  { title: '진단 기간 설정', desc: '시작일과 종료일을 정합니다. HR도 바꿀 수 있습니다.' },
];

interface Company {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  is_active: boolean;
  /** 고객사별 LLM provider. null = 환경 기본값 */
  llm_provider: 'gemini' | 'claude' | null;
  participant_count: number;
  /** (2026-10-29) 사용 중인 조직 참여 코드 수 */
  org_unit_count?: number;
  created_at: string | null;
  /** (2026-10-29) 진단 기간(YYYY-MM-DD). 미정이면 null */
  diagnosis_start?: string | null;
  diagnosis_end?: string | null;
}

/** 진단 기간 표시: 2026.11.01 ~ 11.15 (해가 다르면 종료일에도 연도) */
const fmtPeriod = (s?: string | null, e?: string | null) => {
  if (!s || !e) return null;
  const [sy, sm, sd] = s.split('-');
  const [ey, em, ed] = e.split('-');
  return `${sy}.${sm}.${sd} ~ ${ey === sy ? '' : `${ey}.`}${em}.${ed}`;
};

/** axios 오류에서 서버 안내문(detail)을 꺼낸다 */
const errDetail = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  // 코드 엑셀 내려받는 중인 고객사 id
  const [exporting, setExporting] = useState<string | null>(null);
  const [adminCounts, setAdminCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  // 고객사 등록 모달
  const [companyModal, setCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', code: '', contact_email: '', llm_provider: '' });
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyError, setCompanyError] = useState('');

  // 담당자 계정 발급 모달
  const [adminModal, setAdminModal] = useState<Company | null>(null);
  const [adminForm, setAdminForm] = useState({ email: '', name: '' });
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [issued, setIssued] = useState<IssuedAdmin | null>(null);
  const [copied, setCopied] = useState(false);

  // 참여자 명단 업로드 모달 · 개인 코드 엑셀 내려받는 중인 고객사 id
  const [rosterFor, setRosterFor] = useState<Company | null>(null);
  const [rosterExporting, setRosterExporting] = useState<string | null>(null);

  // 진단 기간 설정 모달
  const [periodModal, setPeriodModal] = useState<Company | null>(null);
  const [periodForm, setPeriodForm] = useState({ start: '', end: '' });
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState('');

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
    setCompanyForm({ name: '', code: '', contact_email: '', llm_provider: '' });
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
        llm_provider: (companyForm.llm_provider as 'gemini' | 'claude' | '') || null,
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
    const text = `접속 주소: ${HR_URL}\n이메일: ${issued.email}\n임시 비밀번호: ${issued.generated_password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAdminError('클립보드 복사에 실패했습니다. 직접 선택해 복사해주세요.');
    }
  };

  // ── 진단 기간 ──
  const openPeriodModal = (company: Company) => {
    setPeriodForm({ start: company.diagnosis_start || '', end: company.diagnosis_end || '' });
    setPeriodError('');
    setPeriodModal(company);
  };

  // 저장(둘 다 입력) 또는 지우기(둘 다 null). 검증 규칙은 서버와 같다.
  const submitPeriod = async (clear: boolean) => {
    if (!periodModal) return;
    const start = clear ? null : periodForm.start || null;
    const end = clear ? null : periodForm.end || null;
    if (!clear && (!start || !end)) { setPeriodError('시작일과 종료일을 함께 정해 주세요.'); return; }
    if (!clear && start && end && start > end) { setPeriodError('종료일이 시작일보다 빠릅니다.'); return; }
    setPeriodSaving(true);
    setPeriodError('');
    try {
      await savePeriod(periodModal.id, start, end);
      setPeriodModal(null);
      await load();
    } catch (e: unknown) {
      setPeriodError(errDetail(e, '진단 기간을 저장하지 못했습니다.'));
    } finally {
      setPeriodSaving(false);
    }
  };

  // ── 참여 코드 엑셀(고객사 전달용) ──
  const handleExport = async (company: Company) => {
    setExporting(company.id);
    setError('');
    try {
      await downloadOrgCodesExcel(company.id);
    } catch (e: unknown) {
      // blob 응답이라 오류 본문도 blob 으로 온다 → 글자로 풀어 서버 안내문을 보여 준다
      let msg = errDetail(e, '');
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (!msg && data instanceof Blob) {
        try { msg = (JSON.parse(await data.text()) as { detail?: string }).detail || ''; } catch { /* 무시 */ }
      }
      setError(msg || '참여 코드 엑셀을 내려받지 못했습니다.');
    } finally {
      setExporting(null);
    }
  };

  // ── 개인 참여 코드 엑셀(참여자별, 고객사 전달용) ──
  const handleRosterExport = async (company: Company) => {
    setRosterExporting(company.id);
    setError('');
    try {
      await downloadRosterExcel(company.id);
    } catch (e: unknown) {
      let msg = errDetail(e, '');
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (!msg && data instanceof Blob) {
        try { msg = (JSON.parse(await data.text()) as { detail?: string }).detail || ''; } catch { /* 무시 */ }
      }
      setError(msg || '개인 코드 엑셀을 내려받지 못했습니다.');
    } finally {
      setRosterExporting(null);
    }
  };

  // ── 그 고객사 HR 화면으로 들어가기(마스터 권한으로 보고 고친다) ──
  const enterHr = (company: Company) => {
    startActing(company.id, company.name);
    router.push('/admin/dashboard');
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

  const totalParticipants = companies.reduce((a, c) => a + (c.participant_count || 0), 0);
  const issuedCompanies = companies.filter((c) => adminCounts[c.id]).length;

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow="마스터"
        title="고객사 관리"
        desc="고객사를 등록하고 HR 담당자 계정을 발급합니다. 회사 코드로 참여자의 소속이 연결됩니다."
        actions={<>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="fa-btn"
            title="소속이 비어있는 기존 참여자를 group_code 기준으로 고객사에 연결합니다"
          >
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            소속 동기화
          </button>
          <button type="button" onClick={openCompanyModal} className="fa-btn">
            <Plus /> 고객사 등록
          </button>
          <button type="button" onClick={() => router.push('/master/onboarding')} className="fa-btn primary">
            <Play /> 새 고객사 시작하기
          </button>
        </>}
        kpis={loading ? undefined : [
          { label: '고객사', value: companies.length, unit: '곳' },
          { label: '전체 참여자', value: totalParticipants.toLocaleString(), unit: '명' },
          { label: 'HR 계정 발급', value: issuedCompanies, unit: `/ ${companies.length}`, detail: '담당자 계정이 있는 고객사' },
          { label: '계정 미발급', value: companies.length - issuedCompanies, unit: '곳', detail: '온보딩이 남은 고객사' },
        ]}
      />

      {error && <div className="fa-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* 고객사 준비 순서: 어디서 무엇을 하면 되는지 */}
      <div className="fa-card pad fa-section">
        <div className="fa-cap"><div><h3>고객사 준비 순서</h3><p>아래 순서대로 하면 고객사가 바로 진단을 시작할 수 있습니다. 각 단계는 표의 버튼에서 합니다.</p></div></div>
        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 0, margin: 0, padding: 0, listStyle: 'none' }}>
          {STEPS.map((st, i) => (
            <li key={st.title} style={{ padding: '4px 18px 4px 0', borderLeft: i ? '1px solid var(--fa-line)' : 'none', paddingLeft: i ? 18 : 0 }}>
              <div className="fa-num" style={{ font: '500 28px/1 var(--fm-font-wordmark)', color: 'var(--fa-navy)' }}>{String(i + 1).padStart(2, '0')}</div>
              <b style={{ display: 'block', marginTop: 10, fontSize: 15 }}>{st.title}</b>
              <p className="fa-muted" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.6, wordBreak: 'keep-all' }}>{st.desc}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="fa-card pad">
        <div className="fa-cap">
          <div>
            <h3>고객사</h3>
            <p>회사 코드는 참여자가 진단에 접속할 때 입력하는 코드입니다.</p>
          </div>
        </div>
        <div className="fa-tbl">
          <table className="fa-table" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th>고객사</th>
                <th>회사 코드</th>
                <th>LLM</th>
                <th>참여자</th>
                <th>준비 상태</th>
                <th>진단 기간</th>
                <th>등록일</th>
                <th style={{ textAlign: 'right' }}>온보딩</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="fa-empty">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : companies.length === 0 ? (
                <tr><td colSpan={8} className="fa-empty">
                  등록된 고객사가 없습니다. 위의 &apos;고객사 등록&apos; 버튼으로 추가하세요.
                </td></tr>
              ) : companies.map((c) => (
                <tr key={c.id}>
                  <td className="fa-who">
                    <b>{c.name}</b>
                    <span>{c.contact_email || '담당자 이메일 없음'}</span>
                  </td>
                  <td><span className="fa-code">{c.code}</span></td>
                  <td>
                    {/* (2026-10-15) 고객사별 LLM provider — null 은 환경 기본값 */}
                    <span className={`fa-chip ${c.llm_provider ? 'tint' : 'off'}`}>{c.llm_provider || '기본'}</span>
                  </td>
                  <td className="fa-num">{c.participant_count.toLocaleString()}명</td>
                  <td>
                    {/* 준비 상태: 완료는 tint, 남은 일은 line */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <span className={`fa-chip ${adminCounts[c.id] ? 'tint' : 'line'}`}>
                        HR 계정 {adminCounts[c.id] ? `${adminCounts[c.id]}개` : '미발급'}
                      </span>
                      <span className={`fa-chip ${c.org_unit_count ? 'tint' : 'line'}`}>
                        참여 코드 {c.org_unit_count ? `${c.org_unit_count}개` : '미등록'}
                      </span>
                      <span className={`fa-chip ${c.diagnosis_start ? 'tint' : 'line'}`}>
                        진단 기간 {c.diagnosis_start ? '설정' : '미정'}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {fmtPeriod(c.diagnosis_start, c.diagnosis_end)
                      ? <span className="fa-num">{fmtPeriod(c.diagnosis_start, c.diagnosis_end)}</span>
                      : <span className="fa-chip off">미정</span>}
                  </td>
                  <td className="fa-muted" style={{ fontSize: 13 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* 1줄: 고객사 운영(들어가기·명단·개인 코드) / 2줄: 준비(계정·조직 코드·기간) */}
                    <div style={{ display: 'inline-flex', gap: 6, marginBottom: 6 }}>
                      <button type="button" onClick={() => router.push(`/master/onboarding?company=${c.id}`)} className="fa-btn sm" title="새 고객사 시작하기 화면에서 남은 준비 단계를 이어서 합니다">
                        <Play size={13} /> 이어서 진행
                      </button>
                      <button type="button" onClick={() => enterHr(c)} className="fa-btn sm primary" title="이 고객사 HR 화면을 마스터 권한으로 열어 보고 고칩니다">
                        <LogIn size={13} /> HR 화면 들어가기
                      </button>
                      <button type="button" onClick={() => setRosterFor(c)} className="fa-btn sm">
                        <Upload size={13} /> 명단 업로드
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRosterExport(c)}
                        disabled={!c.participant_count || rosterExporting === c.id}
                        title={c.participant_count ? '참여자별 개인 참여 코드 엑셀' : '명단을 먼저 올려 주세요'}
                        className="fa-btn sm"
                      >
                        {rosterExporting === c.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 개인 코드 엑셀
                      </button>
                    </div>
                    <br />
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" onClick={() => openAdminModal(c)} className="fa-btn sm">
                        <UserPlus size={13} /> HR 계정 발급
                      </button>
                      <button type="button" onClick={() => router.push(`/master/org?company=${c.id}`)} className="fa-btn sm">
                        <Network size={13} /> 참여 코드
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(c)}
                        disabled={!c.org_unit_count || exporting === c.id}
                        title={c.org_unit_count ? '고객사 전달용 참여 코드 엑셀' : '참여 코드를 먼저 발급하세요'}
                        className="fa-btn sm"
                      >
                        {exporting === c.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 코드 엑셀
                      </button>
                      <button type="button" onClick={() => openPeriodModal(c)} className="fa-btn sm ghost">
                        <CalendarDays size={13} /> 기간 설정
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 모달 1: 신규 고객사 등록 ── */}
      <Modal
        open={companyModal}
        onClose={() => setCompanyModal(false)}
        closable={!companySubmitting}
        title="고객사 등록"
        description="회사 코드는 진단 대상자가 로그인할 때 입력하는 코드와 같아야 합니다."
      >
        <form onSubmit={handleCreateCompany}>
          <div className="fa-field">
            <label htmlFor="co-name">회사명 *</label>
            <input
              id="co-name"
              required
              autoFocus
              value={companyForm.name}
              onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
              placeholder="예: 커넥트앤컴퍼니"
              className="fa-input"
            />
          </div>

          <div className="fa-field">
            <label htmlFor="co-code">회사 코드 *</label>
            <input
              id="co-code"
              required
              value={companyForm.code}
              onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })}
              placeholder="예: CONNECTN"
              className="fa-input fa-num"
            />
            <p className="hint">대상자가 진단 로그인 때 입력하는 group_code 와 맞춰 소속이 자동 연결됩니다.</p>
          </div>

          <div className="fa-field">
            <label htmlFor="co-email">담당자 이메일</label>
            <input
              id="co-email"
              type="email"
              value={companyForm.contact_email}
              onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })}
              placeholder="hr@company.com"
              className="fa-input"
            />
            <p className="hint">계정 발급 때 이 주소가 기본값으로 채워집니다.</p>
          </div>

          <div className="fa-field">
            <label htmlFor="co-llm">LLM provider</label>
            <select
              id="co-llm"
              value={companyForm.llm_provider}
              onChange={(e) => setCompanyForm({ ...companyForm, llm_provider: e.target.value })}
              className="fa-select"
            >
              <option value="">기본(서버 환경변수)</option>
              <option value="gemini">gemini</option>
              <option value="claude">claude</option>
            </select>
            <p className="hint">이 코드로 시작하는 세션에 고정됩니다(세션 중간에 바뀌지 않음). 비우면 서버 기본값.</p>
          </div>

          {companyError && <div className="fa-error" style={{ marginBottom: 16 }}>{companyError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCompanyModal(false)} disabled={companySubmitting} className="fa-btn">
              취소
            </button>
            <button type="submit" disabled={companySubmitting} className="fa-btn primary">
              {companySubmitting && <Loader2 className="animate-spin" />}
              등록하기
            </button>
          </div>
        </form>
      </Modal>

      {/* ── 모달: 참여자 명단 업로드(조직·개인 코드 자동) ── */}
      {rosterFor && (
        <RosterImport
          open={!!rosterFor}
          companyId={rosterFor.id}
          companyName={rosterFor.name}
          onClose={() => setRosterFor(null)}
          onDone={() => { setRosterFor(null); load(); }}
        />
      )}

      {/* ── 모달 3: 진단 기간 설정 ── */}
      <Modal
        open={periodModal !== null}
        onClose={() => setPeriodModal(null)}
        closable={!periodSaving}
        title="진단 기간 설정"
        description={`${periodModal?.name ?? ''}의 진단 기간입니다. HR 진단 현황의 '기간 내 추이' 기준이 됩니다.`}
      >
        <div className="flex gap-3">
          <div className="fa-field" style={{ flex: 1 }}>
            <label htmlFor="pd-start">시작일</label>
            <input id="pd-start" type="date" className="fa-input" value={periodForm.start}
              onChange={(e) => setPeriodForm({ ...periodForm, start: e.target.value })} />
          </div>
          <div className="fa-field" style={{ flex: 1 }}>
            <label htmlFor="pd-end">종료일</label>
            <input id="pd-end" type="date" className="fa-input" value={periodForm.end} min={periodForm.start || undefined}
              onChange={(e) => setPeriodForm({ ...periodForm, end: e.target.value })} />
          </div>
        </div>
        <p className="fa-muted" style={{ margin: '0 0 16px', fontSize: 12.5 }}>종료일까지 포함합니다. 최대 1년. HR 관리자도 자사 기간을 바꿀 수 있습니다.</p>
        {periodError && <div className="fa-error" style={{ marginBottom: 16 }}>{periodError}</div>}
        <div className="flex justify-between gap-2 pt-1">
          <button type="button" onClick={() => submitPeriod(true)} disabled={periodSaving || !periodModal?.diagnosis_start} className="fa-btn ghost">
            기간 지우기
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPeriodModal(null)} disabled={periodSaving} className="fa-btn">취소</button>
            <button type="button" onClick={() => submitPeriod(false)} disabled={periodSaving} className="fa-btn primary">
              {periodSaving && <Loader2 className="animate-spin" />}
              저장
            </button>
          </div>
        </div>
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
            : `${adminModal?.name ?? ''} 소속 HR 관리자 계정을 만듭니다.`
        }
      >
        {issued ? (
          // 발급 완료 — 자격증명 1회 노출
          <div className="space-y-4">
            <div className="fa-note">
              비밀번호는 암호화되어 저장되므로 <b>다시 조회할 수 없습니다.</b>{' '}
              지금 복사해 담당자에게 안전하게 전달하고, 첫 로그인 후 변경하도록 안내하세요.
            </div>

            <dl className="space-y-3" style={{ margin: 0 }}>
              <div>
                <dt className="text-xs font-semibold fa-muted">소속 고객사</dt>
                <dd style={{ margin: '2px 0 0' }}>{issued.company_name || adminModal?.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold fa-muted">이메일 (아이디)</dt>
                <dd style={{ margin: '2px 0 0' }}>{issued.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold fa-muted">임시 비밀번호</dt>
                {/* 네이비 키 박스: 한 번만 보이는 값이라 눈에 띄게 */}
                <dd
                  className="flex items-center gap-2"
                  style={{ margin: '6px 0 0', padding: '12px 14px', borderRadius: 10, background: 'var(--fa-navy)' }}
                >
                  <code className="fa-num flex-1 select-all" style={{ color: '#fff', fontSize: 18, letterSpacing: '.06em', overflowWrap: 'anywhere' }}>
                    {issued.generated_password}
                  </code>
                  <button
                    type="button"
                    onClick={copyCredentials}
                    className="fa-btn sm"
                    style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '복사됨' : '전체 복사'}
                  </button>
                </dd>
              </div>
            </dl>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setIssued(null); setAdminForm({ email: '', name: '' }); }} className="fa-btn">
                계정 추가 발급
              </button>
              <button type="button" onClick={() => setAdminModal(null)} className="fa-btn primary">
                확인
              </button>
            </div>
          </div>
        ) : (
          // 발급 폼
          <form onSubmit={handleIssueAdmin}>
            <div className="fa-note" style={{ marginBottom: 18 }}>
              소속 고객사 <b>{adminModal?.name}</b> <span className="fa-code">({adminModal?.code})</span>
            </div>

            <div className="fa-field">
              <label htmlFor="ad-email">담당자 이메일 *</label>
              <input
                id="ad-email"
                required
                type="email"
                autoFocus
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                placeholder="hr@company.com"
                className="fa-input"
              />
            </div>

            <div className="fa-field">
              <label htmlFor="ad-name">담당자 이름</label>
              <input
                id="ad-name"
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                placeholder="예: 김담당"
                className="fa-input"
              />
              <p className="hint">
                비밀번호는 서버가 안전한 난수로 자동 생성하며, 발급 직후 한 번만 표시됩니다.
                이 계정은 {adminModal?.name} 데이터만 조회할 수 있습니다.
              </p>
            </div>

            {adminError && <div className="fa-error" style={{ marginBottom: 16 }}>{adminError}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdminModal(null)} disabled={adminSubmitting} className="fa-btn">
                취소
              </button>
              <button type="submit" disabled={adminSubmitting} className="fa-btn primary">
                {adminSubmitting && <Loader2 className="animate-spin" />}
                계정 발급
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AdminLayout>
  );
}
