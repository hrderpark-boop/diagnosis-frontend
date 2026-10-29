"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import ScopeFilter, { useScope } from '@/components/admin/ScopeFilter';
import { Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import {
  fetchOrgUnits, updateCompany, createOrgUnit, bulkCreateOrgUnits,
  updateOrgUnit, deleteOrgUnit, downloadOrgCodesExcel, OrgTree, OrgDivision, OrgOffice, OrgTeam,
  fetchAdminUsers, fetchPeriod, fetchMe, fetchParticipants,
} from '@/lib/adminApi';
import { buildInviteMail, InviteMail } from '@/lib/inviteMail';
import InviteMailModal from '@/components/admin/InviteMailModal';
import './org.css';

/**
 * 마스터 · 조직 코드.
 * 본부·실·팀 이름만 넣으면 참여 코드(AS1 · ASM1 형식)가 자동으로 정해진다. 실은 선택 단계다.
 *   접두어·본부 코드·실 코드는 비우면 서버가 비어 있는 다음 값을 고른다(직접 정해도 된다).
 * 참여자가 로그인 화면의 그룹 코드 칸에 이 코드를 넣으면 회사와 소속이 함께 정해진다.
 * 고객사 전달은 [코드 엑셀 다운로드](배포용 시트 + 전체 코드 시트).
 * 코드 생성·검증은 백엔드(services/org_codes.py)가 하고, 여기서는 미리보기만 보여 준다.
 */


const LOGIN_URL = 'https://fm.connectn.co.kr';
const HR_LOGIN_URL = 'https://fm.connectn.co.kr/admin/login';

/** axios 오류에서 서버 안내문(detail)을 꺼낸다 */
const errDetail = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** 엑셀 붙여넣기 2열이 코드처럼 보이는지(영문 대문자 1~2자). 아니면 이름으로 본다 */
const looksLikeCode = (v?: string) => !!v && /^[A-Za-z]{1,2}$/.test(v.trim());

type AnyUnit = OrgDivision | OrgOffice | OrgTeam;

type ModalState =
  | { kind: 'division' }
  | { kind: 'office'; division: OrgDivision }
  // office 를 주면 그 실에 바로 추가(상위 선택 고정)
  | { kind: 'team'; division: OrgDivision; office?: OrgOffice }
  | { kind: 'rename'; unit: AnyUnit }
  | { kind: 'bulk' }
  | null;

/** 다음 팀 번호(같은 상위 아래 최댓값 + 1). 서버 규칙과 같다(빈 번호를 메우지 않음). */
const nextTeamNo = (teams: OrgTeam[]) => teams.reduce((m, t) => Math.max(m, Number(t.short_code) || 0), 0) + 1;

function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fa-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fa-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h3>{title}</h3><button type="button" className="fa-btn ghost sm" onClick={onClose}>닫기</button></div>
        <div className="mb">{children}</div>
        <div className="mf">{footer}</div>
      </div>
    </div>
  );
}

