"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Copy, Download, FileSpreadsheet, Loader2, LogIn, Upload } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '../../../components/layouts/AdminLayout';
import {
  fetchCompanies, createCompany, importRoster, downloadRosterTemplate, downloadRosterExcel,
  downloadOrgCodesExcel, fetchOrgUnits, createAdminUser, fetchAdminUsers, fetchPeriod, savePeriod,
  startActing, IssuedAdmin, OrgTree, RosterResult, DiagnosisPeriod,
} from '@/lib/adminApi';
import './onboarding.css';

/**
 * 마스터 · 새 고객사 시작하기.
 * 한 페이지에서 위에서 아래로 따라가면 고객사 준비가 끝난다.
 *   ① 회사 정보 → ② 명단 업로드(조직·개인 코드 자동) → ③ 조직도·코드 확인
 *   → ④ HR 계정 발급 → ⑤ 진단 기간 → ⑥ 전달 자료(엑셀·안내문)
 * ?company=<id> 로 들어오면 그 고객사를 불러와 끝난 단계를 표시한다(기존 고객사 이어서 진행).
 * 완료 표시는 실제 데이터로만 정한다. ⑥ 은 이번 화면에서 내려받기를 한 번이라도 했을 때.
 */

const PARTICIPANT_URL = 'https://fm.connectn.co.kr';
const HR_LOGIN_URL = 'https://fm.connectn.co.kr/admin/login';

interface CompanyRow { id: string; name: string; code: string; contact_email?: string | null; participant_count?: number; org_prefix?: string | null }
interface AdminRow { id: string; email: string; name: string | null; company_id: string | null }

const STEPS = [
  { no: '01', title: '회사 정보' },
  { no: '02', title: '명단 업로드' },
  { no: '03', title: '조직도 · 코드 확인' },
  { no: '04', title: 'HR 계정 발급' },
  { no: '05', title: '진단 기간' },
  { no: '06', title: '전달 자료' },
];

/** axios 오류에서 서버 안내문(detail)을 꺼낸다. blob 응답이면 글자로 풀어 읽는다 */
const errDetail = async (e: unknown, fallback: string): Promise<string> => {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try { return (JSON.parse(await data.text()) as { detail?: string }).detail || fallback; } catch { return fallback; }
  }
  const d = (data as { detail?: unknown } | undefined)?.detail;
  return typeof d === 'string' ? d : fallback;
};

