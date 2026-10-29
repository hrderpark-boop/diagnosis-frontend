"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AdminLayout, { AdminPageHead } from '@/components/layouts/AdminLayout';
import {
  fetchCompanies, fetchOrgUnits, updateCompany, createOrgUnit, bulkCreateOrgUnits,
  updateOrgUnit, deleteOrgUnit, OrgTree, OrgDivision, OrgTeam,
} from '@/lib/adminApi';
import './org.css';

/**
 * 마스터 · 조직 코드.
 * 고객사마다 접두어를 정하고 본부·팀 참여 코드(AS1 형식)를 발급한다.
 * 참여자가 로그인 화면의 그룹 코드 칸에 이 코드를 넣으면 회사와 소속이 함께 정해진다.
 * 코드 생성·검증은 백엔드(services/org_codes.py)가 하고, 여기서는 미리보기만 보여 준다.
 */

interface CompanyRow { id: string; name: string; code: string; org_prefix: string | null }

const LOGIN_URL = 'https://fm.connectn.co.kr';

/** axios 오류에서 서버 안내문(detail)을 꺼낸다 */
const errDetail = (e: unknown, fallback: string) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

type ModalState =
  | { kind: 'division' }
  | { kind: 'team'; division: OrgDivision }
  | { kind: 'rename'; unit: OrgDivision | OrgTeam }
  | { kind: 'bulk' }
  | null;

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company') || '';

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
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
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<{ created: { code: string; name: string; level: string }[]; skipped: number } | null>(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2200); };

  // 고객사 목록. 선택이 없으면 첫 고객사로
  useEffect(() => {
    fetchCompanies()
      .then((rows: CompanyRow[]) => {
        setCompanies(rows);
        if (!companyId && rows.length) router.replace(`/master/org?company=${rows[0].id}`);
      })
      .catch((e: unknown) => setPageError(errDetail(e, '고객사 목록을 불러오지 못했습니다.')));
    // 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const prefix = tree?.company.org_prefix || '';
  const divisions = useMemo(() => tree?.divisions ?? [], [tree]);

  // 코드 규칙 예시: 실제 첫 본부·첫 팀이 있으면 그 값으로
  const example = useMemo(() => {
    const d = divisions[0];
    const t = d?.teams[0];
    return {
      p: prefix || 'A',
      d: d?.short_code || 'S',
      n: t?.short_code || '1',
      dName: d?.name || '본부',
      tName: t?.name || '팀',
    };
  }, [divisions, prefix]);

  const openModal = (m: ModalState) => {
    setModal(m);
    setModalError('');
    setBulkResult(null);
    setFName(m && m.kind === 'rename' ? m.unit.name : '');
    setFCode('');
    setFNumber('');
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
      await loadTree();
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
      await loadTree();
      flash(done);
    } catch (e: unknown) {
      setModalError(errDetail(e, '처리하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const submitDivision = () => {
    if (!fName.trim()) { setModalError('본부 이름을 입력해 주세요.'); return; }
    if (!/^[A-Z]{1,2}$/.test(fCode)) { setModalError('본부 코드는 영문 1~2자입니다.'); return; }
    run(() => createOrgUnit(companyId, { level: 'division', name: fName.trim(), short_code: fCode }), '본부를 추가했습니다.');
  };

  const submitTeam = (division: OrgDivision) => {
    if (!fName.trim()) { setModalError('팀 이름을 입력해 주세요.'); return; }
    const n = fNumber.trim() ? Number(fNumber) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 99)) { setModalError('팀 번호는 1~99 사이입니다.'); return; }
    run(() => createOrgUnit(companyId, { level: 'team', name: fName.trim(), parent_id: division.id, number: n }), '팀을 추가했습니다.');
  };

  const submitRename = (unit: OrgDivision | OrgTeam) => {
    if (!fName.trim()) { setModalError('이름을 입력해 주세요.'); return; }
    run(() => updateOrgUnit(unit.id, { name: fName.trim() }), '이름을 바꿨습니다.');
  };

  // 엑셀 붙여넣기 파싱: 탭 또는 쉼표 구분, 본부 · 본부 코드 · 팀(선택). 머리글 행은 건너뛴다.
  const bulkRows = useMemo(() => bulkText
    .split(/\r?\n/)
    .map((line) => line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim()))
    .filter((cols) => cols.length >= 2 && cols[0] && cols[1])
    .filter((cols) => !/본부\s*코드|division/i.test(cols[1]))
    .map((cols) => ({ division: cols[0], division_code: cols[1].toUpperCase(), team: cols[2] || undefined })), [bulkText]);

  const submitBulk = async () => {
    if (!bulkRows.length) { setModalError('붙여넣은 행이 없습니다.'); return; }
    setBusy(true);
    setModalError('');
    try {
      const res = await bulkCreateOrgUnits(companyId, bulkRows);
      setBulkResult({ created: res.created, skipped: res.skipped });
      await loadTree();
    } catch (e: unknown) {
      setModalError(errDetail(e, '일괄 등록하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (unit: OrgDivision | OrgTeam) => {
    try {
      await updateOrgUnit(unit.id, { is_active: !unit.is_active });
      await loadTree();
      flash(unit.is_active ? `${unit.code} 사용을 멈췄습니다.` : `${unit.code}를 다시 씁니다.`);
    } catch (e: unknown) {
      setPageError(errDetail(e, '상태를 바꾸지 못했습니다.'));
    }
  };

  const remove = async (unit: OrgDivision | OrgTeam) => {
    if (!window.confirm(`${unit.code} ${unit.name}을(를) 삭제할까요?`)) return;
    try {
      await deleteOrgUnit(unit.id);
      await loadTree();
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

  const copyGuide = () => {
    if (!tree) return;
    const lines: string[] = [
      `[${tree.company.name}] 리더십 진단 참여 안내`,
      '',
      `접속 주소: ${LOGIN_URL}`,
      '로그인 화면의 그룹 코드 칸에 소속 팀의 코드를 입력해 주세요.',
      '',
    ];
    for (const d of divisions.filter((x) => x.is_active)) {
      const teams = d.teams.filter((t) => t.is_active);
      lines.push(`${d.name}`);
      if (teams.length) teams.forEach((t) => lines.push(`  ${t.name}: ${t.code}`));
      else lines.push(`  ${d.name} 전체: ${d.code}`);
    }
    copy(lines.join('\n'), '참여 안내문을 복사했습니다.');
  };

  const selected = companies.find((c) => c.id === companyId);

  return (
    <AdminLayout>
      <AdminPageHead
        eyebrow="마스터"
        title="조직 코드"
        desc="본부·팀마다 고유 코드를 발급합니다. 참여자가 이 코드로 접속하면 회사와 소속이 자동 분류됩니다."
        actions={
          <>
            <select
              className="fa-select"
              aria-label="고객사 선택"
              value={companyId}
              onChange={(e) => router.replace(`/master/org?company=${e.target.value}`)}
            >
              {!companyId && <option value="">고객사 선택</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
            {prefix && (
              <>
                <button type="button" className="fa-btn" onClick={() => openModal({ kind: 'bulk' })}>엑셀로 일괄 등록</button>
                <button type="button" className="fa-btn" onClick={copyGuide} disabled={!divisions.length}>참여 안내문 복사</button>
                <button type="button" className="fa-btn primary" onClick={() => openModal({ kind: 'division' })}>+ 본부 추가</button>
              </>
            )}
          </>
        }
      />

      {pageError && <div className="fa-error" role="alert" style={{ marginBottom: 20 }}>{pageError}</div>}
      {toast && <div className="fa-note" role="status" style={{ marginBottom: 20 }}>{toast}</div>}

      {!companies.length && !pageError && <div className="fa-card pad fa-empty">등록된 고객사가 없습니다. 고객사 관리에서 먼저 등록해 주세요.</div>}

      {loading && !tree && (
        <div className="fa-empty"><Loader2 className="inline h-5 w-5 animate-spin" /> 불러오는 중…</div>
      )}

      {tree && !prefix && (
        <div className="fa-card pad fa-section">
          <div className="fa-cap"><div><h3>회사 접두어 정하기</h3><p>{selected?.name}의 모든 조직 코드 맨 앞에 붙는 영문 1~3자입니다. 조직 코드를 만든 뒤에는 바꿀 수 없습니다.</p></div></div>
          <div className="fa-org-prefix">
            <input
              className="fa-input"
              aria-label="회사 접두어"
              maxLength={3}
              value={prefixInput}
              onChange={(e) => setPrefixInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder="A"
            />
            <button type="button" className="fa-btn primary" style={{ height: 52 }} onClick={savePrefix} disabled={prefixSaving || !prefixInput}>
              {prefixSaving ? '저장하는 중…' : '접두어 저장'}
            </button>
          </div>
          <div className="fa-org-preview">예) 영업본부 S, 영업1팀 → <span className="fa-code">{(prefixInput || 'A') + 'S1'}</span></div>
          {prefixError && <div className="fa-error" role="alert" style={{ marginTop: 12 }}>{prefixError}</div>}
        </div>
      )}

      {tree && prefix && (
        <>
          <div className="fa-card pad fa-section">
            <div className="fa-cap"><div><h3>코드 규칙</h3><p>회사 접두어 + 본부 코드 + 팀 번호. 중복되면 등록할 때 바로 알려 줍니다.</p></div></div>
            <div className="fa-org-rule">
              <div className="seg"><div className="c">{example.p}</div><div className="t">회사 · {tree.company.name}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{example.d}</div><div className="t">본부 · {example.dName}</div></div>
              <div className="op">+</div>
              <div className="seg"><div className="c">{example.n}</div><div className="t">팀 · {example.tName}</div></div>
              <div className="op">=</div>
              <div className="seg res"><div className="c">{example.p + example.d + example.n}</div><div className="t">참여 코드</div></div>
            </div>
            <p className="fa-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
              본부 단위로만 나누면 <span className="fa-code">{example.p + example.d}</span>.
              팀이 10개를 넘으면 <span className="fa-code">{example.p + example.d}10</span>처럼 이어집니다.
              코드 없이 회사 코드(<span className="fa-code">{tree.company.code}</span>)로 참여한 인원 {tree.unassigned.registered}명은 미분류입니다.
            </p>
          </div>

          <div className="fa-card pad">
            <div className="fa-cap"><div><h3>본부 · 팀</h3><p>등록 인원과 완료율은 실시간으로 집계됩니다.</p></div></div>
            {divisions.length === 0 ? (
              <div className="fa-empty">아직 본부가 없습니다. [+ 본부 추가] 또는 [엑셀로 일괄 등록]으로 시작하세요.</div>
            ) : (
              <div className="fa-org-tree">
                {divisions.map((d) => (
                  <div key={d.id} className={`fa-org-div${d.is_active ? '' : ' off'}`}>
                    <div className="dh">
                      <span className="fa-code">{d.code}</span>
                      <b>{d.name}</b>
                      {!d.is_active && <span className="fa-chip off">사용 중지</span>}
                      <div className="meta">
                        <span>{d.teams.length}팀 · {d.registered_total}명</span>
                        <span>완료 {pct(d.completed_total, d.registered_total)}%</span>
                        <button type="button" className="fa-btn sm" onClick={() => openModal({ kind: 'team', division: d })}>+ 팀</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => copy(d.code, `${d.code} 복사했습니다.`)}>코드 복사</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => openModal({ kind: 'rename', unit: d })}>이름 변경</button>
                        <button type="button" className="fa-btn sm ghost" onClick={() => toggleActive(d)}>{d.is_active ? '사용 중지' : '다시 사용'}</button>
                        <button type="button" className="fa-btn sm ghost danger" onClick={() => remove(d)}>삭제</button>
                      </div>
                    </div>
                    {d.teams.length === 0 && <div className="fa-org-noteam">팀이 없습니다. 본부 코드 <span className="fa-code">{d.code}</span>로도 참여할 수 있습니다.</div>}
                    {d.teams.map((t) => (
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
                    ))}
                  </div>
                ))}
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
          <div className="fa-field"><label htmlFor="org-dcode">본부 코드</label>
            <input id="org-dcode" className="fa-input" maxLength={2} value={fCode}
              onChange={(e) => setFCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="S" />
            <div className="hint">영문 1~2자. 참여 코드는 <span className="fa-code">{prefix + (fCode || 'S')}</span>, 첫 팀은 <span className="fa-code">{prefix + (fCode || 'S')}1</span>이 됩니다.</div></div>
          {modalError && <div className="fa-error" role="alert">{modalError}</div>}
        </Modal>
      )}

      {modal?.kind === 'team' && (
        <Modal title={`${modal.division.name}에 팀 추가`} onClose={closeModal} footer={<>
          <button type="button" className="fa-btn" onClick={closeModal} disabled={busy}>취소</button>
          <button type="button" className="fa-btn primary" onClick={() => submitTeam(modal.division)} disabled={busy}>{busy ? '추가하는 중…' : '추가'}</button>
        </>}>
          <div className="fa-field"><label htmlFor="org-tname">팀 이름</label>
            <input id="org-tname" className="fa-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="영업1팀" autoFocus /></div>
          <div className="fa-field"><label htmlFor="org-tnum">팀 번호 (선택)</label>
            <input id="org-tnum" className="fa-input" inputMode="numeric" value={fNumber}
              onChange={(e) => setFNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="비우면 다음 번호" />
            <div className="hint">참여 코드: <span className="fa-code">{modal.division.code}{fNumber || (modal.division.teams.reduce((m, t) => Math.max(m, Number(t.short_code) || 0), 0) + 1)}</span></div></div>
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
                엑셀에서 <b>본부 · 본부 코드 · 팀</b> 세 열을 복사해 붙여 넣으세요. 팀 열을 비우면 본부만 만듭니다.
                같은 본부의 팀 번호는 1부터 차례로 붙고, 한 행이라도 틀리면 아무것도 등록하지 않습니다.
              </p>
              <textarea className="fa-textarea" rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                aria-label="붙여 넣을 조직 목록" placeholder={'영업본부\tS\t영업1팀\n영업본부\tS\t영업2팀\n생산본부\tP\t생산1팀'} />
              <div className="fa-muted" style={{ marginTop: 8, fontSize: 12.5 }}>인식한 행 {bulkRows.length}개</div>
            </>
          )}
          {modalError && <div className="fa-error" role="alert" style={{ marginTop: 12 }}>{modalError}</div>}
        </Modal>
      )}
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