function OrgPage() {
  // 조회 범위: [고객사] › [본부] › [실] › [팀]. 고른 본부·실·팀으로 아래 트리를 좁혀 본다
  const scope = useScope({ allowAllCompanies: false });
  const companyId = scope.companyId || '';

  const [tree, setTree] = useState<OrgTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState('');

  // 접두어 입력
  const [prefixInput, setPrefixInput] = useState('');
  const [prefixError, setPrefixError] = useState('');
  const [prefixSaving, setPrefixSaving] = useState(false);

  // 모달 공용 입력
  const [modal, setModal] = useState<ModalState>(null);
  const [fName, setFName] = useState('');
  const [fCode, setFCode] = useState('');
  const [fNumber, setFNumber] = useState('');
  // 팀 추가 모달의 상위: '' = 본부 직속, 그 외 = 실 id
  const [fParent, setFParent] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: { code: string; name: string; level: string }[]; skipped: number } | null>(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2200); };

  const loadTree = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setPageError('');
    try {
      setTree(await fetchOrgUnits(companyId));
    } catch (e: unknown) {
      setTree(null);
      setPageError(errDetail(e, '조직 코드를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadTree(); }, [loadTree]);
  // 조직을 만들거나 지운 뒤: 이 화면 트리 + 선택 줄의 본부·실·팀 목록을 함께 다시
  const reloadAll = useCallback(async () => {
    scope.reloadTree();
    await loadTree();
  }, [scope, loadTree]);

  const prefix = tree?.company.org_prefix || '';
  const divisions = useMemo(() => tree?.divisions ?? [], [tree]);
  // 선택 줄에서 고른 본부·실·팀만 보이도록 트리를 좁힌다(버튼 활성 판단은 전체 divisions 기준 그대로)
  const shownDivisions = useMemo(() => {
    const { divisionId, officeId, teamId } = scope;
    if (!divisionId) return divisions;
    return divisions.filter((d) => d.id === divisionId).map((d) => {
      const offices = (d.offices ?? [])
        .filter((o) => !officeId || o.id === officeId)
        .map((o) => ({ ...o, teams: o.teams.filter((t) => !teamId || t.id === teamId) }))
        .filter((o) => !teamId || o.teams.length > 0);
      const teams = officeId ? [] : d.teams.filter((t) => !teamId || t.id === teamId);
      return { ...d, offices, teams };
    });
  }, [divisions, scope]);

  // 코드 규칙 예시: 실제 첫 본부·첫 팀이 있으면 그 값으로
  const example = useMemo(() => {
    const d = divisions[0];
    const t = d?.teams[0] ?? d?.offices?.[0]?.teams[0];
    return {
      p: prefix || 'A',
      d: d?.short_code || 'S',
      n: t?.short_code || '1',
      dName: d?.name || '본부',
      tName: t?.name || '팀',
    };
  }, [divisions, prefix]);

  // 실이 있는 형식 예시: 실이 있는 첫 본부의 첫 실·첫 팀. 없으면 기본값(M)
  const officeExample = useMemo(() => {
    const d = divisions.find((x) => (x.offices?.length ?? 0) > 0);
    const o = d?.offices[0];
    const t = o?.teams[0];
    return {
      real: Boolean(o),
      d: d?.short_code || example.d,
      dName: d?.name || example.dName,
      o: o?.short_code || 'M',
      oName: o?.name || '실',
      n: t?.short_code || '1',
      tName: t?.name || '팀',
    };
  }, [divisions, example]);

  const openModal = (m: ModalState) => {
    setModal(m);
    setModalError('');
    setBulkResult(null);
    setFName(m && m.kind === 'rename' ? m.unit.name : '');
    setFCode('');
    setFNumber('');
    setFParent(m?.kind === 'team' && m.office ? m.office.id : '');
    if (m?.kind === 'bulk') setBulkText('');
  };
  const closeModal = () => { if (!busy) setModal(null); };

  const savePrefix = async () => {
    setPrefixError('');
    if (!/^[A-Z]{1,3}$/.test(prefixInput)) { setPrefixError('영문 1~3자로 입력해 주세요.'); return; }
    setPrefixSaving(true);
    try {
      await updateCompany(companyId, { org_prefix: prefixInput });
      setPrefixInput('');
      await reloadAll();
      flash('접두어를 정했습니다.');
    } catch (e: unknown) {
      setPrefixError(errDetail(e, '접두어를 저장하지 못했습니다.'));
    } finally {
      setPrefixSaving(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setModalError('');
    try {
      await fn();
      setModal(null);
      await reloadAll();
      flash(done);
    } catch (e: unknown) {
      setModalError(errDetail(e, '처리하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  // 코드 칸은 선택: 비우면 서버가 비어 있는 다음 영문 코드를 고른다(접두어가 없으면 접두어도 자동)
  const submitDivision = () => {
    if (!fName.trim()) { setModalError('본부 이름을 입력해 주세요.'); return; }
    if (fCode && !/^[A-Z]{1,2}$/.test(fCode)) { setModalError('본부 코드는 영문 1~2자입니다. 비우면 자동으로 정해집니다.'); return; }
    run(() => createOrgUnit(companyId, { level: 'division', name: fName.trim(), short_code: fCode || undefined }), '본부를 추가했습니다.');
  };

  const submitOffice = (division: OrgDivision) => {
    if (!fName.trim()) { setModalError('실 이름을 입력해 주세요.'); return; }
    if (fCode && !/^[A-Z]{1,2}$/.test(fCode)) { setModalError('실 코드는 영문 1~2자입니다. 비우면 자동으로 정해집니다.'); return; }
    run(() => createOrgUnit(companyId, { level: 'office', name: fName.trim(), short_code: fCode || undefined, parent_id: division.id }), '실을 추가했습니다.');
  };

  // 팀 추가 모달의 상위(본부 직속 또는 고른 실)
  const teamParent = (division: OrgDivision): OrgDivision | OrgOffice =>
    (fParent && division.offices?.find((o) => o.id === fParent)) || division;

  const submitTeam = (division: OrgDivision) => {
    if (!fName.trim()) { setModalError('팀 이름을 입력해 주세요.'); return; }
    const n = fNumber.trim() ? Number(fNumber) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 99)) { setModalError('팀 번호는 1~99 사이입니다.'); return; }
    const parent = teamParent(division);
    run(() => createOrgUnit(companyId, { level: 'team', name: fName.trim(), parent_id: parent.id, number: n }), '팀을 추가했습니다.');
  };

  const submitRename = (unit: AnyUnit) => {
    if (!fName.trim()) { setModalError('이름을 입력해 주세요.'); return; }
    run(() => updateOrgUnit(unit.id, { name: fName.trim() }), '이름을 바꿨습니다.');
  };

  // 엑셀 붙여넣기 파싱: 탭 또는 쉼표 구분. 머리글 행은 건너뛴다. 행마다 형식을 알아본다.
  //   이름만(코드 자동): 본부 · 팀  /  본부 · 실 · 팀
  //   코드 포함(예전 형식): 본부 · 본부 코드 · 팀  /  본부 · 본부 코드 · 실 · 실 코드 · 팀
  //   2열이 영문 1~2자면 코드로 본다. 코드는 있을 때만 보낸다.
  type BulkRow = { division: string; division_code?: string; office?: string; office_code?: string; team?: string };
  const bulkRows = useMemo<BulkRow[]>(() => bulkText
    .split(/\r?\n/)
    .map((line) => line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim()))
    .filter((cols) => cols.length >= 1 && cols[0])
    .filter((cols) => !/^본부$|division/i.test(cols[0]) && !/본부\s*코드/.test(cols[1] || ''))
    .map((cols): BulkRow => {
      if (looksLikeCode(cols[1])) {
        // 코드 포함 형식
        if (cols.length >= 4 && cols[2] && looksLikeCode(cols[3])) {
          return { division: cols[0], division_code: cols[1].toUpperCase(), office: cols[2], office_code: cols[3].toUpperCase(), team: cols[4] || undefined };
        }
        return { division: cols[0], division_code: cols[1].toUpperCase(), team: cols[2] || undefined };
      }
      // 이름만 형식: 2열이면 본부·팀, 3열이면 본부·실·팀
      if (cols.length >= 3 && cols[2]) return { division: cols[0], office: cols[1] || undefined, team: cols[2] };
      return { division: cols[0], team: cols[1] || undefined };
    }), [bulkText]);

  const submitBulk = async () => {
    if (!bulkRows.length) { setModalError('붙여넣은 행이 없습니다.'); return; }
    setBusy(true);
    setModalError('');
    try {
      // 코드를 비운 행은 빈 문자열로 보낸다(서버가 같은 이름을 찾거나 자동 코드로 만든다)
      const res = await bulkCreateOrgUnits(companyId, bulkRows.map((r) => ({ ...r, division_code: r.division_code ?? '' })));
      setBulkResult({ created: res.created, skipped: res.skipped });
      await reloadAll();
    } catch (e: unknown) {
      setModalError(errDetail(e, '일괄 등록하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  // 고객사 전달용 참여 코드 엑셀. blob 응답이라 오류 본문도 blob → 글자로 풀어 서버 안내문을 보여 준다
  const exportExcel = async () => {
    setExporting(true);
    setPageError('');
    try {
      await downloadOrgCodesExcel(companyId);
    } catch (e: unknown) {
      let msg = errDetail(e, '');
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (!msg && data instanceof Blob) {
        try { msg = (JSON.parse(await data.text()) as { detail?: string }).detail || ''; } catch { /* 무시 */ }
      }
      setPageError(msg || '참여 코드 엑셀을 내려받지 못했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const toggleActive = async (unit: AnyUnit) => {
    try {
      await updateOrgUnit(unit.id, { is_active: !unit.is_active });
      await reloadAll();
      flash(unit.is_active ? `${unit.code} 사용을 멈췄습니다.` : `${unit.code}를 다시 씁니다.`);
    } catch (e: unknown) {
      setPageError(errDetail(e, '상태를 바꾸지 못했습니다.'));
    }
  };

  const remove = async (unit: AnyUnit) => {
    if (!window.confirm(`${unit.code} ${unit.name}을(를) 삭제할까요?`)) return;
    try {
      await deleteOrgUnit(unit.id);
      await reloadAll();
      flash(`${unit.code}를 삭제했습니다.`);
    } catch (e: unknown) {
      setPageError(errDetail(e, '삭제하지 못했습니다.'));
    }
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      setPageError('클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.');
    }
  };

  // 참여 안내 메일: HR 계정(비밀번호는 저장돼 있지 않아 '별도 전달')·진단 기간·발신자·개인 코드 여부를 모아 공식 메일로
  const [mail, setMail] = useState<InviteMail | null>(null);
  const [mailPersonal, setMailPersonal] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const openMail = async () => {
    if (!tree) return;
    setMailBusy(true);
    try {
      const [admins, period, me, ppl] = await Promise.all([
        fetchAdminUsers(companyId).catch(() => []),
        fetchPeriod(companyId).catch(() => null),
        fetchMe().catch(() => null),
        fetchParticipants({ company_id: companyId, page_size: 200 }).catch(() => null),
      ]);
      const hrAccounts = (Array.isArray(admins) ? admins : [])
        .filter((a: { role?: string; company_id?: string | null }) => a.role === 'client_admin' && a.company_id === companyId)
        .map((a: { name?: string | null; email: string }) => ({ name: a.name ?? null, email: a.email }));
      const personal = !!ppl?.items?.some((p: { access_code?: string | null }) => !!p.access_code);
      setMailPersonal(personal);
      setMail(buildInviteMail({
        companyName: tree.company.name,
        participantUrl: LOGIN_URL,
        hrLoginUrl: HR_LOGIN_URL,
        period: period ? { start: period.diagnosis_start, end: period.diagnosis_end } : null,
        hrAccounts,
        tree,
        sender: me ? { name: me.name, email: me.email } : null,
        hasPersonalCodes: personal,
      }));
    } finally {
      setMailBusy(false);
    }
  };


  // 팀 행(본부 직속·실 소속 공용)
  const renderTeam = (t: OrgTeam) => (
    <div key={t.id} className={`fa-org-team${t.is_active ? '' : ' off'}`}>
      <span className="fa-code">{t.code}</span>
      <span><b>{t.name}</b>{!t.is_active && <span className="fa-chip off" style={{ marginLeft: 8 }}>사용 중지</span>}</span>
      <span className="reg fa-num">{t.registered}명 등록</span>
      <div className="p"><div className="fa-bar"><i style={{ width: `${pct(t.completed, t.registered)}%` }} /></div><span className="fa-num">{pct(t.completed, t.registered)}%</span></div>
      <div className="acts">
        <button type="button" className="fa-btn sm" onClick={() => copy(t.code, `${t.code} 복사했습니다.`)}>코드 복사</button>
        <button type="button" className="fa-btn sm ghost" onClick={() => openModal({ kind: 'rename', unit: t })}>이름</button>
        <button type="button" className="fa-btn sm ghost" onClick={() => toggleActive(t)}>{t.is_active ? '사용 중지' : '다시 사용'}</button>
        <button type="button" className="fa-btn sm ghost danger" onClick={() => remove(t)}>삭제</button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow={`마스터 · ${scope.label || '고객사 선택'}`}
        title="조직 코드"
        desc="본부·실·팀 이름만 넣으면 참여 코드가 자동으로 발급됩니다. 참여자가 이 코드로 접속하면 회사와 소속이 자동 분류됩니다."
        actions={
          <>
            {tree && (
              <>
                <button type="button" className="fa-btn" onClick={() => openModal({ kind: 'bulk' })}>엑셀로 일괄 등록</button>
                <button type="button" className="fa-btn" onClick={() => openModal({ kind: 'division' })}>+ 본부 추가</button>
                <button type="button" className="fa-btn" onClick={openMail} disabled={!divisions.length || mailBusy}>
                  {mailBusy ? <Loader2 className="animate-spin" /> : null} 참여 안내 메일
                </button>
                <button type="button" className="fa-btn primary" onClick={exportExcel} disabled={!divisions.length || exporting}
                  title={divisions.length ? '고객사 전달용 참여 코드 엑셀' : '참여 코드를 먼저 발급하세요'}>
                  {exporting ? '내려받는 중…' : '코드 엑셀 다운로드'}
                </button>
              </>
            )}
          </>
        }
      />

      {/* 조회 범위: [고객사] › [본부] › [실] › [팀] */}
      <ScopeFilter scope={scope} />

      {pageError && <div className="fa-error" role="alert" style={{ marginBottom: 20 }}>{pageError}</div>}
      {toast && <div className="fa-note" role="status" style={{ marginBottom: 20 }}>{toast}</div>}

      {!scope.loading && !scope.companies.length && !pageError && <div className="fa-card pad fa-empty">등록된 고객사가 없습니다. 고객사 관리에서 먼저 등록해 주세요.</div>}

      {loading && !tree && (
        <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 불러오는 중…</div>
      )}

      {tree && (
        <>
          <div className="fa-card pad fa-section">
            <div className="fa-cap"><div><h3>코드 규칙</h3><p>회사 접두어 + 본부 코드 + (실 코드) + 팀 번호. 모두 자동으로 정해지고, 직접 정해도 됩니다. 중복되면 등록할 때 바로 알려 줍니다.</p></div></div>
            {/* 접두어: 비워 두면 첫 조직을 만들 때 자동으로 정해진다. 조직이 생긴 뒤에는 바꿀 수 없다 */}
            <div className="fa-org-prefixline">
              <span>접두어</span>
              {prefix ? (
                <>
                  <b className="fa-code">{prefix}</b>
                  <span className="fa-muted">{divisions.length ? '조직 코드가 있어 바꿀 수 없습니다.' : ''}</span>
                </>
              ) : (
                <span className="fa-muted">자동으로 정해집니다 (직접 정하려면 입력)</span>
              )}
              {!divisions.length && (
                <>
                  <input
                    className="fa-input"
                    aria-label="회사 접두어"
                    maxLength={3}
                    value={prefixInput}
                    onChange={(e) => setPrefixInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    placeholder={prefix || '자동'}
                  />
                  <button type="button" className="fa-btn sm" onClick={savePrefix} disabled={prefixSaving || !prefixInput}>
                    {prefixSaving ? '저장하는 중…' : '저장'}
                  </button>
                </>
              )}
            </div>
            {prefixError && <div className="fa-error" role="alert" style={{ marginBottom: 12 }}>{prefixError}</div>}
            <div className="fa-org-rule">
              <div className="seg"><div className="c">{example.p}</div><div className="t">회사 · {tree.company.name}{prefix ? '' : ' (예시)'}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{example.d}</div><div className="t">본부 · {example.dName}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{example.n}</div><div className="t">팀 · {example.tName}</div></div>
              <div className="op">=</div>
              <div className="seg res"><div className="c">{example.p + example.d + example.n}</div><div className="t">참여 코드</div></div>
            </div>
            {/* 실이 있을 때: 본부 코드 뒤에 실 코드가 붙는다 */}
            <div className={`fa-org-rule sub${officeExample.real ? '' : ' sample'}`}>
              <div className="seg"><div className="c">{example.p}</div><div className="t">회사</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{officeExample.d}</div><div className="t">본부 · {officeExample.dName}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{officeExample.o}</div><div className="t">실 · {officeExample.oName}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{officeExample.n}</div><div className="t">팀 · {officeExample.tName}</div></div>
              <div className="op">=</div>
              <div className="seg res"><div className="c">{example.p + officeExample.d + officeExample.o + officeExample.n}</div><div className="t">{officeExample.real ? '참여 코드' : '실이 있을 때'}</div></div>
            </div>
            <p className="fa-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
              본부 단위로만 나누면 <span className="fa-code">{example.p + example.d}</span>, 실 단위면 <span className="fa-code">{example.p + officeExample.d + officeExample.o}</span>.
              팀이 10개를 넘으면 <span className="fa-code">{example.p + example.d}10</span>처럼 이어집니다.
              코드 없이 회사 코드(<span className="fa-code">{tree.company.code}</span>)로 참여한 인원 {tree.unassigned.registered}명은 미분류입니다.
            </p>
          </div>

          <div className="fa-card pad">
            <div className="fa-cap"><div><h3>본부 · 실 · 팀</h3><p>등록 인원과 완료율은 실시간으로 집계됩니다. 본부·실 숫자는 소속 단위를 모두 더한 값입니다.</p></div></div>
            {divisions.length === 0 ? (
              <div className="fa-empty">아직 본부가 없습니다. [+ 본부 추가] 또는 [엑셀로 일괄 등록]으로 시작하세요.</div>
            ) : (
              <div className="fa-org-tree">
                {shownDivisions.map((d) => {
                  const offices = d.offices ?? [];
                  const teamCount = d.teams.length + offices.reduce((m, o) => m + o.teams.length, 0);
                  return (
                  <div key={d.id} className={`fa-org-div${d.is_active ? '' : ' off'}`}>
                    <div className="dh">
                      <span className="fa-code">{d.code}</span>
                      <b>{d.name}</b>
                      {!d.is_active && <span className="fa-chip off">사용 중지</span>}
                      <div className="meta">
                        <span>{offices.length ? `${offices.length}실 · ` : ''}{teamCount}팀 · {d.registered_total}명</span>
                        <span>완료 {pct(d.completed_total, d.registered_total)}%</span>
                        <button type="button" className="fa-btn sm" onClick={() => openModal({ kind: 'office', division: d })}>+ 실</button>
                        <button type="button" className="fa-btn sm" onClick={() => openModal({ kind: 'team', division: d })}>+ 팀</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => copy(d.code, `${d.code} 복사했습니다.`)}>코드 복사</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => openModal({ kind: 'rename', unit: d })}>이름 변경</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => toggleActive(d)}>{d.is_active ? '사용 중지' : '다시 사용'}</button>
                        <button type="button" className="fa-btn sm ghost danger" onClick={() => remove(d)}>삭제</button>
                      </div>
                    </div>
                    {teamCount === 0 && offices.length === 0 && <div className="fa-org-noteam">팀이 없습니다. 본부 코드 <span className="fa-code">{d.code}</span>로도 참여할 수 있습니다.</div>}

                    {/* 실(선택 단계)과 그 아래 팀 */}
                    {offices.map((o) => (
                      <div key={o.id} className={`fa-org-office${o.is_active ? '' : ' off'}`}>
                        <div className="oh">
                          <span className="fa-code">{o.code}</span>
                          <b>{o.name}</b>
                          {!o.is_active && <span className="fa-chip off">사용 중지</span>}
                          <div className="meta">
                            <span>{o.teams.length}팀 · {o.registered_total}명</span>
                            <span>완료 {pct(o.completed_total, o.registered_total)}%</span>
                            <button type="button" className="fa-btn sm" onClick={() => openModal({ kind: 'team', division: d, office: o })}>+ 팀</button>
                            <button type="button" className="fa-btn sm ghost" onClick={() => copy(o.code, `${o.code} 복사했습니다.`)}>코드 복사</button>
                            <button type="button" className="fa-btn sm ghost" onClick={() => openModal({ kind: 'rename', unit: o })}>이름 변경</button>
                            <button type="button" className="fa-btn sm ghost" onClick={() => toggleActive(o)}>{o.is_active ? '사용 중지' : '다시 사용'}</button>
                            <button type="button" className="fa-btn sm ghost danger" onClick={() => remove(o)}>삭제</button>
                          </div>
                        </div>
                        {o.teams.length === 0 && <div className="fa-org-noteam">팀이 없습니다. 실 코드 <span className="fa-code">{o.code}</span>로도 참여할 수 있습니다.</div>}
                        {o.teams.map((t) => renderTeam(t))}
                      </div>
                    ))}

                    {/* 본부 직속 팀 */}
                    {offices.length > 0 && d.teams.length > 0 && <div className="fa-org-direct">본부 직속 팀</div>}
                    {d.teams.map((t) => renderTeam(t))}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {modal?.kind === 'division' && (
        <Modal title="본부 추가" onClose={closeModal} footer={<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={submitDivision} disabled={busy}>{busy ? '추가하는 중…' : '추가'}</button>
        </>}>
          <div className="fa-field"><label htmlFor="org-dname">본부 이름</label>
            <input id="org-dname" className="fa-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="영업본부" autoFocus /></div>
          <div className="fa-field"><label htmlFor="org-dcode">본부 코드 (선택)</label>
            <input id="org-dcode" className="fa-input" maxLength={2} value={fCode}
              onChange={(e) => setFCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="비우면 자동(A, B, C…)" />
            <div className="hint">비우면 자동(A, B, C…). 직접 정하려면 영문 1~2자. 참여 코드: {fCode
              ? <><span className="fa-code">{(prefix || '(접두어)') + fCode}</span>, 첫 팀 <span className="fa-code">{(prefix || '(접두어)') + fCode}1</span></>
              : <span className="fa-code">자동</span>}</div></div>
          {modalError && <div className="fa-error" role="alert">{modalError}</div>}
        </Modal>
      )}

      {modal?.kind === 'office' && (
        <Modal title={`${modal.division.name}에 실 추가`} onClose={closeModal} footer={<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={() => submitOffice(modal.division)} disabled={busy}>{busy ? '추가하는 중…' : '추가'}</button>
        </>}>
          <div className="fa-field"><label htmlFor="org-oname">실 이름</label>
            <input id="org-oname" className="fa-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="마케팅실" autoFocus /></div>
          <div className="fa-field"><label htmlFor="org-ocode">실 코드 (선택)</label>
            <input id="org-ocode" className="fa-input" maxLength={2} value={fCode}
              onChange={(e) => setFCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="비우면 자동(A, B, C…)" />
            <div className="hint">비우면 자동. 직접 정하려면 영문 1~2자. 참여 코드: {fCode
              ? <><span className="fa-code">{modal.division.code + fCode}</span>, 첫 팀 <span className="fa-code">{modal.division.code + fCode}1</span></>
              : <><span className="fa-code">{modal.division.code}</span> + <span className="fa-code">자동</span></>}</div></div>
          {modalError && <div className="fa-error" role="alert">{modalError}</div>}
        </Modal>
      )}

      {modal?.kind === 'team' && (
        <Modal title={`${modal.office ? `${modal.division.name} › ${modal.office.name}` : modal.division.name}에 팀 추가`} onClose={closeModal} footer={<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={() => submitTeam(modal.division)} disabled={busy}>{busy ? '추가하는 중…' : '추가'}</button>
        </>}>
          {!modal.office && (modal.division.offices?.length ?? 0) > 0 && (
            <div className="fa-field"><label htmlFor="org-tparent">상위 조직</label>
              <select id="org-tparent" className="fa-select" value={fParent} onChange={(e) => setFParent(e.target.value)}>
                <option value="">{modal.division.name} 직속</option>
                {modal.division.offices.map((o) => <option key={o.id} value={o.id}>{modal.division.name} › {o.name} ({o.code})</option>)}
              </select></div>
          )}
          <div className="fa-field"><label htmlFor="org-tname">팀 이름</label>
            <input id="org-tname" className="fa-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="영업1팀" autoFocus /></div>
          <div className="fa-field"><label htmlFor="org-tnum">팀 번호 (선택)</label>
            <input id="org-tnum" className="fa-input" inputMode="numeric" value={fNumber}
              onChange={(e) => setFNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="비우면 다음 번호" />
            <div className="hint">참여 코드: <span className="fa-code">{teamParent(modal.division).code}{fNumber || nextTeamNo(teamParent(modal.division).teams)}</span></div></div>
          {modalError && <div className="fa-error" role="alert">{modalError}</div>}
        </Modal>
      )}

      {modal?.kind === 'rename' && (
        <Modal title={`${modal.unit.code} 이름 변경`} onClose={closeModal} footer={<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={() => submitRename(modal.unit)} disabled={busy}>{busy ? '저장하는 중…' : '저장'}</button>
        </>}>
          <div className="fa-field"><label htmlFor="org-rname">이름</label>
            <input id="org-rname" className="fa-input" value={fName} onChange={(e) => setFName(e.target.value)} autoFocus />
            <div className="hint">코드({modal.unit.code})는 이미 배포됐을 수 있어 바뀌지 않습니다.</div></div>
          {modalError && <div className="fa-error" role="alert">{modalError}</div>}
        </Modal>
      )}

      {modal?.kind === 'bulk' && (
        <Modal title="엑셀로 일괄 등록" onClose={closeModal} footer={bulkResult ? (
          <button type="button" className="fa-btn primary" onClick={() => setModal(null)}>닫기</button>
        ) : (<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={submitBulk} disabled={busy || !bulkRows.length}>{busy ? '등록하는 중…' : `${bulkRows.length}행 등록`}</button>
        </>)}>
          {bulkResult ? (
            <div className="fa-note">
              새로 만든 코드 {bulkResult.created.length}개{bulkResult.skipped ? `, 이미 있어 건너뛴 팀 ${bulkResult.skipped}개` : ''}.
              {bulkResult.created.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {bulkResult.created.map((c) => <span key={c.code} className="fa-chip tint">{c.code} {c.name}</span>)}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="fa-muted" style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.7 }}>
                엑셀에서 조직 이름만 복사해 붙여 넣으면 코드는 자동으로 정해집니다.<br />
                · 실이 없으면: <b>본부 ⇥ 팀</b><br />
                · 실이 있으면: <b>본부 ⇥ 실 ⇥ 팀</b><br />
                코드를 직접 정하려면 예전 형식도 됩니다: 본부 · 본부 코드 · 팀 / 본부 · 본부 코드 · 실 · 실 코드 · 팀.<br />
                같은 이름의 본부·실은 하나로 묶이고, 팀 번호는 1부터 차례로 붙습니다. 한 행이라도 틀리면 아무것도 등록하지 않습니다.
              </p>
              <textarea className="fa-textarea" rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                aria-label="붙여 넣을 조직 목록" placeholder={'영업본부\t영업1팀\n영업본부\t영업2팀\n영업본부\t마케팅실\t브랜드팀\n생산본부\t생산1팀'} />
              <div className="fa-muted" style={{ marginTop: 8, fontSize: 12.5 }}>인식한 행 {bulkRows.length}개</div>
            </>
          )}
          {modalError && <div className="fa-error" role="alert" style={{ marginTop: 12 }}>{modalError}</div>}
        </Modal>
      )}
      <InviteMailModal open={!!mail} onClose={() => setMail(null)} mail={mail} companyId={companyId}
        hasPersonalCodes={mailPersonal} hasOrgCodes={divisions.length > 0} />
    </AdminLayout>
  );
}

export default function MasterOrgPage() {
  return (
    <Suspense fallback={<div className="fa-root fa-loading"><Loader2 className="h-5 w-5 animate-spin" /> 불러오는 중…</div>}>
      <OrgPage />
    </Suspense>
  );
}