const fmtDate = (d: string | null | undefined) => (d ? d.replace(/-/g, '.') : '');

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company') || '';

  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [period, setPeriod] = useState<DiagnosisPeriod | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  // 펼친 단계(완료된 단계도 '수정'으로 다시 펼칠 수 있다)
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [delivered, setDelivered] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [list, t, ad, p] = await Promise.all([
        fetchCompanies() as Promise<CompanyRow[]>,
        fetchOrgUnits(companyId),
        fetchAdminUsers(companyId) as Promise<AdminRow[]>,
        fetchPeriod(companyId),
      ]);
      setCompany(list.find((c) => c.id === companyId) || null);
      setTree(t);
      setAdmins((ad || []).filter((a) => a.company_id === companyId));
      setPeriod(p);
    } catch (e: unknown) {
      setLoadError(await errDetail(e, '고객사 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // 등록 인원: 조직 트리 합계(본부 아래 전체 + 미분류)
  const registered = useMemo(() => {
    if (!tree) return company?.participant_count || 0;
    return tree.divisions.reduce((a, d) => a + d.registered_total, 0) + (tree.unassigned?.registered || 0);
  }, [tree, company]);
  const unitCount = useMemo(() => (tree ? tree.divisions.reduce(
    (a, d) => a + 1 + d.teams.length + d.offices.reduce((b, o) => b + 1 + o.teams.length, 0), 0) : 0), [tree]);

  const done = [
    !!company,
    registered > 0,
    unitCount > 0,
    admins.length > 0,
    !!(period?.diagnosis_start && period?.diagnosis_end),
    delivered,
  ];
  const firstOpen = done.findIndex((d) => !d);
  const current = openStep ?? (firstOpen === -1 ? 5 : firstOpen);

  const statusOf = (i: number) => (done[i] ? '완료' : i === current ? '진행 중' : '대기');

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow="마스터"
        title="새 고객사 시작하기"
        desc="회사 정보부터 명단 업로드, HR 계정, 진단 기간, 전달 자료까지 이 화면에서 순서대로 준비합니다."
        actions={company ? <span className="fa-chip tint">{company.name} · {company.code}</span> : undefined}
      />

      {loadError && <div className="fa-error" style={{ marginBottom: 16 }}>{loadError}</div>}

      <div className="fa-ob">
        {/* 왼쪽 단계표 */}
        <ol className="fa-ob-steps" aria-label="진행 단계">
          {STEPS.map((s, i) => (
            <li key={s.no} className={`${done[i] ? 'done' : ''} ${i === current ? 'on' : ''}`}>
              <button type="button" onClick={() => company || i === 0 ? setOpenStep(i) : undefined} disabled={!company && i > 0}>
                <span className="no">{done[i] ? <Check size={14} /> : s.no}</span>
                <span className="tt">
                  <b>{s.title}</b>
                  <small>{statusOf(i)}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {/* 오른쪽 단계 카드 */}
        <div className="fa-ob-cards">
          {loading && !company && <div className="fa-card pad fa-muted"><Loader2 className="inline h-4 w-4 animate-spin" /> 불러오는 중…</div>}

          <StepCard i={0} title="회사 정보" done={done[0]} open={current === 0} onOpen={() => setOpenStep(0)}
            summary={company ? `${company.name} · 회사 코드 ${company.code}${company.contact_email ? ` · ${company.contact_email}` : ''}` : ''}>
            {company ? (
              <p className="fa-muted" style={{ margin: 0 }}>
                이미 등록된 고객사입니다. 이름·담당자 이메일은 고객사 관리 화면에서 바꿀 수 있습니다.
              </p>
            ) : (
              <CompanyForm onCreated={(id) => { setOpenStep(null); router.replace(`/master/onboarding?company=${id}`); }} />
            )}
          </StepCard>

          <StepCard i={1} title="명단 업로드" done={done[1]} open={current === 1} disabled={!company} onOpen={() => setOpenStep(1)}
            summary={`${registered}명 등록 · 조직과 개인 참여 코드가 만들어졌습니다`} reopenLabel="다시 올리기">
            {company && <RosterStep companyId={company.id} onSaved={() => { setOpenStep(null); load(); }} />}
          </StepCard>

          <StepCard i={2} title="조직도 · 코드 확인" done={done[2]} open={current === 2} disabled={!company} onOpen={() => setOpenStep(2)}
            summary={`조직 ${unitCount}개 · 접두어 ${tree?.company.org_prefix || '-'}`}>
            {company && <OrgStep tree={tree} onFix={() => router.push(`/master/org?company=${company.id}`)} />}
          </StepCard>

          <StepCard i={3} title="HR 계정 발급" done={done[3]} open={current === 3} disabled={!company} onOpen={() => setOpenStep(3)}
            summary={`HR 계정 ${admins.length}개 · ${admins.map((a) => a.email).join(', ')}`} reopenLabel="추가 발급">
            {company && <HrStep companyId={company.id} admins={admins} onIssued={load} />}
          </StepCard>

          <StepCard i={4} title="진단 기간" done={done[4]} open={current === 4} disabled={!company} onOpen={() => setOpenStep(4)}
            summary={`${fmtDate(period?.diagnosis_start)} ~ ${fmtDate(period?.diagnosis_end)}`}>
            {company && <PeriodStep companyId={company.id} period={period} onSaved={(p) => { setPeriod(p); setOpenStep(null); }} />}
          </StepCard>

          <StepCard i={5} title="전달 자료" done={done[5]} open={current === 5} disabled={!company} onOpen={() => setOpenStep(5)}
            summary="전달용 엑셀을 내려받았습니다" reopenLabel="다시 보기">
            {company && (
              <DeliverStep
                company={company}
                period={period}
                hasPeople={registered > 0}
                hasUnits={unitCount > 0}
                onDelivered={() => setDelivered(true)}
                onEnterHr={() => { startActing(company.id, company.name); router.push('/admin/dashboard'); }}
              />
            )}
          </StepCard>
        </div>
      </div>
    </AdminLayout>
  );
}

/** 단계 카드: 완료되면 요약 한 줄로 접히고, '수정'으로 다시 펼친다 */
function StepCard({
  i, title, done, open, disabled, summary, reopenLabel = '수정', onOpen, children,
}: {
  i: number; title: string; done: boolean; open: boolean; disabled?: boolean; summary: string;
  reopenLabel?: string; onOpen: () => void; children: React.ReactNode;
}) {
  const expanded = open && !disabled;
  return (
    <section className={`fa-card fa-ob-card${expanded ? ' on' : ''}${done ? ' done' : ''}${disabled ? ' off' : ''}`}>
      <header>
        <span className="no">{STEPS[i].no}</span>
        <h3>{title}</h3>
        {done && <span className="fa-chip tint"><Check size={12} /> 완료</span>}
        {!expanded && !disabled && (
          <button type="button" className="fa-btn sm ghost" onClick={onOpen}>{done ? reopenLabel : '열기'}</button>
        )}
      </header>
      {!expanded && done && summary && <p className="sum">{summary}</p>}
      {disabled && <p className="sum">회사 정보를 먼저 등록해 주세요.</p>}
      {expanded && <div className="body">{children}</div>}
    </section>
  );
}

function CompanyForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !code.trim()) { setError('고객사 이름과 회사 코드를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      const res = await createCompany({ name: name.trim(), code: code.trim(), contact_email: email.trim() || null });
      onCreated(res.id);
    } catch (err: unknown) {
      setError(await errDetail(err, '고객사를 등록하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="fa-ob-form">
      <div className="fa-field">
        <label htmlFor="ob-name">고객사 이름</label>
        <input id="ob-name" className="fa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 하이케어솔루션" />
      </div>
      <div className="fa-field">
        <label htmlFor="ob-code">회사 코드</label>
        <input id="ob-code" className="fa-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="예: HICARE" />
        <div className="hint">영문·숫자. 참여 코드 맨 앞 글자는 이 코드의 영문에서 자동으로 정해집니다(예: HICARE → H).</div>
      </div>
      <div className="fa-field">
        <label htmlFor="ob-email">담당자 이메일 (선택)</label>
        <input id="ob-email" className="fa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@company.com" />
      </div>
      {error && <div className="fa-error" style={{ marginBottom: 12 }}>{error}</div>}
      <button type="submit" className="fa-btn primary" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null} 고객사 등록하고 다음으로
      </button>
    </form>
  );
}

function RosterStep({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError('');
    setBusy(true);
    try {
      setPreview(await importRoster(companyId, f, true));
    } catch (err: unknown) {
      setError(await errDetail(err, '명단을 읽지 못했습니다.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const res = await importRoster(companyId, file, false);
      if (res.saved) onSaved();
      else setPreview(res);
    } catch (err: unknown) {
      setError(await errDetail(err, '명단을 등록하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = !!preview && preview.errors.length > 0;

  return (
    <div>
      <p className="fa-ob-lead">
        고객사 명단 엑셀(<b>이름, 이메일</b> 필수 / 본부·실·팀·사번 선택)을 올리면 본부·실·팀 이름대로 조직이 자동으로 만들어지고,
        참여자마다 개인 참여 코드가 생깁니다. 다시 올리면 같은 이메일은 갱신됩니다.
      </p>
      <div className="fa-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="fa-btn" onClick={() => downloadRosterTemplate()}>
          <FileSpreadsheet /> 양식 내려받기
        </button>
        <button type="button" className="fa-btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy && !preview ? <Loader2 className="animate-spin" /> : <Upload />} 엑셀 파일 업로드
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
        {file && <span className="fa-muted" style={{ fontSize: 13 }}>{file.name}</span>}
      </div>

      {error && <div className="fa-error" style={{ marginBottom: 12 }}>{error}</div>}

      {preview && (
        <div className="fa-ob-preview">
          <div className="fa-actions" style={{ marginBottom: 12 }}>
            <span className="fa-chip">전체 {preview.rows}행</span>
            <span className="fa-chip tint">신규 {preview.new}명</span>
            <span className="fa-chip">갱신 {preview.updated}명</span>
            <span className="fa-chip line">새 조직 {preview.org_units_created.length}개</span>
          </div>
          {preview.org_units_created.length > 0 && (
            <div className="codes">
              {preview.org_units_created.map((u) => (
                <span key={u.code} className="fa-chip"><b className="fa-code">{u.code}</b> {u.name}</span>
              ))}
            </div>
          )}
          {hasErrors ? (
            <>
              <div className="fa-error" style={{ margin: '12px 0' }}>오류가 있어 저장하지 않았습니다. 오류를 고친 파일을 다시 올려 주세요.</div>
              <div className="fa-tbl"><table className="fa-table">
                <thead><tr><th>행</th><th>사유</th></tr></thead>
                <tbody>{preview.errors.map((e, k) => <tr key={k}><td className="fa-num">{e.row}</td><td>{e.reason}</td></tr>)}</tbody>
              </table></div>
            </>
          ) : (
            <>
              <div className="fa-tbl" style={{ marginTop: 12 }}><table className="fa-table">
                <thead><tr><th>행</th><th>이름</th><th>이메일</th><th>소속</th><th>구분</th></tr></thead>
                <tbody>
                  {preview.preview.slice(0, 50).map((p) => (
                    <tr key={p.row}>
                      <td className="fa-num">{p.row}</td><td>{p.name}</td><td className="fa-muted">{p.email}</td>
                      <td>{p.org_path}{p.org_code && <span className="fa-code" style={{ marginLeft: 6 }}>{p.org_code}</span>}</td>
                      <td><span className={`fa-chip ${p.action === '신규' ? 'tint' : ''}`}>{p.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {preview.preview.length > 50 && <p className="fa-muted" style={{ fontSize: 12.5 }}>앞 50명만 보여 드립니다.</p>}
              <button type="button" className="fa-btn primary" style={{ marginTop: 14 }} onClick={confirm} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} 등록 확정({preview.new + preview.updated}명)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrgStep({ tree, onFix }: { tree: OrgTree | null; onFix: () => void }) {
  if (!tree || tree.divisions.length === 0) {
    return (
      <div>
        <div className="fa-note">아직 조직이 없습니다. 명단에 본부·실·팀을 적어 올리면 자동으로 만들어집니다.</div>
        <button type="button" className="fa-btn" style={{ marginTop: 12 }} onClick={onFix}>조직 코드 화면에서 직접 만들기</button>
      </div>
    );
  }
  return (
    <div>
      <p className="fa-ob-lead">
        접두어 <b className="fa-code">{tree.company.org_prefix || '-'}</b> · 참여자는 개인 참여 코드(예: 팀 코드 + 4자리)로 들어오고,
        코드에 따라 본부·실·팀이 자동으로 정해집니다.
      </p>
      <div className="fa-ob-tree">
        {tree.divisions.map((d) => (
          <div key={d.id} className="div">
            <div className="row lv1"><span className="fa-code">{d.code}</span><b>{d.name}</b><span className="n">{d.registered_total}명</span></div>
            {d.offices.map((o) => (
              <div key={o.id} className="off">
                <div className="row lv2"><span className="fa-code">{o.code}</span><b>{o.name}</b><span className="n">{o.registered_total}명</span></div>
                {o.teams.map((t) => (
                  <div key={t.id} className="row lv3"><span className="fa-code">{t.code}</span>{t.name}<span className="n">{t.registered}명</span></div>
                ))}
              </div>
            ))}
            {d.teams.map((t) => (
              <div key={t.id} className="row lv3 direct"><span className="fa-code">{t.code}</span>{t.name}<span className="n">{t.registered}명</span></div>
            ))}
          </div>
        ))}
      </div>
      {tree.unassigned?.registered > 0 && (
        <p className="fa-muted" style={{ fontSize: 13 }}>본부 없이 등록된 인원 {tree.unassigned.registered}명(미분류)</p>
      )}
      <button type="button" className="fa-btn" style={{ marginTop: 12 }} onClick={onFix}>조직 코드 화면에서 고치기</button>
    </div>
  );
}

function HrStep({ companyId, admins, onIssued }: { companyId: string; admins: AdminRow[]; onIssued: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<IssuedAdmin | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('담당자 이메일을 입력해 주세요.'); return; }
    setBusy(true);
    try {
      const res = await createAdminUser({ email: email.trim(), name: name.trim() || undefined, company_id: companyId, role: 'client_admin' });
      setIssued(res);
      setName('');
      setEmail('');
      onIssued();
    } catch (err: unknown) {
      setError(await errDetail(err, '계정을 발급하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    await navigator.clipboard.writeText(`접속 주소: ${HR_LOGIN_URL}\n이메일: ${issued.email}\n임시 비밀번호: ${issued.generated_password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <p className="fa-ob-lead">고객사 HR 담당자가 <b>{HR_LOGIN_URL}</b> 에서 로그인할 계정입니다. 자기 회사 데이터만 봅니다.</p>
      {admins.length > 0 && (
        <div className="fa-actions" style={{ marginBottom: 14 }}>
          {admins.map((a) => <span key={a.id} className="fa-chip tint">{a.name || '담당자'} · {a.email}</span>)}
        </div>
      )}
      {issued && (
        <div className="fa-ob-key">
          <div>
            <small>임시 비밀번호 · {issued.email}</small>
            <b>{issued.generated_password || '(직접 정한 비밀번호)'}</b>
          </div>
          <button type="button" className="fa-btn sm" onClick={copy}>{copied ? <Check /> : <Copy />} 전체 복사</button>
          <p>이 비밀번호는 지금 한 번만 보입니다. 접속 주소와 함께 담당자에게 전달하세요.</p>
        </div>
      )}
      <form onSubmit={submit} className="fa-ob-form inline">
        <div className="fa-field"><label htmlFor="ob-hr-name">이름</label>
          <input id="ob-hr-name" className="fa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        <div className="fa-field"><label htmlFor="ob-hr-email">이메일</label>
          <input id="ob-hr-email" className="fa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@company.com" /></div>
        <button type="submit" className="fa-btn primary" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} 계정 발급</button>
      </form>
      {error && <div className="fa-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function PeriodStep({ companyId, period, onSaved }: { companyId: string; period: DiagnosisPeriod | null; onSaved: (p: DiagnosisPeriod) => void }) {
  const [start, setStart] = useState(period?.diagnosis_start || '');
  const [end, setEnd] = useState(period?.diagnosis_end || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!start || !end) { setError('시작일과 종료일을 함께 정해 주세요.'); return; }
    if (start > end) { setError('종료일이 시작일보다 빠릅니다.'); return; }
    setBusy(true);
    try {
      onSaved(await savePeriod(companyId, start, end));
    } catch (err: unknown) {
      setError(await errDetail(err, '진단 기간을 저장하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="fa-ob-lead">HR 진단 현황의 &lsquo;기간 내 추이&rsquo;와 전달 엑셀의 안내에 쓰입니다. 고객사 HR도 나중에 바꿀 수 있습니다.</p>
      <div className="fa-ob-form inline">
        <div className="fa-field"><label htmlFor="ob-start">시작일</label>
          <input id="ob-start" type="date" className="fa-input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="fa-field"><label htmlFor="ob-end">종료일</label>
          <input id="ob-end" type="date" className="fa-input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <button type="button" className="fa-btn primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} 기간 저장</button>
      </div>
      {error && <div className="fa-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function DeliverStep({
  company, period, hasPeople, hasUnits, onDelivered, onEnterHr,
}: {
  company: CompanyRow; period: DiagnosisPeriod | null; hasPeople: boolean; hasUnits: boolean;
  onDelivered: () => void; onEnterHr: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'roster' | 'org'>('');
  const [copied, setCopied] = useState(false);

  const guide = [
    `[${company.name}] 리더십 진단 안내`,
    `접속 주소: ${PARTICIPANT_URL}`,
    '로그인 화면에 이름·이메일을 넣고, 그룹 코드 칸에 본인의 개인 참여 코드를 입력하세요.',
    '개인 참여 코드는 첨부한 엑셀에 있습니다. 이메일이 명단과 같아야 들어갈 수 있습니다.',
    period?.diagnosis_start && period?.diagnosis_end
      ? `진단 기간: ${fmtDate(period.diagnosis_start)} ~ ${fmtDate(period.diagnosis_end)}` : '',
    `HR 관리자 화면: ${HR_LOGIN_URL}`,
  ].filter(Boolean).join('\n');

  const run = async (kind: 'roster' | 'org') => {
    setError('');
    setBusy(kind);
    try {
      if (kind === 'roster') await downloadRosterExcel(company.id);
      else await downloadOrgCodesExcel(company.id);
      onDelivered();
    } catch (err: unknown) {
      setError(await errDetail(err, '엑셀을 내려받지 못했습니다.'));
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(guide);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <p className="fa-ob-lead">고객사 HR에게 보낼 자료입니다. 개인 코드 엑셀을 참여자에게 나눠 주면 진단 사이트에서 바로 쓸 수 있습니다.</p>
      <div className="fa-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="fa-btn primary" disabled={!hasPeople || busy !== ''} onClick={() => run('roster')}
          title={hasPeople ? undefined : '명단을 먼저 올려 주세요'}>
          {busy === 'roster' ? <Loader2 className="animate-spin" /> : <Download />} 개인 코드 엑셀(참여자 전달용)
        </button>
        <button type="button" className="fa-btn" disabled={!hasUnits || busy !== ''} onClick={() => run('org')}
          title={hasUnits ? undefined : '조직이 아직 없습니다'}>
          {busy === 'org' ? <Loader2 className="animate-spin" /> : <Download />} 조직 코드 엑셀
        </button>
      </div>
      {error && <div className="fa-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="fa-ob-guide">
        <pre>{guide}</pre>
        <button type="button" className="fa-btn sm" onClick={copy}>{copied ? <Check /> : <Copy />} 안내문 복사</button>
      </div>
      <button type="button" className="fa-btn primary" style={{ marginTop: 16 }} onClick={onEnterHr}>
        <LogIn /> HR 화면 들어가서 확인
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="fa-root fa-loading">불러오는 중…</div>}>
      <OnboardingInner />
    </Suspense>
  );
}
